import { parseJson } from '../../db/index.js';
import { id, now } from '../../lib/util.js';
import { toE164 } from '../../lib/phone.js';
import { getSetting } from '../../lib/settings.js';
import { welcomeOrThank } from '../messaging/service.js';

/** Where a lead came from, in plain words – used for the “Source: …” tag (Essentials → Lead source tagging). */
export function sourceLabel(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  const rules = [
    [/insta|\big\b/, 'Instagram'], [/tiktok|tik tok/, 'TikTok'], [/facebook|\bfb\b|meta/, 'Facebook'], [/youtube/, 'YouTube'], [/linkedin/, 'LinkedIn'],
    [/google|gmb|gbp|maps/, 'Google'], [/whatsapp/, 'WhatsApp'], [/phone|call/, 'Phone call'], [/text|sms/, 'Text message'], [/email|newsletter/, 'Email'],
    [/refer|word of mouth|friend|recommend/, 'Referral'], [/checkatrade|mybuilder|rated people|bark|trustatrader|yell/, 'Directory'],
    [/booking|book/, 'Online booking'], [/form|website|site|web|landing/, 'Website'], [/\bapi\b|zapier|make|integration/, 'Integration'], [/event|expo|show|network/, 'Event'],
  ];
  for (const [re, label] of rules) if (re.test(s)) return label;
  return String(raw).trim().slice(0, 30).replace(/^\w/, (c) => c.toUpperCase());
}

/** The org's default owner for new contacts: the first owner, then admin. */
export function defaultOwner(db, orgId) {
  return db.get(`SELECT user_id FROM memberships WHERE org_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, rowid LIMIT 1`, orgId)?.user_id || null;
}

/**
 * Creates a contact (keeping the phone number in standard form) and runs the
 * new-lead automations. Used by the CRM, lead forms, bookings, calls and messages.
 */
export function createContact({ db, engine }, orgId, data, { actorId = null, emit = true } = {}) {
  const ts = now();
  const contact = {
    id: id('con'), org_id: orgId,
    first_name: data.first_name || 'New contact', last_name: data.last_name || null,
    email: data.email ? String(data.email).trim().toLowerCase() : null, phone: data.phone || null,
    phone_e164: toE164(data.phone), company: data.company || null, source: data.source || null,
    lifecycle: data.lifecycle || 'lead', owner_id: data.owner_id || actorId || defaultOwner(db, orgId),
    tags: data.tags || [], address: data.address || null, postcode: data.postcode ? String(data.postcode).toUpperCase().trim() : null,
    preferred_channel: data.preferred_channel || 'auto', whatsapp_opt_in: data.whatsapp_opt_in ? 1 : 0,
    next_follow_up_at: data.next_follow_up_at || null, created_at: ts, updated_at: ts,
  };
  // Essentials: tag every new lead with where it came from.
  const tagSource = getSetting(db, orgId, 'messaging', {}).tag_lead_source;
  const label = tagSource ? sourceLabel(contact.source) : null;
  if (label && !contact.tags.includes(`Source: ${label}`)) contact.tags = [...contact.tags, `Source: ${label}`];
  if (data.socials && typeof data.socials === 'object') contact.socials = data.socials;
  if (data.birthday) contact.birthday = data.birthday;
  if (data.special_date) { contact.special_date = data.special_date; contact.special_date_label = data.special_date_label || null; }
  db.insert('contacts', contact);
  const automations = emit && engine ? engine.emit(orgId, 'contact.created', { contact }, { actorId }) : [];
  return { contact: getContactRow(db, contact.id), automations };
}

export const getContactRow = (db, contactId) => parseJson(db.get('SELECT * FROM contacts WHERE id = ?', contactId), 'tags');

export function findContactByPhone(db, orgId, phone) {
  const e164 = toE164(phone);
  if (!e164) return null;
  return parseJson(db.get('SELECT * FROM contacts WHERE org_id = ? AND phone_e164 = ? ORDER BY updated_at DESC LIMIT 1', orgId, e164), 'tags');
}

export function findContactByEmail(db, orgId, email) {
  if (!email) return null;
  return parseJson(db.get('SELECT * FROM contacts WHERE org_id = ? AND lower(email) = lower(?) ORDER BY updated_at DESC LIMIT 1', orgId, String(email).trim()), 'tags');
}

/** Finds an existing contact by phone or email, or creates one. Fills in any missing details. */
export function upsertContact(ctx, orgId, data, opts = {}) {
  const existing = findContactByPhone(ctx.db, orgId, data.phone) || findContactByEmail(ctx.db, orgId, data.email);
  if (!existing) return { ...createContact(ctx, orgId, data, opts), created: true };
  const patch = {};
  for (const key of ['last_name', 'email', 'phone', 'company', 'address', 'postcode']) {
    if (data[key] && !existing[key]) patch[key] = key === 'postcode' ? String(data[key]).toUpperCase().trim() : data[key];
  }
  if (patch.phone) patch.phone_e164 = toE164(patch.phone);
  if (data.whatsapp_opt_in && !existing.whatsapp_opt_in) patch.whatsapp_opt_in = 1;
  if (data.first_name && /^(new contact|caller|whatsapp enquiry|text enquiry)/i.test(existing.first_name)) patch.first_name = data.first_name;
  if (Object.keys(patch).length) ctx.db.update('contacts', existing.id, { ...patch, updated_at: now() });
  return { contact: getContactRow(ctx.db, existing.id), automations: [], created: false };
}

/** Moves a deal to a new stage the same way the pipeline does (activity, automations). */
export function moveDealStage(ctx, orgId, dealId, stage, { actorId = null, reason = '' } = {}) {
  const { db, engine } = ctx;
  const before = db.get('SELECT * FROM deals WHERE id = ? AND org_id = ?', dealId, orgId);
  if (!before || before.stage === stage) return [];
  const ts = now();
  db.update('deals', dealId, { stage, closed_at: ['won', 'lost'].includes(stage) ? ts : null, updated_at: ts });
  const deal = db.get('SELECT * FROM deals WHERE id = ?', dealId);
  const contact = deal.contact_id ? getContactRow(db, deal.contact_id) : null;
  if (contact) {
    db.insert('activities', { id: id('act'), org_id: orgId, contact_id: contact.id, deal_id: deal.id, type: 'system', body: `Deal “${deal.title}” moved from ${before.stage} to ${stage}${reason ? ` – ${reason}` : ''}`, created_by: actorId, created_at: ts });
  }
  const payload = { deal, contact, from_stage: before.stage };
  // Essentials: welcome someone the first time they become a customer.
  if (stage === 'won' && contact) welcomeOrThank(ctx, orgId, contact.id, { reason: 'deal', firstTime: contact.lifecycle !== 'customer', related: { type: 'deal', id: deal.id } });
  let automations = engine.emit(orgId, 'deal.stage_changed', payload, { actorId });
  if (stage === 'won') automations = automations.concat(engine.emit(orgId, 'deal.won', payload, { actorId }));
  if (stage === 'lost') automations = automations.concat(engine.emit(orgId, 'deal.lost', payload, { actorId }));
  return automations;
}

/** Adds a line to a contact's timeline. */
export function logActivity(db, orgId, contactId, body, { dealId = null, actorId = null, type = 'system' } = {}) {
  if (!contactId) return;
  db.insert('activities', { id: id('act'), org_id: orgId, contact_id: contactId, deal_id: dealId, type, body, created_by: actorId, created_at: now() });
}

/** "21/06", "21/06/1990", "1990-06-21", "06-21" → "1990-06-21" or "06-21" (no year). Null if it isn't a real date. */
export function cleanDay(value) {
  const v = String(value || '').trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y = null; let mo; let d;
  if (m) [, y, mo, d] = m;
  // "06-21" is how a date without a year is stored (month first), so it reads back the same.
  else if ((m = v.match(/^-{0,2}(\d{2})-(\d{2})$/))) [, mo, d] = m;
  else if ((m = v.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/))) { [, d, mo, y] = m; if (y && y.length === 2) y = `19${y}`; }
  else return null;
  mo = Number(mo); d = Number(d);
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mo < 1 || mo > 12 || d < 1 || d > days[mo - 1]) return null;
  const md = `${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return y ? `${y}-${md}` : md;
}

/** { instagram: '@Sarah.Makeup ' } → { instagram: 'sarah.makeup' } (only the platforms we know). */
export function cleanSocials(input) {
  const out = {};
  for (const key of ['instagram', 'facebook', 'tiktok']) {
    const v = String(input?.[key] || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(instagram|facebook|tiktok)\.com\/@?/i, '').replace(/\/.*$/, '').toLowerCase().slice(0, 60);
    if (v) out[key] = v;
  }
  return out;
}

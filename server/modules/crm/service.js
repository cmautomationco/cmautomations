import { parseJson } from '../../db/index.js';
import { id, now } from '../../lib/util.js';
import { toE164 } from '../../lib/phone.js';

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

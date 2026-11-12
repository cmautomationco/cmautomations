import { parseJson } from '../../db/index.js';
import { now } from '../../lib/util.js';
import { emailInfo, phoneInfo, postcodeInfo } from './geo.js';

/**
 * Lead enrichment: every lead that comes in (forms, calls, WhatsApp, DMs,
 * bookings, imports, the API) is filled out with what we can work out and
 * everything they've told us – where they are and their time zone, mobile or
 * landline, company and website from a work email, how engaged they are –
 * plus a lead score with the reasons. It runs when a lead is created, after
 * every call, and in the background for anything not done yet.
 *
 * Everything is worked out from data already in the system; nothing is sent
 * to an outside data provider.
 */

const safe = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v) || {}; } catch { return {}; } };
const hoursSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600_000 : Infinity);
const INBOUND_SOURCES = /form|booking|call|whatsapp|text|instagram|facebook|tiktok|referral|website|google|email|callback/i;

/** What the lead has told us, in their own words: form answers, booking notes, call notes and messages. */
export function toldUs(db, contactId) {
  const out = [];
  for (const s of db.all(`SELECT fs.data, fs.created_at, f.name FROM form_submissions fs LEFT JOIN forms f ON f.id = fs.form_id WHERE fs.contact_id = ? ORDER BY fs.created_at DESC LIMIT 10`, contactId)) {
    const data = safe(s.data);
    const answers = Object.entries(data).filter(([k, v]) => v && !['first_name', 'last_name', 'email', 'phone', 'website', 'company_url'].includes(k) && String(v).length < 600);
    if (answers.length) out.push({ from: `Form: ${s.name || 'website form'}`, at: s.created_at, items: answers.map(([k, v]) => [k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), String(v)]) });
  }
  for (const b of db.all(`SELECT b.notes, b.created_at, s.name FROM bookings b LEFT JOIN services s ON s.id = b.service_id WHERE b.contact_id = ? AND b.notes IS NOT NULL AND b.notes != '' ORDER BY b.created_at DESC LIMIT 5`, contactId)) {
    out.push({ from: `Booking: ${b.name || 'booking'}`, at: b.created_at, items: [['Notes', b.notes]] });
  }
  for (const c of db.all(`SELECT notes, outcome, ended_at FROM dial_calls WHERE contact_id = ? AND notes IS NOT NULL AND notes != '' ORDER BY started_at DESC LIMIT 5`, contactId)) {
    out.push({ from: `Call notes (${String(c.outcome || '').replace(/_/g, ' ') || 'call'})`, at: c.ended_at, items: [['Notes', c.notes]] });
  }
  const msgs = db.all(`SELECT channel, body, created_at FROM messages WHERE contact_id = ? AND direction = 'in' ORDER BY created_at DESC LIMIT 5`, contactId);
  if (msgs.length) out.push({ from: 'Their messages', at: msgs[0].created_at, items: msgs.map((m) => [m.channel === 'sms' ? 'Text' : m.channel.replace(/^\w/, (c) => c.toUpperCase()), m.body.slice(0, 300)]) });
  return out;
}

/** Works out and saves everything we know about a lead. Returns the enrichment. */
export function enrichContact(db, contactOrId) {
  const c = typeof contactOrId === 'string' ? db.get('SELECT * FROM contacts WHERE id = ?', contactOrId) : contactOrId;
  if (!c) return null;
  const previous = safe(c.enrichment);
  const phone = phoneInfo(c.phone_e164);
  const email = emailInfo(c.email);
  const place = postcodeInfo(c.postcode);
  const q = safe(c.qualification);

  // Time zone: one set by hand wins; then the phone number; then a UK postcode.
  const manualTz = ['manual', 'browser'].includes(previous.timezone_source) && c.timezone;
  const timezone = manualTz ? c.timezone : phone?.timezone || place?.timezone || c.timezone || null;
  const tzSource = manualTz ? previous.timezone_source : phone?.timezone ? (phone.estimated ? 'phone (estimated)' : 'phone') : place ? 'postcode' : null;

  const counts = db.get(`SELECT
      (SELECT COUNT(*) FROM messages WHERE contact_id = ? AND direction = 'in') AS msgs_in,
      (SELECT COUNT(*) FROM messages WHERE contact_id = ? AND direction = 'out') AS msgs_out,
      (SELECT MAX(created_at) FROM messages WHERE contact_id = ? AND direction = 'in') AS last_in,
      (SELECT COUNT(*) FROM dial_calls WHERE contact_id = ? AND status = 'ended') AS calls_made,
      (SELECT COUNT(*) FROM dial_calls WHERE contact_id = ? AND outcome IN ('booked','interested','callback','not_interested')) AS conversations,
      (SELECT COUNT(*) FROM calls WHERE contact_id = ?) AS calls_in,
      (SELECT COUNT(*) FROM bookings WHERE contact_id = ? AND status NOT IN ('cancelled')) AS bookings,
      (SELECT COUNT(*) FROM bookings WHERE contact_id = ? AND starts_at > ? AND status IN ('requested','confirmed')) AS upcoming,
      (SELECT COUNT(*) FROM form_submissions WHERE contact_id = ?) AS forms,
      (SELECT COALESCE(SUM(value), 0) FROM deals WHERE contact_id = ? AND stage NOT IN ('won','lost')) AS open_value,
      (SELECT COALESCE(SUM(paid_pence), 0) FROM invoices WHERE contact_id = ? AND kind = 'invoice') AS paid_pence`,
  c.id, c.id, c.id, c.id, c.id, c.id, c.id, c.id, now(), c.id, c.id, c.id);

  // Lead score 0–100, with the reasons so it can be trusted.
  const reasons = [];
  let score = 20;
  const bump = (n, why) => { score += n; reasons.push(`${n > 0 ? '+' : ''}${n} ${why}`); };
  if (phone?.line === 'mobile' || (c.phone_e164 && !String(c.phone_e164).startsWith('+44'))) bump(12, 'can be called on a mobile');
  else if (c.phone_e164) bump(6, 'has a phone number');
  if (email?.type === 'business') bump(8, 'business email');
  if (INBOUND_SOURCES.test(c.source || '')) bump(12, `came to us (${c.source})`);
  if (counts.forms) bump(8, 'filled in a form');
  if (counts.msgs_in) bump(10, 'has messaged us');
  if (hoursSince(counts.last_in) < 72) bump(8, 'messaged in the last 3 days');
  if (hoursSince(c.created_at) < 24) bump(14, 'new in the last 24 hours');
  else if (hoursSince(c.created_at) < 24 * 7) bump(6, 'new this week');
  if (counts.conversations) bump(6, 'we’ve spoken');
  if (counts.upcoming) bump(12, 'has a booking coming up');
  if (counts.open_value > 0) bump(8, 'has an open deal');
  if (q.pain) bump(4, 'we know their main problem');
  if (q.timeline && /now|asap|this (week|month)|urgent|soon/i.test(q.timeline)) bump(8, `wants to start ${q.timeline}`);
  if (c.dial_attempts >= 3 && !counts.conversations) bump(-Math.min(15, (c.dial_attempts - 2) * 5), `${c.dial_attempts} calls without speaking`);
  if (c.lifecycle === 'customer') { bump(-10, 'already a customer'); }
  if (c.dial_status === 'not_interested') { score = Math.min(score, 10); reasons.push('capped: said not interested'); }
  if (c.dial_status === 'do_not_call') { score = 0; reasons.push('do not call'); }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const enrichment = {
    updated_at: now(),
    phone: phone ? { country: phone.country, country_code: phone.country_code, flag: phone.flag, region: phone.region, line: phone.line } : null,
    email,
    location: [place?.area, phone?.region, phone?.country].filter(Boolean)[0] || null,
    postcode_area: place?.area || null,
    timezone, timezone_source: tzSource, timezone_estimated: Boolean(!manualTz && phone?.estimated),
    company: c.company || email?.company_guess || null,
    company_guessed: !c.company && Boolean(email?.company_guess),
    website: email?.website || null,
    socials: safe(c.socials),
    engagement: { ...counts, last_inbound_at: counts.last_in, first_seen: c.created_at, last_contacted_at: c.last_contacted_at },
    score, score_reasons: reasons,
  };
  db.update('contacts', c.id, { enrichment, timezone, lead_score: score });
  return enrichment;
}

/** Enriches anything not done yet (imports, older leads) – a few hundred at a time. */
export function enrichPending(db, limit = 200) {
  const rows = db.all(`SELECT * FROM contacts WHERE enrichment = '{}' OR enrichment IS NULL LIMIT ?`, limit);
  for (const c of rows) enrichContact(db, c);
  return rows.length;
}

/** The full picture of a lead for the dialer and the lead profile. */
export function leadProfile(db, contactId) {
  const c = parseJson(db.get('SELECT * FROM contacts WHERE id = ?', contactId), 'tags', 'socials', 'enrichment', 'qualification');
  if (!c) return null;
  return {
    contact: c,
    told_us: toldUs(db, c.id),
    calls: parseJson(db.all(`SELECT d.*, u.name AS caller FROM dial_calls d LEFT JOIN users u ON u.id = d.user_id WHERE d.contact_id = ? ORDER BY d.started_at DESC LIMIT 20`, c.id), 'analysis'),
    inbound_calls: db.all('SELECT status, duration_seconds, created_at FROM calls WHERE contact_id = ? ORDER BY created_at DESC LIMIT 10', c.id),
    messages: db.all('SELECT channel, direction, body, status, template_key, created_at FROM messages WHERE contact_id = ? ORDER BY created_at DESC LIMIT 30', c.id),
    activities: db.all('SELECT a.type, a.body, a.created_at, u.name AS author FROM activities a LEFT JOIN users u ON u.id = a.created_by WHERE a.contact_id = ? ORDER BY a.created_at DESC LIMIT 30', c.id),
    deals: db.all('SELECT id, title, value, stage FROM deals WHERE contact_id = ? ORDER BY created_at DESC', c.id),
    bookings: db.all('SELECT b.id, b.starts_at, b.status, s.name AS service_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id WHERE b.contact_id = ? ORDER BY b.starts_at DESC LIMIT 10', c.id),
    callbacks: db.all(`SELECT * FROM callbacks WHERE contact_id = ? ORDER BY due_at DESC LIMIT 10`, c.id),
    sequences: db.all(`SELECT * FROM sequences WHERE contact_id = ? ORDER BY created_at DESC LIMIT 5`, c.id).map((s) => ({
      ...s, steps: db.all('SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_no', s.id),
    })),
    pages: parseJson(db.all(`SELECT id, kind, token, data, created_at, viewed_at FROM lead_pages WHERE contact_id = ? ORDER BY created_at DESC`, c.id), 'data'),
  };
}

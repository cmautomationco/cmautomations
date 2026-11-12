import { config } from '../../config.js';
import { parseJson } from '../../db/index.js';
import { publicLink, serverBase } from '../../lib/links.js';
import { getSetting, setSetting } from '../../lib/settings.js';
import { addLocalDays, formatClock, formatDay, weekdayOf, zonedParts, zonedToUtc } from '../../lib/time.js';
import { badRequest, id, notFound, now, publicToken } from '../../lib/util.js';
import { toE164 } from '../../lib/phone.js';
import { notifyUsers } from '../core/notifications.js';
import { getContactRow, logActivity } from '../crm/service.js';
import { enrichContact, leadProfile } from '../crm/enrich.js';
import { zoneName } from '../crm/geo.js';
import { getCredentials } from '../integrations/service.js';
import { businessName, getMessagingSettings, sendInBackground } from '../messaging/service.js';
import { analyseTranscript } from './analyse.js';
import { buildOpeners, recordScriptVersion } from './scripts.js';
import { painsOf, solutionsFor } from './solutions.js';

/**
 * The CRM dialer: a call list that knows what time it is where each lead is,
 * calls through Twilio (or your own phone), and turns every call into
 * updated lead details, follow-up sequences, personal demo and confirmation
 * pages, call backs in the calendar, and a better script next time.
 */

export const DIALER_DEFAULTS = {
  my_phone: '',
  my_timezone: '',
  // Calling hours in the lead's own time zone.
  hours: { weekday: ['09:00', '20:00'], sat: ['10:00', '17:00'], sun: null },
  // When people tend to pick up: mid-morning and late afternoon, their time.
  best: [['10:00', '11:30'], ['16:00', '17:30']],
  // Hours between tries after no answer: 1st, 2nd, 3rd, then the last value.
  retry_hours: [3, 24, 48, 72],
  max_attempts: 6,
  speed_to_lead_minutes: 60,
  text_back: true,
  auto_demo: true,
  auto_sequences: true,
  transcribe: true,
  record: false,
  demo_service_id: null,
  // When leads can pick a call back (in the business's time zone).
  callback_hours: { weekday: ['09:00', '18:00'], sat: ['10:00', '13:00'], sun: null },
  callback_minutes: 15,
};

export const OUTCOMES = {
  booked: { label: 'Booked a call / demo', status: 'booked', connected: true },
  interested: { label: 'Interested – follow up', status: 'interested', connected: true },
  callback: { label: 'Call back later', status: 'callback', connected: true },
  not_interested: { label: 'Not interested', status: 'not_interested', connected: true },
  no_answer: { label: 'No answer', status: 'no_answer', connected: false },
  voicemail: { label: 'Left a voicemail', status: 'no_answer', connected: false },
  wrong_number: { label: 'Wrong number', status: 'wrong_number', connected: false },
  do_not_call: { label: 'Do not call again', status: 'do_not_call', connected: false },
};
export const CONNECTED = Object.entries(OUTCOMES).filter(([, o]) => o.connected).map(([k]) => k);

export const getDialerSettings = (db, orgId) => getSetting(db, orgId, 'dialer', DIALER_DEFAULTS);
export const saveDialerSettings = (db, orgId, s) => setSetting(db, orgId, 'dialer', s);

const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const validZone = (tz) => { try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return Boolean(tz); } catch { return false; } };
const orgOf = (db, orgId) => db.get('SELECT * FROM organizations WHERE id = ?', orgId);
const safe = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v) || {}; } catch { return {}; } };
const firstName = (c) => (c?.first_name && !/^(new contact|caller|whatsapp enquiry|text enquiry|@)/i.test(c.first_name) ? c.first_name : 'there');
const fullName = (c) => [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Lead';
const myName = (db, userId) => (db.get('SELECT name FROM users WHERE id = ?', userId)?.name || 'the team').split(' ')[0];

function dayWindow(hours, weekday) {
  const w = weekday === 'sat' ? hours.sat : weekday === 'sun' ? hours.sun : hours.weekday;
  return Array.isArray(w) && w[0] && w[1] && toMin(w[1]) > toMin(w[0]) ? w : null;
}

/**
 * Whether now is a good time to ring someone in a time zone: 'best' (a
 * pick-up window), 'open' (inside calling hours) or 'closed', plus when it
 * next opens and when the next best window starts.
 */
export function callWindow(tz, settings, at = new Date()) {
  const zone = validZone(tz) ? tz : 'Europe/London';
  const p = zonedParts(at, zone);
  const mins = p.hour * 60 + p.minute;
  const today = dayWindow(settings.hours, p.weekday);
  const open = Boolean(today && mins >= toMin(today[0]) && mins < toMin(today[1]));
  const best = open && settings.best.some(([s, e]) => mins >= toMin(s) && mins < toMin(e));
  let nextOpen = null;
  let nextBest = null;
  for (let d = 0; d < 8 && (!nextOpen || !nextBest); d++) {
    const date = addLocalDays(p.date, d);
    const win = dayWindow(settings.hours, weekdayOf(date));
    if (!win) continue;
    const close = new Date(zonedToUtc(date, win[1], zone));
    if (!nextOpen && close > at) { const o = new Date(zonedToUtc(date, win[0], zone)); nextOpen = (o > at ? o : at).toISOString(); }
    for (const [s, e] of settings.best) {
      if (nextBest) break;
      if (toMin(s) < toMin(win[0]) || toMin(s) >= toMin(win[1])) continue;
      const bs = new Date(zonedToUtc(date, s, zone));
      const be = new Date(zonedToUtc(date, e, zone));
      if (be > at) nextBest = (bs > at ? bs : at).toISOString();
    }
  }
  return {
    status: best ? 'best' : open ? 'open' : 'closed', timezone: zone, zone: zoneName(zone), local_time: p.time, local_day: p.weekday,
    label: `${formatClock(at, zone)} ${p.weekday.replace(/^\w/, (c) => c.toUpperCase())}`,
    next_open_at: open ? null : nextOpen, next_best_at: best ? null : nextBest,
  };
}

/** A good moment to ring them again after `hours`, moved into their calling hours (best window if it's the same day). */
export function nextGoodTime(tz, settings, afterHours, at = new Date()) {
  const target = new Date(at.getTime() + afterHours * 3600_000);
  const w = callWindow(tz, settings, target);
  if (w.status === 'best') return target.toISOString();
  const best = w.next_best_at && new Date(w.next_best_at) - target < 12 * 3600_000 ? w.next_best_at : null;
  return best || w.next_open_at || target.toISOString();
}

const leadCard = (c) => {
  const e = safe(c.enrichment);
  return {
    id: c.id, first_name: c.first_name, last_name: c.last_name, name: fullName(c), company: c.company || e.company || null, phone: c.phone, phone_e164: c.phone_e164,
    email: c.email, source: c.source, lifecycle: c.lifecycle, lead_score: c.lead_score ?? e.score ?? null, dial_status: c.dial_status, dial_attempts: c.dial_attempts,
    last_dialed_at: c.last_dialed_at, next_dial_at: c.next_dial_at, created_at: c.created_at, timezone: c.timezone || e.timezone || null,
    flag: e.phone?.flag || null, location: e.location || null, line: e.phone?.line || null, call_pref: c.call_pref || null,
  };
};

/**
 * The call list: who to ring now (in their calling hours, best first), and
 * who's next once their day starts – shown in your time and theirs.
 */
export function buildQueue(db, org, settings, { at = new Date(), limit = 80 } = {}) {
  const iso = at.toISOString();
  const soon = new Date(at.getTime() + 15 * 60_000).toISOString();
  const myTz = validZone(settings.my_timezone) ? settings.my_timezone : org.timezone || 'Europe/London';
  const callbacks = db.all(`SELECT * FROM callbacks WHERE org_id = ? AND status = 'pending' AND mode = 'call' AND due_at <= ?`, org.id, soon);
  const cbBy = Object.fromEntries(callbacks.map((c) => [c.contact_id, c]));
  const steps = db.all(`SELECT st.*, sq.name AS sequence_name FROM sequence_steps st JOIN sequences sq ON sq.id = st.sequence_id
                        WHERE st.org_id = ? AND st.type = 'call' AND st.status = 'pending' AND sq.status = 'active' AND st.due_at <= ?`, org.id, iso);
  const stepBy = Object.fromEntries(steps.map((s) => [s.contact_id, s]));
  const special = [...new Set([...Object.keys(cbBy), ...Object.keys(stepBy)])];
  const rows = db.all(`SELECT * FROM contacts WHERE org_id = ? AND phone_e164 IS NOT NULL AND (
        id IN (SELECT value FROM json_each(?)) OR (
          dial_status NOT IN ('do_not_call','not_interested','wrong_number','booked') AND lifecycle != 'customer'
          AND (next_dial_at IS NULL OR next_dial_at <= ?) AND dial_attempts < ?))
      ORDER BY created_at DESC LIMIT 600`, org.id, JSON.stringify(special), iso, settings.max_attempts || 6);
  const nowList = [];
  const later = [];
  for (const c of rows) {
    const e = safe(c.enrichment);
    const tz = c.timezone || e.timezone || org.timezone || 'Europe/London';
    const win = callWindow(tz, settings, at);
    const cb = cbBy[c.id];
    const step = stepBy[c.id];
    const minutesOld = (at - new Date(c.created_at)) / 60_000;
    const reasons = [];
    let priority = c.lead_score ?? e.score ?? 20;
    if (cb) { priority += 1000; reasons.push(`Call back booked for ${formatClock(cb.due_at, tz)} their time${cb.topic ? ` – ${cb.topic}` : ''}`); }
    if (step) { priority += 500; reasons.push(`${step.sequence_name}: ${step.label}`); }
    if (!c.dial_attempts && minutesOld <= (settings.speed_to_lead_minutes || 60)) { priority += 400 - minutesOld; reasons.push(`New lead ${Math.max(1, Math.round(minutesOld))} min ago – call while they’re still interested`); }
    else if (!c.dial_attempts && minutesOld < 24 * 60) { priority += 120; reasons.push('New today – not called yet'); }
    if (win.status === 'best') { priority += 60; reasons.push(`Good time to call: ${win.local_time} for them`); }
    if (c.dial_attempts) { priority -= c.dial_attempts * 5; reasons.push(`${c.dial_attempts} call${c.dial_attempts === 1 ? '' : 's'} so far`); }
    const item = {
      contact: leadCard(c), window: win, priority: Math.round(priority), reasons,
      why: reasons[0] || `Lead score ${c.lead_score ?? '–'}`, callback: cb || null, step: step || null,
      their_time: win.label, my_time: formatClock(at, myTz),
    };
    if (cb || win.status !== 'closed') nowList.push(item);
    else later.push({ ...item, opens_at: win.next_best_at && new Date(win.next_best_at) - new Date(win.next_open_at || win.next_best_at) < 3 * 3600_000 ? win.next_best_at : win.next_open_at,
      opens_mine: win.next_open_at ? `${formatDay(win.next_open_at, myTz)} ${formatClock(win.next_open_at, myTz)}` : null,
      opens_theirs: win.next_open_at ? `${formatDay(win.next_open_at, tz)} ${formatClock(win.next_open_at, tz)}` : null });
  }
  nowList.sort((a, b) => b.priority - a.priority);
  later.sort((a, b) => new Date(a.opens_at || 8.64e15) - new Date(b.opens_at || 8.64e15) || b.priority - a.priority);
  // Callbacks still to come today, so nothing is missed.
  const endOfDay = zonedToUtc(addLocalDays(zonedParts(at, myTz).date, 1), '00:00', myTz);
  const upcoming = db.all(`SELECT cb.*, c.first_name, c.last_name, c.timezone FROM callbacks cb JOIN contacts c ON c.id = cb.contact_id
                           WHERE cb.org_id = ? AND cb.status = 'pending' AND cb.due_at > ? AND cb.due_at < ? ORDER BY cb.due_at`, org.id, soon, endOfDay);
  const dayStart = zonedToUtc(zonedParts(at, myTz).date, '00:00', myTz);
  const today = db.get(`SELECT COUNT(*) AS calls, SUM(CASE WHEN outcome IN ('booked','interested','callback','not_interested') THEN 1 ELSE 0 END) AS connected,
                               SUM(CASE WHEN outcome = 'booked' THEN 1 ELSE 0 END) AS booked, COALESCE(SUM(duration_seconds), 0) AS seconds
                        FROM dial_calls WHERE org_id = ? AND started_at >= ? AND status = 'ended'`, org.id, dayStart);
  // Where today's callable leads are, so you can see who's awake.
  const zones = {};
  for (const i of [...nowList, ...later]) {
    const z = (zones[i.window.timezone] ||= { timezone: i.window.timezone, zone: i.window.zone, local: i.window.label, status: i.window.status, now: 0, later: 0 });
    if (nowList.includes(i)) z.now++; else z.later++;
  }
  return {
    now: nowList.slice(0, limit), later: later.slice(0, limit), total_now: nowList.length, total_later: later.length,
    upcoming_callbacks: upcoming.map((u) => ({ ...u, mine: formatClock(u.due_at, myTz), theirs: formatClock(u.due_at, u.timezone || myTz) })),
    zones: Object.values(zones).sort((a, b) => b.now - a.now),
    today: { calls: today.calls || 0, connected: today.connected || 0, booked: today.booked || 0, minutes: Math.round((today.seconds || 0) / 60) },
    me: { timezone: myTz, zone: zoneName(myTz), time: formatClock(at, myTz) },
  };
}

/** How the dialer will place calls for this business right now. */
export function callMode(db, orgId, settings = getDialerSettings(db, orgId)) {
  const creds = getCredentials(db, orgId);
  const msg = getMessagingSettings(db, orgId);
  const live = /^https:\/\//.test(config.publicUrl);
  const bridge = Boolean(creds.twilio && toE164(settings.my_phone) && msg.business_number && live);
  return {
    mode: bridge ? 'bridge' : config.demoMode ? 'demo' : 'phone', bridge,
    missing: bridge ? [] : [!creds.twilio && 'Connect Twilio (Settings → Connections)', !msg.business_number && 'Add your business number (Settings → Messaging)', !toE164(settings.my_phone) && 'Add your own phone number (Dialer settings)', !live && 'Run on the live server with an https address'].filter(Boolean),
  };
}

/** Everything the dialer shows when you open a lead: their details, what they've told us, openers, timing. */
export function dialerLead(db, org, contactId, userId) {
  const profile = leadProfile(db, contactId);
  if (!profile || profile.contact.org_id !== org.id) throw notFound('Lead');
  const settings = getDialerSettings(db, org.id);
  const c = profile.contact;
  const tz = c.timezone || c.enrichment?.timezone || org.timezone;
  const services = db.all('SELECT id, name, duration_min FROM services WHERE org_id = ? AND active = 1 ORDER BY position, name', org.id);
  return {
    ...profile,
    window: callWindow(tz, settings),
    openers: buildOpeners(db, org, c, { caller: db.get('SELECT name FROM users WHERE id = ?', userId)?.name }),
    solutions: solutionsFor(db, org, painsOf(c), { mainPain: c.qualification?.pain }),
    services, demo_service_id: settings.demo_service_id || services[0]?.id || null,
    call_mode: callMode(db, org.id, settings),
  };
}

async function placeBridgeCall(db, org, call, contact, settings) {
  const creds = getCredentials(db, org.id).twilio;
  const msg = getMessagingSettings(db, org.id);
  const base = serverBase();
  const form = new URLSearchParams({
    To: toE164(settings.my_phone), From: msg.business_number, Url: `${base}/api/hooks/dialer/${call.id}/connect`, Method: 'POST',
    StatusCallback: `${base}/api/hooks/dialer/${call.id}/status`, StatusCallbackMethod: 'POST',
  });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Calls.json`, {
      method: 'POST', body: form, signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Basic ${btoa(`${creds.accountSid}:${creds.authToken}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: `Twilio said: ${data.message || res.status}` };
    return { sid: data.sid };
  } catch (err) {
    return { error: `Couldn’t reach Twilio: ${err.message}` };
  }
}

/** Starts a call: rings your phone and connects the lead (Twilio), or opens your phone's dialler. */
export async function startCall(ctx, org, userId, contactId, { opener_key = null, opener_text = null, mode = null } = {}) {
  const { db } = ctx;
  const contact = getContactRow(db, contactId);
  if (!contact || contact.org_id !== org.id) throw notFound('Lead');
  if (!contact.phone_e164) throw badRequest('This lead has no phone number');
  if (contact.dial_status === 'do_not_call') throw badRequest('This lead asked not to be called');
  const settings = getDialerSettings(db, org.id);
  const how = callMode(db, org.id, settings);
  let chosen = mode && ['bridge', 'phone', 'demo'].includes(mode) ? mode : how.mode;
  if (chosen === 'bridge' && !how.bridge) chosen = config.demoMode ? 'demo' : 'phone';
  // A call you left open is closed off so the list stays tidy.
  db.run(`UPDATE dial_calls SET status = 'ended', ended_at = ?, outcome = COALESCE(outcome, 'no_answer') WHERE org_id = ? AND user_id = ? AND status = 'live'`, now(), org.id, userId);
  const call = {
    id: id('dcl'), org_id: org.id, contact_id: contact.id, user_id: userId, mode: chosen, status: 'live', outcome: null,
    opener_key, opener_text: opener_text ? String(opener_text).slice(0, 1000) : null, notes: null, transcript: '', analysis: '{}',
    duration_seconds: null, provider_id: null, recording_url: null, started_at: now(), ended_at: null,
  };
  db.insert('dial_calls', call);
  db.update('contacts', contact.id, { dial_attempts: (contact.dial_attempts || 0) + 1, last_dialed_at: call.started_at, last_contacted_at: call.started_at, updated_at: now() });
  let error = null;
  if (chosen === 'bridge') {
    const placed = await placeBridgeCall(db, org, call, contact, settings);
    if (placed.sid) db.update('dial_calls', call.id, { provider_id: placed.sid });
    else { error = placed.error; db.update('dial_calls', call.id, { mode: 'phone' }); call.mode = 'phone'; }
  }
  return { call: { ...call, provider_id: db.get('SELECT provider_id FROM dial_calls WHERE id = ?', call.id).provider_id }, tel: `tel:${contact.phone_e164}`, error,
    message: call.mode === 'bridge' ? 'Your phone will ring – answer it and you’ll be connected to them.' : call.mode === 'demo' ? 'Test build: no real call is made. Talk it through, take notes, then log the outcome.' : 'Ring them from your phone, then log the outcome here.' };
}

export function getCall(db, orgId, callId) {
  const call = parseJson(db.get('SELECT * FROM dial_calls WHERE id = ? AND org_id = ?', callId, orgId), 'analysis');
  if (!call) throw notFound('Call');
  return call;
}

/** Adds to a live call's notes or transcript (from the browser's speech-to-text, or Twilio). */
export function updateCall(db, orgId, callId, { notes, transcript, append } = {}) {
  const call = getCall(db, orgId, callId);
  const patch = {};
  if (notes !== undefined) patch.notes = notes ? String(notes).slice(0, 10_000) : null;
  if (transcript !== undefined) patch.transcript = String(transcript || '').slice(0, 100_000);
  if (append) patch.transcript = `${patch.transcript ?? call.transcript}${(patch.transcript ?? call.transcript) ? '\n' : ''}${String(append).slice(0, 5000)}`;
  if (Object.keys(patch).length) db.update('dial_calls', call.id, patch);
  return getCall(db, orgId, callId);
}

// ── Personal pages: demo, confirmation, call back ──

export function createPage(db, org, contact, kind, extra = {}) {
  const existing = kind === 'callback' ? db.get(`SELECT * FROM lead_pages WHERE contact_id = ? AND kind = 'callback'`, contact.id) : null;
  if (existing) return { ...existing, link: publicLink(`callback/${existing.token}`) };
  const c = { ...contact, qualification: safe(contact.qualification) };
  const data = { ...extra };
  if (kind === 'demo') {
    data.solutions = solutionsFor(db, org, painsOf(c), { mainPain: c.qualification.pain });
    data.their_words = (extra.highlights || []).slice(0, 3);
    data.pain = c.qualification.pain || data.solutions[0]?.problem || null;
  }
  const page = { id: id('lpg'), org_id: org.id, contact_id: contact.id, kind, token: publicToken(), data: JSON.stringify(data), booking_id: extra.booking_id || null, callback_id: extra.callback_id || null, created_at: now(), viewed_at: null };
  db.insert('lead_pages', page);
  const path = { demo: 'demo', confirmation: 'confirmed', callback: 'callback' }[kind];
  return { ...page, data, link: publicLink(`${path}/${page.token}`) };
}

export const pageLink = (p) => publicLink(`${{ demo: 'demo', confirmation: 'confirmed', callback: 'callback' }[p.kind]}/${p.token}`);

/** The lead's personal call-back page (made once and reused). */
export const callbackPage = (db, org, contact) => createPage(db, org, contact, 'callback');

// ── Follow-up sequences ──

const SEQUENCES = {
  no_answer: { name: 'Missed you – follow up', steps: [
    { days: 1, type: 'call', label: 'Try again at a good time for them' },
    { days: 3, type: 'message', label: 'Friendly text', body: 'Hi {{first}}, {{me}} from {{business}} again – I tried you a couple of times. No pressure at all: reply CALL and I’ll ring at a better time, TEXT if you’d rather chat here, or pick a time that suits you: {{callback_link}}' },
    { days: 5, type: 'call', label: 'Last call attempt' },
    { days: 8, type: 'message', label: 'Last message', body: 'Hi {{first}}, I’ll stop chasing now! If it’s useful later, you can pick a time to chat here any time: {{callback_link}} – {{me}}, {{business}}' },
  ] },
  interested: { name: 'Interested – demo follow-up', steps: [
    { days: 0, type: 'message', label: 'Send their personal demo', body: 'Great to speak just now, {{first}}. As promised, here’s a page I put together for you{{pain_line}}: {{demo_link}}\n\nWhen you’re ready, pick a time here: {{book_link}} – {{me}}' },
    { days: 2, type: 'call', label: 'Did they look at the demo?' },
    { days: 4, type: 'message', label: 'Check-in text', body: 'Hi {{first}}, did you get a chance to look at the page I sent? {{demo_link}} Happy to answer anything by text – or reply CALL and I’ll ring you.' },
    { days: 7, type: 'call', label: 'Follow-up call' },
    { days: 14, type: 'message', label: 'Last nudge', body: 'Hi {{first}}, last nudge from me – if fixing {{pain_short}} is still on your list, grab a time here: {{book_link}}. If not, no worries at all. {{me}}' },
  ] },
  booked: { name: 'Booked – before the call', steps: [
    { days: 0, type: 'message', label: 'Their confirmation page', body: 'You’re booked in, {{first}}! Everything for our call is here – time in your time zone, what we’ll cover and a quick preview: {{confirm_link}}' },
    { before_hours: 48, type: 'message', label: 'Preview before the call', body: 'Looking forward to our call, {{first}}. If you have 2 minutes beforehand, here’s what I’ll show you: {{demo_link}}' },
  ] },
  callback: { name: 'Call back', steps: [
    { days: 0, type: 'message', label: 'Confirm the call back', body: 'Thanks {{first}} – I’ll call you back {{callback_when}} (your time). If that stops working, pick another time here: {{callback_link}} – {{me}}, {{business}}' },
  ] },
};

function fill(body, vars) { return String(body).replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? ''); }

/** Makes a lead's follow-up sequence after a call. Each step is a text/email or a call in the dialer. */
export function createSequence(db, org, contact, kind, { callId = null, vars = {}, booking = null, at = new Date() } = {}) {
  const def = SEQUENCES[kind];
  if (!def) return null;
  // One running sequence at a time: a new one replaces the old.
  stopSequences(db, contact.id, `Replaced by “${def.name}”`);
  const settings = getDialerSettings(db, org.id);
  const tz = contact.timezone || safe(contact.enrichment).timezone || org.timezone;
  const seq = { id: id('seq'), org_id: org.id, contact_id: contact.id, call_id: callId, kind, name: def.name, status: 'active', stopped_reason: null, created_at: at.toISOString() };
  db.insert('sequences', seq);
  let n = 0;
  for (const s of def.steps) {
    let due;
    if (s.before_hours != null) {
      if (!booking || new Date(booking.starts_at) - at < (s.before_hours + 24) * 3600_000) continue;
      due = new Date(new Date(booking.starts_at).getTime() - s.before_hours * 3600_000).toISOString();
    } else if (!s.days) due = at.toISOString();
    else due = s.type === 'call' ? nextGoodTime(tz, settings, s.days * 24, at) : nextGoodTime(tz, { ...settings, best: [['10:00', '12:00']] }, s.days * 24, at);
    db.insert('sequence_steps', { id: id('stp'), sequence_id: seq.id, org_id: org.id, contact_id: contact.id, step_no: ++n, type: s.type, label: s.label, body: s.body ? fill(s.body, vars) : null, due_at: due, status: 'pending', result: null, done_at: null });
  }
  return { ...seq, steps: db.all('SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_no', seq.id) };
}

export function stopSequences(db, contactId, reason) {
  for (const s of db.all(`SELECT id FROM sequences WHERE contact_id = ? AND status = 'active'`, contactId)) {
    db.run(`UPDATE sequences SET status = 'stopped', stopped_reason = ? WHERE id = ?`, reason, s.id);
    db.run(`UPDATE sequence_steps SET status = 'skipped', result = ? WHERE sequence_id = ? AND status = 'pending'`, reason, s.id);
  }
}

/** Sends sequence messages that are due, and stops sequences when the lead replies, books or opts out. */
export async function runSequences(ctx, at = new Date()) {
  const { db } = ctx;
  let sent = 0;
  let stopped = 0;
  for (const seq of db.all(`SELECT * FROM sequences WHERE status = 'active' LIMIT 500`)) {
    const c = db.get('SELECT * FROM contacts WHERE id = ?', seq.contact_id);
    const replied = seq.kind !== 'booked' && db.get(`SELECT 1 FROM messages WHERE contact_id = ? AND direction = 'in' AND created_at > ? LIMIT 1`, seq.contact_id, seq.created_at);
    const booked = !['booked', 'callback'].includes(seq.kind) && db.get(`SELECT 1 FROM bookings WHERE contact_id = ? AND created_at > ? AND status != 'cancelled' LIMIT 1`, seq.contact_id, seq.created_at);
    const cancelled = seq.kind === 'booked' && !db.get(`SELECT 1 FROM bookings WHERE contact_id = ? AND status IN ('requested','confirmed') AND starts_at > ? LIMIT 1`, seq.contact_id, at.toISOString());
    const reason = !c ? 'Contact deleted' : ['do_not_call', 'not_interested', 'wrong_number'].includes(c.dial_status) ? 'They asked us to stop' : replied ? 'They replied' : booked ? 'They booked' : cancelled ? 'Booking cancelled or done' : null;
    if (reason) { stopSequences(db, seq.contact_id, reason); stopped++; continue; }
    const due = db.all(`SELECT * FROM sequence_steps WHERE sequence_id = ? AND status = 'pending' AND type = 'message' AND due_at <= ? ORDER BY step_no`, seq.id, at.toISOString());
    for (const step of due) {
      const out = sendInBackground(ctx, seq.org_id, { contactId: seq.contact_id, body: step.body, related: { type: 'sequence', id: seq.id }, templateKey: `sequence_${seq.kind}` });
      db.update('sequence_steps', step.id, { status: out.message ? 'done' : 'skipped', result: out.message ? `Sent by ${out.message.channel === 'sms' ? 'text' : out.message.channel}${out.message.status === 'blocked' ? ` – blocked: ${out.message.error}` : ''}` : out.skipped, done_at: now() });
      if (out.message) sent++;
    }
    if (!db.get(`SELECT 1 FROM sequence_steps WHERE sequence_id = ? AND status = 'pending'`, seq.id)) db.run(`UPDATE sequences SET status = 'done' WHERE id = ?`, seq.id);
  }
  return { sent, stopped };
}

// ── Call backs ──

/** Times a lead can choose for a call back (the business's call-back hours, next 7 days). */
export function callbackSlots(db, org, settings = getDialerSettings(db, org.id), { at = new Date(), days = 7 } = {}) {
  const tz = org.timezone || 'Europe/London';
  const step = Math.max(10, Number(settings.callback_minutes) || 15);
  const earliest = at.getTime() + 30 * 60_000;
  const taken = db.all(`SELECT due_at FROM callbacks WHERE org_id = ? AND status = 'pending' AND due_at > ?`, org.id, at.toISOString()).map((r) => new Date(r.due_at).getTime());
  const busy = db.all(`SELECT starts_at, ends_at FROM bookings WHERE org_id = ? AND status IN ('requested','confirmed','on_the_way') AND ends_at > ?`, org.id, at.toISOString())
    .map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);
  const out = [];
  const start = zonedParts(at, tz).date;
  for (let d = 0; d <= days; d++) {
    const date = addLocalDays(start, d);
    const win = dayWindow(settings.callback_hours, weekdayOf(date));
    if (!win) continue;
    for (let m = toMin(win[0]); m + step <= toMin(win[1]); m += step) {
      const iso = zonedToUtc(date, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, tz);
      const t = new Date(iso).getTime();
      if (t < earliest) continue;
      if (taken.some((x) => Math.abs(x - t) < step * 60_000)) continue;
      if (busy.some(([s, e]) => t >= s && t < e)) continue;
      out.push(iso);
    }
  }
  return out;
}

/** Books a call back (or a text back) and tells the team. */
export function createCallback(ctx, org, contact, { due_at, mode = 'call', topic = null, source = 'dialer', actorId = null, confirm = false, vars = {} }) {
  const { db } = ctx;
  const due = new Date(due_at);
  if (Number.isNaN(due.getTime())) throw badRequest('Choose a time for the call back');
  // One call back at a time per lead: a new one replaces the old.
  db.run(`UPDATE callbacks SET status = 'cancelled' WHERE contact_id = ? AND status = 'pending'`, contact.id);
  const cb = { id: id('cbk'), org_id: org.id, contact_id: contact.id, due_at: due.toISOString(), mode: mode === 'text' ? 'text' : 'call', status: 'pending', topic: topic ? String(topic).slice(0, 300) : null, source, notified: 0, created_by: actorId, created_at: now(), done_at: null };
  db.insert('callbacks', cb);
  const tz = contact.timezone || safe(contact.enrichment).timezone || org.timezone;
  db.update('contacts', contact.id, { call_pref: cb.mode, next_dial_at: cb.mode === 'call' ? cb.due_at : contact.next_dial_at, dial_status: contact.dial_status === 'booked' ? 'booked' : 'callback', updated_at: now() });
  logActivity(db, org.id, contact.id, `${cb.mode === 'call' ? 'Call back' : 'Text back'} booked for ${formatDay(cb.due_at, tz)} at ${formatClock(cb.due_at, tz)} their time${cb.topic ? ` – ${cb.topic}` : ''} (${source === 'lead' ? 'chosen by them' : source === 'reply' ? 'they replied' : 'from the dialer'})`, { actorId, type: 'call' });
  if (source !== 'dialer') {
    const admins = db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin')`, org.id).map((r) => r.user_id);
    notifyUsers(db, org.id, contact.owner_id ? [contact.owner_id] : admins, {
      title: `📞 ${fullName(contact)} wants a ${cb.mode === 'call' ? 'call' : 'text'} back`,
      body: `${formatDay(cb.due_at, org.timezone)} at ${formatClock(cb.due_at, org.timezone)} your time${cb.topic ? ` – ${cb.topic}` : ''}`, link: '#/crm/calendar',
    });
  }
  if (confirm) {
    const when = `${formatDay(cb.due_at, tz)} at ${formatClock(cb.due_at, tz)}`;
    const body = cb.mode === 'call'
      ? `Thanks {{first}} – {{me}} from {{business}} will call you ${when} (your time). Need to change it? {{callback_link}}`
      : `Thanks {{first}} – {{me}} from {{business}} will text you ${when} (your time). Reply here any time before then.`;
    sendInBackground(ctx, org.id, { contactId: contact.id, body: fill(body, { first: firstName(contact), business: businessName(org), me: 'the team', callback_link: callbackPage(db, org, contact).link, ...vars }), related: { type: 'callback', id: cb.id }, force: true });
  }
  return cb;
}

/** Due call backs: the team is reminded; a text back goes out as a friendly text. */
export async function runCallbacks(ctx, at = new Date()) {
  const { db } = ctx;
  let reminded = 0;
  const soon = new Date(at.getTime() + 10 * 60_000).toISOString();
  for (const cb of db.all(`SELECT * FROM callbacks WHERE status = 'pending' AND notified = 0 AND due_at <= ?`, soon)) {
    db.run('UPDATE callbacks SET notified = 1 WHERE id = ?', cb.id);
    const c = db.get('SELECT * FROM contacts WHERE id = ?', cb.contact_id);
    const org = orgOf(db, cb.org_id);
    if (!c || !org) continue;
    const who = c.owner_id ? [c.owner_id] : db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin')`, org.id).map((r) => r.user_id);
    notifyUsers(db, org.id, who, {
      title: cb.mode === 'call' ? `📞 Call ${fullName(c)} back at ${formatClock(cb.due_at, org.timezone)}` : `💬 Text ${fullName(c)} back now`,
      body: cb.topic || (cb.mode === 'call' ? 'They’re at the top of your dialer list.' : 'They asked for a text instead of a call.'), link: cb.mode === 'call' ? '#/crm/dialer' : `#/messages/${c.id}`,
    });
    reminded++;
  }
  return { reminded };
}

// ── Ending a call ──

function mergeQualification(contact, analysis, manual = {}) {
  const q = { ...safe(contact.qualification) };
  const painKeys = [...new Set([...(q.pain_keys || []), ...(analysis.pains || []).map((p) => p.key)])];
  if (painKeys.length) q.pain_keys = painKeys;
  if (!q.pain && analysis.pains?.[0]) q.pain = analysis.pains[0].label;
  if (analysis.objections?.length) q.objections = [...new Set([...(q.objections || []), ...analysis.objections.map((o) => o.label)])];
  if (analysis.budget) q.budget = analysis.budget;
  if (analysis.timeline) q.timeline = analysis.timeline;
  if (analysis.decision_maker) q.decision_maker = analysis.decision_maker;
  if (analysis.summary) q.last_summary = analysis.summary;
  for (const [k, v] of Object.entries(manual || {})) if (v !== undefined && v !== null && v !== '') q[k] = String(v).slice(0, 500);
  q.updated_at = now();
  return q;
}

/**
 * Logs a call's outcome and does everything that follows: updates the lead,
 * books the meeting, makes their pages and follow-up sequence, sends the text
 * back, schedules the next try, and teaches the script.
 */
export async function endCall(ctx, org, userId, callId, body = {}) {
  const { db, engine } = ctx;
  const call = getCall(db, org.id, callId);
  const outcome = body.outcome;
  if (!OUTCOMES[outcome]) throw badRequest(`Choose what happened: ${Object.keys(OUTCOMES).join(', ')}`);
  let contact = getContactRow(db, call.contact_id);
  if (!contact) throw notFound('Lead');
  const settings = getDialerSettings(db, org.id);
  const msg = getMessagingSettings(db, org.id);
  const transcript = body.transcript !== undefined ? String(body.transcript || '').slice(0, 100_000) : call.transcript;
  const notes = body.notes !== undefined ? (body.notes ? String(body.notes).slice(0, 10_000) : null) : call.notes;
  const analysis = analyseTranscript(transcript, notes);
  const ended = now();
  const duration = body.duration_seconds != null ? Math.max(0, Math.round(Number(body.duration_seconds) || 0)) : call.duration_seconds ?? Math.round((Date.parse(ended) - Date.parse(call.started_at)) / 1000);
  db.update('dial_calls', call.id, { status: 'ended', outcome, notes, transcript, analysis: JSON.stringify(analysis), duration_seconds: duration, ended_at: ended });

  const tz = contact.timezone || safe(contact.enrichment).timezone || org.timezone;
  const me = myName(db, userId);
  const qualification = mergeQualification(contact, analysis, body.qualification);
  const patch = { qualification: JSON.stringify(qualification), dial_status: OUTCOMES[outcome].status, updated_at: now() };
  const result = { outcome, pages: {}, sequence: null, booking: null, callback: null, text_back: null, next_dial_at: null };

  // Due call steps in a running sequence are done once we've called.
  db.run(`UPDATE sequence_steps SET status = 'done', result = ?, done_at = ? WHERE contact_id = ? AND type = 'call' AND status = 'pending' AND due_at <= ?`, `Called – ${OUTCOMES[outcome].label.toLowerCase()}`, ended, contact.id, new Date(Date.now() + 3600_000).toISOString());
  // A call back that was due is done too.
  db.run(`UPDATE callbacks SET status = 'done', done_at = ? WHERE contact_id = ? AND status = 'pending' AND mode = 'call' AND due_at <= ?`, ended, contact.id, new Date(Date.now() + 3600_000).toISOString());

  const painShort = (qualification.pain || 'this').toLowerCase();
  const vars = () => ({ first: firstName(contact), me, business: businessName(org), pain_line: qualification.pain ? ` showing how we’d fix ${qualification.pain.toLowerCase()}` : '', pain_short: painShort,
    book_link: publicLink(`book/${org.slug}`), callback_link: callbackPage(db, org, contact).link });

  if (outcome === 'booked') {
    const serviceId = body.booking?.service_id || settings.demo_service_id || db.get('SELECT id FROM services WHERE org_id = ? AND active = 1 ORDER BY position LIMIT 1', org.id)?.id;
    if (body.booking?.starts_at && serviceId) {
      const { createBooking } = await import('../bookings/service.js');
      const made = await createBooking(ctx, org.id, { service_id: serviceId, starts_at: body.booking.starts_at, contact_id: contact.id, notes: analysis.summary || notes || 'Booked on a call' }, { actorId: userId, source: 'phone' });
      result.booking = made.booking;
    } else {
      result.booking = db.get(`SELECT * FROM bookings WHERE contact_id = ? AND status IN ('requested','confirmed') AND starts_at > ? ORDER BY starts_at LIMIT 1`, contact.id, ended) || null;
    }
    patch.next_dial_at = null;
    contact = { ...contact, qualification };
    const demo = createPage(db, org, contact, 'demo', { highlights: analysis.highlights, call_id: call.id });
    result.pages.demo = demo;
    if (result.booking) {
      const conf = createPage(db, org, contact, 'confirmation', { booking_id: result.booking.id, demo_token: demo.token, call_id: call.id });
      result.pages.confirmation = conf;
      if (settings.auto_sequences) result.sequence = createSequence(db, org, contact, 'booked', { callId: call.id, booking: result.booking, vars: { ...vars(), confirm_link: conf.link, demo_link: demo.link } });
    }
    ensureDeal(db, org, contact, userId, 'qualified');
    engine.logSystemRun(org.id, 'Dialer', 'call.booked', `Call booked ${fullName(contact)} – confirmation page, demo page${result.sequence ? ' and follow-ups' : ''} made`, 10);
  } else if (outcome === 'interested') {
    contact = { ...contact, qualification };
    patch.next_dial_at = null;
    const demo = settings.auto_demo ? createPage(db, org, contact, 'demo', { highlights: analysis.highlights, call_id: call.id }) : null;
    if (demo) result.pages.demo = demo;
    if (settings.auto_sequences) result.sequence = createSequence(db, org, contact, 'interested', { callId: call.id, vars: { ...vars(), demo_link: demo?.link || vars().book_link } });
    ensureDeal(db, org, contact, userId, 'new');
  } else if (outcome === 'callback') {
    const due = body.callback?.due_at || nextGoodTime(tz, settings, 24);
    result.callback = createCallback(ctx, org, { ...contact, qualification }, { due_at: due, mode: body.callback?.mode || 'call', topic: body.callback?.topic || analysis.next_step || null, actorId: userId });
    patch.next_dial_at = result.callback.mode === 'call' ? result.callback.due_at : null;
    patch.dial_status = 'callback';
    if (settings.auto_sequences && body.callback?.confirm !== false) {
      result.sequence = createSequence(db, org, contact, 'callback', { callId: call.id, vars: { ...vars(), callback_when: `${formatDay(result.callback.due_at, tz)} at ${formatClock(result.callback.due_at, tz)}` } });
    }
  } else if (outcome === 'no_answer' || outcome === 'voicemail') {
    const attempts = contact.dial_attempts || 1;
    const spacing = settings.retry_hours[Math.min(attempts - 1, settings.retry_hours.length - 1)] || 24;
    patch.next_dial_at = attempts >= (settings.max_attempts || 6) ? null : nextGoodTime(tz, settings, spacing);
    if (attempts >= (settings.max_attempts || 6)) patch.dial_status = 'no_answer';
    // A text straight away so they know who rang – and can choose a call back or a text back.
    const recentText = db.get(`SELECT 1 FROM messages WHERE contact_id = ? AND template_key = 'dialer_text_back' AND created_at > ?`, contact.id, new Date(Date.now() - 3 * 86400_000).toISOString());
    if (settings.text_back && body.text_back !== false && !recentText) {
      const v = vars();
      const text = `Hi ${v.first}, it’s ${me} from ${v.business} – sorry I missed you just now${outcome === 'voicemail' ? ' (I left a quick voicemail)' : ''}. Reply CALL and I’ll ring you back at a better time, or TEXT if you’d rather chat by message. Or pick a time that suits you: ${v.callback_link}`;
      result.text_back = sendInBackground(ctx, org.id, { contactId: contact.id, body: text, templateKey: 'dialer_text_back', related: { type: 'dial_call', id: call.id } }).message || null;
    }
    const active = db.get(`SELECT 1 FROM sequences WHERE contact_id = ? AND status = 'active'`, contact.id);
    if (settings.auto_sequences && !active && attempts === 1) result.sequence = createSequence(db, org, contact, 'no_answer', { callId: call.id, vars: vars() });
  } else {
    patch.next_dial_at = null;
    stopSequences(db, contact.id, outcome === 'not_interested' ? 'Not interested' : outcome === 'wrong_number' ? 'Wrong number' : 'Asked not to be called');
    db.run(`UPDATE callbacks SET status = 'cancelled' WHERE contact_id = ? AND status = 'pending'`, contact.id);
    if (outcome === 'wrong_number') patch.tags = JSON.stringify([...new Set([...(contact.tags || []), 'Wrong number'])]);
  }
  result.next_dial_at = patch.next_dial_at ?? null;
  db.update('contacts', contact.id, patch);
  logActivity(db, org.id, contact.id, `📞 ${OUTCOMES[outcome].label}${duration ? ` (${Math.max(1, Math.round(duration / 60))} min)` : ''}${analysis.summary ? ` – ${analysis.summary}` : ''}${notes ? `\nNotes: ${notes}` : ''}`, { actorId: userId, type: 'call' });
  enrichContact(db, contact.id);
  // Every conversation with a transcript (and every booking) makes the script smarter.
  if (transcript || outcome === 'booked') result.script_version = recordScriptVersion(db, org.id, `${OUTCOMES[outcome].label} – ${fullName(contact)}`);
  result.call = getCall(db, org.id, call.id);
  result.contact = getContactRow(db, contact.id);
  result.analysis = analysis;
  return result;
}

function ensureDeal(db, org, contact, userId, stage) {
  if (db.get(`SELECT 1 FROM deals WHERE contact_id = ? AND stage NOT IN ('won','lost')`, contact.id)) return;
  const e = safe(contact.enrichment);
  db.insert('deals', { id: id('deal'), org_id: org.id, contact_id: contact.id, title: `${contact.company || e.company || fullName(contact)} – from the dialer`, value: 0, stage, owner_id: contact.owner_id || userId, expected_close: null, closed_at: null, created_at: now(), updated_at: now() });
}

// ── Replies to the text back: CALL / TEXT ──

const CALL_WORDS = /^\s*(call|call me|call back|call me back|ring|ring me|ring me back|phone me|yes call)\s*[.!]*\s*$/i;
const TEXT_WORDS = /^\s*(text|text me|txt|text back|message|message me|whatsapp|whatsapp me)\s*[.!]*\s*$/i;

/** Handles “CALL” and “TEXT” replies to a dialer text. Returns a result if it handled it. */
export async function dialerReply(ctx, org, contact, channel, text) {
  const { db } = ctx;
  if (!CALL_WORDS.test(text) && !TEXT_WORDS.test(text)) return null;
  const recent = db.get(`SELECT 1 FROM messages WHERE contact_id = ? AND direction = 'out' AND (template_key = 'dialer_text_back' OR template_key LIKE 'sequence_%' OR related_type = 'callback') AND created_at > ?`, contact.id, new Date(Date.now() - 14 * 86400_000).toISOString());
  if (!recent) return null;
  const settings = getDialerSettings(db, org.id);
  const tz = contact.timezone || safe(contact.enrichment).timezone || org.timezone;
  const wantsCall = CALL_WORDS.test(text);
  const win = callWindow(tz, settings);
  const due = wantsCall ? (win.status !== 'closed' ? new Date(Date.now() + 15 * 60_000).toISOString() : win.next_best_at || win.next_open_at) : now();
  const cb = createCallback(ctx, org, contact, { due_at: due, mode: wantsCall ? 'call' : 'text', topic: `Replied “${text.trim()}”`, source: 'reply' });
  stopSequences(db, contact.id, 'They replied');
  const when = wantsCall ? (win.status !== 'closed' ? 'in the next few minutes' : `${formatDay(due, tz)} at ${formatClock(due, tz)} your time`) : null;
  const reply = wantsCall ? `Perfect – we’ll call you ${when}.` : 'No problem – we’ll text you here instead. What’s the best thing we can help with?';
  sendInBackground(ctx, org.id, { contactId: contact.id, channel, body: reply, audience: 'system', force: true, strict: true, related: { type: 'callback', id: cb.id } });
  if (!wantsCall) db.update('contacts', contact.id, { call_pref: 'text' });
  return { handled: wantsCall ? 'callback_requested' : 'text_back_requested', callback: cb };
}

// ── The CRM calendar: bookings, call backs and follow-ups together ──

export function calendarItems(db, org, from, to) {
  const tz = org.timezone || 'Europe/London';
  const items = [];
  for (const b of db.all(`SELECT b.*, s.name AS service_name, c.first_name, c.last_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN contacts c ON c.id = b.contact_id
                          WHERE b.org_id = ? AND b.starts_at >= ? AND b.starts_at < ? AND b.status != 'cancelled' ORDER BY b.starts_at`, org.id, from, to)) {
    items.push({ type: 'booking', id: b.id, at: b.starts_at, ends_at: b.ends_at, title: `${b.service_name || 'Booking'} – ${[b.first_name, b.last_name].filter(Boolean).join(' ')}`, status: b.status, contact_id: b.contact_id, link: `#/bookings/${b.id}` });
  }
  for (const cb of db.all(`SELECT cb.*, c.first_name, c.last_name, c.timezone FROM callbacks cb JOIN contacts c ON c.id = cb.contact_id WHERE cb.org_id = ? AND cb.due_at >= ? AND cb.due_at < ? AND cb.status != 'cancelled' ORDER BY cb.due_at`, org.id, from, to)) {
    items.push({ type: cb.mode === 'call' ? 'callback' : 'textback', id: cb.id, at: cb.due_at, title: `${cb.mode === 'call' ? 'Call back' : 'Text back'} – ${[cb.first_name, cb.last_name].filter(Boolean).join(' ')}`, status: cb.status, topic: cb.topic, contact_id: cb.contact_id, theirs: cb.timezone && cb.timezone !== tz ? `${formatClock(cb.due_at, cb.timezone)} their time` : null });
  }
  for (const s of db.all(`SELECT st.*, sq.name AS sequence_name, c.first_name, c.last_name FROM sequence_steps st JOIN sequences sq ON sq.id = st.sequence_id JOIN contacts c ON c.id = st.contact_id
                          WHERE st.org_id = ? AND st.due_at >= ? AND st.due_at < ? AND st.status != 'skipped' ORDER BY st.due_at`, org.id, from, to)) {
    items.push({ type: s.type === 'call' ? 'follow_call' : 'follow_message', id: s.id, at: s.due_at, title: `${s.type === 'call' ? 'Follow-up call' : 'Follow-up text'} – ${[s.first_name, s.last_name].filter(Boolean).join(' ')}`, status: s.status, topic: `${s.sequence_name}: ${s.label}`, contact_id: s.contact_id });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

// ── Public pages ──

export function publicPage(db, token) {
  const p = parseJson(db.get('SELECT * FROM lead_pages WHERE token = ?', String(token)), 'data');
  if (!p) throw notFound('Page');
  if (!p.viewed_at) {
    db.update('lead_pages', p.id, { viewed_at: now() });
    const c = db.get('SELECT * FROM contacts WHERE id = ?', p.contact_id);
    if (c && p.kind !== 'callback') logActivity(db, p.org_id, c.id, `👀 Opened their ${p.kind === 'demo' ? 'personal demo' : 'booking confirmation'} page`);
  }
  return p;
}

export function confirmationDetails(db, org, page) {
  const b = page.booking_id ? db.get(`SELECT b.*, s.name AS service_name, s.duration_min FROM bookings b LEFT JOIN services s ON s.id = b.service_id WHERE b.id = ?`, page.booking_id) : null;
  const c = db.get('SELECT * FROM contacts WHERE id = ?', page.contact_id);
  const q = safe(c?.qualification);
  const pains = solutionsFor(db, org, painsOf({ qualification: q }), { mainPain: q.pain });
  const agenda = [
    { minutes: 5, item: `Where things are now${q.pain ? ` – especially ${q.pain.toLowerCase()}` : ''}` },
    ...pains.slice(0, 2).map((p) => ({ minutes: 8, item: `Live: how we’d fix “${p.problem.toLowerCase()}”` })),
    { minutes: 5, item: 'Your questions, costs and what happens next' },
  ];
  const prep = [
    'A rough idea of how many enquiries you get each week, and where they come from',
    q.pain ? `An example of when ${q.pain.toLowerCase()} cost you a job or time` : 'One thing you’d love to stop doing by hand',
    q.decision_maker === 'Someone else is involved' ? 'Anyone else who’d be part of the decision – they’re welcome to join' : 'Your phone or laptop handy so you can see it working',
  ];
  const demo = page.data?.demo_token ? db.get('SELECT token FROM lead_pages WHERE token = ?', page.data.demo_token) : db.get(`SELECT token FROM lead_pages WHERE contact_id = ? AND kind = 'demo' ORDER BY created_at DESC LIMIT 1`, page.contact_id);
  return {
    first_name: firstName(c), booking: b ? { service: b.service_name, starts_at: b.starts_at, ends_at: b.ends_at, status: b.status, duration_min: b.duration_min, manage_link: publicLink(`booking/${b.public_token}`), address: b.address } : null,
    agenda, prep, demo_link: demo ? publicLink(`demo/${demo.token}`) : null,
  };
}

/** A lead (or anyone, from the business's call-back link) picks a call back or text back time. */
export async function publicCallback(ctx, org, contact, { starts_at, mode, tz, name, phone, topic }) {
  const { db } = ctx;
  const settings = getDialerSettings(db, org.id);
  const slots = callbackSlots(db, org, settings);
  if (!slots.includes(new Date(starts_at).toISOString())) throw badRequest('Sorry, that time has just gone – please pick another');
  let c = contact;
  if (!c) {
    const e164 = toE164(phone);
    if (!e164) throw badRequest('Add a mobile number we can reach you on');
    const { upsertContact } = await import('../crm/service.js');
    c = upsertContact(ctx, org.id, { first_name: String(name || '').trim().slice(0, 80) || 'New contact', phone: e164, source: 'Call back request' }).contact;
  }
  c = db.get('SELECT * FROM contacts WHERE id = ?', c.id);
  const e = safe(c.enrichment);
  if (tz && validZone(tz) && (!c.timezone || e.timezone_estimated || !['manual'].includes(e.timezone_source))) {
    db.update('contacts', c.id, { timezone: tz, enrichment: JSON.stringify({ ...e, timezone: tz, timezone_source: 'browser', timezone_estimated: false }) });
    c = db.get('SELECT * FROM contacts WHERE id = ?', c.id);
  }
  if (mode === 'whatsapp') db.update('contacts', c.id, { preferred_channel: 'whatsapp', whatsapp_opt_in: 1 });
  const cb = createCallback(ctx, org, c, { due_at: starts_at, mode: mode === 'call' ? 'call' : 'text', topic: topic || (mode === 'whatsapp' ? 'Prefers WhatsApp' : null), source: 'lead', confirm: true });
  stopSequences(db, c.id, 'They chose a call back time');
  return { callback: cb, contact_id: c.id };
}

/** Kept here so the CRM's lead record can show the right link to send. */
export const leadLinks = (db, org, contact) => ({
  callback: callbackPage(db, org, contact).link,
  general_callback: publicLink(`callback/${org.slug}`),
  book: publicLink(`book/${org.slug}`),
});

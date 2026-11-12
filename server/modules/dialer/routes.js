import { Router } from 'express';
import { parseJson } from '../../db/index.js';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { toE164 } from '../../lib/phone.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { safeEqual } from '../../lib/signatures.js';
import { HttpError, badRequest, notFound, now, pick } from '../../lib/util.js';
import { publicLink, serverBase } from '../../lib/links.js';
import { getContactRow } from '../crm/service.js';
import { enrichContact } from '../crm/enrich.js';
import { getCredentials } from '../integrations/service.js';
import { getMessagingSettings } from '../messaging/service.js';
import { businessCard } from '../public/routes.js';
import { twilioSignature } from '../hooks/routes.js';
import { OBJECTIONS, PAINS, analyseTranscript } from './analyse.js';
import { buildScript, recordScriptVersion, scriptVersions } from './scripts.js';
import {
  CONNECTED, DIALER_DEFAULTS, OUTCOMES, buildQueue, calendarItems, callMode, callbackPage, callbackSlots, confirmationDetails, createCallback, createPage,
  dialerLead, endCall, getCall, getDialerSettings, leadLinks, publicCallback, publicPage, saveDialerSettings, startCall, stopSequences, updateCall,
} from './service.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const cleanWindow = (w) => (w === null || w === false ? null : Array.isArray(w) && HHMM.test(w[0]) && HHMM.test(w[1]) && w[0] < w[1] ? [w[0], w[1]] : undefined);

/** CRM → Dialer, Calendar and Scripts. */
export function dialerRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));
  const admin = requireRole('owner', 'admin');

  r.get('/settings', (req, res) => {
    res.json({ settings: getDialerSettings(db, req.org.id), defaults: DIALER_DEFAULTS, call_mode: callMode(db, req.org.id), outcomes: OUTCOMES, timezone: req.org.timezone });
  });

  r.put('/settings', admin, (req, res) => {
    const s = getDialerSettings(db, req.org.id);
    const b = req.body || {};
    if (b.my_phone !== undefined) {
      if (b.my_phone && !toE164(b.my_phone)) throw badRequest('That doesn’t look like a phone number');
      s.my_phone = b.my_phone ? toE164(b.my_phone) : '';
    }
    if (b.my_timezone !== undefined) {
      if (b.my_timezone) { try { new Intl.DateTimeFormat('en-GB', { timeZone: b.my_timezone }); } catch { throw badRequest('Unknown time zone'); } }
      s.my_timezone = b.my_timezone || '';
    }
    for (const key of ['hours', 'callback_hours']) {
      if (!b[key]) continue;
      for (const day of ['weekday', 'sat', 'sun']) {
        if (b[key][day] === undefined) continue;
        const w = cleanWindow(b[key][day]);
        if (w === undefined) throw badRequest('Times must be like 09:00, and the end after the start');
        s[key][day] = w;
      }
    }
    if (Array.isArray(b.best)) {
      const best = b.best.map(cleanWindow).filter(Boolean);
      if (best.length !== b.best.length) throw badRequest('Best times must be like 10:00–11:30');
      s.best = best.slice(0, 4);
    }
    if (Array.isArray(b.retry_hours)) s.retry_hours = b.retry_hours.map(Number).filter((n) => n > 0 && n <= 24 * 14).slice(0, 6);
    if (!s.retry_hours.length) s.retry_hours = DIALER_DEFAULTS.retry_hours;
    if (b.max_attempts !== undefined) s.max_attempts = Math.max(1, Math.min(20, Number(b.max_attempts) || 6));
    if (b.speed_to_lead_minutes !== undefined) s.speed_to_lead_minutes = Math.max(5, Math.min(1440, Number(b.speed_to_lead_minutes) || 60));
    if (b.callback_minutes !== undefined) s.callback_minutes = [10, 15, 20, 30, 60].includes(Number(b.callback_minutes)) ? Number(b.callback_minutes) : 15;
    for (const k of ['text_back', 'auto_demo', 'auto_sequences', 'transcribe', 'record']) if (b[k] !== undefined) s[k] = Boolean(b[k]);
    if (b.demo_service_id !== undefined) {
      if (b.demo_service_id && !db.get('SELECT 1 FROM services WHERE id = ? AND org_id = ?', b.demo_service_id, req.org.id)) throw badRequest('Choose one of your services');
      s.demo_service_id = b.demo_service_id || null;
    }
    saveDialerSettings(db, req.org.id, s);
    res.json({ settings: s, call_mode: callMode(db, req.org.id, s) });
  });

  r.get('/queue', (req, res) => {
    res.json({ ...buildQueue(db, req.org, getDialerSettings(db, req.org.id)), call_mode: callMode(db, req.org.id) });
  });

  r.get('/leads/:id', (req, res) => {
    const lead = dialerLead(db, req.org, req.params.id, req.user.id);
    res.json({ ...lead, links: leadLinks(db, req.org, lead.contact) });
  });

  /** Re-runs enrichment for one lead, or everything not done yet. */
  r.post('/enrich', (req, res) => {
    if (req.body?.contact_id) {
      const c = db.get('SELECT * FROM contacts WHERE id = ? AND org_id = ?', req.body.contact_id, req.org.id);
      if (!c) throw notFound('Lead');
      return res.json({ enrichment: enrichContact(db, c) });
    }
    const rows = db.all('SELECT * FROM contacts WHERE org_id = ? LIMIT 2000', req.org.id);
    for (const c of rows) enrichContact(db, c);
    res.json({ enriched: rows.length });
  });

  r.get('/calls', (req, res) => {
    const where = ['d.org_id = ?'];
    const args = [req.org.id];
    if (req.query.contact) { where.push('d.contact_id = ?'); args.push(req.query.contact); }
    if (req.query.outcome) { where.push('d.outcome = ?'); args.push(req.query.outcome); }
    const calls = parseJson(db.all(`SELECT d.*, c.first_name, c.last_name, c.company, u.name AS caller FROM dial_calls d LEFT JOIN contacts c ON c.id = d.contact_id LEFT JOIN users u ON u.id = d.user_id
                                    WHERE ${where.join(' AND ')} ORDER BY d.started_at DESC LIMIT 100`, ...args), 'analysis');
    res.json(calls);
  });

  r.post('/calls', async (req, res) => {
    const b = pick(req.body, { contact_id: { required: true }, opener_key: { max: 40 }, opener_text: { max: 1000 }, mode: { enum: ['bridge', 'phone', 'demo'] } });
    res.status(201).json(await startCall(ctx, req.org, req.user.id, b.contact_id, b));
  });

  r.get('/calls/:id', (req, res) => res.json(getCall(db, req.org.id, req.params.id)));

  r.patch('/calls/:id', (req, res) => {
    const b = req.body || {};
    res.json(updateCall(db, req.org.id, req.params.id, { notes: b.notes, transcript: b.transcript, append: b.append }));
  });

  r.post('/calls/:id/end', async (req, res) => {
    res.json(await endCall(ctx, req.org, req.user.id, req.params.id, req.body || {}));
  });

  /** Preview what the transcript analysis picks out (used while the call is live). */
  r.post('/analyse', (req, res) => res.json(analyseTranscript(String(req.body?.transcript || '').slice(0, 100_000), String(req.body?.notes || '').slice(0, 10_000))));

  // ── Calendar ──
  r.get('/calendar', (req, res) => {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 86400_000);
    const to = req.query.to ? new Date(req.query.to) : new Date(from.getTime() + 8 * 86400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw badRequest('Bad dates');
    res.json({ items: calendarItems(db, req.org, from.toISOString(), to.toISOString()), timezone: req.org.timezone });
  });

  r.get('/callbacks', (req, res) => {
    res.json(db.all(`SELECT cb.*, c.first_name, c.last_name, c.timezone, c.phone FROM callbacks cb JOIN contacts c ON c.id = cb.contact_id WHERE cb.org_id = ? AND cb.status = 'pending' ORDER BY cb.due_at LIMIT 200`, req.org.id));
  });

  r.get('/callback-slots', (req, res) => res.json(callbackSlots(db, req.org)));

  r.post('/callbacks', (req, res) => {
    const b = pick(req.body, { contact_id: { required: true }, due_at: { required: true }, mode: { enum: ['call', 'text'] }, topic: { max: 300 }, confirm: { type: 'boolean' } });
    const c = getContactRow(db, b.contact_id);
    if (!c || c.org_id !== req.org.id) throw notFound('Lead');
    res.status(201).json(createCallback(ctx, req.org, c, { ...b, actorId: req.user.id, confirm: Boolean(b.confirm) }));
  });

  r.patch('/callbacks/:id', (req, res) => {
    const cb = db.get('SELECT * FROM callbacks WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    if (!cb) throw notFound('Call back');
    const b = pick(req.body, { status: { enum: ['pending', 'done', 'cancelled'] }, due_at: {}, mode: { enum: ['call', 'text'] }, topic: { max: 300 } }, { partial: true });
    const patch = {};
    if (b.status) { patch.status = b.status; patch.done_at = b.status === 'done' ? now() : null; }
    if (b.due_at) { const d = new Date(b.due_at); if (Number.isNaN(d.getTime())) throw badRequest('Bad time'); patch.due_at = d.toISOString(); patch.notified = 0; }
    if (b.mode) patch.mode = b.mode;
    if (b.topic !== undefined) patch.topic = b.topic;
    db.update('callbacks', cb.id, patch);
    res.json(db.get('SELECT * FROM callbacks WHERE id = ?', cb.id));
  });

  // ── Sequences ──
  r.get('/sequences', (req, res) => {
    const seqs = db.all(`SELECT sq.*, c.first_name, c.last_name FROM sequences sq JOIN contacts c ON c.id = sq.contact_id WHERE sq.org_id = ? ORDER BY sq.created_at DESC LIMIT 100`, req.org.id);
    res.json(seqs.map((s) => ({ ...s, steps: db.all('SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_no', s.id) })));
  });

  r.post('/sequences/:id/stop', (req, res) => {
    const s = db.get('SELECT * FROM sequences WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    if (!s) throw notFound('Sequence');
    stopSequences(db, s.contact_id, 'Stopped by the team');
    res.json({ ok: true });
  });

  r.patch('/sequence-steps/:id', (req, res) => {
    const step = db.get('SELECT * FROM sequence_steps WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    if (!step) throw notFound('Step');
    if (step.status !== 'pending') throw badRequest('That step has already happened');
    const b = pick(req.body, { body: { max: 1600 }, due_at: {}, status: { enum: ['pending', 'skipped'] } }, { partial: true });
    const patch = {};
    if (b.body !== undefined && step.type === 'message') patch.body = b.body;
    if (b.due_at) { const d = new Date(b.due_at); if (Number.isNaN(d.getTime())) throw badRequest('Bad time'); patch.due_at = d.toISOString(); }
    if (b.status) { patch.status = b.status; if (b.status === 'skipped') patch.result = 'Skipped by the team'; }
    db.update('sequence_steps', step.id, patch);
    res.json(db.get('SELECT * FROM sequence_steps WHERE id = ?', step.id));
  });

  // ── Personal pages ──
  r.post('/pages', (req, res) => {
    const b = pick(req.body, { contact_id: { required: true }, kind: { required: true, enum: ['demo', 'callback'] } });
    const c = getContactRow(db, b.contact_id);
    if (!c || c.org_id !== req.org.id) throw notFound('Lead');
    const page = createPage(db, req.org, c, b.kind);
    res.status(201).json(page);
  });

  // ── Scripts ──
  r.get('/script', (req, res) => {
    res.json({ ...buildScript(db, req.org.id), versions: scriptVersions(db, req.org.id), pains: PAINS.map(({ key, label }) => ({ key, label })), objection_types: OBJECTIONS.map(({ key, label }) => ({ key, label })) });
  });

  r.post('/script/rebuild', (req, res) => {
    const version = recordScriptVersion(db, req.org.id, 'Rebuilt by hand');
    res.json({ version, ...buildScript(db, req.org.id), versions: scriptVersions(db, req.org.id) });
  });

  r.get('/stats', (req, res) => {
    const rows = db.all(`SELECT outcome, COUNT(*) AS n FROM dial_calls WHERE org_id = ? AND status = 'ended' AND started_at > ? GROUP BY outcome`, req.org.id, new Date(Date.now() - 30 * 86400_000).toISOString());
    const total = rows.reduce((t, r2) => t + r2.n, 0);
    const connected = rows.filter((r2) => CONNECTED.includes(r2.outcome)).reduce((t, r2) => t + r2.n, 0);
    const booked = rows.find((r2) => r2.outcome === 'booked')?.n || 0;
    res.json({ total, connected, booked, by_outcome: rows, connect_rate: total ? Math.round((connected / total) * 100) : 0, book_rate: connected ? Math.round((booked / connected) * 100) : 0 });
  });

  return r;
}

/** The pages leads open: their demo, booking confirmation and call-back picker. */
export function dialerPublicRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  const orgOf = (orgId) => db.get('SELECT * FROM organizations WHERE id = ?', orgId);

  r.get('/lead/:token', (req, res) => {
    const p = publicPage(db, req.params.token);
    const org = orgOf(p.org_id);
    const c = db.get('SELECT * FROM contacts WHERE id = ?', p.contact_id);
    const first = c?.first_name && !/^(new contact|caller)/i.test(c.first_name) ? c.first_name : null;
    const base = { kind: p.kind, business: businessCard(db, org), first_name: first, company: c?.company || null, created_at: p.created_at };
    if (p.kind === 'demo') {
      const callback = c ? callbackPage(db, org, c) : null;
      return res.json({ ...base, solutions: p.data.solutions || [], pain: p.data.pain || null, their_words: p.data.their_words || [], callback_link: callback?.link || null, book_link: publicLink(`book/${org.slug}`) });
    }
    if (p.kind === 'confirmation') return res.json({ ...base, ...confirmationDetails(db, org, p) });
    return res.json({ ...base, slots: callbackSlots(db, org), modes: modesFor(db, org) });
  });

  /** The business's own call-back link (#/callback/<slug>), for anyone. */
  r.get('/callback/:slug', (req, res) => {
    const org = db.get('SELECT * FROM organizations WHERE slug = ?', String(req.params.slug));
    if (!org) throw notFound('Business');
    res.json({ kind: 'callback', general: true, business: businessCard(db, org), slots: callbackSlots(db, org), modes: modesFor(db, org) });
  });

  r.post('/callback/:key', async (req, res) => {
    if (!rateLimit(`callback:${req.ip || 'local'}`, { max: 10, windowMs: 60_000 })) throw new HttpError(429, 'Too many attempts – please wait a minute');
    const b = pick(req.body, { starts_at: { required: true }, mode: { required: true, enum: ['call', 'text', 'whatsapp'] }, tz: { max: 60 }, name: { max: 80 }, phone: { max: 30 }, topic: { max: 300 } });
    const page = db.get(`SELECT * FROM lead_pages WHERE token = ? AND kind = 'callback'`, String(req.params.key));
    const org = page ? orgOf(page.org_id) : db.get('SELECT * FROM organizations WHERE slug = ?', String(req.params.key));
    if (!org) throw notFound('Page');
    const contact = page ? db.get('SELECT * FROM contacts WHERE id = ?', page.contact_id) : null;
    if (!page && !b.name) throw badRequest('Add your name');
    const out = await publicCallback(ctx, org, contact, b);
    res.status(201).json({ ok: true, starts_at: out.callback.due_at, mode: b.mode });
  });

  return r;
}

function modesFor(db, org) {
  const m = getMessagingSettings(db, org.id);
  return ['call', ...(m.sms_enabled ? ['text'] : []), ...(m.whatsapp_enabled ? ['whatsapp'] : [])];
}

/**
 * Twilio: connects your phone to the lead, streams the live transcription
 * back onto the call, and records how long it lasted.
 */
export function dialerHookRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  const xml = (s) => String(s ?? '').replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[ch]));
  const verified = (req) => {
    const call = db.get('SELECT * FROM dial_calls WHERE id = ?', String(req.params.id));
    if (!call) throw new HttpError(404, 'Not found');
    const token = getCredentials(db, call.org_id).twilio?.authToken;
    if (!token) throw new HttpError(503, 'Twilio is not connected');
    const expected = twilioSignature(token, `${serverBase()}${req.originalUrl}`, req.body || {});
    if (!safeEqual(expected, req.get('x-twilio-signature'))) throw new HttpError(403, 'Invalid signature');
    return call;
  };

  r.post('/:id/connect', (req, res) => {
    const call = verified(req);
    const contact = db.get('SELECT * FROM contacts WHERE id = ?', call.contact_id);
    const settings = getDialerSettings(db, call.org_id);
    const msg = getMessagingSettings(db, call.org_id);
    const base = serverBase();
    const transcribe = settings.transcribe ? `<Start><Transcription statusCallbackUrl="${xml(`${base}/api/hooks/dialer/${call.id}/transcript`)}" track="both_tracks" languageCode="en-GB" partialResults="false"/></Start>` : '';
    const record = settings.record ? ` record="record-from-answer-dual" recordingStatusCallback="${xml(`${base}/api/hooks/dialer/${call.id}/recording`)}"` : '';
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response>${transcribe}<Dial callerId="${xml(msg.business_number)}" answerOnBridge="true"${record}><Number>${xml(contact?.phone_e164 || '')}</Number></Dial></Response>`);
  });

  r.post('/:id/transcript', (req, res) => {
    const call = verified(req);
    const b = req.body || {};
    if (b.TranscriptionEvent === 'transcription-content' && b.Final !== 'false') {
      let text = '';
      try { text = JSON.parse(b.TranscriptionData || '{}').transcript || ''; } catch { text = ''; }
      // The call leg is your phone: what comes in from it is you, what goes out to it is them.
      if (text.trim()) updateCall(db, call.org_id, call.id, { append: `${b.Track === 'inbound_track' ? 'You' : 'Them'}: ${text.trim()}` });
    }
    res.type('text/xml').send('<Response/>');
  });

  r.post('/:id/status', (req, res) => {
    const call = verified(req);
    const b = req.body || {};
    if (b.CallDuration) db.update('dial_calls', call.id, { duration_seconds: Number(b.CallDuration) || null });
    res.type('text/xml').send('<Response/>');
  });

  r.post('/:id/recording', (req, res) => {
    const call = verified(req);
    if (req.body?.RecordingUrl) db.update('dial_calls', call.id, { recording_url: String(req.body.RecordingUrl) });
    res.type('text/xml').send('<Response/>');
  });

  return r;
}


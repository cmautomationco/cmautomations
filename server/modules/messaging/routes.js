import { Router } from 'express';
import { config } from '../../config.js';
import { parseJson } from '../../db/index.js';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { publicLink, serverBase } from '../../lib/links.js';
import { displayPhone, toE164 } from '../../lib/phone.js';
import { setSetting } from '../../lib/settings.js';
import { badRequest, notFound, now, pick, publicToken } from '../../lib/util.js';
import { getContactRow } from '../crm/service.js';
import { connectionStatus } from '../integrations/service.js';
import { MESSAGING_DEFAULTS, closeReplyTasks, getMessagingSettings, getTemplate, handleInbound, handleMissedCall, pickChannel, sendMessage, threadFor, whatsappAllowed } from './service.js';
import { TEMPLATES, TEMPLATE_KEYS } from './templates.js';
import { TEMPLATE_NEEDED, whatsappTemplate } from './whatsapp.js';

/** Where the business's own system is reachable, for webhook addresses to paste into Twilio/Stripe. */
const apiBase = () => serverBase();

/** Ensures the business has a secret for its inbound-message webhook (Zapier / Make / email parsers). */
function inboundToken(db, orgId, settings) {
  if (settings.inbound_token) return settings.inbound_token;
  const token = publicToken();
  setSetting(db, orgId, 'messaging', { ...settings, inbound_token: token });
  return token;
}

export function messagingRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));

  /** Counts for the sidebar badge and dashboard. */
  r.get('/summary', (req, res) => {
    const o = req.org.id;
    res.json({
      unread: db.get(`SELECT COUNT(*) AS n FROM messages WHERE org_id = ? AND direction = 'in' AND read = 0`, o).n,
      missed_calls: db.get(`SELECT COUNT(*) AS n FROM calls WHERE org_id = ? AND status IN ('missed','voicemail') AND handled = 0`, o).n,
      urgent: db.get(`SELECT COUNT(*) AS n FROM tasks WHERE org_id = ? AND status != 'done' AND title LIKE '🚨%'`, o).n,
    });
  });

  /** One row per customer conversation, newest first. */
  r.get('/threads', (req, res) => {
    const where = ['c.org_id = ?'];
    const params = [req.org.id];
    if (['whatsapp', 'sms', 'email'].includes(req.query.channel)) {
      where.push('EXISTS (SELECT 1 FROM messages x WHERE x.contact_id = c.id AND x.channel = ?)');
      params.push(req.query.channel);
    }
    if (req.query.q) {
      where.push(`(c.first_name || ' ' || COALESCE(c.last_name,'') || ' ' || COALESCE(c.phone,'') || ' ' || COALESCE(c.email,'')) LIKE ?`);
      params.push(`%${req.query.q}%`);
    }
    let rows = db.all(`SELECT c.id, c.first_name, c.last_name, c.phone_e164, c.email, c.whatsapp_opt_in, c.sms_opt_out, c.company,
        m.body AS last_body, m.channel AS last_channel, m.direction AS last_direction, m.status AS last_status, m.created_at AS last_at,
        (SELECT COUNT(*) FROM messages u WHERE u.contact_id = c.id AND u.direction = 'in' AND u.read = 0) AS unread,
        EXISTS (SELECT 1 FROM tasks t WHERE t.source_ref = c.id AND t.status != 'done' AND t.title LIKE '🚨%') AS urgent
      FROM contacts c JOIN messages m ON m.id = (SELECT id FROM messages WHERE contact_id = c.id ORDER BY created_at DESC, rowid DESC LIMIT 1)
      WHERE ${where.join(' AND ')} ORDER BY urgent DESC, m.created_at DESC LIMIT 300`, ...params);
    if (req.query.filter === 'unread') rows = rows.filter((t) => t.unread > 0);
    if (req.query.filter === 'urgent') rows = rows.filter((t) => t.urgent);
    res.json(rows.map((t) => ({ ...t, phone_display: displayPhone(t.phone_e164) })));
  });

  /** A conversation with one customer. Opening it marks their messages as read. */
  r.get('/threads/:contactId', (req, res) => {
    const contact = getContactRow(db, req.params.contactId);
    if (!contact || contact.org_id !== req.org.id) throw notFound('Contact');
    db.run(`UPDATE messages SET read = 1 WHERE contact_id = ? AND direction = 'in' AND read = 0`, contact.id);
    const settings = getMessagingSettings(db, req.org.id);
    res.json({
      contact: { ...contact, phone_display: displayPhone(contact.phone_e164) },
      messages: threadFor(db, req.org.id, contact.id),
      calls: db.all('SELECT * FROM calls WHERE contact_id = ? ORDER BY created_at DESC LIMIT 20', contact.id),
      channels: {
        whatsapp: { available: Boolean(settings.whatsapp_enabled && contact.phone_e164), allowed: whatsappAllowed(db, contact), note: whatsappAllowed(db, contact) ? null : 'They haven’t opted in to WhatsApp or messaged in the last 24 hours, so this will go as a text when live.' },
        sms: { available: Boolean(settings.sms_enabled && contact.phone_e164 && !contact.sms_opt_out), note: contact.sms_opt_out ? 'Replied STOP – texts and WhatsApp are blocked.' : null },
        email: { available: Boolean(settings.email_enabled && contact.email && !contact.email_opt_out) },
        best: pickChannel(db, contact, settings),
      },
      open_tasks: db.all(`SELECT id, title, priority, due_at FROM tasks WHERE org_id = ? AND source_ref = ? AND status != 'done' ORDER BY due_at`, req.org.id, contact.id),
      next_booking: db.get(`SELECT b.id, b.starts_at, b.status, s.name AS service_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id WHERE b.contact_id = ? AND b.starts_at > ? AND b.status IN ('requested','confirmed','on_the_way') ORDER BY b.starts_at LIMIT 1`, contact.id, now()) || null,
    });
  });

  /** Reply to a customer. Replying completes the open "Reply to…" task. */
  r.post('/threads/:contactId/send', async (req, res) => {
    const contact = getContactRow(db, req.params.contactId);
    if (!contact || contact.org_id !== req.org.id) throw notFound('Contact');
    const body = pick(req.body, { channel: { enum: ['auto', 'email', 'sms', 'whatsapp'] }, body: { max: 2000 }, subject: { max: 200 }, template: { enum: TEMPLATE_KEYS } });
    if (!body.body && !body.template) throw badRequest('Write a message');
    const { message, skipped } = await sendMessage(ctx, req.org.id, {
      contact, channel: body.channel || 'auto', body: body.body || undefined, subject: body.subject || undefined, template: body.template || undefined,
      actorId: req.user.id, audience: 'system', force: true,
    });
    if (!message) throw badRequest(skipped);
    if (message.status === 'blocked') throw badRequest(message.error);
    closeReplyTasks(db, req.org.id, contact.id);
    res.status(201).json(message);
  });

  // ── Calls ──
  r.get('/calls', (req, res) => {
    res.json(db.all(`SELECT k.*, c.first_name, c.last_name FROM calls k LEFT JOIN contacts c ON c.id = k.contact_id WHERE k.org_id = ? ORDER BY k.created_at DESC LIMIT 200`, req.org.id)
      .map((k) => ({ ...k, from_display: displayPhone(k.from_number) })));
  });
  r.post('/calls/:id/handled', (req, res) => {
    const call = db.get('SELECT * FROM calls WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    if (!call) throw notFound('Call');
    db.update('calls', call.id, { handled: 1 });
    db.run(`UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE org_id = ? AND source_ref = ? AND status != 'done' AND title LIKE 'Call back%'`, now(), now(), req.org.id, call.contact_id);
    res.json({ ok: true });
  });

  /** Messages sent to the team's phone (alerts, job sheets). */
  r.get('/alerts', (req, res) => {
    res.json(db.all(`SELECT * FROM messages WHERE org_id = ? AND contact_id IS NULL AND direction = 'out' ORDER BY created_at DESC LIMIT 50`, req.org.id));
  });

  // ── Templates (the wording of every automatic message) ──
  r.get('/templates', (req, res) => {
    const sids = getMessagingSettings(db, req.org.id).whatsapp_content_sids || {};
    res.json(TEMPLATE_KEYS.map((key) => {
      const t = getTemplate(db, req.org.id, key);
      const wa = TEMPLATE_NEEDED.includes(key) ? whatsappTemplate(t.body) : null;
      return { ...t, whatsapp: wa ? { needed: true, text: wa.text, variables: wa.variables, content_sid: sids[key] || '' } : null };
    }));
  });

  /** Saves the Twilio Content SID of an approved WhatsApp template. */
  r.put('/templates/:key/whatsapp', requireRole('owner', 'admin'), (req, res) => {
    if (!TEMPLATE_NEEDED.includes(req.params.key)) throw notFound('Template');
    const sid = String(req.body?.content_sid || '').trim();
    if (sid && !/^HX[0-9a-f]{32}$/i.test(sid)) throw badRequest('The Content SID starts with HX and is 34 characters (Twilio → Messaging → Content Template Builder)');
    const current = getMessagingSettings(db, req.org.id);
    const sids = { ...(current.whatsapp_content_sids || {}) };
    if (sid) sids[req.params.key] = sid; else delete sids[req.params.key];
    setSetting(db, req.org.id, 'messaging', { ...current, whatsapp_content_sids: sids });
    res.json({ key: req.params.key, content_sid: sid });
  });
  r.put('/templates/:key', requireRole('owner', 'admin'), (req, res) => {
    if (!TEMPLATES[req.params.key]) throw notFound('Template');
    const body = pick(req.body, { subject: { max: 200 }, body: { required: true, max: 2000 } });
    db.run(`INSERT INTO message_templates (org_id, key, subject, body, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(org_id, key) DO UPDATE SET subject = excluded.subject, body = excluded.body, updated_at = excluded.updated_at`, req.org.id, req.params.key, body.subject || null, body.body, now());
    res.json(getTemplate(db, req.org.id, req.params.key));
  });
  r.delete('/templates/:key', requireRole('owner', 'admin'), (req, res) => {
    db.run('DELETE FROM message_templates WHERE org_id = ? AND key = ?', req.org.id, req.params.key);
    res.json(getTemplate(db, req.org.id, req.params.key));
  });

  // ── Settings: phone number, WhatsApp, alerts, quiet hours ──
  r.get('/settings', (req, res) => {
    const settings = getMessagingSettings(db, req.org.id);
    const token = inboundToken(db, req.org.id, settings);
    const base = apiBase();
    const wa = (settings.whatsapp_number || settings.business_number || '').replace('+', '');
    res.json({
      settings: { ...settings, inbound_token: undefined },
      status: (() => {
        const c = connectionStatus(db, req.org.id);
        const live = c.twilio.connected || c.email.connected;
        return { twilio: c.twilio.connected, email: c.email.connected, stripe: c.stripe.connected, demo: !live, mode: live ? 'live' : settings.webhook_url ? 'webhook' : 'demo' };
      })(),
      setup: {
        voice_url: `${base}/api/hooks/twilio/voice`,
        messaging_url: `${base}/api/hooks/twilio/messages`,
        status_url: `${base}/api/hooks/twilio/status`,
        stripe_webhook_url: `${base}/api/hooks/stripe`,
        inbound_url: `${base}/api/hooks/inbound/${token}`,
        whatsapp_link: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${req.org.name}, I’d like to ask about…`)}` : null,
        whatsapp_book_link: wa ? `https://wa.me/${wa}?text=BOOK` : null,
        booking_link: publicLink(`book/${req.org.slug}`),
      },
    });
  });

  r.put('/settings', requireRole('owner', 'admin'), (req, res) => {
    const current = getMessagingSettings(db, req.org.id);
    const body = pick(req.body, {
      email_enabled: { type: 'boolean' }, sms_enabled: { type: 'boolean' }, whatsapp_enabled: { type: 'boolean' },
      email_from_name: { max: 80 }, email_reply_to: { max: 200 }, business_number: { max: 30 }, whatsapp_number: { max: 30 },
      forward_to: { max: 30 }, alert_number: { max: 30 }, alert_channel: { enum: ['whatsapp', 'sms', 'none'] },
      missed_call_text_back: { type: 'boolean' }, ring_seconds: { type: 'number' }, voicemail: { type: 'boolean' },
      emergency_keywords: { max: 1000 }, quiet_hours: { type: 'object' }, webhook_url: { max: 500 }, review_link: { max: 500 },
      whatsapp_content_sids: { type: 'object' },
      auto_reply: { type: 'boolean' }, emergency_auto_reply: { type: 'boolean' },
    }, { partial: true });
    for (const key of ['business_number', 'whatsapp_number', 'forward_to', 'alert_number']) {
      if (body[key] === undefined) continue;
      if (body[key] === null || body[key] === '') { body[key] = ''; continue; }
      const e164 = toE164(body[key]);
      if (!e164) throw badRequest(`${key.replace('_', ' ')} doesn’t look like a phone number`);
      body[key] = e164;
    }
    for (const key of ['webhook_url', 'review_link']) {
      if (body[key] && !/^https?:\/\//i.test(body[key])) throw badRequest(`${key.replace('_', ' ')} must start with https://`);
      if (body[key] === null) body[key] = '';
    }
    if (body.ring_seconds != null) body.ring_seconds = Math.min(60, Math.max(5, Math.round(body.ring_seconds)));
    if (body.quiet_hours) {
      const q = { ...current.quiet_hours, ...body.quiet_hours };
      if (!/^\d{2}:\d{2}$/.test(q.start) || !/^\d{2}:\d{2}$/.test(q.end)) throw badRequest('Quiet hours must be times like 20:00');
      body.quiet_hours = { enabled: Boolean(q.enabled), start: q.start, end: q.end };
    }
    // Strip nulls from optional text fields so defaults aren't overwritten with null.
    for (const [k, v] of Object.entries(body)) if (v === null) body[k] = MESSAGING_DEFAULTS[k] ?? '';
    const next = setSetting(db, req.org.id, 'messaging', { ...current, ...body });
    res.json({ ...next, inbound_token: undefined });
  });

  // ── Try it: simulate a customer message or a missed call (works without Twilio) ──
  r.post('/simulate/inbound', requireRole('owner', 'admin'), async (req, res) => {
    const body = pick(req.body, { channel: { enum: ['whatsapp', 'sms', 'email'] }, from: { required: true, max: 200 }, body: { required: true, max: 2000 }, name: { max: 80 } });
    const channel = body.channel || 'whatsapp';
    if (channel !== 'email' && !toE164(body.from)) throw badRequest('Enter a mobile number like 07700 900123');
    const settings = getMessagingSettings(db, req.org.id);
    const result = await handleInbound(ctx, req.org.id, { channel, from: body.from, to: channel === 'whatsapp' ? settings.whatsapp_number : settings.business_number, body: body.body, profileName: body.name });
    res.status(201).json({ ...result, contact: parseJson(result.contact, 'tags') });
  });

  r.post('/simulate/missed-call', requireRole('owner', 'admin'), async (req, res) => {
    const body = pick(req.body, { from: { required: true, max: 40 }, voicemail: { type: 'boolean' } });
    if (!toE164(body.from)) throw badRequest('Enter a phone number like 07700 900123');
    const settings = getMessagingSettings(db, req.org.id);
    const result = await handleMissedCall(ctx, req.org.id, { from: body.from, to: settings.business_number || null, voicemailUrl: body.voicemail ? 'demo-voicemail' : null });
    res.status(201).json(result);
  });

  return r;
}

import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../../config.js';
import { toE164 } from '../../lib/phone.js';
import { HttpError, now } from '../../lib/util.js';
import { recordPayment } from '../billing/service.js';
import { businessName, getMessagingSettings, handleInbound, handleMissedCall } from '../messaging/service.js';
import { notifyUsers } from '../core/notifications.js';

/**
 * Webhooks from Twilio (calls, texts, WhatsApp, delivery receipts), Stripe
 * (card payments) and a generic inbound hook for Zapier / Make / email parsers.
 * Only mounted on the real server – the test build simulates these instead.
 */

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const twiml = (res, body = '') => res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`);
const apiBase = () => config.publicUrl.replace(/\/[^/]*\.[a-z0-9]+$/i, '');

/** Twilio signs each request: HMAC-SHA1 of the full URL plus the sorted form fields. */
export function twilioSignature(authToken, url, params = {}) {
  const data = url + Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function verifyTwilio(req) {
  if (!config.twilioAuthToken) throw new HttpError(503, 'Twilio is not configured');
  const expected = twilioSignature(config.twilioAuthToken, `${apiBase()}${req.originalUrl}`, req.body || {});
  if (!safeEqual(expected, req.get('x-twilio-signature'))) throw new HttpError(403, 'Invalid signature');
}

/** Stripe signs each event: HMAC-SHA256 of "timestamp.body". Events older than 5 minutes are refused. */
export function verifyStripe(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v]));
  const signatures = String(header || '').split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  if (!parts.t || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`, 'utf8').digest('hex');
  return signatures.some((s) => safeEqual(s, expected));
}

/** Finds the business that owns a phone number (its business or WhatsApp number). */
function orgByNumber(db, number) {
  const e164 = toE164(number);
  if (!e164) return null;
  for (const row of db.all(`SELECT org_id, value FROM org_meta WHERE key = 'setting:messaging'`)) {
    try {
      const s = JSON.parse(row.value);
      if (s.business_number === e164 || s.whatsapp_number === e164) return db.get('SELECT * FROM organizations WHERE id = ?', row.org_id);
    } catch { /* ignore broken settings */ }
  }
  return null;
}

export function hookRoutes(ctx) {
  const { db } = ctx;
  const r = Router();

  // ── Calls: ring the team's mobile, and if nobody answers, text the caller back ──
  r.post('/twilio/voice', (req, res) => {
    verifyTwilio(req);
    const org = orgByNumber(db, req.body.To);
    if (!org) return twiml(res, '<Say voice="Polly.Amy">Sorry, this number is not in service.</Say><Hangup/>');
    const s = getMessagingSettings(db, org.id);
    if (s.forward_to) {
      return twiml(res, `<Dial timeout="${Number(s.ring_seconds) || 20}" answerOnBridge="true" action="${xml(`${apiBase()}/api/hooks/twilio/voice-status`)}" method="POST"><Number>${xml(s.forward_to)}</Number></Dial>`);
    }
    return missed(req, res, org, s);
  });

  async function missed(req, res, org, s) {
    await handleMissedCall(ctx, org.id, { from: req.body.From, to: req.body.To, providerId: req.body.CallSid });
    if (!s.voicemail) return twiml(res, `<Say voice="Polly.Amy">Sorry, ${xml(businessName(org))} can’t take your call right now. We’ve just sent you a text so you can reply there. Goodbye.</Say><Hangup/>`);
    return twiml(res, `<Say voice="Polly.Amy">Sorry, ${xml(businessName(org))} can’t take your call right now. We’ve just sent you a text. Or leave a message after the tone and we’ll call you back.</Say><Record maxLength="120" playBeep="true" action="${xml(`${apiBase()}/api/hooks/twilio/voicemail`)}" method="POST"/>`);
  }

  r.post('/twilio/voice-status', async (req, res) => {
    verifyTwilio(req);
    const org = orgByNumber(db, req.body.To);
    if (!org) return twiml(res);
    if (req.body.DialCallStatus === 'completed') {
      await handleMissedCall(ctx, org.id, { from: req.body.From, to: req.body.To, providerId: req.body.CallSid, status: 'answered', duration: Number(req.body.DialCallDuration) || null });
      return twiml(res);
    }
    return missed(req, res, org, getMessagingSettings(db, org.id));
  });

  r.post('/twilio/voicemail', (req, res) => {
    verifyTwilio(req);
    const org = orgByNumber(db, req.body.To);
    if (org && req.body.RecordingUrl) {
      const call = db.get(`SELECT * FROM calls WHERE org_id = ? AND (provider_id = ? OR from_number = ?) ORDER BY created_at DESC LIMIT 1`, org.id, req.body.CallSid || '', toE164(req.body.From) || '');
      if (call) {
        db.update('calls', call.id, { status: 'voicemail', recording_url: `${req.body.RecordingUrl}.mp3`, duration_seconds: Number(req.body.RecordingDuration) || null });
        const admins = db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin')`, org.id).map((m) => m.user_id);
        notifyUsers(db, org.id, admins, { title: '🎙️ New voicemail', body: `From ${req.body.From}. Listen in Messages → Calls.`, link: '#/messages/calls' });
      }
    }
    return twiml(res, '<Say voice="Polly.Amy">Thanks, we’ll be in touch soon. Goodbye.</Say><Hangup/>');
  });

  // ── Texts and WhatsApp messages from customers ──
  r.post('/twilio/messages', async (req, res) => {
    verifyTwilio(req);
    const whatsapp = String(req.body.From || '').startsWith('whatsapp:');
    const org = orgByNumber(db, req.body.To);
    if (!org) return twiml(res);
    let body = String(req.body.Body || '');
    // Customers often send a photo of the problem (a leak, a fuse box) – keep the links with the message.
    for (let i = 0; i < Math.min(10, Number(req.body.NumMedia) || 0); i++) {
      if (req.body[`MediaUrl${i}`]) body += `\n📷 ${req.body[`MediaContentType${i}`]?.startsWith('image/') ? 'Photo' : 'Attachment'}: ${req.body[`MediaUrl${i}`]}`;
    }
    await handleInbound(ctx, org.id, { channel: whatsapp ? 'whatsapp' : 'sms', from: req.body.From, to: req.body.To, body: body.trim(), providerId: req.body.MessageSid, profileName: req.body.ProfileName || null });
    return twiml(res);
  });

  // ── Delivery receipts ──
  r.post('/twilio/status', (req, res) => {
    verifyTwilio(req);
    const map = { sent: 'sent', delivered: 'delivered', read: 'delivered', undelivered: 'failed', failed: 'failed' };
    const status = map[req.body.MessageStatus];
    if (status && req.body.MessageSid) {
      db.run(`UPDATE messages SET status = ?, error = COALESCE(?, error) WHERE provider_id = ? AND status != 'delivered'`, status, status === 'failed' ? `Not delivered (Twilio error ${req.body.ErrorCode || 'unknown'})` : null, req.body.MessageSid);
    }
    res.status(204).send('');
  });

  // ── Card payments (Stripe Checkout) ──
  r.post('/stripe', async (req, res) => {
    if (!config.stripeWebhookSecret) throw new HttpError(503, 'Stripe webhooks are not configured');
    if (!verifyStripe(req.rawBody || '', req.get('stripe-signature'), config.stripeWebhookSecret)) throw new HttpError(400, 'Invalid signature');
    const event = req.body;
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      const session = event.data?.object || {};
      const invoiceId = session.metadata?.invoice_id;
      const orgId = session.metadata?.org_id;
      if (session.payment_status === 'paid' && invoiceId && orgId && db.get('SELECT 1 FROM invoices WHERE id = ? AND org_id = ?', invoiceId, orgId)) {
        await recordPayment(ctx, orgId, invoiceId, {
          amount_pence: session.amount_total, method: 'card', provider_id: session.payment_intent || session.id, reference: `Card payment ${now().slice(0, 10)}`,
        }).catch((err) => console.error('[stripe]', err.message));
      }
    }
    res.json({ received: true });
  });

  // ── Generic inbound messages (Zapier, Make, email parsers) ──
  r.post('/inbound/:token', async (req, res) => {
    const row = db.all(`SELECT org_id, value FROM org_meta WHERE key = 'setting:messaging'`).find((m) => {
      try { return JSON.parse(m.value).inbound_token === req.params.token; } catch { return false; }
    });
    if (!row || String(req.params.token).length < 20) throw new HttpError(404, 'Not found');
    const b = req.body || {};
    const channel = ['email', 'sms', 'whatsapp'].includes(b.channel) ? b.channel : String(b.from || '').includes('@') ? 'email' : 'sms';
    if (!b.from || !(b.text || b.body)) throw new HttpError(400, 'Send { from, text } (and optionally name, subject, channel)');
    const result = await handleInbound(ctx, row.org_id, { channel, from: b.from, body: String(b.text || b.body).slice(0, 5000), subject: b.subject || null, profileName: b.name || null });
    res.status(201).json({ ok: true, contact_id: result.contact.id, urgent: result.urgent });
  });

  return r;
}

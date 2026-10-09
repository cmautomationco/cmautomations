import { serverBase } from '../../lib/links.js';
import { config } from '../../config.js';

/**
 * Delivery adapters. Each takes a prepared message and returns
 * { status, provider_id?, error? }. They never throw.
 *
 *   demo    – nothing leaves the system; the message is shown as “Demo – not sent”
 *   webhook – posts the message to the business's Zapier / Make / custom URL
 *   twilio  – real texts and WhatsApp messages (the business's or the server's Twilio account)
 *   resend  – real email (the business's or the server's Resend account)
 *
 * creds comes from integrations/service.js getCredentials().
 */

export const twilioReady = (creds) => Boolean(creds?.twilio);
export const emailReady = (creds) => Boolean(creds?.email);

/** Which adapter delivers a channel for a business, given its settings and connections. */
export function providerFor(channel, settings, creds) {
  if (channel === 'email') {
    if (emailReady(creds)) return 'resend';
  } else if (twilioReady(creds)) {
    if (channel === 'sms' && settings.business_number) return 'twilio';
    if (channel === 'whatsapp' && (settings.whatsapp_number || settings.business_number)) return 'twilio';
  }
  if (settings.webhook_url) return 'webhook';
  return 'demo';
}

async function viaWebhook(msg, settings) {
  try {
    const res = await fetch(settings.webhook_url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: msg.channel, to: msg.to_addr, from: msg.from_addr, subject: msg.subject, body: msg.body, message_id: msg.id }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? { status: 'sent', provider_id: null } : { status: 'failed', error: `Webhook responded ${res.status}` };
  } catch (err) {
    return { status: 'failed', error: `Webhook unreachable: ${err.message}` };
  }
}

/** Twilio's most common error codes, in plain English. */
const TWILIO_ERRORS = {
  21211: 'That isn’t a valid mobile number',
  21408: 'Your Twilio account isn’t allowed to text this country (Twilio → Messaging → Geo permissions)',
  21606: 'The “from” number can’t send texts – check the business number in Settings',
  21608: 'Twilio trial accounts can only text numbers verified in Twilio',
  21610: 'This person replied STOP to your number, so Twilio won’t deliver texts to them',
  21614: 'That number can’t receive texts (it may be a landline)',
  63007: 'Your WhatsApp number isn’t set up as a WhatsApp sender in Twilio yet',
  63016: 'WhatsApp only allows free-text messages within 24 hours of the customer’s last message – add an approved template for this message',
  63024: 'This person can’t be reached on WhatsApp',
};

async function viaTwilio(msg, twilio, extra = {}) {
  const prefix = msg.channel === 'whatsapp' ? 'whatsapp:' : '';
  const form = new URLSearchParams({ To: `${prefix}${msg.to_addr}`, From: `${prefix}${msg.from_addr}` });
  if (extra.contentSid) {
    form.set('ContentSid', extra.contentSid);
    form.set('ContentVariables', JSON.stringify(extra.contentVariables || {}));
  } else {
    form.set('Body', msg.body);
  }
  if (/^https:\/\//.test(config.publicUrl)) form.set('StatusCallback', `${serverBase()}/api/hooks/twilio/status`);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${btoa(`${twilio.accountSid}:${twilio.authToken}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: 'failed', error: TWILIO_ERRORS[data.code] || data.message || `Twilio responded ${res.status}` };
    return { status: 'sent', provider_id: data.sid || null };
  } catch (err) {
    return { status: 'failed', error: `Twilio unreachable: ${err.message}` };
  }
}

async function viaResend(msg, settings, email) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${email.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `${(settings.email_from_name || 'Notifications').replace(/[<>"]/g, '')} <${email.from}>`,
        to: [msg.to_addr],
        subject: msg.subject || '(no subject)',
        text: msg.body,
        ...(settings.email_reply_to ? { reply_to: settings.email_reply_to } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: 'failed', error: data.message || `Email service responded ${res.status}` };
    return { status: 'sent', provider_id: data.id || null };
  } catch (err) {
    return { status: 'failed', error: `Email service unreachable: ${err.message}` };
  }
}

export async function deliver(provider, msg, settings, extra, creds) {
  switch (provider) {
    case 'twilio': return creds?.twilio ? viaTwilio(msg, creds.twilio, extra) : { status: 'failed', error: 'Twilio isn’t connected' };
    case 'resend': return creds?.email ? viaResend(msg, settings, creds.email) : { status: 'failed', error: 'Email isn’t connected' };
    case 'webhook': return viaWebhook(msg, settings);
    default: return { status: 'demo', provider_id: null };
  }
}

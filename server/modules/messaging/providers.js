import { config } from '../../config.js';

/**
 * Delivery adapters. Each takes a prepared message and returns
 * { status, provider_id?, error? }. They never throw.
 *
 *   demo    – nothing leaves the system; the message is shown as “Demo – not sent”
 *   webhook – posts the message to the business's Zapier / Make / custom URL
 *   twilio  – real texts and WhatsApp messages (needs TWILIO_* settings)
 *   resend  – real email (needs RESEND_API_KEY and EMAIL_FROM)
 */

export const twilioReady = () => Boolean(config.twilioAccountSid && config.twilioAuthToken);
export const emailReady = () => Boolean(config.resendApiKey && config.emailFrom);

/** Which adapter delivers a channel for a business, given its settings. */
export function providerFor(channel, settings) {
  if (channel === 'email') {
    if (emailReady()) return 'resend';
  } else if (twilioReady()) {
    if (channel === 'sms' && settings.business_number) return 'twilio';
    if (channel === 'whatsapp' && settings.whatsapp_number) return 'twilio';
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

async function viaTwilio(msg, extra = {}) {
  const prefix = msg.channel === 'whatsapp' ? 'whatsapp:' : '';
  const form = new URLSearchParams({ To: `${prefix}${msg.to_addr}`, From: `${prefix}${msg.from_addr}` });
  if (extra.contentSid) {
    form.set('ContentSid', extra.contentSid);
    form.set('ContentVariables', JSON.stringify(extra.contentVariables || {}));
  } else {
    form.set('Body', msg.body);
  }
  form.set('StatusCallback', `${config.publicUrl}/api/hooks/twilio/status`);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${btoa(`${config.twilioAccountSid}:${config.twilioAuthToken}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: 'failed', error: data.message || `Twilio responded ${res.status}` };
    return { status: 'sent', provider_id: data.sid || null };
  } catch (err) {
    return { status: 'failed', error: `Twilio unreachable: ${err.message}` };
  }
}

async function viaResend(msg, settings) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `${settings.email_from_name || 'Notifications'} <${config.emailFrom}>`,
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

export async function deliver(provider, msg, settings, extra) {
  switch (provider) {
    case 'twilio': return viaTwilio(msg, extra);
    case 'resend': return viaResend(msg, settings);
    case 'webhook': return viaWebhook(msg, settings);
    default: return { status: 'demo', provider_id: null };
  }
}

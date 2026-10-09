import { serverBase } from '../../lib/links.js';
import { config } from '../../config.js';
import { decryptSecret, encryptSecret, maskSecret, secretsAvailable } from '../../lib/secrets.js';
import { badRequest } from '../../lib/util.js';

/**
 * Connections to the outside services that make the system work for real:
 *   twilio – phone number, texts, WhatsApp and calls
 *   stripe – card payments (paid straight into the business's own account)
 *   email  – sending email through Resend
 *
 * Each business can connect its own accounts (stored encrypted). Anything it
 * hasn't connected falls back to the server's own keys from .env, which suits
 * a single business or an agency that runs the phone numbers for its clients.
 */

export const KINDS = ['twilio', 'stripe', 'email'];
const metaKey = (kind) => `secret:${kind}`;

function readStored(db, orgId, kind) {
  const row = db.get('SELECT value FROM org_meta WHERE org_id = ? AND key = ?', orgId, metaKey(kind));
  if (!row) return null;
  const json = decryptSecret(row.value);
  if (!json) return { broken: true };
  try { return JSON.parse(json); } catch { return { broken: true }; }
}

/** The keys to use for a business: its own, or the server's. */
export function getCredentials(db, orgId) {
  const own = Object.fromEntries(KINDS.map((k) => [k, orgId ? readStored(db, orgId, k) : null]));
  const twilio = own.twilio?.accountSid && own.twilio?.authToken
    ? { accountSid: own.twilio.accountSid, authToken: own.twilio.authToken, source: 'business' }
    : config.twilioAccountSid && config.twilioAuthToken ? { accountSid: config.twilioAccountSid, authToken: config.twilioAuthToken, source: 'server' } : null;
  const stripe = own.stripe?.secretKey
    ? { secretKey: own.stripe.secretKey, webhookSecret: own.stripe.webhookSecret || '', source: 'business' }
    : config.stripeSecretKey ? { secretKey: config.stripeSecretKey, webhookSecret: config.stripeWebhookSecret, source: 'server' } : null;
  const apiKey = own.email?.apiKey || config.resendApiKey;
  const from = own.email?.from || config.emailFrom;
  const email = apiKey && from ? { apiKey, from, source: own.email?.apiKey ? 'business' : 'server', fromSource: own.email?.from ? 'business' : 'server' } : null;
  return { twilio, stripe, email, broken: KINDS.filter((k) => own[k]?.broken) };
}

const TWILIO_SID = /^AC[0-9a-f]{32}$/i;
const STRIPE_KEY = /^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/;
const STRIPE_WEBHOOK = /^whsec_[A-Za-z0-9+/=]{10,}$/;
const RESEND_KEY = /^re_[A-Za-z0-9_]{10,}$/;
const EMAIL = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

/** Saves (part of) a business's connection, keeping what isn't being changed. */
export function saveCredentials(db, orgId, kind, input = {}) {
  if (!KINDS.includes(kind)) throw badRequest('Unknown connection');
  if (!secretsAvailable()) throw badRequest('Keys can only be connected on the live server – the test build can’t send real messages or take payments.');
  const current = readStored(db, orgId, kind);
  const next = current && !current.broken ? { ...current } : {};
  const clean = (v) => (v == null ? undefined : String(v).trim());
  if (kind === 'twilio') {
    const sid = clean(input.accountSid);
    const token = clean(input.authToken);
    if (sid !== undefined) { if (!TWILIO_SID.test(sid)) throw badRequest('The Account SID starts with AC and is 34 characters (Twilio console → Account info)'); next.accountSid = sid; }
    if (token !== undefined && token !== '') { if (!/^[0-9a-f]{32}$/i.test(token)) throw badRequest('The Auth Token is 32 letters and numbers (Twilio console → Account info)'); next.authToken = token; }
    if (!next.accountSid || !next.authToken) throw badRequest('Add both the Account SID and the Auth Token');
  }
  if (kind === 'stripe') {
    const key = clean(input.secretKey);
    const hook = clean(input.webhookSecret);
    if (key !== undefined && key !== '') { if (!STRIPE_KEY.test(key)) throw badRequest('The secret key starts with sk_live_ (or sk_test_ for testing) – Stripe → Developers → API keys'); next.secretKey = key; }
    if (hook !== undefined && hook !== '') { if (!STRIPE_WEBHOOK.test(hook)) throw badRequest('The signing secret starts with whsec_'); next.webhookSecret = hook; }
    if (!next.secretKey) throw badRequest('Add the Stripe secret key');
  }
  if (kind === 'email') {
    const key = clean(input.apiKey);
    const from = clean(input.from);
    if (key !== undefined && key !== '') { if (!RESEND_KEY.test(key)) throw badRequest('The Resend API key starts with re_'); next.apiKey = key; }
    if (from !== undefined) { if (from && !EMAIL.test(from)) throw badRequest('Enter the address emails come from, e.g. bookings@yourbusiness.co.uk'); next.from = from || undefined; }
    if (!next.apiKey && !next.from) throw badRequest('Add an API key or a from address');
  }
  db.run(`INSERT INTO org_meta (org_id, key, value) VALUES (?, ?, ?) ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value`, orgId, metaKey(kind), encryptSecret(JSON.stringify(next)));
  return connectionStatus(db, orgId)[kind];
}

export function removeCredentials(db, orgId, kind) {
  if (!KINDS.includes(kind)) throw badRequest('Unknown connection');
  db.run('DELETE FROM org_meta WHERE org_id = ? AND key = ?', orgId, metaKey(kind));
}

/** What the Settings screen shows – never the keys themselves. */
export function connectionStatus(db, orgId) {
  const c = getCredentials(db, orgId);
  const own = Object.fromEntries(KINDS.map((k) => [k, readStored(db, orgId, k)]));
  return {
    available: secretsAvailable() && !config.demoMode,
    twilio: { connected: Boolean(c.twilio), source: c.twilio?.source || null, account: c.twilio ? maskSecret(c.twilio.accountSid) : '', broken: Boolean(own.twilio?.broken) },
    stripe: { connected: Boolean(c.stripe), source: c.stripe?.source || null, key: c.stripe ? maskSecret(c.stripe.secretKey) : '', mode: c.stripe ? (c.stripe.secretKey.includes('_live_') ? 'live' : 'test') : null, webhook: Boolean(c.stripe?.webhookSecret), broken: Boolean(own.stripe?.broken) },
    email: { connected: Boolean(c.email), source: c.email?.source || null, from: c.email?.from || own.email?.from || '', key: c.email ? maskSecret(c.email.apiKey) : '', broken: Boolean(own.email?.broken) },
  };
}

// ───────────────────────── Talking to the services ─────────────────────────

const basic = (sid, token) => `Basic ${btoa(`${sid}:${token}`)}`;

async function call(url, { method = 'GET', headers = {}, form, json } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: { ...headers, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : json ? { 'content-type': 'application/json' } : {}) },
      body: form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: {}, error: err.message };
  }
}

const unreachable = (name, r) => `Couldn’t reach ${name} (${r.error || `status ${r.status}`}). Check the server can make outbound internet connections.`;

/** Checks a Twilio account and the business's numbers, and whether calls/texts reach this system. */
export async function checkTwilio(creds, numbers = []) {
  if (!creds) return { ok: false, message: 'Not connected' };
  const acct = await call(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}.json`, { headers: { authorization: basic(creds.accountSid, creds.authToken) } });
  if (acct.status === 401 || acct.status === 404) return { ok: false, message: 'Twilio rejected the Account SID or Auth Token – copy them again from the Twilio console.' };
  if (!acct.ok) return { ok: false, message: acct.status ? `Twilio said: ${acct.data.message || acct.status}` : unreachable('Twilio', acct) };
  const result = { ok: acct.data.status === 'active', account: acct.data.friendly_name, trial: acct.data.type === 'Trial', numbers: [] };
  if (acct.data.status !== 'active') result.message = `The Twilio account is ${acct.data.status}.`;
  const base = apiBase();
  for (const number of [...new Set(numbers.filter(Boolean))]) {
    const r = await call(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`, { headers: { authorization: basic(creds.accountSid, creds.authToken) } });
    const found = r.data.incoming_phone_numbers?.[0];
    result.numbers.push(found
      ? { number, found: true, sid: found.sid, voice: found.voice_url === `${base}/api/hooks/twilio/voice`, sms: found.sms_url === `${base}/api/hooks/twilio/messages` }
      : { number, found: false });
  }
  if (result.trial) result.warning = 'This is a Twilio trial account: it can only text and call numbers you have verified in Twilio, and messages start “Sent from your Twilio trial account”. Upgrade the account before going live.';
  return result;
}

/** Points the business's Twilio numbers at this system (calls, texts and delivery receipts). */
export async function configureTwilioNumbers(creds, numbers) {
  const base = apiBase();
  if (!/^https:\/\//.test(base)) return { ok: false, message: 'PUBLIC_URL must be your live https address before Twilio can reach this system.' };
  const done = [];
  for (const n of (await checkTwilio(creds, numbers)).numbers || []) {
    if (!n.found) { done.push({ number: n.number, ok: false, message: 'Not a number in this Twilio account' }); continue; }
    const r = await call(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers/${n.sid}.json`, {
      method: 'POST', headers: { authorization: basic(creds.accountSid, creds.authToken) },
      form: { VoiceUrl: `${base}/api/hooks/twilio/voice`, VoiceMethod: 'POST', SmsUrl: `${base}/api/hooks/twilio/messages`, SmsMethod: 'POST' },
    });
    done.push({ number: n.number, ok: r.ok, message: r.ok ? 'Calls and texts now come to this system' : r.data.message || unreachable('Twilio', r) });
  }
  return { ok: done.length > 0 && done.every((d) => d.ok), numbers: done };
}

/** Checks a Stripe key and whether the account can take payments. */
export async function checkStripe(creds) {
  if (!creds) return { ok: false, message: 'Not connected' };
  const r = await call('https://api.stripe.com/v1/account', { headers: { authorization: `Bearer ${creds.secretKey}` } });
  if (r.status === 401) return { ok: false, message: 'Stripe rejected the secret key – copy it again from Stripe → Developers → API keys.' };
  if (!r.ok) return { ok: false, message: r.status ? `Stripe said: ${r.data.error?.message || r.status}` : unreachable('Stripe', r) };
  const name = r.data.settings?.dashboard?.display_name || r.data.business_profile?.name || r.data.email || r.data.id;
  const out = { ok: Boolean(r.data.charges_enabled), account: name, live: creds.secretKey.includes('_live_'), webhook: Boolean(creds.webhookSecret) };
  if (!r.data.charges_enabled) out.message = 'Stripe hasn’t switched on card payments for this account yet – finish the account set-up in Stripe.';
  if (!out.live) out.warning = 'This is a test key: payments use Stripe’s test cards and no real money moves.';
  return out;
}

/** Creates the Stripe webhook that tells this system when an invoice is paid, and returns its signing secret. */
export async function createStripeWebhook(creds, orgId) {
  const base = apiBase();
  if (!/^https:\/\//.test(base)) return { ok: false, message: 'PUBLIC_URL must be your live https address before Stripe can reach this system.' };
  const r = await call('https://api.stripe.com/v1/webhook_endpoints', {
    method: 'POST', headers: { authorization: `Bearer ${creds.secretKey}` },
    form: { url: `${base}/api/hooks/stripe/${orgId}`, 'enabled_events[0]': 'checkout.session.completed', 'enabled_events[1]': 'checkout.session.async_payment_succeeded', description: 'CM Automations – invoice payments' },
  });
  if (!r.ok) return { ok: false, message: r.data.error?.message || unreachable('Stripe', r) };
  return { ok: true, secret: r.data.secret, url: r.data.url };
}

/** Checks a Resend key and that the "from" domain is verified. */
export async function checkEmail(creds) {
  if (!creds) return { ok: false, message: 'Not connected' };
  const r = await call('https://api.resend.com/domains', { headers: { authorization: `Bearer ${creds.apiKey}` } });
  if (r.status === 401 || r.status === 403) return { ok: false, message: 'Resend rejected the API key (it needs “Full access” to check domains, or create a new key).' };
  if (!r.ok) return { ok: false, message: r.status ? `Resend said: ${r.data.message || r.status}` : unreachable('Resend', r) };
  const domain = creds.from.split('@')[1]?.toLowerCase();
  const match = (r.data.data || []).find((d) => d.name?.toLowerCase() === domain);
  if (!match) return { ok: false, message: `${domain} isn’t added in Resend yet – add it under Domains and copy the DNS records it gives you.` };
  if (match.status !== 'verified') return { ok: false, message: `${domain} is “${match.status}” in Resend – it needs to be verified (check the DNS records) before emails will send.` };
  return { ok: true, account: domain };
}

/** The base address Twilio and Stripe call back on. */
export const apiBase = () => serverBase();

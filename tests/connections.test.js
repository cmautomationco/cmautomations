import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import twilio from 'twilio';
import Stripe from 'stripe';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { decryptSecret, encryptSecret, resetSecretKey } from '../server/lib/secrets.js';
import { twilioSignature, verifyStripe } from '../server/modules/hooks/routes.js';
import { contentVariables, whatsappTemplate } from '../server/modules/messaging/whatsapp.js';
import { TEMPLATES } from '../server/modules/messaging/templates.js';

/**
 * Connections to Twilio, Stripe and Resend. The real services can't be called
 * from the test machine, so their APIs are answered here the way they answer
 * (same URLs, auth and response shapes), and signing is checked against the
 * official Twilio and Stripe libraries.
 */

let server;
let base;
let db;
const saved = { ...config };
const realFetch = globalThis.fetch;
const sent = [];

const TWILIO_SID = `AC${'a1'.repeat(16)}`;
const TWILIO_TOKEN = 'f'.repeat(32);
const STRIPE_KEY = 'sk_test_51abcDEFghiJKLmnop';

/** Answers outbound calls like Twilio, Stripe and Resend would. */
function fakeServices(url, init = {}) {
  const u = new URL(url);
  const auth = init.headers?.authorization || '';
  const body = typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : new URLSearchParams(init.body || '');
  sent.push({ url: String(url), method: init.method || 'GET', auth, body });
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  if (u.host === 'api.twilio.com') {
    if (auth !== `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`) return json(401, { code: 20003, message: 'Authenticate' });
    if (u.pathname.endsWith(`/Accounts/${TWILIO_SID}.json`)) return json(200, { sid: TWILIO_SID, friendly_name: 'Swift Plumbing', status: 'active', type: 'Full' });
    if (u.pathname.endsWith('/IncomingPhoneNumbers.json')) {
      const n = u.searchParams.get('PhoneNumber');
      return json(200, { incoming_phone_numbers: n === '+441174960999' ? [{ sid: 'PN123', phone_number: n, voice_url: 'https://demo.twilio.com/welcome/voice/', sms_url: '' }] : [] });
    }
    if (u.pathname.endsWith('/IncomingPhoneNumbers/PN123.json')) return json(200, { sid: 'PN123', voice_url: body.get('VoiceUrl'), sms_url: body.get('SmsUrl') });
    if (u.pathname.endsWith('/Messages.json')) {
      if (body.get('To') === '+447700900000') return json(400, { code: 21211, message: "The 'To' number is not a valid phone number." });
      return json(201, { sid: `SM${sent.length}`, status: 'queued' });
    }
  }
  if (u.host === 'api.stripe.com') {
    if (auth !== `Bearer ${STRIPE_KEY}`) return json(401, { error: { message: 'Invalid API Key provided' } });
    if (u.pathname === '/v1/account') return json(200, { id: 'acct_1', charges_enabled: true, settings: { dashboard: { display_name: 'Swift Plumbing' } } });
    if (u.pathname === '/v1/webhook_endpoints') return json(200, { id: 'we_1', url: body.get('url'), secret: 'whsec_testsecret1234567890' });
    if (u.pathname === '/v1/checkout/sessions' && init.method === 'POST') return json(200, { id: 'cs_test_abc123', url: 'https://checkout.stripe.com/c/pay/cs_test_abc123' });
    if (u.pathname === '/v1/checkout/sessions/cs_test_abc123') {
      const posted = sent.find((s) => s.url.endsWith('/v1/checkout/sessions') && s.method === 'POST').body;
      return json(200, { id: 'cs_test_abc123', payment_status: 'paid', amount_total: Number(posted.get('line_items[0][price_data][unit_amount]')), payment_intent: 'pi_123', metadata: { invoice_id: posted.get('metadata[invoice_id]'), org_id: posted.get('metadata[org_id]') } });
    }
  }
  if (u.host === 'api.resend.com') {
    if (auth !== 'Bearer re_testkey_12345') return json(401, { message: 'API key is invalid' });
    if (u.pathname === '/domains') return json(200, { data: [{ name: 'swiftplumbing.co.uk', status: 'verified' }] });
    if (u.pathname === '/emails') return json(200, { id: 'email_1' });
  }
  return realFetch(url, init);
}

before(() => {
  config.requirePasswords = true;
  config.appSecret = 'test-app-secret';
  resetSecretKey();
  db = openDatabase(':memory:');
  server = createApp(db).app.listen(0);
  base = `http://localhost:${server.address().port}`;
  config.publicUrl = 'https://app.example.com';
  globalThis.fetch = (url, init) => fakeServices(url, init);
});
after(() => { globalThis.fetch = realFetch; Object.assign(config, saved); resetSecretKey(); server.close(); });

const call = async (method, path, body, token) => {
  const res = await realFetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

describe('official libraries agree with this system', () => {
  test('Twilio request signatures match twilio.validateRequest', () => {
    const url = 'https://app.example.com/api/hooks/twilio/messages';
    const params = { From: 'whatsapp:+447700900616', To: 'whatsapp:+441174960123', Body: 'Leak – café £5 & more', NumMedia: '0', ProfileName: 'Ravi' };
    const ours = twilioSignature('authtoken123', url, params);
    assert.equal(twilio.validateRequest('authtoken123', ours, url, params), true);
    assert.equal(twilio.getExpectedTwilioSignature('authtoken123', url, params), ours);
  });

  test('Stripe webhook signatures made by the Stripe library are accepted, and changed ones refused', () => {
    const stripe = new Stripe('sk_test_x');
    const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_abc' });
    assert.equal(verifyStripe(payload, header, 'whsec_abc'), true);
    assert.equal(verifyStripe(`${payload} `, header, 'whsec_abc'), false);
    assert.equal(verifyStripe(payload, header, 'whsec_other'), false);
    // And Stripe's own check accepts the same event.
    assert.equal(stripe.webhooks.constructEvent(payload, header, 'whsec_abc').id, 'evt_1');
  });
});

describe('WhatsApp templates', () => {
  test('every message becomes a template Meta accepts: numbered, no empty, adjacent or edge placeholders', () => {
    for (const [key, t] of Object.entries(TEMPLATES)) {
      const { text, variables } = whatsappTemplate(t.body);
      assert.ok(!/^\{\{\d+\}\}/.test(text) && !/\{\{\d+\}\}$/.test(text), `${key} starts or ends with a placeholder`);
      assert.ok(!/\}\}\{\{/.test(text), `${key} has adjacent placeholders`);
      assert.deepEqual([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])).filter((n, i, a) => a.indexOf(n) === i), variables.map((_, i) => i + 1), key);
    }
    const reminder = whatsappTemplate(TEMPLATES.booking_reminder_24h.body);
    assert.equal(reminder.variables[0], 'first_name');
    const values = contentVariables(TEMPLATES.booking_reminder_24h.body, { first_name: '', service: 'Boiler service', date: 'Fri 9 Oct', time: '10am', address: '', business: 'Swift' });
    assert.equal(values['1'], 'there', 'empty names are filled so WhatsApp accepts them');
    assert.ok(Object.values(values).every((v) => v.trim()));
  });
});

describe('connections', () => {
  let token;
  let orgId;
  before(async () => {
    const reg = await call('POST', '/auth/register', { name: 'Dave', email: 'dave@conn.test', password: 'password123', business_name: 'Conn Plumbing', niche: 'local_services' });
    token = reg.body.token;
    orgId = reg.body.org.id;
    await call('PUT', '/messages/settings', { business_number: '0117 496 0999', whatsapp_number: '0117 496 0999', forward_to: '07700 900111' }, token);
  });

  test('keys are validated, stored encrypted and never shown again', async () => {
    assert.equal((await call('PUT', '/integrations/twilio', { accountSid: 'nope', authToken: TWILIO_TOKEN }, token)).status, 400);
    const saved = await call('PUT', '/integrations/twilio', { accountSid: TWILIO_SID, authToken: TWILIO_TOKEN }, token);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.connected, true);
    assert.equal(saved.body.source, 'business');
    const stored = db.get(`SELECT value FROM org_meta WHERE org_id = ? AND key = 'secret:twilio'`, orgId).value;
    assert.ok(stored.startsWith('enc:v1:'));
    assert.ok(!stored.includes(TWILIO_TOKEN));
    assert.equal(JSON.parse(decryptSecret(stored)).authToken, TWILIO_TOKEN);
    const status = await call('GET', '/integrations', null, token);
    assert.ok(!JSON.stringify(status.body).includes(TWILIO_TOKEN));
    assert.equal(status.body.setup.voice_url, 'https://app.example.com/api/hooks/twilio/voice');
    assert.equal(status.body.setup.stripe_webhook_url, `https://app.example.com/api/hooks/stripe/${orgId}`);
    assert.ok(encryptSecret('x') !== encryptSecret('x'), 'each value gets its own nonce');
  });

  test('the Twilio check finds the account and the number, and points the number at this system', async () => {
    const check = await call('POST', '/integrations/twilio/check', {}, token);
    assert.equal(check.body.ok, true);
    assert.equal(check.body.account, 'Swift Plumbing');
    assert.deepEqual(check.body.numbers[0], { number: '+441174960999', found: true, sid: 'PN123', voice: false, sms: false });
    const connect = await call('POST', '/integrations/twilio/connect-numbers', {}, token);
    assert.equal(connect.body.ok, true, JSON.stringify(connect.body));
    const update = sent.findLast((s) => s.url.endsWith('/IncomingPhoneNumbers/PN123.json'));
    assert.equal(update.body.get('VoiceUrl'), 'https://app.example.com/api/hooks/twilio/voice');
    assert.equal(update.body.get('SmsUrl'), 'https://app.example.com/api/hooks/twilio/messages');
  });

  test('a test message really goes to Twilio with the business’s own account, and Twilio errors are explained', async () => {
    const ok = await call('POST', '/integrations/test-message', { channel: 'whatsapp', to: '07700 900222' }, token);
    assert.equal(ok.body.status, 'sent', JSON.stringify(ok.body));
    const req = sent.findLast((s) => s.url.endsWith('/Messages.json'));
    assert.equal(req.url, `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`);
    assert.equal(req.body.get('To'), 'whatsapp:+447700900222');
    assert.equal(req.body.get('From'), 'whatsapp:+441174960999');
    assert.equal(req.body.get('StatusCallback'), 'https://app.example.com/api/hooks/twilio/status');
    const bad = await call('POST', '/integrations/test-message', { channel: 'sms', to: '07700 900000' }, token);
    assert.equal(bad.body.status, 'failed');
    assert.equal(bad.body.error, 'That isn’t a valid mobile number');
  });

  test('incoming WhatsApp messages are checked with the business’s own Twilio token', async () => {
    const params = { From: 'whatsapp:+447700900333', To: 'whatsapp:+441174960999', Body: 'Hi, is Friday free?', MessageSid: 'SMin1' };
    const url = 'https://app.example.com/api/hooks/twilio/messages';
    const post = (sig) => realFetch(`${base}/api/hooks/twilio/messages`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig }, body: new URLSearchParams(params).toString() });
    assert.equal((await post(twilioSignature('0'.repeat(32), url, params))).status, 403);
    assert.equal((await post(twilio.getExpectedTwilioSignature(TWILIO_TOKEN, url, params))).status, 200);
    const threads = (await call('GET', '/messages/threads', null, token)).body;
    assert.ok(threads.some((t) => t.phone_e164 === '+447700900333'));
  });

  test('Stripe: check, one-click payment notifications, and payments go to the business’s own account', async () => {
    await call('PUT', '/integrations/stripe', { secretKey: STRIPE_KEY }, token);
    const check = await call('POST', '/integrations/stripe/check', {}, token);
    assert.equal(check.body.ok, true);
    assert.equal(check.body.live, false);
    const hook = await call('POST', '/integrations/stripe/webhook', {}, token);
    assert.equal(hook.body.ok, true, JSON.stringify(hook.body));
    assert.equal(sent.findLast((s) => s.url.endsWith('/v1/webhook_endpoints')).body.get('url'), `https://app.example.com/api/hooks/stripe/${orgId}`);
    assert.equal((await call('GET', '/integrations', null, token)).body.status.stripe.webhook, true);

    const contact = (await call('POST', '/crm/contacts', { first_name: 'Ann', email: 'ann@example.com', source: 'Referral' }, token)).body.contact;
    const inv = (await call('POST', '/invoices', { kind: 'invoice', contact_id: contact.id, line_items: [{ description: 'Repair', quantity: 1, unit_pence: 12000 }] }, token)).body;
    await call('POST', `/invoices/${inv.id}/send`, { channel: 'email' }, token);
    const pay = await call('POST', `/public/doc/${inv.public_token}/pay`, { return_url: 'https://app.example.com/#/doc/x' });
    assert.equal(pay.body.url, 'https://checkout.stripe.com/c/pay/cs_test_abc123');
    const session = sent.findLast((s) => s.url.endsWith('/v1/checkout/sessions') && s.method === 'POST');
    assert.equal(session.auth, `Bearer ${STRIPE_KEY}`, 'the business’s own Stripe account');
    assert.equal(session.body.get('success_url'), 'https://app.example.com/#/doc/x?paid=1&session_id={CHECKOUT_SESSION_ID}');
    // Back from Stripe: the payment is confirmed straight away…
    const confirmed = await call('POST', `/public/doc/${inv.public_token}/confirm-payment`, { session_id: 'cs_test_abc123' });
    assert.equal(confirmed.body.status, 'paid');
    // …and when Stripe's own notification arrives (signed by the Stripe library) it isn't counted twice.
    const event = JSON.stringify({ id: 'evt_2', type: 'checkout.session.completed', data: { object: { id: 'cs_test_abc123', payment_status: 'paid', amount_total: 12000, payment_intent: 'pi_123', metadata: { invoice_id: inv.id, org_id: orgId } } } });
    const header = new Stripe('sk_test_x').webhooks.generateTestHeaderString({ payload: event, secret: 'whsec_testsecret1234567890' });
    const hookRes = await realFetch(`${base}/api/hooks/stripe/${orgId}`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: event });
    assert.equal(hookRes.status, 200);
    const doc = (await call('GET', `/invoices/${inv.id}`, null, token)).body;
    assert.equal(doc.payments.length, 1);
    assert.equal(doc.status, 'paid');
  });

  test('email: the domain must be verified in Resend, then emails go out from the business’s address', async () => {
    assert.equal((await call('PUT', '/integrations/email', { apiKey: 'nope' }, token)).status, 400);
    await call('PUT', '/integrations/email', { apiKey: 're_testkey_12345', from: 'bookings@swiftplumbing.co.uk' }, token);
    const check = await call('POST', '/integrations/email/check', {}, token);
    assert.equal(check.body.ok, true, JSON.stringify(check.body));
    const res = await call('POST', '/integrations/test-message', { channel: 'email', to: 'dave@example.com' }, token);
    assert.equal(res.body.status, 'sent');
    const email = sent.findLast((s) => s.url === 'https://api.resend.com/emails').body;
    assert.match(email.from, /<bookings@swiftplumbing\.co\.uk>$/);
    assert.deepEqual(email.to, ['dave@example.com']);
  });

  test('the test build refuses real keys, and other businesses can’t see or use them', async () => {
    const other = await call('POST', '/auth/register', { name: 'Eve', email: 'eve@conn.test', password: 'password123', business_name: 'Other Co' });
    const status = (await call('GET', '/integrations', null, other.body.token)).body.status;
    assert.equal(status.twilio.connected, false);
    assert.equal(status.stripe.connected, false);
    config.demoMode = true;
    try {
      assert.equal((await call('PUT', '/integrations/stripe', { secretKey: STRIPE_KEY }, token)).status, 400);
    } finally { config.demoMode = false; }
  });
});

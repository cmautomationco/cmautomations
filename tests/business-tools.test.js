import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { computeTotals, runBillingChase } from '../server/modules/billing/service.js';
import { runBookingSchedule } from '../server/modules/bookings/service.js';
import { sendMessage } from '../server/modules/messaging/service.js';
import { twilioSignature, verifyStripe } from '../server/modules/hooks/routes.js';
import { displayPhone, toE164 } from '../server/lib/phone.js';
import { addLocalDays, inQuietHours, localDate, quietHoursEnd, zonedToUtc } from '../server/lib/time.js';
import { scoreAudit } from '../server/modules/agency/audit.js';
import crypto from 'node:crypto';

let server;
let base;
let ctx;
const saved = { ...config };

before(() => {
  config.requirePasswords = true;
  const made = createApp(openDatabase(':memory:'));
  ctx = made.ctx;
  server = made.app.listen(0);
  base = `http://localhost:${server.address().port}`;
  config.publicUrl = base;
});
after(() => { Object.assign(config, saved); server.close(); });

const call = async (method, path, body, token) => {
  const res = await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, body: data, headers: res.headers };
};

async function business(name, niche = 'local_services') {
  const email = `${name.toLowerCase().replace(/[^a-z]/g, '')}@test.com`;
  const reg = await call('POST', '/auth/register', { name: `${name} Owner`, email, password: 'password123', business_name: name, niche });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  return { token: reg.body.token, org: reg.body.org, user: reg.body.user };
}

describe('helpers', () => {
  test('phone numbers are stored in one standard form', () => {
    assert.equal(toE164('07700 900123'), '+447700900123');
    assert.equal(toE164('+44 7700 900123'), '+447700900123');
    assert.equal(toE164('whatsapp:+447700900123'), '+447700900123');
    assert.equal(toE164('0044 7700 900123'), '+447700900123');
    assert.equal(toE164('447700900123'), '+447700900123');
    assert.equal(toE164('020 7946 0123'), '+442079460123');
    assert.equal(toE164('123'), null);
    assert.equal(displayPhone('+447700900123'), '07700 900123');
    assert.equal(displayPhone('+442079460123'), '020 7946 0123');
  });

  test('local times handle the clocks changing', () => {
    // 09:00 in London is 08:00 UTC in summer and 09:00 UTC in winter.
    assert.equal(zonedToUtc('2026-07-01', '09:00', 'Europe/London'), '2026-07-01T08:00:00.000Z');
    assert.equal(zonedToUtc('2026-12-01', '09:00', 'Europe/London'), '2026-12-01T09:00:00.000Z');
    assert.equal(localDate('2026-10-24T23:30:00Z', 'Europe/London'), '2026-10-25');
    assert.equal(addLocalDays('2026-12-31', 1), '2027-01-01');
    assert.equal(inQuietHours('2026-12-01T21:00:00Z', 'Europe/London', '20:00', '08:00'), true);
    assert.equal(inQuietHours('2026-12-01T12:00:00Z', 'Europe/London', '20:00', '08:00'), false);
    assert.equal(quietHoursEnd('2026-12-01T21:00:00Z', 'Europe/London', '08:00'), '2026-12-02T08:00:00.000Z');
  });

  test('quote and invoice totals are worked out in pence, with VAT per line', () => {
    const t = computeTotals([{ description: 'Labour', quantity: 2.5, unit_pence: 4500 }, { description: 'Valve', quantity: 1, unit_pence: 1299, vat_rate: 20 }, { description: '' }], { vat_registered: true, vat_rate: 20 });
    assert.equal(t.items.length, 2);
    assert.equal(t.subtotal_pence, 11250 + 1299);
    assert.equal(t.vat_pence, 2250 + 260);
    assert.equal(t.total_pence, 12549 + 2510);
    assert.equal(computeTotals([{ description: 'x', quantity: 1, unit_pence: 1000 }], { vat_registered: false, vat_rate: 20 }).vat_pence, 0);
  });

  test('Stripe and Twilio signatures are checked', () => {
    const body = '{"type":"checkout.session.completed"}';
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
    assert.equal(verifyStripe(body, `t=${t},v1=${sig}`, 'whsec_test'), true);
    assert.equal(verifyStripe(body, `t=${t},v1=${sig.slice(0, -1)}${sig.endsWith('a') ? 'b' : 'a'}`, 'whsec_test'), false);
    assert.equal(verifyStripe(body, `t=${t - 3600},v1=${crypto.createHmac('sha256', 'whsec_test').update(`${t - 3600}.${body}`).digest('hex')}`, 'whsec_test'), false);
    const a = twilioSignature('token', 'https://x.test/hook', { Body: 'hi', From: '+447700900123' });
    const b = twilioSignature('token', 'https://x.test/hook', { From: '+447700900123', Body: 'hi' });
    assert.equal(a, b);
    assert.notEqual(a, twilioSignature('token', 'https://x.test/hook', { Body: 'hi!', From: '+447700900123' }));
  });

  test('the audit scores tasks, picks quick wins and builds the money case', () => {
    const analysis = scoreAudit({
      hourly_cost_pence: 3000, setup_fee_pence: 100000, monthly_fee_pence: 20000,
      discovery: { missed_calls_per_week: 8, avg_job_value: 180, no_shows_per_month: 4 },
      tasks: [
        { key: 'missed_calls', name: 'Returning missed calls', per_week: 10, minutes: 6, people: 1, pain: 5, selected: true },
        { key: 'chasing', name: 'Chasing unpaid invoices', per_week: 4, minutes: 15, people: 1, pain: 4, selected: true },
        { key: 'social_posting', name: 'Social', per_week: 4, minutes: 45, people: 1, pain: 2, selected: true },
        { key: 'reporting', name: 'Numbers', per_week: 1, minutes: 60, selected: false },
      ],
    });
    assert.equal(analysis.tasks.length, 3);
    assert.ok(analysis.quick_wins.includes('missed_calls'));
    assert.ok(!analysis.quick_wins.includes('social_posting'), 'bigger builds are not quick wins');
    assert.equal(analysis.hours_now_per_week, 1 + 1 + 3);
    assert.ok(analysis.revenue_recovered_monthly_pence > 0);
    assert.ok(analysis.payback_months > 0);
    assert.ok(analysis.assumptions.length >= 3);
  });
});

describe('messages, calls and WhatsApp', () => {
  let biz;
  before(async () => { biz = await business('Swift Plumbing'); });

  test('phone settings store numbers in standard form and show the webhook addresses', async () => {
    const res = await call('PUT', '/messages/settings', { business_number: '0117 496 0000', whatsapp_number: '07700 900999', forward_to: '07700 900111', alert_channel: 'whatsapp', review_link: 'https://g.page/r/test' }, biz.token);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.business_number, '+441174960000');
    assert.equal(res.body.forward_to, '+447700900111');
    const got = await call('GET', '/messages/settings', null, biz.token);
    assert.match(got.body.setup.voice_url, /\/api\/hooks\/twilio\/voice$/);
    assert.match(got.body.setup.whatsapp_link, /^https:\/\/wa\.me\/447700900999/);
    assert.equal(got.body.status.mode, 'demo');
    assert.equal((await call('PUT', '/messages/settings', { business_number: 'not a number' }, biz.token)).status, 400);
  });

  test('a WhatsApp enquiry creates the contact, a reply task and a team alert – emergencies are flagged', async () => {
    const res = await call('POST', '/messages/simulate/inbound', { channel: 'whatsapp', from: '07700 900555', name: 'Hannah Price', body: 'Hi, I have a burst pipe under the sink and water everywhere!' }, biz.token);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.urgent, true);
    assert.equal(res.body.contact.first_name, 'Hannah');
    assert.equal(res.body.contact.phone_e164, '+447700900555');
    assert.equal(res.body.contact.whatsapp_opt_in, 1);
    const tasks = (await call('GET', '/tasks', null, biz.token)).body;
    const task = tasks.find((t) => t.title.startsWith('🚨 Emergency: reply to Hannah Price'));
    assert.ok(task, 'urgent reply task created');
    assert.equal(task.priority, 'urgent');
    const alerts = (await call('GET', '/messages/alerts', null, biz.token)).body;
    assert.ok(alerts.some((a) => a.to_addr === '+447700900111' && a.channel === 'whatsapp' && a.body.includes('EMERGENCY')), 'alert sent to the forwarding mobile');
    const threads = (await call('GET', '/messages/threads', null, biz.token)).body;
    assert.equal(threads[0].first_name, 'Hannah');
    assert.equal(threads[0].unread, 1);
    assert.equal(threads[0].urgent, 1);
  });

  test('replying from the inbox sends on WhatsApp and closes the reply task', async () => {
    const thread = (await call('GET', '/messages/threads', null, biz.token)).body.find((t) => t.first_name === 'Hannah');
    const open = await call('GET', `/messages/threads/${thread.id}`, null, biz.token);
    assert.equal(open.body.channels.best, 'whatsapp');
    assert.equal(open.body.messages[0].direction, 'in');
    assert.equal(open.body.messages[1].template_key, 'emergency_ack', 'emergencies get an instant “we’ve got this” reply');
    const sent = await call('POST', `/messages/threads/${thread.id}/send`, { body: 'Turn the stopcock off under the sink – Dave is on his way now.' }, biz.token);
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.equal(sent.body.channel, 'whatsapp');
    assert.equal(sent.body.status, 'demo');
    const tasks = (await call('GET', '/tasks', null, biz.token)).body;
    assert.equal(tasks.find((t) => t.title.startsWith('🚨 Emergency: reply to Hannah')).status, 'done');
    assert.equal((await call('GET', '/messages/threads?filter=unread', null, biz.token)).body.length, 0);
  });

  test('a missed call is texted straight back once, with a call-back task', async () => {
    const first = await call('POST', '/messages/simulate/missed-call', { from: '07700 900777' }, biz.token);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.call.texted_back, 1);
    assert.equal(first.body.textBack.channel, 'sms');
    assert.match(first.body.textBack.body, /sorry we missed your call/i);
    assert.match(first.body.textBack.body, /#\/book\/swift-plumbing/);
    // Ringing again a minute later doesn't send a second text or a second task.
    const second = await call('POST', '/messages/simulate/missed-call', { from: '+447700900777' }, biz.token);
    assert.equal(second.body.call.texted_back, 0);
    const calls = (await call('GET', '/messages/calls', null, biz.token)).body;
    assert.equal(calls.filter((c) => c.from_number === '+447700900777').length, 2);
    const tasks = (await call('GET', '/tasks', null, biz.token)).body.filter((t) => t.title.startsWith('Call back') && t.status !== 'done');
    assert.equal(tasks.length, 1);
    const handled = await call('POST', `/messages/calls/${calls[0].id}/handled`, {}, biz.token);
    assert.equal(handled.status, 200);
  });

  test('STOP opts out of texts and WhatsApp; START opts back in', async () => {
    await call('POST', '/messages/simulate/inbound', { channel: 'sms', from: '07700 900888', body: 'Do you fit combi boilers?' }, biz.token);
    const stop = await call('POST', '/messages/simulate/inbound', { channel: 'sms', from: '07700 900888', body: 'STOP' }, biz.token);
    assert.equal(stop.body.handled, 'opted_out');
    const contactId = stop.body.contact.id;
    const thread = (await call('GET', `/messages/threads/${contactId}`, null, biz.token)).body;
    assert.equal(thread.contact.sms_opt_out, 1);
    assert.match(thread.messages.at(-1).body, /won’t receive any more texts/);
    // Automatic customer messages are now blocked.
    const blocked = await sendMessage(ctx, biz.org.id, { contactId, channel: 'sms', template: 'new_lead_welcome' });
    assert.equal(blocked.message.status, 'blocked');
    const start = await call('POST', '/messages/simulate/inbound', { channel: 'sms', from: '07700 900888', body: 'start' }, biz.token);
    assert.equal(start.body.handled, 'opted_in');
  });

  test('message wording can be edited per business and reset', async () => {
    const edit = await call('PUT', '/messages/templates/missed_call', { body: 'Sorry{{first_name_spaced}}! On a job – reply here. {{business}}' }, biz.token);
    assert.equal(edit.body.customised, true);
    const missed = await call('POST', '/messages/simulate/missed-call', { from: '07700 900321' }, biz.token);
    assert.equal(missed.body.textBack.body, 'Sorry! On a job – reply here. Swift Plumbing');
    const reset = await call('DELETE', '/messages/templates/missed_call', null, biz.token);
    assert.equal(reset.body.customised, false);
  });

  test('live sending goes through Twilio, and WhatsApp outside 24 hours falls back to a text', async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    config.twilioAccountSid = 'AC_test';
    config.twilioAuthToken = 'secret';
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('https://api.twilio.com')) {
        calls.push({ url: String(url), body: new URLSearchParams(init.body) });
        return new Response(JSON.stringify({ sid: `SM${calls.length}` }), { status: 201 });
      }
      return realFetch(url, init);
    };
    try {
      const contact = (await call('POST', '/crm/contacts', { first_name: 'Owen', phone: '07700 900444', whatsapp_opt_in: true, source: 'Referral' }, biz.token)).body.contact;
      calls.length = 0; // ignore the automatic welcome
      const res = await sendMessage(ctx, biz.org.id, { contactId: contact.id, channel: 'whatsapp', body: 'Hello', force: true });
      assert.equal(res.message.status, 'sent');
      assert.equal(res.message.channel, 'sms', 'no 24-hour window and no approved template → text instead');
      assert.equal(calls[0].body.get('To'), '+447700900444');
      assert.equal(calls[0].body.get('From'), '+441174960000');
      assert.match(calls[0].url, /Accounts\/AC_test\/Messages\.json$/);
      // Once the customer has written in, WhatsApp is used.
      await call('POST', '/messages/simulate/inbound', { channel: 'whatsapp', from: '07700 900444', body: 'Thanks' }, biz.token);
      calls.length = 0;
      const wa = await sendMessage(ctx, biz.org.id, { contactId: contact.id, channel: 'whatsapp', body: 'Great', force: true });
      assert.equal(wa.message.channel, 'whatsapp');
      assert.equal(calls.at(-1).body.get('To'), 'whatsapp:+447700900444');
      assert.equal(calls.at(-1).body.get('From'), 'whatsapp:+447700900999');
    } finally {
      globalThis.fetch = realFetch;
      config.twilioAccountSid = '';
      config.twilioAuthToken = '';
    }
  });

  test('Twilio webhooks are only accepted with a valid signature', async () => {
    config.twilioAccountSid = 'AC_hook';
    config.twilioAuthToken = 'hook-secret';
    // Replies the system sends go to Twilio's API – answer those like Twilio would.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => (String(url).startsWith('https://api.twilio.com') ? new Response(JSON.stringify({ sid: 'SMreply' }), { status: 201 }) : realFetch(url, init));
    try {
      const params = { From: 'whatsapp:+447700900616', To: 'whatsapp:+447700900999', Body: 'No hot water since this morning', ProfileName: 'Ravi', MessageSid: 'SMhook1', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/media/1', MediaContentType0: 'image/jpeg' };
      const url = `${base}/api/hooks/twilio/messages`;
      const post = (sig) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig }, body: new URLSearchParams(params).toString() });
      assert.equal((await post('bad')).status, 403);
      const ok = await post(twilioSignature('hook-secret', url, params));
      assert.equal(ok.status, 200);
      assert.match(await ok.text(), /<Response>/);
      const thread = (await call('GET', '/messages/threads?q=Ravi', null, biz.token)).body[0];
      assert.ok(thread, 'message landed in the inbox');
      assert.equal(thread.urgent, 1, '“no hot water” is an emergency');
      const conversation = (await call('GET', `/messages/threads/${thread.id}`, null, biz.token)).body.messages;
      assert.match(conversation[0].body, /📷 Photo: https:\/\/api\.twilio\.com\/media\/1/);
      assert.equal(conversation[1].template_key, 'emergency_ack');
      assert.equal(conversation[1].status, 'sent', 'the reply went out through Twilio');

      // Calls ring the forwarding mobile first.
      const vparams = { From: '+447700900617', To: '+441174960000', CallSid: 'CA1' };
      const vurl = `${base}/api/hooks/twilio/voice`;
      const voice = await fetch(vurl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSignature('hook-secret', vurl, vparams) }, body: new URLSearchParams(vparams).toString() });
      const twiml = await voice.text();
      assert.match(twiml, /<Dial timeout="20"/);
      assert.match(twiml, /<Number>\+447700900111<\/Number>/);
      // Nobody answers → text back and voicemail.
      const sparams = { ...vparams, DialCallStatus: 'no-answer' };
      const surl = `${base}/api/hooks/twilio/voice-status`;
      const status = await fetch(surl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSignature('hook-secret', surl, sparams) }, body: new URLSearchParams(sparams).toString() });
      assert.match(await status.text(), /<Record /);
      const calls = (await call('GET', '/messages/calls', null, biz.token)).body;
      assert.ok(calls.some((c) => c.from_number === '+447700900617' && c.texted_back === 1));
    } finally {
      globalThis.fetch = realFetch;
      config.twilioAccountSid = '';
      config.twilioAuthToken = '';
    }
  });
});

describe('lead forms', () => {
  let biz;
  before(async () => { biz = await business('Form Test Co', 'coaching'); });

  test('a website form creates the lead, thanks them and runs the automations', async () => {
    const form = await call('POST', '/forms', { name: 'Website enquiry', title: 'Get a free quote', tags: ['website'], fields: [
      { key: 'first_name', label: 'First name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Mobile', type: 'tel' },
      { key: 'service', label: 'What do you need?', type: 'select', options: 'Coaching, Workshop', required: true },
    ] }, biz.token);
    assert.equal(form.status, 201, JSON.stringify(form.body));
    assert.match(form.body.embed, /<iframe src=".*#\/form\/frm_/);
    const pub = await call('GET', `/public/form/${form.body.id}`);
    assert.equal(pub.body.fields.length, 4);
    assert.equal((await call('POST', `/public/form/${form.body.id}`, { first_name: 'Zoe', email: 'not-an-email', service: 'Coaching' })).status, 400);
    const ok = await call('POST', `/public/form/${form.body.id}`, { first_name: 'Zoe', email: 'zoe@example.com', phone: '07700 900222', service: 'Workshop' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.created, true);
    const contact = (await call('GET', `/crm/contacts/${ok.body.contact_id}`, null, biz.token)).body;
    assert.equal(contact.source, 'Website form');
    assert.deepEqual(contact.tags, ['website']);
    assert.ok(contact.activities.some((a) => a.body.includes('What do you need?: Workshop')));
    assert.ok(contact.tasks.some((t) => t.title.startsWith('Call Zoe')), 'new-lead automation ran');
    const thread = (await call('GET', `/messages/threads/${contact.id}`, null, biz.token)).body;
    assert.equal(thread.messages.length, 1, 'only the form thank-you – no duplicate welcome');
    assert.equal(thread.messages[0].template_key, 'form_thank_you');
    // Bots that fill the hidden field are ignored.
    await call('POST', `/public/form/${form.body.id}`, { first_name: 'Bot', email: 'bot@spam.com', service: 'Coaching', website: 'http://spam' });
    assert.equal((await call('GET', `/forms/${form.body.id}`, null, biz.token)).body.submissions, 1);
  });

  test('a new lead added in the CRM gets the instant welcome message', async () => {
    const res = await call('POST', '/crm/contacts', { first_name: 'Ben', email: 'ben@example.com', source: 'Instagram' }, biz.token);
    const thread = (await call('GET', `/messages/threads/${res.body.contact.id}`, null, biz.token)).body;
    assert.equal(thread.messages[0].template_key, 'new_lead_welcome');
    assert.equal(thread.messages[0].channel, 'email');
    assert.match(thread.messages[0].subject, /Thanks for getting in touch with Form Test Co/);
  });
});

describe('bookings for a trade business', () => {
  let biz;
  let service;
  before(async () => {
    biz = await business('Spark Electrical');
    await call('PUT', '/messages/settings', { business_number: '0117 496 0001', forward_to: '07700 900112', review_link: 'https://g.page/r/spark' }, biz.token);
    const allOpen = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open: true, start: '08:00', end: '18:00' }]));
    const s = await call('PUT', '/bookings/settings', { hours: allOpen, min_notice_hours: 0 }, biz.token);
    assert.equal(s.status, 200, JSON.stringify(s.body));
    service = (await call('POST', '/bookings/services', { name: 'Fault finding call-out', kind: 'callout', duration_min: 60, price_pence: 8500 }, biz.token)).body;
  });

  test('customers book online: contact created, confirmation sent, team alerted, slot taken', async () => {
    const page = await call('GET', '/public/book/spark-electrical');
    assert.equal(page.status, 200);
    assert.equal(page.body.require_address, true);
    assert.match(page.body.emergency_note, /Emergency/);
    assert.equal(page.body.services[0].price, '£85.00');
    const tz = 'Europe/London';
    const date = addLocalDays(localDate(new Date(), tz), 3);
    const slots = (await call('GET', `/public/book/spark-electrical/slots?service=${service.id}&date=${date}`)).body;
    assert.ok(slots.length >= 10);
    const slot = slots.find((s) => s.label === '10am');
    assert.ok(slot);
    const missingAddress = await call('POST', '/public/book/spark-electrical', { service_id: service.id, starts_at: slot.starts_at, first_name: 'Maya', phone: '07700 900301' });
    assert.equal(missingAddress.status, 400);
    const booked = await call('POST', '/public/book/spark-electrical', { service_id: service.id, starts_at: slot.starts_at, first_name: 'Maya', last_name: 'Shah', phone: '07700 900301', address: '4 Elm Road', postcode: 'bs6 5aa', whatsapp_opt_in: true, notes: 'Lights keep tripping' });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    assert.equal(booked.body.status, 'confirmed');
    assert.equal(booked.body.booking.address, '4 Elm Road, BS6 5AA');
    // The same slot can't be booked twice.
    const again = await call('POST', '/public/book/spark-electrical', { service_id: service.id, starts_at: slot.starts_at, first_name: 'Other', phone: '07700 900302', address: '1 Road' });
    assert.equal(again.status, 400);
    const after = (await call('GET', `/public/book/spark-electrical/slots?service=${service.id}&date=${date}`)).body;
    assert.ok(!after.some((s) => s.starts_at === slot.starts_at));

    const list = (await call('GET', `/bookings?from=${date}&to=${addLocalDays(date, 1)}`, null, biz.token)).body;
    assert.equal(list.length, 1);
    const b = (await call('GET', `/bookings/${list[0].id}`, null, biz.token)).body;
    assert.equal(b.messages[0].template_key, 'booking_confirmation');
    assert.equal(b.messages[0].channel, 'whatsapp');
    assert.match(b.messages[0].body, /Reply C to confirm or R/);
    const contact = (await call('GET', `/crm/contacts/${b.contact_id}`, null, biz.token)).body;
    assert.ok(contact.tags.includes('booked'), 'booking automation tagged the contact');
    assert.equal(contact.source, 'Online booking');
    const alerts = (await call('GET', '/messages/alerts', null, biz.token)).body;
    assert.ok(alerts.some((a) => a.to_addr === '+447700900112' && a.body.startsWith('New booking: Fault finding call-out for Maya Shah')));
  });

  test('customers reply C to confirm, and R to pick a new time right there in WhatsApp', async () => {
    const say = async (body) => (await call('POST', '/messages/simulate/inbound', { channel: 'whatsapp', from: '07700 900301', body }, biz.token)).body;
    assert.equal((await say('C')).handled, 'booking_confirmed');
    const before = (await call('GET', '/bookings?from=2000-01-01&to=2100-01-01', null, biz.token)).body.find((b) => b.first_name === 'Maya');
    assert.equal((await say('r')).handled, 'chat_started');
    assert.equal((await call('GET', '/bookings/overview', null, biz.token)).body.counts.reschedule, 1);
    assert.equal((await say('2')).handled, 'chat_continued');
    assert.equal((await say('1')).handled, 'chat_continued');
    const moved = await say('yes');
    assert.equal(moved.handled, 'chat_moved');
    const after = (await call('GET', `/bookings/${before.id}`, null, biz.token)).body;
    assert.notEqual(after.starts_at, before.starts_at);
    assert.equal(after.reschedule_requested, 0);
    assert.ok(after.messages.some((m) => m.template_key === 'booking_moved'));
    const alerts = (await call('GET', '/messages/alerts', null, biz.token)).body;
    assert.ok(alerts.some((a) => a.body.startsWith('Maya Shah moved their booking by WhatsApp')));
    // With the assistant switched off, R makes a task for a person instead.
    await call('PUT', '/bookings/settings', { chat_booking: false }, biz.token);
    assert.equal((await say('R')).handled, 'booking_reschedule');
    await call('PUT', '/bookings/settings', { chat_booking: true }, biz.token);
    const tasks = (await call('GET', '/tasks', null, biz.token)).body;
    assert.ok(tasks.some((t) => t.title.startsWith('Reply to Maya Shah – wants to rearrange')));
    const overview = (await call('GET', '/bookings/overview', null, biz.token)).body;
    assert.equal(overview.counts.reschedule, 1);
    assert.match(overview.calendar_feed, /\/api\/public\/calendar\/spark-electrical\/[a-f0-9]+\.ics$/);
  });

  test('the team books phone jobs, sends “on my way”, finishes the job and the invoice is drafted', async () => {
    const start = new Date(Date.now() + 26 * 3600_000);
    start.setUTCMinutes(0, 0, 0);
    const res = await call('POST', '/bookings', { service_id: service.id, starts_at: start.toISOString(), contact: { first_name: 'Tom', phone: '07700 900303' }, address: '9 Oak St', postcode: 'BS1 1AA', urgency: 'emergency', source: 'phone' }, biz.token);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.booking.id;
    assert.equal(res.body.message.template_key, 'booking_confirmation');
    const otw = await call('POST', `/bookings/${id}/status`, { status: 'on_the_way', eta_minutes: 20 }, biz.token);
    assert.equal(otw.body.booking.status, 'on_the_way');
    assert.match(otw.body.message.body, /is on the way and should be with you around/);
    const done = await call('POST', `/bookings/${id}/status`, { status: 'completed' }, biz.token);
    assert.equal(done.body.booking.status, 'completed');
    assert.ok(done.body.message.send_after, 'review request waits a couple of hours');
    assert.equal(done.body.message.template_key, 'booking_review_request');
    assert.ok(done.body.automations.some((a) => a.automation === 'Job done → draft the invoice'));
    const invoices = (await call('GET', '/invoices?kind=invoice', null, biz.token)).body;
    const inv = invoices.find((i) => i.title === 'Fault finding call-out');
    assert.ok(inv);
    assert.equal(inv.total_pence, 8500);
    assert.equal(inv.status, 'draft');
  });

  test('day-before and 2-hour reminders, job sheet and calendar feed', async () => {
    const tz = 'Europe/London';
    const day = addLocalDays(localDate(new Date(), tz), 4);
    const startsAt = zonedToUtc(day, '11:00', tz);
    const made = await call('POST', '/bookings', { service_id: service.id, starts_at: startsAt, contact: { first_name: 'Rita', phone: '07700 900304' }, address: '2 Hill Rd', source: 'phone' }, biz.token);
    const id = made.body.booking.id;
    // The day before, after the reminder time → day-before reminder.
    await runBookingSchedule(ctx, new Date(zonedToUtc(addLocalDays(day, -1), '10:30', tz)));
    let b = (await call('GET', `/bookings/${id}`, null, biz.token)).body;
    assert.ok(b.reminder_24h_at);
    assert.ok(b.messages.some((m) => m.template_key === 'booking_reminder_24h'));
    // On the day: morning job sheet, then the 2-hour reminder.
    await runBookingSchedule(ctx, new Date(zonedToUtc(day, '07:05', tz)));
    const alerts = (await call('GET', '/messages/alerts', null, biz.token)).body;
    assert.ok(alerts.some((a) => a.body.startsWith('Morning! Today’s jobs') && a.body.includes('11am Fault finding call-out – Rita, 2 Hill Rd')));
    await runBookingSchedule(ctx, new Date(zonedToUtc(day, '09:30', tz)));
    b = (await call('GET', `/bookings/${id}`, null, biz.token)).body;
    assert.ok(b.messages.some((m) => m.template_key === 'booking_reminder_2h'));
    // Calendar feed for Google / Outlook / Apple.
    const settings = (await call('GET', '/bookings/settings', null, biz.token)).body;
    const feed = await fetch(settings.calendar_feed);
    assert.equal(feed.status, 200);
    assert.match(feed.headers.get('content-type'), /text\/calendar/);
    const ics = await feed.text();
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /SUMMARY:Fault finding call-out – Rita/);
    assert.match(ics, /LOCATION:2 Hill Rd/);
    assert.equal((await fetch(settings.calendar_feed.replace(/[a-f0-9]+\.ics$/, 'wrong.ics'))).status, 404);
  });

  test('customers can move or cancel from their link, within the notice period', async () => {
    const tz = 'Europe/London';
    const date = addLocalDays(localDate(new Date(), tz), 5);
    const slots = (await call('GET', `/public/book/spark-electrical/slots?service=${service.id}&date=${date}`)).body;
    const booked = (await call('POST', '/public/book/spark-electrical', { service_id: service.id, starts_at: slots[0].starts_at, first_name: 'Lee', email: 'lee@example.com', address: '7 Ash Way' })).body;
    const moved = await call('POST', `/public/booking/${booked.token}/reschedule`, { starts_at: slots[2].starts_at });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.starts_at, slots[2].starts_at);
    const cancelled = await call('POST', `/public/booking/${booked.token}/cancel`, {});
    assert.equal(cancelled.body.status, 'cancelled');
    assert.equal((await call('POST', `/public/booking/${booked.token}/confirm`, {})).status, 400);
  });

  test('deposits: booking waits for the deposit, paying it confirms the booking', async () => {
    config.demoMode = true;
    try {
      const svc = (await call('POST', '/bookings/services', { name: 'Consumer unit upgrade', kind: 'job', duration_min: 240, price_pence: 45000, deposit_pence: 10000 }, biz.token)).body;
      const date = addLocalDays(localDate(new Date(), 'Europe/London'), 6);
      const slots = (await call('GET', `/public/book/spark-electrical/slots?service=${svc.id}&date=${date}`)).body;
      const booked = (await call('POST', '/public/book/spark-electrical', { service_id: svc.id, starts_at: slots[0].starts_at, first_name: 'Ana', phone: '07700 900305', address: '3 Bay Rd' })).body;
      assert.equal(booked.status, 'requested');
      assert.ok(booked.deposit_token);
      const doc = (await call('GET', `/public/doc/${booked.deposit_token}`)).body;
      assert.equal(doc.purpose, 'deposit');
      assert.equal(doc.balance_pence, 10000);
      assert.equal(doc.card, true);
      assert.deepEqual((await call('POST', `/public/doc/${booked.deposit_token}/pay`, {})).body, { demo: true });
      assert.equal((await call('POST', `/public/doc/${booked.deposit_token}/demo-pay`, {})).body.status, 'paid');
      assert.equal((await call('GET', `/public/booking/${booked.token}`)).body.status, 'confirmed');
      // The final invoice takes the deposit off.
      const list = (await call('GET', `/bookings?from=${date}&to=${addLocalDays(date, 1)}`, null, biz.token)).body;
      const inv = (await call('POST', `/bookings/${list.find((x) => x.service_name === 'Consumer unit upgrade').id}/invoice`, {}, biz.token)).body;
      assert.equal(inv.total_pence, 35000);
    } finally {
      config.demoMode = false;
    }
    // Outside test builds the pretend payment route doesn't exist.
    assert.equal((await call('POST', '/public/doc/anything/demo-pay', {})).status, 404);
  });
});

describe('quotes, invoices and payment chasing', () => {
  let biz;
  let contact;
  before(async () => {
    biz = await business('Bright Builders');
    await call('PUT', '/invoices/settings', { vat_registered: true, vat_number: 'GB123456789', sort_code: '12-34-56', account_number: '12345678', account_name: 'Bright Builders Ltd' }, biz.token);
    contact = (await call('POST', '/crm/contacts', { first_name: 'Nina', last_name: 'Cole', email: 'nina@example.com', phone: '07700 900401', source: 'Referral' }, biz.token)).body.contact;
  });

  test('deal → quote → accepted online → deal won → invoice → paid', async () => {
    const deal = (await call('POST', '/crm/deals', { title: 'Kitchen extension', value: 1200, contact_id: contact.id, stage: 'proposal' }, biz.token)).body;
    const quote = (await call('POST', `/invoices/from-deal/${deal.id}`, { kind: 'quote' }, biz.token)).body;
    assert.equal(quote.number, 'Q-0001');
    assert.equal(quote.total_pence, 144000, '£1,200 + 20% VAT');
    assert.equal((await call('GET', `/public/doc/${quote.public_token}`)).status, 404, 'drafts are private');
    const sent = await call('POST', `/invoices/${quote.id}/send`, {}, biz.token);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.message.template_key, 'quote_sent');
    const pub = (await call('GET', `/public/doc/${quote.public_token}`)).body;
    assert.equal(pub.seller.vat_number, 'GB123456789');
    assert.equal(pub.card, false, 'quotes are accepted, not paid');
    assert.equal((await call('POST', `/public/doc/${quote.public_token}/accept`, { name: 'Nina Cole' })).body.status, 'accepted');
    const deals = (await call('GET', '/crm/deals', null, biz.token)).body;
    assert.equal(deals.find((d) => d.id === deal.id).stage, 'won');
    const tasks = (await call('GET', '/tasks', null, biz.token)).body;
    assert.ok(tasks.some((t) => t.title.startsWith('Book in the work for Nina Cole')));
    const invoice = (await call('POST', `/invoices/${quote.id}/convert`, {}, biz.token)).body;
    assert.equal(invoice.number, 'INV-0001');
    assert.equal(invoice.total_pence, 144000);
    assert.equal((await call('GET', `/invoices/${quote.id}`, null, biz.token)).body.status, 'converted');
    await call('POST', `/invoices/${invoice.id}/send`, {}, biz.token);
    const part = await call('POST', `/invoices/${invoice.id}/payments`, { amount_pence: 44000, method: 'bank_transfer' }, biz.token);
    assert.equal(part.body.doc.status, 'part_paid');
    assert.equal((await call('POST', `/invoices/${invoice.id}/payments`, { amount_pence: 200000 }, biz.token)).status, 400, 'can’t overpay');
    const full = await call('POST', `/invoices/${invoice.id}/payments`, { amount_pence: 100000, method: 'bank_transfer', reference: 'NCOLE' }, biz.token);
    assert.equal(full.body.doc.status, 'paid');
    const doc = (await call('GET', `/invoices/${invoice.id}`, null, biz.token)).body;
    assert.ok(doc.messages.length >= 1);
    const thread = (await call('GET', `/messages/threads/${contact.id}`, null, biz.token)).body;
    assert.ok(thread.messages.some((m) => m.template_key === 'invoice_paid_thanks'));
    const c = (await call('GET', `/crm/contacts/${contact.id}`, null, biz.token)).body;
    assert.equal(c.lifecycle, 'customer');
    assert.ok(c.tags.includes('paid'));
  });

  test('unpaid invoices are chased: friendly, firmer, then a call task for a person', async () => {
    const inv = (await call('POST', '/invoices', { kind: 'invoice', contact_id: contact.id, title: 'Repairs', line_items: [{ description: 'Repair', quantity: 1, unit_pence: 20000 }] }, biz.token)).body;
    await call('POST', `/invoices/${inv.id}/send`, {}, biz.token);
    const due = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    ctx.db.update('invoices', inv.id, { due_date: due });
    const day = (n) => new Date(new Date(`${due}T12:00:00Z`).getTime() + n * 86400_000);
    await runBillingChase(ctx, day(1));
    let doc = (await call('GET', `/invoices/${inv.id}`, null, biz.token)).body;
    assert.equal(doc.status, 'overdue');
    assert.equal(doc.reminders_sent, 1);
    await runBillingChase(ctx, day(3));
    assert.equal((await call('GET', `/invoices/${inv.id}`, null, biz.token)).body.reminders_sent, 1, 'nothing more until day 7');
    await runBillingChase(ctx, day(7));
    await runBillingChase(ctx, day(14));
    doc = (await call('GET', `/invoices/${inv.id}`, null, biz.token)).body;
    assert.equal(doc.reminders_sent, 3);
    const templates = doc.messages.map((m) => m.template_key);
    assert.ok(templates.includes('invoice_reminder_1') && templates.includes('invoice_reminder_2'));
    const tasks = (await call('GET', '/tasks', null, biz.token)).body;
    assert.ok(tasks.some((t) => t.title.startsWith(`Call Nina Cole about unpaid ${inv.number}`) && t.priority === 'urgent'));
    const summary = (await call('GET', '/invoices/summary', null, biz.token)).body;
    assert.equal(summary.overdue_count, 1);
    assert.equal(summary.overdue_pence, 24000);
  });

  test('card payments use Stripe Checkout and are recorded from the signed webhook', async () => {
    const inv = (await call('POST', '/invoices', { kind: 'invoice', contact_id: contact.id, line_items: [{ description: 'Callout', quantity: 1, unit_pence: 5000 }] }, biz.token)).body;
    await call('POST', `/invoices/${inv.id}/send`, {}, biz.token);
    const realFetch = globalThis.fetch;
    let stripeBody;
    config.stripeSecretKey = 'sk_test';
    config.stripeWebhookSecret = 'whsec_x';
    globalThis.fetch = async (url, init) => {
      if (String(url) === 'https://api.stripe.com/v1/checkout/sessions') {
        stripeBody = new URLSearchParams(init.body);
        return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/pay/cs_test_1' }), { status: 200 });
      }
      return realFetch(url, init);
    };
    try {
      const pay = await call('POST', `/public/doc/${inv.public_token}/pay`, {});
      assert.equal(pay.body.url, 'https://checkout.stripe.com/pay/cs_test_1');
      assert.equal(stripeBody.get('line_items[0][price_data][unit_amount]'), '6000');
      assert.equal(stripeBody.get('metadata[invoice_id]'), inv.id);
      const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_status: 'paid', amount_total: 6000, payment_intent: 'pi_1', metadata: { invoice_id: inv.id, org_id: biz.org.id } } } });
      const t = Math.floor(Date.now() / 1000);
      const sig = `t=${t},v1=${crypto.createHmac('sha256', 'whsec_x').update(`${t}.${event}`).digest('hex')}`;
      const post = (s) => realFetch(`${base}/api/hooks/stripe`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': s }, body: event });
      assert.equal((await post('t=1,v1=bad')).status, 400);
      assert.equal((await post(sig)).status, 200);
      assert.equal((await post(sig)).status, 200, 'retries are safe');
      const doc = (await call('GET', `/invoices/${inv.id}`, null, biz.token)).body;
      assert.equal(doc.status, 'paid');
      assert.equal(doc.payments.length, 1);
      assert.equal(doc.payments[0].method, 'card');
    } finally {
      globalThis.fetch = realFetch;
      config.stripeSecretKey = '';
      config.stripeWebhookSecret = '';
    }
  });
});

describe('agency: audit → proposal → client, control centre, branding, reports', () => {
  let agency;
  let token;
  before(async () => {
    const owner = await business('Solo Client Co', 'coaching');
    token = owner.token;
    const made = await call('POST', '/orgs', { name: 'CM Automations Agency', kind: 'agency' }, token);
    assert.equal(made.status, 201);
    agency = made.body;
    await call('POST', '/auth/switch', { org_id: agency.id }, token);
  });

  test('the audit builds a scored, branded proposal the client accepts online', async () => {
    const audit = (await call('POST', '/agency/audits', { client_name: 'Pipe Pros', contact_name: 'Gary Mills', contact_email: 'gary@pipepros.co.uk', niche: 'local_services' }, token)).body;
    assert.ok(audit.tasks.length > 10, 'starts with the suggested task list');
    assert.equal(audit.tasks[0].selected, true);
    const patched = await call('PATCH', `/agency/audits/${audit.id}`, { discovery: { missed_calls_per_week: 10, avg_job_value: 220, frustrations: 'Evenings spent on quotes and invoices' }, setup_fee_pence: 120000, monthly_fee_pence: 25000 }, token);
    assert.equal(patched.status, 200);
    const analysed = (await call('POST', `/agency/audits/${audit.id}/analyse`, {}, token)).body;
    assert.ok(analysed.analysis.hours_saved_per_week > 5);
    assert.ok(analysed.analysis.quick_wins.length >= 3);
    assert.equal(analysed.proposal.title, 'Automation plan for Pipe Pros');
    assert.ok(analysed.proposal.problems.some((p) => p.includes('Evenings spent on quotes')));
    const sent = await call('POST', `/agency/audits/${audit.id}/send`, {}, token);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.message.channel, 'email');
    const pub = (await call('GET', `/public/proposal/${audit.public_token}`)).body;
    assert.equal(pub.proposal.investment.monthly_pence, 25000);
    assert.equal(pub.business.name, 'CM Automations Agency');
    assert.equal((await call('POST', `/public/proposal/${audit.public_token}/accept`, { name: 'Gary Mills' })).body.status, 'accepted');
    const hub = (await call('GET', '/agency/hub', null, token)).body;
    const client = hub.clients.find((c) => c.name === 'Pipe Pros');
    assert.ok(client, 'client business created');
    assert.equal(client.member, true);
    assert.equal(client.monthly_fee_pence, 25000);
    assert.equal(hub.totals.mrr_pence, 25000);
    const tasks = (await call('GET', '/tasks', null, token)).body;
    assert.ok(tasks.some((t) => t.title.startsWith('Kick off Pipe Pros')));
    assert.equal((await call('PATCH', `/agency/audits/${audit.id}`, { client_name: 'Changed' }, token)).status, 400);
  });

  test('each client has its own branding, and the control centre flags what needs attention', async () => {
    const hub = (await call('GET', '/agency/hub', null, token)).body;
    const client = hub.clients.find((c) => c.name === 'Pipe Pros');
    assert.equal((await call('PATCH', `/agency/clients/${client.id}`, { brand: { color: 'blue' } }, token)).status, 400);
    const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const branded = await call('PATCH', `/agency/clients/${client.id}`, { brand: { display_name: 'Pipe Pros Plumbing', color: '#0F766E', logo }, email: 'gary@pipepros.co.uk' }, token);
    assert.equal(branded.status, 200, JSON.stringify(branded.body));
    assert.equal(branded.body.brand.color, '#0f766e');
    await call('POST', '/auth/switch', { org_id: client.id }, token);
    const me = (await call('GET', '/me', null, token)).body;
    assert.equal(me.org.brand.display_name, 'Pipe Pros Plumbing');
    assert.equal(me.agency.name, 'CM Automations Agency');
    assert.equal(me.agency_access, true);
    // Something that needs attention: an urgent customer message.
    await call('POST', '/messages/simulate/inbound', { channel: 'sms', from: '07700 900901', body: 'Water leaking through the ceiling!' }, token);
    const after = (await call('GET', '/agency/hub', null, token)).body.clients.find((c) => c.id === client.id);
    assert.ok(after.attention.some((a) => a.text.includes('unread customer message')));
    assert.ok(after.score < 100);
    await call('POST', '/auth/switch', { org_id: agency.id }, token);
  });

  test('monthly reports are built per client and sent from the agency', async () => {
    const hub = (await call('GET', '/agency/hub', null, token)).body;
    const client = hub.clients.find((c) => c.name === 'Pipe Pros');
    const period = new Date().toISOString().slice(0, 7);
    const report = await call('POST', '/agency/reports', { org_id: client.id, period }, token);
    assert.equal(report.status, 201, JSON.stringify(report.body));
    assert.equal(report.body.data.messages_received, 1);
    assert.ok(report.body.data.highlights.length >= 1);
    assert.match(report.body.summary, /system saved about/);
    const pub = (await call('GET', `/public/report/${report.body.public_token}`)).body;
    assert.equal(pub.business.name, 'Pipe Pros Plumbing');
    assert.equal(pub.agency.name, 'CM Automations Agency');
    const sent = await call('POST', `/agency/reports/${report.body.id}/send`, {}, token);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.report.status, 'sent');
    assert.equal(sent.body.message.to_addr, 'gary@pipepros.co.uk');
    assert.match(sent.body.message.subject, /hours saved/);
  });

  test('people outside the agency can’t see the control centre', async () => {
    const other = await business('Unrelated Ltd', 'coaching');
    assert.equal((await call('GET', '/agency/hub', null, other.token)).status, 403);
    const hub = (await call('GET', '/agency/hub', null, token)).body;
    assert.equal((await call('GET', `/agency/clients/${hub.clients[0].id}`, null, other.token)).status, 403);
  });
});

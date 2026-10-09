import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { followUpAbandoned, pickOption } from '../server/modules/bookings/chat.js';

/** Booking, moving and cancelling entirely by WhatsApp (and text), by replying with numbers. */

let server;
let base;
let db;
let ctx;
let token;
const saved = { ...config };

before(async () => {
  config.requirePasswords = true;
  const made = createApp(openDatabase(':memory:'));
  ({ ctx } = made);
  db = ctx.db;
  server = made.app.listen(0);
  base = `http://localhost:${server.address().port}`;
  config.publicUrl = base;
  const reg = await call('POST', '/auth/register', { name: 'Dave', email: 'dave@wa.test', password: 'password123', business_name: 'WA Plumbing', niche: 'local_services' });
  token = reg.body.token;
  const allOpen = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open: true, start: '08:00', end: '18:00' }]));
  await call('PUT', '/bookings/settings', { hours: allOpen, min_notice_hours: 0 }, token);
  await call('PUT', '/messages/settings', { business_number: '0117 496 0555', whatsapp_number: '0117 496 0555', forward_to: '07700 900100' }, token);
  for (const s of [
    { name: 'Boiler service', kind: 'appointment', duration_min: 60, price_pence: 8500 },
    { name: 'Leak call-out', kind: 'callout', duration_min: 90, price_pence: 9500 },
    { name: 'Radiator fit', kind: 'job', duration_min: 180, price_pence: 22000, deposit_pence: 5000 },
  ]) await call('POST', '/bookings/services', s, token);
});
after(() => { Object.assign(config, saved); server.close(); });

async function call(method, path, body, t) {
  const res = await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const customer = (from, channel = 'whatsapp', name = null) => async (text) => (await call('POST', '/messages/simulate/inbound', { channel, from, body: text, ...(name ? { name } : {}) }, token)).body;
const lastReply = (contactId) => db.get(`SELECT * FROM messages WHERE contact_id = ? AND direction = 'out' ORDER BY created_at DESC, rowid DESC LIMIT 1`, contactId);

describe('choosing from a list', () => {
  const options = [{ label: 'Fri 9 Oct', keys: ['fri'] }, { label: '10am', keys: ['10am', '10', '10:00'] }, { label: 'Boiler service (£85)', keys: ['boiler service'] }];
  test('numbers, words and times are all understood', () => {
    assert.equal(pickOption('2', options).label, '10am');
    assert.equal(pickOption('Fri', options).label, 'Fri 9 Oct');
    assert.equal(pickOption('10:00', options).label, '10am');
    assert.equal(pickOption('boiler', options).label, 'Boiler service (£85)');
    assert.equal(pickOption('7', options), null);
    assert.equal(pickOption('hello', options), null);
  });
});

describe('booking by WhatsApp', () => {
  test('a new customer books a job from start to finish without leaving WhatsApp', async () => {
    const say = customer('07700 900401');
    const start = await say('Hi, can I book a boiler service please');
    assert.equal(start.handled, 'chat_started');
    const contactId = start.contact.id;
    let reply = lastReply(contactId);
    assert.equal(reply.channel, 'whatsapp');
    assert.match(reply.body, /What do you need\? Reply with a number:\n1\. Boiler service \(£85\)\n2\. Leak call-out \(£95\)\n3\. Radiator fit \(£220\)/);

    assert.equal((await say('1')).handled, 'chat_continued');
    assert.match(lastReply(contactId).body, /^Boiler service – which day suits you\? Reply with a number:\n1\. /);
    await say('2');
    reply = lastReply(contactId);
    assert.match(reply.body, /^Times on .+ – reply with a number:\n1\. 8am\n/);
    assert.match(reply.body, /reply 9 for a different day/);
    await say('1');
    assert.equal(lastReply(contactId).template_key, 'chat_ask_name', 'unknown name → asks for it');
    await say('It’s Sam Patel');
    assert.equal(lastReply(contactId).template_key, 'chat_ask_address');
    await say('14 Cotham Hill');
    assert.match(lastReply(contactId).body, /include the postcode/);
    await say('14 Cotham Hill, bs6 6la');
    assert.equal(lastReply(contactId).template_key, 'chat_ask_notes');
    await say('skip');
    reply = lastReply(contactId);
    assert.equal(reply.template_key, 'chat_confirm');
    assert.match(reply.body, /Boiler service\n.+ at 8am\n14 Cotham Hill, BS6 6LA\n\nReply YES to book it/);

    const done = await say('yes');
    assert.equal(done.handled, 'chat_booked');
    const booking = (await call('GET', `/bookings/${done.booking.id}`, null, token)).body;
    assert.equal(booking.source, 'whatsapp');
    assert.equal(booking.status, 'confirmed');
    assert.ok(booking.customer_confirmed_at, 'they chose the time themselves');
    assert.equal(booking.address, '14 Cotham Hill');
    assert.equal(booking.postcode, 'BS6 6LA');
    assert.equal(booking.contact_name, 'Sam Patel');
    assert.ok(booking.messages.some((m) => m.template_key === 'booking_confirmation' && m.channel === 'whatsapp'));
    const alerts = (await call('GET', '/messages/alerts', null, token)).body;
    assert.ok(alerts.some((a) => a.body.startsWith('New booking: Boiler service for Sam Patel')), 'the team is told');
    assert.equal(db.get('SELECT COUNT(*) AS n FROM conversations').n, 0);
    // Nothing for a person to do: the assistant dealt with it.
    const tasks = (await call('GET', '/tasks', null, token)).body.filter((t) => t.title.includes('Sam'));
    assert.equal(tasks.filter((t) => t.status !== 'done').length, 0);
    assert.equal((await call('GET', '/messages/threads?filter=unread', null, token)).body.length, 0);
  });

  test('a service with a deposit sends the payment link, and the booking waits for it', async () => {
    const say = customer('07700 900402', 'whatsapp', 'Jo Bloggs');
    await say('BOOK');
    await say('radiator');
    await say('1');
    await say('2');
    await say('5 High St, BS1 4DJ');
    await say('Old radiator leaking in the hall');
    const done = await say('Yes please');
    assert.equal(done.handled, 'chat_booked');
    assert.equal(done.booking.status, 'requested');
    const reply = lastReply(done.contact.id);
    assert.equal(reply.template_key, 'deposit_request');
    assert.match(reply.body, /£50\.00 deposit here: .*#\/doc\//);
    assert.equal((await call('GET', `/bookings/${done.booking.id}`, null, token)).body.notes, 'Old radiator leaking in the hall');
  });

  test('works by text message too', async () => {
    const say = customer('07700 900403', 'sms', 'Kim Lee');
    const start = await say('book');
    assert.equal(lastReply(start.contact.id).channel, 'sms');
    await say('2');
    await say('1');
    await say('1');
    await say('3 Park Row BS1 5LJ');
    await say('Dripping tap');
    const done = await say('Y');
    assert.equal(done.handled, 'chat_booked');
    assert.equal(done.booking.source, 'phone', 'shown as booked by phone/text');
  });

  test('0 stops, and replies it can’t follow are handed to a person', async () => {
    const say = customer('07700 900404', 'whatsapp', 'Ali Khan');
    await say('book');
    const stopped = await say('0');
    assert.equal(stopped.handled, 'chat_stopped');
    assert.match(lastReply(stopped.contact.id).body, /Reply BOOK any time/);
    await say('book');
    assert.equal((await say('the blue one')).handled, 'chat_continued');
    assert.match(lastReply(stopped.contact.id).body, /didn’t catch that/);
    const handed = await say('whatever is cheapest?');
    assert.equal(handed.handled, 'chat_handoff');
    assert.match(lastReply(stopped.contact.id).body, /someone from WA Plumbing will message you shortly/);
    const tasks = (await call('GET', '/tasks', null, token)).body;
    assert.ok(tasks.some((t) => t.title === 'Reply to Ali Khan (WhatsApp)' && t.status !== 'done'), 'a person now has it');
  });

  test('an emergency mid-booking goes straight to a person', async () => {
    const say = customer('07700 900405', 'whatsapp', 'Pat Moss');
    await say('book');
    const urgent = await say('actually water is pouring through the ceiling now!!');
    assert.equal(urgent.urgent, true);
    assert.equal(lastReply(urgent.contact.id).template_key, 'emergency_ack');
    const tasks = (await call('GET', '/tasks', null, token)).body;
    assert.ok(tasks.some((t) => t.title === '🚨 Emergency: reply to Pat Moss now'));
  });

  test('CANCEL cancels (with the notice period respected), NO keeps the booking', async () => {
    const say = customer('07700 900406', 'whatsapp', 'Lou Reed');
    await say('book'); await say('1'); await say('3'); await say('1'); await say('1 Elm Rd BS2 9YJ'); await say('skip');
    const { booking } = await say('yes');
    const ask = await say('cancel');
    assert.equal(ask.handled, 'chat_cancel_asked');
    assert.match(lastReply(ask.contact.id).body, /^Do you want to cancel your Boiler service on/);
    assert.equal((await say('no')).handled, 'chat_kept');
    await say('cancel');
    const cancelled = await say('yes');
    assert.equal(cancelled.handled, 'chat_cancelled');
    assert.equal((await call('GET', `/bookings/${booking.id}`, null, token)).body.status, 'cancelled');
    assert.equal(lastReply(ask.contact.id).template_key, 'booking_cancelled');

    // Inside the notice period the team is asked to call instead.
    await say('book'); await say('1'); await say('1');
    const times = lastReply(ask.contact.id).body.match(/\n(\d)\. /g).length;
    await say(String(times));
    await say('skip');
    await say('yes');
    await say('cancel');
    const late = await say('yes');
    assert.equal(late.handled, 'chat_cancel_late');
    assert.match(lastReply(ask.contact.id).body, /less than 24 hours/);
  });

  test('new messages get an instant reply inviting them to book – once, not every message', async () => {
    const say = customer('07700 900407', 'whatsapp', 'Max Fry');
    const first = await say('Do you do bathroom fitting?');
    assert.equal(lastReply(first.contact.id).template_key, 'auto_reply');
    assert.match(lastReply(first.contact.id).body, /Reply BOOK and pick a time right here/);
    await say('Also, are you free next week?');
    assert.equal(db.get(`SELECT COUNT(*) AS n FROM messages WHERE contact_id = ? AND template_key = 'auto_reply'`, first.contact.id).n, 1);
  });

  test('someone who starts booking and goes quiet is followed up by a person', async () => {
    const say = customer('07700 900408', 'whatsapp', 'Viv Rae');
    const started = await say('book');
    await say('2');
    assert.ok(followUpAbandoned(ctx, new Date(Date.now() + 3 * 3600_000)) >= 1);
    const tasks = (await call('GET', '/tasks', null, token)).body;
    assert.ok(tasks.some((t) => t.title === 'Reply to Viv Rae – started booking by WhatsApp but didn’t finish'));
    assert.equal(db.get('SELECT COUNT(*) AS n FROM conversations WHERE contact_id = ?', started.contact.id).n, 0);
  });
});

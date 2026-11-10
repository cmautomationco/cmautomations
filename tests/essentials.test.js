import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { setSetting } from '../server/lib/settings.js';
import { runBillingChase } from '../server/modules/billing/service.js';
import { runBookingSchedule } from '../server/modules/bookings/service.js';
import { runEssentials } from '../server/modules/essentials/runner.js';
import { getMessagingSettings } from '../server/modules/messaging/service.js';
import { parseKeywordRules } from '../server/modules/messaging/social.js';

/** Automations → Essentials: the offer, what each item really switches, and the new automations behind it. */

let server;
let base;
let ctx;
let db;
const saved = { ...config };

before(() => {
  config.requirePasswords = true;
  const made = createApp(openDatabase(':memory:'));
  ctx = made.ctx;
  db = ctx.db;
  server = made.app.listen(0);
  base = `http://localhost:${server.address().port}`;
  config.publicUrl = base;
});
after(() => { Object.assign(config, saved); server.close(); });

const call = async (method, p, body, token) => {
  const res = await fetch(`${base}/api${p}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
let n = 0;
async function business(name, niche = 'local_services') {
  const reg = await call('POST', '/auth/register', { name: `${name} Owner`, email: `owner${++n}@ess.test`, password: 'password123', business_name: name, niche });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  return { token: reg.body.token, org: reg.body.org, user: reg.body.user };
}
const apply = (biz, changes) => call('POST', '/essentials/apply', { changes }, biz.token);
const item = (state, key) => state.sections.flatMap((s) => s.items).find((i) => i.key === key);
const messagesFor = (contactId) => db.all(`SELECT * FROM messages WHERE contact_id = ? ORDER BY rowid`, contactId);
const quietOff = (biz) => call('PUT', '/messages/settings', { quiet_hours: { enabled: false, start: '20:00', end: '08:00' } }, biz.token);

describe('the Essentials offer', () => {
  test('17 automations in 5 sections, with what each one still needs', async () => {
    const biz = await business('Ace Plumbing');
    const e = (await call('GET', '/essentials', null, biz.token)).body;
    assert.equal(e.total, 17);
    assert.deepEqual(e.sections.map((s) => s.title), ['Never miss a lead', 'Bookings that happen', 'Look after every customer', 'Win the work & get paid', 'Reviews, referrals & follow-ups']);
    const names = e.sections.flatMap((s) => s.items.map((i) => i.name));
    for (const want of ['1-minute lead reply', 'Missed-call response', 'DM & comment auto replies', 'Lead source tagging', 'Booking confirmations', 'Day-before reminder',
      'Hour-before reminder', 'No-show rebooking', 'New customer welcome', 'Thank you after the job', 'Birthday & special occasion messages', 'Quote follow-up',
      'Unpaid invoice reminders', 'Review request', 'Replies to automatic messages – checked', 'Referral task', 'Cold lead check-in']) assert.ok(names.includes(want), want);
    // What's already running by default, and what isn't yet.
    assert.equal(item(e, 'booking_confirmation').on, true);
    assert.equal(item(e, 'missed_call').on, true);
    assert.equal(item(e, 'referral_task').on, false);
    assert.equal(item(e, 'social_replies').on, false);
    assert.deepEqual(item(e, 'missed_call').needs.map((x) => x.text), ['Add your business number']);
    assert.equal(item(e, 'review_request').on, false, 'no review link yet');
    assert.match(e.social.address, /\/api\/hooks\/social\/[0-9a-f]{36}$/);
  });

  test('switching an item on changes the real setting or automation – and back off again', async () => {
    const biz = await business('Bright Sparks');
    let e = (await apply(biz, [
      { key: 'referral_task', on: true }, { key: 'social_replies', on: true }, { key: 'lead_source', on: true },
      { key: 'reminder_hour_before', options: { reminder_short_hours: '1' } }, { key: 'review_request', options: { review_link: 'https://g.page/r/sparks/review' } },
      { key: 'quote_follow_up', on: true, options: { quote_follow_up_days: 5 } },
    ])).body;
    assert.equal(item(e, 'referral_task').on, true);
    assert.equal(db.get(`SELECT enabled FROM automations WHERE org_id = ? AND recipe = 'referral_after_job'`, biz.org.id).enabled, 1);
    assert.equal(getMessagingSettings(db, biz.org.id).social_enabled, true);
    assert.equal(item(e, 'reminder_hour_before').options[0].value, '1');
    assert.equal(item(e, 'review_request').on, true, 'on once the link is there');
    assert.equal((await call('GET', '/bookings/settings', null, biz.token)).body.settings.reminder_short_hours, 1);
    const billing = (await call('GET', '/invoices/settings', null, biz.token)).body;
    assert.equal(billing.quote_follow_up_days, 5);
    assert.equal(billing.quote_follow_up_message, true);
    e = (await apply(biz, [{ key: 'referral_task', on: false }, { key: 'thank_you', on: true, options: { thank_you_after_call: true } }])).body;
    assert.equal(item(e, 'referral_task').on, false);
    assert.equal(getMessagingSettings(db, biz.org.id).thank_you_after_call, true);
    // Bad options are refused with a plain explanation.
    assert.equal((await apply(biz, [{ key: 'social_replies', options: { social_webhook_url: 'http://not-secure.example' } }])).status, 400);
    assert.equal((await apply(biz, [{ key: 'nope', on: true }])).status, 400);
  });

  test('a team member can see the offer but not change it, and doesn’t see the social address', async () => {
    const biz = await business('Member Check');
    db.insert('users', { id: 'usr_ess_member', email: 'm@ess.test', name: 'Mo', password_hash: 'x:y', created_at: new Date().toISOString() });
    db.insert('memberships', { org_id: biz.org.id, user_id: 'usr_ess_member', role: 'member' });
    db.insert('sessions', { token: 'ess-member-token', user_id: 'usr_ess_member', org_id: biz.org.id, expires_at: '2999-01-01T00:00:00Z' });
    const seen = await call('GET', '/essentials', null, 'ess-member-token');
    assert.equal(seen.status, 200);
    assert.equal(seen.body.social.address, null);
    assert.equal((await call('POST', '/essentials/apply', { changes: [{ key: 'lead_source', on: true }] }, 'ess-member-token')).status, 403);
  });
});

describe('the offer link', () => {
  test('the business sees only what was offered, and saying yes switches it all on', async () => {
    const biz = await business('Glow Lashes', 'beauty');
    const offer = (await call('POST', '/essentials/offers', { items: ['new_customer_welcome', 'occasions', 'cold_lead_check_in', 'not_a_thing'], note: 'As discussed' }, biz.token)).body;
    assert.deepEqual(offer.items, ['new_customer_welcome', 'occasions', 'cold_lead_check_in']);
    assert.match(offer.link, /#\/essentials\/[0-9a-f]{36}$/);
    const pub = (await call('GET', `/public/essentials/${offer.token}`)).body;
    assert.equal(pub.business.name, 'Glow Lashes');
    assert.equal(pub.note, 'As discussed');
    assert.deepEqual(pub.sections.flatMap((s) => s.items.map((i) => i.key)), ['new_customer_welcome', 'occasions', 'cold_lead_check_in']);
    assert.equal((await call('POST', `/public/essentials/${offer.token}/accept`, {})).status, 400, 'needs a name');
    const yes = (await call('POST', `/public/essentials/${offer.token}/accept`, { name: 'Mia Roberts' })).body;
    assert.deepEqual(yes, { status: 'accepted', switched_on: 3 });
    const e = (await call('GET', '/essentials', null, biz.token)).body;
    for (const k of ['new_customer_welcome', 'occasions', 'cold_lead_check_in']) assert.equal(item(e, k).on, true, k);
    assert.equal(e.offers[0].status, 'accepted');
    assert.equal(e.offers[0].accepted_by, 'Mia Roberts');
    assert.ok(db.get(`SELECT 1 FROM tasks WHERE org_id = ? AND title LIKE 'Finish setting up the Essentials Mia Roberts said yes to'`, biz.org.id));
    assert.equal((await call('POST', `/public/essentials/${offer.token}/accept`, { name: 'Mia Roberts' })).body.already, true);
    assert.equal((await call('GET', '/public/essentials/not-a-real-offer')).status, 404);
  });
});

describe('never miss a lead', () => {
  test('missed calls are answered on the channel the business chose', async () => {
    const biz = await business('Channel Choice');
    await call('PUT', '/messages/settings', { business_number: '0117 496 0001', whatsapp_number: '0117 496 0001' }, biz.token);
    // They've messaged on WhatsApp today, so the best way would be WhatsApp…
    await call('POST', '/messages/simulate/inbound', { channel: 'whatsapp', from: '07700 900801', body: 'Hello', name: 'Ann' }, biz.token);
    await apply(biz, [{ key: 'missed_call', options: { missed_call_channel: 'sms' } }]);
    const r1 = (await call('POST', '/messages/simulate/missed-call', { from: '07700 900801' }, biz.token)).body;
    assert.equal(r1.textBack.channel, 'sms', '…but they asked for texts');
    await apply(biz, [{ key: 'missed_call', options: { missed_call_channel: 'whatsapp' } }]);
    db.run(`UPDATE calls SET created_at = '2020-01-01T00:00:00Z' WHERE org_id = ?`, biz.org.id);
    const r2 = (await call('POST', '/messages/simulate/missed-call', { from: '07700 900801' }, biz.token)).body;
    assert.equal(r2.textBack.channel, 'whatsapp');
  });

  test('lead source tagging labels every new lead with where it came from', async () => {
    const biz = await business('Source Tags', 'coaching');
    const before = (await call('POST', '/crm/contacts', { first_name: 'Untagged', email: 'u@x.co', source: 'Instagram' }, biz.token)).body.contact;
    assert.ok(!before.tags.some((t) => t.startsWith('Source:')));
    await apply(biz, [{ key: 'lead_source', on: true }]);
    const c1 = (await call('POST', '/crm/contacts', { first_name: 'Ivy', email: 'ivy@x.co', source: 'Google Business Profile' }, biz.token)).body.contact;
    assert.ok(c1.tags.includes('Source: Google'));
    await call('POST', '/messages/simulate/missed-call', { from: '07700 900802' }, biz.token);
    const caller = db.get(`SELECT tags FROM contacts WHERE org_id = ? AND phone_e164 = '+447700900802'`, biz.org.id);
    assert.match(caller.tags, /Source: Phone call/);
  });
});

describe('bookings', () => {
  let biz;
  let service;
  before(async () => {
    biz = await business('Booking Bits');
    await quietOff(biz);
    service = (await call('POST', '/bookings/services', { name: 'Boiler service', kind: 'appointment', duration_min: 60, price_pence: 8000 }, biz.token)).body;
  });
  const book = async (startsAt, phone, name = 'Kim') => (await call('POST', '/bookings', { service_id: service.id, starts_at: startsAt.toISOString(), contact: { first_name: name, phone }, source: 'phone' }, biz.token)).body;

  test('booking confirmations and no-show messages can be switched off', async () => {
    await apply(biz, [{ key: 'booking_confirmation', on: false }, { key: 'no_show_rebook', on: false }]);
    const res = await book(new Date(Date.now() + 30 * 3600_000), '07700 900811');
    assert.equal(res.message, null, 'no confirmation');
    const ns = (await call('POST', `/bookings/${res.booking.id}/status`, { status: 'no_show' }, biz.token)).body;
    assert.equal(ns.message, null);
    await apply(biz, [{ key: 'booking_confirmation', on: true }, { key: 'no_show_rebook', on: true }]);
    assert.equal((await book(new Date(Date.now() + 54 * 3600_000), '07700 900812')).message.template_key, 'booking_confirmation');
  });

  test('the hour-before reminder goes 1 hour before when chosen (not 2)', async () => {
    await apply(biz, [{ key: 'reminder_hour_before', on: true, options: { reminder_short_hours: '1' } }]);
    const soon = await book(new Date(Date.now() + 50 * 60_000), '07700 900813', 'Soon');
    const later = await book(new Date(Date.now() + 100 * 60_000), '07700 900814', 'Later');
    db.run(`UPDATE bookings SET created_at = ? WHERE id IN (?, ?)`, new Date(Date.now() - 6 * 3600_000).toISOString(), soon.booking.id, later.booking.id);
    await runBookingSchedule(ctx, new Date());
    assert.ok(messagesFor(soon.contact.id).some((m) => m.template_key === 'booking_reminder_2h'), '50 minutes before: sent');
    assert.ok(!messagesFor(later.contact.id).some((m) => m.template_key === 'booking_reminder_2h'), '100 minutes before: not yet');
  });

  test('a new customer is welcomed after their first job, and thanked after the next – never both', async () => {
    await apply(biz, [{ key: 'new_customer_welcome', on: true }, { key: 'thank_you', on: true }]);
    const first = await book(new Date(Date.now() + 74 * 3600_000), '07700 900815', 'Wendy');
    await call('POST', `/bookings/${first.booking.id}/status`, { status: 'completed' }, biz.token);
    let keys = messagesFor(first.contact.id).map((m) => m.template_key);
    assert.ok(keys.includes('new_customer_welcome'));
    assert.ok(!keys.includes('job_thank_you'));
    const second = await book(new Date(Date.now() + 98 * 3600_000), '07700 900815', 'Wendy');
    await call('POST', `/bookings/${second.booking.id}/status`, { status: 'completed' }, biz.token);
    keys = messagesFor(first.contact.id).map((m) => m.template_key);
    assert.equal(keys.filter((k) => k === 'new_customer_welcome').length, 1);
    assert.equal(keys.filter((k) => k === 'job_thank_you').length, 1);
    assert.match(messagesFor(first.contact.id).find((m) => m.template_key === 'job_thank_you').body, /thank you for choosing us for your Boiler service today/);
  });

  test('the referral task arrives a week after the job', async () => {
    await apply(biz, [{ key: 'referral_task', on: true }]);
    const job = await book(new Date(Date.now() + 122 * 3600_000), '07700 900816', 'Raj');
    const done = (await call('POST', `/bookings/${job.booking.id}/status`, { status: 'completed' }, biz.token)).body;
    assert.ok(done.automations.some((a) => a.automation === 'Happy customer → ask for a referral'));
    const task = db.get(`SELECT * FROM tasks WHERE org_id = ? AND title = 'Ask Raj for a referral'`, biz.org.id);
    assert.ok(task);
    const days = (new Date(task.due_at) - Date.now()) / 86400_000;
    assert.ok(days > 6.9 && days < 7.1);
    assert.match(task.description, /we’d love an introduction/);
  });

  test('answered calls get a thank-you when that option is on', async () => {
    const { handleMissedCall } = await import('../server/modules/messaging/service.js');
    await apply(biz, [{ key: 'thank_you', on: true, options: { thank_you_after_call: true } }]);
    const r = await handleMissedCall(ctx, biz.org.id, { from: '07700 900817', status: 'answered', duration: 140 });
    assert.equal(r.thanks.template_key, 'call_thank_you');
    const quick = await handleMissedCall(ctx, biz.org.id, { from: '07700 900818', status: 'answered', duration: 8 });
    assert.equal(quick.thanks, null, 'not after a 8-second call');
  });
});

describe('win the work & get paid', () => {
  test('quote follow-up sends the customer a nudge with the link as well as the task', async () => {
    const biz = await business('Quote Nudge');
    await quietOff(biz);
    await apply(biz, [{ key: 'quote_follow_up', on: true, options: { quote_follow_up_days: 2 } }]);
    const contact = (await call('POST', '/crm/contacts', { first_name: 'Quinn', phone: '07700 900821' }, biz.token)).body.contact;
    const quote = (await call('POST', '/invoices', { kind: 'quote', contact_id: contact.id, title: 'New boiler', line_items: [{ description: 'Boiler', quantity: 1, unit_pence: 250000 }] }, biz.token)).body;
    await call('POST', `/invoices/${quote.id}/send`, {}, biz.token);
    db.run('UPDATE invoices SET sent_at = ? WHERE id = ?', new Date(Date.now() - 3 * 86400_000).toISOString(), quote.id);
    await runBillingChase(ctx, new Date());
    const nudge = messagesFor(contact.id).find((m) => m.template_key === 'quote_follow_up');
    assert.ok(nudge);
    assert.match(nudge.body, /quote Q-0001 for £2,500\.00.*#\/doc\//);
    assert.ok(db.get(`SELECT 1 FROM tasks WHERE org_id = ? AND title LIKE 'Follow up quote Q-0001%'`, biz.org.id));
  });

  test('a first full payment welcomes a new customer', async () => {
    const biz = await business('Paid Up', 'coaching');
    await apply(biz, [{ key: 'new_customer_welcome', on: true }]);
    const contact = (await call('POST', '/crm/contacts', { first_name: 'Pat', email: 'pat@x.co' }, biz.token)).body.contact;
    const inv = (await call('POST', '/invoices', { kind: 'invoice', contact_id: contact.id, title: 'Coaching', line_items: [{ description: 'Session', quantity: 1, unit_pence: 15000 }] }, biz.token)).body;
    await call('POST', `/invoices/${inv.id}/send`, {}, biz.token);
    await call('POST', `/invoices/${inv.id}/payments`, { amount_pence: 15000, method: 'bank_transfer' }, biz.token);
    assert.ok(messagesFor(contact.id).some((m) => m.template_key === 'new_customer_welcome'));
  });
});

describe('looking after customers over time', () => {
  test('birthdays and special dates get a message on the day – once a year', async () => {
    const biz = await business('Happy Days', 'beauty');
    await apply(biz, [{ key: 'occasions', on: true }]);
    const bday = (await call('POST', '/crm/contacts', { first_name: 'Bella', phone: '07700 900831', birthday: '21/06', lifecycle: 'customer' }, biz.token)).body.contact;
    assert.equal(bday.birthday, '06-21');
    const anni = (await call('POST', '/crm/contacts', { first_name: 'Cara', phone: '07700 900832', special_date: '21/06/2019', special_date_label: 'wedding anniversary', lifecycle: 'customer' }, biz.token)).body.contact;
    assert.equal((await call('POST', '/crm/contacts', { first_name: 'Bad', birthday: '31/02' }, biz.token)).status, 400);
    const noon = new Date('2026-06-21T11:00:00Z'); // 12:00 in London
    assert.equal(runEssentials(ctx, new Date('2026-06-21T06:00:00Z')).occasions, 0, 'not at 7am');
    assert.equal(runEssentials(ctx, noon).occasions, 2);
    assert.equal(runEssentials(ctx, noon).occasions, 0, 'once only');
    assert.match(messagesFor(bday.id).find((m) => m.template_key === 'birthday_message').body, /^Happy birthday, Bella! 🎉/);
    assert.match(messagesFor(anni.id).find((m) => m.template_key === 'special_occasion_message').body, /happy wedding anniversary!/);
    // 29 February birthdays are celebrated on the 28th in other years.
    const leap = (await call('POST', '/crm/contacts', { first_name: 'Lee', phone: '07700 900833', birthday: '29/02/2000' }, biz.token)).body.contact;
    runEssentials(ctx, new Date('2027-02-28T12:00:00Z'));
    assert.ok(messagesFor(leap.id).some((m) => m.template_key === 'birthday_message'));
  });

  test('leads that went quiet get one check-in, on a weekday during working hours', async () => {
    const biz = await business('Quiet Leads', 'coaching');
    await apply(biz, [{ key: 'cold_lead_check_in', on: true, options: { cold_lead_days: 30 } }]);
    const old = '2026-09-01T10:00:00.000Z';
    db.insert('contacts', { id: 'con_quiet1', org_id: biz.org.id, first_name: 'Quinn', phone: '07700900841', phone_e164: '+447700900841', lifecycle: 'lead', tags: '[]', created_at: old, updated_at: old });
    db.insert('contacts', { id: 'con_fresh1', org_id: biz.org.id, first_name: 'Fresh', phone: '07700900842', phone_e164: '+447700900842', lifecycle: 'lead', tags: '[]', created_at: '2026-11-01T10:00:00.000Z', updated_at: old });
    assert.equal(runEssentials(ctx, new Date('2026-11-14T12:00:00Z')).coldLeads, 0, 'not on a Saturday');
    assert.equal(runEssentials(ctx, new Date('2026-11-11T19:00:00Z')).coldLeads, 0, 'not in the evening');
    const wed = new Date('2026-11-11T12:00:00Z');
    runEssentials(ctx, wed);
    assert.ok(messagesFor('con_quiet1').some((m) => m.template_key === 'cold_lead_check_in'));
    assert.ok(!messagesFor('con_fresh1').length, 'only 10 days old – not cold yet');
    runEssentials(ctx, wed);
    assert.equal(messagesFor('con_quiet1').filter((m) => m.template_key === 'cold_lead_check_in').length, 1);
  });

  test('a reply to an automatic message that nobody reads becomes an urgent task – once', async () => {
    const biz = await business('Reply Watch', 'beauty');
    await apply(biz, [{ key: 'reply_watch', on: true, options: { reply_watch_hours: 2 } }]);
    const say = (from, body) => call('POST', '/messages/simulate/inbound', { channel: 'whatsapp', from, body, name: 'Rae' }, biz.token);
    const first = (await say('07700 900851', 'Do you do eyebrow tints?')).body;
    assert.ok(messagesFor(first.contact.id).some((m) => m.template_key === 'auto_reply'), 'the automatic reply went out');
    await say('07700 900851', 'And how much is it?');
    // A second customer: same, but a person replied.
    const other = (await say('07700 900852', 'Are you open Sunday?')).body;
    await say('07700 900852', 'Thanks!');
    await call('POST', `/messages/threads/${other.contact.id}/send`, { body: 'Yes, 10–4!' }, biz.token);
    db.run(`UPDATE messages SET read = 0 WHERE contact_id = ? AND direction = 'in'`, other.contact.id);
    const later = new Date(Date.now() + 3 * 3600_000);
    assert.equal(runEssentials(ctx, later).replies, 1);
    const task = db.get(`SELECT * FROM tasks WHERE org_id = ? AND title LIKE '🔔 Unread reply: Rae answered an automatic WhatsApp message%'`, biz.org.id);
    assert.equal(task.priority, 'urgent');
    assert.equal(runEssentials(ctx, later).replies, 0, 'once only');
  });
});

describe('Instagram, Facebook and TikTok DMs & comments', () => {
  let biz;
  let address;
  before(async () => {
    biz = await business('Lash Lab', 'beauty');
    address = (await call('GET', '/essentials', null, biz.token)).body.social.address.replace(base, '');
  });
  const send = (body) => fetch(`${base}${address}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

  test('keyword rules are read one per line', () => {
    assert.deepEqual(parseKeywordRules('price, cost → From £45\n\nhours -> 9 till 5\nnot a rule'), [
      { words: ['price', 'cost'], reply: 'From £45' }, { words: ['hours'], reply: '9 till 5' },
    ]);
  });

  test('switched off: the message lands in Messages with a reply task, but nothing is sent', async () => {
    const r = await send({ platform: 'instagram', type: 'dm', from: '@Early.Bird', text: 'Hi there' });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, null);
    assert.ok(db.get(`SELECT 1 FROM tasks WHERE org_id = ? AND title = 'Reply to @early.bird (Instagram DM)'`, biz.org.id));
  });

  test('DMs get the standard reply once, keyword questions get answered, comments get a public reply and a DM', async () => {
    await apply(biz, [{ key: 'social_replies', on: true, options: { keyword_replies: 'price, how much → Hi{{first_name_spaced}}! A full set is £45.' } }]);
    const dm = (await send({ platform: 'instagram', type: 'dm', from: 'sarah.l', name: 'Sarah Lee', text: 'Hi! Do you have space this week?' })).body;
    assert.equal(dm.reply, 'Hi Sarah! Thanks for your message 🙌 We’ll get back to you very soon.');
    assert.equal(dm.answered, false);
    const contact = db.get('SELECT * FROM contacts WHERE id = ?', dm.contact_id);
    assert.equal(contact.source, 'Instagram');
    assert.equal(JSON.parse(contact.socials).instagram, 'sarah.l');
    // The same person again: matched by handle, no second standard reply.
    const again = (await send({ platform: 'instagram', type: 'dm', from: '@Sarah.L', text: 'Any Saturday slots?' })).body;
    assert.equal(again.contact_id, dm.contact_id);
    assert.equal(again.reply, null);
    // A price question is answered by the keyword rule and needs no person.
    const price = (await send({ platform: 'instagram', type: 'dm', from: 'sarah.l', text: 'how much is a full set' })).body;
    assert.equal(price.reply, 'Hi Sarah! A full set is £45.');
    assert.equal(price.answered, true);
    assert.equal(db.get(`SELECT read FROM messages WHERE contact_id = ? AND direction = 'in' ORDER BY rowid DESC LIMIT 1`, dm.contact_id).read, 1);
    // Comments: a public reply under the post, plus a DM.
    const comment = (await send({ platform: 'tiktok', type: 'comment', from: 'jo_b', text: 'Love this 😍', comment_id: 'c-123', post: 'Lash reel' })).body;
    assert.equal(comment.comment_reply, 'Thanks! We’ve sent you a DM 📩');
    assert.match(comment.reply, /thanks for your comment/);
    assert.deepEqual(comment.replies.map((x) => x.type), ['comment_reply', 'dm']);
    assert.equal(comment.replies[0].comment_id, 'c-123');
    const stored = db.get(`SELECT * FROM messages WHERE contact_id = ? AND direction = 'in'`, comment.contact_id);
    assert.equal(stored.channel, 'tiktok');
    assert.equal(stored.body, '💬 Comment on Lash reel: Love this 😍');
    // Missing pieces and unknown addresses are refused.
    assert.equal((await send({ platform: 'instagram', text: 'no sender' })).status, 400);
    assert.equal((await fetch(`${base}/api/hooks/social/not-a-real-address-123456789`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404);
  });

  test('with a social connection, replies (and replies from the inbox) are posted to it', async () => {
    const received = [];
    const hook = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { received.push(JSON.parse(b)); res.end('ok'); }); }).listen(0);
    try {
      setSetting(db, biz.org.id, 'messaging', { ...getMessagingSettings(db, biz.org.id), social_webhook_url: `http://localhost:${hook.address().port}/manychat` });
      const out = (await send({ platform: 'facebook', type: 'dm', from: 'dan.f', name: 'Dan', text: 'Hello' })).body;
      assert.equal(out.sent_via, 'connection');
      assert.deepEqual(received.at(-1), { platform: 'facebook', type: 'dm', to: 'dan.f', comment_id: null, text: 'Hi Dan! Thanks for your message 🙌 We’ll get back to you very soon.', message_id: received.at(-1).message_id });
      const sent = await call('POST', `/messages/threads/${out.contact_id}/send`, { channel: 'facebook', body: 'Hi Dan, yes we can do Friday.' }, biz.token);
      assert.equal(sent.status, 201);
      assert.equal(sent.body.status, 'sent');
      assert.equal(received.at(-1).text, 'Hi Dan, yes we can do Friday.');
      const thread = (await call('GET', `/messages/threads/${out.contact_id}`, null, biz.token)).body;
      assert.equal(thread.channels.facebook.handle, 'dan.f');
      assert.equal(thread.channels.facebook.available, true);
    } finally {
      hook.close();
      setSetting(db, biz.org.id, 'messaging', { ...getMessagingSettings(db, biz.org.id), social_webhook_url: '' });
    }
    // Without a connection, a reply from the inbox explains what to set up.
    const contactId = db.get(`SELECT id FROM contacts WHERE org_id = ? AND socials LIKE '%dan.f%'`, biz.org.id).id;
    const blocked = await call('POST', `/messages/threads/${contactId}/send`, { channel: 'facebook', body: 'Hello again' }, biz.token);
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.error, /social connection/);
  });

  test('the Messages tester runs a DM or comment through the same code', async () => {
    const r = await call('POST', '/messages/simulate/inbound', { channel: 'instagram', type: 'comment', from: '@tester', body: 'How much?', post: 'my post' }, biz.token);
    assert.equal(r.status, 201);
    assert.ok(r.body.replies.length >= 1);
    assert.equal((await call('GET', '/messages/threads?channel=social', null, biz.token)).body.some((t) => t.id === r.body.contact.id), true);
  });
});

describe('upgrading an existing database', () => {
  test('the messages table is rebuilt to allow Instagram, Facebook and TikTok, keeping every message', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-ess-'));
    const file = path.join(dir, 'old.db');
    openDatabase(file).raw.close();
    const raw = new DatabaseSync(file);
    const sql = raw.prepare(`SELECT sql FROM sqlite_master WHERE name = 'messages'`).get().sql;
    raw.exec('PRAGMA foreign_keys = OFF; DROP TABLE messages;');
    raw.exec(sql.replace("'instagram','facebook','tiktok'", '').replace(",)", ')').replace("'whatsapp',)", "'whatsapp')"));
    raw.exec(`INSERT INTO organizations (id, name, niche, created_at) VALUES ('org_old', 'Old Co', 'coaching', '2025-01-01')`);
    raw.exec(`INSERT INTO messages (id, org_id, channel, direction, body, status, created_at) VALUES ('msg_old', 'org_old', 'sms', 'in', 'Old message', 'received', '2025-01-01')`);
    assert.ok(!raw.prepare(`SELECT sql FROM sqlite_master WHERE name = 'messages'`).get().sql.includes('instagram'));
    raw.close();
    const db2 = openDatabase(file);
    assert.ok(db2.get(`SELECT sql FROM sqlite_master WHERE name = 'messages'`).sql.includes("'instagram'"));
    assert.equal(db2.get(`SELECT body FROM messages WHERE id = 'msg_old'`).body, 'Old message');
    db2.run(`INSERT INTO messages (id, org_id, channel, direction, body, status, created_at) VALUES ('msg_ig', 'org_old', 'instagram', 'in', 'New', 'received', '2026-01-01')`);
    assert.ok(db2.get(`SELECT 1 FROM sqlite_master WHERE name = 'idx_messages_contact'`));
    db2.raw.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

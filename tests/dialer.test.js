import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { emailInfo, phoneInfo } from '../server/modules/crm/geo.js';
import { analyseTranscript, winningResponses } from '../server/modules/dialer/analyse.js';
import { DIALER_DEFAULTS, buildQueue, callWindow, runSequences } from '../server/modules/dialer/service.js';
import { handleInbound } from '../server/modules/messaging/service.js';

/** CRM dialer: enrichment, the time-zone call list, calls and everything that follows. */

let server;
let base;
let db;
let ctx;
const saved = { ...config };

before(() => {
  config.requirePasswords = true;
  const made = createApp(openDatabase(':memory:'));
  db = made.ctx.db;
  ctx = made.ctx;
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
async function business(name, niche = 'agency') {
  const reg = await call('POST', '/auth/register', { name: `${name} Owner`, email: `dial${++n}@dial.test`, password: 'password123', business_name: name, niche });
  assert.equal(reg.status, 201);
  return reg.body.token;
}
const lead = async (token, data) => {
  const res = await call('POST', '/crm/contacts', data, token);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.contact;
};

const TRANSCRIPT = [
  'You: Hi Jo, it’s Sam from CM Automations – you filled in our form about missed calls. Have you got two minutes?',
  'Them: Yeah go on. Honestly we miss calls all the time when we’re on a job, and I spend my evenings on admin.',
  'You: That’s really common. What happens to those missed calls now?',
  'Them: They go to voicemail and most people never leave one. How much does it cost though?',
  'You: Fair question – can I ask what one missed job is worth to you? If this doesn’t pay for itself, it’s not worth doing.',
  'Them: Probably £300 a job. That sounds good, can you show me how it works?',
  'You: Of course – shall we book a short demo for Thursday at 10?',
  'Them: Perfect, let’s do it.',
].join('\n');

describe('working out who a lead is', () => {
  test('phone numbers give the country, time zone and type of line', () => {
    assert.equal(phoneInfo('+447700900123').timezone, 'Europe/London');
    assert.equal(phoneInfo('+447700900123').line, 'mobile');
    assert.equal(phoneInfo('+12125550123').timezone, 'America/New_York');
    assert.equal(phoneInfo('+13105550123').timezone, 'America/Los_Angeles');
    assert.equal(phoneInfo('+61412345678').country, 'Australia');
  });

  test('a work email gives the company and website; a personal one doesn’t', () => {
    const work = emailInfo('jo@harbourdental.co.uk');
    assert.equal(work.type, 'business');
    assert.equal(work.website, 'https://harbourdental.co.uk');
    assert.equal(emailInfo('jo@gmail.com').type, 'personal');
  });

  test('every new lead is enriched as it comes in, with a score and the reasons', async () => {
    const token = await business('Enrich Co');
    const c = await lead(token, { first_name: 'Jo', phone: '+12125550123', email: 'jo@acmeplumbing.com', source: 'Website form' });
    const full = await call('GET', `/crm/contacts/${c.id}`, null, token);
    const e = full.body.enrichment;
    assert.equal(e.timezone, 'America/New_York');
    assert.equal(e.phone.country, 'United States');
    assert.equal(e.company, 'Acmeplumbing');
    assert.ok(full.body.lead_score > 40, `score ${full.body.lead_score}`);
    assert.ok(e.score_reasons.some((r) => r.includes('new in the last 24 hours')));
  });
});

describe('calling at the right time for them', () => {
  // Thursday 12 Nov 2026, 15:00 in London = 10:00 New York = 07:00 Los Angeles.
  const at = new Date('2026-11-12T15:00:00Z');
  test('one moment is a different call window in each time zone', () => {
    assert.equal(callWindow('Europe/London', DIALER_DEFAULTS, at).status, 'open');
    assert.equal(callWindow('America/New_York', DIALER_DEFAULTS, at).status, 'best');
    const la = callWindow('America/Los_Angeles', DIALER_DEFAULTS, at);
    assert.equal(la.status, 'closed');
    assert.equal(la.next_open_at, '2026-11-12T17:00:00.000Z', 'opens at 9am their time');
  });

  test('the call list puts awake leads first and the rest in “later” with their opening time', async () => {
    const token = await business('Queue Co');
    const uk = await lead(token, { first_name: 'Ava', phone: '07700 900111' });
    const ny = await lead(token, { first_name: 'Ben', phone: '+12125550111' });
    const la = await lead(token, { first_name: 'Cal', phone: '+13105550111' });
    const org = db.get('SELECT o.* FROM organizations o JOIN contacts c ON c.org_id = o.id WHERE c.id = ?', uk.id);
    const q = buildQueue(db, org, DIALER_DEFAULTS, { at });
    const nowIds = q.now.map((i) => i.contact.id);
    assert.ok(nowIds.includes(uk.id) && nowIds.includes(ny.id));
    assert.ok(!nowIds.includes(la.id));
    assert.equal(q.later[0].contact.id, la.id);
    assert.ok(q.later[0].opens_theirs.includes('9am'));
    assert.equal(nowIds[0], ny.id, 'New York is in its best window, so it comes first');
  });
});

describe('reading a call', () => {
  test('the transcript gives problems, objections, signals and the budget', () => {
    const a = analyseTranscript(TRANSCRIPT);
    assert.ok(a.pains.some((p) => p.key === 'missed_calls'));
    assert.ok(a.pains.some((p) => p.key === 'admin'));
    assert.ok(a.objections.some((o) => o.key === 'price'));
    assert.ok(a.signals.includes('sounds good'));
    assert.equal(a.budget, '£300');
    assert.ok(a.talk_ratio > 0 && a.talk_ratio < 100);
    assert.ok(a.questions.length >= 1);
  });

  test('the answer that followed an objection is kept for the script', () => {
    const wins = winningResponses(TRANSCRIPT);
    assert.equal(wins[0].objection, 'price');
    assert.match(wins[0].reply, /pay for itself/);
  });
});

describe('a call from start to finish', () => {
  let token;
  before(async () => { token = await business('CM Test Agency'); });

  test('opening a lead gives openers written from what they told us', async () => {
    const c = await lead(token, { first_name: 'Jo', phone: '07700 900222', source: 'Website form' });
    const res = await call('GET', `/dialer/leads/${c.id}`, null, token);
    assert.equal(res.status, 200);
    assert.ok(res.body.openers.length >= 3);
    assert.ok(res.body.openers.every((o) => o.text.includes('CM Test Agency')));
    assert.ok(res.body.window.status);
    assert.ok(res.body.links.callback.includes('#/callback/'));
  });

  test('“interested” saves what they said, makes their demo page and a follow-up sequence', async () => {
    const c = await lead(token, { first_name: 'Jo', phone: '07700 900333' });
    const start = await call('POST', '/dialer/calls', { contact_id: c.id, opener_key: 'permission', opener_text: 'Hi Jo…' }, token);
    assert.equal(start.status, 201);
    const end = await call('POST', `/dialer/calls/${start.body.call.id}/end`, { outcome: 'interested', transcript: TRANSCRIPT, notes: 'Owner, 2 vans' }, token);
    assert.equal(end.status, 200, JSON.stringify(end.body));
    const q = end.body.contact;
    const qual = typeof q.qualification === 'string' ? JSON.parse(q.qualification) : q.qualification;
    assert.ok(qual.pain_keys.includes('missed_calls'));
    assert.equal(qual.budget, '£300');
    assert.ok(end.body.pages.demo.link.includes('#/demo/'));
    assert.equal(end.body.sequence.kind, 'interested');
    assert.ok(end.body.sequence.steps.length >= 4);
    assert.ok(end.body.sequence.steps[0].body.includes(end.body.pages.demo.link));
    assert.ok(db.get(`SELECT 1 FROM deals WHERE contact_id = ?`, c.id), 'a deal is opened');
    // Their page: the problems they mentioned, matched to fixes.
    const pageToken = end.body.pages.demo.token;
    const page = await call('GET', `/public/dialer/lead/${pageToken}`);
    assert.equal(page.status, 200);
    assert.equal(page.body.kind, 'demo');
    assert.ok(page.body.solutions.some((s) => s.key === 'missed_calls' && s.items.length));
    // The first sequence message goes out on the next run.
    await runSequences(ctx);
    assert.ok(db.get(`SELECT 1 FROM messages WHERE contact_id = ? AND template_key = 'sequence_interested'`, c.id));
  });

  test('no answer: a text back offering a call back or text back, and the next try in their hours', async () => {
    const c = await lead(token, { first_name: 'Max', phone: '+12125550444' });
    const start = await call('POST', '/dialer/calls', { contact_id: c.id }, token);
    const end = await call('POST', `/dialer/calls/${start.body.call.id}/end`, { outcome: 'no_answer' }, token);
    assert.equal(end.status, 200);
    const text = db.get(`SELECT * FROM messages WHERE contact_id = ? AND template_key = 'dialer_text_back'`, c.id);
    assert.ok(text, 'text back sent');
    assert.match(text.body, /Reply CALL/);
    assert.match(text.body, /#\/callback\//);
    const next = callWindow('America/New_York', DIALER_DEFAULTS, new Date(end.body.next_dial_at));
    assert.notEqual(next.status, 'closed', 'next try is inside their calling hours');
    assert.equal(end.body.sequence.kind, 'no_answer');
    // They reply CALL: a call back is booked and the sequence stops.
    const org = db.get('SELECT * FROM organizations WHERE id = ?', c.org_id);
    const inbound = await handleInbound(ctx, org.id, { channel: 'sms', from: '+12125550444', body: 'CALL' });
    assert.equal(inbound.handled, 'callback_requested');
    assert.ok(db.get(`SELECT 1 FROM callbacks WHERE contact_id = ? AND status = 'pending' AND mode = 'call' AND source = 'reply'`, c.id));
    assert.equal(db.get(`SELECT status FROM sequences WHERE contact_id = ? ORDER BY created_at DESC`, c.id).status, 'stopped');
  });

  test('booked: the booking, a custom confirmation page and a demo page', async () => {
    const svc = await call('POST', '/bookings/services', { name: 'Discovery call', duration_min: 30, price: 0 }, token);
    assert.equal(svc.status, 201, JSON.stringify(svc.body));
    const c = await lead(token, { first_name: 'Ria', phone: '07700 900555' });
    const start = await call('POST', '/dialer/calls', { contact_id: c.id }, token);
    const startsAt = new Date(Date.now() + 5 * 86400_000);
    startsAt.setUTCHours(10, 0, 0, 0);
    const end = await call('POST', `/dialer/calls/${start.body.call.id}/end`, { outcome: 'booked', transcript: TRANSCRIPT, booking: { service_id: svc.body.id, starts_at: startsAt.toISOString() } }, token);
    assert.equal(end.status, 200, JSON.stringify(end.body));
    assert.ok(end.body.booking?.id);
    assert.ok(end.body.pages.confirmation.link.includes('#/confirmed/'));
    const page = await call('GET', `/public/dialer/lead/${end.body.pages.confirmation.token}`);
    assert.equal(page.body.booking.starts_at, startsAt.toISOString());
    assert.ok(page.body.agenda.length >= 3);
    assert.ok(page.body.agenda.some((a) => /missing calls/i.test(a.item)));
    assert.ok(page.body.demo_link.includes('#/demo/'));
    assert.equal(end.body.sequence.kind, 'booked');
    assert.ok(end.body.sequence.steps.some((s) => s.label.includes('Preview')), 'a preview the day before');
  });

  test('the script learns from calls: openers, objections and the answer that worked', async () => {
    const res = await call('GET', '/dialer/script', null, token);
    assert.equal(res.status, 200);
    assert.ok(res.body.totals.calls >= 3);
    const price = res.body.objections.find((o) => o.key === 'price');
    assert.ok(price.count >= 1);
    assert.equal(price.from_calls, true);
    assert.match(price.handler, /pay for itself/);
    assert.ok(res.body.versions.length >= 1);
  });

  test('a lead can pick a call back time on their page, in their own time zone', async () => {
    const c = await lead(token, { first_name: 'Tom', phone: '07700 900666' });
    const links = (await call('GET', `/dialer/leads/${c.id}`, null, token)).body.links;
    const key = links.callback.split('#/callback/')[1];
    const page = await call('GET', `/public/dialer/lead/${key}`);
    assert.equal(page.body.kind, 'callback');
    assert.ok(page.body.slots.length > 10);
    const pickIt = await call('POST', `/public/dialer/callback/${key}`, { starts_at: page.body.slots[3], mode: 'call', tz: 'Europe/Paris' });
    assert.equal(pickIt.status, 201, JSON.stringify(pickIt.body));
    const cb = db.get(`SELECT * FROM callbacks WHERE contact_id = ? AND status = 'pending'`, c.id);
    assert.equal(cb.source, 'lead');
    assert.equal(db.get('SELECT timezone FROM contacts WHERE id = ?', c.id).timezone, 'Europe/Paris');
    // It's in the CRM calendar.
    const cal = await call('GET', `/dialer/calendar?from=${new Date().toISOString()}&to=${new Date(Date.now() + 9 * 86400_000).toISOString()}`, null, token);
    assert.ok(cal.body.items.some((i) => i.type === 'callback' && i.contact_id === c.id));
    assert.ok(cal.body.items.some((i) => i.type === 'booking'));
  });

  test('the business’s own call-back link takes new leads too', async () => {
    const org = db.get(`SELECT * FROM organizations WHERE name = 'CM Test Agency'`);
    const page = await call('GET', `/public/dialer/callback/${org.slug}`);
    assert.equal(page.status, 200);
    const missingName = await call('POST', `/public/dialer/callback/${org.slug}`, { starts_at: page.body.slots[0], mode: 'text', phone: '07700 900777' });
    assert.equal(missingName.status, 400);
    const ok = await call('POST', `/public/dialer/callback/${org.slug}`, { starts_at: page.body.slots[0], mode: 'text', phone: '07700 900777', name: 'Lee' });
    assert.equal(ok.status, 201);
    const c = db.get(`SELECT * FROM contacts WHERE org_id = ? AND phone_e164 = '+447700900777'`, org.id);
    assert.equal(c.source, 'Call back request');
    assert.equal(c.call_pref, 'text');
  });

  test('do not call takes them off the list for good', async () => {
    const c = await lead(token, { first_name: 'Zed', phone: '07700 900888' });
    const start = await call('POST', '/dialer/calls', { contact_id: c.id }, token);
    await call('POST', `/dialer/calls/${start.body.call.id}/end`, { outcome: 'do_not_call' }, token);
    const again = await call('POST', '/dialer/calls', { contact_id: c.id }, token);
    assert.equal(again.status, 400);
    const q = await call('GET', '/dialer/queue', null, token);
    assert.ok(![...q.body.now, ...q.body.later].some((i) => i.contact.id === c.id));
  });

  test('members can use the dialer but only admins change its settings', async () => {
    const bad = await call('PUT', '/dialer/settings', { hours: { weekday: ['20:00', '09:00'] } }, token);
    assert.equal(bad.status, 400);
    const ok = await call('PUT', '/dialer/settings', { my_phone: '07700 900999', hours: { sun: ['11:00', '15:00'] }, best: [['10:00', '11:00']] }, token);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.settings.my_phone, '+447700900999');
    assert.deepEqual(ok.body.settings.hours.sun, ['11:00', '15:00']);
    assert.deepEqual(ok.body.settings.hours.weekday, ['09:00', '20:00'], 'other days kept');
  });
});

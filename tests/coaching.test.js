import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { expectedFraction, expectedPath } from '../server/modules/coaching/journey.js';
import { nextNudgeAt, runCoaching } from '../server/modules/coaching/service.js';

/** Online coaching: onboarding from the first conversation, the client's own page, and their progress chart. */

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
async function coach() {
  const reg = await call('POST', '/auth/register', { name: 'Coach', email: `coach${++n}@coach.test`, password: 'password123', business_name: `Summit Coaching ${n}`, niche: 'coaching' });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  return reg.body.token;
}
const tokenOf = (link) => link.split('/').pop();
const step = (j, key) => j.phases.flatMap((p) => p.steps).find((s) => s.key === key);

describe('onboarding, from the first conversation', () => {
  test('the whole journey, with both sides always knowing what happens next', async () => {
    const t = await coach();
    const made = await call('POST', '/coaching/clients', { name: 'Sam Kerr', email: 'sam@client.test', met_via: 'Instagram DM', notes: 'Wants to get stronger and stop starting over', goal: 'Squat 100kg', metric_label: 'Squat', metric_unit: 'kg' }, t);
    assert.equal(made.status, 201, JSON.stringify(made.body));
    let c = made.body;
    assert.equal(c.journey.phases.length, 3);
    assert.equal(step(c.journey, 'conversation').status, 'done');
    assert.equal(c.journey.current.key, 'call');
    assert.equal(c.journey.waiting_on, 'coach');
    assert.ok(db.get('SELECT 1 FROM tasks WHERE source_ref = ?', `${c.id}:call`), 'the coach gets a task for the call');
    const portal = tokenOf(c.link);

    // Discovery call → the offer is the client's turn, and they're told.
    c = (await call('POST', `/coaching/clients/${c.id}/steps/call/done`, {}, t)).body;
    assert.equal(c.journey.current.key, 'offer');
    assert.equal(c.journey.waiting_on, 'client');
    assert.ok(c.updates.some((u) => /Have a look and say yes/.test(u.body)));
    assert.ok(db.get(`SELECT 1 FROM messages WHERE contact_id = ? AND related_type = 'coaching'`, c.contact_id), 'the client is messaged');

    // Steps can't be skipped.
    assert.equal((await call('POST', `/coaching/clients/${c.id}/steps/programme/done`, {}, t)).status, 400);

    // The client's page.
    let page = (await call('GET', `/public/coach/${portal}`)).body;
    assert.equal(page.first_name, 'Sam');
    assert.equal(page.journey.current.client_action, 'accept_offer');
    assert.ok(page.offer.includes.length);
    assert.equal(step(page.journey, 'conversation').nudges, undefined, 'coach-only details stay off the client page');
    page = (await call('POST', `/public/coach/${portal}/accept`)).body;
    assert.equal(page.journey.current.key, 'payment');

    // Paid → the welcome goes by itself and the intake form is next.
    c = (await call('POST', `/coaching/clients/${c.id}/steps/payment/done`, {}, t)).body;
    assert.equal(step(c.journey, 'welcome').status, 'done');
    assert.equal(c.journey.current.key, 'intake');
    assert.ok(c.updates.some((u) => /Welcome aboard, Sam/.test(u.body)));
    assert.equal(db.get('SELECT lifecycle FROM contacts WHERE id = ?', c.contact_id).lifecycle, 'customer');

    // Intake: their starting point and goal become the ends of their chart.
    page = (await call('POST', `/public/coach/${portal}/intake`, { goals: 'Squat 100kg by summer', history: 'Lifted on and off', starting_value: 60, goal_value: 100 })).body;
    assert.equal(page.journey.current.key, 'agreement');
    assert.equal(page.progress.baseline, 60);
    assert.equal(page.progress.target, 100);
    assert.equal((await call('POST', `/public/coach/${portal}/agreement`, {})).status, 400);
    page = (await call('POST', `/public/coach/${portal}/agreement`, { signed_name: 'Sam Kerr' })).body;
    assert.equal(page.journey.current.key, 'kickoff');
    assert.ok(page.updates.some((u) => /pick a time for your kickoff call/i.test(u.body)));

    // Kickoff: client picks times → it's the coach's turn → confirmed → held.
    page = (await call('POST', `/public/coach/${portal}/kickoff`, { times: 'Tue 6pm or Wed 7am' })).body;
    assert.equal(page.journey.current.owner, 'coach');
    c = (await call('POST', `/coaching/clients/${c.id}/kickoff`, { when: 'Tue 6pm' }, t)).body;
    assert.ok(c.updates.some((u) => /booked for Tue 6pm/.test(u.body)));
    c = (await call('POST', `/coaching/clients/${c.id}/steps/kickoff/done`, {}, t)).body;
    assert.equal(c.journey.current.key, 'programme');

    // Programme sent → week 1 starts, first check-in is next.
    assert.equal((await call('POST', `/coaching/clients/${c.id}/steps/programme/done`, { link: 'not a link' }, t)).status, 400);
    c = (await call('POST', `/coaching/clients/${c.id}/steps/programme/done`, { link: 'https://example.com/plan' }, t)).body;
    assert.ok(c.start_date);
    assert.equal(c.journey.current.key, 'first_checkin');
    assert.ok(c.journey.current.data.due_at, 'the first check-in is due a week in');

    // First check-in finishes onboarding.
    page = (await call('POST', `/public/coach/${portal}/checkin`, { value: 62.5, energy: 4, wins: 'Trained 3 times', struggles: 'Sleep' })).body;
    assert.equal(page.journey.onboarded, true);
    assert.equal(page.status, 'active');
    assert.deepEqual(page.progress.actual.map((p) => [p.week, p.value]), [[0, 60], [1, 62.5]]);
    assert.equal(page.progress.change, 2.5);
    assert.equal(page.progress.expected.length, 13);

    // Coach feedback reaches the client.
    c = (await call('POST', `/coaching/clients/${c.id}/checkins/1/reply`, { reply: 'Great start. Keep the 3 sessions.' }, t)).body;
    page = (await call('GET', `/public/coach/${portal}`)).body;
    assert.equal(page.progress.checkins[0].coach_reply, 'Great start. Keep the 3 sessions.');
    assert.ok(page.updates.some((u) => u.author === 'coach' && /Week 1 feedback/.test(u.body)));

    // Two-way messages on the shared timeline.
    await call('POST', `/public/coach/${portal}/messages`, { body: 'Can I swap Friday for Saturday?' });
    c = (await call('POST', `/coaching/clients/${c.id}/messages`, { body: 'Of course.' }, t)).body;
    assert.deepEqual(c.updates.slice(-2).map((u) => u.author), ['client', 'coach']);

    const list = (await call('GET', '/coaching', null, t)).body;
    assert.equal(list.clients[0].status, 'active');
    assert.equal(list.report.checking_in.length, 1);
  });

  test('another business can’t see your clients, and a bad link shows nothing', async () => {
    const a = await coach();
    const b = await coach();
    const c = (await call('POST', '/coaching/clients', { name: 'Priya' }, a)).body;
    assert.equal((await call('GET', `/coaching/clients/${c.id}`, null, b)).status, 404);
    assert.equal((await call('GET', '/public/coach/not-a-real-token')).status, 404);
  });
});

describe('nudges: 30 minutes, midday, the 5pm sweep, nothing after 7pm', () => {
  const tz = 'Europe/London';
  const at = (iso) => ({ opened_at: iso, nudges: 0, data: {} });
  test('the schedule', () => {
    // Opened 10:00 on a Tuesday in November (GMT): 10:30, then 12:00, then 17:00.
    assert.equal(nextNudgeAt(at('2026-11-17T10:00:00.000Z'), tz), '2026-11-17T10:30:00.000Z');
    assert.equal(nextNudgeAt({ ...at('2026-11-17T10:00:00.000Z'), nudges: 1, last_nudged_at: '2026-11-17T10:30:00.000Z' }, tz), '2026-11-17T12:00:00.000Z');
    assert.equal(nextNudgeAt({ ...at('2026-11-17T10:00:00.000Z'), nudges: 2, last_nudged_at: '2026-11-17T12:00:00.000Z' }, tz), '2026-11-17T17:00:00.000Z');
    assert.equal(nextNudgeAt({ ...at('2026-11-17T10:00:00.000Z'), nudges: 3 }, tz), null);
    // Opened 18:45: 19:15 is too late, so the first nudge waits for midday next day.
    assert.equal(nextNudgeAt(at('2026-11-17T18:45:00.000Z'), tz), '2026-11-18T12:00:00.000Z');
  });

  test('the scheduler sends them, and the coach hears about anyone still stuck', async () => {
    const t = await coach();
    let c = (await call('POST', '/coaching/clients', { name: 'Leon', email: 'leon@client.test', call_done: true }, t)).body;
    await call('POST', `/public/coach/${tokenOf(c.link)}/accept`);
    c = (await call('POST', `/coaching/clients/${c.id}/steps/payment/done`, {}, t)).body;
    const intake = db.get(`SELECT * FROM coaching_steps WHERE client_id = ? AND key = 'intake'`, c.id);
    db.update('coaching_steps', intake.id, { opened_at: '2026-11-17T10:00:00.000Z' });
    for (const when of ['2026-11-17T10:31:00Z', '2026-11-17T12:01:00Z', '2026-11-17T17:01:00Z', '2026-11-18T12:01:00Z']) runCoaching(ctx, new Date(when));
    const after = db.get('SELECT nudges FROM coaching_steps WHERE id = ?', intake.id);
    assert.equal(after.nudges, 3, 'three nudges, no more');
    const report = (await call('GET', '/coaching/report', null, t)).body;
    assert.ok(report.needs_word.some((x) => x.name === 'Leon' && /Intake form/.test(x.reason)));
  });
});

describe('the progress chart', () => {
  test('the expected path is slow for the first weeks, then picks up', () => {
    const f = (w) => expectedFraction(w, 12);
    assert.equal(f(0), 0);
    assert.ok(f(3) < 0.1, 'three weeks in: under a tenth of the way');
    assert.ok(f(6) - f(3) < f(9) - f(6) && f(9) - f(6) < f(12) - f(9), 'each stretch gains more than the last');
    assert.equal(f(12), 1);
    const down = expectedPath(90, 80, 12);
    assert.equal(down[0].value, 90);
    assert.equal(down.at(-1).value, 80);
    assert.deepEqual(expectedPath(null, 80, 12), []);
  });
});

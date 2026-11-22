import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { seedState } from '../public/hq/seed.js';
import { approve, earnings, runAll, scoreLead } from '../public/hq/engine.js';
import { actionsOn, doneOn, milestones, periodSummary, progress, toggleAction } from '../public/hq/results.js';

/** HQ: the AI team command centre – its API and how the agents behave. */

let server;
let base;
let token;
const saved = { ...config };

before(async () => {
  config.requirePasswords = true;
  config.anthropicApiKey = '';
  const made = createApp(openDatabase(':memory:'));
  server = made.app.listen(0);
  base = `http://localhost:${server.address().port}`;
  token = (await call('POST', '/auth/register', { name: 'Callum M', email: 'callum@hq.test', password: 'password123', business_name: 'CM Automations', niche: 'coaching' })).body.token;
});
after(() => { Object.assign(config, saved); server.close(); });

async function call(method, path, body, auth = true) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(auth && token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

describe('HQ API', () => {
  test('needs a sign-in', async () => {
    assert.equal((await call('GET', '/hq', undefined, false)).status, 401);
  });

  test('starts empty, then saves and loads the whole HQ', async () => {
    const first = await call('GET', '/hq');
    assert.equal(first.status, 200);
    assert.equal(first.body.state, null);
    assert.equal(first.body.ai, false);
    const state = seedState();
    state.profile.owner = 'Callum';
    assert.equal((await call('PUT', '/hq', { state })).status, 200);
    const again = await call('GET', '/hq');
    assert.equal(again.body.state.profile.owner, 'Callum');
    assert.equal(again.body.state.agents.length, 5);
  });

  test('rejects anything that is not an HQ document', async () => {
    assert.equal((await call('PUT', '/hq', { state: [] })).status, 400);
    assert.equal((await call('PUT', '/hq', {})).status, 400);
  });

  test('shares live CRM data', async () => {
    await call('POST', '/crm/contacts', { first_name: 'Jade', last_name: 'Morris', email: 'jade@lash.test', company: 'Luxe Lash', lifecycle: 'lead' });
    const live = await call('GET', '/hq/live');
    assert.equal(live.status, 200);
    assert.ok(Array.isArray(live.body.invoices));
    assert.ok(live.body.leads.some((l) => l.first_name === 'Jade'));
  });

  test('Claude endpoints say clearly when Claude is not connected', async () => {
    assert.equal((await call('POST', '/hq/ai/draft', { instruction: 'shorter' })).status, 503);
  });
});

describe('HQ agents', () => {
  test('the morning update answers leads, drafts quotes, chases and asks for sign-off', async () => {
    const s = seedState();
    await runAll(s, null);
    // Receptionist: auto-replied, flagged the scam, handed hot leads over.
    const scam = s.leads.find((l) => l.name === 'Mark Allen');
    assert.equal(scam.status, 'scam');
    const jade = s.leads.find((l) => l.name === 'Jade Morris');
    assert.ok(jade.thread.some((m) => m.from === 'auto'));
    assert.equal(jade.status, 'handed');
    assert.ok(s.deals.some((d) => d.client === 'Luxe Lash Studio'));
    // Deal Manager: quotes from the rate card and waits for approval.
    const bloom = s.deals.find((d) => d.client === 'Bloom Aesthetics');
    assert.equal(bloom.stage, 'drafted');
    assert.ok(bloom.quote.length >= 1);
    assert.ok(s.approvals.some((a) => a.kind === 'reply' && a.refId === bloom.id));
    assert.ok(s.approvals.some((a) => a.kind === 'followup'));
    // Finance: chases the overdue invoice; flags the very late one for a call.
    assert.ok(s.approvals.some((a) => a.kind === 'chase'));
    assert.ok(s.updates.finance.needs.some((n) => n.includes('Call Luxe Lash Studio')));
    // A contract that matches the quote is checked and sent to you to sign.
    assert.ok(s.approvals.some((a) => a.kind === 'contract' && a.title.includes('Harbour Dental') && a.title.includes('ready to sign')));
    // Agents talked to each other.
    assert.ok(s.activity.some((a) => a.from === 'receptionist' && a.to === 'deals'));
    assert.equal(s.meta.lastRunDate, new Date().toISOString().slice(0, 10));
  });

  test('approving a reply sends it; signing a contract opens a job and a deposit invoice', async () => {
    const s = seedState();
    await runAll(s, null);
    const reply = s.approvals.find((a) => a.kind === 'reply');
    approve(s, reply, 'Edited by me');
    const deal = s.deals.find((d) => d.id === reply.refId);
    assert.equal(deal.stage, 'sent');
    assert.equal(deal.draft, 'Edited by me');

    const contract = s.approvals.find((a) => a.kind === 'contract');
    approve(s, contract, contract.body);
    await runAll(s, null);
    const signed = s.deals.find((d) => d.id === contract.refId);
    assert.ok(s.projects.some((p) => p.dealId === signed.id));
    assert.ok(s.invoices.some((i) => i.client === signed.client && i.status === 'draft'));
    assert.ok(s.approvals.some((a) => a.kind === 'invoice'));
  });

  test('a contract that does not match the quote is raised with you', async () => {
    const s = seedState();
    s.deals.find((d) => d.client === 'Harbour Dental').contract.value = 2100;
    await runAll(s, null);
    assert.ok(s.updates.deals.needs.some((n) => n.includes('Harbour Dental') && n.includes('£2,100')));
    assert.ok(s.approvals.some((a) => a.kind === 'contract' && a.title.includes('doesn’t match')));
  });

  test('"Act on their own" agents send without asking', async () => {
    const s = seedState();
    s.agents.find((a) => a.id === 'finance').autonomy = 'auto';
    await runAll(s, null);
    assert.ok(!s.approvals.some((a) => a.kind === 'chase'));
    assert.ok(s.invoices.find((i) => i.number === 'INV-1043').chases.length === 2);
  });

  test('lead scoring and earnings add up', () => {
    const s = seedState();
    assert.ok(scoreLead(s, { budget: 2000, timeline: 'ASAP', need: 'website', message: '' }) >= 70);
    assert.ok(scoreLead(s, { budget: null, timeline: '', need: '', message: 'hi' }) < 45);
    const e = earnings(s);
    assert.ok(e.owed >= 750 + 750 + 297);
    assert.ok(e.pipeline > 0);
  });
});

describe('HQ results', () => {
  const today = new Date().toISOString().slice(0, 10);

  test('each client has a goal, progress and a status', () => {
    const [swift, glow, peak] = seedState().results;
    const p = progress(swift);
    assert.equal(p.now, 46200);
    assert.ok(p.toGoal > 0.8 && p.toGoal < 0.9);
    assert.equal(p.status, 'on-track');
    assert.equal(progress(glow).status, 'behind');
    assert.equal(progress(peak).status, 'starting'); // no fair read before the first check-in
  });

  test('daily actions change with the month of the plan, and ticking builds the log', () => {
    const swift = seedState().results[0];
    const titles = actionsOn(swift).map((a) => a.title);
    assert.ok(titles.some((t) => t.includes('commercial contract'))); // month 4 onwards
    const early = actionsOn(swift, swift.startDate).map((a) => a.title);
    assert.ok(!early.some((t) => t.includes('commercial contract')));
    const a = actionsOn(swift).find((x) => !doneOn(swift, today).has(x.id));
    assert.equal(toggleAction(swift, a.id), true);
    assert.ok(doneOn(swift, today).has(a.id));
    assert.equal(toggleAction(swift, a.id), false);
  });

  test('the period dropdown covers a week, 30 days, 3 months and 6 months', () => {
    const swift = seedState().results[0];
    const week = periodSummary(swift, 7);
    const half = periodSummary(swift, 180);
    assert.equal(week.days, 7);
    assert.ok(half.days > 140 && half.days <= 180); // started ~150 days ago
    assert.ok(half.done > week.done);
    assert.equal(half.change, 46200 - 20000);
    assert.equal(half.wins.length, 4);
    assert.equal(milestones(swift).length, 6);
    assert.equal(milestones(swift)[5].target, 50000);
  });

  test('the Project Manager flags clients who are behind or have gone quiet', async () => {
    const auto = seedState(); // Project Manager acts on its own by default: nudges straight away
    await runAll(auto, null);
    assert.ok(auto.updates.projects.needs.some((n) => n.startsWith('Glow Skin Clinic is behind')));
    assert.ok(auto.updates.projects.fixed.some((n) => n.startsWith('Nudged Glow Skin Clinic')));

    const s = seedState(); // "Ask me first": the nudge waits on your desk
    s.agents.find((a) => a.id === 'projects').autonomy = 'ask';
    await runAll(s, null);
    const nudge = s.approvals.find((a) => a.kind === 'results-nudge');
    assert.ok(nudge && nudge.title.includes('Glow Skin Clinic'));
    approve(s, nudge, nudge.body);
    assert.ok(s.results.find((r) => r.id === 'res_glow').nudgedAt);
  });
});

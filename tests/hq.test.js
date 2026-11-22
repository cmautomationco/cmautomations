import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { seedState } from '../public/hq/seed.js';
import { approve, earnings, runAll, scoreLead } from '../public/hq/engine.js';

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

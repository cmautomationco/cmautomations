import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { CHECKLIST, NICHE_GUIDES, PILLARS } from '../server/modules/seo/knowledge.js';
import { keywordIdeas } from '../server/modules/seo/routes.js';

/** SEO: the plan for each kind of business, the checklist, keywords and the guide. */

let server;
let base;
let db;
const saved = { ...config };

before(() => {
  config.requirePasswords = true;
  const made = createApp(openDatabase(':memory:'));
  db = made.ctx.db;
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
async function business(name, niche) {
  const reg = await call('POST', '/auth/register', { name: `${name} Owner`, email: `seo${++n}@seo.test`, password: 'password123', business_name: name, niche });
  assert.equal(reg.status, 201);
  return reg.body.token;
}

describe('the guide and checklist content', () => {
  test('every kind of business has a full guide, and every checklist job belongs to a real area', () => {
    for (const niche of ['coaching', 'ecommerce', 'local_services', 'fitness', 'beauty', 'hospitality', 'agency', 'real_estate', 'saas']) {
      const g = NICHE_GUIDES[niche];
      assert.ok(g, niche);
      assert.equal(new Set(g.priorities).size, PILLARS.length, `${niche} orders all seven areas`);
      for (const k of ['searches', 'kpi']) assert.ok(g[k].length > 20, `${niche}.${k}`);
      for (const k of ['gets', 'quickWins', 'content', 'services']) assert.ok(g[k].length >= 3, `${niche}.${k}`);
    }
    const keys = new Set();
    for (const c of CHECKLIST) {
      assert.ok(PILLARS.some((p) => p.key === c.pillar), c.key);
      assert.ok(!keys.has(c.key), `duplicate ${c.key}`);
      keys.add(c.key);
      assert.ok([1, 2, 3].includes(c.impact) && c.how.length > 30, c.key);
    }
    assert.ok(CHECKLIST.length >= 40);
  });
});

describe('a local trade business', () => {
  let token;
  before(async () => { token = await business('Pipe Pros', 'local_services'); });

  test('the plan puts the Google profile first and explains what SEO will do for them', async () => {
    const d = (await call('GET', '/seo', null, token)).body;
    assert.equal(d.local, true);
    assert.equal(d.guide.priorities[0].title, 'Google Business Profile');
    assert.match(d.guide.searches, /emergency plumber near me/);
    assert.equal(d.next[0].key, 'gbp_claim');
    assert.equal(d.score.pct, 0);
    assert.ok(d.checklist.some((i) => i.key === 'page_locations'), 'local jobs included');
    assert.ok(d.learn.pillars.length === 7 && d.learn.glossary.length > 10 && d.packages.length === 4);
  });

  test('ticking jobs off raises the score; jobs become tasks once', async () => {
    const r = (await call('PUT', '/seo/items/gbp_claim', { status: 'done' }, token)).body;
    assert.equal(r.item.status, 'done');
    assert.ok(r.score.pct > 0);
    assert.notEqual(r.next[0].key, 'gbp_claim');
    assert.equal((await call('PUT', '/seo/items/not_a_job', { status: 'done' }, token)).status, 404);
    assert.equal((await call('PUT', '/seo/items/gbp_photos', { status: 'finished' }, token)).status, 400);
    const t1 = (await call('POST', '/seo/items/tech_gsc/task', {}, token)).body;
    assert.equal(t1.existing, false);
    assert.match(t1.task.title, /^SEO: Set up Google Search Console/);
    assert.equal((await call('POST', '/seo/items/tech_gsc/task', {}, token)).body.existing, true);
    const d = (await call('GET', '/seo', null, token)).body;
    assert.equal(d.checklist.find((i) => i.key === 'tech_gsc').status, 'doing', 'a job with a task is in progress');
    const plan = (await call('POST', '/seo/plan', { count: 3 }, token)).body;
    assert.equal(plan.tasks.length, 3);
  });

  test('jobs already done in the system are ticked automatically', async () => {
    let d = (await call('GET', '/seo', null, token)).body;
    assert.equal(d.checklist.find((i) => i.key === 'rev_ask').status, 'todo');
    await call('POST', '/essentials/apply', { changes: [{ key: 'review_request', on: true, options: { review_link: 'https://g.page/r/pipepros/review' } }, { key: 'lead_source', on: true }] }, token);
    d = (await call('GET', '/seo', null, token)).body;
    for (const k of ['rev_ask', 'rev_link', 'measure_source']) {
      const item = d.checklist.find((i) => i.key === k);
      assert.equal(item.status, 'done', k);
      assert.ok(item.detected, k);
    }
  });

  test('keyword ideas come from their services and areas, grouped by intent, and can be tracked', async () => {
    await call('PUT', '/seo/profile', { location: 'Bristol', areas: 'Clifton, Bath', services: 'boiler service, emergency plumber' }, token);
    const ideas = (await call('POST', '/seo/keywords/ideas', {}, token)).body;
    const phrases = ideas.map((i) => i.phrase);
    for (const want of ['boiler service bristol', 'boiler service near me', 'boiler service clifton', 'emergency boiler service bristol', 'emergency plumber bristol', 'plumber bristol', 'boiler service cost bristol']) assert.ok(phrases.includes(want), want);
    assert.ok(!phrases.some((p) => p.includes('emergency emergency')));
    assert.equal(ideas.find((i) => i.phrase === 'boiler service clifton').page, 'Location page: Clifton');
    assert.ok(ideas.every((i) => ['urgent', 'ready', 'compare', 'learn'].includes(i.intent)));
    const added = (await call('POST', '/seo/keywords', { keywords: [ideas[0], ideas[1], ideas[0]] }, token)).body;
    assert.equal(added.added, 2, 'no duplicates');
    const k = added.keywords[0];
    await call('PATCH', `/seo/keywords/${k.id}`, { position: 18 }, token);
    const moved = (await call('PATCH', `/seo/keywords/${k.id}`, { position: 7 }, token)).body;
    assert.deepEqual([moved.position, moved.previous, moved.history.length], [7, 18, 2]);
    assert.equal((await call('PATCH', `/seo/keywords/${k.id}`, { position: 150 }, token)).status, 400);
    assert.equal((await call('POST', '/seo/keywords/ideas', {}, token)).body.find((i) => i.phrase === k.phrase).tracked, true);
    assert.equal((await call('DELETE', `/seo/keywords/${k.id}`, null, token)).status, 200);
  });
});

describe('an online business', () => {
  test('content comes first, local-only jobs are left out, and keywords aren’t tied to a town', async () => {
    const token = await business('Clear Path Coaching', 'coaching');
    const d = (await call('GET', '/seo', null, token)).body;
    assert.equal(d.local, false);
    assert.equal(d.guide.priorities[0].title, 'Helpful content');
    assert.ok(!d.checklist.some((i) => i.local));
    const ideas = keywordIdeas({ guide: { ...NICHE_GUIDES.coaching, local: false }, services: ['career coaching'], location: '', areas: [] }).map((i) => i.phrase);
    assert.ok(ideas.includes('career coaching online'));
    assert.ok(!ideas.some((p) => p.includes('near me')));
  });

  test('a team member can tick jobs but not change the business’s services and areas', async () => {
    const token = await business('Team Check', 'beauty');
    const orgId = db.get(`SELECT o.id FROM organizations o WHERE o.name = 'Team Check'`).id;
    db.insert('users', { id: 'usr_seo_member', email: 'm@seo.test', name: 'Mo', password_hash: 'x:y', created_at: new Date().toISOString() });
    db.insert('memberships', { org_id: orgId, user_id: 'usr_seo_member', role: 'member' });
    db.insert('sessions', { token: 'seo-member-token', user_id: 'usr_seo_member', org_id: orgId, expires_at: '2999-01-01T00:00:00Z' });
    assert.equal((await call('PUT', '/seo/items/gbp_photos', { status: 'done' }, 'seo-member-token')).status, 200);
    assert.equal((await call('PUT', '/seo/profile', { location: 'Bath' }, 'seo-member-token')).status, 403);
    assert.ok(token);
  });
});

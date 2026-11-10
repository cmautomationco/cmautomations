import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';

/** The personal Life Dashboard syncing between a phone and a laptop, and its social figures ↔ the API hub. */

let server;
let base;
let me;
let other;
const saved = { ...config };

before(async () => {
  config.requirePasswords = true;
  const made = createApp(openDatabase(':memory:'));
  server = made.app.listen(0);
  base = `http://localhost:${server.address().port}`;
  me = (await call('POST', '/auth/register', { name: 'Callum', email: 'me@life.test', password: 'password123', business_name: 'CM Automations' })).body.token;
  other = (await call('POST', '/auth/register', { name: 'Sam', email: 'sam@life.test', password: 'password123', business_name: 'Sam Co' })).body.token;
});
after(() => { Object.assign(config, saved); server.close(); });

async function call(method, path, body, token) {
  const res = await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

describe('Life Dashboard sync', () => {
  test('needs you to be signed in', async () => {
    assert.equal((await call('GET', '/life/state')).status, 401);
    assert.equal((await call('PUT', '/life/state', { data: {}, base_version: 0 })).status, 401);
  });

  test('starts empty, then the first device saves version 1', async () => {
    const empty = await call('GET', '/life/state', null, me);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, { version: 0, updated_at: null, device: null, data: null });
    const first = await call('PUT', '/life/state', { data: { tasks: [{ id: 't1', title: 'Book dentist' }] }, base_version: 0, device: 'Laptop' }, me);
    assert.equal(first.status, 200);
    assert.equal(first.body.version, 1);
    const back = (await call('GET', '/life/state', null, me)).body;
    assert.equal(back.version, 1);
    assert.equal(back.device, 'Laptop');
    assert.equal(back.data.tasks[0].title, 'Book dentist');
  });

  test('a device that is behind is refused and handed the latest copy to merge – nothing is overwritten', async () => {
    const phone = await call('PUT', '/life/state', { data: { tasks: [{ id: 't1', title: 'Book dentist' }, { id: 't2', title: 'Walk' }] }, base_version: 1, device: 'iPhone' }, me);
    assert.equal(phone.body.version, 2);
    const laptop = await call('PUT', '/life/state', { data: { tasks: [{ id: 't1', title: 'Book dentist' }, { id: 't3', title: 'Pay council tax' }] }, base_version: 1, device: 'Laptop' }, me);
    assert.equal(laptop.status, 409);
    assert.equal(laptop.body.version, 2);
    assert.equal(laptop.body.device, 'iPhone');
    assert.deepEqual(laptop.body.data.tasks.map((t) => t.id), ['t1', 't2']);
    // After merging, the laptop saves on top of version 2.
    const merged = await call('PUT', '/life/state', { data: { tasks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }] }, base_version: 2, device: 'Laptop' }, me);
    assert.equal(merged.body.version, 3);
  });

  test('each person only ever sees their own dashboard', async () => {
    const theirs = (await call('GET', '/life/state', null, other)).body;
    assert.equal(theirs.version, 0);
    assert.equal(theirs.data, null);
    await call('PUT', '/life/state', { data: { secret: 'sam' }, base_version: 0 }, other);
    assert.notEqual((await call('GET', '/life/state', null, me)).body.data.secret, 'sam');
  });

  test('rejects nonsense and copes with a big dashboard', async () => {
    assert.equal((await call('PUT', '/life/state', { data: [1, 2], base_version: 3 }, me)).status, 400);
    assert.equal((await call('PUT', '/life/state', { data: {}, base_version: 'x' }, me)).status, 400);
    const big = { notes: Array.from({ length: 4000 }, (_, i) => ({ id: `n${i}`, text: 'x'.repeat(500) })) }; // ~2 MB
    const res = await call('PUT', '/life/state', { data: big, base_version: 3 }, me);
    assert.equal(res.status, 200);
    assert.equal((await call('GET', '/life/state', null, me)).body.data.notes.length, 4000);
  });
});

describe('Life Dashboard social channels ↔ API hub', () => {
  test('follower figures flow both ways', async () => {
    const tiktok = (await call('POST', '/streams', { type: 'tiktok', name: 'TikTok', handle: '@cm' }, me)).body;
    const yt = (await call('POST', '/streams', { type: 'youtube', name: 'YouTube' }, me)).body;
    await call('POST', '/streams', { type: 'trading', name: 'Trading' }, me);
    await call('POST', `/streams/${tiktok.id}/metrics`, { followers: 9800, date: '2026-11-01' }, me);

    const list = (await call('GET', '/life/socials', null, me)).body;
    assert.deepEqual(list.map((s) => s.name), ['TikTok', 'YouTube'], 'trading isn\'t a social channel');
    const tt = list.find((s) => s.id === tiktok.id);
    assert.equal(tt.key, 'followers');
    assert.deepEqual(tt.points, [{ date: '2026-11-01', value: 9800 }]);
    assert.equal(list.find((s) => s.id === yt.id).key, 'subscribers');

    // Updating it in the dashboard records it in the hub.
    const sent = await call('POST', `/life/socials/${tiktok.id}`, { count: 10250, date: '2026-11-08' }, me);
    assert.equal(sent.status, 201);
    const hub = (await call('GET', `/streams/${tiktok.id}`, null, me)).body;
    const followers = hub.summary.metrics.find((m) => m.key === 'followers');
    assert.equal(followers.latest.value, 10250);
    assert.equal((await call('POST', `/life/socials/${yt.id}`, { count: 640 }, me)).body.key, 'subscribers');

    assert.equal((await call('POST', `/life/socials/${tiktok.id}`, { count: 'lots' }, me)).status, 400);
    assert.equal((await call('POST', `/life/socials/${tiktok.id}`, { count: 5 }, other)).status, 404, 'other businesses\' streams are off limits');
  });
});

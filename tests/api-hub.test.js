import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import Stripe from 'stripe';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { parseCsv, parseDate, parseMoney, remindMissingMonths, taxYear } from '../server/modules/streams/service.js';

/** The API hub: separate income streams, their web addresses, and the key-protected API. */

let server;
let base;
let db;
let ctx;
let token;
const saved = { ...config };
const streams = {};

before(async () => {
  config.requirePasswords = true;
  const made = createApp(openDatabase(':memory:'));
  ({ ctx } = made);
  db = ctx.db;
  server = made.app.listen(0);
  base = `http://localhost:${server.address().port}`;
  config.publicUrl = base;
  token = (await call('POST', '/auth/register', { name: 'Jo', email: 'jo@hub.test', password: 'password123', business_name: 'Jo Ventures', niche: 'coaching' })).body.token;
  for (const [type, extra] of [['tiktok', { handle: '@jo', goal_monthly_pence: 50000 }], ['trading', { name: 'Trading 212' }], ['digital_products', { tax_set_aside_pct: 25 }]]) {
    streams[type] = (await call('POST', '/streams', { type, ...extra })).body;
  }
});
after(() => { Object.assign(config, saved); server.close(); });

async function call(method, path, body, headers) {
  const h = headers || (token ? { authorization: `Bearer ${token}` } : {});
  const res = await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json', ...h }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const hookPath = (s) => `/hooks/stream/${db.get('SELECT hook_token FROM income_streams WHERE id = ?', s.id).hook_token}`;
const total = (s) => db.get(`SELECT COALESCE(SUM(CASE kind WHEN 'income' THEN amount_pence WHEN 'expense' THEN -amount_pence ELSE 0 END),0) AS n FROM stream_entries WHERE stream_id = ?`, s.id).n;

describe('reading money, dates and spreadsheets', () => {
  test('amounts in any format', () => {
    assert.equal(parseMoney('£1,234.50'), 123450);
    assert.equal(parseMoney('-12'), -1200);
    assert.equal(parseMoney('(45.10)'), -4510);
    assert.equal(parseMoney('1.234,56'), 123456);
    assert.equal(parseMoney('12.00 DR'), -1200);
    assert.equal(parseMoney('abc'), null);
  });
  test('dates the UK way round, ISO and written out', () => {
    assert.equal(parseDate('09/10/2026'), '2026-10-09');
    assert.equal(parseDate('2026-10-09 14:00:00'), '2026-10-09');
    assert.equal(parseDate('9 Oct 2026'), '2026-10-09');
    assert.equal(parseDate('Oct 9, 2026'), '2026-10-09');
    assert.equal(parseDate('2026-10-08T23:30:00Z'), '2026-10-09', 'late evening UTC is the next day in London (BST)');
    assert.equal(parseDate('32/13/2026'), null);
  });
  test('UK tax year runs 6 April to 5 April', () => {
    assert.deepEqual(taxYear('2026-04-05'), { start: '2025-04-06', end: '2026-04-05', label: '2025/26' });
    assert.equal(taxYear('2026-04-06').label, '2026/27');
  });
  test('CSV with quotes, commas and semicolons', () => {
    assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
    assert.deepEqual(parseCsv('Date;Amount\n01/10/2026;12,50'), [['Date', 'Amount'], ['01/10/2026', '12,50']]);
  });
});

describe('income streams kept separate', () => {
  test('each stream has its own entries, figures and totals', async () => {
    const tt = streams.tiktok;
    assert.equal((await call('POST', `/streams/${tt.id}/entries`, { amount: '412.30', category: 'Creator Rewards', date: '2026-10-02' })).status, 201);
    await call('POST', `/streams/${tt.id}/entries`, { kind: 'expense', amount: 9.99, category: 'Editing apps & software' });
    await call('POST', `/streams/${tt.id}/metrics`, { followers: 15200, views_30d: '480,000' });
    const d = (await call('GET', `/streams/${tt.id}`)).body;
    assert.equal(d.type.label, 'TikTok');
    assert.ok(d.type.income.includes('Creator Rewards'));
    assert.equal(d.summary.metrics.find((m) => m.key === 'followers').latest.value, 15200);
    assert.equal(d.summary.metrics.find((m) => m.key === 'views_30d').latest.value, 480000);
    assert.match(d.hook_url, /\/api\/hooks\/stream\/[0-9a-f]{36}$/);
    assert.equal((await call('GET', `/streams/${streams.trading.id}`)).body.summary.month.count, 0, 'nothing leaks into another stream');
  });

  test('a negative amount is money out, and deposits are not profit', async () => {
    const tr = streams.trading;
    const loss = (await call('POST', `/streams/${tr.id}/entries`, { amount: -42.5, category: 'Closed trade', symbol: 'EURUSD' })).body.entry;
    assert.equal(loss.kind, 'expense');
    assert.equal(loss.amount_pence, 4250);
    assert.equal(loss.reference, 'EURUSD');
    await call('POST', `/streams/${tr.id}/entries`, { type: 'deposit', amount: 1000 });
    const s = (await call('GET', `/streams/${tr.id}`)).body.summary;
    assert.equal(s.month.net_pence, -4250);
    assert.equal(s.month.transfer_in_pence, 100000);
    assert.equal(s.tax_year.set_aside_pence, 0, 'nothing to put aside on a loss');
  });

  test('a broker statement imports wins, losses and deposits – and only once', async () => {
    const tr = streams.trading;
    const csv = 'Action,Time,Ticker,Name,Result,Total,Currency (Result)\nDeposit,2026-10-01 09:00:00,,,,"500.00",GBP\nMarket sell,2026-10-03 14:00:00,TSLA,Tesla,45.20,300.00,GBP\nMarket sell,2026-10-05 10:00:00,AAPL,Apple,-12.10,200,GBP\nMarket buy,2026-10-06 10:00:00,NVDA,Nvidia,,500,GBP\nDividend (Ordinary),2026-10-07 10:00:00,MSFT,Microsoft,,1.20,GBP\n';
    const dry = (await call('POST', `/streams/${tr.id}/import`, { csv, dry_run: true })).body;
    assert.equal(dry.mapping.amount, 'Result');
    assert.equal(dry.mapping.reference, 'Ticker');
    assert.equal(dry.readable, 3);
    assert.ok(dry.skipped.some((s) => /opening a trade/.test(s.reason)));
    const first = (await call('POST', `/streams/${tr.id}/import`, { csv })).body;
    assert.equal(first.recorded, 3);
    const again = (await call('POST', `/streams/${tr.id}/import`, { csv })).body;
    assert.equal(again.recorded, 0);
    assert.equal(again.duplicates, 3);
    const stats = (await call('GET', `/streams/${tr.id}`)).body.summary.stats;
    assert.equal(stats.kind, 'trading');
    assert.equal(stats.wins, 1);
    assert.equal(stats.losses, 2);
    assert.equal(stats.win_rate, 33);
  });

  test('the hub adds up every £ stream, and different currencies are kept out', async () => {
    const usd = (await call('POST', '/streams', { type: 'affiliate', name: 'US affiliate', currency: 'USD' })).body;
    await call('POST', `/streams/${usd.id}/entries`, { amount: 500 });
    const hub = (await call('GET', '/streams')).body;
    assert.equal(hub.streams.length, 4);
    assert.ok(hub.not_counted.some((s) => s.name === 'US affiliate'));
    const pounds = hub.streams.filter((s) => s.currency === 'GBP').reduce((t, s) => t + s.summary.month.net_pence, 0);
    assert.equal(hub.totals.month_net_pence, pounds);
    await call('PATCH', `/streams/${usd.id}`, { archived: true });
    assert.equal((await call('GET', '/streams')).body.streams.length, 3, 'archived streams leave the hub');
  });

  test('money coming in can trigger automations', async () => {
    db.insert('automations', {
      id: 'aut_bigsale', org_id: streams.tiktok.org_id, name: 'Big brand deal', description: null, trigger: 'income.received',
      conditions: JSON.stringify([{ field: 'entry.amount', op: 'gte', value: 500 }]), actions: JSON.stringify([{ type: 'create_task', title: 'Thank {{stream.name}} sponsor and post the content', due_in_days: 1 }]),
      enabled: 1, run_count: 0, created_at: new Date().toISOString(),
    });
    const r = (await call('POST', `/streams/${streams.tiktok.id}/entries`, { amount: 750, category: 'Brand deal' })).body;
    assert.equal(r.automations.length, 1);
    assert.ok(db.get(`SELECT 1 FROM tasks WHERE title = 'Thank TikTok sponsor and post the content'`));
  });
});

describe('each stream’s own web address', () => {
  test('any app can send entries and figures; repeats are ignored', async () => {
    const dp = streams.digital_products;
    const before = total(dp);
    const r = await call('POST', hookPath(dp), [{ amount: 10, id: 'a1' }, { amount: 10, id: 'a1' }, { amount: -3, description: 'fee', category: 'Platform & payment fees' }], {});
    assert.deepEqual([r.status, r.body.recorded, r.body.duplicates], [200, 2, 1]);
    assert.equal(total(dp) - before, 700);
    const m = await call('POST', hookPath(dp), { metrics: { customers: 410 } }, {});
    assert.deepEqual(m.body.metrics, { customers: 410 });
    assert.equal((await call('POST', hookPath(dp), { hello: 'there' }, {})).status, 400);
    assert.equal((await call('POST', '/hooks/stream/not-a-real-address-at-all-123', { amount: 1 }, {})).status, 404);
  });

  test('Stripe: a sale counts once however many events arrive, refunds count only what’s new', async () => {
    const dp = streams.digital_products;
    const before = total(dp);
    const charge = { object: 'event', type: 'charge.succeeded', data: { object: { id: 'ch_1', amount: 2900, currency: 'gbp', created: 1791600000, payment_intent: 'pi_1', description: 'Template pack' } } };
    const session = { object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_1', amount_total: 2900, currency: 'gbp', created: 1791600000, payment_intent: 'pi_1', payment_status: 'paid', mode: 'payment' } } };
    assert.equal((await call('POST', hookPath(dp), charge, {})).body.recorded, 1);
    assert.equal((await call('POST', hookPath(dp), session, {})).body.duplicates, 1);
    assert.equal(total(dp) - before, 2900);
    const refund = (amount) => ({ object: 'event', type: 'charge.refunded', data: { object: { id: 'ch_1', amount: 2900, amount_refunded: amount, currency: 'gbp', created: 1791600500 } } });
    await call('POST', hookPath(dp), refund(1000), {});
    await call('POST', hookPath(dp), refund(1000), {});
    await call('POST', hookPath(dp), refund(2900), {});
    assert.equal(total(dp) - before, 0, 'partial then full refund = £29 back in total, never more');
    assert.equal((await call('POST', hookPath(dp), { object: 'event', type: 'customer.created', data: { object: {} } }, {})).body.ignored, 'customer.created isn’t money in or out');
  });

  test('Stripe: with a signing secret, only events signed by Stripe are accepted', async () => {
    const dp = streams.digital_products;
    const secret = 'whsec_test_hub_secret_123456';
    assert.equal((await call('PUT', `/streams/${dp.id}/hook/secret`, { secret })).body.hook_signed, true);
    const payload = JSON.stringify({ object: 'event', type: 'charge.succeeded', data: { object: { id: 'ch_2', amount: 1500, currency: 'gbp', created: 1791600000, payment_intent: 'pi_2' } } });
    const signature = new Stripe('sk_test_x').webhooks.generateTestHeaderString({ payload, secret });
    assert.equal((await call('POST', hookPath(dp), payload, { 'stripe-signature': signature })).body.recorded, 1);
    assert.equal((await call('POST', hookPath(dp), payload.replace('1500', '150000'), { 'stripe-signature': signature })).status, 400);
    assert.equal((await call('POST', hookPath(dp), payload, {})).status, 400, 'unsigned is refused');
    await call('PUT', `/streams/${dp.id}/hook/secret`, { secret: '' });
  });

  test('Shopify orders and refunds, with the HMAC check', async () => {
    const shop = (await call('POST', '/streams', { type: 'ecommerce', name: 'Shopify store' })).body;
    const secret = 'shpss_test_secret_abcdef';
    await call('PUT', `/streams/${shop.id}/hook/secret`, { secret });
    const order = JSON.stringify({ id: 820982911946154500, name: '#1001', total_price: '45.00', currency: 'GBP', financial_status: 'paid', created_at: '2026-10-09T10:00:00+01:00', line_items: [{ title: 'Preset bundle', quantity: 1 }] });
    const sign = (body) => crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
    assert.equal((await call('POST', hookPath(shop), order, { 'x-shopify-topic': 'orders/paid', 'x-shopify-hmac-sha256': 'bad' })).status, 401);
    assert.equal((await call('POST', hookPath(shop), order, { 'x-shopify-topic': 'orders/paid', 'x-shopify-hmac-sha256': sign(order) })).body.recorded, 1);
    const refund = JSON.stringify({ id: 929361465, order_id: 820982911946154500, created_at: '2026-10-10T10:00:00+01:00', transactions: [{ kind: 'refund', status: 'success', amount: '15.00', currency: 'GBP' }] });
    assert.equal((await call('POST', hookPath(shop), refund, { 'x-shopify-topic': 'refunds/create', 'x-shopify-hmac-sha256': sign(refund) })).body.recorded, 1);
    assert.equal(total(shop), 3000);
    const entry = db.get(`SELECT * FROM stream_entries WHERE stream_id = ? AND kind = 'income'`, shop.id);
    assert.equal(entry.date, '2026-10-09');
    assert.match(entry.description, /#1001 – Preset bundle/);
  });

  test('Gumroad pings (form-encoded, price in pence)', async () => {
    const dp = streams.digital_products;
    const before = total(dp);
    const res = await fetch(`${base}/api${hookPath(dp)}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ seller_id: 's1', sale_id: 'g1', product_name: 'Content planner', price: '1500', currency: 'gbp', email: 'b@x.co', sale_timestamp: '2026-10-09T12:00:00Z' }) });
    assert.equal((await res.json()).recorded, 1);
    assert.equal(total(dp) - before, 1500);
  });

  test('“Send a test” uses the same code, marks the entry as a test, and tests can be removed', async () => {
    const dp = streams.digital_products;
    const r = (await call('POST', `/streams/${dp.id}/hook/test`, { sample: 'gumroad' })).body;
    assert.equal(r.result.recorded, 1);
    assert.equal((await call('GET', `/streams/${dp.id}`)).body.summary.test_entries, 1);
    assert.equal((await call('DELETE', `/streams/${dp.id}/test-entries`)).body.removed, 1);
    const log = (await call('GET', '/api-keys/activity?kind=webhook')).body;
    assert.ok(log.some((l) => /^Test · Gumroad: 1 recorded/.test(l.summary)));
  });

  test('a new address stops the old one working', async () => {
    const old = hookPath(streams.tiktok);
    await call('POST', `/streams/${streams.tiktok.id}/hook/rotate`);
    assert.equal((await call('POST', old, { amount: 1 }, {})).status, 404);
  });
});

describe('the API (keys)', () => {
  let tiktokKey;
  let fullKey;
  test('keys are shown once, stored only as a hash, and can be limited to one stream', async () => {
    const r = await call('POST', '/api-keys', { name: 'Zapier – TikTok', scopes: ['income:read', 'income:write'], stream_id: streams.tiktok.id });
    assert.equal(r.status, 201);
    tiktokKey = r.body.key;
    assert.match(tiktokKey, /^cmk_live_[0-9a-f]{40}$/);
    assert.ok(!db.get('SELECT 1 FROM api_keys WHERE key_hash = ?', tiktokKey), 'the key itself is never stored');
    assert.ok(!JSON.stringify((await call('GET', '/api-keys')).body).includes(tiktokKey));
    assert.equal((await call('POST', '/api-keys', { name: 'x', scopes: ['contacts:write'], stream_id: streams.tiktok.id })).status, 400, 'stream keys only get income permissions');
    fullKey = (await call('POST', '/api-keys', { name: 'Website', scopes: ['contacts:read', 'contacts:write', 'tasks:write', 'income:read', 'bookings:read', 'invoices:read'] })).body.key;
  });

  test('a single-stream key can use its own stream and nothing else', async () => {
    const K = { authorization: `Bearer ${tiktokKey}` };
    const me = (await call('GET', '/v1', undefined, K)).body;
    assert.equal(me.key.stream.name, 'TikTok');
    assert.equal((await call('POST', `/v1/streams/${streams.tiktok.id}/entries`, { amount: 99, category: 'Brand deal', id: 'deal-1' }, K)).status, 201);
    assert.equal((await call('POST', `/v1/streams/${streams.tiktok.id}/entries`, { amount: 99, category: 'Brand deal', id: 'deal-1' }, K)).body.duplicate, true);
    assert.equal((await call('POST', `/v1/streams/${streams.trading.id}/entries`, { amount: 99 }, K)).status, 403);
    assert.deepEqual((await call('GET', '/v1/streams', undefined, K)).body.map((s) => s.name), ['TikTok']);
    assert.equal((await call('GET', '/v1/summary', undefined, K)).body.totals, undefined, 'no all-streams totals for a single-stream key');
    assert.equal((await call('POST', '/v1/contacts', { first_name: 'A', email: 'a@b.co' }, K)).status, 403);
    assert.ok(!('hook_token' in (await call('GET', `/v1/streams/${streams.tiktok.id}`, undefined, K)).body), 'the web address is never given out');
    assert.equal((await call('POST', `/v1/streams/${streams.tiktok.id}/metrics`, { followers: 16000 }, K)).status, 201);
  });

  test('a full key adds leads (running the new-lead automations) and tasks, and reads bookings and invoices', async () => {
    const F = { authorization: `Bearer ${fullKey}` };
    const lead = await call('POST', '/v1/contacts', { first_name: 'Sam', last_name: 'Patel', email: 'sam@x.co', source: 'TikTok', tags: ['tiktok'] }, F);
    assert.equal(lead.status, 201);
    assert.ok(lead.body.automations_run >= 1);
    assert.equal((await call('POST', '/v1/contacts', { first_name: 'Sam', email: 'sam@x.co' }, F)).body.created, false, 'the same person isn’t added twice');
    assert.equal((await call('GET', '/v1/contacts?search=patel', undefined, F)).body.length, 1);
    assert.equal((await call('POST', '/v1/tasks', { title: 'Film launch video', priority: 'high', due_at: '2026-10-15T09:00:00Z' }, F)).status, 201);
    assert.equal((await call('POST', '/v1/tasks', { title: 'x', due_at: 'next tuesday' }, F)).status, 400);
    assert.ok(Array.isArray((await call('GET', '/v1/bookings', undefined, F)).body));
    assert.ok(Array.isArray((await call('GET', '/v1/invoices', undefined, F)).body));
    assert.ok((await call('GET', '/v1/summary', undefined, F)).body.totals);
    assert.equal((await call('GET', '/v1/nothing-here', undefined, F)).status, 404);
  });

  test('bad and revoked keys are refused, and every request is in the activity log', async () => {
    assert.equal((await call('GET', '/v1', undefined, { authorization: 'Bearer cmk_live_nope' })).status, 401);
    assert.equal((await call('GET', '/v1', undefined, {})).status, 401);
    const keys = (await call('GET', '/api-keys')).body.keys;
    await call('DELETE', `/api-keys/${keys.find((k) => k.name === 'Website').id}`);
    assert.equal((await call('GET', '/v1', undefined, { authorization: `Bearer ${fullKey}` })).status, 401);
    const log = (await call('GET', '/api-keys/activity?kind=api')).body;
    assert.ok(log.some((l) => l.status === 403 && l.key_name === 'Zapier – TikTok'));
    assert.ok(log.some((l) => l.status === 201 && /Added Sam Patel/.test(l.summary)));
  });

  test('a team member can’t create keys', async () => {
    const orgId = streams.tiktok.org_id;
    const u = { id: 'usr_member1', email: 'm@hub.test', name: 'Mo', password_hash: 'x:y', created_at: new Date().toISOString() };
    db.insert('users', u);
    db.insert('memberships', { org_id: orgId, user_id: u.id, role: 'member' });
    db.insert('sessions', { token: 'member-token', user_id: u.id, org_id: orgId, expires_at: '2999-01-01T00:00:00Z' });
    assert.equal((await call('POST', '/api-keys', { name: 'x', scopes: ['income:read'] }, { authorization: 'Bearer member-token' })).status, 403);
  });
});

describe('keeping things in check', () => {
  test('early in the month, a stream with nothing recorded last month gets a task – once', async () => {
    const s = (await call('POST', '/streams', { type: 'youtube' })).body;
    db.run('UPDATE income_streams SET created_at = ? WHERE id = ?', '2026-08-01T00:00:00Z', s.id);
    const at = new Date('2026-11-02T09:00:00Z');
    assert.ok(remindMissingMonths(ctx, at) >= 1);
    assert.ok(db.get(`SELECT 1 FROM tasks WHERE title = 'Add October 2026 figures for YouTube'`));
    const again = remindMissingMonths(ctx, at);
    assert.equal(db.get(`SELECT COUNT(*) AS n FROM tasks WHERE title = 'Add October 2026 figures for YouTube'`).n, 1);
    assert.equal(again, 0);
    assert.equal(remindMissingMonths(ctx, new Date('2026-11-15T09:00:00Z')), 0, 'only in the first few days');
  });
});

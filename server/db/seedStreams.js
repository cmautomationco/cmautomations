import crypto from 'node:crypto';
import { id, publicToken, seededRandom } from '../lib/util.js';
import { addLocalDays, localDate } from '../lib/time.js';

/**
 * Demo data for the API hub: Alex (Bright Path Coaching) has four incomes –
 * TikTok, a trading account, digital products and 1:1 coaching – each with
 * about seven months of history, figures, and data arriving automatically.
 */

const TZ = 'Europe/London';
const pad = (n) => String(n).padStart(2, '0');

export function seedIncomeStreams(db, org, owner, { at = new Date() } = {}) {
  if (db.get('SELECT 1 FROM income_streams WHERE org_id = ?', org.id)) return false;
  const rand = seededRandom('cm-income-streams');
  const between = (a, b) => a + rand() * (b - a);
  const pickOne = (list) => list[Math.floor(rand() * list.length)];
  const today = localDate(at, TZ);
  const [ty, tm] = today.split('-').map(Number);
  // The first of the month, six months ago.
  const startMonth = new Date(Date.UTC(ty, tm - 1 - 6, 1));
  const start = `${startMonth.getUTCFullYear()}-${pad(startMonth.getUTCMonth() + 1)}-01`;
  const months = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + i, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  });
  const dayIn = (ym, day) => {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${ym}-${pad(Math.min(last, Math.max(1, Math.round(day))))}`;
  };
  const ok = (date) => date <= today;

  let position = 0;
  const stream = (type, name, extra = {}) => {
    const s = {
      id: id('str'), org_id: org.id, type, name, handle: extra.handle || null, currency: 'GBP', goal_monthly_pence: extra.goal || null,
      tax_set_aside_pct: extra.tax ?? 20, notes: null, hook_token: publicToken(), hook_secret: null, position: position++, archived: 0,
      created_by: owner.id, created_at: `${start}T09:00:00.000Z`, updated_at: `${start}T09:00:00.000Z`,
    };
    db.insert('income_streams', s);
    return s;
  };
  const entry = (s, date, kind, pounds, category, description, { reference = null, source = 'manual', external = null, meta = {} } = {}) => {
    if (!ok(date)) return;
    db.insert('stream_entries', {
      id: id('ent'), org_id: org.id, stream_id: s.id, date, kind, amount_pence: Math.round(pounds * 100), currency: 'GBP', category, description, reference,
      source, external_id: external, meta, created_by: source === 'manual' || source === 'import' ? owner.id : null, created_at: `${date}T${pad(9 + Math.floor(rand() * 10))}:${pad(Math.floor(rand() * 60))}:00.000Z`,
    });
  };
  const metric = (s, key, date, value, source = 'manual') => {
    if (!ok(date)) return;
    db.run(`INSERT OR REPLACE INTO stream_metrics (id, org_id, stream_id, key, date, value, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id('met'), org.id, s.id, key, date, value, source, `${date}T08:00:00.000Z`);
  };
  const weeks = [];
  for (let d = start; d <= today; d = addLocalDays(d, 7)) weeks.push(d);

  // ── TikTok ──
  const tiktok = stream('tiktok', 'TikTok', { handle: '@brightpath.alex', goal: 80000 });
  months.forEach((ym, i) => {
    entry(tiktok, dayIn(ym, 9), 'income', 180 + i * 55 + between(-20, 40), 'Creator Rewards', `${new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long' })} Creator Rewards`, { source: 'import', external: `csv:tt-rewards-${ym}` });
    for (let g = 0; g < 2 + (i > 3 ? 1 : 0); g++) entry(tiktok, dayIn(ym, between(2, 27)), 'income', between(12, 70), 'LIVE gifts', 'LIVE Q&A gifts');
    for (let c = 0; c < 3 + Math.floor(i / 2); c++) {
      const date = dayIn(ym, between(1, 28));
      entry(tiktok, date, 'income', between(14, 58), 'TikTok Shop commission', `Commission – ${pickOne(['Ring light', 'Desk planner', 'Notebook set', 'Laptop stand'])}`, { source: 'webhook', external: `zap-${ym}-${c}` });
    }
    entry(tiktok, dayIn(ym, 3), 'expense', 9.99, 'Editing apps & software', 'CapCut Pro');
    if (i % 2 === 1) entry(tiktok, dayIn(ym, 14), 'expense', between(25, 45), 'Promote / ads', 'Promote – career tips video');
  });
  entry(tiktok, dayIn(months[1], 20), 'expense', 189, 'Equipment', 'Wireless mic + ring light');
  entry(tiktok, dayIn(months[2], 24), 'income', 450, 'Brand deal', 'Sponsored video – CV builder app');
  entry(tiktok, dayIn(months[4], 18), 'income', 750, 'Brand deal', 'Two-video package – online course platform');
  entry(tiktok, dayIn(months[6], Math.min(6, Number(today.slice(8, 10)))), 'income', 600, 'Brand deal', 'Sponsored series – job board');
  weeks.forEach((d, i) => {
    metric(tiktok, 'followers', d, Math.round(8400 + i * 230 + i * i * 2.4 + between(-60, 60)));
    metric(tiktok, 'views_30d', d, Math.round(180000 + i * 9500 + between(-15000, 15000)));
    metric(tiktok, 'engagement_rate', d, Math.round(between(5.1, 7.2) * 10) / 10);
  });

  // ── Trading ──
  const trading = stream('trading', 'Trading', { handle: 'Trading 212 · Invest', goal: 40000 });
  entry(trading, dayIn(months[0], 2), 'transfer_in', 2000, 'Deposit', 'Opening deposit', { source: 'import', external: 'csv:t212-dep-0' });
  const symbols = ['EURUSD', 'GBPUSD', 'TSLA', 'NVDA', 'AAPL', 'US500', 'GOLD'];
  let balance = 2000;
  months.forEach((ym, i) => {
    if (i > 0 && i % 2 === 0) { entry(trading, dayIn(ym, 1), 'transfer_in', 500, 'Deposit', 'Monthly top-up', { source: 'import', external: `csv:t212-dep-${i}` }); balance += 500; }
    const tough = i === 2; // one losing month, as real trading has
    for (let t = 0; t < 10 + Math.floor(rand() * 5); t++) {
      const win = rand() < (tough ? 0.36 : 0.58);
      const amount = win ? between(18, 170) : between(14, 120);
      const sym = pickOne(symbols);
      const date = dayIn(ym, between(1, 28));
      entry(trading, date, win ? 'income' : 'expense', amount, 'Closed trade', `${pickOne(['Long', 'Short'])} ${sym}`, { reference: sym, source: 'import', external: `csv:t212-${ym}-${t}` });
      if (ok(date)) balance += win ? amount : -amount;
    }
    entry(trading, dayIn(ym, 28), 'expense', between(4, 11), 'Fees & commission', 'FX & overnight fees', { source: 'import', external: `csv:t212-fee-${ym}` });
    if (i % 3 === 1) entry(trading, dayIn(ym, 16), 'income', between(4, 14), 'Dividends', `Dividend – ${pickOne(['AAPL', 'MSFT', 'VUSA'])}`, { reference: 'Dividend', source: 'import', external: `csv:t212-div-${ym}` });
    entry(trading, dayIn(ym, 5), 'expense', 12.95, 'Platform & data subscriptions', 'TradingView Essential');
  });
  entry(trading, dayIn(months[4], 22), 'transfer_out', 300, 'Withdrawal', 'Withdrawal to bank', { source: 'import', external: 'csv:t212-wd-1' });
  // Balance by week, worked out from what's recorded so far.
  weeks.forEach((d) => {
    const r = db.get(`SELECT COALESCE(SUM(CASE WHEN kind IN ('income','transfer_in') THEN amount_pence ELSE -amount_pence END),0) AS b FROM stream_entries WHERE stream_id = ? AND date <= ? AND category NOT IN ('Platform & data subscriptions')`, trading.id, d).b;
    metric(trading, 'balance', d, Math.round(r) / 100);
    metric(trading, 'open_positions', d, Math.floor(between(1, 6)));
  });

  // ── Digital products ──
  const digital = stream('digital_products', 'Digital products', { handle: 'Gumroad + Stripe', goal: 150000, tax: 25 });
  const products = [['Career Clarity Workbook (PDF)', 19], ['Interview Answer Templates', 29], ['LinkedIn Profile Glow-Up (mini course)', 79], ['Notion Job Tracker', 12]];
  let sale = 0;
  months.forEach((ym, i) => {
    const count = 14 + i * 5 + Math.floor(rand() * 6);
    let gross = 0;
    for (let n = 0; n < count; n++) {
      const [name, price] = products[Math.min(products.length - 1, Math.floor(rand() * rand() * products.length * 1.4))];
      const date = dayIn(ym, between(1, 28));
      const viaStripe = rand() < 0.4;
      sale++;
      entry(digital, date, 'income', price, 'Sale', `${name} – ${viaStripe ? 'Stripe' : 'Gumroad'}`, { reference: name, source: 'webhook', external: viaStripe ? `stripe:pi_demo_${sale}` : `gumroad:demo_${sale}` });
      if (ok(date)) gross += price;
      if (rand() < 0.025) entry(digital, addLocalDays(date, 2), 'expense', price, 'Refund', `Refund – ${name}`, { reference: name, source: 'webhook', external: `gumroad-refund:demo_${sale}` });
    }
    const monthEndDate = dayIn(ym, 28);
    if (ok(monthEndDate)) entry(digital, monthEndDate, 'expense', Math.round(gross * 0.1 * 100) / 100, 'Platform & payment fees', 'Gumroad & Stripe fees');
    entry(digital, dayIn(ym, 4), 'expense', 29, 'Software & hosting', 'ConvertKit');
    if (i >= 3) entry(digital, dayIn(ym, 12), 'expense', between(40, 90), 'Ads', 'Meta ads – workbook');
  });
  weeks.forEach((d, i) => {
    metric(digital, 'customers', d, Math.round(60 + i * 9.5 + i * i * 0.2));
    metric(digital, 'email_subscribers', d, Math.round(820 + i * 46));
  });

  // ── 1:1 coaching ──
  const coaching = stream('client_work', '1:1 coaching', { handle: 'Bright Path Coaching', goal: 300000, tax: 25 });
  const clients = ['Emma W.', 'Daniel K.', 'Sophie R.', 'Marcus T.', 'Hannah L.', 'Olivia P.'];
  months.forEach((ym, i) => {
    for (let c = 0; c < 3 + Math.floor(i / 2); c++) entry(coaching, dayIn(ym, between(1, 26)), 'income', pickOne([450, 600, 750, 1200]), pickOne(['Client payment', 'Retainer']), `Coaching – ${pickOne(clients)}`);
    entry(coaching, dayIn(ym, 2), 'expense', 35, 'Software', 'Zoom + Calendly');
  });
  metric(coaching, 'active_clients', weeks[weeks.length - 1], 7);

  // ── Automatic deliveries and an API key, so the Activity tab has history ──
  const key = `cmk_live_${crypto.randomBytes(20).toString('hex')}`;
  const keyId = id('key');
  db.insert('api_keys', {
    id: keyId, org_id: org.id, name: 'Zapier – TikTok Shop commission', prefix: `${key.slice(0, 13)}…`, key_hash: crypto.createHash('sha256').update(key).digest('hex'),
    scopes: ['income:read', 'income:write'], stream_id: tiktok.id, created_by: owner.id, created_at: `${start}T10:00:00.000Z`, last_used_at: new Date(at.getTime() - 5 * 3600_000).toISOString(), revoked_at: null,
  });
  const log = (hoursAgo, row) => db.insert('api_log', { id: id('log'), org_id: org.id, created_at: new Date(at.getTime() - hoursAgo * 3600_000).toISOString(), key_id: null, stream_id: null, ...row });
  log(5, { kind: 'api', key_id: keyId, stream_id: tiktok.id, method: 'POST', path: `/api/v1/streams/${tiktok.id}/entries`, status: 201, summary: 'TikTok: 23.40 GBP Commission – Laptop stand' });
  log(9, { kind: 'webhook', stream_id: digital.id, method: 'POST', path: `/api/hooks/stream/…${digital.hook_token.slice(-6)}`, status: 200, summary: 'Stripe: 1 recorded (£79.00)' });
  log(26, { kind: 'webhook', stream_id: digital.id, method: 'POST', path: `/api/hooks/stream/…${digital.hook_token.slice(-6)}`, status: 200, summary: 'Gumroad: 1 recorded (£29.00)' });
  log(27, { kind: 'webhook', stream_id: digital.id, method: 'POST', path: `/api/hooks/stream/…${digital.hook_token.slice(-6)}`, status: 200, summary: 'Stripe: ignored – customer.created isn’t money in or out' });
  log(50, { kind: 'api', key_id: keyId, stream_id: tiktok.id, method: 'POST', path: `/api/v1/streams/${trading.id}/entries`, status: 403, summary: 'This key can only be used for its own income stream' });
  return true;
}

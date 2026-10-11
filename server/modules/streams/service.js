import crypto from 'node:crypto';
import { parseJson } from '../../db/index.js';
import { decryptSecret } from '../../lib/secrets.js';
import { verifyShopify, verifyStripe } from '../../lib/signatures.js';
import { localDate } from '../../lib/time.js';
import { HttpError, badRequest, id, notFound, now, publicToken } from '../../lib/util.js';
import { STREAM_TYPES, typeOf } from './types.js';

/**
 * The API hub's income streams. Each stream (TikTok, a trading account, a
 * digital-products shop…) keeps its own money in and out, its own figures and
 * its own web address for other apps, so several incomes sit side by side in
 * one place without being mixed up.
 *
 * Money is stored in pence (always positive): the kind says which way it went.
 * Transfers (deposits into a trading account, withdrawals) are kept apart from
 * profit, so moving your own money never looks like earning it.
 */

export const KINDS = ['income', 'expense', 'transfer_in', 'transfer_out'];
export const CURRENCIES = ['GBP', 'USD', 'EUR'];
const MAX_BATCH = 500;

// ───────────────────────── Streams ─────────────────────────

export function getStream(db, orgId, streamId) {
  const s = db.get('SELECT * FROM income_streams WHERE id = ? AND org_id = ?', streamId, orgId);
  if (!s) throw notFound('Income stream');
  return s;
}

export const listStreams = (db, orgId, { archived = false } = {}) =>
  db.all(`SELECT * FROM income_streams WHERE org_id = ? AND archived = ? ORDER BY position, created_at`, orgId, archived ? 1 : 0);

export function createStream(db, orgId, data, { actorId = null } = {}) {
  if (!STREAM_TYPES[data.type]) throw badRequest('Pick what kind of income this is');
  const ts = now();
  const position = (db.get('SELECT MAX(position) AS p FROM income_streams WHERE org_id = ?', orgId).p ?? -1) + 1;
  const stream = {
    id: id('str'), org_id: orgId, type: data.type,
    name: String(data.name || typeOf(data.type).defaultName).trim().slice(0, 80),
    handle: data.handle ? String(data.handle).trim().slice(0, 120) : null,
    currency: CURRENCIES.includes(data.currency) ? data.currency : 'GBP',
    goal_monthly_pence: data.goal_monthly_pence ? Math.max(0, Math.round(data.goal_monthly_pence)) : null,
    tax_set_aside_pct: clampPct(data.tax_set_aside_pct ?? 20),
    notes: data.notes || null, hook_token: publicToken(), hook_secret: null,
    position, archived: 0, created_by: actorId, created_at: ts, updated_at: ts,
  };
  db.insert('income_streams', stream);
  return stream;
}

export function updateStream(db, orgId, streamId, patch) {
  getStream(db, orgId, streamId);
  const out = {};
  if (patch.name !== undefined) out.name = String(patch.name || '').trim().slice(0, 80) || 'Income stream';
  if (patch.handle !== undefined) out.handle = patch.handle ? String(patch.handle).trim().slice(0, 120) : null;
  if (patch.currency !== undefined && CURRENCIES.includes(patch.currency)) out.currency = patch.currency;
  if (patch.goal_monthly_pence !== undefined) out.goal_monthly_pence = patch.goal_monthly_pence ? Math.max(0, Math.round(patch.goal_monthly_pence)) : null;
  if (patch.tax_set_aside_pct !== undefined) out.tax_set_aside_pct = clampPct(patch.tax_set_aside_pct);
  if (patch.notes !== undefined) out.notes = patch.notes || null;
  if (patch.archived !== undefined) out.archived = patch.archived ? 1 : 0;
  if (patch.position !== undefined) out.position = Number(patch.position) || 0;
  db.update('income_streams', streamId, { ...out, updated_at: now() });
  return getStream(db, orgId, streamId);
}

const clampPct = (v) => Math.min(60, Math.max(0, Number(v) || 0));

// ───────────────────────── Entries ─────────────────────────

/** "£1,234.50", "-12", "(12.00)", 12.5 → pence (signed). Null when it isn't a number. */
export function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : null;
  let s = String(value ?? '').trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  if (/\s*(DR|DEBIT)$/i.test(s)) { sign = -1; s = s.replace(/\s*(DR|DEBIT)$/i, ''); }
  s = s.replace(/\s*(CR|CREDIT)$/i, '');
  s = s.replace(/[£$€\s]|GBP|USD|EUR/gi, '');
  if (s.startsWith('-')) { sign *= -1; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  // "1.234,56" (European) → "1234.56"; "1,234.56" → "1234.56"
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(s)) return null;
  return sign * Math.round(Number(s) * 100);
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
const validYmd = (y, m, d) => y > 1990 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

/** Understands 2026-10-09, 2026-10-09T14:00Z, 09/10/2026 (UK order), 9 Oct 2026, Oct 9, 2026 and Unix times. */
export function parseDate(value, tz = 'Europe/London') {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value))) {
    const n = Number(value);
    return localDate(new Date(n < 1e12 ? n * 1000 : n), tz);
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/);
  if (m) {
    if (/T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) { const d = new Date(s); if (!Number.isNaN(d.getTime())) return localDate(d, tz); }
    return validYmd(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : null;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:$|[\s,T])/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validYmd(y, +m[2], +m[1]) ? `${y}-${pad(m[2])}-${pad(m[1])}` : null;
  }
  m = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})/i) || s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m) {
    const [day, mon] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    const month = MONTHS[mon.toLowerCase()];
    return month && validYmd(+m[3], month, +day) ? `${m[3]}-${pad(month)}-${pad(day)}` : null;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : localDate(d, tz);
}

const KIND_WORDS = {
  income: 'income', in: 'income', sale: 'income', profit: 'income', win: 'income', credit: 'income', revenue: 'income',
  expense: 'expense', out: 'expense', cost: 'expense', refund: 'expense', loss: 'expense', fee: 'expense', debit: 'expense', spend: 'expense',
  transfer_in: 'transfer_in', deposit: 'transfer_in', top_up: 'transfer_in',
  transfer_out: 'transfer_out', withdrawal: 'transfer_out', withdraw: 'transfer_out', payout: 'transfer_out',
};

/**
 * Turns what a person, a spreadsheet or another app sent into an entry.
 * Accepts amount in pounds (signed, any format) or amount_pence; a negative
 * amount without a type is money out (e.g. a losing trade).
 */
export function normaliseEntry(input = {}, stream, { tz = 'Europe/London', today } = {}) {
  let pence = input.amount_pence !== undefined && input.amount_pence !== null && input.amount_pence !== ''
    ? Math.round(Number(input.amount_pence)) : parseMoney(input.amount);
  if (pence === null || Number.isNaN(pence)) throw badRequest('Each entry needs an amount, like 49.99 (or -12.50 for money out)');
  const word = String(input.kind || input.type || '').toLowerCase().replace(/[\s-]+/g, '_');
  let kind = KIND_WORDS[word] || null;
  if (word && !kind && KINDS.includes(word)) kind = word;
  if (!kind) kind = pence < 0 ? 'expense' : 'income';
  else if (pence < 0 && (kind === 'income' || kind === 'expense')) kind = kind === 'income' ? 'expense' : 'income';
  else if (pence < 0 && kind === 'transfer_in') kind = 'transfer_out';
  pence = Math.abs(pence);
  if (pence > 1e12) throw badRequest('That amount is too large');
  const date = input.date ? parseDate(input.date, tz) : (today || localDate(new Date(), tz));
  if (!date) throw badRequest(`Couldn’t read the date “${input.date}” – use 2026-10-09 or 09/10/2026`);
  const currency = String(input.currency || stream.currency).toUpperCase().slice(0, 3);
  if (!/^[A-Z]{3}$/.test(currency)) throw badRequest('currency must be a 3-letter code like GBP');
  const text = (v, max) => (v === undefined || v === null || v === '' ? null : String(v).trim().slice(0, max));
  const meta = input.meta && typeof input.meta === 'object' && !Array.isArray(input.meta) ? input.meta : {};
  return {
    date, kind, amount_pence: pence, currency,
    category: text(input.category, 60) || defaultCategory(stream.type, kind),
    description: text(input.description ?? input.name ?? input.title, 200),
    reference: text(input.reference ?? input.symbol ?? input.product, 80),
    external_id: text(input.external_id ?? input.id, 120),
    meta,
  };
}

function defaultCategory(type, kind) {
  const t = typeOf(type);
  if (kind === 'income') return t.income[0];
  if (kind === 'expense') return type === 'trading' ? 'Closed trade' : t.expenses[t.expenses.length - 1];
  const transfers = t.transfers || ['Money in', 'Money out'];
  return kind === 'transfer_in' ? transfers[0] : transfers[1] || transfers[0];
}

/**
 * Records one entry. With an external_id, sending the same thing twice (a
 * webhook retried, a CSV imported again) is recognised and not counted twice.
 */
export function addEntry(ctx, stream, input, { source = 'manual', actorId = null, tz } = {}) {
  const { db, engine } = ctx;
  const e = normaliseEntry(input, stream, { tz });
  if (e.external_id && db.get('SELECT 1 FROM stream_entries WHERE stream_id = ? AND external_id = ?', stream.id, e.external_id)) {
    return { entry: parseJson(db.get('SELECT * FROM stream_entries WHERE stream_id = ? AND external_id = ?', stream.id, e.external_id), 'meta'), duplicate: true };
  }
  const entry = { id: id('ent'), org_id: stream.org_id, stream_id: stream.id, ...e, source, created_by: actorId, created_at: now() };
  db.insert('stream_entries', entry);
  let automations = [];
  if (engine && entry.kind === 'income') {
    automations = engine.emit(stream.org_id, 'income.received', {
      stream: { id: stream.id, name: stream.name, type: stream.type },
      entry: { ...entry, amount: entry.amount_pence / 100 },
    }, { actorId });
  }
  return { entry, duplicate: false, automations };
}

/** Records several entries; bad ones are reported back, the rest still go in. */
export function addEntries(ctx, stream, inputs, opts = {}) {
  if (!Array.isArray(inputs) || !inputs.length) throw badRequest('Send at least one entry');
  if (inputs.length > MAX_BATCH) throw badRequest(`Send at most ${MAX_BATCH} entries at a time`);
  const result = { recorded: 0, duplicates: 0, errors: [], entries: [] };
  inputs.forEach((input, i) => {
    try {
      const { entry, duplicate } = addEntry(ctx, stream, input, opts);
      if (duplicate) result.duplicates++; else { result.recorded++; result.entries.push(entry); }
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      result.errors.push({ index: i, error: err.message });
    }
  });
  return result;
}

export function updateEntry(db, stream, entryId, patch, { tz } = {}) {
  const current = db.get('SELECT * FROM stream_entries WHERE id = ? AND stream_id = ?', entryId, stream.id);
  if (!current) throw notFound('Entry');
  const merged = { ...current, meta: parseJson(current, 'meta').meta, ...patch, external_id: current.external_id };
  if (patch.amount === undefined && patch.amount_pence === undefined) merged.amount_pence = current.amount_pence;
  if (patch.amount !== undefined) delete merged.amount_pence;
  const e = normaliseEntry(merged, stream, { tz });
  const { external_id: _x, ...rest } = e;
  db.update('stream_entries', entryId, rest);
  return parseJson(db.get('SELECT * FROM stream_entries WHERE id = ?', entryId), 'meta');
}

export function deleteEntry(db, stream, entryId) {
  const r = db.run('DELETE FROM stream_entries WHERE id = ? AND stream_id = ?', entryId, stream.id);
  if (!r.changes) throw notFound('Entry');
}

/** Removes the entries made by "Send a test" (and test pings from Gumroad). */
export function deleteTestEntries(db, stream) {
  return db.run(`DELETE FROM stream_entries WHERE stream_id = ? AND meta LIKE '%"test":true%'`, stream.id).changes;
}

export function listEntries(db, stream, { from = null, to = null, kind = null, limit = 200, offset = 0 } = {}) {
  const where = ['stream_id = ?'];
  const params = [stream.id];
  if (from) { where.push('date >= ?'); params.push(from); }
  if (to) { where.push('date <= ?'); params.push(to); }
  if (kind && KINDS.includes(kind)) { where.push('kind = ?'); params.push(kind); }
  return parseJson(db.all(`SELECT * FROM stream_entries WHERE ${where.join(' AND ')} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`,
    ...params, Math.min(1000, Math.max(1, Number(limit) || 200)), Math.max(0, Number(offset) || 0)), 'meta');
}

// ───────────────────────── Figures (followers, balance…) ─────────────────────────

export function recordMetrics(db, stream, metrics, { date = null, source = 'manual', tz } = {}) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw badRequest('Send figures like { "followers": 12500 }');
  const day = date ? parseDate(date, tz) : localDate(new Date(), tz);
  if (!day) throw badRequest('Couldn’t read the date');
  const saved = {};
  for (const [rawKey, rawValue] of Object.entries(metrics)) {
    const key = String(rawKey).toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40);
    if (!key || rawValue === null || rawValue === '') continue;
    const def = typeOf(stream.type).metrics.find((m) => m.key === key);
    const value = def?.money ? (parseMoney(rawValue) ?? NaN) / 100 : Number(String(rawValue).replace(/[,%\s]/g, ''));
    if (!Number.isFinite(value)) throw badRequest(`${rawKey} must be a number`);
    db.run(`INSERT INTO stream_metrics (id, org_id, stream_id, key, date, value, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(stream_id, key, date) DO UPDATE SET value = excluded.value, source = excluded.source`,
    id('met'), stream.org_id, stream.id, key, day, value, source, now());
    saved[key] = value;
  }
  if (!Object.keys(saved).length) throw badRequest('Send at least one figure, like { "followers": 12500 }');
  return { date: day, metrics: saved };
}

function metricSummary(db, stream) {
  const defs = typeOf(stream.type).metrics;
  const keys = [...new Set([...defs.map((d) => d.key), ...db.all('SELECT DISTINCT key FROM stream_metrics WHERE stream_id = ?', stream.id).map((r) => r.key)])];
  return keys.map((key) => {
    const def = defs.find((d) => d.key === key) || { key, label: key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) };
    const points = db.all('SELECT date, value FROM stream_metrics WHERE stream_id = ? AND key = ? ORDER BY date DESC LIMIT 24', stream.id, key).reverse();
    const latest = points[points.length - 1] || null;
    let change = null;
    if (latest) {
      const cutoff = new Date(Date.parse(`${latest.date}T00:00:00Z`) - 28 * 86400_000).toISOString().slice(0, 10);
      const before = [...points].reverse().find((p) => p.date <= cutoff);
      if (before) change = { value: latest.value - before.value, since: before.date };
    }
    return { key, label: def.label, unit: def.unit || null, money: Boolean(def.money), latest, change, points };
  });
}

// ───────────────────────── Totals ─────────────────────────

/** The UK tax year (6 April – 5 April) a date falls in. */
export function taxYear(date) {
  const [y, m, d] = date.split('-').map(Number);
  const start = m > 4 || (m === 4 && d >= 6) ? y : y - 1;
  return { start: `${start}-04-06`, end: `${start + 1}-04-05`, label: `${start}/${String(start + 1).slice(2)}` };
}

const monthKey = (date) => date.slice(0, 7);
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const blank = () => ({ income_pence: 0, expense_pence: 0, net_pence: 0, transfer_in_pence: 0, transfer_out_pence: 0, count: 0 });

function totalsBetween(db, stream, from, to) {
  const t = blank();
  for (const r of db.all(`SELECT kind, SUM(amount_pence) AS total, COUNT(*) AS n FROM stream_entries
                           WHERE stream_id = ? AND currency = ? AND date >= ? AND date <= ? GROUP BY kind`, stream.id, stream.currency, from, to)) {
    t[`${r.kind}_pence`] = r.total;
    t.count += r.n;
  }
  t.net_pence = t.income_pence - t.expense_pence;
  return t;
}

/** Everything the stream's own page shows. */
export function streamSummary(db, stream, { at = new Date(), tz = 'Europe/London', months = 12 } = {}) {
  const today = localDate(at, tz);
  const thisMonth = monthKey(today);
  const lastMonth = addMonths(thisMonth, -1);
  const ty = taxYear(today);
  const month = totalsBetween(db, stream, `${thisMonth}-01`, monthEnd(thisMonth));
  const previous = totalsBetween(db, stream, `${lastMonth}-01`, monthEnd(lastMonth));
  const year = totalsBetween(db, stream, ty.start, ty.end);
  const first = addMonths(thisMonth, -(months - 1));
  const rows = db.all(`SELECT substr(date, 1, 7) AS m, kind, SUM(amount_pence) AS total FROM stream_entries
                        WHERE stream_id = ? AND currency = ? AND date >= ? GROUP BY m, kind`, stream.id, stream.currency, `${first}-01`);
  const series = Array.from({ length: months }, (_, i) => {
    const m = addMonths(first, i);
    const income = rows.find((r) => r.m === m && r.kind === 'income')?.total || 0;
    const expense = rows.find((r) => r.m === m && r.kind === 'expense')?.total || 0;
    return { month: m, income_pence: income, expense_pence: expense, net_pence: income - expense };
  });
  const lastEntry = db.get('SELECT MAX(created_at) AS at FROM stream_entries WHERE stream_id = ?', stream.id).at;
  const lastHook = db.get(`SELECT created_at, status FROM api_log WHERE stream_id = ? AND kind = 'webhook' ORDER BY created_at DESC LIMIT 1`, stream.id);
  const otherCurrency = db.get('SELECT COUNT(*) AS n FROM stream_entries WHERE stream_id = ? AND currency != ?', stream.id, stream.currency).n;
  return {
    today, month: { key: thisMonth, ...month }, last_month: { key: lastMonth, ...previous },
    tax_year: { ...ty, ...year, set_aside_pence: Math.round(Math.max(0, year.net_pence) * stream.tax_set_aside_pct / 100) },
    goal: stream.goal_monthly_pence ? { target_pence: stream.goal_monthly_pence, progress_pct: Math.round(Math.max(0, month.net_pence) / stream.goal_monthly_pence * 100) } : null,
    series,
    categories: categoryBreakdown(db, stream, ty.start, ty.end),
    stats: typeStats(db, stream, ty.start, ty.end),
    metrics: metricSummary(db, stream),
    sources: db.all('SELECT source, COUNT(*) AS n, MAX(created_at) AS last_at FROM stream_entries WHERE stream_id = ? GROUP BY source', stream.id),
    last_entry_at: lastEntry, last_webhook: lastHook || null,
    other_currency_count: otherCurrency,
    test_entries: db.get(`SELECT COUNT(*) AS n FROM stream_entries WHERE stream_id = ? AND meta LIKE '%"test":true%'`, stream.id).n,
  };
}

function categoryBreakdown(db, stream, from, to) {
  return db.all(`SELECT kind, COALESCE(category, 'Other') AS category, SUM(amount_pence) AS total, COUNT(*) AS n FROM stream_entries
                  WHERE stream_id = ? AND currency = ? AND date >= ? AND date <= ? AND kind IN ('income','expense')
                  GROUP BY kind, category ORDER BY total DESC`, stream.id, stream.currency, from, to);
}

/** The numbers that matter for that kind of income. */
function typeStats(db, stream, from, to) {
  const q = (sql, ...p) => db.get(sql, stream.id, stream.currency, from, to, ...p);
  const base = `FROM stream_entries WHERE stream_id = ? AND currency = ? AND date >= ? AND date <= ?`;
  if (stream.type === 'trading') {
    const wins = q(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_pence),0) AS total, MAX(amount_pence) AS best ${base} AND kind = 'income' AND category = 'Closed trade'`);
    const losses = q(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_pence),0) AS total, MAX(amount_pence) AS worst ${base} AND kind = 'expense' AND category = 'Closed trade'`);
    const fees = q(`SELECT COALESCE(SUM(amount_pence),0) AS total ${base} AND kind = 'expense' AND category != 'Closed trade'`).total;
    const trades = wins.n + losses.n;
    const best = db.get(`SELECT reference, description, amount_pence, date ${base} AND kind = 'income' AND category = 'Closed trade' ORDER BY amount_pence DESC LIMIT 1`, stream.id, stream.currency, from, to);
    const bySymbol = db.all(`SELECT COALESCE(reference, description, '–') AS symbol,
                               SUM(CASE WHEN kind = 'income' THEN amount_pence ELSE -amount_pence END) AS net, COUNT(*) AS n
                             ${base} AND category = 'Closed trade' GROUP BY symbol ORDER BY net DESC`, stream.id, stream.currency, from, to);
    return {
      kind: 'trading', trades, wins: wins.n, losses: losses.n,
      win_rate: trades ? Math.round(wins.n / trades * 100) : null,
      avg_win_pence: wins.n ? Math.round(wins.total / wins.n) : 0,
      avg_loss_pence: losses.n ? Math.round(losses.total / losses.n) : 0,
      profit_factor: losses.total ? Math.round(wins.total / losses.total * 100) / 100 : null,
      fees_pence: fees, best_trade: best || null,
      best_markets: bySymbol.slice(0, 3), worst_markets: bySymbol.filter((r) => r.net < 0).slice(-3).reverse(),
    };
  }
  if (['digital_products', 'ecommerce'].includes(stream.type)) {
    const sales = q(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_pence),0) AS total ${base} AND kind = 'income'`);
    const refunds = q(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_pence),0) AS total ${base} AND kind = 'expense' AND category = 'Refund'`);
    const products = db.all(`SELECT COALESCE(reference, description, 'Unnamed') AS product, COUNT(*) AS n, SUM(amount_pence) AS total
                             ${base} AND kind = 'income' GROUP BY product ORDER BY total DESC LIMIT 5`, stream.id, stream.currency, from, to);
    return {
      kind: 'sales', sales: sales.n, refunds: refunds.n, refunded_pence: refunds.total,
      refund_rate: sales.n ? Math.round(refunds.n / sales.n * 1000) / 10 : null,
      avg_sale_pence: sales.n ? Math.round(sales.total / sales.n) : 0, top_products: products,
    };
  }
  const payments = q(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_pence),0) AS total ${base} AND kind = 'income'`);
  return { kind: 'general', payments: payments.n, avg_payment_pence: payments.n ? Math.round(payments.total / payments.n) : 0 };
}

/** The API hub overview: every stream side by side, plus the totals across them. */
export function hubSummary(db, org, { at = new Date() } = {}) {
  const tz = org.timezone || 'Europe/London';
  const streams = listStreams(db, org.id).map((s) => {
    const sum = streamSummary(db, s, { at, tz, months: 6 });
    return {
      ...publicStream(s), summary: {
        month: sum.month, last_month: sum.last_month, tax_year: sum.tax_year, goal: sum.goal, series: sum.series,
        headline: sum.metrics.find((m) => m.latest) || null, last_entry_at: sum.last_entry_at, last_webhook: sum.last_webhook,
        connected: sum.sources.filter((x) => x.source !== 'manual').map((x) => x.source),
      },
    };
  });
  const home = 'GBP';
  const counted = streams.filter((s) => s.currency === home);
  const sumOf = (pick) => counted.reduce((t, s) => t + pick(s.summary), 0);
  const today = localDate(at, tz);
  return {
    today, currency: home, tax_year: taxYear(today),
    totals: {
      month_income_pence: sumOf((x) => x.month.income_pence),
      month_expense_pence: sumOf((x) => x.month.expense_pence),
      month_net_pence: sumOf((x) => x.month.net_pence),
      last_month_net_pence: sumOf((x) => x.last_month.net_pence),
      tax_year_net_pence: sumOf((x) => x.tax_year.net_pence),
      set_aside_pence: sumOf((x) => x.tax_year.set_aside_pence),
    },
    not_counted: streams.filter((s) => s.currency !== home).map((s) => ({ id: s.id, name: s.name, currency: s.currency })),
    streams,
  };
}

/** A stream without its secrets. */
export function publicStream(s) {
  const t = typeOf(s.type);
  const { hook_secret: secret, ...rest } = s;
  return { ...rest, type_label: t.label, icon: t.icon, hook_signed: Boolean(secret) };
}

// ───────────────────────── Spreadsheet (CSV) import ─────────────────────────

export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delimiter = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

const COLUMN_HINTS = {
  date: [/^(date|day|time|timestamp)$/i, /close.?(time|date)|closed|settle|sale.?timestamp|created|paid.?(on|at)|transaction.?date|date/i, /time/i],
  amount: [/^(result|p\/?l|pnl|profit|realised|realized|net.?profit|profit.?\/?.?loss)/i, /^(net|amount|total|value|earnings|revenue|gross|price|sum)/i, /amount|total|earnings|net|profit/i],
  credit: [/^(credit|money.?in|paid.?in|in)$/i],
  debit: [/^(debit|money.?out|paid.?out|out)$/i],
  description: [/^(description|details|narrative|memo|product|product.?name|item|title|name)$/i, /desc|detail|product|item|title|note/i],
  reference: [/^(symbol|ticker|instrument|market|pair|asset|sku)$/i, /symbol|ticker|instrument/i],
  type: [/^(type|action|kind|transaction.?type|side|category)$/i],
  currency: [/^(currency|ccy|currency.?\(.*\))$/i, /currency/i],
  id: [/^(id|order.?id|transaction.?id|sale.?id|trade.?id|ref|reference|position.?id|ticket)$/i],
  // Used for deposits and withdrawals when the main amount column is profit/loss.
  total: [/^(total|amount|value)/i],
};

/** Works out which column is which from the header row. */
export function detectColumns(header) {
  const used = new Set();
  const map = {};
  for (const [field, patterns] of Object.entries(COLUMN_HINTS)) {
    for (const re of patterns) {
      const i = header.findIndex((h, idx) => !used.has(idx) && re.test(h));
      if (i >= 0) { map[field] = header[i]; used.add(i); break; }
    }
  }
  if (map.credit || map.debit) delete map.amount;
  return map;
}

/**
 * Imports a CSV export (broker statement, TikTok/YouTube earnings, Gumroad or
 * Etsy sales, a bank statement…). dryRun shows how it was read without saving.
 * Re-importing the same rows is ignored.
 */
export function importCsv(ctx, stream, csv, { dryRun = false, mapping = null, actorId = null, tz } = {}) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw badRequest('Paste a CSV with a header row and at least one line');
  if (rows.length > 5001) throw badRequest('Import at most 5,000 lines at a time');
  const header = rows[0];
  const map = { ...detectColumns(header), ...(mapping || {}) };
  if (!map.date) throw badRequest('Couldn’t find a date column', { columns: header });
  if (!map.amount && !map.credit && !map.debit) throw badRequest('Couldn’t find an amount column (Amount, Total, Net, Profit, Result…)', { columns: header });
  const col = (name) => (map[name] ? header.indexOf(map[name]) : -1);
  const idx = Object.fromEntries(Object.keys(COLUMN_HINTS).map((k) => [k, col(k)]));
  const seen = new Map();
  const parsed = [];
  const skipped = [];
  rows.slice(1).forEach((r, i) => {
    const cell = (k) => (idx[k] >= 0 ? r[idx[k]] : '');
    let pence = null;
    if (idx.amount >= 0) pence = parseMoney(cell('amount'));
    else {
      const credit = parseMoney(cell('credit')) || 0;
      const debit = parseMoney(cell('debit')) || 0;
      pence = credit || debit ? Math.abs(credit) - Math.abs(debit) : null;
    }
    const typeText = cell('type');
    let kind = null;
    if (/deposit|top.?up|transfer.?in|funding/i.test(typeText)) kind = 'transfer_in';
    else if (/withdraw|transfer.?out|payout/i.test(typeText)) kind = 'transfer_out';
    else if (/refund/i.test(typeText)) kind = 'expense';
    if ((pence === null || pence === 0) && kind?.startsWith('transfer') && idx.total >= 0) pence = parseMoney(cell('total'));
    if (pence === null || pence === 0) { skipped.push({ line: i + 2, reason: /buy|open/i.test(typeText) ? 'opening a trade (no profit or loss yet)' : 'no amount' }); return; }
    const category = stream.type === 'trading' && !kind
      ? (/dividend/i.test(typeText) ? 'Dividends' : /interest/i.test(typeText) ? 'Interest' : /fee|commission|charge|funding|swap/i.test(typeText) ? 'Fees & commission' : 'Closed trade')
      : (/refund/i.test(typeText) ? 'Refund' : null);
    const date = parseDate(cell('date'), tz);
    if (!date) { skipped.push({ line: i + 2, reason: `date “${cell('date')}” not understood` }); return; }
    const sig = `${date}|${cell('description')}|${cell('reference')}|${pence}|${kind || ''}`;
    const n = (seen.get(sig) || 0) + 1;
    seen.set(sig, n);
    const ext = cell('id') ? `csv:${cell('id')}` : `csv:${hash(`${sig}|${n}`)}`;
    parsed.push({
      date, amount_pence: kind ? Math.abs(pence) : pence, ...(kind ? { kind } : {}),
      currency: /^[A-Za-z]{3}$/.test(cell('currency')) ? cell('currency').toUpperCase() : undefined,
      category: category || undefined,
      description: cell('description') || typeText || null, reference: cell('reference') || null, external_id: ext,
    });
  });
  const preview = parsed.slice(0, 8).map((p) => { try { return normaliseEntry(p, stream, { tz }); } catch (err) { return { error: err.message }; } });
  const out = { columns: header, mapping: map, rows: rows.length - 1, readable: parsed.length, skipped, preview };
  if (dryRun) {
    out.already_imported = parsed.filter((p) => ctx.db.get('SELECT 1 FROM stream_entries WHERE stream_id = ? AND external_id = ?', stream.id, p.external_id)).length;
    return out;
  }
  const result = ctx.db.tx(() => {
    const r = { recorded: 0, duplicates: 0, errors: [] };
    for (const p of parsed) {
      try {
        const { duplicate } = addEntry({ db: ctx.db }, stream, p, { source: 'import', actorId, tz });
        if (duplicate) r.duplicates++; else r.recorded++;
      } catch (err) { r.errors.push(err.message); }
    }
    return r;
  });
  if (result.recorded) ctx.engine?.logSystemRun(stream.org_id, 'Spreadsheet import', 'income.import', `${result.recorded} entries added to ${stream.name}`, Math.min(60, 2 + Math.round(result.recorded / 2)));
  return { ...out, ...result };
}

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);

// ───────────────────────── The stream's own web address ─────────────────────────

/** Reads what Stripe, Shopify, Gumroad, Zapier/Make or any app sent. */
export function readWebhook(headers, body) {
  const header = (n) => headers[n] ?? headers[n.toLowerCase()];
  const b = body && typeof body === 'object' ? body : {};
  // Stripe event
  if (typeof b.type === 'string' && b.data?.object && b.object === 'event') {
    const o = b.data.object;
    const cur = String(o.currency || '').toUpperCase() || undefined;
    switch (b.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (o.payment_status !== 'paid') return { platform: 'stripe', ignored: 'not paid yet' };
        return { platform: 'stripe', entries: [{ amount_pence: o.amount_total, currency: cur, date: o.created, category: o.mode === 'subscription' ? 'Subscription / membership' : 'Sale', description: o.metadata?.product || o.metadata?.description || `Stripe checkout${o.customer_details?.email ? ` – ${o.customer_details.email}` : ''}`, reference: o.metadata?.product || null, external_id: `stripe:${o.payment_intent || o.invoice || o.id}` }] };
      case 'charge.succeeded':
        return { platform: 'stripe', entries: [{ amount_pence: o.amount, currency: cur, date: o.created, category: 'Sale', description: o.description || `Stripe payment${o.billing_details?.email ? ` – ${o.billing_details.email}` : ''}`, reference: o.metadata?.product || null, external_id: `stripe:${o.payment_intent || o.id}` }] };
      case 'payment_intent.succeeded':
        return { platform: 'stripe', entries: [{ amount_pence: o.amount_received ?? o.amount, currency: cur, date: o.created, category: 'Sale', description: o.description || 'Stripe payment', reference: o.metadata?.product || null, external_id: `stripe:${o.id}` }] };
      case 'invoice.paid':
        return { platform: 'stripe', entries: [{ amount_pence: o.amount_paid, currency: cur, date: o.status_transitions?.paid_at || o.created, category: 'Subscription / membership', description: o.lines?.data?.[0]?.description || 'Stripe subscription', external_id: `stripe:${o.payment_intent || o.charge || o.id}` }] };
      case 'charge.refunded':
        return { platform: 'stripe', refund: { charge: o.id, total_pence: o.amount_refunded, currency: cur, date: o.created, description: o.description || 'Stripe refund' } };
      default:
        return { platform: 'stripe', ignored: `${b.type} isn’t money in or out` };
    }
  }
  // Shopify order / refund
  const topic = header('x-shopify-topic');
  if (topic || (b.total_price !== undefined && Array.isArray(b.line_items))) {
    if (topic === 'refunds/create' || (Array.isArray(b.transactions) && b.order_id && !b.total_price)) {
      const amount = (b.transactions || []).filter((t) => t.kind === 'refund' && t.status !== 'failure').reduce((s, t) => s + (parseMoney(t.amount) || 0), 0);
      if (!amount) return { platform: 'shopify', ignored: 'refund with no money returned' };
      return { platform: 'shopify', entries: [{ kind: 'expense', amount_pence: amount, currency: b.transactions?.[0]?.currency, date: b.created_at, category: 'Refund', description: `Refund on Shopify order ${b.order_id}`, external_id: `shopify-refund:${b.id}` }] };
    }
    if (topic && !['orders/paid', 'orders/create'].includes(topic)) return { platform: 'shopify', ignored: `${topic} isn’t money in or out` };
    if (topic === 'orders/create' && b.financial_status && !['paid', 'partially_paid'].includes(b.financial_status)) return { platform: 'shopify', ignored: 'order not paid yet' };
    const items = (b.line_items || []).map((l) => `${l.quantity > 1 ? `${l.quantity} × ` : ''}${l.title}`).join(', ');
    return { platform: 'shopify', entries: [{ amount: b.total_price, currency: b.currency, date: b.processed_at || b.created_at, category: 'Order', description: `${b.name || 'Order'}${items ? ` – ${items}` : ''}`.slice(0, 200), reference: b.line_items?.[0]?.title || null, external_id: `shopify:${b.id}` }] };
  }
  // Gumroad ping (form fields; price in cents)
  if (b.sale_id && (b.price !== undefined || b.seller_id)) {
    const refunded = b.refunded === true || b.refunded === 'true' || b.resource_name === 'refund';
    const test = b.test === true || b.test === 'true';
    const cents = Number(b.price);
    const entry = {
      amount_pence: Number.isFinite(cents) ? cents : 0, currency: b.currency ? String(b.currency).toUpperCase() : undefined, date: b.sale_timestamp,
      description: `${test ? 'Test ping – ' : ''}${b.product_name || 'Gumroad sale'}${b.email ? ` – ${b.email}` : ''}`, reference: b.product_name || b.permalink || null,
      meta: test ? { test: true } : {},
    };
    return { platform: 'gumroad', entries: [refunded ? { ...entry, kind: 'expense', category: 'Refund', external_id: `gumroad-refund:${b.sale_id}` } : { ...entry, category: 'Sale', external_id: `gumroad:${b.sale_id}` }] };
  }
  // Anything else: { amount, description… }, { entries: [...] }, [ ... ] and/or { metrics: {...} }
  const list = Array.isArray(body) ? body : Array.isArray(b.entries) ? b.entries : (b.amount !== undefined || b.amount_pence !== undefined) ? [b] : [];
  const metrics = b.metrics && typeof b.metrics === 'object' && !Array.isArray(b.metrics) ? b.metrics : null;
  if (!list.length && !metrics) return { platform: 'generic', error: 'Send { "amount": 49.99, "description": "…" } (or a list of them), and/or { "metrics": { "followers": 12500 } }' };
  return { platform: 'generic', entries: list, metrics, date: b.date };
}

/**
 * Handles a delivery to a stream's web address: checks the signature when the
 * stream has a signing secret, records the money and logs the delivery.
 */
export function receiveWebhook(ctx, stream, { headers = {}, body, rawBody = '', test = false, tz }) {
  const { db } = ctx;
  const read = readWebhook(headers, body);
  const header = (n) => headers[n] ?? headers[n.toLowerCase()];
  const secret = stream.hook_secret ? decryptSecret(stream.hook_secret) : null;
  const log = (status, summary) => logRequest(db, { orgId: stream.org_id, kind: 'webhook', streamId: stream.id, method: 'POST', path: `/api/hooks/stream/…${stream.hook_token.slice(-6)}`, status, summary: `${test ? 'Test · ' : ''}${summary}` });
  if (secret && !test && read.platform === 'stripe' && !verifyStripe(rawBody, header('stripe-signature'), secret)) {
    log(400, 'Stripe signature didn’t match – check the signing secret'); throw new HttpError(400, 'Invalid signature');
  }
  if (secret && !test && read.platform === 'shopify' && !verifyShopify(rawBody, header('x-shopify-hmac-sha256'), secret)) {
    log(401, 'Shopify signature didn’t match – check the signing secret'); throw new HttpError(401, 'Invalid signature');
  }
  if (read.error) { log(400, read.error); throw badRequest(read.error); }
  if (read.ignored) { log(200, `${titleCase(read.platform)}: ignored – ${read.ignored}`); return { ok: true, platform: read.platform, ignored: read.ignored, recorded: 0 }; }
  let entries = read.entries || [];
  if (read.refund) {
    // Stripe reports the total refunded so far: record only what's new.
    const already = db.get(`SELECT COALESCE(SUM(amount_pence),0) AS t FROM stream_entries WHERE stream_id = ? AND external_id LIKE ?`, stream.id, `stripe-refund:${read.refund.charge}:%`).t;
    const delta = read.refund.total_pence - already;
    entries = delta > 0 ? [{ kind: 'expense', amount_pence: delta, currency: read.refund.currency, date: read.refund.date, category: 'Refund', description: read.refund.description, external_id: `stripe-refund:${read.refund.charge}:${read.refund.total_pence}` }] : [];
  }
  if (test) entries = entries.map((e) => ({ ...e, meta: { ...(e.meta || {}), test: true } }));
  const result = entries.length ? addEntries(ctx, stream, entries, { source: 'webhook', tz }) : { recorded: 0, duplicates: 0, errors: [], entries: [] };
  let metrics = null;
  if (read.metrics) metrics = recordMetrics(db, stream, read.metrics, { date: read.date, source: 'webhook', tz });
  const money = result.entries.reduce((s, e) => s + (e.kind === 'income' ? e.amount_pence : e.kind === 'expense' ? -e.amount_pence : 0), 0);
  const parts = [];
  if (result.recorded) parts.push(`${result.recorded} recorded (${money < 0 ? '-' : ''}${symbol(stream.currency)}${(Math.abs(money) / 100).toFixed(2)})`);
  if (result.duplicates) parts.push(`${result.duplicates} already had`);
  if (result.errors.length) parts.push(`${result.errors.length} not understood: ${result.errors[0].error}`);
  if (metrics) parts.push(`figures updated: ${Object.keys(metrics.metrics).join(', ')}`);
  if (!parts.length) parts.push('nothing new');
  const status = result.errors.length && !result.recorded && !result.duplicates && !metrics ? 400 : 200;
  log(status, `${titleCase(read.platform)}: ${parts.join(' · ')}`);
  if (result.recorded) ctx.engine?.logSystemRun(stream.org_id, 'Income recorded automatically', 'income.received', `${stream.name}: ${parts[0]}`, 2 * result.recorded);
  if (status === 400) throw badRequest(result.errors[0].error, result.errors);
  return { ok: true, platform: read.platform, recorded: result.recorded, duplicates: result.duplicates, errors: result.errors, metrics: metrics?.metrics || null };
}

const titleCase = (s) => (s === 'generic' ? 'Data' : s.charAt(0).toUpperCase() + s.slice(1));
const symbol = (c) => ({ GBP: '£', USD: '$', EUR: '€' }[c] || `${c} `);

/** Sample deliveries for the "Send a test" button – the same code path as the real thing. */
export function sampleWebhook(kind, stream) {
  const stamp = Date.now();
  const nowSec = Math.floor(stamp / 1000);
  const cur = stream.currency.toLowerCase();
  switch (kind) {
    case 'stripe':
      return { headers: {}, body: { object: 'event', type: 'charge.succeeded', data: { object: { id: `ch_test_${stamp}`, object: 'charge', amount: 2900, currency: cur, created: nowSec, payment_intent: `pi_test_${stamp}`, description: 'Notion template pack', billing_details: { email: 'buyer@example.com' } } } } };
    case 'shopify':
      return { headers: { 'x-shopify-topic': 'orders/paid' }, body: { id: stamp, name: `#${1000 + (stamp % 9000)}`, total_price: '45.00', currency: stream.currency, financial_status: 'paid', created_at: new Date().toISOString(), line_items: [{ title: 'Lightroom preset bundle', quantity: 1 }] } };
    case 'gumroad':
      return { headers: {}, body: { seller_id: 'test', sale_id: `test_${stamp}`, product_name: 'Content planner (PDF)', price: '1500', currency: cur, email: 'buyer@example.com', sale_timestamp: new Date().toISOString(), test: 'true' } };
    case 'metrics': {
      const key = typeOf(stream.type).metrics[0]?.key || 'value';
      return { headers: {}, body: { metrics: { [key]: 1000 + (stamp % 500) } } };
    }
    default: {
      if (stream.type === 'trading') return { headers: {}, body: { amount: -42.5, description: 'Closed trade', symbol: 'EURUSD', category: 'Closed trade', id: `test-${stamp}` } };
      return { headers: {}, body: { amount: 120, description: `Test payment – ${typeOf(stream.type).income[0]}`, category: typeOf(stream.type).income[0], id: `test-${stamp}` } };
    }
  }
}

// ───────────────────────── Activity log ─────────────────────────

export function logRequest(db, { orgId, kind = 'api', keyId = null, streamId = null, method, path, status, summary = null }) {
  db.insert('api_log', { id: id('log'), org_id: orgId, kind, key_id: keyId, stream_id: streamId, method, path: String(path).slice(0, 200), status, summary: summary ? String(summary).slice(0, 300) : null, created_at: now() });
  // Keep the newest 1,000 per business.
  if (Math.random() < 0.05) {
    db.run(`DELETE FROM api_log WHERE org_id = ? AND id NOT IN (SELECT id FROM api_log WHERE org_id = ? ORDER BY created_at DESC LIMIT 1000)`, orgId, orgId);
  }
}

// ───────────────────────── Keeping things in check ─────────────────────────

/**
 * Early each month, any stream with nothing recorded for last month gets a
 * task to add its figures – so no income stream quietly drops off the books.
 */
export function remindMissingMonths(ctx, at = new Date()) {
  const { db } = ctx;
  let created = 0;
  for (const org of db.all('SELECT * FROM organizations')) {
    const tz = org.timezone || 'Europe/London';
    const today = localDate(at, tz);
    if (Number(today.slice(8, 10)) > 3) continue;
    const last = addMonths(monthKey(today), -1);
    for (const s of listStreams(db, org.id)) {
      if (s.created_at.slice(0, 7) > last) continue;
      const has = db.get('SELECT 1 FROM stream_entries WHERE stream_id = ? AND date >= ? AND date <= ? LIMIT 1', s.id, `${last}-01`, monthEnd(last));
      if (has) continue;
      const ref = `stream-month:${s.id}:${last}`;
      if (db.get('SELECT 1 FROM tasks WHERE org_id = ? AND source_ref = ?', org.id, ref)) continue;
      const label = new Date(`${last}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      db.insert('tasks', {
        id: id('tsk'), org_id: org.id, title: `Add ${label} figures for ${s.name}`,
        description: `Nothing is recorded for ${s.name} in ${label}. Add what came in and went out (or import the CSV) so your totals and tax set-aside stay right. Open: #/api/streams/${s.id}`,
        status: 'todo', priority: 'medium', assignee_id: s.created_by || null, due_at: at.toISOString(), source: 'automation', source_ref: ref,
        recurrence: null, checklist: '[]', created_by: null, created_at: now(), updated_at: now(),
      });
      created++;
    }
  }
  return created;
}

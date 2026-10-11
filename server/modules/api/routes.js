import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../../config.js';
import { parseJson } from '../../db/index.js';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { serverBase } from '../../lib/links.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { HttpError, badRequest, id, now, pick } from '../../lib/util.js';
import { createTask } from '../tasks/service.js';
import { upsertContact } from '../crm/service.js';
import {
  addEntries, addEntry, deleteEntry, getStream, hubSummary, listEntries, listStreams, logRequest, publicStream, recordMetrics, streamSummary,
} from '../streams/service.js';
import { describeType } from '../streams/types.js';

/**
 * The API: one key-protected way for other apps (Zapier, Make, a trading bot,
 * a website, a spreadsheet script…) to read and write this business's data.
 * A key can be limited to what it needs – and to a single income stream, so
 * the app feeding your TikTok numbers can never touch your trading account.
 */

export const SCOPES = {
  'income:read': 'See income streams, entries and totals',
  'income:write': 'Add money in/out and figures to income streams',
  'contacts:read': 'Look up contacts',
  'contacts:write': 'Add leads and contacts (runs your new-lead automations)',
  'tasks:write': 'Create tasks',
  'bookings:read': 'See bookings',
  'invoices:read': 'See quotes and invoices',
};

export const ENDPOINTS = [
  { method: 'GET', path: '/v1', scope: null, about: 'Checks the key: which business, which permissions, which stream.' },
  { method: 'GET', path: '/v1/summary', scope: 'income:read', about: 'Every income stream with this month, last month and tax-year totals.' },
  { method: 'GET', path: '/v1/streams', scope: 'income:read', about: 'Lists the income streams.' },
  { method: 'GET', path: '/v1/streams/:id', scope: 'income:read', about: 'One stream: totals, 12-month history, stats and figures.' },
  { method: 'GET', path: '/v1/streams/:id/entries', scope: 'income:read', about: 'Money in and out. Filter with ?from=2026-04-06&to=2026-10-31&limit=200.' },
  { method: 'POST', path: '/v1/streams/:id/entries', scope: 'income:write', about: 'Adds money in/out. Send one entry or { "entries": [ … ] } (up to 500).', example: { amount: 49.99, description: 'Notion template', category: 'Sale', date: '2026-10-11', id: 'order-1042' } },
  { method: 'DELETE', path: '/v1/streams/:id/entries/:entryId', scope: 'income:write', about: 'Removes an entry.' },
  { method: 'POST', path: '/v1/streams/:id/metrics', scope: 'income:write', about: 'Records figures for the day, e.g. followers or account balance.', example: { followers: 12500, views_30d: 480000 } },
  { method: 'GET', path: '/v1/contacts', scope: 'contacts:read', about: 'Finds contacts. ?search=name, email or phone' },
  { method: 'POST', path: '/v1/contacts', scope: 'contacts:write', about: 'Adds a lead (or updates the matching contact) and runs the new-lead automations.', example: { first_name: 'Sam', last_name: 'Patel', email: 'sam@example.com', phone: '07700 900123', source: 'TikTok', tags: ['tiktok'] } },
  { method: 'POST', path: '/v1/tasks', scope: 'tasks:write', about: 'Creates a task.', example: { title: 'Film the Q4 launch video', due_at: '2026-10-15T09:00:00Z', priority: 'high' } },
  { method: 'GET', path: '/v1/bookings', scope: 'bookings:read', about: 'Bookings. ?from=2026-10-01&to=2026-10-31&status=confirmed' },
  { method: 'GET', path: '/v1/invoices', scope: 'invoices:read', about: 'Quotes and invoices. ?kind=invoice&status=overdue' },
];

const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

/** Signed-in management of keys, the activity log and the docs. */
export function apiKeyRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));
  const admin = requireRole('owner', 'admin');

  r.get('/', (req, res) => {
    const keys = parseJson(db.all(`SELECT k.id, k.name, k.prefix, k.scopes, k.stream_id, s.name AS stream_name, k.created_at, k.last_used_at, k.revoked_at, u.name AS created_by_name
                                    FROM api_keys k LEFT JOIN income_streams s ON s.id = k.stream_id LEFT JOIN users u ON u.id = k.created_by
                                    WHERE k.org_id = ? ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC`, req.org.id), 'scopes');
    res.json({ keys, scopes: SCOPES, endpoints: ENDPOINTS, base_url: `${serverBase()}/api`, demo: config.demoMode });
  });

  r.post('/', admin, (req, res) => {
    const body = pick(req.body, { name: { required: true, max: 80 }, scopes: { type: 'array', required: true }, stream_id: { max: 40 } });
    const scopes = [...new Set(body.scopes)].filter((s) => SCOPES[s]);
    if (!scopes.length) throw badRequest('Choose at least one permission');
    if (body.stream_id) getStream(db, req.org.id, body.stream_id);
    if (body.stream_id && scopes.some((s) => !s.startsWith('income:'))) throw badRequest('A key for one income stream can only have income permissions');
    const key = `cmk_${config.demoMode ? 'test' : 'live'}_${crypto.randomBytes(20).toString('hex')}`;
    const row = { id: id('key'), org_id: req.org.id, name: body.name, prefix: `${key.slice(0, 13)}…`, key_hash: hashKey(key), scopes, stream_id: body.stream_id || null, created_by: req.user.id, created_at: now(), last_used_at: null, revoked_at: null };
    db.insert('api_keys', row);
    const { key_hash: _h, ...safe } = row;
    res.status(201).json({ ...safe, key, note: 'Copy this key now – for your security it won’t be shown again.' });
  });

  r.delete('/:id', admin, (req, res) => {
    const r2 = db.run('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND org_id = ? AND revoked_at IS NULL', now(), req.params.id, req.org.id);
    if (!r2.changes) throw new HttpError(404, 'Key not found');
    res.json({ ok: true });
  });

  r.get('/activity', (req, res) => {
    const kind = ['api', 'webhook'].includes(req.query.kind) ? req.query.kind : null;
    res.json(db.all(`SELECT l.*, k.name AS key_name, s.name AS stream_name FROM api_log l
                       LEFT JOIN api_keys k ON k.id = l.key_id LEFT JOIN income_streams s ON s.id = l.stream_id
                      WHERE l.org_id = ? ${kind ? 'AND l.kind = ?' : ''} ORDER BY l.created_at DESC LIMIT 100`, ...(kind ? [req.org.id, kind] : [req.org.id])));
  });

  return r;
}

/** Resolves an API key into req.org / req.apiKey, and logs every request. */
function requireKey(db) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const key = header.startsWith('Bearer ') ? header.slice(7).trim() : (req.get('x-api-key') || '').trim();
    if (!key) return next(new HttpError(401, 'Send your API key as “Authorization: Bearer cmk_…”'));
    const row = parseJson(db.get('SELECT * FROM api_keys WHERE key_hash = ?', hashKey(key)), 'scopes');
    if (!row || row.revoked_at) return next(new HttpError(401, 'That API key isn’t valid (it may have been revoked)'));
    if (!rateLimit(`api:${row.id}`, { max: 120, windowMs: 60_000 })) {
      logRequest(db, { orgId: row.org_id, keyId: row.id, method: req.method, path: req.originalUrl || req.path, status: 429, summary: 'Rate limit: more than 120 requests a minute' });
      return next(new HttpError(429, 'Too many requests – the limit is 120 a minute per key'));
    }
    req.apiKey = row;
    req.org = db.get('SELECT * FROM organizations WHERE id = ?', row.org_id);
    db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', now(), row.id);
    // Log the outcome of every request (including errors) for the Activity tab.
    const json = res.json.bind(res);
    res.json = (data) => {
      const status = res.statusCode || 200;
      const summary = status >= 400 ? data?.error : res.locals?.summary || null;
      logRequest(db, { orgId: row.org_id, keyId: row.id, streamId: req.params?.id?.startsWith?.('str_') ? req.params.id : row.stream_id, method: req.method, path: (req.originalUrl || req.path).split('?')[0], status, summary });
      return json(data);
    };
    res.locals = res.locals || {};
    next();
  };
}

const need = (scope) => (req, _res, next) => (req.apiKey.scopes.includes(scope) ? next() : next(new HttpError(403, `This key doesn’t have the “${scope}” permission`)));

/** The key-protected API itself, under /api/v1. */
export function publicApiRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireKey(db));
  const tz = (req) => req.org.timezone || 'Europe/London';
  const say = (res, text) => { res.locals.summary = text; };
  /** A stream the key may use: a single-stream key sees only its own. */
  const streamFor = (req) => {
    if (req.apiKey.stream_id && req.apiKey.stream_id !== req.params.id) throw new HttpError(403, 'This key can only be used for its own income stream');
    return getStream(db, req.org.id, req.params.id);
  };
  const visible = (req) => listStreams(db, req.org.id).filter((s) => !req.apiKey.stream_id || s.id === req.apiKey.stream_id);
  const clean = (s) => { const { hook_token: _t, ...rest } = publicStream(s); return rest; };

  r.get('/', (req, res) => {
    const stream = req.apiKey.stream_id ? db.get('SELECT id, name, type FROM income_streams WHERE id = ?', req.apiKey.stream_id) : null;
    res.json({ ok: true, business: { id: req.org.id, name: req.org.name }, key: { name: req.apiKey.name, scopes: req.apiKey.scopes, stream }, endpoints: ENDPOINTS.filter((e) => !e.scope || req.apiKey.scopes.includes(e.scope)).map((e) => `${e.method} ${e.path}`) });
  });

  r.get('/summary', need('income:read'), (req, res) => {
    const hub = hubSummary(db, req.org);
    const streams = hub.streams.filter((s) => !req.apiKey.stream_id || s.id === req.apiKey.stream_id).map(({ hook_token: _t, ...s }) => s);
    res.json({ ...hub, streams, totals: req.apiKey.stream_id ? undefined : hub.totals });
  });

  r.get('/streams', need('income:read'), (req, res) => res.json(visible(req).map(clean)));

  r.get('/streams/:id', need('income:read'), (req, res) => {
    const s = streamFor(req);
    res.json({ ...clean(s), type_info: describeType(s.type), summary: streamSummary(db, s, { tz: tz(req) }) });
  });

  r.get('/streams/:id/entries', need('income:read'), (req, res) => {
    res.json(listEntries(db, streamFor(req), { from: req.query.from, to: req.query.to, kind: req.query.kind, limit: req.query.limit, offset: req.query.offset }));
  });

  r.post('/streams/:id/entries', need('income:write'), (req, res) => {
    const s = streamFor(req);
    const list = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.entries) ? req.body.entries : null;
    if (list) {
      const result = addEntries(ctx, s, list, { source: 'api', tz: tz(req) });
      say(res, `${s.name}: ${result.recorded} recorded, ${result.duplicates} already had${result.errors.length ? `, ${result.errors.length} not understood` : ''}`);
      return res.status(result.recorded ? 201 : 200).json(result);
    }
    const { entry, duplicate } = addEntry(ctx, s, req.body || {}, { source: 'api', tz: tz(req) });
    say(res, `${s.name}: ${duplicate ? 'already had' : `${entry.kind === 'expense' ? '-' : ''}${(entry.amount_pence / 100).toFixed(2)} ${entry.currency}`} ${entry.description || entry.category || ''}`.trim());
    res.status(duplicate ? 200 : 201).json({ entry, duplicate });
  });

  r.delete('/streams/:id/entries/:entryId', need('income:write'), (req, res) => {
    deleteEntry(db, streamFor(req), req.params.entryId);
    res.json({ ok: true });
  });

  r.post('/streams/:id/metrics', need('income:write'), (req, res) => {
    const s = streamFor(req);
    const { date, ...metrics } = req.body?.metrics ? { date: req.body.date, ...req.body.metrics } : (req.body || {});
    const out = recordMetrics(db, s, metrics, { date, source: 'api', tz: tz(req) });
    say(res, `${s.name}: ${Object.entries(out.metrics).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    res.status(201).json(out);
  });

  r.get('/contacts', need('contacts:read'), (req, res) => {
    const q = `%${String(req.query.search || '').trim().toLowerCase()}%`;
    res.json(parseJson(db.all(`SELECT id, first_name, last_name, email, phone, company, lifecycle, source, tags, created_at FROM contacts
                                WHERE org_id = ? AND (lower(first_name || ' ' || COALESCE(last_name,'')) LIKE ? OR lower(COALESCE(email,'')) LIKE ? OR COALESCE(phone,'') LIKE ?)
                                ORDER BY created_at DESC LIMIT ?`, req.org.id, q, q, q, Math.min(200, Number(req.query.limit) || 50)), 'tags'));
  });

  r.post('/contacts', need('contacts:write'), (req, res) => {
    const body = pick(req.body, {
      first_name: { required: true, max: 80 }, last_name: { max: 80 }, email: { max: 200 }, phone: { max: 40 }, company: { max: 120 },
      source: { max: 80 }, tags: { type: 'array' }, notes: { max: 2000 },
    });
    if (!body.email && !body.phone) throw badRequest('Send an email or a phone number');
    const { contact, created, automations } = upsertContact(ctx, req.org.id, { ...body, source: body.source || 'API', tags: (body.tags || []).map(String).slice(0, 10) });
    say(res, `${created ? 'Added' : 'Matched'} ${contact.first_name} ${contact.last_name || ''}`.trim());
    res.status(created ? 201 : 200).json({ contact, created, automations_run: automations?.length || 0 });
  });

  r.post('/tasks', need('tasks:write'), (req, res) => {
    const body = pick(req.body, { title: { required: true, max: 200 }, description: { max: 4000 }, due_at: { max: 40 }, priority: { enum: ['low', 'medium', 'high', 'urgent'] } });
    if (body.due_at && Number.isNaN(Date.parse(body.due_at))) throw badRequest('due_at must be a date like 2026-10-15T09:00:00Z');
    const task = createTask(ctx, req.org.id, { ...body, due_at: body.due_at ? new Date(body.due_at).toISOString() : null, source: 'automation', source_ref: `api:${req.apiKey.id}`, assignee_id: req.apiKey.created_by }, { actorId: req.apiKey.created_by });
    say(res, `Task: ${task.title}`);
    res.status(201).json(task);
  });

  r.get('/bookings', need('bookings:read'), (req, res) => {
    const where = ['b.org_id = ?'];
    const params = [req.org.id];
    if (req.query.from) { where.push('b.starts_at >= ?'); params.push(String(req.query.from)); }
    if (req.query.to) { where.push('b.starts_at <= ?'); params.push(`${req.query.to}T23:59:59Z`); }
    if (req.query.status) { where.push('b.status = ?'); params.push(String(req.query.status)); }
    res.json(db.all(`SELECT b.id, b.starts_at, b.ends_at, b.status, b.source, b.urgency, b.price_pence, sv.name AS service, c.first_name, c.last_name, c.phone
                       FROM bookings b LEFT JOIN services sv ON sv.id = b.service_id LEFT JOIN contacts c ON c.id = b.contact_id
                      WHERE ${where.join(' AND ')} ORDER BY b.starts_at LIMIT 500`, ...params));
  });

  r.get('/invoices', need('invoices:read'), (req, res) => {
    const where = ['i.org_id = ?'];
    const params = [req.org.id];
    if (['quote', 'invoice'].includes(req.query.kind)) { where.push('i.kind = ?'); params.push(req.query.kind); }
    if (req.query.status) { where.push('i.status = ?'); params.push(String(req.query.status)); }
    res.json(db.all(`SELECT i.id, i.kind, i.number, i.status, i.title, i.issue_date, i.due_date, i.total_pence, i.paid_pence, c.first_name, c.last_name, c.email
                       FROM invoices i LEFT JOIN contacts c ON c.id = i.contact_id WHERE ${where.join(' AND ')} ORDER BY i.issue_date DESC LIMIT 500`, ...params));
  });

  r.use((req, _res, next) => next(new HttpError(404, `No such endpoint: ${req.method} ${req.path}`)));
  return r;
}

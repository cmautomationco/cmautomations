import { Router } from 'express';
import { config } from '../../config.js';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { serverBase } from '../../lib/links.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { encryptSecret, secretsAvailable } from '../../lib/secrets.js';
import { HttpError, badRequest, now, pick, publicToken } from '../../lib/util.js';
import { STREAM_TYPES, describeType } from './types.js';
import {
  CURRENCIES, KINDS, addEntries, addEntry, createStream, deleteEntry, deleteTestEntries, getStream, hubSummary, importCsv, listEntries, listStreams,
  publicStream, receiveWebhook, recordMetrics, sampleWebhook, streamSummary, updateEntry, updateStream,
} from './service.js';

export const hookUrl = (stream) => `${serverBase()}/api/hooks/stream/${stream.hook_token}`;

/** The API hub screens: every income stream, side by side but kept separate. */
export function streamRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));
  const admin = requireRole('owner', 'admin');
  const tz = (req) => req.org.timezone || 'Europe/London';
  const stream = (req) => getStream(db, req.org.id, req.params.id);

  r.get('/types', (_req, res) => res.json(Object.keys(STREAM_TYPES).map(describeType)));

  r.get('/', (req, res) => {
    const hub = hubSummary(db, req.org);
    const keys = db.get('SELECT COUNT(*) AS n FROM api_keys WHERE org_id = ? AND revoked_at IS NULL', req.org.id).n;
    const archived = listStreams(db, req.org.id, { archived: true }).map(publicStream);
    res.json({ ...hub, api_keys: keys, archived });
  });

  r.post('/', admin, (req, res) => {
    const body = pick(req.body, {
      type: { required: true, enum: Object.keys(STREAM_TYPES) }, name: { max: 80 }, handle: { max: 120 }, currency: { enum: CURRENCIES },
      goal_monthly_pence: { type: 'number' }, tax_set_aside_pct: { type: 'number' }, notes: { max: 2000 },
    });
    res.status(201).json(publicStream(createStream(db, req.org.id, body, { actorId: req.user.id })));
  });

  r.get('/:id', (req, res) => {
    const s = stream(req);
    const summary = streamSummary(db, s, { tz: tz(req) });
    // One month at a time (this month unless another is picked).
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : summary.month.key;
    const [y, m] = month.split('-').map(Number);
    const entries = listEntries(db, s, { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10), limit: 1000 });
    res.json({
      stream: publicStream(s), type: describeType(s.type), summary, entries, month,
      hook_url: hookUrl(s), demo: config.demoMode, secrets_available: secretsAvailable() && !config.demoMode,
      deliveries: db.all(`SELECT method, status, summary, created_at FROM api_log WHERE stream_id = ? ORDER BY created_at DESC LIMIT 15`, s.id),
      keys: db.all(`SELECT id, name, prefix, scopes, last_used_at FROM api_keys WHERE org_id = ? AND stream_id = ? AND revoked_at IS NULL`, req.org.id, s.id),
    });
  });

  r.patch('/:id', admin, (req, res) => {
    const body = pick(req.body, {
      name: { max: 80 }, handle: { max: 120 }, currency: { enum: CURRENCIES }, goal_monthly_pence: { type: 'number' },
      tax_set_aside_pct: { type: 'number' }, notes: { max: 2000 }, archived: { type: 'boolean' }, position: { type: 'number' },
    }, { partial: true });
    res.json(publicStream(updateStream(db, req.org.id, req.params.id, body)));
  });

  r.delete('/:id', requireRole('owner'), (req, res) => {
    stream(req);
    db.run('DELETE FROM income_streams WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    res.json({ ok: true });
  });

  // ── Money in and out ──
  r.post('/:id/entries', (req, res) => {
    const s = stream(req);
    if (Array.isArray(req.body?.entries)) return res.status(201).json(addEntries(ctx, s, req.body.entries, { source: 'manual', actorId: req.user.id, tz: tz(req) }));
    const { entry, duplicate, automations } = addEntry(ctx, s, req.body || {}, { source: 'manual', actorId: req.user.id, tz: tz(req) });
    res.status(duplicate ? 200 : 201).json({ entry, duplicate, automations });
  });

  r.patch('/:id/entries/:entryId', (req, res) => res.json(updateEntry(db, stream(req), req.params.entryId, req.body || {}, { tz: tz(req) })));

  r.delete('/:id/test-entries', (req, res) => res.json({ removed: deleteTestEntries(db, stream(req)) }));

  r.delete('/:id/entries/:entryId', (req, res) => { deleteEntry(db, stream(req), req.params.entryId); res.json({ ok: true }); });

  r.post('/:id/metrics', (req, res) => {
    const { date, ...metrics } = req.body?.metrics ? { date: req.body.date, ...req.body.metrics } : (req.body || {});
    res.status(201).json(recordMetrics(db, stream(req), metrics, { date, source: 'manual', tz: tz(req) }));
  });

  r.post('/:id/import', (req, res) => {
    const body = pick(req.body, { csv: { required: true, max: 3_000_000 }, dry_run: { type: 'boolean' }, mapping: { type: 'object' } });
    res.json(importCsv(ctx, stream(req), body.csv, { dryRun: body.dry_run, mapping: body.mapping, actorId: req.user.id, tz: tz(req) }));
  });

  // ── The stream's own web address ──
  r.post('/:id/hook/rotate', admin, (req, res) => {
    const s = stream(req);
    db.update('income_streams', s.id, { hook_token: publicToken(), updated_at: now() });
    res.json({ hook_url: hookUrl(getStream(db, req.org.id, s.id)) });
  });

  r.put('/:id/hook/secret', admin, (req, res) => {
    const s = stream(req);
    const secret = String(req.body?.secret || '').trim();
    if (secret && (!secretsAvailable() || config.demoMode)) throw badRequest('Signing secrets can only be stored on the live server.');
    if (secret && secret.length < 8) throw badRequest('That doesn’t look like a signing secret');
    db.update('income_streams', s.id, { hook_secret: secret ? encryptSecret(secret) : null, updated_at: now() });
    res.json({ hook_signed: Boolean(secret) });
  });

  r.post('/:id/hook/test', (req, res) => {
    const s = stream(req);
    const kind = ['generic', 'stripe', 'shopify', 'gumroad', 'metrics'].includes(req.body?.sample) ? req.body.sample : 'generic';
    const sample = sampleWebhook(kind, s);
    const result = receiveWebhook(ctx, s, { ...sample, rawBody: JSON.stringify(sample.body), test: true, tz: tz(req) });
    res.json({ sent: sample.body, result });
  });

  return r;
}

/**
 * Each stream's own web address: Stripe, Shopify, Gumroad, Zapier, Make, a
 * trading bot or any app can send money in/out and figures to it. The long
 * random address is the password; a signing secret adds Stripe/Shopify checks.
 */
export function streamHookRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.post('/:token', (req, res) => {
    const token = String(req.params.token || '');
    if (!rateLimit(`stream-hook:${token}`, { max: 120, windowMs: 60_000 })) throw new HttpError(429, 'Too many deliveries – slow down');
    const s = token.length >= 20 ? db.get('SELECT * FROM income_streams WHERE hook_token = ? AND archived = 0', token) : null;
    if (!s) throw new HttpError(404, 'Not found');
    const org = db.get('SELECT timezone FROM organizations WHERE id = ?', s.org_id);
    const headers = Object.fromEntries(['x-shopify-topic', 'x-shopify-hmac-sha256', 'stripe-signature'].map((h) => [h, req.get(h)]).filter(([, v]) => v));
    res.json(receiveWebhook(ctx, s, { headers, body: req.body, rawBody: req.rawBody || '', tz: org?.timezone || 'Europe/London' }));
  });
  return r;
}

export { KINDS };

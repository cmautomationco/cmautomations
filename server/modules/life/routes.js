import express from 'express';
import { requireAuth } from '../../lib/auth.js';
import { HttpError, now } from '../../lib/util.js';
import { getStream, recordMetrics } from '../streams/service.js';
import { STREAM_TYPES } from '../streams/types.js';

/**
 * The personal Life Dashboard (/life) keeps working offline in the browser and
 * syncs through here so a phone and a laptop share one copy.
 *
 *   GET  /api/life/state   → { version, updated_at, device, data }
 *   PUT  /api/life/state   { data, base_version, device }
 *        409 with the stored copy if another device saved since base_version,
 *        so the dashboard merges both and tries again – nothing is overwritten.
 *   GET  /api/life/socials → follower / subscriber history from the API hub
 *   POST /api/life/socials/:streamId { count, date? } → records it in the hub
 *
 * Data belongs to the signed-in person, not the business they're in.
 */
const MAX_BYTES = 8 * 1024 * 1024;
const FOLLOWER_KEYS = ['followers', 'subscribers'];

const followerKey = (type) => (STREAM_TYPES[type]?.metrics || []).map((m) => m.key).find((k) => FOLLOWER_KEYS.includes(k)) || null;

export function lifeRoutes(ctx) {
  const { db } = ctx;
  const r = express.Router();
  r.use(requireAuth(db));

  r.get('/state', (req, res) => {
    const row = db.get('SELECT data, version, updated_at, device FROM life_state WHERE user_id = ?', req.user.id);
    res.json(row ? { version: row.version, updated_at: row.updated_at, device: row.device, data: JSON.parse(row.data) } : { version: 0, updated_at: null, device: null, data: null });
  });

  r.put('/state', (req, res) => {
    const { data, base_version: base, device } = req.body || {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Send the dashboard as { data, base_version }');
    if (!Number.isInteger(base) || base < 0) throw new HttpError(400, 'base_version must be the version this device last synced (0 the first time)');
    const json = JSON.stringify(data);
    if (Buffer.byteLength(json) > MAX_BYTES) throw new HttpError(413, 'Your dashboard is too large to sync (over 8 MB)');
    const label = typeof device === 'string' ? device.slice(0, 60) : null;
    const result = db.tx(() => {
      const row = db.get('SELECT version, data, updated_at, device FROM life_state WHERE user_id = ?', req.user.id);
      const current = row ? row.version : 0;
      if (current !== base) return { conflict: row };
      const version = current + 1;
      const at = now();
      if (row) db.run('UPDATE life_state SET data = ?, version = ?, updated_at = ?, device = ? WHERE user_id = ?', json, version, at, label, req.user.id);
      else db.run('INSERT INTO life_state (user_id, data, version, updated_at, device) VALUES (?, ?, ?, ?, ?)', req.user.id, json, version, at, label);
      return { version, updated_at: at };
    });
    if (result.conflict) {
      const c = result.conflict;
      return res.status(409).json({ error: 'Changed on another device since this one last synced', version: c.version, updated_at: c.updated_at, device: c.device, data: JSON.parse(c.data) });
    }
    res.json(result);
  });

  // ── Social channels ↔ API hub (followers / subscribers) ──
  r.get('/socials', (req, res) => {
    const streams = db.all('SELECT * FROM income_streams WHERE org_id = ? AND archived = 0 ORDER BY position, created_at', req.org.id);
    const out = [];
    for (const s of streams) {
      const recorded = db.all(`SELECT DISTINCT key FROM stream_metrics WHERE stream_id = ? AND key IN ('followers', 'subscribers')`, s.id).map((x) => x.key);
      const key = followerKey(s.type) || recorded[0] || (s.type === 'other' ? 'followers' : null);
      if (!key) continue;
      const points = db.all('SELECT date, value FROM stream_metrics WHERE stream_id = ? AND key = ? ORDER BY date DESC LIMIT 60', s.id, key).reverse();
      const t = STREAM_TYPES[s.type] || STREAM_TYPES.other;
      out.push({ id: s.id, name: s.name, handle: s.handle, type: s.type, type_label: t.label, icon: t.icon, key, points });
    }
    res.json(out);
  });

  r.post('/socials/:id', (req, res) => {
    const s = getStream(db, req.org.id, req.params.id);
    const count = Number(req.body?.count);
    if (!Number.isFinite(count) || count < 0) throw new HttpError(400, 'count must be a number of followers');
    const key = followerKey(s.type) || db.get(`SELECT key FROM stream_metrics WHERE stream_id = ? AND key IN ('followers', 'subscribers') LIMIT 1`, s.id)?.key || 'followers';
    const saved = recordMetrics(db, s, { [key]: Math.round(count) }, { date: req.body?.date || null, source: 'life-dashboard', tz: req.org.timezone || 'Europe/London' });
    res.status(201).json({ stream_id: s.id, key, saved });
  });

  return r;
}

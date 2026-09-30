import { Router } from 'express';
import { parseJson } from '../db/index.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { badRequest, id, notFound, now, pick } from '../lib/util.js';
import { ACTIONS, TRIGGERS } from './engine.js';
import { RECIPES } from './recipes.js';

function validateRule(body) {
  if (body.trigger && !TRIGGERS[body.trigger]) throw badRequest(`Unknown trigger ${body.trigger}`);
  for (const a of body.actions || []) if (!ACTIONS[a.type]) throw badRequest(`Unknown action ${a.type}`);
  for (const c of body.conditions || []) if (!c.field) throw badRequest('Every condition needs a field');
}

export function automationRoutes({ db, engine }) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/meta', (_req, res) => res.json({ triggers: TRIGGERS, actions: ACTIONS, recipes: RECIPES }));

  r.get('/', (req, res) => {
    res.json(parseJson(db.all('SELECT * FROM automations WHERE org_id = ? ORDER BY created_at', req.org.id), 'conditions', 'actions'));
  });

  r.get('/runs', (req, res) => {
    res.json(db.all('SELECT * FROM automation_runs WHERE org_id = ? ORDER BY created_at DESC LIMIT 100', req.org.id));
  });

  r.get('/impact', (req, res) => {
    const rows = db.all(`SELECT substr(created_at,1,10) AS day, SUM(minutes_saved) AS minutes, COUNT(*) AS runs FROM automation_runs WHERE org_id = ? AND created_at >= ? AND status = 'success' GROUP BY day ORDER BY day`, req.org.id, new Date(Date.now() - 30 * 86400_000).toISOString());
    const total = rows.reduce((s, d) => s + d.minutes, 0);
    res.json({ days: rows, total_minutes: total, total_runs: rows.reduce((s, d) => s + d.runs, 0) });
  });

  r.post('/', requireRole('owner', 'admin'), (req, res) => {
    const body = pick(req.body, { name: { required: true, max: 120 }, description: { max: 500 }, trigger: { required: true }, conditions: { type: 'array' }, actions: { type: 'array', required: true } });
    validateRule(body);
    const row = { id: id('aut'), org_id: req.org.id, ...body, conditions: body.conditions || [], enabled: 1, recipe: null, run_count: 0, created_at: now() };
    db.insert('automations', row);
    res.status(201).json(row);
  });

  r.patch('/:id', requireRole('owner', 'admin'), (req, res) => {
    if (!db.get('SELECT 1 FROM automations WHERE id = ? AND org_id = ?', req.params.id, req.org.id)) throw notFound('Automation');
    const patch = pick(req.body, { name: { max: 120 }, description: { max: 500 }, trigger: {}, conditions: { type: 'array' }, actions: { type: 'array' }, enabled: { type: 'boolean' } }, { partial: true });
    validateRule(patch);
    db.update('automations', req.params.id, patch);
    res.json(parseJson(db.get('SELECT * FROM automations WHERE id = ?', req.params.id), 'conditions', 'actions'));
  });

  r.delete('/:id', requireRole('owner', 'admin'), (req, res) => {
    db.run('DELETE FROM automations WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    res.json({ ok: true });
  });

  // Run just this automation once against a sample payload to check it works.
  r.post('/:id/test', requireRole('owner', 'admin'), (req, res) => {
    const rule = parseJson(db.get('SELECT * FROM automations WHERE id = ? AND org_id = ?', req.params.id, req.org.id), 'conditions', 'actions');
    if (!rule) throw notFound('Automation');
    const results = engine.emit(req.org.id, rule.trigger, req.body?.payload || {}, { actorId: req.user.id, onlyId: rule.id });
    res.json(results);
  });

  return r;
}

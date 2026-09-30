import { Router } from 'express';
import { parseJson } from '../../db/index.js';
import { requireAuth } from '../../lib/auth.js';
import { badRequest, now, pick } from '../../lib/util.js';
import { PRIORITIES, TASK_STATUSES, createTask, getTask, updateTask } from './service.js';

const taskSchema = {
  title: { required: true, max: 200 }, description: { max: 5000 }, status: { enum: TASK_STATUSES },
  priority: { enum: PRIORITIES }, assignee_id: {}, due_at: {}, recurrence: { enum: ['daily', 'weekly', 'monthly'] },
  checklist: { type: 'array' },
};

function normalise(db, orgId, body) {
  if (body.assignee_id && !db.get('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?', orgId, body.assignee_id)) {
    throw badRequest('Assignee must be a member of this business');
  }
  if (body.due_at) {
    const d = new Date(body.due_at);
    if (Number.isNaN(d.getTime())) throw badRequest('due_at must be a valid date');
    body.due_at = d.toISOString();
  }
  if (body.checklist) body.checklist = body.checklist.map((c) => (typeof c === 'string' ? { text: c, done: false } : { text: String(c.text || ''), done: Boolean(c.done) }));
  return body;
}

export function taskRoutes({ db, engine }) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/', (req, res) => {
    const where = ['t.org_id = ?'];
    const params = [req.org.id];
    if (req.query.assignee === 'me') { where.push('t.assignee_id = ?'); params.push(req.user.id); } else if (req.query.assignee) { where.push('t.assignee_id = ?'); params.push(req.query.assignee); }
    if (req.query.status) { where.push('t.status = ?'); params.push(req.query.status); }
    if (req.query.source) { where.push('t.source = ?'); params.push(req.query.source); }
    if (req.query.view === 'today') {
      const end = new Date(); end.setUTCHours(23, 59, 59, 999);
      where.push(`t.status != 'done' AND t.due_at <= ?`); params.push(end.toISOString());
    }
    // Keep the board light: only show recently completed tasks.
    if (!req.query.status) { where.push(`(t.status != 'done' OR t.completed_at >= ?)`); params.push(new Date(Date.now() - 14 * 86400_000).toISOString()); }
    const rows = db.all(`SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE ${where.join(' AND ')}
      ORDER BY (t.due_at IS NULL), t.due_at, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 500`, ...params);
    res.json(parseJson(rows, 'checklist'));
  });

  r.post('/', (req, res) => {
    const body = normalise(db, req.org.id, pick(req.body, taskSchema));
    const task = createTask({ db }, req.org.id, { ...body, assignee_id: body.assignee_id || req.user.id }, { actorId: req.user.id });
    res.status(201).json(getTask(db, req.org.id, task.id));
  });

  r.get('/workload', (req, res) => {
    res.json(db.all(`SELECT u.id, u.name,
        SUM(t.status != 'done') AS open,
        SUM(t.status != 'done' AND t.due_at < ?) AS overdue,
        SUM(t.status != 'done' AND t.priority IN ('high','urgent')) AS high_priority
      FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN tasks t ON t.assignee_id = u.id AND t.org_id = m.org_id
      WHERE m.org_id = ? GROUP BY u.id ORDER BY open DESC`, now(), req.org.id));
  });

  r.get('/:id', (req, res) => res.json(getTask(db, req.org.id, req.params.id)));

  r.patch('/:id', (req, res) => {
    const patch = normalise(db, req.org.id, pick(req.body, taskSchema, { partial: true }));
    const task = updateTask({ db, engine }, req.org.id, req.params.id, patch, { actorId: req.user.id });
    res.json(task);
  });

  r.delete('/:id', (req, res) => {
    getTask(db, req.org.id, req.params.id);
    db.run('DELETE FROM tasks WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });

  return r;
}

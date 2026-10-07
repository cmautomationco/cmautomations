import { Router } from 'express';
import { requireAuth } from '../../lib/auth.js';
import { id, now, pick } from '../../lib/util.js';
import { CATEGORIES, PRIORITIES, SLA_HOURS, STATUSES, createIssue, getIssue, updateIssue } from './service.js';

const issueSchema = {
  title: { required: true, max: 200 }, description: { max: 5000 }, category: { enum: CATEGORIES },
  priority: { enum: PRIORITIES }, assignee_id: {}, contact_id: {},
};

export function helpdeskRoutes({ db, engine }) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/meta', (_req, res) => res.json({ categories: CATEGORIES, priorities: PRIORITIES, statuses: STATUSES, sla_hours: SLA_HOURS }));

  r.get('/issues', (req, res) => {
    const where = ['i.org_id = ?'];
    const params = [req.org.id];
    const view = req.query.view || 'open';
    if (view === 'open') where.push(`i.status != 'resolved'`);
    if (view === 'mine') { where.push(`i.status != 'resolved' AND i.assignee_id = ?`); params.push(req.user.id); }
    if (view === 'resolved') where.push(`i.status = 'resolved'`);
    if (req.query.q) { where.push('(i.title LIKE ? OR i.description LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
    res.json(db.all(`SELECT i.*, a.name AS assignee_name, r.name AS reporter_name,
        (SELECT COUNT(*) FROM issue_comments c WHERE c.issue_id = i.id) AS comment_count
      FROM issues i LEFT JOIN users a ON a.id = i.assignee_id LEFT JOIN users r ON r.id = i.created_by
      WHERE ${where.join(' AND ')}
      ORDER BY (i.status = 'resolved'), CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.due_at
      LIMIT 300`, ...params));
  });

  r.get('/stats', (req, res) => {
    const o = req.org.id;
    const week = new Date(Date.now() - 7 * 86400_000).toISOString();
    const n = (sql, ...p) => db.get(sql, o, ...p).n;
    const resolved = db.all(`SELECT created_at, resolved_at FROM issues WHERE org_id = ? AND status = 'resolved' AND resolved_at >= ?`, o, week);
    const avgHours = resolved.length
      ? Math.round(resolved.reduce((s, i) => s + (new Date(i.resolved_at) - new Date(i.created_at)) / 3600_000, 0) / resolved.length * 10) / 10
      : null;
    res.json({
      open: n(`SELECT COUNT(*) AS n FROM issues WHERE org_id = ? AND status != 'resolved'`),
      urgent: n(`SELECT COUNT(*) AS n FROM issues WHERE org_id = ? AND status != 'resolved' AND priority IN ('urgent','high')`),
      overdue: n(`SELECT COUNT(*) AS n FROM issues WHERE org_id = ? AND status != 'resolved' AND due_at < ?`, now()),
      resolved_week: resolved.length,
      avg_resolution_hours: avgHours,
    });
  });

  r.post('/issues', (req, res) => {
    const body = pick(req.body, issueSchema);
    const result = createIssue({ db, engine }, req.org.id, { ...body, source: req.body?.source === 'customer' ? 'customer' : 'manual' }, { actorId: req.user.id });
    res.status(201).json(result);
  });

  r.get('/issues/:id', (req, res) => {
    const issue = getIssue(db, req.org.id, req.params.id);
    issue.comments = db.all('SELECT c.*, u.name AS author FROM issue_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.issue_id = ? ORDER BY c.created_at', issue.id);
    res.json(issue);
  });

  r.patch('/issues/:id', (req, res) => {
    const patch = pick(req.body, { ...issueSchema, title: { max: 200 }, status: { enum: STATUSES }, resolution: { max: 5000 } }, { partial: true });
    res.json(updateIssue({ db, engine }, req.org.id, req.params.id, patch, { actorId: req.user.id }));
  });

  r.delete('/issues/:id', (req, res) => {
    getIssue(db, req.org.id, req.params.id);
    db.run('DELETE FROM issues WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });

  r.post('/issues/:id/comments', (req, res) => {
    const issue = getIssue(db, req.org.id, req.params.id);
    const body = pick(req.body, { body: { required: true, max: 5000 } });
    const comment = { id: id('icm'), issue_id: issue.id, user_id: req.user.id, body: body.body, created_at: now() };
    db.insert('issue_comments', comment);
    // A reply on a fresh issue means someone is working on it.
    if (issue.status === 'open') db.update('issues', issue.id, { status: 'in_progress', updated_at: now() });
    else db.update('issues', issue.id, { updated_at: now() });
    res.status(201).json({ ...comment, author: req.user.name });
  });

  return r;
}

import { addHours, badRequest, id, notFound, now } from '../../lib/util.js';

export const CATEGORIES = ['technical', 'customer', 'billing', 'operations', 'content', 'other'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const STATUSES = ['open', 'in_progress', 'waiting', 'resolved'];

/** Response-time targets: how long each priority can wait before it is escalated. */
export const SLA_HOURS = { urgent: 4, high: 24, medium: 72, low: 168 };

export function getIssue(db, orgId, issueId) {
  const issue = db.get(`SELECT i.*, a.name AS assignee_name, r.name AS reporter_name, c.first_name || ' ' || COALESCE(c.last_name, '') AS contact_name
    FROM issues i LEFT JOIN users a ON a.id = i.assignee_id LEFT JOIN users r ON r.id = i.created_by LEFT JOIN contacts c ON c.id = i.contact_id
    WHERE i.id = ? AND i.org_id = ?`, issueId, orgId);
  if (!issue) throw notFound('Issue');
  return issue;
}

function assertMember(db, orgId, userId) {
  if (userId && !db.get('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?', orgId, userId)) throw badRequest('Assignee must be a member of this business');
}

/** Picks who should handle a new issue: the admin/owner with the fewest open issues. */
function defaultAssignee(db, orgId) {
  return db.get(`SELECT m.user_id FROM memberships m
    WHERE m.org_id = ? AND m.role IN ('owner','admin')
    ORDER BY (SELECT COUNT(*) FROM issues i WHERE i.assignee_id = m.user_id AND i.status != 'resolved'), m.role DESC LIMIT 1`, orgId)?.user_id || null;
}

export function createIssue({ db, engine }, orgId, data, { actorId = null } = {}) {
  if (!data.title || !String(data.title).trim()) throw badRequest('Give the issue a short title');
  const priority = PRIORITIES.includes(data.priority) ? data.priority : 'medium';
  if (data.contact_id && !db.get('SELECT 1 FROM contacts WHERE id = ? AND org_id = ?', data.contact_id, orgId)) throw badRequest('Unknown contact');
  assertMember(db, orgId, data.assignee_id);
  const ts = now();
  const issue = {
    id: id('iss'), org_id: orgId, title: String(data.title).trim().slice(0, 200), description: data.description || null,
    category: CATEGORIES.includes(data.category) ? data.category : 'other', priority, status: 'open',
    source: ['manual', 'assistant', 'customer'].includes(data.source) ? data.source : 'manual',
    contact_id: data.contact_id || null, assignee_id: data.assignee_id || defaultAssignee(db, orgId),
    due_at: addHours(ts, SLA_HOURS[priority]), created_by: actorId, created_at: ts, updated_at: ts,
  };
  db.insert('issues', issue);
  const full = getIssue(db, orgId, issue.id);
  const automations = engine.emit(orgId, 'issue.created', { issue: full }, { actorId });
  return { issue: full, automations };
}

export function updateIssue({ db, engine }, orgId, issueId, patch, { actorId = null } = {}) {
  const before = getIssue(db, orgId, issueId);
  assertMember(db, orgId, patch.assignee_id);
  const changes = { ...patch, updated_at: now() };
  // A new priority resets the response target from when the issue was raised.
  if (patch.priority && patch.priority !== before.priority) {
    changes.due_at = addHours(before.created_at, SLA_HOURS[patch.priority]);
    changes.overdue_notified = 0;
  }
  const resolving = patch.status === 'resolved' && before.status !== 'resolved';
  if (resolving) {
    if (!(patch.resolution || before.resolution)) throw badRequest('Add a short note on how it was resolved');
    changes.resolved_at = now();
  }
  if (patch.status && patch.status !== 'resolved') changes.resolved_at = null;
  db.update('issues', issueId, changes);
  const issue = getIssue(db, orgId, issueId);
  const automations = resolving ? engine.emit(orgId, 'issue.resolved', { issue }, { actorId }) : [];
  if (resolving) engine.logSystemRun(orgId, 'Help Desk', 'issue.resolved', `Resolved “${issue.title}”`, 0);
  return { issue, automations };
}

import { id, now } from '../../lib/util.js';

export function notifyUsers(db, orgId, userIds, { title, body = '', link = '' }) {
  for (const userId of new Set(userIds.filter(Boolean))) {
    db.insert('notifications', { id: id('ntf'), org_id: orgId, user_id: userId, title, body, link, read: 0, created_at: now() });
  }
}

/**
 * Turns a recipient keyword into user ids:
 *   owner    – the record owner (contact/deal/task assignee), falling back to org owners
 *   assignee – the task (or issue) assignee
 *   reporter – whoever raised the Help Desk issue
 *   actor    – whoever triggered the event
 *   admins   – org owners and admins
 *   all      – everyone in the business
 *   usr_...  – a specific user
 */
export function resolveRecipients(db, orgId, target, ctx = {}) {
  const admins = () => db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin') ORDER BY role DESC`, orgId).map((r) => r.user_id);
  switch (target) {
    case 'owner': {
      const owner = ctx.contact?.owner_id || ctx.deal?.owner_id || ctx.task?.assignee_id || ctx.issue?.assignee_id || ctx.idea?.assignee_id || ctx.project?.created_by;
      return owner ? [owner] : admins().slice(0, 1);
    }
    case 'assignee': {
      const assignee = ctx.task?.assignee_id || ctx.issue?.assignee_id;
      return assignee ? [assignee] : admins().slice(0, 1);
    }
    case 'reporter':
      return ctx.issue?.created_by ? [ctx.issue.created_by] : admins().slice(0, 1);
    case 'actor':
      return ctx.actor?.id ? [ctx.actor.id] : admins().slice(0, 1);
    case 'admins':
      return admins();
    case 'all':
      return db.all('SELECT user_id FROM memberships WHERE org_id = ?', orgId).map((r) => r.user_id);
    default:
      return db.get('SELECT user_id FROM memberships WHERE org_id = ? AND user_id = ?', orgId, target) ? [target] : [];
  }
}

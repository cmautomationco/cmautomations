import { parseJson } from '../../db/index.js';
import { addDays, id, now, notFound } from '../../lib/util.js';

export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export function getTask(db, orgId, taskId) {
  const task = parseJson(db.get('SELECT * FROM tasks WHERE id = ? AND org_id = ?', taskId, orgId), 'checklist');
  if (!task) throw notFound('Task');
  return task;
}

export function createTask({ db }, orgId, data, { actorId = null } = {}) {
  const ts = now();
  const task = {
    id: id('tsk'),
    org_id: orgId,
    title: data.title,
    description: data.description || null,
    status: data.status || 'todo',
    priority: data.priority || 'medium',
    assignee_id: data.assignee_id || null,
    due_at: data.due_at || null,
    source: data.source || 'manual',
    source_ref: data.source_ref || null,
    recurrence: data.recurrence || null,
    checklist: data.checklist || [],
    created_by: actorId,
    created_at: ts,
    updated_at: ts,
  };
  db.insert('tasks', task);
  return task;
}

const nextDue = (due, recurrence) => {
  const base = due || now();
  if (recurrence === 'daily') return addDays(base, 1);
  if (recurrence === 'weekly') return addDays(base, 7);
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
};

/**
 * Updates a task. Moving a task to "done" stamps completion, spawns the next
 * occurrence of recurring tasks and emits task.completed for automations.
 */
export function updateTask({ db, engine }, orgId, taskId, patch, { actorId = null } = {}) {
  const before = getTask(db, orgId, taskId);
  const changes = { ...patch, updated_at: now() };
  const completing = patch.status === 'done' && before.status !== 'done';
  if (completing) changes.completed_at = now();
  if (patch.status && patch.status !== 'done') changes.completed_at = null;
  if (patch.due_at !== undefined) changes.overdue_notified = 0;
  db.update('tasks', taskId, changes);
  const task = getTask(db, orgId, taskId);

  if (completing) {
    if (task.recurrence) {
      const next = createTask({ db }, orgId, {
        ...task,
        status: 'todo',
        due_at: nextDue(task.due_at, task.recurrence),
        checklist: task.checklist.map((c) => ({ ...c, done: false })),
      }, { actorId });
      engine.logSystemRun(orgId, 'Recurring task', 'task.completed', `Scheduled next “${task.title}” for ${next.due_at.slice(0, 10)}`, 2);
    }
    engine.emit(orgId, 'task.completed', { task }, { actorId });
  }
  return task;
}

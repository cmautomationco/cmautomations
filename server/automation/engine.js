import { parseJson } from '../db/index.js';
import { addDays, id, now, render } from '../lib/util.js';
import { createTask } from '../modules/tasks/service.js';
import { notifyUsers, resolveRecipients } from '../modules/core/notifications.js';

/**
 * The automation engine.
 *
 * Every module emits events (e.g. "deal.won"). The engine finds the org's
 * enabled automations for that trigger, checks their conditions against the
 * event payload and runs their actions. Each run is logged with an estimate
 * of minutes saved, which powers the "time saved" numbers on the dashboard.
 */

export const TRIGGERS = {
  'contact.created': 'A new contact/lead is added',
  'contact.follow_up_due': 'A contact’s follow-up date is reached',
  'deal.stage_changed': 'A deal moves to a new stage',
  'deal.won': 'A deal is won',
  'deal.lost': 'A deal is lost',
  'task.completed': 'A task is completed',
  'task.overdue': 'A task becomes overdue',
  'funnel.step_completed': 'A Build Funnel step is completed',
  'funnel.stage_completed': 'A Build Funnel stage is completed',
  'content.finalised': 'A piece of content is finalised by the client',
  'post.published': 'A scheduled post is published',
  'post.failed': 'A scheduled post fails to publish',
  'schedule.daily': 'Every morning (daily digest time)',
  'issue.created': 'A Help Desk issue is raised',
  'issue.overdue': 'A Help Desk issue passes its response target',
  'issue.resolved': 'A Help Desk issue is resolved',
};

export const ACTIONS = {
  create_task: { label: 'Create a task', minutes: 3 },
  notify: { label: 'Send a notification', minutes: 1 },
  update_contact: { label: 'Update the contact', minutes: 1 },
  set_follow_up: { label: 'Set a follow-up date', minutes: 2 },
  log_activity: { label: 'Log a CRM activity', minutes: 2 },
  webhook: { label: 'Send to a webhook (Zapier, Make, etc.)', minutes: 5 },
};

const OPERATORS = {
  eq: (a, b) => String(a) === String(b),
  neq: (a, b) => String(a) !== String(b),
  gt: (a, b) => Number(a) > Number(b),
  gte: (a, b) => Number(a) >= Number(b),
  lt: (a, b) => Number(a) < Number(b),
  contains: (a, b) => (Array.isArray(a) ? a.map(String).includes(String(b)) : String(a ?? '').toLowerCase().includes(String(b).toLowerCase())),
  in: (a, b) => (Array.isArray(b) ? b : String(b).split(',').map((s) => s.trim())).includes(String(a)),
  exists: (a) => a !== undefined && a !== null && a !== '',
};

const lookup = (obj, path) => path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);

export function conditionsMatch(conditions = [], payload) {
  return conditions.every((c) => {
    const op = OPERATORS[c.op || 'eq'];
    return op ? op(lookup(payload, c.field), c.value) : false;
  });
}

export function createEngine(db) {
  const engine = {
    /**
     * Emits an event for an org. Runs synchronously so the API response
     * already reflects the automation's results (e.g. new tasks).
     */
    emit(orgId, event, payload = {}, { actorId = null, depth = 0, onlyId = null } = {}) {
      if (depth > 2) return []; // guard against automation loops
      const org = db.get('SELECT * FROM organizations WHERE id = ?', orgId);
      const rules = parseJson(
        db.all('SELECT * FROM automations WHERE org_id = ? AND trigger = ? AND enabled = 1 ORDER BY created_at', orgId, event),
        'conditions', 'actions',
      );
      if (onlyId) rules.splice(0, rules.length, ...rules.filter((rule) => rule.id === onlyId));
      const context = { ...payload, event, org, actor: actorId ? db.get('SELECT id, name, email FROM users WHERE id = ?', actorId) : null };
      const results = [];
      for (const rule of rules) {
        if (!conditionsMatch(rule.conditions, context)) {
          continue;
        }
        const detail = [];
        let minutes = 0;
        let status = 'success';
        for (const action of rule.actions) {
          try {
            const out = runAction(db, engine, orgId, action, context, { actorId, depth });
            detail.push(out);
            minutes += ACTIONS[action.type]?.minutes || 0;
          } catch (err) {
            status = 'error';
            detail.push(`${action.type} failed: ${err.message}`);
          }
        }
        const ts = now();
        db.insert('automation_runs', {
          id: id('run'), org_id: orgId, automation_id: rule.id, name: rule.name, event, status,
          detail: detail.join(' · '), minutes_saved: status === 'success' ? minutes : 0, created_at: ts,
        });
        db.run('UPDATE automations SET run_count = run_count + 1, last_run_at = ? WHERE id = ?', ts, rule.id);
        results.push({ automation: rule.name, status, detail });
      }
      return results;
    },

    /** Logs work the system did on its own (e.g. publishing, recurring tasks). */
    logSystemRun(orgId, name, event, detail, minutesSaved = 0, status = 'success') {
      db.insert('automation_runs', {
        id: id('run'), org_id: orgId, automation_id: null, name, event, status, detail, minutes_saved: minutesSaved, created_at: now(),
      });
    },
  };
  return engine;
}

function runAction(db, engine, orgId, action, ctx, { actorId }) {
  // Render placeholders; tidy spaces left by empty values (e.g. a missing last name).
  const r = (v) => String(render(v, ctx) ?? '').replace(/[ \t]{2,}/g, ' ').replace(/ ([)’”,.])/g, '$1').trim();
  switch (action.type) {
    case 'create_task': {
      const [assignee] = resolveRecipients(db, orgId, action.assign_to || 'owner', ctx);
      const task = createTask({ db, engine }, orgId, {
        title: r(action.title),
        description: r(action.description || ''),
        priority: action.priority || 'medium',
        due_at: action.due_in_days != null ? addDays(now(), Number(action.due_in_days)) : null,
        assignee_id: assignee || null,
        checklist: (action.checklist || []).map((text) => ({ text: r(text), done: false })),
        source: 'automation',
        source_ref: ctx.contact?.id || ctx.deal?.id || ctx.project?.id || ctx.idea?.id || ctx.post?.id || ctx.issue?.id || ctx.task?.id || null,
      }, { actorId, emit: false });
      return `Created task “${task.title}”`;
    }
    case 'notify': {
      const users = resolveRecipients(db, orgId, action.to || 'owner', ctx);
      notifyUsers(db, orgId, users, { title: r(action.title), body: r(action.body || ''), link: r(action.link || '') });
      return `Notified ${users.length} ${users.length === 1 ? 'person' : 'people'}`;
    }
    case 'update_contact': {
      const contactId = ctx.contact?.id || ctx.deal?.contact_id;
      if (!contactId) return 'No contact to update';
      const patch = {};
      for (const key of ['lifecycle', 'source']) if (action[key]) patch[key] = r(action[key]);
      if (action.add_tag) {
        const contact = parseJson(db.get('SELECT tags FROM contacts WHERE id = ?', contactId), 'tags');
        patch.tags = [...new Set([...(contact?.tags || []), r(action.add_tag)])];
      }
      patch.updated_at = now();
      db.update('contacts', contactId, patch);
      return `Updated contact (${Object.keys(patch).filter((k) => k !== 'updated_at').join(', ')})`;
    }
    case 'set_follow_up': {
      const contactId = ctx.contact?.id || ctx.deal?.contact_id;
      if (!contactId) return 'No contact for follow-up';
      db.update('contacts', contactId, { next_follow_up_at: addDays(now(), Number(action.days ?? 2)), updated_at: now() });
      return `Follow-up set for ${action.days ?? 2} days`;
    }
    case 'log_activity': {
      const contactId = ctx.contact?.id || ctx.deal?.contact_id || null;
      db.insert('activities', {
        id: id('act'), org_id: orgId, contact_id: contactId, deal_id: ctx.deal?.id || null,
        type: 'system', body: r(action.body), created_by: null, created_at: now(),
      });
      return 'Logged activity';
    }
    case 'webhook': {
      if (!action.url) return 'No webhook URL set';
      // Fire-and-forget so a slow third party never blocks the user.
      fetch(action.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: ctx.event, org: ctx.org?.id, data: ctx }),
        signal: AbortSignal.timeout(10_000),
      }).catch((err) => engine.logSystemRun(orgId, 'Webhook delivery', 'webhook', `Failed: ${err.message}`, 0, 'error'));
      return `Sent webhook to ${new URL(action.url).host}`;
    }
    default:
      throw new Error(`Unknown action ${action.type}`);
  }
}

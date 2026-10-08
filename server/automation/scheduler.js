import { parseJson } from '../db/index.js';
import { notifyUsers } from '../modules/core/notifications.js';
import { publishPost } from './publishers.js';
import { dispatchDue } from '../modules/messaging/service.js';
import { runBookingSchedule } from '../modules/bookings/service.js';
import { runBillingChase } from '../modules/billing/service.js';
import { runMonthlyReports } from '../modules/agency/service.js';

/**
 * The scheduler runs the time-based side of the system every tick:
 *   1. publishes content that is due
 *   2. flags overdue tasks (fires task.overdue once per task)
 *   3. turns due CRM follow-ups into tasks (contact.follow_up_due)
 *   4. escalates Help Desk issues past their response target (issue.overdue)
 *   5. sends each person a morning digest and fires schedule.daily
 *   6. sends held messages (quiet hours over, review requests due)
 *   7. booking reminders, the morning job sheet and "was the job done?" nudges
 *   8. marks invoices overdue and chases them; flags unanswered quotes
 *   9. builds last month's client reports on the 1st (agencies)
 */
export function createScheduler(ctx, { intervalSeconds = 30, digestHourUtc = 7 } = {}) {
  let timer = null;
  let running = false;

  async function tick(at = new Date()) {
    if (running) return { skipped: true };
    running = true;
    const { db, engine } = ctx;
    const iso = at.toISOString();
    const summary = { published: 0, overdue: 0, followUps: 0, issues: 0, digests: 0, messages: 0, bookings: null, billing: null, reports: 0 };
    try {
      for (const post of db.all(`SELECT * FROM scheduled_posts WHERE status = 'queued' AND publish_at <= ? ORDER BY publish_at LIMIT 50`, iso)) {
        const result = await publishPost(ctx, post);
        if (result.status === 'published') summary.published++;
      }

      for (const task of parseJson(db.all(`SELECT * FROM tasks WHERE status != 'done' AND due_at IS NOT NULL AND due_at < ? AND overdue_notified = 0`, iso), 'checklist')) {
        db.run('UPDATE tasks SET overdue_notified = 1 WHERE id = ?', task.id);
        engine.emit(task.org_id, 'task.overdue', { task });
        summary.overdue++;
      }

      for (const contact of parseJson(db.all(`SELECT * FROM contacts WHERE next_follow_up_at IS NOT NULL AND next_follow_up_at <= ?`, iso), 'tags')) {
        db.run('UPDATE contacts SET next_follow_up_at = NULL WHERE id = ?', contact.id);
        engine.emit(contact.org_id, 'contact.follow_up_due', { contact });
        summary.followUps++;
      }

      for (const issue of db.all(`SELECT * FROM issues WHERE status != 'resolved' AND due_at IS NOT NULL AND due_at < ? AND overdue_notified = 0`, iso)) {
        db.run('UPDATE issues SET overdue_notified = 1 WHERE id = ?', issue.id);
        engine.emit(issue.org_id, 'issue.overdue', { issue });
        summary.issues++;
      }

      if (at.getUTCHours() >= digestHourUtc) {
        const today = iso.slice(0, 10);
        for (const org of db.all('SELECT * FROM organizations')) {
          const last = db.get(`SELECT value FROM org_meta WHERE org_id = ? AND key = 'last_digest'`, org.id)?.value;
          if (last === today) continue;
          db.run(`INSERT INTO org_meta (org_id, key, value) VALUES (?, 'last_digest', ?) ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value`, org.id, today);
          sendDigest(db, org, at);
          engine.emit(org.id, 'schedule.daily', { date: today });
          engine.logSystemRun(org.id, 'Daily digest', 'schedule.daily', 'Sent everyone their plan for the day', 10);
          summary.digests++;
        }
      }

      // Each step is independent: one failing must not stop the others.
      const step = async (name, fn) => { try { return await fn(); } catch (err) { console.error(`[scheduler] ${name}`, err); return null; } };
      summary.messages = await step('messages', () => dispatchDue(ctx, at));
      summary.bookings = await step('bookings', () => runBookingSchedule(ctx, at));
      summary.billing = await step('billing', () => runBillingChase(ctx, at));
      summary.reports = await step('reports', () => runMonthlyReports(ctx, at));
    } finally {
      running = false;
    }
    return summary;
  }

  return {
    tick,
    start() {
      if (timer) return;
      timer = setInterval(() => tick().catch((err) => console.error('[scheduler]', err)), intervalSeconds * 1000);
      timer.unref?.();
      tick().catch((err) => console.error('[scheduler]', err));
    },
    stop() { clearInterval(timer); timer = null; },
  };
}

function sendDigest(db, org, at) {
  const endOfDay = new Date(at); endOfDay.setUTCHours(23, 59, 59, 999);
  const dayEnd = endOfDay.toISOString();
  const posts = db.get(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE org_id = ? AND status = 'queued' AND publish_at <= ?`, org.id, dayEnd).n;
  for (const m of db.all('SELECT user_id FROM memberships WHERE org_id = ?', org.id)) {
    const due = db.get(`SELECT COUNT(*) AS n FROM tasks WHERE org_id = ? AND assignee_id = ? AND status != 'done' AND due_at <= ?`, org.id, m.user_id, dayEnd).n;
    const followUps = db.get(`SELECT COUNT(*) AS n FROM tasks WHERE org_id = ? AND assignee_id = ? AND status != 'done' AND source = 'automation' AND title LIKE 'Follow up%'`, org.id, m.user_id).n;
    notifyUsers(db, org.id, [m.user_id], {
      title: '☀️ Your plan for today',
      body: `${due} task${due === 1 ? '' : 's'} due · ${followUps} follow-up${followUps === 1 ? '' : 's'} · ${posts} post${posts === 1 ? '' : 's'} going out today`,
      link: '#/tasks',
    });
  }
}

import { parseJson } from '../../db/index.js';
import { localDate, localTime } from '../../lib/time.js';
import { id, now } from '../../lib/util.js';
import { notifyUsers } from '../core/notifications.js';
import { logActivity } from '../crm/service.js';
import { CHANNEL_NAMES, baseVars, getMessagingSettings, sendInBackground } from '../messaging/service.js';

/**
 * The time-based Essentials, run by the scheduler:
 *   - birthday and special-occasion messages (in the morning, once a year each)
 *   - check-ins with leads that have gone quiet (in working hours, once every 3 months at most)
 *   - replies to automatic messages that nobody has read (alert + urgent task)
 */
export function runEssentials(ctx, at = new Date()) {
  const summary = { occasions: 0, coldLeads: 0, replies: 0 };
  for (const org of ctx.db.all('SELECT * FROM organizations')) {
    const settings = getMessagingSettings(ctx.db, org.id);
    if (settings.occasion_messages) summary.occasions += occasions(ctx, org, at);
    if (settings.cold_lead_check_in) summary.coldLeads += coldLeads(ctx, org, settings, at);
    if (settings.reply_watch) summary.replies += replyWatch(ctx, org, settings, at);
  }
  return summary;
}

function occasions(ctx, org, at) {
  const { db, engine } = ctx;
  const tz = org.timezone || 'Europe/London';
  const time = localTime(at, tz);
  if (time < '09:00' || time > '18:00') return 0;
  const today = localDate(at, tz);
  const md = today.slice(5);
  const year = Number(today.slice(0, 4));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  // Birthdays on 29 February are celebrated on the 28th in other years.
  const days = md === '02-28' && !leap ? ['02-28', '02-29'] : [md];
  const marks = days.map(() => '?').join(',');
  let sent = 0;
  const rows = db.all(`SELECT * FROM contacts WHERE org_id = ? AND lifecycle != 'churned'
    AND (substr(birthday, -5) IN (${marks}) OR substr(special_date, -5) IN (${marks}))`, org.id, ...days, ...days);
  for (const contact of rows) {
    const yearStart = `${year}-01-01`;
    const already = (key) => db.get(`SELECT 1 FROM messages WHERE contact_id = ? AND template_key = ? AND created_at >= ? LIMIT 1`, contact.id, key, yearStart);
    if (contact.birthday && days.includes(contact.birthday.slice(-5)) && !already('birthday_message')) {
      if (sendInBackground(ctx, org.id, { contactId: contact.id, template: 'birthday_message' }).message) {
        logActivity(db, org.id, contact.id, 'Birthday message sent 🎉');
        sent++;
      }
    }
    if (contact.special_date && days.includes(contact.special_date.slice(-5)) && !already('special_occasion_message')) {
      const occasion = contact.special_date_label || 'special day';
      if (sendInBackground(ctx, org.id, { contactId: contact.id, template: 'special_occasion_message', vars: { occasion } }).message) {
        logActivity(db, org.id, contact.id, `Special occasion message sent (${occasion})`);
        sent++;
      }
    }
  }
  if (sent) engine.logSystemRun(org.id, 'Birthday & occasion messages', 'schedule.daily', `${sent} message${sent === 1 ? '' : 's'} sent`, 3 * sent);
  return sent;
}

function coldLeads(ctx, org, settings, at) {
  const { db, engine } = ctx;
  const tz = org.timezone || 'Europe/London';
  const time = localTime(at, tz);
  const weekday = new Date(at).toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short' });
  if (time < '10:00' || time > '16:00' || ['Sat', 'Sun'].includes(weekday)) return 0;
  const days = Math.max(7, Number(settings.cold_lead_days) || 30);
  const cutoff = new Date(at.getTime() - days * 86400_000).toISOString();
  const recentCheck = new Date(at.getTime() - 90 * 86400_000).toISOString();
  // Quiet = no message either way, no activity and no open booking since the cut-off.
  const rows = db.all(`SELECT c.* FROM contacts c
    WHERE c.org_id = ? AND c.lifecycle IN ('lead','prospect') AND c.created_at < ? AND COALESCE(c.last_contacted_at, c.created_at) < ?
      AND c.sms_opt_out = 0
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id AND m.created_at >= ?)
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id AND m.template_key = 'cold_lead_check_in' AND m.created_at >= ?)
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.contact_id = c.id AND b.starts_at >= ?)
      AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.contact_id = c.id AND d.stage IN ('won'))
    ORDER BY c.created_at LIMIT 10`, org.id, cutoff, cutoff, cutoff, recentCheck, now());
  let sent = 0;
  for (const contact of rows) {
    const queued = sendInBackground(ctx, org.id, { contactId: contact.id, template: 'cold_lead_check_in' });
    if (queued.message && queued.message.status !== 'blocked') {
      logActivity(db, org.id, contact.id, `Checked in automatically after ${days} quiet days`);
      sent++;
    } else {
      // Can't be reached: mark them as contacted so they aren't retried every few minutes.
      db.update('contacts', contact.id, { last_contacted_at: now() });
    }
  }
  if (sent) engine.logSystemRun(org.id, 'Cold lead check-in', 'schedule.daily', `Checked in with ${sent} quiet lead${sent === 1 ? '' : 's'}`, 4 * sent);
  return sent;
}

function replyWatch(ctx, org, settings, at) {
  const { db, engine } = ctx;
  const hours = Math.max(1, Number(settings.reply_watch_hours) || 2);
  const olderThan = new Date(at.getTime() - hours * 3600_000).toISOString();
  const since = new Date(at.getTime() - 7 * 86400_000).toISOString();
  const unread = db.all(`SELECT m.* FROM messages m
    WHERE m.org_id = ? AND m.direction = 'in' AND m.read = 0 AND m.created_at <= ? AND m.created_at >= ? AND m.contact_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.org_id = m.org_id AND t.source_ref = 'reply-watch:' || m.id)
    ORDER BY m.created_at LIMIT 50`, org.id, olderThan, since);
  const admins = db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin')`, org.id).map((r) => r.user_id);
  let flagged = 0;
  for (const m of unread) {
    // Only replies to something the system sent automatically (a person's own conversation is theirs to manage).
    // (Saved order, not time: an instant auto reply can share the customer's timestamp.)
    const before = db.get(`SELECT created_by, template_key, related_type FROM messages WHERE contact_id = ? AND direction = 'out'
      AND rowid < (SELECT rowid FROM messages WHERE id = ?) ORDER BY rowid DESC LIMIT 1`, m.contact_id, m.id);
    if (!before || before.created_by) continue;
    // Someone has replied since – it's been dealt with.
    if (db.get(`SELECT 1 FROM messages WHERE contact_id = ? AND direction = 'out' AND created_by IS NOT NULL AND created_at > ? LIMIT 1`, m.contact_id, m.created_at)) continue;
    const contact = parseJson(db.get('SELECT * FROM contacts WHERE id = ?', m.contact_id), 'tags');
    const who = baseVars(org, contact).name;
    const channel = CHANNEL_NAMES[m.channel] || m.channel;
    const waited = Math.max(1, Math.round((at.getTime() - new Date(m.created_at).getTime()) / 3600_000));
    db.insert('tasks', {
      id: id('tsk'), org_id: org.id, title: `🔔 Unread reply: ${who} answered an automatic ${channel} message ${waited}h ago`,
      description: `“${String(m.body).slice(0, 400)}”\n\nThey replied to an automatic message and nobody has read it yet. Open Messages to reply: #/messages/${m.contact_id}`,
      status: 'todo', priority: 'urgent', assignee_id: contact.owner_id || admins[0] || null, due_at: at.toISOString(),
      source: 'automation', source_ref: `reply-watch:${m.id}`, recurrence: null, checklist: '[]', created_by: null, created_at: now(), updated_at: now(),
    });
    notifyUsers(db, org.id, admins, { title: `🔔 ${who} is waiting for a reply`, body: `They answered an automatic ${channel} message ${waited}h ago and nobody has read it.`, link: `#/messages/${m.contact_id}` });
    flagged++;
  }
  if (flagged) engine.logSystemRun(org.id, 'Reply check', 'message.received', `${flagged} unread repl${flagged === 1 ? 'y' : 'ies'} to automatic messages flagged`, 2 * flagged);
  return flagged;
}

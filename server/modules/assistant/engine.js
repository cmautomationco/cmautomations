import { parseJson } from '../../db/index.js';
import { addDays, now } from '../../lib/util.js';
import { STAGES } from '../funnel/blueprint.js';
import { createIssue, SLA_HOURS } from '../helpdesk/service.js';
import { createTask } from '../tasks/service.js';
import { PAGE_HELP, PLACES, TOPICS } from './knowledge.js';

/**
 * The built-in assistant. Works with no external services: it recognises the
 * problem or question, answers from the business's own data where it can,
 * takes the person to the screen that solves it (pointing at the right
 * button), and can create tasks and Help Desk issues directly.
 *
 * Every reply has the same shape, whichever engine produced it:
 *   { reply, navigate?: { hash, label, highlight? }, actions: [{ label, hash? , say? }], intent, resolved }
 */

// ── Text matching ──
const STOP = new Set(['a', 'an', 'the', 'to', 'i', 'my', 'me', 'do', 'is', 'of', 'for', 'on', 'it', 'in', 'and', 'can', 'how', 'we', 'our', 'be', 'with', 'at', 'you', 'your', 'are', 'am', 'this', 'that', 'there', 'please']);

export function normalise(text = '') {
  return String(text).toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9{}.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const stem = (w) => {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};
const tokens = (text) => normalise(text).split(' ').filter((w) => w && !STOP.has(w)).map(stem);

/** Scores every topic against a message. Higher is a better match. */
export function rankTopics(message) {
  const norm = ` ${normalise(message)} `;
  const words = new Set(tokens(message));
  return TOPICS.map((topic) => {
    let score = 0;
    for (const phrase of topic.keywords) {
      const phraseNorm = normalise(phrase);
      const exact = norm.includes(` ${phraseNorm} `);
      const parts = tokens(phrase);
      if (!(parts.length ? parts.every((p) => words.has(p)) : exact)) continue;
      // Every meaningful word counts; an exact phrase (small words included) counts extra.
      const smallWords = phraseNorm.split(' ').length - parts.length;
      score += Math.max(parts.length, 1) * 2 + (exact ? 1 + smallWords * 2 : 0);
    }
    return { topic, score };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

const placeTo = (key, extra = {}) => {
  const place = PLACES[key];
  return place ? { hash: extra.query ? `${place.hash}?${extra.query}` : place.hash, label: place.label, highlight: extra.highlight } : null;
};

/** Finds a section from free text such as “the pipeline” or “content calendar”. */
export function findPlace(text) {
  const norm = normalise(text).replace(/^(the|my|our) /, '');
  let best = null;
  for (const [key, place] of Object.entries(PLACES)) {
    for (const w of place.words) {
      if (norm === w || norm === `${w} page` || norm === `${w} section`) return key;
      if (norm.includes(w) && (!best || w.length > best.len)) best = { key, len: w.length };
    }
  }
  return best?.key || null;
}

// ── Dates for “remind me … tomorrow” ──
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function parseDue(text, from = new Date()) {
  const t = text.toLowerCase();
  const at5 = (d) => { const x = new Date(d); x.setUTCHours(17, 0, 0, 0); return x.toISOString(); };
  let m;
  if ((m = t.match(/\b(today|tonight|this afternoon|this evening|end of (?:the )?day)\b/))) return { due: at5(from), label: 'today', phrase: m[0] };
  if ((m = t.match(/\btomorrow\b/))) return { due: at5(addDays(from, 1)), label: 'tomorrow', phrase: m[0] };
  if ((m = t.match(/\bnext week\b/))) return { due: at5(addDays(from, 7)), label: 'next week', phrase: m[0] };
  if ((m = t.match(/\bin (\d{1,2}) days?\b/))) return { due: at5(addDays(from, Number(m[1]))), label: `in ${m[1]} days`, phrase: m[0] };
  if ((m = t.match(/\b(?:on |by |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
    const target = DAYS.indexOf(m[1]);
    let diff = (target - from.getUTCDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return { due: at5(addDays(from, diff)), label: `on ${m[1][0].toUpperCase()}${m[1].slice(1)}`, phrase: m[0] };
  }
  return null;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const money = (n) => `£${Math.round(Number(n) || 0).toLocaleString('en-GB')}`;
const endOfToday = () => { const d = new Date(); d.setUTCHours(23, 59, 59, 999); return d.toISOString(); };
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

// ── Live answers from the business's own data ──
export function dataAnswer(kind, { db, org, user }) {
  const o = org.id;
  switch (kind) {
    case 'today': {
      const due = db.all(`SELECT title, due_at, priority FROM tasks WHERE org_id = ? AND assignee_id = ? AND status != 'done' AND due_at <= ? ORDER BY due_at LIMIT 6`, o, user.id, endOfToday());
      const overdue = due.filter((t) => t.due_at < now()).length;
      const posts = db.get(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE org_id = ? AND status = 'queued' AND publish_at <= ?`, o, endOfToday()).n;
      if (!due.length) return { text: `You’re clear for today – nothing is due.${posts ? ` ${plural(posts, 'post')} will go out automatically.` : ''} A good moment to get ahead on content or follow-ups.` };
      return { text: `You have ${plural(due.length, 'task')} due today${overdue ? `, ${overdue} already overdue` : ''}:\n${due.map((t) => `• ${t.title}${t.due_at < now() ? ' (overdue)' : ''}`).join('\n')}${posts ? `\n\n${plural(posts, 'post')} will also go out automatically today.` : ''}` };
    }
    case 'overdue': {
      const mine = db.all(`SELECT title, due_at FROM tasks WHERE org_id = ? AND assignee_id = ? AND status != 'done' AND due_at < ? ORDER BY due_at LIMIT 6`, o, user.id, now());
      const team = db.get(`SELECT COUNT(*) AS n FROM tasks WHERE org_id = ? AND status != 'done' AND due_at < ?`, o, now()).n;
      if (!mine.length) return { text: `Nothing of yours is overdue.${team ? ` The team has ${plural(team, 'overdue task')} in total – the Task board shows who.` : ' The whole team is on track.'}` };
      return { text: `You have ${plural(mine.length, 'overdue task')}:\n${mine.map((t) => `• ${t.title} (was due ${shortDate(t.due_at)})`).join('\n')}\n\nTick them off, move the date, or hand them to someone with more room.` };
    }
    case 'summary': {
      const week = addDays(now(), -7);
      const one = (sql, ...p) => db.get(sql, o, ...p);
      const pipeline = one(`SELECT COALESCE(SUM(value),0) AS v, COUNT(*) AS n FROM deals WHERE org_id = ? AND stage NOT IN ('won','lost')`);
      const won = one(`SELECT COALESCE(SUM(value),0) AS v FROM deals WHERE org_id = ? AND stage = 'won' AND closed_at >= date('now','start of month')`).v;
      const leads = one(`SELECT COUNT(*) AS n FROM contacts WHERE org_id = ? AND created_at >= ?`, week).n;
      const overdue = one(`SELECT COUNT(*) AS n FROM tasks WHERE org_id = ? AND status != 'done' AND due_at < ?`, now()).n;
      const posts = one(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE org_id = ? AND status = 'queued'`).n;
      const issues = one(`SELECT COUNT(*) AS n FROM issues WHERE org_id = ? AND status != 'resolved'`).n;
      const mins = one(`SELECT COALESCE(SUM(minutes_saved),0) AS m FROM automation_runs WHERE org_id = ? AND created_at >= ?`, week).m;
      return { text: `Here’s ${org.name} right now:\n• Pipeline: ${money(pipeline.v)} across ${plural(pipeline.n, 'open deal')}\n• Won this month: ${money(won)}\n• New leads this week: ${leads}\n• Overdue tasks: ${overdue}\n• Posts scheduled: ${posts}\n• Open Help Desk issues: ${issues}\n• Time saved this week: ${(mins / 60).toFixed(1)} hours` };
    }
    case 'time_saved': {
      const sum = (days) => db.get(`SELECT COALESCE(SUM(minutes_saved),0) AS m, COUNT(*) AS n FROM automation_runs WHERE org_id = ? AND status = 'success' AND created_at >= ?`, o, addDays(now(), -days));
      const w = sum(7); const m = sum(30);
      return { text: `Automations saved ${(w.m / 60).toFixed(1)} hours this week (${plural(w.n, 'action')}) and ${(m.m / 60).toFixed(1)} hours over the last 30 days.` };
    }
    case 'workload': {
      const rows = db.all(`SELECT u.name, SUM(t.status != 'done') AS open, SUM(t.status != 'done' AND t.due_at < ?) AS late
        FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN tasks t ON t.assignee_id = u.id AND t.org_id = m.org_id
        WHERE m.org_id = ? GROUP BY u.id ORDER BY open DESC`, now(), o);
      return { text: `Open tasks by person: ${rows.map((r) => `${r.name} ${r.open || 0}${r.late ? ` (${r.late} late)` : ''}`).join(', ')}.` };
    }
    case 'funnel': {
      const projects = db.all(`SELECT * FROM funnel_projects WHERE org_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 3`, o);
      if (!projects.length) return { text: 'You have no builds in progress. Press “New build” to start one.', navigate: placeTo('funnel', { highlight: 'New build' }) };
      const lines = projects.map((p) => {
        const next = db.get(`SELECT step_key, stage_key FROM funnel_steps WHERE project_id = ? AND status NOT IN ('done','skipped') ORDER BY position LIMIT 1`, p.id);
        const total = db.get(`SELECT COUNT(*) AS n, SUM(status IN ('done','skipped')) AS d FROM funnel_steps WHERE project_id = ?`, p.id);
        const stage = STAGES.find((s) => s.key === p.current_stage);
        const step = next && STAGES.find((s) => s.key === next.stage_key)?.steps.find((s) => s.key === next.step_key);
        return { p, next, line: `• ${p.name}: ${Math.round((total.d / total.n) * 100)}% done, on “${stage?.title}”${step ? ` – next step: ${step.title}` : ''}` };
      });
      const first = lines[0];
      return {
        text: `Your builds:\n${lines.map((l) => l.line).join('\n')}`,
        navigate: { hash: `#/funnel/${first.p.id}${first.next ? `?stage=${first.next.stage_key}&step=${first.next.step_key}` : ''}`, label: first.p.name },
      };
    }
    case 'ideas': {
      const n = db.get(`SELECT COUNT(*) AS n, SUM(status = 'shortlisted') AS s FROM content_ideas WHERE org_id = ? AND status IN ('idea','shortlisted')`, o);
      return { text: n.n ? `You already have ${plural(n.n, 'unused idea')} in the bank${n.s ? ` (${n.s} shortlisted)` : ''}.` : '' };
    }
    case 'creation': {
      const rows = db.all(`SELECT status, COUNT(*) AS n FROM content_ideas WHERE org_id = ? AND status IN ('briefed','in_creation','finalised') GROUP BY status`, o);
      const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
      return { text: rows.length ? `Right now: ${by.briefed || 0} with a brief ready, ${by.in_creation || 0} being created, ${by.finalised || 0} finalised and waiting to be scheduled.` : '' };
    }
    case 'posts': {
      const posts = db.all(`SELECT p.publish_at, c.platform, i.title FROM scheduled_posts p JOIN channels c ON c.id = p.channel_id LEFT JOIN content_ideas i ON i.id = p.idea_id WHERE p.org_id = ? AND p.status = 'queued' ORDER BY p.publish_at LIMIT 3`, o);
      return { text: posts.length ? `Next up:\n${posts.map((p) => `• ${shortDate(p.publish_at)} – ${p.title || 'Post'} (${p.platform})`).join('\n')}` : 'Nothing is scheduled yet.' };
    }
    case 'failed_posts': {
      const n = db.get(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE org_id = ? AND status = 'failed'`, o).n;
      return { text: n ? `${plural(n, 'post has', 'posts have')} failed and need attention – they show in red in the Calendar.` : 'Good news: no posts have failed.' };
    }
    case 'follow_ups': {
      const soon = db.all(`SELECT first_name, last_name, next_follow_up_at FROM contacts WHERE org_id = ? AND next_follow_up_at IS NOT NULL AND next_follow_up_at <= ? ORDER BY next_follow_up_at LIMIT 5`, o, addDays(now(), 3));
      const tasks = db.all(`SELECT title FROM tasks WHERE org_id = ? AND assignee_id = ? AND status != 'done' AND (title LIKE 'Follow up%' OR title LIKE 'Call %' OR title LIKE 'Chase%') LIMIT 5`, o, user.id);
      const parts = [];
      if (tasks.length) parts.push(`Your follow-up tasks:\n${tasks.map((t) => `• ${t.title}`).join('\n')}`);
      if (soon.length) parts.push(`Coming up in the next 3 days:\n${soon.map((c) => `• ${c.first_name} ${c.last_name || ''} – ${shortDate(c.next_follow_up_at)}`).join('\n')}`);
      return { text: parts.join('\n\n') || 'No follow-ups are due in the next few days.' };
    }
    case 'pipeline': {
      const rows = db.all(`SELECT stage, COUNT(*) AS n, COALESCE(SUM(value),0) AS v FROM deals WHERE org_id = ? AND stage NOT IN ('won','lost') GROUP BY stage`, o);
      return { text: rows.length ? `Open deals: ${rows.map((r) => `${cap(r.stage)} ${r.n} (${money(r.v)})`).join(' · ')}.` : 'There are no open deals yet – press “New deal” to add one.' };
    }
    case 'messages': {
      const rows = db.all(`SELECT c.first_name, c.last_name, c.phone_e164, m.channel, m.body FROM messages m JOIN contacts c ON c.id = m.contact_id WHERE m.org_id = ? AND m.direction = 'in' AND m.read = 0 ORDER BY m.created_at DESC LIMIT 5`, o);
      const urgent = db.get(`SELECT COUNT(*) AS n FROM tasks WHERE org_id = ? AND status != 'done' AND title LIKE '🚨%'`, o).n;
      if (!rows.length) return { text: `No unread messages – everyone’s had a reply.${urgent ? ` (${plural(urgent, 'emergency task')} still open.)` : ''}` };
      return { text: `${plural(rows.length, 'unread message')}${urgent ? `, ${urgent} flagged 🚨` : ''}:\n${rows.map((r) => `• ${[r.first_name, r.last_name].filter(Boolean).join(' ')} (${r.channel === 'sms' ? 'text' : r.channel}): “${r.body.slice(0, 70)}${r.body.length > 70 ? '…' : ''}”`).join('\n')}` };
    }
    case 'missed_calls': {
      const rows = db.all(`SELECT k.from_number, k.texted_back, k.created_at, c.first_name, c.last_name FROM calls k LEFT JOIN contacts c ON c.id = k.contact_id WHERE k.org_id = ? AND k.status IN ('missed','voicemail') AND k.handled = 0 ORDER BY k.created_at DESC LIMIT 5`, o);
      if (!rows.length) return { text: 'No missed calls waiting – everyone has been called back.' };
      return { text: `${plural(rows.length, 'missed call')} still to call back:\n${rows.map((r) => `• ${r.first_name && r.first_name !== 'Caller' ? `${r.first_name} ${r.last_name || ''}`.trim() : r.from_number} – ${shortDate(r.created_at)}${r.texted_back ? ' (texted back automatically)' : ''}`).join('\n')}` };
    }
    case 'bookings': {
      const rows = db.all(`SELECT b.starts_at, b.status, b.customer_confirmed_at, s.name, c.first_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN contacts c ON c.id = b.contact_id WHERE b.org_id = ? AND b.starts_at >= ? AND b.status IN ('requested','confirmed') ORDER BY b.starts_at LIMIT 6`, o, now());
      if (!rows.length) return { text: 'Nothing booked yet. Share your booking link or press “New booking”.' };
      return { text: `Coming up:\n${rows.map((r) => `• ${shortDate(r.starts_at)} ${new Date(r.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: org.timezone || 'Europe/London' })} – ${r.name || 'Booking'} for ${r.first_name || 'a customer'}${r.customer_confirmed_at ? ' ✓' : ''}`).join('\n')}\n\n✓ = the customer has confirmed.` };
    }
    case 'jobs_today': {
      const start = new Date(); start.setUTCHours(0, 0, 0, 0);
      const rows = db.all(`SELECT b.starts_at, b.status, b.address, b.postcode, s.name, c.first_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN contacts c ON c.id = b.contact_id WHERE b.org_id = ? AND b.starts_at >= ? AND b.starts_at <= ? AND b.status != 'cancelled' ORDER BY b.starts_at`, o, start.toISOString(), endOfToday());
      if (!rows.length) return { text: 'No jobs booked for today.' };
      return { text: `Today’s jobs:\n${rows.map((r) => `• ${new Date(r.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: org.timezone || 'Europe/London' })} ${r.name || 'Job'} – ${r.first_name || 'Customer'}${r.address ? `, ${[r.address, r.postcode].filter(Boolean).join(' ')}` : ''}${r.status === 'completed' ? ' (done)' : ''}`).join('\n')}` };
    }
    case 'money': {
      const owed = db.get(`SELECT COALESCE(SUM(total_pence - paid_pence),0) AS v, COUNT(*) AS n FROM invoices WHERE org_id = ? AND kind = 'invoice' AND status IN ('sent','part_paid','overdue')`, o);
      const late = db.all(`SELECT i.number, i.total_pence - i.paid_pence AS due, i.reminders_sent, c.first_name, c.last_name FROM invoices i LEFT JOIN contacts c ON c.id = i.contact_id WHERE i.org_id = ? AND i.kind = 'invoice' AND i.status = 'overdue' ORDER BY i.due_date LIMIT 5`, o);
      const drafts = db.get(`SELECT COUNT(*) AS n FROM invoices WHERE org_id = ? AND kind = 'invoice' AND status = 'draft'`, o).n;
      const pounds = (p) => `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
      return { text: `${pounds(owed.v)} is owed across ${plural(owed.n, 'invoice')}.${late.length ? `\nOverdue (being chased automatically):\n${late.map((r) => `• ${r.number} – ${[r.first_name, r.last_name].filter(Boolean).join(' ')} ${pounds(r.due)}${r.reminders_sent ? ` (${plural(r.reminders_sent, 'reminder')} sent)` : ''}`).join('\n')}` : ''}${drafts ? `\n${plural(drafts, 'draft invoice')} waiting to be checked and sent.` : ''}` };
    }
    case 'issues': {
      const rows = db.all(`SELECT title, status, priority, due_at FROM issues WHERE org_id = ? AND status != 'resolved' AND (created_by = ? OR assignee_id = ?) ORDER BY due_at LIMIT 5`, o, user.id, user.id);
      return { text: rows.length ? `Your open issues:\n${rows.map((r) => `• ${r.title} – ${r.status.replace('_', ' ')}, ${r.priority}${r.due_at < now() ? ' (past its target)' : ''}`).join('\n')}` : 'You have no open issues – everything you raised has been sorted.' };
    }
    default: {
      const m = kind.match(/^funnel_step:(\w+):(\w+)$/);
      if (!m) return { text: '' };
      const project = db.get(`SELECT p.id, p.name FROM funnel_projects p JOIN funnel_steps s ON s.project_id = p.id AND s.step_key = ? WHERE p.org_id = ? AND p.status = 'active' ORDER BY p.updated_at DESC LIMIT 1`, m[2], o);
      if (!project) return { text: '' };
      return { text: `I’ve opened that step in “${project.name}”.`, navigate: { hash: `#/funnel/${project.id}?stage=${m[1]}&step=${m[2]}`, label: project.name } };
    }
  }
}

// ── Actions the assistant can take ──
function guessCategory(text) {
  const t = text.toLowerCase();
  if (/(invoice|payment|paid|\bpay\b|refund|charge|billing|price|checkout)/.test(t)) return 'billing';
  if (/(customer|client|complain|review|unhappy|angry)/.test(t)) return 'customer';
  if (/(post|content|caption|instagram|tiktok|reel|video)/.test(t)) return 'content';
  if (/(staff|rota|supplier|stock|delivery|order|process|team)/.test(t)) return 'operations';
  if (/(login|password|error|bug|broken|crash|not working|loading|app|system|website|page)/.test(t)) return 'technical';
  return 'other';
}
function guessPriority(text) {
  const t = text.toLowerCase();
  if (/(urgent|asap|emergency|right now|immediately|\bdown\b|can.?t work|losing money|losing customers|(?:can.?t|cannot|won.?t|unable to|not)\s+(?:pay|take payments?|accept payments?|taking payments?|check ?out))/.test(t)) return 'urgent';
  if (/(important|high priority|today|angry|refund|complain|broken|not working|error)/.test(t)) return 'high';
  if (/(whenever|low priority|no rush|minor|small)/.test(t)) return 'low';
  return 'medium';
}
const slaLabel = (p) => (SLA_HOURS[p] < 24 ? `${SLA_HOURS[p]} hours` : `${SLA_HOURS[p] / 24} day${SLA_HOURS[p] === 24 ? '' : 's'}`);

export function raiseIssue(ctx, { title, description, category, priority, page }) {
  const { issue } = createIssue({ db: ctx.db, engine: ctx.engine }, ctx.org.id, {
    title: cap(title.trim()).slice(0, 120),
    description: `${description || title}${page ? `\n\nRaised through the assistant from ${page}.` : ''}`,
    category: category || guessCategory(`${title} ${description || ''}`),
    priority: priority || guessPriority(`${title} ${description || ''}`),
    source: 'assistant',
  }, { actorId: ctx.user.id });
  return issue;
}

export function addTask(ctx, { title, due, priority }) {
  return createTask({ db: ctx.db }, ctx.org.id, {
    title: cap(title.trim()).slice(0, 200), due_at: due || null, priority: priority || 'medium', assignee_id: ctx.user.id, source: 'manual',
  }, { actorId: ctx.user.id });
}

export function searchContacts(ctx, query) {
  const q = `%${String(query).trim()}%`;
  return parseJson(ctx.db.all(`SELECT id, first_name, last_name, company, lifecycle, email, next_follow_up_at,
      (SELECT COALESCE(SUM(value),0) FROM deals d WHERE d.contact_id = c.id AND d.stage NOT IN ('won','lost')) AS open_value
    FROM contacts c WHERE org_id = ? AND (first_name || ' ' || COALESCE(last_name,'') LIKE ? OR company LIKE ? OR email LIKE ?) ORDER BY updated_at DESC LIMIT 5`,
  ctx.org.id, q, q, q), 'tags');
}

// ── The conversation turn ──
const HELP_ACTIONS = [
  { label: 'What do I need to do today?', say: 'What do I need to do today?' },
  { label: 'How is the business doing?', say: 'How is the business doing?' },
  { label: 'I don’t know what to post', say: 'I don’t know what to post' },
  { label: 'Report a problem', say: 'Report a problem: ' },
];

const INTRO = 'I can take you to the right place for any problem, answer questions about your business, create tasks and log issues for the team. Try asking things like “How do I add a lead?”, “What’s overdue?”, “Remind me to call Emma tomorrow” or “Report a problem: the invoice link is broken”.';

export function answer(ctx, { message, page = '#/' }) {
  const text = String(message || '').trim();
  const norm = normalise(text);
  const reply = (r) => ({ actions: [], resolved: true, ...r });

  if (!norm) return reply({ intent: 'help', reply: INTRO, actions: HELP_ACTIONS });
  if (/^(hi|hello|hey|hiya|yo|morning|afternoon|evening|good (morning|afternoon|evening))\b/.test(norm) && norm.split(' ').length <= 4) {
    return reply({ intent: 'greeting', reply: `Hi ${ctx.user.name.split(' ')[0]}! ${INTRO}`, actions: HELP_ACTIONS });
  }
  if (/^(help|help me|what can you do|what do you do|how do you work|who are you|what are you)( please)?$/.test(norm)) return reply({ intent: 'help', reply: INTRO, actions: HELP_ACTIONS });
  if (/^(thanks|thank you|cheers|ta|great|perfect|brilliant|nice one)\b/.test(norm) && norm.split(' ').length <= 5) {
    return reply({ intent: 'thanks', reply: 'You’re welcome! Anything else I can help with?' });
  }

  // Report a problem → Help Desk issue.
  let m = text.match(/^(?:please\s+)?(?:report|raise|log|flag|open)\s+(?:a|an)?\s*(?:new\s+)?(?:problem|issue|bug|complaint|fault|ticket)\b\s*[:\-–—]?\s*(.*)$/is)
    || text.match(/^(?:problem|issue|bug)\s*[:\-–—]\s*(.+)$/is);
  if (m) {
    const detail = (m[1] || '').trim();
    if (detail.length < 6) {
      return reply({
        intent: 'issue_raise', reply: 'Sure – what’s going wrong? Describe it in a sentence, starting with “Report a problem:”, and I’ll log it and alert the right person. Or open the Help Desk form.',
        actions: [{ label: 'Open the Help Desk form', hash: '#/helpdesk?new=1' }],
      });
    }
    const issue = raiseIssue(ctx, { title: detail.split(/[.!?]\s/)[0], description: detail, page });
    return reply({
      intent: 'issue_raise',
      reply: `I’ve logged that in the Help Desk as a ${issue.priority} ${issue.category} issue${issue.assignee_name ? ` and assigned it to ${issue.assignee_name}` : ''}. They’ve been alerted and should respond within ${slaLabel(issue.priority)}. You’ll get a notification when it’s sorted.`,
      actions: [{ label: 'View the issue', hash: `#/helpdesk/${issue.id}` }],
      created: { type: 'issue', id: issue.id },
    });
  }

  // Remind me / create a task.
  m = text.match(/^(?:please\s+)?(?:remind me (?:to\s+)?|(?:create|add|make|set)(?: me)? (?:a |an )?(?:new )?(?:task|reminder|to-?do)(?: to| for| that)?:?\s*|new task:?\s*|to-?do:?\s*)(.+)$/is);
  if (m && m[1].trim().length > 2) {
    const due = parseDue(m[1]);
    let title = m[1];
    if (due) title = title.replace(new RegExp(`\\s*\\b${due.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '');
    title = title.replace(/\s+(?:asap|urgently)$/i, '').replace(/[.!]+$/, '').trim();
    const priority = /\b(urgent|asap|urgently)\b/i.test(text) ? 'high' : 'medium';
    const task = addTask(ctx, { title, due: due?.due, priority });
    return reply({
      intent: 'task_create',
      reply: `Done – I’ve added “${task.title}” to your tasks${due ? `, due ${due.label}` : ''}.`,
      actions: [{ label: 'Open My day', hash: '#/tasks/today' }],
      created: { type: 'task', id: task.id },
    });
  }

  // Add a lead called …
  m = text.match(/^(?:please\s+)?(?:add|create|new)\s+(?:a\s+)?(?:new\s+)?(?:lead|contact|client|customer)(?:\s+(?:called|named|for))?\s+([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*)?)\s*$/i);
  if (m) {
    const [first, ...rest] = m[1].trim().split(/\s+/);
    const query = new URLSearchParams({ new: '1', first_name: cap(first), ...(rest.length ? { last_name: cap(rest.join(' ')) } : {}) });
    return reply({
      intent: 'crm_add_lead',
      reply: `I’ve opened the new lead form with ${cap(first)}${rest.length ? ` ${cap(rest.join(' '))}` : ''} filled in. Add any other details and press “Save lead” – the welcome call and follow-up are set up automatically.`,
      navigate: { hash: `#/crm/contacts?${query}`, label: 'New lead' },
    });
  }

  // Go to / open a section, or look someone up.
  m = text.match(/^(?:please\s+)?(?:go to|take me to|open|show me|show|navigate to|bring up|pull up|where is|where are|where do i find|find|look up|lookup|search for|who is)\s+(.+?)[?.!]*$/i);
  if (m) {
    const target = m[1].trim();
    const placeKey = findPlace(target);
    if (placeKey) {
      const go = placeTo(placeKey);
      return reply({ intent: `go:${placeKey}`, reply: `Here’s ${go.label}.`, navigate: go });
    }
    const words = normalise(target).replace(/^(the|my|our) /, '').split(' ');
    if (words.length <= 3 && !rankTopics(target).length) {
      const found = searchContacts(ctx, target.replace(/^(the|my|our)\s+/i, ''));
      if (found.length) {
        const c = found[0];
        const details = [c.company, c.lifecycle, c.open_value ? `${money(c.open_value)} open` : null, c.next_follow_up_at ? `follow-up ${shortDate(c.next_follow_up_at)}` : null].filter(Boolean).join(' · ');
        return reply({
          intent: 'crm_find',
          reply: found.length === 1
            ? `${c.first_name} ${c.last_name || ''} – ${details}. I’ve opened them in Contacts; click their name for the full timeline.`
            : `I found ${found.length} matches: ${found.map((f) => `${f.first_name} ${f.last_name || ''}`.trim()).join(', ')}. I’ve filtered Contacts for you.`,
          navigate: { hash: `#/crm/contacts?q=${encodeURIComponent(target)}`, label: 'Contacts' },
        });
      }
    }
  }

  // “What is this page?”
  if (/\b(this page|this screen|what is this|whats this|how does this work|what can i do here|explain this|where am i)\b/.test(norm)) {
    const top = `/${(page.replace(/^#/, '').split('?')[0].split('/').filter(Boolean)[0] || '')}`;
    const help = PAGE_HELP[top === '/' ? '/' : top] || PAGE_HELP['/'];
    return reply({ intent: 'this_page', reply: help, actions: HELP_ACTIONS.slice(0, 2) });
  }

  // Known problems and questions.
  const ranked = rankTopics(text);
  const best = ranked[0];
  if (best && best.score >= 2) {
    const t = best.topic;
    const live = t.data ? dataAnswer(t.data, ctx) : null;
    const parts = [live?.text, t.answer].filter(Boolean);
    const related = ranked.slice(1, 3).filter((r) => r.score >= 3).map((r) => ({ label: r.topic.title, say: r.topic.title }));
    if (t.admin && ctx.role === 'member') {
      return reply({
        intent: t.key,
        reply: `${parts.join('\n\n')}\n\nThis needs an owner or admin to change. Want me to ask them for you?`,
        actions: [{ label: 'Ask an admin', say: `Report a problem: Please help with “${t.title}”` }, ...related],
      });
    }
    const navigate = live?.navigate || (t.go ? placeTo(t.go.place, t.go) : null);
    const actions = [...related];
    if (t.say) actions.unshift({ label: 'Raise it for me', say: t.say });
    // Someone describing a problem in their own words can log it in one tap.
    if (t.key === 'issue_raise' || t.key === 'complaint') actions.unshift({ label: 'Log this for the team', say: `Report a problem: ${text}` });
    return reply({ intent: t.key, reply: parts.join('\n\n') || `Here’s ${navigate?.label}.`, navigate, actions });
  }

  // Not sure: offer the closest matches and a way to get a person involved.
  return reply({
    intent: 'unknown',
    resolved: false,
    reply: 'I’m not sure about that one yet. Here are the closest things I can help with – or I can log it for the team so a person picks it up.',
    actions: [
      ...ranked.slice(0, 2).map((r) => ({ label: r.topic.title, say: r.topic.title })),
      { label: 'Log it for the team', say: `Report a problem: ${text}` },
      { label: 'What can you do?', say: 'What can you do?' },
    ],
  });
}

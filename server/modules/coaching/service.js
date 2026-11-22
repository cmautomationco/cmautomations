import { parseJson } from '../../db/index.js';
import { toE164 } from '../../lib/phone.js';
import { publicLink } from '../../lib/links.js';
import { getSetting } from '../../lib/settings.js';
import { addLocalDays, localDate, localTime, zonedToUtc } from '../../lib/time.js';
import { badRequest, id, notFound, now, publicToken, render } from '../../lib/util.js';
import { notifyUsers } from '../core/notifications.js';
import { logActivity } from '../crm/service.js';
import { sendInBackground } from '../messaging/service.js';
import { createTask } from '../tasks/service.js';
import { DEFAULT_SETTINGS, PHASES, STEP, STEPS, expectedPath, round2 } from './journey.js';

export const getCoachingSettings = (db, orgId) => getSetting(db, orgId, 'coaching', DEFAULT_SETTINGS);
const tzOf = (db, orgId) => db.get('SELECT timezone FROM organizations WHERE id = ?', orgId)?.timezone || 'Europe/London';
const adminIds = (db, orgId) => db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin')`, orgId).map((r) => r.user_id);
export const portalLink = (client) => publicLink(`coach/${client.token}`);
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

export function getClient(db, orgId, clientId) {
  const c = db.get('SELECT * FROM coaching_clients WHERE id = ? AND org_id = ?', clientId, orgId);
  if (!c) throw notFound('Client');
  return c;
}
export const stepsOf = (db, clientId) => parseJson(db.all('SELECT * FROM coaching_steps WHERE client_id = ? ORDER BY position', clientId), 'data');
export const updatesOf = (db, clientId) => db.all('SELECT * FROM coaching_updates WHERE client_id = ? ORDER BY created_at, rowid', clientId);
export const checkinsOf = (db, clientId) => db.all('SELECT * FROM coaching_checkins WHERE client_id = ? ORDER BY week', clientId);

/** Adds a line to the shared timeline both sides see. */
export function addUpdate(db, client, author, body, stepKey = null) {
  const row = { id: id('cupd'), org_id: client.org_id, client_id: client.id, author, body, step_key: stepKey, created_at: now() };
  db.insert('coaching_updates', row);
  return row;
}

/** Messages the client (text, WhatsApp or email, whichever reaches them) and puts it on the shared timeline. */
export function messageClient(ctx, client, template, { author = 'coach', stepKey = null, extra = {} } = {}) {
  const settings = getCoachingSettings(ctx.db, client.org_id);
  const body = render(template, { first_name: firstName(client.name), programme: client.programme || settings.programme, portal: portalLink(client), ...extra });
  addUpdate(ctx.db, client, author, body, stepKey);
  if (client.contact_id) {
    sendInBackground(ctx, client.org_id, { contactId: client.contact_id, body, subject: `${client.programme || settings.programme}: an update for you`, audience: 'customer', related: { type: 'coaching', id: client.id } });
  }
  return body;
}

/** A new client, from the first conversation. Their page and their onboarding steps are made now. */
export function createClient(ctx, orgId, input, { actorId = null } = {}) {
  const { db } = ctx;
  const settings = getCoachingSettings(db, orgId);
  const ts = now();
  let contactId = input.contact_id || null;
  if (contactId && !db.get('SELECT 1 FROM contacts WHERE id = ? AND org_id = ?', contactId, orgId)) throw badRequest('Contact not found');
  if (!contactId) {
    const [first, ...rest] = String(input.name).trim().split(/\s+/);
    contactId = id('con');
    db.insert('contacts', {
      id: contactId, org_id: orgId, first_name: first, last_name: rest.join(' ') || null, email: input.email || null, phone: input.phone || null,
      phone_e164: input.phone ? toE164(input.phone) : null, source: input.met_via || 'coaching', lifecycle: 'prospect', owner_id: actorId,
      socials: input.instagram ? { instagram: String(input.instagram).replace(/^@/, '') } : {}, created_at: ts, updated_at: ts,
    });
  }
  const client = {
    id: id('ccl'), org_id: orgId, contact_id: contactId, token: publicToken(), name: String(input.name).trim(), status: 'onboarding',
    met_via: input.met_via || null, goal: input.goal || null, programme: input.programme || settings.programme, weeks: Number(input.weeks || settings.weeks),
    metric_label: input.metric_label || null, metric_unit: input.metric_unit || null, baseline: input.baseline ?? null, target: input.target ?? null,
    start_date: null, programme_link: null, created_by: actorId, created_at: ts, updated_at: ts,
  };
  db.tx(() => {
    db.insert('coaching_clients', client);
    for (const s of STEPS) db.insert('coaching_steps', { id: id('cstp'), org_id: orgId, client_id: client.id, key: s.key, position: STEP[s.key].position, owner: s.owner, status: 'locked', data: {} });
  });
  logActivity(db, orgId, contactId, `Started coaching onboarding (${client.programme})`, { actorId });
  completeStep(ctx, client, 'conversation', { by: 'coach', data: { met_via: client.met_via, notes: input.notes || null }, note: input.notes ? `First conversation${client.met_via ? ` (${client.met_via})` : ''}: ${input.notes}` : null });
  if (input.call_done) completeStep(ctx, getClient(db, orgId, client.id), 'call', { by: 'coach' });
  return getClient(db, orgId, client.id);
}

/** Marks a step done and opens whatever comes next. */
export function completeStep(ctx, client, key, { by = 'coach', data = {}, note = null } = {}) {
  const { db } = ctx;
  const def = STEP[key];
  if (!def) throw badRequest('No such step');
  const step = db.get('SELECT * FROM coaching_steps WHERE client_id = ? AND key = ?', client.id, key);
  if (!step) throw notFound('Step');
  if (step.status === 'done') return false;
  const before = stepsOf(db, client.id).filter((s) => s.position < def.position && s.status !== 'done');
  if (before.length && key !== 'conversation') throw badRequest(`“${def.title}” comes after “${STEP[before[0].key].title}”, which isn’t done yet`);
  const merged = { ...parseJson(step, 'data').data, ...data };
  db.update('coaching_steps', step.id, { status: 'done', done_at: now(), done_by: by, data: merged });
  db.update('coaching_clients', client.id, { updated_at: now() });
  addUpdate(db, client, by === 'client' ? 'client' : by === 'system' ? 'system' : 'coach', note || doneLine(def, client, merged), key);

  // What finishing this step sets in motion.
  if (key === 'payment' && client.contact_id) db.update('contacts', client.contact_id, { lifecycle: 'customer', updated_at: now() });
  if (key === 'programme') {
    const start = localDate(new Date(), tzOf(db, client.org_id));
    db.update('coaching_clients', client.id, { start_date: start, programme_link: merged.link || client.programme_link });
    messageClient(ctx, { ...client, programme_link: merged.link }, def.message, { author: 'coach', stepKey: key });
  }
  if (key === 'first_checkin') {
    db.update('coaching_clients', client.id, { status: 'active', updated_at: now() });
    addUpdate(db, client, 'system', `${firstName(client.name)} is fully onboarded. Weekly check-ins from here.`, key);
    notifyUsers(db, client.org_id, adminIds(db, client.org_id), { title: `✅ ${client.name} is fully onboarded`, body: 'First check-in is in.', link: `#/coaching/${client.id}` });
  }
  openNext(ctx, getClient(db, client.org_id, client.id));
  return true;
}

function doneLine(def, client, data) {
  const n = firstName(client.name);
  switch (def.key) {
    case 'conversation': return `First conversation with ${n}${data.met_via ? ` (${data.met_via})` : ''}.`;
    case 'call': return `Discovery call done.`;
    case 'offer': return `${n} said yes to ${client.programme}.`;
    case 'payment': return `Payment received. Thank you, ${n}!`;
    case 'welcome': return `Welcome sent.`;
    case 'intake': return `${n} sent their intake form.`;
    case 'agreement': return `${n} agreed to the coaching agreement${data.signed_name ? ` (signed: ${data.signed_name})` : ''}.`;
    case 'kickoff': return `Kickoff call done.`;
    case 'programme': return `Programme sent.`;
    case 'first_checkin': return `${n} did their first check-in.`;
    default: return `${def.title} done.`;
  }
}

/** Opens the first step that isn't done, telling whoever it waits on. */
export function openNext(ctx, client) {
  const { db } = ctx;
  const next = stepsOf(db, client.id).find((s) => s.status !== 'done');
  if (!next || next.status === 'open') return next || null;
  const def = STEP[next.key];
  const data = { ...next.data };
  if (next.key === 'first_checkin') data.due_at = firstCheckinDue(db, client);
  db.update('coaching_steps', next.id, { status: 'open', opened_at: now(), data });

  if (def.owner === 'system') {
    // The welcome goes the moment they've paid.
    messageClient(ctx, client, def.message, { author: 'coach', stepKey: def.key });
    return completeStep(ctx, client, def.key, { by: 'system', note: 'Welcome sent, with what happens next.' });
  }
  if (def.owner === 'client') {
    // Intake and agreement are both asked for in the welcome; the rest get their own message.
    if (def.message) messageClient(ctx, client, def.message, { author: 'coach', stepKey: def.key });
    else if (def.key === 'kickoff') messageClient(ctx, client, def.nudge, { author: 'coach', stepKey: def.key });
  } else {
    coachTask(ctx, client, def);
  }
  return next;
}

function coachTask(ctx, client, def) {
  const owners = adminIds(ctx.db, client.org_id);
  createTask(ctx, client.org_id, {
    title: `${client.name}: ${def.title.toLowerCase()}`, description: `${def.coach_text}\n\nOpen Coaching → ${client.name}.`,
    priority: def.key === 'payment' ? 'high' : 'medium', due_at: new Date(Date.now() + 86400_000).toISOString(),
    assignee_id: client.created_by || owners[0] || null, source: 'crm', source_ref: `${client.id}:${def.key}`,
  });
}

function firstCheckinDue(db, client) {
  const c = db.get('SELECT start_date FROM coaching_clients WHERE id = ?', client.id);
  const start = c?.start_date || localDate(new Date(), tzOf(db, client.org_id));
  return zonedToUtc(addLocalDays(start, 7), '09:00', tzOf(db, client.org_id));
}

/** The client picks kickoff times: the step now waits on the coach to confirm and hold the call. */
export function proposeKickoff(ctx, client, times) {
  const { db } = ctx;
  const step = parseJson(db.get(`SELECT * FROM coaching_steps WHERE client_id = ? AND key = 'kickoff'`, client.id), 'data');
  if (step.status !== 'open') throw badRequest('Your kickoff call isn’t open yet');
  db.update('coaching_steps', step.id, { owner: 'coach', data: { ...step.data, times } });
  addUpdate(db, client, 'client', `Times that suit me for the kickoff call: ${times}`, 'kickoff');
  coachTask(ctx, client, { ...STEP.kickoff, title: 'Confirm kickoff time', coach_text: `${firstName(client.name)} suggested: ${times}. Confirm one, then mark the kickoff done after the call.` });
  notifyUsers(db, client.org_id, adminIds(db, client.org_id), { title: `📅 ${client.name} picked kickoff times`, body: times, link: `#/coaching/${client.id}` });
}

export function confirmKickoff(ctx, client, when) {
  const { db } = ctx;
  const step = parseJson(db.get(`SELECT * FROM coaching_steps WHERE client_id = ? AND key = 'kickoff'`, client.id), 'data');
  if (step.status !== 'open') throw badRequest('The kickoff step isn’t open');
  db.update('coaching_steps', step.id, { owner: 'coach', data: { ...step.data, confirmed: when } });
  messageClient(ctx, client, 'Your kickoff call is booked for {{when}}, {{first_name}}. I’ll go through your plan with you then. See you there!', { author: 'coach', stepKey: 'kickoff', extra: { when } });
}

/** Which week of the programme the client is in (1 = the first week), or 0 before it starts. */
export function currentWeek(client, today) {
  if (!client.start_date) return 0;
  const days = Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${client.start_date}T12:00:00Z`)) / 86400_000);
  return days < 0 ? 0 : Math.min(client.weeks, Math.floor(days / 7) + 1);
}

/**
 * Which week a check-in now is for. Check-ins come at the end of a week, so on
 * day 7 it's week 1's, not week 2's. The first check-in is always week 1.
 */
export function checkinWeek(db, client, today) {
  const first = db.get(`SELECT status FROM coaching_steps WHERE client_id = ? AND key = 'first_checkin'`, client.id);
  if (first?.status !== 'done') return 1;
  const cw = currentWeek(client, today);
  if (cw > 1 && !db.get('SELECT 1 FROM coaching_checkins WHERE client_id = ? AND week = ?', client.id, cw - 1)) return cw - 1;
  return Math.max(1, cw);
}

/** A weekly check-in. Week 1's check-in finishes onboarding. */
export function submitCheckin(ctx, client, input) {
  const { db } = ctx;
  if (!client.start_date) throw badRequest('Check-ins start once your programme has been sent');
  const today = localDate(new Date(), tzOf(db, client.org_id));
  const week = Math.max(1, Math.min(client.weeks, Number(input.week) || checkinWeek(db, client, today)));
  const value = input.value === undefined || input.value === null || input.value === '' ? null : Number(input.value);
  if (value !== null && !Number.isFinite(value)) throw badRequest('Your number must be a number');
  const energy = input.energy ? Math.max(1, Math.min(5, Math.round(Number(input.energy)))) : null;
  const row = { value, energy, wins: input.wins || null, struggles: input.struggles || null };
  const existing = db.get('SELECT id FROM coaching_checkins WHERE client_id = ? AND week = ?', client.id, week);
  if (existing) db.update('coaching_checkins', existing.id, row);
  else db.insert('coaching_checkins', { id: id('cchk'), org_id: client.org_id, client_id: client.id, week, ...row, created_at: now() });
  const unit = client.metric_unit ? ` ${client.metric_unit}` : '';
  addUpdate(db, client, 'client', `Week ${week} check-in${value !== null && client.metric_label ? ` · ${client.metric_label}: ${value}${unit}` : ''}${input.wins ? ` · Win: ${input.wins}` : ''}${input.struggles ? ` · Tough: ${input.struggles}` : ''}`, `checkin_${week}`);
  notifyUsers(db, client.org_id, adminIds(db, client.org_id), { title: `📝 ${client.name} checked in (week ${week})`, body: input.wins || '', link: `#/coaching/${client.id}` });
  const first = db.get(`SELECT status FROM coaching_steps WHERE client_id = ? AND key = 'first_checkin'`, client.id);
  if (first?.status === 'open') completeStep(ctx, client, 'first_checkin', { by: 'client', data: { week } });
  return { week };
}

export function replyToCheckin(ctx, client, week, reply) {
  const { db } = ctx;
  const row = db.get('SELECT * FROM coaching_checkins WHERE client_id = ? AND week = ?', client.id, week);
  if (!row) throw notFound('Check-in');
  db.update('coaching_checkins', row.id, { coach_reply: reply, replied_at: now() });
  messageClient(ctx, client, `Week {{week}} feedback, {{first_name}}: {{reply}}`, { author: 'coach', stepKey: `checkin_${week}`, extra: { week, reply } });
}

/** Their progress for the chart: where they started, their check-ins, and the expected path to their goal. */
export function progressOf(db, client) {
  const today = localDate(new Date(), tzOf(db, client.org_id));
  const checkins = checkinsOf(db, client.id);
  const actual = [];
  if (client.baseline !== null && client.baseline !== undefined) actual.push({ week: 0, value: client.baseline });
  for (const c of checkins) if (c.value !== null) actual.push({ week: c.week, value: c.value });
  const last = actual[actual.length - 1];
  const change = last && actual.length > 1 ? round2(last.value - actual[0].value) : null;
  const toGoal = client.target !== null && client.baseline !== null && last ? (client.target === client.baseline ? 1 : (last.value - client.baseline) / (client.target - client.baseline)) : null;
  return {
    metric_label: client.metric_label, metric_unit: client.metric_unit, baseline: client.baseline, target: client.target, weeks: client.weeks,
    current_week: currentWeek(client, today), next_checkin_week: client.start_date ? checkinWeek(db, client, today) : null, actual, expected: expectedPath(client.baseline, client.target, client.weeks), change,
    to_goal_pct: toGoal === null ? null : Math.max(0, Math.round(toGoal * 100)),
    checkins: checkins.map((c) => ({ week: c.week, value: c.value, energy: c.energy, wins: c.wins, struggles: c.struggles, coach_reply: c.coach_reply, created_at: c.created_at })),
  };
}

/** Everything about one client, grouped by phase, for the coach's screen and the client's page. */
export function journeyOf(db, client, { forClient = false } = {}) {
  const steps = stepsOf(db, client.id).map((s) => {
    const def = STEP[s.key];
    const data = forClient ? publicStepData(s) : s.data;
    return { key: s.key, phase: def.phase, title: def.title, owner: s.owner, status: s.status, opened_at: s.opened_at, done_at: s.done_at, client_action: def.client_action || null, text: forClient ? def.client_text : def.coach_text, data, nudges: forClient ? undefined : s.nudges };
  });
  const current = steps.find((s) => s.status === 'open') || null;
  const done = steps.filter((s) => s.status === 'done').length;
  return {
    phases: PHASES.map((p) => ({ ...p, steps: steps.filter((s) => s.phase === p.key) })),
    current, done, total: steps.length, onboarded: done === steps.length,
    waiting_on: current ? current.owner : null,
  };
}

function publicStepData(s) {
  const d = s.data || {};
  const out = {};
  for (const k of ['times', 'confirmed', 'link', 'signed_name', 'due_at']) if (d[k]) out[k] = d[k];
  return out;
}

// ── The scheduler: nudges for steps waiting on the client, and the weekly check-in prompt ──

const LOCAL_START = '08:00';
const LOCAL_END = '19:00'; // Nothing goes out after 7pm.

/**
 * When the next nudge is due for a step waiting on the client: 30 minutes after it
 * opened, then midday, then the 5pm sweep. Anything that would land after 7pm
 * (or before 8am) moves to the next midday. Three nudges at most.
 */
export function nextNudgeAt(step, tz) {
  if (step.nudges >= 3) return null;
  const from = step.last_nudged_at || (step.data?.due_at && step.data.due_at > step.opened_at ? step.data.due_at : step.opened_at);
  if (!from) return null;
  const at = new Date(from);
  let candidate;
  if (step.nudges === 0) candidate = new Date(at.getTime() + (step.data?.due_at ? 0 : 30 * 60_000));
  else candidate = nextLocal(at, step.nudges === 1 ? '12:00' : '17:00', tz);
  const t = localTime(candidate, tz);
  if (t < LOCAL_START || t >= LOCAL_END) candidate = nextLocal(candidate, '12:00', tz);
  return candidate.toISOString();
}

function nextLocal(after, hhmm, tz) {
  const day = localDate(after, tz);
  const today = new Date(zonedToUtc(day, hhmm, tz));
  return today > after ? today : new Date(zonedToUtc(addLocalDays(day, 1), hhmm, tz));
}

export function runCoaching(ctx, at = new Date()) {
  const { db } = ctx;
  const summary = { nudges: 0, prompts: 0 };
  const open = parseJson(db.all(`SELECT s.* FROM coaching_steps s JOIN coaching_clients c ON c.id = s.client_id
                                  WHERE s.status = 'open' AND s.owner = 'client' AND c.status = 'onboarding'`), 'data');
  for (const step of open) {
    const def = STEP[step.key];
    if (!def.nudge) continue;
    const tz = tzOf(db, step.org_id);
    const due = nextNudgeAt(step, tz);
    if (!due || new Date(due) > at) continue;
    const client = db.get('SELECT * FROM coaching_clients WHERE id = ?', step.client_id);
    messageClient(ctx, client, def.nudge, { author: 'coach', stepKey: step.key });
    db.update('coaching_steps', step.id, { nudges: step.nudges + 1, last_nudged_at: at.toISOString() });
    summary.nudges++;
  }
  // Weekly check-in prompt for clients past onboarding, once per week, in the daytime.
  for (const client of db.all(`SELECT * FROM coaching_clients WHERE status = 'active' AND start_date IS NOT NULL`)) {
    const tz = tzOf(db, client.org_id);
    const t = localTime(at, tz);
    if (t < LOCAL_START || t >= LOCAL_END) continue;
    const week = currentWeek(client, localDate(at, tz));
    if (week < 2) continue;
    const prev = week - 1;
    const has = db.get('SELECT 1 FROM coaching_checkins WHERE client_id = ? AND week = ?', client.id, prev);
    const asked = db.get('SELECT 1 FROM coaching_updates WHERE client_id = ? AND step_key = ?', client.id, `prompt_${prev}`);
    if (has || asked) continue;
    messageClient(ctx, client, `Hi {{first_name}}, it’s check-in time for week ${prev}. Two minutes, and I’ll send your feedback: {{portal}}`, { author: 'coach', stepKey: `prompt_${prev}` });
    summary.prompts++;
  }
  return summary;
}

/** The coach's week at a glance: who's started, who's checking in, and who needs a word. */
export function weeklyReport(db, orgId, at = new Date()) {
  const weekAgo = new Date(at.getTime() - 7 * 86400_000).toISOString();
  const tz = tzOf(db, orgId);
  const today = localDate(at, tz);
  const clients = db.all(`SELECT * FROM coaching_clients WHERE org_id = ? AND status IN ('onboarding','active')`, orgId);
  const started = []; const checkingIn = []; const needsWord = []; const waitingOnYou = [];
  for (const c of clients) {
    const open = parseJson(db.get(`SELECT * FROM coaching_steps WHERE client_id = ? AND status = 'open'`, c.id), 'data');
    const programme = db.get(`SELECT done_at FROM coaching_steps WHERE client_id = ? AND key = 'programme'`, c.id);
    if (programme?.done_at && programme.done_at >= weekAgo) started.push({ id: c.id, name: c.name });
    const recent = db.get('SELECT week FROM coaching_checkins WHERE client_id = ? AND created_at >= ? ORDER BY week DESC LIMIT 1', c.id, weekAgo);
    if (recent) checkingIn.push({ id: c.id, name: c.name, week: recent.week });
    if (open && open.owner === 'coach') waitingOnYou.push({ id: c.id, name: c.name, step: STEP[open.key].title });
    if (open && open.owner === 'client' && open.nudges >= 3) needsWord.push({ id: c.id, name: c.name, reason: `${STEP[open.key].title} still not done after 3 reminders` });
    if (c.status === 'active') {
      const week = currentWeek(c, today);
      if (week >= 2 && !db.get('SELECT 1 FROM coaching_checkins WHERE client_id = ? AND week = ?', c.id, week - 1)) needsWord.push({ id: c.id, name: c.name, reason: `Missed their week ${week - 1} check-in` });
    }
  }
  return { started, checking_in: checkingIn, needs_word: needsWord, waiting_on_you: waitingOnYou, onboarding: clients.filter((c) => c.status === 'onboarding').length, active: clients.filter((c) => c.status === 'active').length };
}

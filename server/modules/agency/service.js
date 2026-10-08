import { parseJson } from '../../db/index.js';
import { publicLink } from '../../lib/links.js';
import { formatMoney } from '../../lib/money.js';
import { getSetting, setSetting } from '../../lib/settings.js';
import { addLocalDays, localDate, localTime, zonedToUtc } from '../../lib/time.js';
import { HttpError, badRequest, id, notFound, now, publicToken } from '../../lib/util.js';
import { notifyUsers } from '../core/notifications.js';
import { provisionOrganization } from '../core/routes.js';
import { deliverMessage, queueMessage } from '../messaging/service.js';
import { createTask } from '../tasks/service.js';
import { buildProposal, scoreAudit } from './audit.js';
import { cleanBrand, parseBrand } from '../../lib/brand.js';

export { cleanBrand, parseBrand };

/**
 * The agency side: one control centre for every client business, white-label
 * branding, the audit → proposal → new client flow, and the monthly report
 * each client receives.
 */

export const AGENCY_DEFAULTS = {
  auto_send_reports: false,
  report_day: 1,
  default_setup_fee_pence: 150000,
  default_monthly_fee_pence: 29900,
  default_hourly_cost_pence: 2500,
};
export const getAgencySettings = (db, orgId) => getSetting(db, orgId, 'agency', AGENCY_DEFAULTS);

/** A client's profile as the agency holds it (who gets the report, fees). */
export const CLIENT_DEFAULTS = { contact_name: '', email: '', phone: '', monthly_fee_pence: 0, hourly_cost_pence: 2500, started_at: '' };
export const getClientProfile = (db, orgId) => getSetting(db, orgId, 'client_profile', CLIENT_DEFAULTS);

/**
 * The agency the signed-in person is working for: the current business if it
 * is an agency, otherwise the agency that manages it (if they're on its team),
 * otherwise any agency they own or administer.
 */
export function resolveAgency(db, req) {
  const isAdminOf = (orgId) => db.get(`SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ? AND role IN ('owner','admin')`, orgId, req.user.id);
  if (req.org.kind === 'agency' && ['owner', 'admin'].includes(req.role)) return req.org;
  if (req.org.agency_id && isAdminOf(req.org.agency_id)) return db.get('SELECT * FROM organizations WHERE id = ?', req.org.agency_id);
  const any = db.get(`SELECT o.* FROM organizations o JOIN memberships m ON m.org_id = o.id WHERE o.kind = 'agency' AND m.user_id = ? AND m.role IN ('owner','admin') ORDER BY m.rowid LIMIT 1`, req.user.id);
  if (!any) throw new HttpError(403, 'The agency area is for agency owners and admins');
  return any;
}

// ───────────────────────── Control centre ─────────────────────────

const days = (n) => new Date(Date.now() - n * 86400_000).toISOString();

/** Health and needs-attention items for one client business. */
export function clientHealth(db, org) {
  const o = org.id;
  const one = (sql, ...p) => db.get(sql, o, ...p);
  const ts = now();
  const m = {
    minutes_saved_30d: one(`SELECT COALESCE(SUM(minutes_saved),0) AS v FROM automation_runs WHERE org_id = ? AND created_at >= ? AND status = 'success'`, days(30)).v,
    minutes_saved_prev_30d: one(`SELECT COALESCE(SUM(minutes_saved),0) AS v FROM automation_runs WHERE org_id = ? AND created_at >= ? AND created_at < ? AND status = 'success'`, days(60), days(30)).v,
    automation_runs_30d: one(`SELECT COUNT(*) AS n FROM automation_runs WHERE org_id = ? AND created_at >= ? AND status = 'success'`, days(30)).n,
    automation_errors_7d: one(`SELECT COUNT(*) AS n FROM automation_runs WHERE org_id = ? AND created_at >= ? AND status = 'error'`, days(7)).n,
    overdue_tasks: one(`SELECT COUNT(*) AS n FROM tasks WHERE org_id = ? AND status != 'done' AND due_at IS NOT NULL AND due_at < ?`, ts).n,
    open_issues: one(`SELECT COUNT(*) AS n FROM issues WHERE org_id = ? AND status != 'resolved'`).n,
    urgent_issues: one(`SELECT COUNT(*) AS n FROM issues WHERE org_id = ? AND status != 'resolved' AND priority IN ('high','urgent')`).n,
    unread_messages: one(`SELECT COUNT(*) AS n FROM messages WHERE org_id = ? AND direction = 'in' AND read = 0`).n,
    missed_calls_open: one(`SELECT COUNT(*) AS n FROM calls WHERE org_id = ? AND status IN ('missed','voicemail') AND handled = 0 AND created_at >= ?`, days(7)).n,
    failed_messages_7d: one(`SELECT COUNT(*) AS n FROM messages WHERE org_id = ? AND status = 'failed' AND created_at >= ?`, days(7)).n,
    overdue_invoices: one(`SELECT COUNT(*) AS n FROM invoices WHERE org_id = ? AND kind = 'invoice' AND status = 'overdue'`).n,
    overdue_pence: one(`SELECT COALESCE(SUM(total_pence - paid_pence),0) AS v FROM invoices WHERE org_id = ? AND kind = 'invoice' AND status = 'overdue'`).v,
    new_leads_7d: one(`SELECT COUNT(*) AS n FROM contacts WHERE org_id = ? AND created_at >= ?`, days(7)).n,
    bookings_next_7d: one(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND status IN ('requested','confirmed') AND starts_at >= ? AND starts_at < ?`, ts, new Date(Date.now() + 7 * 86400_000).toISOString()).n,
    requested_bookings: one(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND status = 'requested' AND starts_at >= ?`, ts).n,
    last_activity: one(`SELECT MAX(at) AS at FROM (SELECT MAX(created_at) AS at FROM automation_runs WHERE org_id = ? UNION ALL SELECT MAX(created_at) FROM messages WHERE org_id = ? UNION ALL SELECT MAX(updated_at) FROM tasks WHERE org_id = ?)`, o, o).at,
  };
  const attention = [];
  const add = (level, text, link) => attention.push({ level, text, link });
  if (m.urgent_issues) add('red', `${m.urgent_issues} urgent Help Desk issue${m.urgent_issues === 1 ? '' : 's'}`, '#/helpdesk');
  if (m.missed_calls_open) add('red', `${m.missed_calls_open} missed call${m.missed_calls_open === 1 ? '' : 's'} not called back`, '#/messages/calls');
  if (m.unread_messages) add(m.unread_messages > 3 ? 'red' : 'amber', `${m.unread_messages} unread customer message${m.unread_messages === 1 ? '' : 's'}`, '#/messages');
  if (m.overdue_invoices) add('amber', `${m.overdue_invoices} overdue invoice${m.overdue_invoices === 1 ? '' : 's'} (${formatMoney(m.overdue_pence)})`, '#/invoices');
  if (m.overdue_tasks) add(m.overdue_tasks > 5 ? 'red' : 'amber', `${m.overdue_tasks} overdue task${m.overdue_tasks === 1 ? '' : 's'}`, '#/tasks');
  if (m.requested_bookings) add('amber', `${m.requested_bookings} booking${m.requested_bookings === 1 ? '' : 's'} waiting to be confirmed`, '#/bookings');
  if (m.automation_errors_7d) add('amber', `${m.automation_errors_7d} automation error${m.automation_errors_7d === 1 ? '' : 's'} this week`, '#/automations');
  if (m.failed_messages_7d) add('amber', `${m.failed_messages_7d} message${m.failed_messages_7d === 1 ? '' : 's'} failed to send`, '#/messages');
  const quiet = !m.last_activity || m.last_activity < days(7);
  if (quiet) add('amber', 'No activity in the last 7 days', '#/');

  let score = 100;
  score -= Math.min(30, m.overdue_tasks * 3);
  score -= m.urgent_issues * 10 + Math.max(0, m.open_issues - m.urgent_issues) * 3;
  score -= Math.min(20, m.overdue_invoices * 5);
  score -= Math.min(20, m.missed_calls_open * 5);
  score -= m.unread_messages > 3 ? 10 : m.unread_messages * 2;
  score -= Math.min(10, m.automation_errors_7d * 3 + m.failed_messages_7d * 2);
  if (quiet) score -= 20;
  score = Math.max(0, Math.round(score));
  return { ...m, hours_saved_30d: Math.round((m.minutes_saved_30d / 60) * 10) / 10, attention, score, health: score >= 80 ? 'green' : score >= 55 ? 'amber' : 'red' };
}

/** Everything on the agency control centre. */
export function hubData(db, agency, userId) {
  const clients = db.all('SELECT * FROM organizations WHERE agency_id = ? ORDER BY name', agency.id).map((org) => {
    const member = db.get('SELECT role FROM memberships WHERE org_id = ? AND user_id = ?', org.id, userId);
    const profile = getClientProfile(db, org.id);
    const lastPeriod = previousPeriod(org.timezone);
    const report = db.get('SELECT id, status, period, public_token FROM reports WHERE org_id = ? AND period = ?', org.id, lastPeriod);
    return {
      id: org.id, name: org.name, niche: org.niche, slug: org.slug, brand: parseBrand(org), member: Boolean(member), role: member?.role || null,
      monthly_fee_pence: profile.monthly_fee_pence, contact_name: profile.contact_name, report: report || null, report_period: lastPeriod,
      ...clientHealth(db, org),
    };
  });
  const audits = db.all('SELECT id, client_name, status, setup_fee_pence, monthly_fee_pence, updated_at FROM audits WHERE org_id = ? ORDER BY updated_at DESC', agency.id);
  return {
    agency: { id: agency.id, name: agency.name, brand: parseBrand(agency) },
    totals: {
      clients: clients.length,
      hours_saved_30d: Math.round(clients.reduce((s, c) => s + c.minutes_saved_30d, 0) / 6) / 10,
      needs_attention: clients.filter((c) => c.health !== 'green').length,
      attention_items: clients.reduce((s, c) => s + c.attention.length, 0),
      mrr_pence: clients.reduce((s, c) => s + (c.monthly_fee_pence || 0), 0),
      open_proposals: audits.filter((a) => a.status === 'proposal_sent').length,
      pipeline_pence: audits.filter((a) => ['draft', 'proposal_sent'].includes(a.status)).reduce((s, a) => s + (a.monthly_fee_pence || 0), 0),
    },
    clients: clients.sort((a, b) => a.score - b.score),
    audits,
  };
}

// ───────────────────────── Audits & proposals ─────────────────────────

export function getAudit(db, agencyId, auditId) {
  const audit = parseJson(db.get('SELECT * FROM audits WHERE id = ? AND org_id = ?', auditId, agencyId), 'discovery', 'tasks', 'analysis', 'proposal');
  if (!audit) throw notFound('Audit');
  audit.link = publicLink(`proposal/${audit.public_token}`);
  return audit;
}

/** Scores the audit and writes the proposal (both stored on the audit). */
export function analyseAudit(db, agency, auditId, { preparedBy } = {}) {
  const audit = getAudit(db, agency.id, auditId);
  const analysis = scoreAudit(audit);
  const proposal = buildProposal(audit, analysis, { agencyName: parseBrand(agency).display_name || agency.name, preparedBy });
  db.update('audits', audit.id, { analysis, proposal, updated_at: now() });
  return getAudit(db, agency.id, audit.id);
}

/** Emails / WhatsApps the proposal link to the prospect. */
export async function sendProposal(ctx, agency, auditId, { actorId, channel = 'auto' } = {}) {
  const { db } = ctx;
  let audit = getAudit(db, agency.id, auditId);
  if (!audit.proposal?.title) audit = analyseAudit(db, agency, auditId);
  if (!audit.contact_email && !audit.contact_phone) throw badRequest('Add the client’s email or mobile first');
  const to = channel === 'email' || (channel === 'auto' && audit.contact_email) ? audit.contact_email : audit.contact_phone;
  const first = (audit.contact_name || '').split(' ')[0];
  const queued = queueMessage(ctx, agency.id, {
    to, channel: to === audit.contact_email ? 'email' : 'whatsapp', template: 'proposal_sent', actorId, force: true,
    vars: { doc_link: audit.link, first_name_spaced: first ? ` ${first}` : '', first_name: first }, related: { type: 'audit', id: audit.id },
  });
  if (!queued.message) throw badRequest(queued.skipped);
  const message = await deliverMessage(ctx, queued.message, queued.settings, queued.extra);
  db.update('audits', audit.id, { status: audit.status === 'draft' ? 'proposal_sent' : audit.status, sent_at: audit.sent_at || now(), updated_at: now() });
  return { audit: getAudit(db, agency.id, audit.id), message };
}

/**
 * The prospect accepts: their branded business is created under the agency,
 * the agency team is added to it, and an onboarding task is set.
 */
export function acceptProposal(ctx, audit, { name = '' } = {}) {
  const { db, engine } = ctx;
  if (audit.status === 'accepted') return { audit, org: audit.client_org_id ? db.get('SELECT * FROM organizations WHERE id = ?', audit.client_org_id) : null };
  if (audit.status === 'declined') throw badRequest('This proposal was declined – ask us for a fresh one');
  const agency = db.get('SELECT * FROM organizations WHERE id = ?', audit.org_id);
  const team = db.all(`SELECT user_id, role FROM memberships WHERE org_id = ? AND role IN ('owner','admin') ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END`, agency.id);
  const ownerId = audit.created_by || team[0]?.user_id;
  const org = db.tx(() => {
    const created = provisionOrganization(db, { name: audit.client_name, niche: audit.niche, ownerId });
    db.update('organizations', created.id, { agency_id: agency.id, brand: { display_name: audit.client_name } });
    for (const m of team) if (m.user_id !== ownerId) db.insert('memberships', { org_id: created.id, user_id: m.user_id, role: 'admin' });
    setSetting(db, created.id, 'client_profile', {
      ...CLIENT_DEFAULTS, contact_name: audit.contact_name || '', email: audit.contact_email || '', phone: audit.contact_phone || '',
      monthly_fee_pence: audit.monthly_fee_pence || 0, hourly_cost_pence: audit.hourly_cost_pence || 2500, started_at: now().slice(0, 10),
    });
    db.update('audits', audit.id, { status: 'accepted', accepted_at: now(), accepted_by: name || audit.contact_name || null, client_org_id: created.id, updated_at: now() });
    return db.get('SELECT * FROM organizations WHERE id = ?', created.id);
  });
  const quickWins = (audit.proposal?.quick_wins || []).map((q) => q.name);
  createTask(ctx, agency.id, {
    title: `Kick off ${audit.client_name} – proposal accepted 🎉`,
    description: `${name || audit.contact_name || 'The client'} accepted the proposal (${formatMoney(audit.setup_fee_pence)} set-up, ${formatMoney(audit.monthly_fee_pence)}/month). Their system has been created – switch to “${audit.client_name}” to set it up.`,
    priority: 'high', due_at: new Date(Date.now() + 86400_000).toISOString(), assignee_id: ownerId, source: 'crm',
    checklist: ['Book the kick-off call', 'Add their logo and colours (Settings → Branding)', 'Connect phone number & WhatsApp', 'Set opening hours and services', ...quickWins.map((q) => `Quick win: ${q}`), 'Invite their team', 'Take the set-up payment'].map((text) => ({ text, done: false })),
  });
  notifyUsers(db, agency.id, team.map((t) => t.user_id), { title: `🎉 Proposal accepted: ${audit.client_name}`, body: `${formatMoney(audit.monthly_fee_pence)}/month. Their system is ready to set up.`, link: '#/agency' });
  engine.emit(agency.id, 'proposal.accepted', { audit: getAudit(db, agency.id, audit.id), client: org });
  engine.logSystemRun(agency.id, 'New client set-up', 'proposal.accepted', `Created ${audit.client_name}'s system with ${team.length} agency team member${team.length === 1 ? '' : 's'} and a kick-off task`, 30);
  return { audit: getAudit(db, agency.id, audit.id), org };
}

/** Creates a client business directly (without an audit). */
export function createClient(ctx, agency, { name, niche, contact_name, email, phone, monthly_fee_pence = 0 }, userId) {
  const { db } = ctx;
  return db.tx(() => {
    const org = provisionOrganization(db, { name, niche, ownerId: userId });
    db.update('organizations', org.id, { agency_id: agency.id, brand: { display_name: name } });
    for (const m of db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin') AND user_id != ?`, agency.id, userId)) {
      db.insert('memberships', { org_id: org.id, user_id: m.user_id, role: 'admin' });
    }
    setSetting(db, org.id, 'client_profile', { ...CLIENT_DEFAULTS, contact_name: contact_name || '', email: email || '', phone: phone || '', monthly_fee_pence, started_at: now().slice(0, 10) });
    return db.get('SELECT * FROM organizations WHERE id = ?', org.id);
  });
}


// ───────────────────────── Monthly reports ─────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const periodLabel = (period) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
export function previousPeriod(tz = 'Europe/London', at = new Date()) {
  const today = localDate(at, tz);
  const [y, m] = today.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
const nextPeriod = (period) => {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

function periodRange(period, tz) {
  return { start: zonedToUtc(`${period}-01`, '00:00', tz), end: zonedToUtc(`${nextPeriod(period)}-01`, '00:00', tz) };
}

function monthNumbers(db, orgId, start, end) {
  const one = (sql, ...p) => db.get(sql, orgId, ...p);
  const between = [start, end];
  const minutes = one(`SELECT COALESCE(SUM(minutes_saved),0) AS v FROM automation_runs WHERE org_id = ? AND status = 'success' AND created_at >= ? AND created_at < ?`, ...between).v;
  const leads = one(`SELECT COUNT(*) AS n FROM contacts WHERE org_id = ? AND created_at >= ? AND created_at < ?`, ...between).n;
  const followed = one(`SELECT COUNT(*) AS n FROM contacts c WHERE c.org_id = ? AND c.created_at >= ? AND c.created_at < ? AND (
      c.last_contacted_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id AND m.direction = 'out' AND m.status NOT IN ('blocked','failed'))
      OR EXISTS (SELECT 1 FROM tasks t WHERE t.source_ref = c.id AND t.status = 'done')
      OR EXISTS (SELECT 1 FROM activities a WHERE a.contact_id = c.id AND a.type IN ('call','email','meeting')))`, ...between).n;
  return {
    minutes_saved: minutes,
    hours_saved: Math.round((minutes / 60) * 10) / 10,
    automation_runs: one(`SELECT COUNT(*) AS n FROM automation_runs WHERE org_id = ? AND status = 'success' AND created_at >= ? AND created_at < ?`, ...between).n,
    leads,
    leads_followed_up: followed,
    messages_sent: one(`SELECT COUNT(*) AS n FROM messages WHERE org_id = ? AND direction = 'out' AND status NOT IN ('blocked','failed','queued') AND created_at >= ? AND created_at < ?`, ...between).n,
    messages_received: one(`SELECT COUNT(*) AS n FROM messages WHERE org_id = ? AND direction = 'in' AND created_at >= ? AND created_at < ?`, ...between).n,
    missed_calls: one(`SELECT COUNT(*) AS n FROM calls WHERE org_id = ? AND status IN ('missed','voicemail') AND created_at >= ? AND created_at < ?`, ...between).n,
    missed_calls_texted_back: one(`SELECT COUNT(*) AS n FROM calls WHERE org_id = ? AND texted_back = 1 AND created_at >= ? AND created_at < ?`, ...between).n,
    bookings_made: one(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND created_at >= ? AND created_at < ?`, ...between).n,
    bookings_online: one(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND source = 'online' AND created_at >= ? AND created_at < ?`, ...between).n,
    jobs_completed: one(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND status = 'completed' AND starts_at >= ? AND starts_at < ?`, ...between).n,
    no_shows: one(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND status = 'no_show' AND starts_at >= ? AND starts_at < ?`, ...between).n,
    reminders_sent: one(`SELECT COUNT(*) AS n FROM messages WHERE org_id = ? AND template_key LIKE 'booking_reminder%' AND status NOT IN ('blocked','failed') AND created_at >= ? AND created_at < ?`, ...between).n,
    quotes_sent: one(`SELECT COUNT(*) AS n FROM invoices WHERE org_id = ? AND kind = 'quote' AND sent_at >= ? AND sent_at < ?`, ...between).n,
    quotes_accepted: one(`SELECT COUNT(*) AS n FROM invoices WHERE org_id = ? AND kind = 'quote' AND accepted_at >= ? AND accepted_at < ?`, ...between).n,
    invoices_sent: one(`SELECT COUNT(*) AS n FROM invoices WHERE org_id = ? AND kind = 'invoice' AND sent_at >= ? AND sent_at < ?`, ...between).n,
    payments_pence: one(`SELECT COALESCE(SUM(amount_pence),0) AS v FROM payments WHERE org_id = ? AND created_at >= ? AND created_at < ?`, ...between).v,
    chased_recovered_pence: one(`SELECT COALESCE(SUM(p.amount_pence),0) AS v FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.org_id = ? AND i.reminders_sent > 0 AND p.created_at >= ? AND p.created_at < ?`, ...between).v,
    issues_raised: one(`SELECT COUNT(*) AS n FROM issues WHERE org_id = ? AND created_at >= ? AND created_at < ?`, ...between).n,
    issues_resolved: one(`SELECT COUNT(*) AS n FROM issues WHERE org_id = ? AND resolved_at >= ? AND resolved_at < ?`, ...between).n,
    avg_resolution_hours: Math.round((one(`SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) AS h FROM issues WHERE org_id = ? AND resolved_at >= ? AND resolved_at < ?`, ...between).h || 0) * 10) / 10,
    tasks_completed: one(`SELECT COUNT(*) AS n FROM tasks WHERE org_id = ? AND status = 'done' AND completed_at >= ? AND completed_at < ?`, ...between).n,
    posts_published: one(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE org_id = ? AND status = 'published' AND published_at >= ? AND published_at < ?`, ...between).n,
    top_automations: db.all(`SELECT name, COUNT(*) AS runs, SUM(minutes_saved) AS minutes FROM automation_runs WHERE org_id = ? AND status = 'success' AND created_at >= ? AND created_at < ? GROUP BY name ORDER BY minutes DESC LIMIT 5`, orgId, ...between),
  };
}

/** Builds (or rebuilds) a client's report for a month, e.g. '2026-09'. */
export function generateReport(db, clientOrg, period) {
  if (!/^\d{4}-\d{2}$/.test(String(period))) throw badRequest('Period must look like 2026-09');
  const tz = clientOrg.timezone || 'Europe/London';
  const { start, end } = periodRange(period, tz);
  const prevPeriod = previousPeriod(tz, new Date(`${period}-15T12:00:00Z`));
  const prevRange = periodRange(prevPeriod, tz);
  const numbers = monthNumbers(db, clientOrg.id, start, end);
  const prev = monthNumbers(db, clientOrg.id, prevRange.start, prevRange.end);
  const profile = getClientProfile(db, clientOrg.id);
  const valuePence = Math.round(numbers.hours_saved * (profile.hourly_cost_pence || 2500));
  const label = periodLabel(period);
  const name = parseBrand(clientOrg).display_name || clientOrg.name;
  const workingDays = Math.round((numbers.hours_saved / 7.5) * 10) / 10;
  const highlights = [
    `${numbers.hours_saved} hours of admin done by your system${workingDays >= 1 ? ` – about ${workingDays} working day${workingDays === 1 ? '' : 's'}` : ''}, worth around ${formatMoney(valuePence)}.`,
    numbers.leads ? `${numbers.leads} new enquir${numbers.leads === 1 ? 'y' : 'ies'}, ${numbers.leads_followed_up} followed up (${Math.round((numbers.leads_followed_up / numbers.leads) * 100)}%).` : null,
    numbers.missed_calls ? `${numbers.missed_calls} missed call${numbers.missed_calls === 1 ? '' : 's'} – ${numbers.missed_calls_texted_back} texted back automatically within seconds.` : null,
    numbers.bookings_made ? `${numbers.bookings_made} booking${numbers.bookings_made === 1 ? '' : 's'} made (${numbers.bookings_online} online), ${numbers.reminders_sent} reminder${numbers.reminders_sent === 1 ? '' : 's'} sent, ${numbers.no_shows} no-show${numbers.no_shows === 1 ? '' : 's'}.` : null,
    numbers.payments_pence ? `${formatMoney(numbers.payments_pence)} collected${numbers.chased_recovered_pence ? `, including ${formatMoney(numbers.chased_recovered_pence)} chased up automatically` : ''}.` : null,
    numbers.issues_raised || numbers.issues_resolved ? `${numbers.issues_resolved} issue${numbers.issues_resolved === 1 ? '' : 's'} resolved${numbers.avg_resolution_hours ? ` in ${numbers.avg_resolution_hours} hours on average` : ''}.` : null,
    numbers.posts_published ? `${numbers.posts_published} social post${numbers.posts_published === 1 ? '' : 's'} published on schedule.` : null,
  ].filter(Boolean);
  const change = prev.hours_saved ? Math.round(((numbers.hours_saved - prev.hours_saved) / prev.hours_saved) * 100) : null;
  const summary = `In ${label} ${name}'s system saved about ${numbers.hours_saved} hours${change != null ? ` (${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on ${periodLabel(prevPeriod)})` : ''}, ran ${numbers.automation_runs} automations and kept every enquiry, booking and invoice moving without anyone having to remember.`;
  const data = { period, label, ...numbers, value_pence: valuePence, previous: { period: prevPeriod, label: periodLabel(prevPeriod), hours_saved: prev.hours_saved, leads: prev.leads, payments_pence: prev.payments_pence, bookings_made: prev.bookings_made }, change_pct: change, highlights, business: name, brand: parseBrand(clientOrg) };
  const existing = db.get('SELECT * FROM reports WHERE org_id = ? AND period = ?', clientOrg.id, period);
  if (existing) {
    db.update('reports', existing.id, { data, summary });
    return getReport(db, existing.id);
  }
  const report = { id: id('rep'), org_id: clientOrg.id, agency_id: clientOrg.agency_id || null, period, data, summary, status: 'draft', public_token: publicToken(), created_at: now(), sent_at: null };
  db.insert('reports', report);
  return getReport(db, report.id);
}

export function getReport(db, reportId) {
  const r = parseJson(db.get('SELECT r.*, o.name AS org_name FROM reports r JOIN organizations o ON o.id = r.org_id WHERE r.id = ?', reportId), 'data');
  if (!r) throw notFound('Report');
  r.link = publicLink(`report/${r.public_token}`);
  return r;
}

/** Sends the report link to the client's contact from the agency. */
export async function sendReport(ctx, reportId, { actorId = null } = {}) {
  const { db } = ctx;
  const report = getReport(db, reportId);
  const profile = getClientProfile(db, report.org_id);
  if (!report.agency_id) throw badRequest('This business isn’t managed by an agency');
  const to = profile.email || profile.phone;
  if (!to) throw badRequest('Add the client’s email or mobile in the control centre first');
  const first = (profile.contact_name || '').split(' ')[0];
  const queued = queueMessage(ctx, report.agency_id, {
    to, channel: profile.email ? 'email' : 'whatsapp', template: 'report_ready', actorId, force: true, related: { type: 'report', id: report.id },
    vars: { month: report.data.label, hours: String(report.data.hours_saved), doc_link: report.link, first_name_spaced: first ? ` ${first}` : '', first_name: first },
  });
  if (!queued.message) throw badRequest(queued.skipped);
  const message = await deliverMessage(ctx, queued.message, queued.settings, queued.extra);
  db.update('reports', report.id, { status: 'sent', sent_at: now() });
  return { report: getReport(db, report.id), message };
}

/**
 * Scheduler step: early on the 1st of each month, last month's report is
 * built for every client. It's sent automatically if the agency wants that,
 * otherwise the agency gets a task to review and send.
 */
export async function runMonthlyReports(ctx, at = new Date()) {
  const { db, engine } = ctx;
  let generated = 0;
  for (const agency of db.all(`SELECT * FROM organizations WHERE kind = 'agency'`)) {
    const settings = getAgencySettings(db, agency.id);
    const tz = agency.timezone || 'Europe/London';
    const today = localDate(at, tz);
    if (Number(today.slice(8, 10)) < settings.report_day || localTime(at, tz) < '08:00') continue;
    const period = previousPeriod(tz, at);
    const clients = db.all('SELECT * FROM organizations WHERE agency_id = ?', agency.id).filter((c) => !db.get('SELECT 1 FROM reports WHERE org_id = ? AND period = ?', c.id, period));
    if (!clients.length) continue;
    const made = [];
    for (const client of clients) {
      // Only clients that existed during the month get a report.
      if (client.created_at >= periodRange(nextPeriod(period), tz).start) continue;
      made.push(generateReport(db, client, period));
    }
    if (!made.length) continue;
    generated += made.length;
    if (settings.auto_send_reports) {
      for (const r of made) await sendReport(ctx, r.id).catch((err) => engine.logSystemRun(agency.id, 'Monthly report', 'report.generated', `Couldn’t send ${r.org_name}: ${err.message}`, 0, 'error'));
    } else {
      const owner = db.get(`SELECT user_id FROM memberships WHERE org_id = ? AND role = 'owner' LIMIT 1`, agency.id)?.user_id;
      createTask(ctx, agency.id, { title: `Review & send ${periodLabel(period)} client reports (${made.length})`, description: made.map((r) => `• ${r.org_name}: ${r.data.hours_saved} hours saved`).join('\n'), priority: 'medium', due_at: zonedToUtc(addLocalDays(today, 2), '17:00', tz), assignee_id: owner, source: 'automation' });
    }
    engine.logSystemRun(agency.id, 'Monthly reports', 'report.generated', `${periodLabel(period)} reports built for ${made.length} client${made.length === 1 ? '' : 's'}`, made.length * 45);
  }
  return generated;
}

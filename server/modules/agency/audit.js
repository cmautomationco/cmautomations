import { formatMoney } from '../../lib/money.js';

/**
 * The time & task audit. Each library task is something small businesses do
 * by hand every week, paired with what this system automates and how much of
 * the time it typically takes away. The audit scores every task the client
 * does, picks the quick wins, estimates hours saved and money recovered, and
 * writes the proposal.
 *
 * rate   – share of the time the automation removes (0–1)
 * effort – 1 quick win (days), 2 medium (1–2 weeks), 3 bigger build
 */
export const TASK_LIBRARY = [
  { key: 'missed_calls', name: 'Returning missed calls', category: 'Enquiries', module: 'Messages', rate: 0.6, effort: 1, per_week: 10, minutes: 6,
    solution: 'Missed-call text-back by WhatsApp or text within seconds, a call-back task and an alert to your phone.', niches: ['local_services', 'beauty', 'fitness', 'all'] },
  { key: 'lead_follow_up', name: 'Following up new enquiries', category: 'Enquiries', module: 'CRM', rate: 0.7, effort: 1, per_week: 12, minutes: 8,
    solution: 'Instant welcome message, a call task for the right person and automatic follow-up reminders for every new lead.', niches: ['all'] },
  { key: 'form_enquiries', name: 'Typing up website and social enquiries', category: 'Enquiries', module: 'CRM → Forms', rate: 0.9, effort: 1, per_week: 8, minutes: 5,
    solution: 'Website lead form that drops straight into the CRM and replies to the customer instantly.', niches: ['all'] },
  { key: 'emergency_triage', name: 'Sorting urgent call-outs from routine jobs', category: 'Enquiries', module: 'Messages', rate: 0.5, effort: 1, per_week: 5, minutes: 10,
    solution: 'Emergency words (leak, no heating, no power…) in WhatsApp or texts trigger a 🚨 alert and an urgent task.', niches: ['local_services'] },
  { key: 'booking_admin', name: 'Booking appointments by phone and message', category: 'Bookings', module: 'Bookings', rate: 0.75, effort: 1, per_week: 12, minutes: 10,
    solution: 'Online booking page with live availability. Bookings land in the calendar, the CRM and the team’s phones.', niches: ['all'] },
  { key: 'reminders', name: 'Reminding customers about appointments', category: 'Bookings', module: 'Bookings', rate: 0.95, effort: 1, per_week: 12, minutes: 4,
    solution: 'Automatic day-before and 2-hour reminders. Customers reply C to confirm or R to rearrange.', niches: ['all'] },
  { key: 'job_sheets', name: 'Planning the day and sending job details to the team', category: 'Bookings', module: 'Bookings', rate: 0.8, effort: 1, per_week: 5, minutes: 15,
    solution: 'Morning job sheet sent to the team’s WhatsApp with times, addresses and customer numbers; “On my way” texts in one tap.', niches: ['local_services'] },
  { key: 'deposits', name: 'Taking deposits and dealing with no-shows', category: 'Bookings', module: 'Bookings', rate: 0.8, effort: 2, per_week: 4, minutes: 10,
    solution: 'Deposit taken by card when booking online; a “sorry we missed you” message and rebooking link after a no-show.', niches: ['beauty', 'fitness', 'local_services'] },
  { key: 'quotes', name: 'Writing and sending quotes', category: 'Money', module: 'Invoices', rate: 0.5, effort: 2, per_week: 5, minutes: 25,
    solution: 'Quote templates sent by WhatsApp/email with online accept. An accepted quote marks the deal as won.', niches: ['local_services', 'coaching', 'agency', 'all'] },
  { key: 'invoicing', name: 'Creating and sending invoices', category: 'Money', module: 'Invoices', rate: 0.6, effort: 1, per_week: 8, minutes: 15,
    solution: 'Invoice drafted automatically when a job is marked done, with a pay-by-card link.', niches: ['all'] },
  { key: 'chasing', name: 'Chasing unpaid invoices', category: 'Money', module: 'Invoices', rate: 0.85, effort: 1, per_week: 4, minutes: 15,
    solution: 'Automatic friendly reminder, then a firmer one, then a call task for a person – nobody has to remember.', niches: ['all'] },
  { key: 'reviews', name: 'Asking happy customers for reviews', category: 'Marketing', module: 'Bookings', rate: 0.95, effort: 1, per_week: 6, minutes: 5,
    solution: 'Review request sent automatically a couple of hours after each completed job.', niches: ['all'] },
  { key: 'social_posting', name: 'Planning and posting on social media', category: 'Marketing', module: 'Content Studio', rate: 0.6, effort: 2, per_week: 4, minutes: 45,
    solution: 'Content Studio: ideas and briefs written for you, you approve, posts go out on schedule.', niches: ['all'] },
  { key: 'onboarding', name: 'Onboarding new clients', category: 'Delivery', module: 'Automations', rate: 0.5, effort: 2, per_week: 2, minutes: 45,
    solution: 'Deal won → welcome message, onboarding checklist task and a heads-up to the team, automatically.', niches: ['coaching', 'agency', 'fitness', 'all'] },
  { key: 'data_entry', name: 'Copying customer details between apps', category: 'Admin', module: 'CRM', rate: 0.8, effort: 1, per_week: 10, minutes: 5,
    solution: 'One CRM: calls, messages, forms and bookings create or update the customer record automatically.', niches: ['all'] },
  { key: 'team_chasing', name: 'Chasing the team on who’s doing what', category: 'Admin', module: 'Tasks', rate: 0.6, effort: 1, per_week: 5, minutes: 10,
    solution: 'Tasks with owners and due dates, overdue reminders and a morning plan for everyone.', niches: ['all'] },
  { key: 'customer_questions', name: 'Answering the same questions again and again', category: 'Admin', module: 'Help Desk & Messages', rate: 0.4, effort: 2, per_week: 15, minutes: 5,
    solution: 'Saved replies for common questions and a Help Desk so nothing gets lost.', niches: ['all'] },
  { key: 'reporting', name: 'Working out the weekly numbers', category: 'Admin', module: 'Dashboard', rate: 0.8, effort: 2, per_week: 1, minutes: 60,
    solution: 'Live dashboard plus an automatic monthly report: time saved, leads, bookings and money in.', niches: ['all'] },
];

const NICHE_ORDER = (niche) => (t) => (t.niches.includes(niche) ? 0 : 1);

/** Suggested task list for a new audit, most relevant to the niche first. */
export function suggestedTasks(niche) {
  return [...TASK_LIBRARY]
    .sort((a, b) => NICHE_ORDER(niche)(a) - NICHE_ORDER(niche)(b))
    .map((t) => ({
      key: t.key, name: t.name, category: t.category, per_week: t.per_week, minutes: t.minutes, people: 1, pain: 3,
      selected: t.niches.includes(niche) || ['lead_follow_up', 'reminders', 'chasing', 'invoicing', 'missed_calls'].includes(t.key),
    }));
}

export const DISCOVERY_FIELDS = [
  { key: 'goals', label: 'What would make the next 12 months a success?', type: 'textarea' },
  { key: 'frustrations', label: 'What takes up time you’d rather spend elsewhere?', type: 'textarea' },
  { key: 'tools', label: 'Tools and apps used today', type: 'text', placeholder: 'e.g. WhatsApp, paper diary, Xero, Google Calendar' },
  { key: 'lead_sources', label: 'Where enquiries come from', type: 'text', placeholder: 'e.g. phone, WhatsApp, Checkatrade, Facebook' },
  { key: 'enquiries_per_week', label: 'Enquiries per week', type: 'number' },
  { key: 'missed_calls_per_week', label: 'Calls missed per week (on jobs, after hours)', type: 'number' },
  { key: 'response_time', label: 'How fast enquiries usually get a reply', type: 'text', placeholder: 'e.g. same evening, next day' },
  { key: 'avg_job_value', label: 'Average job / sale value (£)', type: 'number' },
  { key: 'no_shows_per_month', label: 'No-shows or wasted visits per month', type: 'number' },
  { key: 'unpaid_invoices', label: 'Money currently owed by customers (£)', type: 'number' },
  { key: 'notes', label: 'Anything else from the call', type: 'textarea' },
];

const num = (v) => Math.max(0, Number(v) || 0);
const round1 = (n) => Math.round(n * 10) / 10;
const WEEKS_PER_MONTH = 4.33;

/** Scores the audit: hours per task, hours saved, quick wins, phases and the money case. */
export function scoreAudit(audit) {
  const discovery = audit.discovery || {};
  const hourly = (audit.hourly_cost_pence || 2500) / 100;
  const tasks = (audit.tasks || []).filter((t) => t.selected !== false).map((t) => {
    const lib = TASK_LIBRARY.find((l) => l.key === t.key) || {};
    const rate = t.rate != null ? Number(t.rate) : lib.rate ?? 0.5;
    const effort = Number(t.effort || lib.effort || 2);
    const hours = (num(t.per_week) * num(t.minutes) * Math.max(1, num(t.people) || 1)) / 60;
    const saved = hours * rate;
    const pain = Math.min(5, Math.max(1, Number(t.pain) || 3));
    return {
      key: t.key, name: t.name || lib.name, category: t.category || lib.category || 'Other', module: lib.module || 'Automations',
      solution: t.solution || lib.solution || 'Custom automation built around how you work.',
      hours_per_week: round1(hours), saved_per_week: round1(saved), rate, effort, pain,
      score: round1((saved * (0.6 + pain * 0.2)) / effort),
    };
  }).sort((a, b) => b.score - a.score);

  const quickWins = tasks.filter((t) => t.effort === 1 && t.saved_per_week >= 0.3).slice(0, 4);
  quickWins.forEach((t) => { t.quick_win = true; });
  const hoursNow = tasks.reduce((s, t) => s + t.hours_per_week, 0);
  const weekly = tasks.reduce((s, t) => s + t.saved_per_week, 0);
  const avgJob = num(discovery.avg_job_value);

  // Revenue the client is leaving on the table today (shown with its assumptions).
  const missedCalls = num(discovery.missed_calls_per_week);
  const recoveredJobs = missedCalls * WEEKS_PER_MONTH * 0.25;
  const noShows = num(discovery.no_shows_per_month);
  const savedNoShows = noShows * 0.5;
  const revenueMonthly = Math.round((recoveredJobs + savedNoShows) * avgJob);
  const cashSooner = Math.round(num(discovery.unpaid_invoices) * 0.6);

  const timeValueMonthly = Math.round(weekly * WEEKS_PER_MONTH * hourly);
  const monthlyValue = timeValueMonthly + revenueMonthly;
  const setup = (audit.setup_fee_pence || 0) / 100;
  const monthlyFee = (audit.monthly_fee_pence || 0) / 100;
  const net = monthlyValue - monthlyFee;
  const payback = setup > 0 && net > 0 ? Math.max(0.1, round1(setup / net)) : null;

  const phases = [1, 2, 3].map((effort) => ({
    effort,
    name: effort === 1 ? 'Phase 1 – Quick wins' : effort === 2 ? 'Phase 2 – Core systems' : 'Phase 3 – Bigger builds',
    weeks: effort === 1 ? 'Week 1–2' : effort === 2 ? 'Week 3–5' : 'Week 6+',
    items: tasks.filter((t) => t.effort === effort),
  })).filter((p) => p.items.length);

  const assumptions = [
    `Time is valued at ${formatMoney(audit.hourly_cost_pence || 2500)} an hour.`,
    'Hours saved use typical results for each automation, not best-case figures.',
    missedCalls ? `About 1 in 4 missed callers who would have gone elsewhere now books, thanks to the instant text-back (${round1(recoveredJobs)} extra jobs a month).` : null,
    noShows ? `Reminders and confirmations halve no-shows (${round1(savedNoShows)} fewer a month).` : null,
    cashSooner ? `Automatic chasing collects about 60% of money owed (${formatMoney(cashSooner * 100)}) sooner.` : null,
  ].filter(Boolean);

  return {
    tasks, quick_wins: quickWins.map((t) => t.key), phases,
    hours_now_per_week: round1(hoursNow), hours_saved_per_week: round1(weekly),
    hours_saved_per_month: round1(weekly * WEEKS_PER_MONTH), hours_saved_per_year: Math.round(weekly * 52),
    time_value_monthly_pence: timeValueMonthly * 100, revenue_recovered_monthly_pence: revenueMonthly * 100,
    cash_collected_sooner_pence: cashSooner * 100, monthly_value_pence: monthlyValue * 100, annual_value_pence: monthlyValue * 12 * 100,
    payback_months: payback, assumptions, scored_at: new Date().toISOString(),
  };
}

/** Writes the client-facing proposal from the audit and its analysis. */
export function buildProposal(audit, analysis, { agencyName, preparedBy }) {
  const d = audit.discovery || {};
  const first = (audit.contact_name || '').split(' ')[0];
  const topTasks = analysis.tasks.slice(0, 3);
  const problems = [
    ...topTasks.map((t) => `${t.name} takes about ${t.hours_per_week} hours a week.`),
    d.missed_calls_per_week ? `Around ${d.missed_calls_per_week} calls a week go unanswered – each one is a customer who may ring someone else.` : null,
    d.no_shows_per_month ? `${d.no_shows_per_month} no-shows or wasted visits a month.` : null,
    d.unpaid_invoices ? `${formatMoney(Math.round(num(d.unpaid_invoices) * 100))} currently owed by customers.` : null,
    d.frustrations ? `In your words: “${String(d.frustrations).trim()}”` : null,
  ].filter(Boolean);
  const valid = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  return {
    title: `Automation plan for ${audit.client_name}`,
    intro: `${first ? `Hi ${first}, thank you` : 'Thank you'} for walking us through how ${audit.client_name} runs day to day. Below is what we found, what we’d automate first and what it’s worth to you. Everything is built on one system your team logs into, with your own logo and colours.`,
    problems,
    quick_wins: analysis.tasks.filter((t) => t.quick_win).map((t) => ({ name: t.name, solution: t.solution, saved_per_week: t.saved_per_week })),
    phases: analysis.phases.map((p) => ({ name: p.name, weeks: p.weeks, items: p.items.map((t) => ({ name: t.name, solution: t.solution, module: t.module, saved_per_week: t.saved_per_week })) })),
    included: [
      'Your own branded system (logo and colours) for you and your team',
      'Business phone number and WhatsApp linked in – missed calls texted back, messages never missed',
      'Online booking page with automatic reminders',
      'Quotes and invoices with card payments and automatic chasing',
      'CRM with every call, message, booking and payment on the customer’s record',
      'Set-up, training for your team and ongoing support',
      'A monthly report showing hours saved and results',
    ],
    investment: { setup_pence: audit.setup_fee_pence || 0, monthly_pence: audit.monthly_fee_pence || 0 },
    roi: {
      hours_saved_per_week: analysis.hours_saved_per_week, hours_saved_per_month: analysis.hours_saved_per_month, hours_saved_per_year: analysis.hours_saved_per_year,
      monthly_value_pence: analysis.monthly_value_pence, annual_value_pence: analysis.annual_value_pence,
      revenue_recovered_monthly_pence: analysis.revenue_recovered_monthly_pence, payback_months: analysis.payback_months,
    },
    assumptions: analysis.assumptions,
    next_steps: [
      'Accept this proposal online (one click below).',
      'We book a 30-minute kick-off call and connect your phone number, WhatsApp and calendar.',
      `Phase 1 quick wins go live within two weeks – you’ll see the hours saved in your dashboard from day one.`,
    ],
    prepared_by: preparedBy || agencyName,
    agency: agencyName,
    valid_until: valid,
    generated_at: new Date().toISOString(),
  };
}

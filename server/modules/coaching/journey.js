/**
 * The online coaching journey: from the first conversation with someone who
 * becomes a client, through onboarding, to their first check-in.
 *
 * Every step says who it waits on (the coach, the client or the system), what
 * the client sees about it on their page, and the message they get when it
 * becomes their turn. So both sides always know where things are and what
 * happens next.
 */

export const PHASES = [
  { key: 'connect', title: 'Getting to know each other', blurb: 'From the first conversation to saying yes.' },
  { key: 'start', title: 'Getting started', blurb: 'Paid, welcomed, and everything the coach needs to build your plan.' },
  { key: 'first_week', title: 'Your first week', blurb: 'Your programme arrives and you do your first check-in.' },
];

/**
 * owner: who has to act for the step to be done.
 * client_action: what the client does on their page (null when it isn't theirs).
 * message: sent to the client when the step becomes theirs, or when a coach/system step finishes and they should know.
 */
export const STEPS = [
  {
    key: 'conversation', phase: 'connect', owner: 'coach', title: 'First conversation',
    client_text: 'We got talking about what you want to achieve.',
    coach_text: 'Log where you spoke and what they want. Their page is created now.',
  },
  {
    key: 'call', phase: 'connect', owner: 'coach', title: 'Discovery call',
    client_text: 'A call to understand your goals and check coaching is right for you.',
    coach_text: 'Book and hold the call. Mark it done afterwards.',
  },
  {
    key: 'offer', phase: 'connect', owner: 'client', title: 'Say yes to your coaching', client_action: 'accept_offer',
    client_text: 'Read through what’s included and say yes when you’re ready.',
    coach_text: 'Waiting for them to say yes on their page.',
    message: 'Hi {{first_name}}, it was great speaking with you. Everything we talked about is on your page, including what’s included in {{programme}}. Have a look and say yes when you’re ready: {{portal}}',
  },
  {
    key: 'payment', phase: 'start', owner: 'coach', title: 'Payment',
    client_text: 'Your first payment.',
    coach_text: 'Mark as paid once their payment comes through.',
  },
  {
    key: 'welcome', phase: 'start', owner: 'system', title: 'Welcome',
    client_text: 'A welcome, and exactly what happens next.',
    coach_text: 'Sent automatically the moment they pay.',
    message: 'Welcome aboard, {{first_name}}! Your coaching starts here. Next, there are two quick things on your page: your intake form, and your coaching agreement. It takes about 10 minutes: {{portal}}',
  },
  {
    key: 'intake', phase: 'start', owner: 'client', title: 'Intake form', client_action: 'intake',
    client_text: 'Tell your coach about your goals, your history and your week, plus your starting point.',
    coach_text: 'Waiting for their intake form.',
    nudge: 'Hi {{first_name}}, just a reminder to fill in your intake form so I can get your programme ready: {{portal}}',
  },
  {
    key: 'agreement', phase: 'start', owner: 'client', title: 'Coaching agreement', client_action: 'agreement',
    client_text: 'How coaching works between you and your coach. Read it and agree.',
    coach_text: 'Waiting for them to agree to the coaching agreement.',
    nudge: 'Hi {{first_name}}, one last thing before we start: your coaching agreement is on your page: {{portal}}',
  },
  {
    key: 'kickoff', phase: 'start', owner: 'client', title: 'Kickoff call', client_action: 'kickoff',
    client_text: 'Pick a time for your kickoff call, where you go through your plan together.',
    coach_text: 'Waiting for them to pick a kickoff time. Once they have, hold the call and mark it done.',
    nudge: 'Hi {{first_name}}, pick a time for your kickoff call here: {{portal}}',
    // After the client picks a time it waits on the coach to hold the call.
    then_owner: 'coach',
  },
  {
    key: 'programme', phase: 'first_week', owner: 'coach', title: 'Your programme',
    client_text: 'Your plan, built from your intake form and kickoff call.',
    coach_text: 'Send their programme (add the link) and mark it done.',
    message: 'Your programme is ready, {{first_name}}! It’s on your page: {{portal}}. Your first check-in is at the end of week 1.',
  },
  {
    key: 'first_checkin', phase: 'first_week', owner: 'client', title: 'First check-in', client_action: 'checkin',
    client_text: 'Your first weekly check-in: how the week went and where you’re at.',
    coach_text: 'Waiting for their first check-in. After this they’re fully onboarded.',
    nudge: 'Hi {{first_name}}, time for your first check-in. It takes 2 minutes: {{portal}}',
  },
];

export const STEP = Object.fromEntries(STEPS.map((s, i) => [s.key, { ...s, position: i }]));

export const DEFAULT_SETTINGS = {
  programme: '12-week online coaching',
  weeks: 12,
  price_text: '',
  includes: ['A plan built around your goals and your week', 'A weekly check-in with personal feedback', 'Messaging support between check-ins', 'Your progress tracked week by week'],
  agreement: 'Coaching works best when we both show up. I’ll build your plan, review every check-in and reply within one working day. You’ll follow the plan as best you can, check in every week, and tell me honestly how it’s going. Your details stay private between us. Payments are taken monthly; you can stop at the end of any month by letting me know.',
  kickoff_note: 'Pick two or three times that suit you this week and I’ll confirm one.',
  checkin_day: 'Sunday',
};

/**
 * The shape of the expected path: slow for the first few weeks while habits
 * and foundations settle, then picking up week after week.
 * Returns the fraction of the way from start to goal at a given week.
 */
export const EXPECTED_CURVE = 1.8;
export function expectedFraction(week, weeks) {
  if (week <= 0) return 0;
  return Math.min(1, (week / Math.max(1, weeks)) ** EXPECTED_CURVE);
}

/** The expected path, week 0 to the end, from the client's starting point to their goal. */
export function expectedPath(baseline, target, weeks) {
  if (baseline === null || baseline === undefined || target === null || target === undefined) return [];
  const out = [];
  for (let w = 0; w <= weeks; w++) out.push({ week: w, value: round2(baseline + (target - baseline) * expectedFraction(w, weeks)) });
  return out;
}

export const round2 = (n) => Math.round(n * 100) / 100;

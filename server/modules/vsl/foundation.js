/**
 * The VSL foundation. Every video sales letter the system builds starts here,
 * whatever the niche or format. Five sections, each with a time window, a base
 * slot (the blanks a niche fills in) and the filming direction.
 *
 * This is the source of truth. Niche packs (niches.js) only fill the slots;
 * formats (formats.js) only change how each line is shown. Neither changes the
 * structure, the timings, the honesty rules or the single call to action.
 */

export const FOUNDATION_VERSION = 'v1';

export const OFFER = {
  name: 'Automations service',
  method_line: 'I set up a system that replies to every enquiry within seconds, follows up for you, and shows you each week how many bookings it saved.',
  does: [
    'An instant reply to every DM and missed enquiry',
    'Follow-up nudges at 30 minutes, midday and a 5pm sweep, with nothing after 7pm on weekdays',
    'Every enquiry logged in one spreadsheet',
    'A weekly report of enquiries recovered and their estimated value',
  ],
  // Mentioned in one line only. The detail lives in the breakdown video.
  add_ons: ['cancellation fill', 'rebooking nudges', 'appointment reminders'],
  add_on_line: 'Add-ons, mentioned in one line only: cancellation fill, rebooking nudges and appointment reminders',
  follow_up: { nudges: ['30 minutes', 'midday', '5pm sweep'], quiet_after: '19:00', quiet_days: 'weekdays' },
};

export const SECTIONS = [
  {
    key: 'hook', number: 1, title: 'The Hook', start: 0, end: 5,
    goal: 'One sentence, straight to camera, that names who it’s for and the problem costing them right now.',
    slot: '[who you’re talking to] + [the problem costing them right now]',
    slot_fields: ['who', 'problem_now'],
    rules: ['Pick one hook now and test the others later.', 'No logo intro or music build-up first, so your first word is in the first frame.'],
    filming: 'On camera, in a tight shot. No logo intro or music build-up first, so your first word is in the first frame.',
    camera: 'on_camera',
  },
  {
    key: 'problem', number: 2, title: 'Problem & Agitation', start: 5, end: 50,
    goal: 'Describe their day so well they think “that’s me”, then show why what they’re doing now isn’t fixing it.',
    slot: '[their day-to-day pain] → [what they’ve tried] → [what it’s costing them]',
    slot_fields: ['day', 'tried', 'why_failing', 'cost'],
    beats: [
      { key: 'day', label: 'Their day' },
      { key: 'tried', label: 'What they’ve tried' },
      { key: 'why_failing', label: 'Why it isn’t working' },
      { key: 'cost', label: 'The cost' },
    ],
    rules: ['Keep it calm and familiar rather than doom and gloom.', 'They should nod along, not feel told off.'],
    filming: 'On camera. Keep it calm and familiar rather than doom and gloom. They should nod along, not feel told off.',
    camera: 'on_camera',
  },
  {
    key: 'solution', number: 3, title: 'The Solution', start: 50, end: 140,
    goal: 'Introduce the system as the answer in plain words, then show it working. This section does most of the selling.',
    slot: '[your method in plain words] + [live demo] + [what changes for them]',
    slot_fields: ['method_line', 'demo', 'what_changes'],
    demo_steps: [
      // {{message}} and {{business}} come from the niche pack (“DM”, “clinic” for aesthetics clinics).
      { key: 'test_dm', text: 'Send a test {{message}} to a demo {{business}} account.' },
      { key: 'instant_reply', text: 'Show the instant reply arriving.' },
      { key: 'nudge', text: 'Show the follow-up nudge.' },
      { key: 'spreadsheet', text: 'Show the enquiry landing in the spreadsheet.' },
      { key: 'report', text: 'Show the weekly report.' },
    ],
    rules: ['Leave the add-on details to the breakdown video.', 'Add-ons get one line only.'],
    filming: 'The one-line method on camera, then voiceover over the screen recording. Leave the add-on details to the breakdown video.',
    camera: 'mixed',
  },
  {
    key: 'proof', number: 4, title: 'Social Proof & Authority', start: 140, end: 190,
    goal: 'Real results from businesses this has been built for, with specific numbers and their own words.',
    slot: '[client result] + [a specific number] + [their words]',
    slot_fields: ['proof_framing', 'numbers', 'their_words', 'authority'],
    rules: [
      'Say “businesses I’ve built this for”, not “clients”, unless they paid.',
      'Never round a number up.',
      'If a number is small, show it anyway. A real small number builds more trust than a vague big claim.',
      'Blur customer details in every screenshot.',
    ],
    filming: 'Screenshots of the log sheet and weekly report (customer details blurred), plus a 15 to 20 second clip or a two-line quote from each owner.',
    camera: 'screen',
  },
  {
    key: 'cta', number: 5, title: 'Call to Action', start: 190, end: 210,
    goal: 'The one next step is to watch the full breakdown video under the VSL.',
    slot: '[the single action] + [what happens after they take it]',
    slot_fields: ['action', 'after'],
    rules: ['One action only.', 'Say it once, clearly.', 'The button under the VSL uses the same words as the CTA.'],
    filming: 'On camera. Point down towards the link and say it once, clearly.',
    camera: 'on_camera',
  },
];

export const TOTAL_SECONDS = SECTIONS[SECTIONS.length - 1].end;

export const HONESTY_RULES = [
  { key: 'clients_word', text: 'Say “businesses I’ve built this for”, not “clients”, unless they paid.' },
  { key: 'no_rounding', text: 'Never round a number up.' },
  { key: 'show_small', text: 'If a number is small, show it anyway. A real small number builds more trust than a vague big claim.' },
  { key: 'blur', text: 'Blur customer details.' },
];

/** The proof plan: what's true now (v1) and what replaces it (v2). */
export const PROOF_PLAN = {
  v1: {
    summary: 'Two real results: a plumber and an internet connections business. Used honestly, that’s enough for v1.',
    businesses: [
      { key: 'plumber', name: 'Plumber', front_door: 'missed calls and messages' },
      { key: 'internet', name: 'Internet connections company', front_door: 'missed calls and messages' },
    ],
    show: 'Their real numbers, with screenshots of the log sheet and weekly report. Blur customer details.',
    their_words: 'A 15 to 20 second clip, or a two-line quote, from each owner.',
    authority: 'The demo in section 3 is proof in itself, because they’ve just watched it work.',
  },
  v2: {
    summary: 'Swap in results from your first {{business_plural}} on the founding rate (£150/month in exchange for a named case study). Proof from another {{business}} beats proof from another niche.',
    founding_rate: { price_pence: 15000, per: 'month', in_exchange_for: 'a named case study' },
  },
};

/**
 * What to collect from each business before the proof section can be filmed.
 * Every number is stored exactly as measured and shown exactly as stored.
 */
export const PROOF_CHECKLIST = [
  { key: 'period', label: 'The period the numbers cover (start and end date)', required: true },
  { key: 'enquiries_caught', label: 'Enquiries the system replied to in that period', required: true, number: true },
  { key: 'reply_time', label: 'How fast replies went out (before vs. with the system)', required: false, number: true },
  { key: 'recovered', label: 'Enquiries that would have been missed and were recovered', required: true, number: true },
  { key: 'bookings', label: 'Bookings or jobs that came from recovered enquiries', required: true, number: true },
  { key: 'value', label: 'Estimated value of those bookings (and how it was worked out)', required: false, number: true },
  { key: 'log_sheet', label: 'Screenshot of the enquiry log sheet (customer details blurred)', required: true },
  { key: 'weekly_report', label: 'Screenshot of a weekly report (customer details blurred)', required: true },
  { key: 'their_words', label: 'A 15 to 20 second clip, or a two-line quote, from the owner', required: true },
  { key: 'permission', label: 'The owner’s OK to use their name, numbers and words', required: true },
  { key: 'paid', label: 'Did they pay? (decides “client” vs “business I’ve built this for”)', required: true },
];

/** The page around the video. The button repeats the CTA's own words. */
export const PAGE = {
  button_text: 'Watch the full breakdown',
  below_video: 'breakdown',
  breakdown: {
    covers: ['how this works for businesses like theirs', 'the problems it solves', 'what it’s done for the businesses I’ve worked with', 'the add-on details'],
  },
};

/** Things the foundation deliberately leaves open. Shown wherever they matter until decided. */
export const OPEN_DECISIONS = [
  {
    key: 'breakdown_cta', question: 'The call to action at the end of the breakdown video',
    suggestion: { kind: 'book_call', label: 'Book a call' },
    note: 'Booking a call is the natural next step.',
  },
  { key: 'hook_winner', question: 'Which hook wins', suggestion: null, note: 'Pick one now and test the others later.' },
];

/** The three ways the same script is produced. Faceless is the one being made now. */
export const FORMAT_KEYS = ['faceless', 'voiceover', 'on_camera'];

export function sectionAt(seconds) {
  return SECTIONS.find((s) => seconds >= s.start && seconds < s.end) || (seconds >= TOTAL_SECONDS ? SECTIONS[SECTIONS.length - 1] : SECTIONS[0]);
}

export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

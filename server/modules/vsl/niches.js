import { render } from '../../lib/util.js';

/**
 * Niche packs fill the foundation's slots for one kind of business.
 *
 * aesthetics_clinic is v1: its wording is the foundation's own, word for word.
 * The other packs are starter drafts in the same shape, ready to be checked and
 * changed when a lead in that niche comes up. A pack never changes the
 * structure, timings, honesty rules or the single call to action.
 *
 * {{tokens}} are filled from the pack's vars, which each script can override
 * (e.g. trade: "electrician" instead of "plumber").
 */

// Shared narration for the demo steps. The foundation gives the steps; these are
// the voiceover / caption lines that go over each one. Every pack can replace them.
const DEMO_LINES = {
  test_dm: 'Here’s a test {{message}} coming into a demo {{business}} account.',
  instant_reply: 'Within seconds, it’s answered.',
  nudge: 'If they don’t book, a follow-up nudge goes out at 30 minutes, then midday, then a 5pm sweep. Nothing after 7pm on weekdays.',
  spreadsheet: 'Every enquiry lands in one spreadsheet, so nothing gets lost.',
  report: 'And every week, one report shows how many enquiries were recovered and what they’re worth.',
};
const ADD_ON_LINE = 'It can also fill cancellations, send rebooking nudges and appointment reminders. That’s all in the breakdown.';

export const PACKS = {
  aesthetics_clinic: {
    label: 'Aesthetics clinic', status: 'v1', source: 'foundation', core_niche: 'beauty',
    vars: { business: 'clinic', business_plural: 'clinics', who: 'aesthetics clinic owners', message: 'DM', front_door: 'Instagram DMs', work: 'treat clients' },
    hooks: [
      'If you run an aesthetics clinic, every DM you can’t answer mid-treatment is a booking going to the clinic down the road.',
      'Clinic owners: how many enquiries came in today while your hands were busy with a client?',
      'If you’re still answering Instagram DMs at 10pm, this is for you.',
    ],
    problem: {
      day: 'Back-to-back treatments, the phone buzzing in their pocket, DMs and enquiries piling up.',
      tried: 'Replying between clients, replying late at night, hoping reception covers it, or a basic auto-reply that sounds like a robot.',
      why_failing: 'Someone messaging a clinic is often messaging others too, so whoever replies first usually gets the booking.',
      cost: 'Every missed enquiry is a lost treatment, plus the rebookings that would have followed it.',
      sample_line: 'You didn’t get into aesthetics to sit on your phone at night. But right now, if you don’t reply fast, someone else does.',
    },
    // The beats above describe the viewer's day; these are the lines said (or shown) in the video.
    problem_lines: {
      day: 'Your day is back-to-back treatments. Your phone’s buzzing in your pocket, and the DMs and enquiries are piling up.',
      tried: 'So you reply between clients. Or late at night. Or you hope reception covers it. Maybe you’ve tried an auto-reply, and it sounds like a robot.',
      why_failing: 'But someone messaging your clinic is often messaging two or three others too. Whoever replies first usually gets the booking.',
      cost: 'So every enquiry you miss is a lost treatment, plus every rebooking that would have followed it.',
    },
    what_changes: 'You treat clients. The system catches the enquiries. You check one report on a Friday.',
    proof_relation: 'other_niche',
    proof_framing: 'I’ve built and tested this system with two businesses, a plumber and an internet connections company. It’s the same system with a different front door. For them it catches missed calls and messages. For a clinic, it catches Instagram DMs.',
    cta_line: 'Right under this video there’s a full breakdown. It shows how this works for clinics like yours, the problems it solves, and what it’s done for the businesses I’ve worked with. Watch that next.',
    broll: {
      hook: 'Phone lighting up on a treatment trolley, unread DM badge climbing.',
      problem: 'Gloved hands mid-treatment; phone face-down buzzing; a late-night sofa shot with a phone screen glow.',
      proof: 'Log sheet and weekly report screenshots, customer details blurred.',
      cta: 'Arrow pointing down to the button.',
    },
  },

  trades: {
    label: 'Trades (plumbing, electrical, construction)', status: 'draft', source: 'starter', core_niche: 'local_services',
    vars: { business: '{{trade}}', business_plural: '{{trade_plural}}', trade: 'plumber', trade_plural: 'plumbers', trade_work: 'the trade', who: 'tradespeople', message: 'call', front_door: 'missed calls and texts', work: 'do the work' },
    hooks: [
      'If you’re {{a_trade}}, every call you miss on a job is work going to the next number on Google.',
      'Tradespeople: how many calls went to voicemail today while you were on the tools?',
      'If you’re still ringing people back from the van at 9pm, this is for you.',
    ],
    problem: {
      day: 'On the tools all day, the phone ringing in the van or in their pocket, voicemails and texts stacking up.',
      tried: 'Calling back at lunch or after the last job, a partner answering when they can, a voicemail greeting, or a generic auto-text.',
      why_failing: 'Someone who needs a {{trade}} rings the next number if nobody picks up, so whoever answers first usually gets the job.',
      cost: 'Every missed call is a lost job, plus the repeat work and referrals that would have followed it.',
      sample_line: 'You didn’t get into {{trade_work}} to spend your evenings on the phone. But right now, if you don’t pick up fast, someone else does.',
    },
    problem_lines: {
      day: 'You’re on the tools all day. The phone’s ringing in the van, and the voicemails and texts are stacking up.',
      tried: 'So you call back at lunch, or after the last job. Maybe someone at home answers when they can. Maybe there’s a voicemail greeting nobody listens to.',
      why_failing: 'But when someone needs a {{trade}} and you don’t pick up, they ring the next number. Whoever answers first usually gets the job.',
      cost: 'So every missed call is a lost job, plus the repeat work and referrals that would have followed it.',
    },
    what_changes: 'You do the work. The system catches the calls. You check one report on a Friday.',
    proof_relation: 'same_niche',
    proof_framing: 'I’ve built and tested this system with two businesses, a plumber and an internet connections company. For both of them it catches missed calls and messages, which is exactly what it would do for you.',
    cta_line: 'Right under this video there’s a full breakdown. It shows how this works for {{trade_plural}} like you, the problems it solves, and what it’s done for the businesses I’ve worked with. Watch that next.',
    broll: {
      hook: 'Phone buzzing on a van dashboard; missed-call list growing.',
      problem: 'Hands on a pipe or a fuse board; phone ringing out on the side; late-evening van cab.',
      proof: 'The plumber’s log sheet and weekly report, customer details blurred.',
      cta: 'Arrow pointing down to the button.',
    },
  },

  gym: {
    label: 'Gym owner or manager', status: 'draft', source: 'starter', core_niche: 'fitness',
    vars: { business: 'gym', business_plural: 'gyms', who: 'gym owners', message: 'enquiry', front_door: 'Instagram DMs, website enquiries and missed calls', work: 'run the gym' },
    hooks: [
      'If you run a gym, every membership enquiry you don’t answer tonight could be joining the gym down the road tomorrow.',
      'Gym owners: how many enquiries came in today while you were on the gym floor?',
      'If you’re still answering “how much is membership?” DMs at 10pm, this is for you.',
    ],
    problem: {
      day: 'Classes, inductions and staff to manage, with DMs, website enquiries and missed calls piling up.',
      tried: 'Front desk when it’s staffed, replying after classes or late at night, or a basic auto-reply.',
      why_failing: 'Someone looking for a gym is usually messaging two or three, so whoever replies first and gets them in for a trial usually gets the membership.',
      cost: 'Every missed enquiry is a lost membership, and months of fees that would have followed it.',
      sample_line: 'You didn’t open a gym to sit on your phone at night. But right now, if you don’t reply fast, someone else does.',
    },
    problem_lines: {
      day: 'Your day is classes, inductions and keeping the team going. Meanwhile the DMs, website enquiries and missed calls are piling up.',
      tried: 'So you reply after classes, or late at night, or hope the front desk gets to them. Maybe there’s an auto-reply, and it sounds like a robot.',
      why_failing: 'But someone looking for a gym is usually messaging two or three. Whoever replies first and gets them in for a trial usually gets the membership.',
      cost: 'So every enquiry you miss is a lost membership, and months of fees with it.',
    },
    what_changes: 'You run the gym. The system catches the enquiries. You check one report on a Friday.',
    proof_relation: 'other_niche',
    proof_framing: 'I’ve built and tested this system with two businesses, a plumber and an internet connections company. It’s the same system with a different front door. For them it catches missed calls and messages. For a gym, it catches DMs and membership enquiries.',
    cta_line: 'Right under this video there’s a full breakdown. It shows how this works for gyms like yours, the problems it solves, and what it’s done for the businesses I’ve worked with. Watch that next.',
    broll: { hook: 'Phone on a gym bench lighting up with DMs.', problem: 'Busy class; front desk empty; owner on phone after hours.', proof: 'Log sheet and weekly report, customer details blurred.', cta: 'Arrow pointing down to the button.' },
  },

  personal_trainer: {
    label: 'Personal trainer', status: 'draft', source: 'starter', core_niche: 'fitness',
    vars: { business: 'PT', business_plural: 'personal trainers', who: 'personal trainers', message: 'DM', front_door: 'Instagram DMs', work: 'train clients' },
    hooks: [
      'If you’re a personal trainer, every DM you can’t answer mid-session is a client signing up with someone else.',
      'PTs: how many enquiries came in today while you were with a client?',
      'If you’re still answering DMs at 10pm, this is for you.',
    ],
    problem: {
      day: 'Back-to-back sessions, the phone buzzing in the bag, DMs and enquiries piling up.',
      tried: 'Replying between sessions, replying late at night, or a basic auto-reply that sounds like a robot.',
      why_failing: 'Someone looking for a PT is often messaging others too, so whoever replies first usually gets the client.',
      cost: 'Every missed enquiry is a lost client, plus the months of sessions that would have followed.',
      sample_line: 'You didn’t become a PT to sit on your phone at night. But right now, if you don’t reply fast, someone else does.',
    },
    problem_lines: {
      day: 'Your day is back-to-back sessions. Your phone’s buzzing in your bag, and the DMs are piling up.',
      tried: 'So you reply between sessions, or late at night. Maybe you’ve tried an auto-reply, and it sounds like a robot.',
      why_failing: 'But someone looking for a PT is often messaging two or three others too. Whoever replies first usually gets the client.',
      cost: 'So every DM you miss is a lost client, plus months of sessions that would have followed.',
    },
    what_changes: 'You train clients. The system catches the enquiries. You check one report on a Friday.',
    proof_relation: 'other_niche',
    proof_framing: 'I’ve built and tested this system with two businesses, a plumber and an internet connections company. It’s the same system with a different front door. For them it catches missed calls and messages. For a PT, it catches Instagram DMs.',
    cta_line: 'Right under this video there’s a full breakdown. It shows how this works for trainers like you, the problems it solves, and what it’s done for the businesses I’ve worked with. Watch that next.',
    broll: { hook: 'Phone on the gym floor lighting up with DMs.', problem: 'Mid-session coaching; phone buzzing in a kit bag; late-night scrolling.', proof: 'Log sheet and weekly report, customer details blurred.', cta: 'Arrow pointing down to the button.' },
  },

  online_coach: {
    label: 'Online coach', status: 'draft', source: 'starter', core_niche: 'coaching',
    vars: { business: 'coaching business', business_plural: 'online coaches', who: 'online coaches', message: 'DM', front_door: 'Instagram DMs and comments', work: 'coach' },
    hooks: [
      'If you’re an online coach, every DM that waits until tomorrow is a sales call you never get.',
      'Coaches: how many people asked about working with you this week and never heard back?',
      'If you’re still answering DMs at 10pm, this is for you.',
    ],
    problem: {
      day: 'Client check-ins, calls and content all day, with DMs and “info” comments piling up from every post.',
      tried: 'Replying between calls, replying late at night, a setter you can’t afford yet, or a keyword bot that sounds like a robot.',
      why_failing: 'Interest from a post fades fast and people follow lots of coaches, so whoever replies first usually gets the call.',
      cost: 'Every missed DM is a lost client, plus the months of coaching fees that would have followed.',
      sample_line: 'You didn’t start coaching to sit in your DMs at night. But right now, if you don’t reply fast, someone else does.',
    },
    problem_lines: {
      day: 'Your day is client check-ins, calls and making content. Every post brings in DMs and “info” comments, and they pile up.',
      tried: 'So you reply between calls, or late at night. Maybe you’ve tried a keyword bot, and it sounds like a robot.',
      why_failing: 'But interest from a post fades fast, and people follow lots of coaches. Whoever replies first usually gets the call.',
      cost: 'So every DM you miss is a lost client, plus months of coaching fees.',
    },
    what_changes: 'You coach. The system catches the enquiries. You check one report on a Friday.',
    proof_relation: 'other_niche',
    proof_framing: 'I’ve built and tested this system with two businesses, a plumber and an internet connections company. It’s the same system with a different front door. For them it catches missed calls and messages. For a coach, it catches DMs and comments.',
    cta_line: 'Right under this video there’s a full breakdown. It shows how this works for coaches like you, the problems it solves, and what it’s done for the businesses I’ve worked with. Watch that next.',
    broll: { hook: 'Phone with a stack of unread DMs and “info” comments.', problem: 'Zoom call on a laptop; DMs piling on the phone beside it.', proof: 'Log sheet and weekly report, customer details blurred.', cta: 'Arrow pointing down to the button.' },
  },
  // Wellness: gym owners and managers, personal trainers and online coaches, in one pack.
  // Pain-first, and built as a path: where the business is now (A) to where it wants
  // to be (D), with the system as the thing in between instead of another hire.
  wellness: {
    label: 'Wellness (gyms, PTs, online coaches)', status: 'draft', source: 'brief', core_niche: 'fitness',
    vars: { business: 'gym', business_plural: 'gyms and coaches', who: 'gym owners, managers, personal trainers and online coaches', message: 'enquiry', front_door: 'enquiries and new-member onboarding', work: 'run the sessions' },
    hooks: [
      'If you run a gym or coach clients, every new member you onboard by hand is time you’re not spending with clients.',
      'Gym owners and coaches: how much of your week goes on chasing forms, check-ins and payments?',
      'If your answer to the admin is “hire someone”, this is for you.',
    ],
    // A → B → C → D: enquiry → answered and booked → onboarded → kept, with no new hire.
    path: [
      { key: 'A', label: 'Enquiry', text: 'Someone gets in touch' },
      { key: 'B', label: 'Answered', text: 'Replied in seconds and booked in' },
      { key: 'C', label: 'Onboarded', text: 'Forms, welcome and first session sent' },
      { key: 'D', label: 'Kept', text: 'Checked in on, reported on, staying' },
    ],
    problem: {
      day: 'Point A: enquiries, sign-ups, forms, welcomes, first sessions, check-ins and payments, all waiting on the owner or coach.',
      tried: 'The usual fix is hiring someone or handing it to someone already stretched: more wages, more training, and it stops when they go home.',
      why_failing: 'Every gap between the steps is where people drop off: the enquiry that waited, the member who never booked a first session.',
      cost: 'Each gap is a lost member or client, plus every month of fees that would have followed.',
      sample_line: 'You didn’t get into fitness to do admin at night. You need the steps connected, not another wage.',
    },
    problem_lines: {
      day: 'Right now, a new member signs up and the rest is on you. Forms to chase, a welcome to send, a first session to book.',
      tried: 'The usual fix is to hire someone, or hand it to someone who’s already stretched. More wages, more training, and it stops when they go home.',
      why_failing: 'And every gap between those steps is where people drop off. The enquiry that waited. The member who never booked a first session.',
      cost: 'Each one is a lost member or client, and every month of fees that would have followed.',
    },
    method_line: 'I build the system in between. It connects every step, from the first enquiry to a fully onboarded member, without you hiring anyone.',
    demo_lines: {
      test_dm: 'Here’s a new enquiry coming into a demo gym account. That’s point A.',
      instant_reply: 'Within seconds, it’s answered, with a link to join and book a first session. Point B.',
      nudge: 'If they go quiet, a follow-up goes out at 30 minutes, then midday, then a 5pm sweep. Nothing after 7pm on weekdays.',
      spreadsheet: 'When they join, their forms, welcome and first session go out by themselves, and every step is logged in one place. Point C.',
      report: 'And each week, one report shows who came in, who’s onboarded and what it’s worth. Point D.',
    },
    add_on_line: 'It can also fill cancelled classes, nudge people to rebook and send session reminders. That’s all in the breakdown.',
    what_changes: 'There’s no one new to hire. It runs every day, and we watch over it. If anything breaks, needs changing or could work better, we’re alerted and we tell you. You run the sessions. You check one report on a Friday.',
    proof_relation: 'other_niche',
    proof_framing: 'I’ve built and tested this system with two businesses, a plumber and an internet connections company. It’s the same system with a different front door. For them it catches missed calls and messages. For a gym or a coach, it catches enquiries and carries them through onboarding.',
    cta_line: 'Right under this video there’s a full breakdown. It shows how this works for gyms and coaches like you, the problems it solves, and what it’s done for the businesses I’ve worked with. Watch that next.',
    broll: {
      hook: 'Phone lighting up with notifications on a gym bench.',
      problem: 'A coach mid-session; paperwork and a laptop late at night; an empty reception desk.',
      proof: 'Log sheet and weekly report screenshots, customer details blurred.',
      cta: 'Arrow pointing down to the button.',
    },
  },
};

export const DEFAULT_PACK = 'aesthetics_clinic';

/** Fields a pack must have, so a custom pack can't leave a slot empty. */
export const PACK_FIELDS = {
  vars: ['business', 'business_plural', 'who', 'message', 'front_door'],
  problem: ['day', 'tried', 'why_failing', 'cost', 'sample_line'],
  top: ['hooks', 'what_changes', 'proof_framing', 'cta_line'],
};

/** Fills a pack's defaults for anything a custom pack leaves out. */
export function completePack(pack) {
  const base = PACKS[pack.based_on] || PACKS[DEFAULT_PACK];
  return {
    ...base, ...pack,
    vars: { ...base.vars, ...(pack.vars || {}) },
    problem: { ...base.problem, ...(pack.problem || {}) },
    problem_lines: { ...base.problem_lines, ...(pack.problem_lines || {}) },
    demo_lines: { ...DEMO_LINES, ...(base.demo_lines || {}), ...(pack.demo_lines || {}) },
    add_on_line: pack.add_on_line || base.add_on_line || ADD_ON_LINE,
    broll: { ...base.broll, ...(pack.broll || {}) },
    hooks: Array.isArray(pack.hooks) && pack.hooks.length ? pack.hooks : base.hooks,
  };
}

/** What's still missing from a pack before it's usable. */
export function packGaps(pack) {
  const gaps = [];
  for (const k of PACK_FIELDS.vars) if (!pack.vars?.[k]) gaps.push(`vars.${k}`);
  for (const k of PACK_FIELDS.problem) if (!pack.problem?.[k]) gaps.push(`problem.${k}`);
  for (const k of PACK_FIELDS.top) if (!pack[k] || (Array.isArray(pack[k]) && !pack[k].length)) gaps.push(k);
  return gaps;
}

/**
 * Renders {{tokens}} with the pack's vars. Vars can refer to other vars
 * ({{trade}} inside business), so it runs until nothing changes.
 */
export function fill(text, vars) {
  let out = String(text ?? '');
  for (let i = 0; i < 4 && /\{\{/.test(out); i++) {
    const next = render(out, vars);
    if (next === out) break;
    out = next;
  }
  return out;
}

export function resolveVars(vars) {
  const out = { ...vars };
  for (const [k, v] of Object.entries(out)) out[k] = fill(v, vars);
  // {{a_trade}} → "a plumber" / "an electrician", for any var not already given one.
  for (const [k, v] of Object.entries({ ...out })) if (!k.startsWith('a_') && out[`a_${k}`] === undefined && v) out[`a_${k}`] = `${/^[aeiou]/i.test(v) ? 'an' : 'a'} ${v}`;
  return out;
}

export { DEMO_LINES, ADD_ON_LINE };

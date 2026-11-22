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
    // Problem → solution → result: the chain this pack's VSL proves.
    result_chain: {
      problem: "Enquiries go unanswered mid-treatment, so bookings go to the clinic that replies first.",
      solution: "Every enquiry answered in seconds and followed up, without anyone on the phone.",
      business_result: "More of the enquiries they already get turn into treatments and rebookings.",
      customer_result: "Clients get booked in for the treatment they wanted, while they still want it.",
    },
    result_line: "So more of the enquiries you already get turn into treatments, and your clients get booked in while they still want it. That’s the result.",
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
    // Problem → solution → result: the chain this pack's VSL proves.
    result_chain: {
      problem: "Calls are missed on the tools, so the job goes to the next number.",
      solution: "Every missed call answered in seconds and followed up, while they work.",
      business_result: "More of the calls they already get turn into jobs, plus the repeat work after.",
      customer_result: "Customers get a reply while the problem’s still fresh, and get it sorted.",
    },
    result_line: "So more of the calls you already get turn into jobs, and your customers get a reply while the problem’s still fresh. That’s the result.",
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
    // Problem → solution → result: the chain this pack's VSL proves.
    result_chain: {
      problem: "Enquiries wait while the owner is on the gym floor, so people join elsewhere.",
      solution: "Every enquiry answered in seconds and followed up, without extra front-desk staff.",
      business_result: "More enquiries turn into members who actually start.",
      customer_result: "People get started while they’re motivated, which is where their results begin.",
    },
    result_line: "So more enquiries turn into members who actually start. And starting is where their results begin. That’s the result, for them and for you.",
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
    // Problem → solution → result: the chain this pack's VSL proves.
    result_chain: {
      problem: "DMs wait while the PT is with clients, so enquiries sign up elsewhere.",
      solution: "Every DM answered in seconds and followed up, mid-session or not.",
      business_result: "More DMs turn into clients, without more hours on the phone.",
      customer_result: "Clients start while they’re motivated, which is where their results come from.",
    },
    result_line: "So more DMs turn into clients, and every client starts while they’re motivated. That’s where their results come from, and yours.",
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
    // Problem → solution → result: the chain this pack's VSL proves.
    result_chain: {
      problem: "DMs from content wait, interest fades, and the sales call never happens.",
      solution: "Every DM answered in seconds and followed up, while the coach coaches.",
      business_result: "More DMs turn into calls and clients.",
      customer_result: "People get started while they still care, which is where their results begin.",
    },
    result_line: "So more DMs turn into calls and clients, and people start while they still care. That’s where their results begin, and yours.",
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
    // Problem → solution → result: the chain this pack's VSL proves.
    result_chain: {
      problem: "New members and clients are onboarded by hand, and people drop off in the gaps.",
      solution: "The system in between connects every step from enquiry to onboarded, without a new hire.",
      business_result: "More people go from enquiry to onboarded, and stay.",
      customer_result: "People who stay get results: in their body, in their head and in their week.",
    },
    result_line: "So more people go from enquiry to onboarded, and stay. And people who stay get results: in their body, in their head, and in their week. That’s the result.",
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
  // Online coach, onboarding only. Pain-first, in the owner's own voice ("I build", "we keep an eye on it"),
  // along the path: paid (A) → welcomed and sent everything (B) → set up and started (C) → checking in and staying (D).
  coach_onboarding: {
    label: 'Online coach onboarding', status: 'draft', source: 'brief', core_niche: 'coaching',
    vars: { business: 'coaching business', business_plural: 'online coaches', who: 'online coaches', message: 'sign-up', front_door: 'new-client onboarding', work: 'coach' },
    hooks: [
      'If you coach online, every new client you onboard by hand is an evening you’re not getting back.',
      'Online coaches: how long does it take a new client to actually start after they’ve paid?',
      'If you’re still sending welcome messages and chasing forms at ten at night, this is for you.',
    ],
    path: [
      { key: 'A', label: 'Paid', text: 'A new client signs up' },
      { key: 'B', label: 'Welcomed', text: 'Welcome, intake form and call link, in seconds' },
      { key: 'C', label: 'Started', text: 'Form back, call booked, programme sent' },
      { key: 'D', label: 'Staying', text: 'Checking in every week, reported on' },
    ],
    problem: {
      day: 'Point A: a client pays, then the welcome, intake form, kickoff call and app set-up all wait on the coach.',
      tried: 'Doing it late at night between calls, or hiring a VA: another wage, time training them, and only there for set hours.',
      why_failing: 'Every gap between the steps is where clients go cold: the form that never comes back, the call that never gets booked.',
      cost: 'Refund requests, clients who quietly drop off after month one, and every month of coaching they would have paid for.',
      sample_line: 'You started coaching to change people’s lives, not to chase paperwork at ten at night. What you need is the steps joined up, not another wage.',
    },
    problem_lines: {
      day: 'Someone pays to work with you. Brilliant. Then it\u2019s all on you. The welcome, the intake form, the call to book, getting them set up.',
      tried: 'So you do it late at night, between client calls. Or you think about hiring a VA. Another wage, time training them, and they\u2019re only there for set hours.',
      why_failing: 'And every gap between those steps is where clients go cold. The form that never comes back. The call that never gets booked.',
      cost: 'That\u2019s refund requests, clients who drop off after month one, and every month of coaching they\u2019d have paid for.',
    },
    method_line: 'So I build the system in between. From the moment someone pays to their first check-in, every step is connected, and you don’t have to hire anyone.',
    demo_lines: {
      test_dm: 'Here’s a new client signing up on a demo coaching account. That’s point A.',
      instant_reply: 'Within seconds, they’ve got a welcome message, their intake form, and a link to book their kickoff call. That’s point B.',
      nudge: 'If the form doesn’t come back, they get a friendly nudge after thirty minutes, another at midday, and a final one in the 5pm sweep. Nothing goes out after seven on weekdays.',
      spreadsheet: 'Every client’s onboarding sits in one sheet. Form back, call booked, programme sent. You can see who’s stuck at a glance. That’s point C.',
      report: 'And every week, one report shows who’s started, who’s checking in, and who needs a word from you. That’s point D.',
    },
    add_on_line: 'It can also chase missed check-ins, nudge clients to rebook, and send reminders before calls. That’s all in the breakdown.',
    what_changes: 'There’s no one new to hire. It runs every day, and we keep an eye on it for you. If anything breaks or could work better, we’re alerted and we let you know. You coach, and you check one report on a Friday.',
    // Problem → solution → result: the chain this pack's VSL proves.
    result_chain: {
      problem: "New clients are onboarded by hand, late at night, and clients go cold in the gaps.",
      solution: "The system in between connects every step from paid to started, without hiring a VA.",
      business_result: "More clients who pay actually start, and stay, with fewer refund requests.",
      customer_result: "Clients get results: not just on the scales, but a clearer head, better habits and happier days.",
    },
    result_line: "And this is the point. Clients who start properly stay, and clients who stay get results. Not always on the scales straight away, but a clearer head, better habits and happier days. That’s their result, and it’s yours too.",
    proof_relation: 'other_niche',
    proof_framing: 'I’ve built and tested this system with two businesses, a plumber and an internet connections company. It’s the same system with a different front door. For them, it catches missed calls and messages. For an online coach, it takes a new client from paid to started.',
    cta_line: 'Right under this video, there’s a full breakdown. It shows how this works for online coaches like you, the problems it solves, and what it’s done for the businesses I’ve worked with. Watch that next.',
    broll: {
      hook: 'A coach at a laptop late at night, a new-client notification on the phone beside it.',
      problem: 'Late-night admin at a kitchen table; an unanswered intake form; a client waiting.',
      proof: 'Log sheet and weekly report screenshots, customer details blurred.',
      cta: 'Arrow pointing down to the button.',
    },
  },
  // Gym member onboarding: from the day someone joins to the day it's a habit.
  // The owner's result is members who stay; the member's result is physical AND mental.
  gym_onboarding: {
    label: 'Gym member onboarding', status: 'draft', source: 'brief', core_niche: 'fitness',
    vars: { business: 'gym', business_plural: 'gyms', who: 'gym owners and managers', message: 'new member sign-up', front_door: 'new-member onboarding', work: 'run the gym' },
    hooks: [
      'If you run a gym, the first few weeks after someone joins decide whether they stay. Right now, they\u2019re on their own.',
      'Gym owners: how many new members have you never seen again after their first fortnight?',
      'If your onboarding is a fob, a locker and \u201cany questions, just ask\u201d, this is for you.',
    ],
    path: [
      { key: 'A', label: 'Joined', text: 'A new member signs up' },
      { key: 'B', label: 'Welcomed', text: 'Welcome, induction to book and a first-fortnight plan, in seconds' },
      { key: 'C', label: 'Settled in', text: 'Inducted, first visits done, checking in' },
      { key: 'D', label: 'Staying', text: 'A habit, and results they can feel' },
    ],
    problem: {
      day: 'Point A: a member joins, gets a fob and a tour, and is left to it. No plan, no check-in, nobody noticing when they stop coming.',
      tried: 'More staff on the floor, or asking the team to chase new members between everything else: more wages, and it still gets missed on a busy week.',
      why_failing: 'The gap between joining and building a habit is where members drift: the induction never booked, the second week they didn\u2019t come in.',
      cost: 'Every member who drifts is a cancellation, plus the months of membership that would have followed.',
      sample_line: 'You didn\u2019t open a gym to watch people quietly stop coming. They need the steps joined up, and so do you.',
    },
    problem_lines: {
      day: 'Someone joins your gym. They get their fob, a quick tour, and then they\u2019re on their own. No plan, no check-in, and nobody notices when they stop coming.',
      tried: 'The usual fix is more staff on the floor, or asking your team to chase new members between everything else. More wages, more time, and it still gets missed on a busy week.',
      why_failing: 'And the gap between joining and building a habit is where members drift. The induction that never got booked. The second week they didn\u2019t come in.',
      cost: 'Every member who drifts is a cancellation, plus the months of membership that would have followed.',
    },
    method_line: 'So I build the system in between. From the day someone joins to the day it\u2019s a habit, every step is connected, and you don\u2019t need more staff to do it.',
    demo_lines: {
      test_dm: 'Here\u2019s a new member signing up at a demo gym. That\u2019s point A.',
      instant_reply: 'Within seconds, they\u2019re welcomed, with their induction to book and a plan for their first two weeks. That\u2019s point B.',
      nudge: 'If they haven\u2019t booked their induction, a friendly nudge goes out after thirty minutes, another at midday, and a final one in the 5pm sweep. Nothing after seven on weekdays.',
      spreadsheet: 'Every new member sits in one sheet. Inducted, first visits done, checking in. You can see who\u2019s drifting before they cancel. That\u2019s point C.',
      report: 'And every week, one report shows who\u2019s settled in, who\u2019s coming regularly, and who needs a word from your team. That\u2019s point D.',
    },
    add_on_line: 'It can also chase missed classes and remind members before their sessions. That\u2019s all in the breakdown.',
    what_changes: 'There\u2019s no one new to hire. It runs every day, and we keep an eye on it for you. If anything breaks or could work better, we\u2019re alerted and we let you know. You run the gym, and you check one report on a Friday.',
    result_chain: {
      problem: 'New members are left to it after joining, and they drift before it becomes a habit.',
      solution: 'The system in between connects every step from joining to a habit, without more staff.',
      business_result: 'Members who start properly stay: fewer cancellations and more renewals.',
      customer_result: 'Members get their results: physical, and also a clearer head, better habits and days that feel better.',
    },
    result_line: 'And this is the point. Members who start properly stay. And members who stay get their results. Not always on the scales straight away, but a clearer head, better habits, and days that feel better. That\u2019s what keeps them, and that\u2019s your result too.',
    proof_relation: 'other_niche',
    proof_framing: 'I\u2019ve built and tested this system with two businesses, a plumber and an internet connections company. It\u2019s the same system with a different front door. For them, it catches missed calls and messages. For a gym, it takes a new member from joining to a habit.',
    cta_line: 'Right under this video, there\u2019s a full breakdown. It shows how this works for gyms like yours, the problems it solves, and what it\u2019s done for the businesses I\u2019ve worked with. Watch that next.',
    broll: {
      hook: 'A new member at reception with a fob, then alone on the gym floor.',
      problem: 'An empty induction slot; a member\u2019s card unused for weeks; a busy front desk.',
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
  top: ['hooks', 'what_changes', 'proof_framing', 'cta_line', 'result_line'],
  result_chain: ['problem', 'solution', 'business_result', 'customer_result'],
};

/** Fills a pack's defaults for anything a custom pack leaves out. */
export function completePack(pack) {
  const base = PACKS[pack.based_on] || PACKS[DEFAULT_PACK];
  return {
    ...base, ...pack,
    vars: { ...base.vars, ...(pack.vars || {}) },
    problem: { ...base.problem, ...(pack.problem || {}) },
    result_chain: { ...(base.result_chain || {}), ...(pack.result_chain || {}) },
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
  for (const k of PACK_FIELDS.result_chain) if (!pack.result_chain?.[k]) gaps.push(`result_chain.${k}`);
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

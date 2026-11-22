// ─────────────────────────────────────────────────────────────────────────────
//  HQ starter data
//  This is what HQ looks like the first time it opens (and after "Reset to
//  demo"). Everything here can also be changed from inside HQ itself:
//  Settings → Edit HQ, the ✏️ buttons on every item, or Export / Import JSON.
//  Dates are written as "days from today" (d(-3) = three days ago) so the demo
//  always looks current.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000;
const d = (days, hour = 10, min = 0) => {
  const t = new Date(Date.now() + days * DAY);
  t.setHours(hour, min, 0, 0);
  return t.toISOString();
};
const day = (days) => d(days).slice(0, 10);
let n = 0;
const uid = (p) => `${p}_seed${++n}`;

export const DEFAULT_AGENTS = [
  {
    id: 'receptionist', builtIn: 'receptionist', name: 'Receptionist', role: 'Auto-replies & new leads', desk: 'Leads',
    icon: '💬', color: '#22d3ee', autonomy: 'auto', enabled: true,
    instructions: 'Answer every new enquiry within a minute, day or night, on every channel. Capture their name, business, what they need, budget and timeline. Hot leads go straight to the Deal Manager. Never quote prices – that is the Deal Manager’s job. Flag anything that looks like a scam.',
  },
  {
    id: 'deals', builtIn: 'deals', name: 'Deal Manager', role: 'Inbox, quotes & contracts', desk: 'Inbox',
    icon: '📨', color: '#3b82f6', autonomy: 'ask', enabled: true,
    instructions: 'Reply to every deal with a quote built from my rate card. Follow up deals that go quiet after 5 days (max 3 nudges). Check every contract matches the quote before I sign. Reach out to leads that went cold and clients who are due a rebook. Always ask me before anything is sent.',
  },
  {
    id: 'projects', builtIn: 'projects', name: 'Project Manager', role: 'Live jobs & deadlines', desk: 'Projects',
    icon: '🗂️', color: '#fbbf24', autonomy: 'auto', enabled: true,
    instructions: 'Keep every live job moving. Book a kickoff call for every newly signed job, flag anything past its due date, and brief the Scriptwriter when a job includes content.',
  },
  {
    id: 'scripts', builtIn: 'scripts', name: 'Scriptwriter', role: 'Hooks, scripts & posts', desk: 'Scripting',
    icon: '✍️', color: '#a78bfa', autonomy: 'ask', enabled: true,
    instructions: 'Turn every brief into a short-form script: a scroll-stopping hook in the first 2 seconds, one clear point, and a call to action. Write it in my voice – friendly, straight-talking, no jargon. I sign off every script.',
  },
  {
    id: 'finance', builtIn: 'finance', name: 'Finance', role: 'Income, invoices & chasing', desk: 'Income',
    icon: '💷', color: '#34d399', autonomy: 'ask', enabled: true,
    instructions: 'Watch every invoice. Match payments as they land, mark late invoices overdue and chase them: friendly after 1 day, firmer after 7, final notice after 14. Tell me when one needs a phone call.',
  },
];

export function seedState() {
  n = 0;
  return {
    version: 1,
    profile: {
      business: 'CM Automations',
      handle: '@cmautomations',
      owner: 'Callum',
      currency: '£',
      quarterLabel: 'Q4 2026',
      quarterStart: '2026-10-01',
      target: 30000,
      bookingLink: 'https://cmautomations.co.uk/book',
      accent: 'aurora',
      theme: 'dark',
    },
    agents: DEFAULT_AGENTS.map((a) => ({ ...a })),
    settings: {
      autoReply: {
        enabled: true,
        template: 'Hi {first}! 👋 Thanks for getting in touch with {business}. I’ve got your message about {need}. {owner} will come back to you personally today – or grab a free 15-minute call here: {booking_link}\n\nQuick one so we can prep: roughly what budget and timeline did you have in mind?',
        scamWords: 'gift card, card details, crypto, bitcoin, wire transfer, western union, verify your account, guaranteed first page',
        hotScore: 70,
      },
      deals: { followUpDays: 5, maxFollowUps: 3, coldDays: 21, rebookWindowDays: 14 },
      chase: { friendlyAfter: 1, firmerAfter: 7, finalAfter: 14, callAfter: 21 },
    },
    rateCard: [
      { id: uid('r'), item: 'Automation audit (60 min + report)', price: 250, keywords: 'audit, review, assess' },
      { id: uid('r'), item: 'AI auto-responder (WhatsApp, Instagram, email)', price: 750, keywords: 'auto, respond, reply, chatbot, bot, instagram, dm, enquir' },
      { id: uid('r'), item: 'WhatsApp booking assistant', price: 600, keywords: 'whatsapp, booking, appointment' },
      { id: uid('r'), item: 'CRM setup & lead capture', price: 900, keywords: 'crm, lead, pipeline, follow' },
      { id: uid('r'), item: 'Website (5 pages, booking built in)', price: 1500, keywords: 'website, site, landing, page' },
      { id: uid('r'), item: 'Content pack – 12 short-form scripts', price: 450, keywords: 'content, video, tiktok, reels, script, social' },
      { id: uid('r'), item: 'Monthly care plan (per month)', price: 297, keywords: 'monthly, care, retainer, support, manage' },
    ],
    leads: [
      { id: uid('l'), name: 'Jade Morris', business: 'Luxe Lash Studio', channel: 'Instagram', contact: '@luxelash.jade', need: 'an auto-reply for Instagram DMs and bookings', budget: 900, timeline: 'This month', message: 'Hiya, I keep missing DMs while I’m with clients. Can you set something up that replies and books people in for me?', receivedAt: d(0, 7, 42), status: 'new', score: 0, thread: [] },
      { id: uid('l'), name: 'Dan Price', business: 'Apex Roofing', channel: 'Website form', contact: 'dan@apexroofing.co.uk', need: 'a new website with quote requests', budget: 2000, timeline: 'ASAP', message: 'Need a proper website that gets us quote requests. Current one is from 2014. Budget about 2k.', receivedAt: d(0, 6, 15), status: 'new', score: 0, thread: [] },
      { id: uid('l'), name: 'Priya Shah', business: 'Glow Skin Clinic', channel: 'WhatsApp', contact: '+44 7700 900412', need: 'WhatsApp booking', budget: null, timeline: '', message: 'Do you do WhatsApp booking systems?', receivedAt: d(0, 9, 5), status: 'new', score: 0, thread: [] },
      { id: uid('l'), name: 'Mark Allen', business: 'MA Holdings', channel: 'Email', contact: 'payments@ma-holdings.biz', need: 'urgent payment', budget: null, timeline: '', message: 'Please send your card details to verify your account so we can release a £5,000 project payment today.', receivedAt: d(0, 8, 30), status: 'new', score: 0, thread: [] },
      { id: uid('l'), name: 'Tom Hughes', business: 'Peak Fitness Studio', channel: 'Facebook', contact: 'Tom Hughes (Messenger)', need: 'a CRM to follow up trial members', budget: 900, timeline: 'Next month', message: 'We get loads of free trial sign-ups but never follow them up properly.', receivedAt: d(-2, 14, 10), status: 'replied', score: 60, lastReplyAt: d(-2, 14, 11), thread: [{ from: 'them', text: 'We get loads of free trial sign-ups but never follow them up properly.', at: d(-2, 14, 10) }, { from: 'auto', text: 'Hi Tom! 👋 Thanks for getting in touch…', at: d(-2, 14, 11) }] },
      { id: uid('l'), name: 'Sarah Cole', business: 'Cole & Co Accountants', channel: 'Email', contact: 'sarah@coleandco.co.uk', need: 'automating client onboarding', budget: 500, timeline: 'No rush', message: 'Interested in automating our onboarding emails at some point.', receivedAt: d(-40, 11), status: 'cold', score: 40, lastReplyAt: d(-38, 11), thread: [{ from: 'them', text: 'Interested in automating our onboarding emails at some point.', at: d(-40, 11) }, { from: 'auto', text: 'Hi Sarah! 👋 Thanks for getting in touch…', at: d(-40, 11, 1) }] },
    ],
    deals: [
      { id: uid('dl'), client: 'Bloom Aesthetics', contact: 'Chloe Bennett', email: 'chloe@bloomaesthetics.co.uk', want: 'AI auto-responder plus WhatsApp booking for the clinic', budget: 1500, deadline: day(21), stage: 'new', quote: [], draft: '', lastContactAt: d(-1), followUps: 0, contract: { status: 'none', value: 0 }, createdAt: d(-1) },
      { id: uid('dl'), client: 'Northside Barbers', contact: 'Ryan Okafor', email: 'ryan@northsidebarbers.co.uk', want: 'WhatsApp booking assistant', budget: 600, deadline: day(14), stage: 'sent', quote: [{ item: 'WhatsApp booking assistant', price: 600 }], draft: 'Hi Ryan,\n\nGreat speaking earlier. As promised, here’s the quote for the WhatsApp booking assistant: £600, live within 7 days.\n\nShall I lock in a start date?\n\nBest,\nCallum', lastContactAt: d(-6), followUps: 0, contract: { status: 'none', value: 0 }, createdAt: d(-9) },
      { id: uid('dl'), client: 'Harbour Dental', contact: 'Dr Amir Khan', email: 'amir@harbourdental.co.uk', want: 'Website rebuild and CRM', budget: 2500, deadline: day(40), stage: 'won', quote: [{ item: 'Website (5 pages, booking built in)', price: 1500 }, { item: 'CRM setup & lead capture', price: 900 }], draft: '', lastContactAt: d(-1), followUps: 0, contract: { status: 'received', value: 2400 }, createdAt: d(-15) },
      { id: uid('dl'), client: 'Swift Plumbing & Heating', contact: 'Gary Swift', email: 'gary@swiftplumbing.co.uk', want: 'Content pack for TikTok', budget: 450, deadline: day(10), stage: 'won', quote: [{ item: 'Content pack – 12 short-form scripts', price: 450 }], draft: '', lastContactAt: d(-3), followUps: 0, contract: { status: 'signed', value: 450 }, createdAt: d(-12) },
      { id: uid('dl'), client: 'The Coffee Loft', contact: 'Ellie Ward', email: 'ellie@thecoffeeloft.co.uk', want: 'Loyalty texts and review requests', budget: 750, deadline: day(30), stage: 'sent', quote: [{ item: 'AI auto-responder (WhatsApp, Instagram, email)', price: 750 }], draft: 'Hi Ellie,\n\nQuote attached for the loyalty texts and review requests – £750 all in.\n\nBest,\nCallum', lastContactAt: d(-11), followUps: 1, contract: { status: 'none', value: 0 }, createdAt: d(-16) },
    ],
    projects: [
      { id: uid('p'), client: 'Swift Plumbing & Heating', title: 'TikTok content pack', value: 450, stage: 'Signed', due: day(10), kickoff: '', notes: '12 scripts – emergency call-outs, boiler tips, team life.' },
      { id: uid('p'), client: 'Peak Fitness Studio', title: 'Trial follow-up automations', value: 900, stage: 'Building', due: day(4), kickoff: day(-10), notes: 'SMS + email sequence for free-trial sign-ups.' },
      { id: uid('p'), client: 'Glow Skin Clinic', title: 'Instagram auto-responder', value: 750, stage: 'Review', due: day(2), kickoff: day(-12), notes: 'Client reviewing tone of the replies.' },
      { id: uid('p'), client: 'Luxe Lash Studio', title: 'Website refresh', value: 1500, stage: 'Building', due: day(-2), kickoff: day(-25), notes: 'Waiting on new photos from the client.' },
      { id: uid('p'), client: 'Bright Smiles Nursery', title: 'Parent enquiries chatbot', value: 750, stage: 'Live', due: day(-8), kickoff: day(-30), notes: 'Live and answering 30+ enquiries a week.' },
    ],
    scripts: [
      { id: uid('s'), title: 'Missed calls cost you jobs', client: 'CM Automations', platform: 'TikTok', postBy: day(1), status: 'brief', hook: '', body: '', cta: '' },
      { id: uid('s'), title: 'Your DMs are a lead goldmine', client: 'CM Automations', platform: 'Instagram Reels', postBy: day(3), status: 'drafted', hook: 'You’ve got 40 unread DMs. That’s 40 people who wanted to pay you.', body: 'Most small businesses lose half their leads in the inbox. Not because they’re bad at sales – because they’re busy doing the actual work. An AI auto-responder answers in seconds, asks the right questions and books them in while you’re on the tools.', cta: 'Comment “INBOX” and I’ll show you how it works for your business.' },
      { id: uid('s'), title: 'Boiler pressure in 20 seconds', client: 'Swift Plumbing & Heating', platform: 'TikTok', postBy: day(5), status: 'approved', hook: 'Boiler lost pressure? Don’t call anyone yet.', body: 'Find the filling loop under the boiler, open both valves slowly until the gauge hits 1.5 bar, then close them. Done.', cta: 'Still not working? Message Swift – we’re out within the hour.' },
    ],
    invoices: [
      { id: uid('i'), number: 'INV-1041', client: 'Bright Smiles Nursery', title: 'Parent enquiries chatbot', amount: 750, issued: day(-30), due: day(-16), status: 'paid', paidAt: d(-15), chases: [] },
      { id: uid('i'), number: 'INV-1042', client: 'Peak Fitness Studio', title: 'Deposit – trial follow-up automations', amount: 450, issued: day(-12), due: day(-5), status: 'paid', paidAt: d(-1, 9), chases: [] },
      { id: uid('i'), number: 'INV-1043', client: 'Glow Skin Clinic', title: 'Instagram auto-responder', amount: 750, issued: day(-20), due: day(-9), status: 'overdue', chases: [{ at: d(-8), step: 'friendly' }] },
      { id: uid('i'), number: 'INV-1044', client: 'Luxe Lash Studio', title: 'Website refresh – deposit', amount: 750, issued: day(-26), due: day(-23), status: 'overdue', chases: [{ at: d(-22), step: 'friendly' }, { at: d(-16), step: 'firmer' }, { at: d(-9), step: 'final' }] },
      { id: uid('i'), number: 'INV-1045', client: 'Swift Plumbing & Heating', title: 'Monthly care plan – November', amount: 297, issued: day(-3), due: day(11), status: 'sent', chases: [] },
      { id: uid('i'), number: 'INV-1046', client: 'Northside Barbers', title: 'Automation audit', amount: 250, issued: day(-40), due: day(-33), status: 'paid', paidAt: d(-34), chases: [] },
      { id: uid('i'), number: 'INV-1047', client: 'Swift Plumbing & Heating', title: 'Missed-call text-back system', amount: 1200, issued: day(-45), due: day(-38), status: 'paid', paidAt: d(-39), chases: [] },
      { id: uid('i'), number: 'INV-1048', client: 'Harbour Dental', title: 'Automation audit', amount: 250, issued: day(-18), due: day(-11), status: 'paid', paidAt: d(-12), chases: [] },
      { id: uid('i'), number: 'INV-1049', client: 'Swift Plumbing & Heating', title: 'Monthly care plan – October', amount: 297, issued: day(-33), due: day(-19), status: 'paid', paidAt: d(-20), chases: [] },
    ],
    clients: [
      { id: uid('c'), name: 'Swift Plumbing & Heating', contact: 'Gary Swift', email: 'gary@swiftplumbing.co.uk', phone: '+44 7700 900101', since: day(-180), services: 'Missed-call text-back, care plan, content', retainer: 297, rebookDue: day(40), notes: 'Loves the missed-call system – ask for a video testimonial.' },
      { id: uid('c'), name: 'Bright Smiles Nursery', contact: 'Hannah Lee', email: 'hannah@brightsmiles.co.uk', phone: '+44 7700 900202', since: day(-40), services: 'Parent enquiries chatbot', retainer: 0, rebookDue: day(6), notes: 'Ready for a care plan once the chatbot has been live a month.' },
      { id: uid('c'), name: 'Northside Barbers', contact: 'Ryan Okafor', email: 'ryan@northsidebarbers.co.uk', phone: '+44 7700 900303', since: day(-45), services: 'Automation audit', retainer: 0, rebookDue: day(20), notes: '' },
      { id: uid('c'), name: 'Glow Skin Clinic', contact: 'Priya Shah', email: 'priya@glowskin.co.uk', phone: '+44 7700 900412', since: day(-20), services: 'Instagram auto-responder', retainer: 0, rebookDue: day(60), notes: 'Slow payer – keep an eye on invoices.' },
      { id: uid('c'), name: 'Peak Fitness Studio', contact: 'Tom Hughes', email: 'tom@peakfitness.co.uk', phone: '+44 7700 900505', since: day(-12), services: 'Trial follow-up automations', retainer: 0, rebookDue: day(45), notes: '' },
    ],
    events: [
      { id: uid('e'), date: day(1), type: 'Call', title: 'Discovery call – Bloom Aesthetics', detail: '15 mins on Zoom' },
      { id: uid('e'), date: day(2), type: 'Go live', title: 'Glow Skin Clinic', detail: 'Instagram auto-responder switches on' },
      { id: uid('e'), date: day(3), type: 'Meeting', title: 'Networking breakfast', detail: 'Chamber of Commerce, 7:30am' },
    ],
    results: seedResults(),
    approvals: [],
    activity: [
      { id: uid('a'), from: 'deals', to: 'projects', text: 'Swift Plumbing signed the content pack (£450) – over to you', at: d(-3, 16) },
      { id: uid('a'), from: 'projects', to: 'scripts', text: 'Swift Plumbing content pack is signed – 12 scripts needed', at: d(-3, 16, 5) },
    ],
    updates: {},
    meta: { lastRunDate: '', createdAt: new Date().toISOString() },
  };
}

// ── Results: client goals and the daily actions that get them there ─────────
function rng(seed) { let x = seed; return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; }; }

function buildLog(actions, startDaysAgo, rate, { quietLast = 0, todayDone = 0, seed = 1 } = {}) {
  const rand = rng(seed);
  const log = {};
  for (let ago = startDaysAgo; ago >= 0; ago--) {
    const date = day(-ago);
    const month = Math.min(6, Math.floor((startDaysAgo - ago) / 30) + 1);
    const active = actions.filter((a) => a.fromMonth <= month && month <= a.toMonth);
    let done;
    if (ago === 0) done = active.slice(0, todayDone);
    else if (ago <= quietLast) done = [];
    else done = active.filter(() => rand() < rate);
    if (done.length) log[date] = done.map((a) => a.id);
  }
  return log;
}

export function newResult(client = '') {
  return {
    id: `res_${Date.now().toString(36)}`, client, contact: '', metric: 'Monthly revenue', unit: '£',
    baseline: 0, goal: 0, stretch: 0, startDate: day(0), months: 6,
    chain: { us: '', brand: '', customers: '' },
    actions: [
      { id: `act_${Date.now().toString(36)}a`, title: 'Reply to every new enquiry within 5 minutes', fromMonth: 1, toMonth: 6 },
      { id: `act_${Date.now().toString(36)}b`, title: 'Post 1 piece of content', fromMonth: 1, toMonth: 6 },
      { id: `act_${Date.now().toString(36)}c`, title: 'Follow up 3 warm leads or open quotes', fromMonth: 1, toMonth: 6 },
    ],
    log: {}, checkins: [], wins: [], milestoneNotes: {},
  };
}

export function seedResults() {
  const swiftActions = [
    { id: 'a_sw1', title: 'Reply to every enquiry within 5 minutes (auto-responder on)', fromMonth: 1, toMonth: 6 },
    { id: 'a_sw2', title: 'Post 1 short video (TikTok / Reels)', fromMonth: 1, toMonth: 6 },
    { id: 'a_sw3', title: 'Ask 2 happy customers for a Google review', fromMonth: 1, toMonth: 6 },
    { id: 'a_sw4', title: 'Call back every missed call before 6pm', fromMonth: 1, toMonth: 6 },
    { id: 'a_sw5', title: 'Follow up 3 open quotes', fromMonth: 2, toMonth: 6 },
    { id: 'a_sw6', title: 'Pitch 1 commercial contract (landlords, letting agents)', fromMonth: 4, toMonth: 6 },
  ];
  const glowActions = [
    { id: 'a_gl1', title: 'Reply to Instagram DMs within 10 minutes', fromMonth: 1, toMonth: 6 },
    { id: 'a_gl2', title: 'Post 1 before & after (with consent)', fromMonth: 1, toMonth: 6 },
    { id: 'a_gl3', title: 'Text yesterday’s clients aftercare + a rebook link', fromMonth: 1, toMonth: 6 },
    { id: 'a_gl4', title: 'Offer 1 client a treatment course', fromMonth: 2, toMonth: 6 },
  ];
  const peakActions = [
    { id: 'a_pk1', title: 'Text every new free-trial sign-up within 1 hour', fromMonth: 1, toMonth: 6 },
    { id: 'a_pk2', title: 'Book trial members a goal-setting session', fromMonth: 1, toMonth: 6 },
    { id: 'a_pk3', title: 'Post 1 member transformation story', fromMonth: 1, toMonth: 6 },
    { id: 'a_pk4', title: 'Check in with members who missed 2 sessions', fromMonth: 1, toMonth: 6 },
  ];
  return [
    {
      id: 'res_swift', client: 'Swift Plumbing & Heating', contact: 'Gary Swift', metric: 'Monthly revenue', unit: '£',
      baseline: 20000, goal: 50000, stretch: 100000, startDate: day(-150), months: 6,
      chain: {
        us: 'Missed-call text-back, WhatsApp booking, review requests and 12 videos a month – so no enquiry goes cold.',
        brand: 'From £20k to £50k–£100k a month by adding 2 vans and taking on commercial contracts.',
        customers: 'Homeowners get a reply in minutes and an engineer the same day – no more waiting in the cold for a boiler fix.',
      },
      actions: swiftActions,
      log: buildLog(swiftActions, 150, 0.82, { todayDone: 2, seed: 7 }),
      checkins: [
        { id: 'ck1', date: day(-120), value: 23500, note: 'Missed-call text-back live – 31 jobs saved' },
        { id: 'ck2', date: day(-90), value: 28200, note: 'Google reviews up from 41 to 96' },
        { id: 'ck3', date: day(-60), value: 33900, note: 'Second van on the road' },
        { id: 'ck4', date: day(-30), value: 39600, note: 'First letting-agent contract' },
        { id: 'ck5', date: day(-2), value: 46200, note: 'Best month ever – boiler season' },
      ],
      wins: [
        { id: 'w1', date: day(-95), text: 'First £30k month' },
        { id: 'w2', date: day(-33), text: 'Signed Harbour Lettings – 40 properties on contract' },
        { id: 'w3', date: day(-9), text: '150th five-star Google review' },
        { id: 'w4', date: day(-3), text: 'TikTok boiler-pressure video hit 210k views – 14 enquiries' },
      ],
      milestoneNotes: {},
    },
    {
      id: 'res_glow', client: 'Glow Skin Clinic', contact: 'Priya Shah', metric: 'Monthly revenue', unit: '£',
      baseline: 12000, goal: 25000, stretch: 40000, startDate: day(-70), months: 6,
      chain: {
        us: 'Instagram auto-responder, rebooking reminders and a treatment-course offer.',
        brand: 'From £12k to £25k a month by keeping the diary full and selling courses, not one-offs.',
        customers: 'Clients get an answer at midnight, a slot that suits them and a proper plan for their skin.',
      },
      actions: glowActions,
      log: buildLog(glowActions, 70, 0.55, { quietLast: 3, seed: 21 }),
      checkins: [
        { id: 'ck6', date: day(-40), value: 13100, note: 'Auto-responder live, still tweaking tone' },
        { id: 'ck7', date: day(-10), value: 14200, note: 'Courses not being offered consistently' },
      ],
      wins: [{ id: 'w5', date: day(-25), text: 'Diary fully booked on Saturdays for the first time' }],
      milestoneNotes: {},
    },
    {
      id: 'res_peak', client: 'Peak Fitness Studio', contact: 'Tom Hughes', metric: 'Monthly revenue', unit: '£',
      baseline: 8000, goal: 20000, stretch: 30000, startDate: day(-18), months: 6,
      chain: {
        us: 'Free-trial follow-up texts and emails, plus a goal-setting booking flow.',
        brand: 'From £8k to £20k a month by turning 1 in 2 free trials into members.',
        customers: 'New members get a coach who checks in, a clear goal and a reason to keep turning up.',
      },
      actions: peakActions,
      log: buildLog(peakActions, 18, 0.86, { todayDone: 1, seed: 3 }),
      checkins: [],
      wins: [{ id: 'w6', date: day(-4), text: '9 trial members converted in week 2' }],
      milestoneNotes: {},
    },
  ];
}

/** A clean slate: your agents, rate card and settings, with no demo records. */
export function emptyState(from) {
  const base = from || seedState();
  return {
    ...base,
    leads: [], deals: [], projects: [], scripts: [], invoices: [], clients: [], events: [], results: [],
    approvals: [], activity: [], updates: {}, meta: { lastRunDate: '', createdAt: new Date().toISOString() },
  };
}

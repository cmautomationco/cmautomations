// The Automations presentation: a step-by-step walkthrough to show a client –
// from the first conversation about their problems, through designing,
// building and training, to the results. Every slide has presenter notes, and
// many link to the live part of the system they describe.
import { get } from '../api.js';
import { state } from '../app.js';
import { h, icon, mount, toast } from '../ui.js';

// *text* in a title is shown in blue.
const SLIDES = [
  // ── Opening ──
  {
    chapter: 'Welcome', kind: 'cover',
    title: 'Less admin. *Less stress.* More done.',
    subtitle: 'How AI and automation take the routine work off your team, so everyone can focus on the work that matters and go home on time.',
    notes: 'Open by asking what a good week looks like for them. Keep it about their business, not the technology. This presentation takes about 25 minutes; the examples section can be shortened.',
  },
  {
    chapter: 'Welcome', kind: 'points', eyebrow: 'What we’ll cover',
    title: 'From *your problems* to a system that solves them',
    points: [
      ['flag', 'The problem', 'Where the time and stress really go in a normal week.'],
      ['users', 'The onboarding journey', 'The 8 steps we take together, from first call to go-live.'],
      ['zap', 'How it works', 'The simple rule behind every automation, and the AI on top.'],
      ['sparkles', 'Real examples', 'Automated systems you can see working in this system today.'],
      ['heart', 'Your people', 'Why your team feels less pressure, not more.'],
      ['trend', 'Results', 'How we measure time saved and keep improving.'],
    ],
    notes: 'Set expectations: by the end they should know exactly what happens, who does what, and what changes for their staff.',
  },

  // ── Chapter 1: the problem ──
  {
    chapter: 'The problem', kind: 'points', eyebrow: 'Chapter 1 · The problem',
    title: 'Where the day *actually* goes',
    intro: 'Most businesses don’t have a people problem. They have a “too many small jobs” problem. Each one only takes a few minutes, but together they fill the day.',
    points: [
      ['users', 'Chasing leads', 'Remembering who to call back, and when.'],
      ['send', 'Repeating messages', 'The same welcome, reminder and “just checking in” notes.'],
      ['edit', 'Copying information', 'From emails into spreadsheets, from one tool into another.'],
      ['calendar', 'Content admin', 'Working out what to post, then remembering to post it.'],
      ['clock', 'Reminders and deadlines', 'Holding everything in your head so nothing slips.'],
      ['chat', 'Answering the same questions', '“Where do I find…?” “How do I…?” – interrupting the owner all day.'],
    ],
    notes: 'Ask them to name their top three from this list. Write them down – they become the first automations in step 3. Use their words from now on.',
  },
  {
    chapter: 'The problem', kind: 'compare', eyebrow: 'Chapter 1 · The problem',
    title: 'The hidden cost is *on people*',
    beforeLabel: 'What it feels like now', afterLabel: 'What it costs the business',
    before: ['Always busy, never finished', 'Worried something has been missed', 'Interrupted every few minutes', 'Staying late to catch up on admin', 'The owner is the bottleneck for every answer'],
    after: ['Leads go cold because nobody followed up', 'New clients get a slow, patchy start', 'Good staff burn out or leave', 'Mistakes from rushing and copying', 'No time to grow – only to keep up'],
    notes: 'This is the emotional core. The owner wants staff to feel no stress or pressure at work. Say it plainly: the goal is a calmer team, and the time saving is how we get there.',
  },

  // ── Chapter 2: the change ──
  {
    chapter: 'The change', kind: 'compare', eyebrow: 'Chapter 2 · What changes',
    title: 'Before and *after* automation',
    beforeLabel: 'Before', afterLabel: 'After',
    before: ['A new lead emails in and waits until someone notices', 'Onboarding depends on who remembers the checklist', 'Posts go out when someone finds time', 'Problems sit in inboxes', 'Everyone asks the owner'],
    after: ['A welcome-call task and follow-up date are set the moment the lead arrives', 'Winning a deal starts the same 5-step onboarding every time', 'Content is planned, finalised by you, then published automatically', 'Problems go to the Help Desk, get an owner and a response time', 'The assistant answers and takes people to the right screen'],
    notes: 'Each “after” line is a real automation in this system – you can show any of them live in chapter 5.',
  },

  // ── Chapter 3: onboarding journey ──
  {
    chapter: 'Onboarding journey', kind: 'timeline', eyebrow: 'Chapter 3 · The onboarding journey',
    title: 'Eight steps from *first call* to results',
    steps: [
      ['1', 'Discovery call', 'Week 1'], ['2', 'Time & task audit', 'Week 1'], ['3', 'Choose quick wins', 'Week 1'], ['4', 'Design the system', 'Week 2'],
      ['5', 'Build & connect', 'Week 2–3'], ['6', 'Train the team', 'Week 3'], ['7', 'Go live with support', 'Week 4'], ['8', 'Measure & improve', 'Monthly'],
    ],
    notes: 'Typical timings for a small business. Bigger teams take longer in steps 2, 5 and 6. Nothing goes live until the client has signed off the design in step 4.',
  },
  {
    chapter: 'Onboarding journey', kind: 'step', step: 1, eyebrow: 'Step 1 of 8',
    title: 'Discovery call: *what does a great week look like?*',
    what: 'A relaxed 45-minute conversation with the owner (and ideally one team member) about goals, frustrations and what “less stress” would mean for them.',
    client: ['Share what’s working and what isn’t', 'Name the jobs everyone dreads', 'Say what success looks like in 90 days'],
    us: ['Listen and take notes in their words', 'Explain how automation could help – no jargon', 'Set up their business in the system so they can see it'],
    deliverable: 'A one-page summary of goals, pains and success measures.',
    notes: 'Good questions: “What do you do every week that you wish someone else did?” “When did something last slip through the cracks?” “What do your staff complain about?”',
  },
  {
    chapter: 'Onboarding journey', kind: 'table', step: 2, eyebrow: 'Step 2 of 8',
    title: 'Time & task audit: *find the repetitive work*',
    intro: 'For one week, the team notes every repetitive job. We score each one by how often it happens, how long it takes and how much stress it causes. Example from a coaching business:',
    head: ['Task', 'How often', 'Time each', 'Stress', 'Automate?'],
    rows: [
      ['Calling new leads back', '8 a week', '10 min', 'High – easy to forget', 'Yes'],
      ['Sending the onboarding checklist', '3 a week', '20 min', 'Medium', 'Yes'],
      ['Chasing unanswered proposals', '5 a week', '10 min', 'High – awkward', 'Yes'],
      ['Deciding what to post', 'Daily', '30 min', 'High', 'Ideas: yes · Final post: you'],
      ['Weekly pipeline review prep', 'Weekly', '45 min', 'Low', 'Partly'],
      ['Client strategy sessions', '10 a week', '60 min', 'Low – the real work', 'No – that’s you'],
    ],
    notes: 'Make the point that we never automate the valuable human work (the last row). We automate the admin around it.',
  },
  {
    chapter: 'Onboarding journey', kind: 'matrix', step: 3, eyebrow: 'Step 3 of 8',
    title: 'Choose *quick wins* first',
    intro: 'We plot each task by impact and effort, and start top-left: big relief, easy to set up. Early wins build trust before bigger changes.',
    quadrants: [
      ['Quick wins – do first', ['New lead follow-up', 'Proposal chaser', 'Overdue reminders', 'Morning briefing']],
      ['Big projects – plan next', ['Content pipeline', 'Client onboarding', 'Help Desk for client issues']],
      ['Nice to have', ['Kudos & team wins', 'Recurring report tasks']],
      ['Leave for now', ['Anything rarely done', 'Anything that needs a personal touch']],
    ],
    notes: 'Agree 3–5 quick wins with the owner. Most of these are already switched on as ready-made recipes – it is often a case of reviewing and tuning, not building from scratch.',
  },
  {
    chapter: 'Onboarding journey', kind: 'step', step: 4, eyebrow: 'Step 4 of 8',
    title: 'Design the system: *every rule on one page*',
    what: 'Each automation is written as a simple sentence – WHEN something happens, IF it matches, THEN do this – so the owner can read and approve it without any technical knowledge.',
    client: ['Check each rule makes sense for how they work', 'Decide who owns which tasks', 'Sign off before anything goes live'],
    us: ['Map each quick win as a WHEN → IF → THEN rule', 'Write the messages and task wording in their voice', 'Agree response times for issues'],
    deliverable: 'The automation plan, signed off by the owner.',
    flow: { when: 'A new lead is added', if: 'Stage is “lead”', then: ['Create a call task for tomorrow', 'Follow up in 3 days', 'Log it on their timeline'] },
    notes: 'Show a rule in the builder if they’re curious (Automations → Edit). Reassure them: nothing changes until they say yes.',
    live: { label: 'Open the automation builder', hash: '#/automations' },
  },
  {
    chapter: 'Onboarding journey', kind: 'step', step: 5, eyebrow: 'Step 5 of 8',
    title: 'Build & connect: *we do the set-up*',
    what: 'We set the system up around the business: their niche, team, contacts, channels and the automations from the plan. Ready-made recipes cover most needs; custom rules cover the rest.',
    client: ['Send their contact list and logins for social channels', 'Add team members (or give us their emails)', 'Answer a few questions about their content'],
    us: ['Configure the business, pillars and brand profile', 'Import contacts and deals', 'Switch on and tune the agreed automations', 'Test every rule with a sample lead, deal and issue'],
    deliverable: 'A working system, tested end to end with their real setup.',
    notes: 'Test runs: Automations → Edit → Test run. Mention that every action is logged, so it’s always clear what the system did and why.',
    live: { label: 'See the activity log', hash: '#/automations' },
  },
  {
    chapter: 'Onboarding journey', kind: 'step', step: 6, eyebrow: 'Step 6 of 8',
    title: 'Train the team: *short, practical, by role*',
    what: 'Short sessions for each role, using their own data. People learn the five things they’ll do every day, not every feature.',
    client: ['Owner: 45 minutes on the dashboard, pipeline and reviewing automations', 'Team: 30 minutes on My day, the CRM and the assistant', 'Content creator: 30 minutes on briefs, finalising and the Academy'],
    us: ['Run each session live in their system', 'Give everyone the built-in walkthrough', 'Show the assistant: “ask it anything, it takes you there”'],
    deliverable: 'Everyone confident with their daily routine, plus a written walkthrough.',
    notes: 'The assistant is the best training tool – show a team member asking “how do I log a call?” and being taken straight there.',
    live: { label: 'Try the assistant (bottom-right)', hash: '#/' },
  },
  {
    chapter: 'Onboarding journey', kind: 'step', step: 7, eyebrow: 'Step 7 of 8',
    title: 'Go live: *with a safety net*',
    what: 'We switch on in stages – usually one team or one area first – and check in daily for the first week so nothing feels unfamiliar or out of control.',
    client: ['Use the system for real work', 'Raise anything odd in the Help Desk (or tell the assistant)', 'Join a 15-minute check-in on days 2 and 5'],
    us: ['Watch the activity log daily in week 1', 'Adjust wording, timings and owners as needed', 'Switch on the next area once the first is settled'],
    deliverable: 'The system running live, with the team comfortable using it.',
    notes: 'Every automation has an on/off switch – if something doesn’t suit them, it can be paused in a second. That reassurance matters.',
    live: { label: 'Open the Help Desk', hash: '#/helpdesk' },
  },
  {
    chapter: 'Onboarding journey', kind: 'step', step: 8, eyebrow: 'Step 8 of 8',
    title: 'Measure & improve: *every month*',
    what: 'A monthly 30-minute review of what the system did, how much time it saved, and what people struggled with – then we add the next automations.',
    client: ['Share what still feels manual or stressful', 'Approve the next improvements'],
    us: ['Review time saved and the activity log', 'Check what people asked the assistant, and what it couldn’t answer', 'Add or tune automations based on real use'],
    deliverable: 'A short monthly report and the next set of improvements.',
    notes: 'The Help Desk shows “What people ask the assistant” – frequent questions are clues to the next thing to automate or explain.',
    live: { label: 'See what people ask', hash: '#/helpdesk' },
  },

  // ── Chapter 4: how it works ──
  {
    chapter: 'How it works', kind: 'how', eyebrow: 'Chapter 4 · How it works',
    title: 'One simple rule *runs everything*',
    parts: [
      ['WHEN', 'when', 'Something happens', ['A lead is added', 'A deal is won', 'A task is overdue', 'An issue is raised', 'Every morning']],
      ['IF', 'if', 'It matches (optional)', ['The deal is over £5,000', 'The lead came from Instagram', 'The issue is urgent']],
      ['THEN', 'then', 'The system does the work', ['Creates a task', 'Notifies the right person', 'Updates the contact', 'Sets a follow-up', 'Logs it', 'Sends to another app']],
    ],
    notes: 'This is the only concept they need. Everything in the system – follow-ups, onboarding, publishing, escalations – is one of these rules.',
    live: { label: 'See the automations', hash: '#/automations' },
  },
  {
    chapter: 'How it works', kind: 'points', eyebrow: 'Chapter 4 · How it works',
    title: 'Where the *AI* comes in',
    intro: 'Automation follows the rules you agree. AI handles the work that needs judgement – but people stay in charge of anything that matters.',
    points: [
      ['chat', 'The assistant', 'Answers questions, finds information and takes people to the screen that solves their problem.'],
      ['wand', 'Content ideas', 'Generates scored ideas and full briefs from your audience, pains and offers.'],
      ['rocket', 'Build Funnel guidance', 'Walks you from idea to launch and drafts your sales page from your answers.'],
      ['check', 'You stay in control', 'You finalise content, approve rules and can switch anything off. Every action is logged.'],
    ],
    notes: 'Address the worry “will AI take over?” directly: it drafts and suggests; people decide. Nothing customer-facing goes out without a person finalising it.',
  },

  // ── Chapter 5: examples ──
  {
    chapter: 'Examples', kind: 'example', eyebrow: 'Example 1 · Never miss a lead',
    title: 'Every new lead gets a *call within a day*',
    problem: 'Enquiries arrive while everyone is busy. By the time someone notices, the lead has gone elsewhere.',
    flow: { when: 'A new lead is added', if: 'Stage is “lead”', then: ['Call task for the owner, due tomorrow', 'Follow-up date in 3 days', 'Note on the contact’s timeline'] },
    result: 'No lead waits, nobody has to remember, and the follow-up happens automatically if they don’t reply.',
    minutes: 7, per: 'per new lead',
    notes: 'Live demo: ask the assistant “add a lead called Sam Jones”, save it, then show the new task in My day.',
    live: { label: 'Add a lead and watch it happen', hash: '#/crm/contacts?new=1' },
  },
  {
    chapter: 'Examples', kind: 'example', eyebrow: 'Example 2 · Proposals that don’t go quiet',
    title: 'Proposals are *chased for you*',
    problem: 'Chasing a proposal feels awkward, so it gets put off – and deals stall.',
    flow: { when: 'A deal moves to Proposal', then: ['Chase-up task in 3 days', 'Contact marked as a prospect'] },
    result: 'Every proposal is followed up on time, without anyone having to remember or feel awkward about it.',
    minutes: 4, per: 'per proposal',
    notes: 'Live demo: drag a deal into Proposal on the pipeline and show the toast and the new task.',
    live: { label: 'Open the pipeline', hash: '#/crm/pipeline' },
  },
  {
    chapter: 'Examples', kind: 'example', eyebrow: 'Example 3 · Onboarding on autopilot',
    title: 'Win a client, and *onboarding starts itself*',
    problem: 'Each new client gets a slightly different start, depending on who’s busy and who remembers.',
    flow: { when: 'A deal is won', then: ['Contact becomes a customer', 'Onboarding task with a 5-step checklist', 'The whole team is told'] },
    result: 'Every client gets the same great first week, and the team celebrates the win together.',
    minutes: 5, per: 'per new client',
    notes: 'Point out the morale side: everyone sees the win in their notifications and on the dashboard’s Team wins.',
    live: { label: 'Open the pipeline', hash: '#/crm/pipeline' },
  },
  {
    chapter: 'Examples', kind: 'example', eyebrow: 'Example 4 · Content without the daily stress',
    title: 'Content is *planned, briefed and published*',
    problem: 'Every day starts with “what do I post?”, and posts go out late or not at all.',
    flow: { when: 'You finalise a piece of content', then: ['Admins told it’s ready', 'Published at the scheduled time', 'If it fails: retried, then an urgent fix task'] },
    result: 'You only do the creative part – choosing ideas and adding your voice. Planning, reminders and publishing are handled.',
    minutes: 6, per: 'per post',
    notes: 'Show the Idea Lab (Generate ideas), a creation brief, then the calendar.',
    live: { label: 'Open the Idea Lab', hash: '#/content/ideas' },
  },
  {
    chapter: 'Examples', kind: 'example', eyebrow: 'Example 5 · A calm start to every day',
    title: 'Everyone starts the day *knowing their priorities*',
    problem: 'People start the day by digging through emails and lists to work out what matters.',
    flow: { when: 'Every morning', then: ['Each person gets their plan: tasks due, follow-ups, posts going out', 'Overdue tasks get a gentle reminder to the owner of the task'] },
    result: 'A clear, short list each morning – no hunting, no surprises, no one left wondering.',
    minutes: 10, per: 'per day',
    notes: 'Open My day to show what a team member sees. The reminders go to the person themselves first – not a manager – which keeps it supportive.',
    live: { label: 'Open My day', hash: '#/tasks/today' },
  },
  {
    chapter: 'Examples', kind: 'example', eyebrow: 'Example 6 · Problems never slip',
    title: 'Every problem has an *owner and a deadline*',
    problem: 'Client complaints and internal problems get lost in inboxes and chats until they become serious.',
    flow: { when: 'An issue is raised', if: 'It’s high or urgent', then: ['Assigned to the right person with a response target', 'Admins alerted straight away', 'If the target is missed: escalated', 'When fixed: the person who raised it is told'] },
    result: 'Nothing sits unnoticed, and the person who raised it always hears back.',
    minutes: 3, per: 'per issue',
    notes: 'Show the Help Desk, then ask the assistant “Report a problem: customers can’t pay on the booking page” and show it appear as urgent.',
    live: { label: 'Open the Help Desk', hash: '#/helpdesk' },
  },
  {
    chapter: 'Examples', kind: 'example', eyebrow: 'Example 7 · Fewer interruptions for the owner',
    title: 'Staff get *answers without waiting*',
    problem: 'Every “how do I…?” question goes to the owner, breaking their focus dozens of times a day.',
    flow: { when: 'Someone asks the assistant', then: ['Answers from the business’s own data', 'Opens the right screen and points at the button', 'Logs it as an issue if a person is needed'] },
    result: 'Staff feel confident working independently, and the owner gets their focus back.',
    minutes: 5, per: 'per question',
    notes: 'Let them try it themselves: “What’s overdue?”, “How do I add a lead?”, “Remind me to call Emma tomorrow”.',
    live: { label: 'Open the assistant (bottom-right)', hash: '#/' },
  },
  {
    chapter: 'Examples', kind: 'example', eyebrow: 'Example 8 · Trades: never miss a job',
    title: 'Every missed call gets a *text back in seconds*',
    problem: 'A plumber under a sink or an electrician up a ladder can’t answer. The caller rings the next name on Google.',
    flow: { when: 'A call to the business number isn’t answered', then: ['Caller texted (or WhatsApped) back with the booking link', 'Call-back task + alert to the owner’s phone', 'Messages saying “leak” or “no power” flagged 🚨 to everyone'] },
    result: 'The customer hears back before they ring anyone else, and every enquiry is on someone’s list until it’s answered.',
    minutes: 4, per: 'per missed call',
    notes: 'Switch to Swift Plumbing & Heating, open Messages and press “Test a missed call”, then “Test an incoming WhatsApp” with the Leak preset. Show the alert under “Sent to your phone”.',
    live: { label: 'Open Messages', hash: '#/messages' },
  },
  {
    chapter: 'Examples', kind: 'example', eyebrow: 'Example 9 · Fewer no-shows',
    title: 'Bookings that *remind themselves*',
    problem: 'Customers forget appointments, and every no-show is a wasted slot and a wasted journey.',
    flow: { when: 'A booking is made (online, by phone or WhatsApp)', then: ['Confirmation straight away', 'Reminder the day before and 2 hours before – reply C to confirm, R to rearrange', 'Job done: invoice drafted and review request sent'] },
    result: 'Customers turn up, the diary fills itself from the booking link, and the team gets a job sheet every morning.',
    minutes: 10, per: 'per booking',
    notes: 'Open Bookings, copy the booking link and book as a customer in another tab. Then show Today’s jobs with “On my way” and Done.',
    live: { label: 'Open Bookings', hash: '#/bookings' },
  },
  {
    chapter: 'Examples', kind: 'example', eyebrow: 'Example 10 · Get paid on time',
    title: 'Invoices are *chased for you*',
    problem: 'Chasing money is awkward, so it gets left – and cash flow suffers.',
    flow: { when: 'An invoice passes its due date', then: ['Friendly reminder with a pay-by-card link', 'Firmer reminder a week later', 'After two weeks: a task for a person to call'] },
    result: 'Most invoices are paid after the first reminder, without anyone writing an awkward email.',
    minutes: 8, per: 'per overdue invoice',
    notes: 'Open Quotes & invoices: show Lucy’s overdue invoice, open the customer view and pay it with the test card.',
    live: { label: 'Open Quotes & invoices', hash: '#/invoices' },
  },
  {
    chapter: 'Examples', kind: 'niches', eyebrow: 'Same engine, any business',
    title: 'Examples for *different kinds of business*',
    items: [
      ['Salon & beauty', 'Treatment finished', 'Aftercare tips task + review request in 2 days'],
      ['Trades', 'Missed call or WhatsApp', 'Texted back in seconds, call-back task, 🚨 alert for emergencies'],
      ['Coaching', 'Discovery call booked', 'Prep task the day before + welcome pack after'],
      ['E-commerce', 'Customer complaint', 'Urgent Help Desk issue + reply within 4 hours'],
      ['Hospitality', 'Event booked', 'Staffing task + reminder post the week before'],
      ['Agency', 'Project won', 'Kick-off checklist, shared folder task, team notified'],
    ],
    notes: 'Pick the one closest to the client’s niche and build it live in the automation builder if there’s time. Booking, quote and message examples run fully automatically with the Bookings, Quotes & invoices and Messages tools.',
    live: { label: 'Build one now', hash: '#/automations' },
  },

  // ── Chapter 6: people ──
  {
    chapter: 'Your people', kind: 'points', eyebrow: 'Chapter 6 · Your people',
    title: 'Built so your team feels *supported, not watched*',
    points: [
      ['check', 'The system remembers', 'Nobody has to hold everything in their head. If it matters, it’s a task with a date.'],
      ['clock', 'Clear priorities', 'Each morning shows what’s due today. Everything else can wait without worry.'],
      ['users', 'Fair workloads', 'The workload view shows who’s overloaded, so work can be shared before anyone struggles.'],
      ['heart', 'Wins are celebrated', 'Won deals and finished tasks show as team wins, and anyone can give kudos.'],
      ['chat', 'Help is always there', 'The assistant answers questions instantly – no need to wait or feel awkward asking.'],
      ['lifebuoy', 'Problems are shared', 'Raise an issue and it’s owned and tracked. Nobody carries a problem alone.'],
    ],
    notes: 'This is what the owner cares about most: staff who don’t feel under pressure. Reminders go to the person first, not to a manager, which keeps the tone supportive rather than policing.',
  },

  // ── Chapter 7: results ──
  {
    chapter: 'Results', kind: 'live', eyebrow: 'Chapter 7 · Results',
    title: 'What this system has done *so far*',
    intro: 'Live figures from this business’s system. Every automated action records a conservative estimate of the minutes it saved.',
    notes: 'These numbers are live. For a new client, show the demo business, then their own figures at the first monthly review.',
    live: { label: 'See the time-saved chart', hash: '#/automations' },
  },
  {
    chapter: 'Results', kind: 'points', eyebrow: 'Chapter 7 · Results',
    title: 'How we *measure success*',
    intro: 'We agree the measures in the discovery call and review them every month.',
    points: [
      ['clock', 'Hours saved each week', 'From the automation log – the headline number.'],
      ['users', 'Leads followed up within a day', 'Every new lead should have a call task within 24 hours.'],
      ['lifebuoy', 'Issues resolved on time', 'Response targets met, and average time to resolve.'],
      ['heart', 'How the team feels', 'A quick monthly check-in: is work calmer? What still feels stressful?'],
    ],
    notes: 'Keep “how the team feels” on the list – it’s the owner’s real goal, and the easiest to forget.',
  },

  // ── Chapter 8: day to day ──
  {
    chapter: 'Using it every day', kind: 'routine', eyebrow: 'Chapter 8 · Using it every day',
    title: 'The daily routine is *short*',
    columns: [
      ['Owner · 10 minutes a day', ['Check the dashboard: time saved, pipeline, team wins', 'Look at urgent Help Desk issues', 'Give kudos for something done well', 'Weekly: 30-minute review of automations and workload']],
      ['Team member · 5 minutes a day', ['Open My day and work from that list', 'Tick tasks off as they’re done', 'Log calls on the contact – follow-ups are set for you', 'Stuck? Ask the assistant']],
      ['Content · 2 hours a week', ['Generate and shortlist ideas', 'Write your final versions from the briefs', 'Finalise and schedule – publishing is automatic']],
    ],
    notes: 'Stress how little time this takes. The system does the remembering; people just do the work in front of them.',
  },

  // ── Close ──
  {
    chapter: 'Next steps', kind: 'checklist', eyebrow: 'Next steps',
    title: 'Ready to *get started?*',
    intro: 'Here’s what happens next and what we’ll need from you.',
    items: [
      'Book the discovery call (45 minutes)',
      'Note down repetitive jobs for one week (we’ll send a simple template)',
      'Send your contact list and the social accounts you post to',
      'Tell us who’s on the team and what each person does',
      'Agree your first 3–5 quick wins – live within two to three weeks',
    ],
    closing: 'Less admin. Less stress. More done.',
    notes: 'End by agreeing a date for the discovery call while you’re together.',
  },
];

const CHAPTERS = [...new Set(SLIDES.map((s) => s.chapter))];

function title(text, tag = 'h2', cls = 'pz-title') {
  const parts = String(text).split('*');
  return h(tag, { class: cls }, parts.map((p, i) => (i % 2 ? h('span', { class: 'blue' }, p) : p)));
}

function flowDiagram(flow) {
  return h('div', { class: 'pz-flow' },
    h('div', { class: 'pz-node when' }, h('b', 'WHEN'), flow.when),
    flow.if ? [h('div', { class: 'pz-arrow' }, '↓'), h('div', { class: 'pz-node if' }, h('b', 'IF'), flow.if)] : null,
    h('div', { class: 'pz-arrow' }, '↓'),
    h('div', { class: 'pz-node then' }, h('b', 'THEN'), h('ul', flow.then.map((t) => h('li', t)))));
}

function liveButton(slide) {
  return slide.live ? h('button', { class: 'btn soft sm pz-live', onclick: () => { location.hash = slide.live.hash; } }, icon('send'), slide.live.label) : null;
}

function slideBody(slide, data) {
  switch (slide.kind) {
    case 'cover':
      return h('div', { class: 'pz-cover' },
        h('div', { class: 'brand-mark pz-mark' }, 'CM'),
        h('div', { class: 'eyebrow' }, `Prepared for ${state.me.org.name}`),
        title(slide.title, 'h1', 'pz-title pz-big'),
        h('p', { class: 'pz-lead' }, slide.subtitle),
        h('div', { class: 'row' }, h('span', { class: 'badge blue' }, `${SLIDES.length} slides`), h('span', { class: 'badge' }, 'About 25 minutes'), h('span', { class: 'badge' }, 'Use ← → to move')));
    case 'points':
      return [title(slide.title), slide.intro ? h('p', { class: 'pz-lead' }, slide.intro) : null,
        h('div', { class: `pz-points ${slide.points.length > 4 ? 'three' : ''}` }, slide.points.map(([ic, head, text]) => h('div', { class: 'pz-point' },
          h('div', { class: 'pz-icon' }, icon(ic)), h('div', h('h3', head), h('p', text)))))];
    case 'compare':
      return [title(slide.title), h('div', { class: 'pz-compare' },
        h('div', { class: 'pz-col before' }, h('div', { class: 'pz-col-head' }, slide.beforeLabel), h('ul', slide.before.map((t) => h('li', t)))),
        h('div', { class: 'pz-col after' }, h('div', { class: 'pz-col-head' }, slide.afterLabel), h('ul', slide.after.map((t) => h('li', t)))))];
    case 'timeline':
      return [title(slide.title), h('ol', { class: 'pz-timeline' }, slide.steps.map(([n, label, when]) => h('li',
        h('span', { class: 'pz-step-num' }, n), h('div', h('b', label), h('div', { class: 'small muted' }, when)))))];
    case 'step':
      return [title(slide.title), h('p', { class: 'pz-lead' }, slide.what),
        h('div', { class: `pz-step-grid ${slide.flow ? 'with-flow' : ''}` },
          h('div', { class: 'pz-box' }, h('div', { class: 'pz-col-head' }, 'What you do'), h('ul', slide.client.map((t) => h('li', t)))),
          h('div', { class: 'pz-box' }, h('div', { class: 'pz-col-head' }, 'What we do'), h('ul', slide.us.map((t) => h('li', t)))),
          slide.flow ? h('div', { class: 'pz-box' }, h('div', { class: 'pz-col-head' }, 'Example rule'), flowDiagram(slide.flow)) : null),
        h('div', { class: 'pz-deliverable' }, icon('flag'), h('div', h('b', 'You get: '), slide.deliverable))];
    case 'table':
      return [title(slide.title), h('p', { class: 'pz-lead' }, slide.intro),
        h('div', { class: 'pz-table-wrap' }, h('table', { class: 'table pz-table' },
          h('thead', h('tr', slide.head.map((c) => h('th', c)))),
          h('tbody', slide.rows.map((r) => h('tr', r.map((c, i) => h('td', i === r.length - 1 ? h('b', { class: /^No/.test(c) ? '' : 'blue' }, c) : c)))))))];
    case 'matrix':
      return [title(slide.title), h('p', { class: 'pz-lead' }, slide.intro),
        h('div', { class: 'pz-matrix' }, slide.quadrants.map(([label, items], i) => h('div', { class: `pz-quad q${i}` },
          h('div', { class: 'pz-col-head' }, label), h('ul', items.map((t) => h('li', t)))))),
        h('div', { class: 'pz-axes small muted' }, 'Top = bigger impact · Left = easier to set up')];
    case 'how':
      return [title(slide.title), h('div', { class: 'pz-how' }, slide.parts.map(([word, cls, head, items]) => h('div', { class: `pz-how-col ${cls}` },
        h('div', { class: `pz-node ${cls}` }, h('b', word), head), h('ul', items.map((t) => h('li', t))))))];
    case 'example':
      return [title(slide.title), h('div', { class: 'pz-example' },
        h('div', { class: 'stack' },
          h('div', { class: 'pz-box' }, h('div', { class: 'pz-col-head' }, 'The problem'), h('p', slide.problem)),
          h('div', { class: 'pz-box pz-result' }, h('div', { class: 'pz-col-head' }, 'The result'), h('p', slide.result)),
          h('div', { class: 'pz-saving' }, h('span', { class: 'pz-saving-num' }, `≈ ${slide.minutes} min`), h('span', `saved ${slide.per}`))),
        flowDiagram(slide.flow))];
    case 'niches':
      return [title(slide.title), h('div', { class: 'pz-niches' }, slide.items.map(([niche, when, then]) => h('div', { class: 'pz-niche' },
        h('div', { class: 'eyebrow' }, niche), h('div', { class: 'pz-mini' }, h('b', 'WHEN '), when), h('div', { class: 'pz-mini then' }, h('b', 'THEN '), then))))];
    case 'live': {
      const stat = (value, label) => h('div', { class: 'pz-stat' }, h('div', { class: 'pz-stat-num' }, value), h('div', { class: 'small muted' }, label));
      return [title(slide.title), h('p', { class: 'pz-lead' }, slide.intro),
        data ? h('div', { class: 'pz-stats' },
          stat(`${(data.impact.total_minutes / 60).toFixed(1)} hrs`, 'saved in the last 30 days'),
          stat(String(data.impact.total_runs), 'automated actions in 30 days'),
          stat(`${data.enabled} of ${data.total}`, 'automations switched on'),
          stat(`${((data.impact.total_minutes / 60) / 4.3).toFixed(1)} hrs`, 'saved per week on average'))
          : h('p', { class: 'muted' }, 'Loading live figures…')];
    }
    case 'routine':
      return [title(slide.title), h('div', { class: 'pz-routine' }, slide.columns.map(([head, items]) => h('div', { class: 'pz-box' },
        h('div', { class: 'pz-col-head' }, head), h('ul', items.map((t) => h('li', t))))))];
    case 'checklist':
      return [title(slide.title), h('p', { class: 'pz-lead' }, slide.intro),
        h('ol', { class: 'how pz-checklist' }, slide.items.map((t) => h('li', t))),
        h('div', { class: 'pz-closing' }, slide.closing)];
    default:
      return title(slide.title);
  }
}

let keyHandler = null;

export async function render(el, route) {
  let index = Math.min(Math.max(Number(route.query.s) || 1, 1), SLIDES.length) - 1;
  let showNotes = false;
  let data = null;
  Promise.all([get('/automations/impact'), get('/automations')]).then(([impact, rules]) => {
    data = { impact, enabled: rules.filter((r) => r.enabled).length, total: rules.length };
    if (SLIDES[index].kind === 'live') draw();
  }).catch(() => {});

  const deck = h('section', { class: 'pz-deck', 'aria-roledescription': 'presentation', tabindex: '-1' });

  const go = (i) => {
    index = Math.min(Math.max(i, 0), SLIDES.length - 1);
    try { history.replaceState(null, '', `#/automations/presentation?s=${index + 1}`); } catch { /* history blocked */ }
    draw();
  };

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await deck.requestFullscreen();
    } catch { toast('Full screen isn’t available here – try making the window larger instead.'); }
  };

  function draw() {
    const slide = SLIDES[index];
    const chapterIdx = CHAPTERS.indexOf(slide.chapter);
    mount(deck,
      h('div', { class: 'pz-top' },
        h('div', { class: 'row', style: { gap: '8px', minWidth: 0 } },
          h('a', { href: '#/automations', class: 'small' }, '← Automations'),
          h('span', { class: 'small muted pz-hide-sm' }, '·'),
          h('span', { class: 'small muted pz-hide-sm' }, 'Automation walkthrough')),
        h('div', { class: 'row', style: { gap: '6px' } },
          h('button', { class: `btn sm ${showNotes ? 'soft' : 'ghost'}`, onclick: () => { showNotes = !showNotes; draw(); }, title: 'Show presenter notes (N)' }, icon('edit'), 'Notes'),
          h('button', { class: 'btn sm ghost', onclick: fullscreen, title: 'Present full screen (F)' }, icon('screen'), 'Present'))),
      h('nav', { class: 'pz-chapters', 'aria-label': 'Chapters' }, CHAPTERS.map((c, i) => h('button', {
        class: `pz-chapter ${i === chapterIdx ? 'active' : ''} ${i < chapterIdx ? 'done' : ''}`,
        onclick: () => go(SLIDES.findIndex((s) => s.chapter === c)),
      }, h('span', { class: 'pz-chapter-num' }, i + 1), h('span', { class: 'pz-chapter-label' }, c)))),
      h('div', { class: 'pz-controls' },
        h('button', { class: 'btn', disabled: index === 0, onclick: () => go(index - 1), 'aria-label': 'Previous slide' }, '← Back'),
        h('div', { class: 'pz-progress-wrap' },
          h('div', { class: 'progress' }, h('span', { style: { width: `${((index + 1) / SLIDES.length) * 100}%` } })),
          h('div', { class: 'small muted', style: { textAlign: 'center', marginTop: '4px' } }, `${index + 1} / ${SLIDES.length} · ${slide.chapter}`)),
        index < SLIDES.length - 1
          ? h('button', { class: 'btn primary', onclick: () => go(index + 1), 'aria-label': 'Next slide' }, 'Next →')
          : h('a', { class: 'btn primary', href: '#/automations' }, 'Finish')),
      h('div', { class: `pz-slide kind-${slide.kind}`, role: 'group', 'aria-label': `Slide ${index + 1} of ${SLIDES.length}` },
        slide.eyebrow && slide.kind !== 'cover' ? h('div', { class: 'eyebrow' }, slide.eyebrow) : null,
        slideBody(slide, data),
        liveButton(slide)),
      showNotes ? h('aside', { class: 'pz-notes' }, h('div', { class: 'pz-col-head' }, 'Presenter notes'), h('p', slide.notes)) : null);

  }

  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if (!deck.isConnected) { document.removeEventListener('keydown', keyHandler); keyHandler = null; return; }
    if (e.target.closest?.('input, textarea, select, .as-panel, .modal')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(index + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(index - 1); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(SLIDES.length - 1);
    else if (e.key.toLowerCase() === 'n') { showNotes = !showNotes; draw(); }
    else if (e.key.toLowerCase() === 'f') fullscreen();
  };
  document.addEventListener('keydown', keyHandler);

  // Swipe on phones and tablets.
  let touchX = null;
  deck.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  deck.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 60) go(index + (dx < 0 ? 1 : -1));
  });

  mount(el, deck);
  draw();
}

export const SLIDE_COUNT = SLIDES.length;

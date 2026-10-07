/**
 * What the assistant knows: the places it can take people, and the problems
 * and questions it recognises. Each topic has
 *   keywords  – phrases people use (every word of a phrase must appear, in any order)
 *   answer    – a short, plain-English answer
 *   go        – where to take them, and optionally which button to point at
 *   data      – optional live answer from the business's own data (see engine.js)
 *   admin     – true when only owners/admins can make this change
 *
 * Add a topic here and both the built-in assistant and the AI assistant use it.
 */

export const PLACES = {
  dashboard: { hash: '#/', label: 'Dashboard', words: ['dashboard', 'home', 'overview', 'main page', 'start page'] },
  funnel: { hash: '#/funnel', label: 'Build Funnel', words: ['build funnel', 'funnel', 'builds', 'product build', 'service build'] },
  strategy: { hash: '#/content/strategy', label: 'Content strategy', words: ['content strategy', 'strategy', 'pillars', 'brand profile'] },
  ideas: { hash: '#/content/ideas', label: 'Idea Lab', words: ['idea lab', 'ideas', 'content ideas'] },
  creation: { hash: '#/content/create', label: 'Creation board', words: ['creation', 'creation board', 'drafts'] },
  calendar: { hash: '#/content/calendar', label: 'Content calendar', words: ['calendar', 'content calendar', 'schedule', 'scheduled posts'] },
  academy: { hash: '#/content/academy', label: 'Creation Academy', words: ['academy', 'creation academy', 'lessons', 'training'] },
  content: { hash: '#/content/ideas', label: 'Content Studio', words: ['content studio', 'content'] },
  pipeline: { hash: '#/crm/pipeline', label: 'Sales pipeline', words: ['pipeline', 'deals', 'sales pipeline'] },
  contacts: { hash: '#/crm/contacts', label: 'Contacts', words: ['contacts', 'crm', 'clients', 'customers', 'leads'] },
  tasks: { hash: '#/tasks', label: 'Task board', words: ['tasks', 'task board', 'to do list', 'todo list', 'board'] },
  myday: { hash: '#/tasks/today', label: 'My day', words: ['my day', 'today list'] },
  automations: { hash: '#/automations', label: 'Automations', words: ['automations', 'automation', 'rules', 'workflows'] },
  helpdesk: { hash: '#/helpdesk', label: 'Help Desk', words: ['help desk', 'helpdesk', 'issues', 'tickets', 'support tickets'] },
  settings: { hash: '#/settings', label: 'Settings', words: ['settings', 'account', 'business settings', 'team settings'] },
};

export const TOPICS = [
  // ── Everyday / overview ──
  {
    key: 'today', title: 'What do I need to do today?',
    keywords: ['what do i need to do', 'due today', 'my day', 'for today', 'today’s tasks', 'tasks today', 'what should i do', 'priorities', 'what is next', 'what next', 'to do today', 'what have i got on'],
    data: 'today', go: { place: 'myday' },
  },
  {
    key: 'summary', title: 'How is the business doing?',
    keywords: ['how is the business', 'how are we doing', 'business doing', 'summary', 'report', 'analytics', 'numbers', 'stats', 'performance', 'update me'],
    data: 'summary', go: { place: 'dashboard' },
  },
  {
    key: 'time_saved', title: 'How much time have automations saved?',
    keywords: ['time saved', 'saved time', 'hours saved', 'how much time'],
    data: 'time_saved', go: { place: 'automations' },
  },
  {
    key: 'notifications', title: 'Where are my notifications?',
    keywords: ['notifications', 'alerts', 'messages', 'bell'],
    answer: 'Your notifications are under the bell at the top of the screen. Automations, kudos and Help Desk updates all land there. Use “Mark all read” to clear them.',
  },
  {
    key: 'morale', title: 'Thank a teammate or lift team morale',
    keywords: ['kudos', 'thank', 'thanks to', 'morale', 'motivation', 'motivate', 'recognise', 'recognize', 'shout out', 'well done', 'appreciate'],
    answer: 'Small thank-yous make a big difference. On the Dashboard press “Give kudos”, pick the person and say what they did – they get a notification and it shows in Team wins. Team wins also lists finished tasks and won deals automatically.',
    go: { place: 'dashboard', highlight: 'Give kudos' },
  },
  {
    key: 'overwhelmed', title: 'I’m overwhelmed – there’s too much to do',
    keywords: ['overwhelmed', 'too much', 'too busy', 'stressed', 'behind', 'workload', 'swamped', 'cant keep up', 'burnt out', 'burned out', 'no time'],
    data: 'workload',
    answer: 'Let’s lighten the load:\n1. Open My day and only look at what’s due today.\n2. Reassign tasks from the busiest person (the workload panel shows who has most).\n3. Switch on automations for anything you keep doing by hand – follow-ups, reminders and onboarding are already there.\n4. Push low-priority tasks to next week.',
    go: { place: 'myday' },
  },

  // ── Build Funnel ──
  {
    key: 'funnel_start', title: 'Start building a new product or service',
    keywords: ['new product', 'new service', 'product idea', 'service idea', 'new idea', 'start a business', 'launch something', 'new build', 'build a product', 'create a product', 'create a service', 'business idea', 'new offer'],
    answer: 'Press “New build” in Build Funnel, give it a name, choose product or service and describe the idea. The system then walks you through 9 stages – from validating the idea to launch – one simple step at a time.',
    go: { place: 'funnel', highlight: 'New build' },
  },
  {
    key: 'funnel_next', title: 'What’s my next step in the Build Funnel?',
    keywords: ['next step', 'where am i', 'continue build', 'carry on', 'my build', 'funnel progress', 'build progress', 'what stage'],
    data: 'funnel', go: { place: 'funnel' },
  },
  {
    key: 'funnel_locked', title: 'A stage is locked or I can’t complete a step',
    keywords: ['locked', 'cant complete', 'cannot complete', 'mark complete', 'greyed out', 'grayed out', 'stage locked', 'wont let me', 'button disabled', 'required fields', 'still needed'],
    answer: 'Stages unlock in order, so finish (or skip) every step in the current stage first. “Mark complete” also needs the fields marked * filled in – the step lists anything still needed just above the buttons.',
    data: 'funnel', go: { place: 'funnel' },
  },
  {
    key: 'funnel_pricing', title: 'How should I price my offer?',
    keywords: ['price', 'pricing', 'how much to charge', 'charge', 'margin', 'profit', 'break even', 'breakeven', 'unit economics', 'costs'],
    answer: 'Use the Pricing & Economics stage: enter your cost to deliver, choose a pricing model and price, then add your monthly costs and profit goal. The system works out your margin, break-even and how many sales you need – and tells you if the price is too low.',
    data: 'funnel_step:pricing:pricing_model', go: { place: 'funnel' },
  },
  {
    key: 'funnel_validate', title: 'Is my idea any good? (validation)',
    keywords: ['validate', 'validation', 'is my idea good', 'will it sell', 'market research', 'competitors', 'competition', 'demand', 'test my idea'],
    answer: 'Stage 2, Market Validation, answers that: scan 3–5 competitors, talk to 10 potential customers (there’s a script), check demand signals, then record a go / pivot / stop decision.',
    data: 'funnel_step:validation:competitor_scan', go: { place: 'funnel' },
  },
  {
    key: 'funnel_sales_page', title: 'Write a sales page or website copy',
    keywords: ['sales page', 'landing page', 'website copy', 'website text', 'sales copy', 'web page'],
    answer: 'In the Brand & Sales Assets stage, the sales page step writes a first draft for you from everything you’ve already answered. Copy it, edit it in your own words and publish it.',
    data: 'funnel_step:brand:sales_page', go: { place: 'funnel' },
  },
  {
    key: 'funnel_launch', title: 'Plan a launch',
    keywords: ['launch', 'launch plan', 'go live', 'launch day', 'release'],
    answer: 'The Launch stage covers it: set a date and target, schedule two weeks of pre-launch content, message your warm contacts, then follow the launch-day checklist.',
    data: 'funnel_step:launch:launch_plan', go: { place: 'funnel' },
  },
  {
    key: 'funnel_tasks', title: 'Turn a funnel step into tasks',
    keywords: ['step into tasks', 'send to tasks', 'funnel tasks', 'delegate step', 'assign step'],
    answer: 'Open the step and press “Send to tasks”. It creates tasks with the step’s instructions as a checklist, so you or your team can work through them.',
    go: { place: 'funnel' },
  },

  // ── Content ──
  {
    key: 'content_ideas', title: 'I don’t know what to post',
    keywords: ['what to post', 'content ideas', 'post ideas', 'ideas for posts', 'no ideas', 'writers block', 'stuck for content', 'need ideas', 'generate ideas', 'inspiration', 'nothing to post'],
    answer: 'Open the Idea Lab and press “Generate ideas”. Each idea comes scored, with a hook and an angle that fits your business. Shortlist the ones you like, then press Create to get a full brief.',
    data: 'ideas', go: { place: 'ideas', highlight: 'Generate ideas' },
  },
  {
    key: 'content_strategy', title: 'Set up or change my content strategy',
    keywords: ['content strategy', 'pillars', 'brand voice', 'tone of voice', 'target audience', 'audience', 'brand profile', 'who to target'],
    answer: 'In Content Studio → Strategy, update who your audience is, their pains, your offers and your tone, then press “Save strategy”. Every new idea is built from this, so the more specific the better.',
    go: { place: 'strategy', highlight: 'Save strategy' }, admin: true,
  },
  {
    key: 'content_how', title: 'How do I film or make this content?',
    keywords: ['how to film', 'how do i film', 'make a reel', 'make a video', 'film a video', 'make a carousel', 'design a post', 'create content', 'how to make', 'editing', 'record a video', 'tiktok video', 'how to create'],
    answer: 'The Creation Academy has short step-by-step lessons for Reels and TikToks, carousels, stories, text posts, YouTube and newsletters. Every creation brief also links straight to the right lesson.',
    go: { place: 'academy' },
  },
  {
    key: 'content_hooks', title: 'Write better hooks and captions',
    keywords: ['hook', 'hooks', 'caption', 'captions', 'first line', 'engagement', 'nobody sees', 'low views', 'no likes'],
    answer: 'Open any idea’s brief – it gives you three hook options and a caption template. The Academy lesson “Master hooks in 5 minutes” shows the patterns that work best.',
    go: { place: 'academy' },
  },
  {
    key: 'content_finalise', title: 'Finish and sign off a piece of content',
    keywords: ['finalise', 'finalize', 'finish content', 'sign off', 'final version', 'approve content', 'write caption', 'draft'],
    answer: 'Open the Creation board, click the piece, write your final caption or script on the right and press “Finalise content”. Then pick a channel and time to schedule it.',
    data: 'creation', go: { place: 'creation' },
  },
  {
    key: 'content_schedule', title: 'Schedule or move a post',
    keywords: ['schedule a post', 'schedule post', 'when to post', 'post time', 'reschedule', 'move a post', 'change post time', 'posting schedule', 'publish'],
    answer: 'Content is scheduled after you finalise it – pick channels and a time (or a suggested free slot). To move or cancel a scheduled post, click it in the Calendar and choose Reschedule, Publish now or Cancel.',
    data: 'posts', go: { place: 'calendar' },
  },
  {
    key: 'content_failed', title: 'A post didn’t go out',
    keywords: ['post failed', 'didnt post', 'did not post', 'didnt publish', 'not published', 'post not live', 'failed post'],
    answer: 'Posts retry automatically three times. If one still fails, an urgent task is created with the error and the post shows red in the Calendar – click it and press “Publish now” once the channel is fixed.',
    data: 'failed_posts', go: { place: 'calendar' },
  },
  {
    key: 'content_channels', title: 'Connect Instagram, TikTok or another account',
    keywords: ['connect instagram', 'connect tiktok', 'connect facebook', 'connect linkedin', 'connect youtube', 'connect account', 'link account', 'add channel', 'social account', 'connect channel'],
    answer: 'Go to Settings → Publishing channels and press “Connect channel”. Choose the platform and handle; use the Webhook option to publish through Zapier, Make or similar.',
    go: { place: 'settings', highlight: 'Connect channel' }, admin: true,
  },
  {
    key: 'content_sales', title: 'My content isn’t bringing in sales',
    keywords: ['no sales from content', 'content not working', 'not converting', 'no enquiries', 'no inquiries', 'more sales', 'get customers', 'get clients', 'more clients', 'more customers', 'more leads'],
    answer: 'Check your content mix in the Idea Lab – most businesses post too much awareness content. Generate ideas with the funnel stage set to “Conversion” (offer spotlights, objection busters, comparisons) and make sure every post has a clear call to action. New leads then go straight into the CRM with automatic follow-ups.',
    go: { place: 'ideas', highlight: 'Generate ideas' },
  },

  // ── CRM ──
  {
    key: 'crm_add_lead', title: 'Add a new lead or client',
    keywords: ['add a lead', 'add lead', 'new lead', 'new client', 'new customer', 'add contact', 'add a contact', 'add client', 'add customer', 'new enquiry', 'new inquiry', 'capture lead'],
    answer: 'Press “Add lead”, fill in their details and save. The system books a welcome call task for tomorrow, sets a 3-day follow-up and logs it – automatically.',
    go: { place: 'contacts', query: 'new=1' },
  },
  {
    key: 'crm_follow_up', title: 'Who do I need to follow up with?',
    keywords: ['follow up', 'follow ups', 'followup', 'chase', 'chasing', 'forgot to call', 'leads going cold', 'cold leads', 'who to call', 'call back'],
    answer: 'Follow-ups are automatic: every new lead gets a follow-up date, and when it arrives a task appears for the owner. To set one yourself, open a contact, log the call and choose when to follow up.',
    data: 'follow_ups', go: { place: 'contacts' },
  },
  {
    key: 'crm_pipeline', title: 'Track deals and sales',
    keywords: ['pipeline', 'deals', 'deal', 'sales stages', 'move a deal', 'proposal', 'negotiation', 'sales'],
    answer: 'The Pipeline shows every deal by stage with its value. Drag a deal to the next stage – moving it to Proposal creates a chase-up task, and Won starts onboarding. Click a deal to edit it, or press “New deal”.',
    data: 'pipeline', go: { place: 'pipeline' },
  },
  {
    key: 'crm_won', title: 'I’ve won a new client – what now?',
    keywords: ['won a deal', 'won the deal', 'closed a deal', 'signed a client', 'new client signed', 'onboard', 'onboarding', 'client said yes', 'deal won'],
    answer: 'Congratulations! Drag their deal to Won in the Pipeline. That marks them as a customer, creates an onboarding task with a 5-step checklist and tells the whole team.',
    go: { place: 'pipeline' },
  },
  {
    key: 'crm_lost', title: 'I lost a deal',
    keywords: ['lost a deal', 'lost the deal', 'said no', 'deal lost', 'didnt buy', 'not interested'],
    answer: 'Drag the deal to Lost in the Pipeline. The system creates a task to ask them for feedback and sets a 90-day check-in, so the door stays open.',
    go: { place: 'pipeline' },
  },
  {
    key: 'crm_log', title: 'Log a call, email or meeting',
    keywords: ['log a call', 'log call', 'log an email', 'log meeting', 'add a note', 'add note', 'record a call', 'call notes', 'meeting notes'],
    answer: 'Open the contact (Contacts → click their name), type what happened, choose Call, Email, Meeting or Note, optionally set a follow-up, and press Save. It goes on their timeline.',
    go: { place: 'contacts' },
  },
  {
    key: 'crm_import', title: 'Import a list of contacts',
    keywords: ['import', 'upload contacts', 'spreadsheet', 'csv', 'excel', 'bulk', 'import contacts', 'contact list'],
    answer: 'Bulk import is built into the system but doesn’t have a button on screen yet in this version. I can raise it with your admin so they can import the list for you.',
    say: 'Report a problem: Please import my contact list into the CRM',
  },
  {
    key: 'complaint', title: 'A customer has a complaint',
    keywords: ['complaint', 'complaining', 'unhappy customer', 'unhappy client', 'angry customer', 'angry client', 'refund', 'bad review', 'customer problem', 'client problem'],
    answer: 'Log it in the Help Desk as a “customer” issue so nothing gets missed – set the priority and the right person gets alerted with a response target. Then log the conversation on their contact record.',
    go: { place: 'helpdesk', query: 'new=1&category=customer' },
  },

  // ── Tasks ──
  {
    key: 'task_new', title: 'Create a task or reminder',
    keywords: ['create a task', 'new task', 'add a task', 'add task', 'reminder', 'remind me', 'to do', 'todo'],
    answer: 'Press “New task” on the Task board. You can add a checklist, a due date, an owner and make it repeat. Or just tell me, for example: “Remind me to call Emma tomorrow”.',
    go: { place: 'tasks', highlight: 'New task' },
  },
  {
    key: 'task_overdue', title: 'What’s overdue?',
    keywords: ['overdue', 'late tasks', 'missed', 'past due', 'behind on tasks'],
    data: 'overdue', go: { place: 'myday' },
  },
  {
    key: 'task_recurring', title: 'Make a task repeat',
    keywords: ['repeat', 'recurring', 'every week', 'every day', 'every month', 'weekly task', 'daily task', 'monthly task', 'routine'],
    answer: 'Create or open the task and set “Repeats” to daily, weekly or monthly. When it’s ticked off, the next one is created automatically with the checklist reset.',
    go: { place: 'tasks', highlight: 'New task' },
  },
  {
    key: 'task_delegate', title: 'Give a task to someone else',
    keywords: ['delegate', 'assign', 'reassign', 'give a task', 'hand over', 'handover', 'someone else'],
    answer: 'Open the task and change “Assign to”. The Team workload panel on the Task board shows who has capacity.',
    go: { place: 'tasks' },
  },

  // ── Automations ──
  {
    key: 'auto_what', title: 'What are automations?',
    keywords: ['what are automations', 'how do automations work', 'what is automation', 'automations work', 'how does it automate'],
    answer: 'Automations follow a simple rule: WHEN something happens (like a new lead), IF it matches (optional), THEN the system does the work (creates a task, sends a notification, updates a contact). Each business starts with ready-made ones, and the activity log shows everything they’ve done.',
    go: { place: 'automations' },
  },
  {
    key: 'auto_new', title: 'Automate something new',
    keywords: ['automate', 'new automation', 'create automation', 'set up automation', 'create a rule', 'workflow', 'stop doing manually', 'do it automatically'],
    answer: 'Press “New automation”, choose WHEN (the trigger), add any IF conditions, then the THEN actions. Use placeholders like {{contact.first_name}} in the text. “Test run” lets you check it.',
    go: { place: 'automations', highlight: 'New automation' }, admin: true,
  },
  {
    key: 'auto_off', title: 'Too many notifications / turn an automation off',
    keywords: ['turn off', 'switch off', 'stop automation', 'disable', 'too many notifications', 'too many reminders', 'pause automation', 'stop reminders'],
    answer: 'Each automation has an on/off switch on the Automations page – switch off the one you don’t want. You can switch it back on any time.',
    go: { place: 'automations' }, admin: true,
  },

  // ── Help Desk ──
  {
    key: 'issue_raise', title: 'Something’s not working – raise an issue',
    keywords: ['not working', 'broken', 'bug', 'error', 'problem', 'issue', 'help me fix', 'something wrong', 'doesnt work', 'does not work', 'crash', 'glitch'],
    answer: 'Tell me what’s going wrong and I’ll log it in the Help Desk for you – just start your message with “Report a problem:”. Or open the Help Desk and press “New issue”. The right person is alerted with a response target based on priority.',
    go: { place: 'helpdesk', highlight: 'New issue' },
  },
  {
    key: 'issue_status', title: 'Check on my issues',
    keywords: ['my issues', 'open issues', 'issue status', 'ticket status', 'my tickets', 'any update', 'is it fixed', 'has it been fixed'],
    data: 'issues', go: { place: 'helpdesk' },
  },

  // ── Settings & account ──
  {
    key: 'team_add', title: 'Add a team member',
    keywords: ['add team member', 'add staff', 'new staff', 'new employee', 'add employee', 'invite', 'add a user', 'new user', 'add someone to the team', 'team member'],
    answer: 'Go to Settings → Team and press “Add member”. Give them a temporary password to sign in with, and choose Member or Admin.',
    go: { place: 'settings', highlight: 'Add member' }, admin: true,
  },
  {
    key: 'business_add', title: 'Add another business',
    keywords: ['another business', 'second business', 'new business', 'add business', 'another company', 'new company', 'add a client business'],
    answer: 'In Settings press “Add another business”, choose its niche and it’s set up instantly – content pillars, channels and automations included. Switch between businesses with the selector at the top.',
    go: { place: 'settings', highlight: 'Add another business' },
  },
  {
    key: 'business_switch', title: 'Switch between businesses',
    keywords: ['switch business', 'change business', 'other business', 'switch company', 'different business'],
    answer: 'Use the business selector at the top of the screen (next to the bell). Each business keeps its own funnel, content, CRM, tasks and automations.',
  },
  {
    key: 'business_profile', title: 'Change the business name or niche',
    keywords: ['business name', 'change name', 'rename', 'change niche', 'niche', 'business details', 'business type'],
    answer: 'In Settings → Business profile, update the name, niche or type and press Save.',
    go: { place: 'settings' }, admin: true,
  },
  {
    key: 'password', title: 'Change my password or sign-in details',
    keywords: ['password', 'forgot password', 'reset password', 'change password', 'login', 'log in', 'sign in', 'email address'],
    answer: 'Changing passwords isn’t on screen yet in this version. I can raise it with an admin who can reset it for you.',
    say: 'Report a problem: Please reset my password',
  },

  // ── Coming soon (honest answers) ──
  {
    key: 'invoices', title: 'Invoices, quotes and payments',
    keywords: ['invoice', 'invoices', 'quote', 'quotes', 'payment', 'payments', 'get paid', 'unpaid', 'billing', 'stripe', 'xero', 'quickbooks'],
    answer: 'Invoicing isn’t part of the system yet – it’s on the roadmap. For now, the Build Funnel’s “Set up payments” step walks you through creating a payment link, and you can track unpaid invoices as tasks or Help Desk billing issues.',
    data: 'funnel_step:pricing:payments', go: { place: 'funnel' },
  },
  {
    key: 'bookings', title: 'Bookings and appointments',
    keywords: ['booking', 'bookings', 'appointment', 'appointments', 'book a call', 'book a meeting', 'calendar booking', 'diary', 'availability'],
    answer: 'Online booking isn’t built in yet – it’s on the roadmap. Until then, log meetings on a contact’s timeline and create a task with the date so it appears in My day.',
    go: { place: 'contacts' },
  },
];

/** Short descriptions of each section, used for “what is this page?” questions. */
export const PAGE_HELP = {
  '/': 'The Dashboard shows today across the business: time saved by automations, the pipeline, new leads, your tasks, content going out and team wins.',
  '/funnel': 'Build Funnel takes a product or service from idea to fully built in 9 stages. Each step explains why it matters, what to do and when it’s done.',
  '/content': 'Content Studio plans your strategy, generates ideas and briefs, teaches you how to create each piece, and publishes it once you’ve finalised it.',
  '/crm': 'The CRM holds every lead, client and deal. Automations handle welcome calls, follow-ups, proposal chasers and onboarding.',
  '/tasks': 'Tasks is the team’s to-do board. Many tasks are created automatically by the funnel, CRM and automations.',
  '/automations': 'Automations do the routine admin: WHEN something happens, IF it matches, THEN the system does the work.',
  '/helpdesk': 'The Help Desk tracks problems until they’re sorted, with a response target for each priority and alerts when one is overdue.',
  '/settings': 'Settings is where you manage the business profile, team members, publishing channels and extra businesses.',
};

export const STARTER_PROMPTS = [
  'What do I need to do today?',
  'How do I add a new lead?',
  'I don’t know what to post',
  'How should I price my offer?',
  'Remind me to call Emma tomorrow',
  'Report a problem: ',
];

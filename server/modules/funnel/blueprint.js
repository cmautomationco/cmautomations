/**
 * The Build Funnel blueprint: the full journey from "I have an idea" to
 * "the product/service is built, set up and selling".
 *
 * Each stage contains steps. Every step is written so a client can work
 * through it alone:
 *   why      – one or two sentences on why it matters (plain English)
 *   how      – short numbered instructions
 *   fields   – the worksheet the client fills in (saved as answers)
 *   doneWhen – the clear finish line
 *   tasks    – optional follow-up tasks pushed into the Task Manager
 *   kinds    – limit a step to 'product' or 'service' projects (default: both)
 *
 * The blueprint lives in code (not the database) so it can be improved once
 * and every business using the system gets the upgrade.
 */

const t = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const ta = (key, label, extra = {}) => ({ key, label, type: 'textarea', ...extra });
const list = (key, label, extra = {}) => ({ key, label, type: 'list', ...extra });
const num = (key, label, extra = {}) => ({ key, label, type: 'number', ...extra });
const sel = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });

export const STAGES = [
  {
    key: 'idea',
    title: 'Idea & Clarity',
    goal: 'Turn a rough idea into a clear, one-sentence concept anyone can understand.',
    steps: [
      {
        key: 'idea_statement',
        title: 'Describe your idea in one sentence',
        why: 'If you can’t explain it simply, customers won’t understand it either. This sentence becomes the foundation for everything else.',
        how: [
          'Use the formula: “I help [who] get [result] through [how]”.',
          'Read it out loud. Remove any jargon or buzzwords.',
          'Test it on one friend – can they repeat it back to you?',
        ],
        fields: [
          ta('statement', 'Your one-sentence idea', { required: true, placeholder: 'I help busy parents cook healthy dinners in 20 minutes through weekly recipe boxes.' }),
          t('working_name', 'Working name (you can change this later)'),
        ],
        doneWhen: 'Someone who knows nothing about your idea can explain it back to you.',
        minutes: 20,
      },
      {
        key: 'ideal_customer',
        title: 'Define your ideal customer',
        why: 'Trying to sell to everyone means selling to no one. A clear customer makes marketing, pricing and building much easier.',
        how: [
          'Picture one real person who would love this. Give them a name.',
          'Write down their situation, age range, job and where they spend time online.',
          'Note what they are already buying or trying to solve this problem.',
        ],
        fields: [
          t('persona_name', 'Give them a name', { placeholder: 'Busy Becky' }),
          ta('description', 'Who are they? (situation, age, job, lifestyle)', { required: true }),
          list('hangouts', 'Where do they spend time? (platforms, groups, places)'),
          ta('current_solution', 'What do they use/do today instead?'),
        ],
        doneWhen: 'You could walk into a room and point out your ideal customer.',
        minutes: 30,
      },
      {
        key: 'problem_pain',
        title: 'Nail the problem and the pain',
        why: 'People buy solutions to problems they feel. The stronger the pain, the easier the sale.',
        how: [
          'List the top 3 frustrations your customer has about this problem.',
          'For each, write what it costs them (time, money, stress, status).',
          'Rank them – the #1 pain leads your marketing.',
        ],
        fields: [
          list('pains', 'Top 3 pains (most painful first)', { required: true }),
          ta('cost_of_pain', 'What does the problem cost them?'),
        ],
        doneWhen: 'You have 3 pains written in your customer’s own words.',
        minutes: 25,
      },
      {
        key: 'transformation',
        title: 'Describe the transformation',
        why: 'Customers don’t buy products, they buy the “after”. This is your core promise.',
        how: [
          'Write the “before”: how life looks with the problem.',
          'Write the “after”: how life looks once solved.',
          'Add a realistic timeframe if you can.',
        ],
        fields: [
          ta('before', 'Before (life with the problem)', { required: true }),
          ta('after', 'After (life once solved)', { required: true }),
          t('timeframe', 'How long does the change take?'),
        ],
        doneWhen: 'Your before/after is specific enough to picture.',
        minutes: 20,
      },
      {
        key: 'unfair_advantage',
        title: 'Why you? Find your edge',
        why: 'Your edge is why customers choose you over the alternatives, and it protects your pricing.',
        how: [
          'List skills, experience, story or access that others don’t have.',
          'Note anything you do differently or better.',
          'Pick the ONE thing you’ll lead with.',
        ],
        fields: [
          list('advantages', 'Your advantages'),
          t('lead_advantage', 'The one edge you’ll lead with', { required: true }),
        ],
        doneWhen: 'You can finish the sentence “Choose us because…” in under 10 words.',
        minutes: 15,
      },
    ],
  },
  {
    key: 'validation',
    title: 'Market Validation',
    goal: 'Prove people want this and will pay for it before you spend time and money building.',
    steps: [
      {
        key: 'competitor_scan',
        title: 'Scan 3–5 competitors',
        why: 'Competitors prove there is demand. Their gaps show you where to win.',
        how: [
          'Search Google, Instagram, TikTok and Amazon/marketplaces for your solution.',
          'For each competitor note: price, main promise, what reviews complain about.',
          'Highlight the gap that appears again and again.',
        ],
        fields: [
          list('competitors', 'Competitors (name – price – promise)', { required: true }),
          ta('complaints', 'What do their customers complain about?'),
          ta('gap', 'The gap you will fill', { required: true }),
        ],
        doneWhen: 'You know the going price and one clear gap in the market.',
        minutes: 60,
        tasks: [{ title: 'Research 5 competitors and record price, promise and complaints', priority: 'medium', days: 3 }],
      },
      {
        key: 'customer_conversations',
        title: 'Talk to 10 potential customers',
        why: 'Ten real conversations beat a hundred assumptions. You will hear the words to use in your marketing.',
        how: [
          'Message people who match your ideal customer (friends-of-friends, groups, past clients).',
          'Ask: “What’s the hardest part about [problem]?”, “What have you tried?”, “What would a perfect fix look like?”',
          'Do NOT pitch. Just listen and take notes.',
          'At the end ask: “If this existed for £X, would you buy it?”',
        ],
        fields: [
          num('conversations', 'Conversations completed', { required: true, min: 1 }),
          list('quotes', 'Best quotes (their exact words)'),
          num('would_buy', 'How many said they would buy?'),
        ],
        doneWhen: 'You have spoken to at least 10 people and collected their exact words.',
        minutes: 300,
        tasks: [
          { title: 'Book 10 customer discovery conversations', priority: 'high', days: 5 },
          { title: 'Write up discovery notes and best quotes', priority: 'medium', days: 7 },
        ],
      },
      {
        key: 'demand_signals',
        title: 'Check demand signals',
        why: 'Online data shows how many people are actively looking for a solution.',
        how: [
          'Check Google search volume for 3 phrases your customer would type.',
          'Find 3 online communities where the problem is discussed.',
          'Optional: run a simple “coming soon” page and count sign-ups.',
        ],
        fields: [
          list('keywords', 'Search phrases & monthly volume'),
          list('communities', 'Communities where people discuss this'),
          num('waitlist', 'Waitlist sign-ups (if you ran one)'),
        ],
        doneWhen: 'You have at least one hard number showing interest.',
        minutes: 45,
      },
      {
        key: 'validation_verdict',
        title: 'Make the go / pivot / stop decision',
        why: 'A clear decision stops you drifting. Pivoting now is cheap; pivoting after launch is expensive.',
        how: [
          'Review your competitor gap, conversations and demand signals.',
          'If 3+ of 10 people would buy and a gap exists: GO.',
          'If interest exists but not for this version: PIVOT and note what to change.',
          'If there is little interest: STOP and start a new idea (that’s a win – you saved months).',
        ],
        fields: [
          sel('verdict', 'Decision', ['go', 'pivot', 'stop'], { required: true }),
          ta('reasoning', 'Why?', { required: true }),
        ],
        doneWhen: 'A decision is recorded with the reasons.',
        minutes: 15,
      },
    ],
  },
  {
    key: 'offer',
    title: 'Offer Design',
    goal: 'Package the solution into an offer that is easy to say yes to.',
    steps: [
      {
        key: 'core_offer',
        title: 'Define the core offer',
        why: 'The core offer is exactly what the customer gets. Clarity here removes most sales objections.',
        how: [
          'List every deliverable (what they receive) and the format (physical, digital, sessions…).',
          'Remove anything that doesn’t directly create the transformation.',
          'Write it as a short bullet list a customer could skim in 10 seconds.',
        ],
        fields: [
          list('deliverables', 'Deliverables', { required: true }),
          t('format', 'Format / how it’s delivered'),
        ],
        doneWhen: 'The offer fits in 5 bullet points or fewer.',
        minutes: 30,
      },
      {
        key: 'value_stack',
        title: 'Build the value stack & bonuses',
        why: 'Bonuses that remove obstacles make the offer feel like a no-brainer without cutting price.',
        how: [
          'List the obstacles that stop someone succeeding with your core offer.',
          'Create a small bonus that removes each obstacle (checklist, template, extra call…).',
          'Give each bonus a name and a realistic value.',
        ],
        fields: [
          list('bonuses', 'Bonuses (name – value)'),
        ],
        doneWhen: 'Every major obstacle has a bonus that solves it.',
        minutes: 30,
      },
      {
        key: 'guarantee',
        title: 'Add a guarantee (risk reversal)',
        why: 'A guarantee moves the risk from the customer to you, which increases conversions.',
        how: [
          'Choose a type: money-back, results-based, or “we keep working until…”.',
          'Set clear, fair conditions.',
          'Write it in one confident sentence.',
        ],
        fields: [
          sel('type', 'Guarantee type', ['money_back', 'results_based', 'keep_working', 'none']),
          ta('wording', 'Guarantee wording'),
        ],
        doneWhen: 'Your guarantee is written and you are comfortable honouring it.',
        minutes: 15,
      },
      {
        key: 'positioning',
        title: 'Name & positioning statement',
        why: 'A good name and positioning line make your offer memorable and easy to share.',
        how: [
          'Brainstorm 10 names. Check the domain and social handles are available.',
          'Write: “For [customer] who [pain], [name] is the [category] that [key benefit]. Unlike [alternative], we [edge].”',
        ],
        fields: [
          t('name', 'Offer name', { required: true }),
          ta('positioning', 'Positioning statement', { required: true }),
        ],
        doneWhen: 'Name chosen, handles secured and positioning written.',
        minutes: 40,
        tasks: [{ title: 'Secure domain name and social handles', priority: 'high', days: 2 }],
      },
    ],
  },
  {
    key: 'pricing',
    title: 'Pricing & Economics',
    goal: 'Set a price that customers accept and that makes the business profitable.',
    steps: [
      {
        key: 'cost_to_deliver',
        title: 'Work out the cost to deliver',
        why: 'You can’t price properly until you know what one sale costs you.',
        how: [
          'Product: add materials, packaging, shipping and platform fees per unit.',
          'Service: multiply hours per client by your hourly cost, then add tools/software.',
          'Add a 10% buffer for things you forgot.',
        ],
        fields: [
          num('unit_cost', 'Cost to deliver one sale (£)', { required: true }),
          ta('breakdown', 'Cost breakdown'),
        ],
        doneWhen: 'You know your cost per sale including a buffer.',
        minutes: 30,
      },
      {
        key: 'pricing_model',
        title: 'Choose a pricing model & tiers',
        why: 'The right model (one-off, subscription, retainer, tiers) can double lifetime value.',
        how: [
          'Pick a model that matches how customers get value (ongoing value = recurring price).',
          'Consider 3 tiers: Good, Better, Best – most people pick the middle.',
          'Anchor against the competitor prices you found in validation.',
        ],
        fields: [
          sel('model', 'Pricing model', ['one_off', 'subscription', 'retainer', 'payment_plan', 'tiered'], { required: true }),
          num('price', 'Main price (£)', { required: true }),
          list('tiers', 'Tiers (name – price – what’s included)'),
        ],
        doneWhen: 'A price is chosen and justified against competitors.',
        minutes: 30,
      },
      {
        key: 'unit_economics',
        title: 'Check the unit economics',
        why: 'This tells you whether the business can actually pay you. The system calculates it for you.',
        how: [
          'Enter your monthly fixed costs (software, rent, insurance…).',
          'Enter your income goal for the month.',
          'Review the margin and number of sales needed – adjust price if it doesn’t work.',
        ],
        fields: [
          num('fixed_costs', 'Monthly fixed costs (£)', { required: true }),
          num('income_goal', 'Monthly profit goal (£)', { required: true }),
        ],
        computed: 'economics',
        doneWhen: 'Your margin is healthy (aim for 50%+ on services, 30%+ on products).',
        minutes: 20,
      },
      {
        key: 'payments',
        title: 'Set up payments',
        why: 'Making it easy to pay removes the last barrier to a sale.',
        how: [
          'Choose a payment provider (Stripe, PayPal, Shopify Payments, Square…).',
          'Create the product/price and a checkout or payment link.',
          'Make a £1 test purchase and refund it.',
        ],
        fields: [
          t('provider', 'Payment provider', { required: true }),
          t('checkout_link', 'Checkout / payment link'),
        ],
        doneWhen: 'A test payment has gone through and been refunded.',
        minutes: 45,
        tasks: [{ title: 'Create checkout link and run a test payment', priority: 'high', days: 3 }],
      },
    ],
  },
  {
    key: 'build',
    title: 'Build',
    goal: 'Create the first real version – fast, simple and good enough to deliver results.',
    steps: [
      {
        key: 'mvp_scope',
        title: 'Scope the first version (MVP)',
        kinds: ['product'],
        why: 'Launching with the essentials gets you real feedback months sooner.',
        how: [
          'List every feature/component you want.',
          'Sort into: MUST have for launch, SHOULD have later, WON’T have yet.',
          'Only build the MUST list now.',
        ],
        fields: [
          list('must', 'Must have', { required: true }),
          list('should', 'Should have (later)'),
          list('wont', 'Won’t have (yet)'),
        ],
        doneWhen: 'The MUST list is short enough to finish in weeks, not months.',
        minutes: 45,
      },
      {
        key: 'suppliers_tools',
        title: 'Source suppliers, materials or tools',
        kinds: ['product'],
        why: 'Reliable suppliers protect quality and margins.',
        how: [
          'Shortlist 3 suppliers/manufacturers or tools for each component.',
          'Request samples or trials and compare quality, price and lead time.',
          'Choose one main supplier and one backup.',
        ],
        fields: [
          list('suppliers', 'Suppliers (name – price – lead time)', { required: true }),
          t('backup', 'Backup supplier'),
        ],
        doneWhen: 'Samples approved and a main + backup supplier chosen.',
        minutes: 180,
        tasks: [{ title: 'Order samples from shortlisted suppliers', priority: 'high', days: 5 }],
      },
      {
        key: 'prototype',
        title: 'Build the prototype',
        kinds: ['product'],
        why: 'A prototype turns the idea into something people can touch, test and buy.',
        how: [
          'Build only the MUST features.',
          'Photograph/record it for your sales page as you go.',
          'Write down every problem you hit – that’s your improvement list.',
        ],
        fields: [
          t('prototype_link', 'Link / location of the prototype'),
          list('issues', 'Issues found'),
        ],
        doneWhen: 'A working version exists that delivers the core result.',
        minutes: 600,
      },
      {
        key: 'delivery_map',
        title: 'Map the delivery process',
        kinds: ['service'],
        why: 'A mapped process means every client gets the same great result – and you can hand it to staff later.',
        how: [
          'Write every step from “client pays” to “client gets result”.',
          'Group the steps into 3–6 phases (e.g. Onboard, Plan, Deliver, Review).',
          'Mark who does each step and roughly how long it takes.',
        ],
        fields: [
          list('phases', 'Phases', { required: true }),
          ta('steps', 'Detailed steps (who – what – how long)'),
        ],
        doneWhen: 'Someone else could deliver the service by following your map.',
        minutes: 60,
      },
      {
        key: 'templates_sops',
        title: 'Create templates & SOPs',
        kinds: ['service'],
        why: 'Templates and SOPs (standard operating procedures) save hours per client and keep quality high.',
        how: [
          'Turn any repeated document into a template (proposal, onboarding form, report).',
          'Write a short SOP for each phase: purpose, steps, checklist.',
          'Store them in one shared folder.',
        ],
        fields: [
          list('templates', 'Templates created', { required: true }),
          t('folder_link', 'Shared folder link'),
        ],
        doneWhen: 'Every repeated task has a template or SOP.',
        minutes: 240,
        tasks: [{ title: 'Write SOPs for each delivery phase', priority: 'medium', days: 7 }],
      },
      {
        key: 'onboarding_flow',
        title: 'Design the client onboarding',
        kinds: ['service'],
        why: 'The first 48 hours decide whether a client feels they made the right choice.',
        how: [
          'Write the welcome email/message.',
          'Create the onboarding form (what you need from them).',
          'Book the kick-off call automatically (the CRM automation does this for you).',
        ],
        fields: [
          ta('welcome_message', 'Welcome message', { required: true }),
          list('info_needed', 'Information you need from clients'),
        ],
        doneWhen: 'A new client is welcomed and onboarded without you writing anything from scratch.',
        minutes: 60,
      },
      {
        key: 'beta_test',
        title: 'Pilot with real customers',
        why: 'Real customers reveal what matters. Their results become your first testimonials.',
        how: [
          'Offer the product/service to 3–5 people at a founding discount in exchange for feedback.',
          'Collect feedback after first use and at the end.',
          'Fix the top 3 issues before launch.',
        ],
        fields: [
          num('pilot_customers', 'Pilot customers', { required: true }),
          list('feedback', 'Key feedback'),
          list('fixes', 'Fixes made'),
        ],
        doneWhen: 'At least 3 pilot customers have used it and you fixed the top issues.',
        minutes: 300,
        tasks: [{ title: 'Recruit 3–5 pilot customers', priority: 'high', days: 7 }],
      },
    ],
  },
  {
    key: 'brand',
    title: 'Brand & Sales Assets',
    goal: 'Create everything customers see: brand, sales page, lead magnet and proof.',
    steps: [
      {
        key: 'brand_basics',
        title: 'Set your brand basics',
        why: 'A consistent look makes you recognisable and trusted.',
        how: [
          'Pick 2–3 brand colours and 1–2 fonts.',
          'Create a simple logo (a clean word-mark is fine to start).',
          'Write 3 words that describe your brand’s personality.',
        ],
        fields: [
          list('colours', 'Brand colours'),
          t('fonts', 'Fonts'),
          list('personality', 'Brand personality (3 words)', { required: true }),
        ],
        doneWhen: 'Colours, fonts, logo and personality are decided.',
        minutes: 90,
      },
      {
        key: 'sales_page',
        title: 'Write the sales / landing page',
        why: 'Your sales page works 24/7. It should answer every question a buyer has.',
        how: [
          'Headline: the transformation. Sub-headline: who it’s for and how.',
          'Sections: Problem → Solution → What you get → Proof → Price → Guarantee → FAQ → Call to action.',
          'Reuse the answers from earlier steps – the system has already collected most of this.',
        ],
        fields: [
          t('headline', 'Headline', { required: true }),
          t('page_link', 'Page link once live'),
        ],
        prefill: 'sales_page',
        doneWhen: 'Page is live and a friend can buy without asking you a question.',
        minutes: 180,
        tasks: [{ title: 'Build and publish the sales page', priority: 'high', days: 5 }],
      },
      {
        key: 'lead_magnet',
        title: 'Create a lead magnet',
        why: 'A free, useful resource turns followers into leads in your CRM.',
        how: [
          'Choose a quick win for your ideal customer (checklist, guide, mini-training, discount).',
          'Create it in one sitting – short and useful beats long.',
          'Connect the sign-up form to the CRM so every lead is captured automatically.',
        ],
        fields: [
          t('title', 'Lead magnet title', { required: true }),
          t('signup_link', 'Sign-up link'),
        ],
        doneWhen: 'New sign-ups appear in the CRM automatically.',
        minutes: 120,
      },
      {
        key: 'social_proof',
        title: 'Collect social proof',
        why: 'People trust other customers more than they trust you.',
        how: [
          'Ask every pilot customer for a short testimonial (give them 3 questions to answer).',
          'Ask permission to share results, photos or screenshots.',
          'Add the best 3 to your sales page.',
        ],
        fields: [
          list('testimonials', 'Testimonials collected', { required: true }),
        ],
        doneWhen: 'At least 3 testimonials are on your sales page.',
        minutes: 60,
      },
    ],
  },
  {
    key: 'operations',
    title: 'Operations & Systems',
    goal: 'Set up the admin, tools and automations so the business runs smoothly without you doing everything.',
    steps: [
      {
        key: 'legal_admin',
        title: 'Legal & admin essentials',
        why: 'Getting the basics right protects you and builds trust.',
        how: [
          'Register the business (sole trader / limited company) if you haven’t.',
          'Add Terms & Conditions and a Privacy Policy to your website.',
          'Check insurance and any licences your niche needs.',
          'Open a separate business bank account.',
        ],
        fields: [
          sel('structure', 'Business structure', ['sole_trader', 'limited_company', 'partnership', 'other'], { required: true }),
          list('done_items', 'Completed items'),
        ],
        doneWhen: 'You are registered, insured and have T&Cs + privacy policy live.',
        minutes: 120,
        tasks: [
          { title: 'Publish Terms & Conditions and Privacy Policy', priority: 'high', days: 7 },
          { title: 'Confirm business insurance', priority: 'medium', days: 7 },
        ],
      },
      {
        key: 'tool_stack',
        title: 'Connect your tool stack',
        why: 'Connected tools remove double-entry and let automations do the admin.',
        how: [
          'Use this system’s CRM for leads/clients and the Task Manager for the team.',
          'Connect your social channels in Content Studio → Channels.',
          'List any other tools (accounting, booking, email) and how they connect (webhooks/Zapier/Make).',
        ],
        fields: [
          list('tools', 'Tools in use', { required: true }),
        ],
        doneWhen: 'Every tool is listed and data flows between them without copying and pasting.',
        minutes: 60,
      },
      {
        key: 'automations_on',
        title: 'Switch on your automations',
        why: 'Automations handle follow-ups, reminders and onboarding so nothing falls through the cracks.',
        how: [
          'Open Automations and review the recommended recipes for your niche.',
          'Switch on: New lead follow-up, Deal won onboarding, Overdue task reminders, Daily digest.',
          'Run one test (add a test contact) and check the tasks appear.',
        ],
        fields: [
          list('enabled', 'Automations switched on', { required: true }),
        ],
        doneWhen: 'A test lead triggers the follow-up task automatically.',
        minutes: 30,
      },
      {
        key: 'support_process',
        title: 'Customer support process',
        why: 'Fast, friendly support creates repeat customers and referrals.',
        how: [
          'Choose your support channel(s) and response time promise (e.g. within 24 hours).',
          'Write saved replies for your 5 most common questions.',
          'Decide how complaints and refunds are handled.',
        ],
        fields: [
          t('channels', 'Support channels', { required: true }),
          t('response_time', 'Response time promise'),
          list('saved_replies', 'Saved replies for common questions'),
        ],
        doneWhen: 'Anyone on the team can answer the top 5 questions consistently.',
        minutes: 60,
      },
    ],
  },
  {
    key: 'launch',
    title: 'Launch',
    goal: 'Get the offer in front of the right people and make the first sales.',
    steps: [
      {
        key: 'launch_plan',
        title: 'Plan the launch',
        why: 'A dated plan creates urgency for you and your audience.',
        how: [
          'Pick a launch date 2–4 weeks away.',
          'Set a target: number of sales or sign-ups.',
          'Choose a launch offer (early-bird price, bonus or limited spots).',
        ],
        fields: [
          t('launch_date', 'Launch date', { required: true, placeholder: 'YYYY-MM-DD' }),
          num('target_sales', 'Target sales', { required: true }),
          t('launch_offer', 'Launch offer'),
        ],
        doneWhen: 'Date, target and offer are set and shared with the team.',
        minutes: 30,
      },
      {
        key: 'prelaunch_content',
        title: 'Create pre-launch content',
        why: 'Warming up your audience before launch day means buyers are ready when doors open.',
        how: [
          'Open Content Studio → Idea Lab and generate ideas for the “consideration” and “conversion” stages.',
          'Plan 2 weeks of content: problem awareness → behind the scenes → proof → launch.',
          'Finalise and schedule them in the calendar.',
        ],
        fields: [
          num('posts_scheduled', 'Posts scheduled', { required: true }),
        ],
        doneWhen: 'At least 2 weeks of pre-launch content is scheduled.',
        minutes: 240,
        tasks: [{ title: 'Generate and schedule 2 weeks of pre-launch content', priority: 'high', days: 7 }],
      },
      {
        key: 'warm_outreach',
        title: 'Reach out to your warm audience',
        why: 'Your first sales nearly always come from people who already know you.',
        how: [
          'Filter the CRM for leads and past contacts.',
          'Send a personal message (not a sales blast) to each one.',
          'Log every conversation in the CRM so follow-ups are automated.',
        ],
        fields: [
          num('messages_sent', 'Personal messages sent', { required: true }),
          num('replies', 'Replies'),
        ],
        doneWhen: 'Every warm contact has had a personal message.',
        minutes: 180,
      },
      {
        key: 'launch_day',
        title: 'Launch day checklist',
        why: 'A checklist keeps launch day calm and makes sure nothing breaks.',
        how: [
          'Test the checkout one more time.',
          'Publish the launch post and send the launch email.',
          'Be online to answer questions quickly.',
          'Celebrate every sale with the team!',
        ],
        fields: [
          num('first_day_sales', 'Launch day sales'),
          ta('lessons', 'What went well / what to improve'),
        ],
        doneWhen: 'The offer is live and the first sales are in.',
        minutes: 480,
      },
    ],
  },
  {
    key: 'grow',
    title: 'Grow & Optimise',
    goal: 'Use real data and feedback to improve the offer and scale what works.',
    steps: [
      {
        key: 'review_metrics',
        title: 'Review your 30-day numbers',
        why: 'Numbers tell you what to double down on and what to fix.',
        how: [
          'Record: visitors, leads, sales, revenue and conversion rate.',
          'Compare against your launch target.',
          'Circle the weakest number – that’s next month’s focus.',
        ],
        fields: [
          num('leads', 'Leads'),
          num('sales', 'Sales', { required: true }),
          num('revenue', 'Revenue (£)', { required: true }),
          t('focus', 'Focus for next month'),
        ],
        doneWhen: 'You know your numbers and your single focus for next month.',
        minutes: 45,
      },
      {
        key: 'feedback_loop',
        title: 'Collect feedback & testimonials',
        why: 'Customer feedback is the cheapest product research you will ever get.',
        how: [
          'Send a short feedback form to every customer.',
          'Ask happy customers for a review or referral.',
          'Log feature requests and complaints in one list.',
        ],
        fields: [
          list('requests', 'Top requests'),
          num('reviews', 'New reviews collected'),
        ],
        doneWhen: 'Feedback is collected and reviewed monthly.',
        minutes: 60,
      },
      {
        key: 'next_quarter',
        title: 'Plan the next 90 days',
        why: 'A 90-day plan keeps growth focused instead of scattered.',
        how: [
          'Pick 3 goals for the quarter (e.g. revenue, customers, new offer).',
          'Break each goal into monthly milestones.',
          'Send the milestones to the Task Manager.',
        ],
        fields: [
          list('goals', '3 goals for the next 90 days', { required: true }),
        ],
        doneWhen: 'Three goals with milestones are in the Task Manager.',
        minutes: 60,
        tasks: [{ title: 'Break 90-day goals into monthly milestones', priority: 'medium', days: 7 }],
      },
    ],
  },
];

export const STAGE_KEYS = STAGES.map((s) => s.key);

/** Steps that apply to a project kind, flattened with their stage + order. */
export function stepsFor(kind) {
  const out = [];
  let position = 0;
  for (const stage of STAGES) {
    for (const step of stage.steps) {
      if (step.kinds && !step.kinds.includes(kind)) continue;
      out.push({ ...step, stage_key: stage.key, position: position++ });
    }
  }
  return out;
}

export function findStep(stepKey) {
  for (const stage of STAGES) {
    const step = stage.steps.find((s) => s.key === stepKey);
    if (step) return { stage, step };
  }
  return null;
}

/** Returns the list of missing required fields for a step's answers. */
export function missingRequired(step, answers = {}) {
  return step.fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = answers[f.key];
      if (f.type === 'list') return !Array.isArray(v) || v.filter((x) => String(x).trim()).length === 0;
      return v === undefined || v === null || String(v).trim() === '';
    })
    .map((f) => f.label);
}

/** Pricing maths shown on the unit economics step. */
export function computeEconomics(allAnswers) {
  const price = Number(allAnswers.pricing_model?.price) || 0;
  const unitCost = Number(allAnswers.cost_to_deliver?.unit_cost) || 0;
  const fixed = Number(allAnswers.unit_economics?.fixed_costs) || 0;
  const goal = Number(allAnswers.unit_economics?.income_goal) || 0;
  const profitPerSale = price - unitCost;
  const margin = price > 0 ? Math.round((profitPerSale / price) * 100) : 0;
  const breakEvenSales = profitPerSale > 0 ? Math.ceil(fixed / profitPerSale) : null;
  const salesForGoal = profitPerSale > 0 ? Math.ceil((fixed + goal) / profitPerSale) : null;
  let verdict = 'Add a price and cost to see your numbers.';
  if (price > 0) {
    if (profitPerSale <= 0) verdict = 'You lose money on every sale – raise the price or lower costs.';
    else if (margin < 30) verdict = 'Thin margin. Consider raising the price or adding a premium tier.';
    else if (margin < 50) verdict = 'Healthy for products. Services should aim higher.';
    else verdict = 'Strong margin – you have room to invest in marketing.';
  }
  return { price, unitCost, profitPerSale, margin, breakEvenSales, salesForGoal, verdict };
}

/** Assembles a sales page draft from answers gathered in earlier steps. */
export function salesPageDraft(a) {
  const lines = [];
  const name = a.positioning?.name || a.idea_statement?.working_name || 'Your offer';
  lines.push(`# ${a.sales_page?.headline || a.transformation?.after || name}`);
  if (a.idea_statement?.statement) lines.push(a.idea_statement.statement);
  if (a.problem_pain?.pains?.length) lines.push('## Sound familiar?', ...a.problem_pain.pains.map((p) => `- ${p}`));
  if (a.transformation?.after) lines.push('## Imagine instead…', a.transformation.after);
  if (a.core_offer?.deliverables?.length) lines.push(`## What you get with ${name}`, ...a.core_offer.deliverables.map((d) => `- ${d}`));
  if (a.value_stack?.bonuses?.length) lines.push('## Bonuses', ...a.value_stack.bonuses.map((b) => `- ${b}`));
  if (a.social_proof?.testimonials?.length) lines.push('## What customers say', ...a.social_proof.testimonials.map((q) => `> ${q}`));
  if (a.pricing_model?.price) lines.push('## Price', `£${a.pricing_model.price}`);
  if (a.guarantee?.wording) lines.push('## Our guarantee', a.guarantee.wording);
  lines.push('## Ready?', '[Get started →]');
  return lines.join('\n\n');
}

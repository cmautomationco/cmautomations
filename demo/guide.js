// The test-build walkthrough: [instruction, screen to open]. Shown in the app's
// Walkthrough panel and written to docs/WALKTHROUGH.md by the build script.
export const GUIDE = [
  {
    title: 'Getting started',
    intro: 'This is the full system running in your browser with a demo business, Bright Path Coaching. Everything you change is saved in this browser.',
    steps: [
      ['Sign in. The demo email and password (demo1234) are already filled in, so just press Sign in.', '#/login'],
      ['Use the business switcher at the top to jump between businesses: Bright Path Coaching, Glow Studio, Swift Plumbing & Heating (a plumber with their phone and WhatsApp linked in) and CM Automations (your agency). Each has its own data and branding.', null],
      ['To see it the way a client does, sign out and sign in as dave@swiftplumbing.co.uk (password demo1234) – the owner of Swift Plumbing & Heating.', null],
      ['Use Reset data at the bottom of the screen at any time to go back to the original demo.', null],
    ],
  },
  {
    title: 'Dashboard',
    intro: 'Today across the whole business: time saved, pipeline, leads, tasks, content and team wins.',
    steps: [
      ['Tick a task under “My focus today” to complete it.', '#/'],
      ['Press “Give kudos” to thank a teammate. They get a notification.', '#/'],
      ['Click a build under “Build Funnel progress” to jump straight into it.', '#/'],
    ],
  },
  {
    title: 'Build Funnel',
    intro: 'The guided journey from idea to fully built product or service.',
    steps: [
      ['Open “Confidence Accelerator”. It is on Stage 3, Offer Design.', '#/funnel'],
      ['On “Build the value stack & bonuses”, add a bonus, press Save progress, then Mark complete. It moves you to the next step.', '#/funnel'],
      ['Fill in the required fields (marked *) for the guarantee and name & positioning steps, then mark them complete. When the stage finishes, an automation tells the team and creates a kick-off task.', '#/funnel'],
      ['Click a locked stage at the top to preview its steps. Stages unlock in order.', '#/funnel'],
      ['Press “Send to tasks” on any step to turn it into Task Manager tasks with a checklist.', '#/funnel'],
      ['Press “New build” to start your own product or service from scratch.', '#/funnel'],
    ],
  },
  {
    title: 'Content Studio',
    intro: 'Strategy, then ideas, then the brief. You create and finalise, then the system publishes.',
    steps: [
      ['Strategy: edit the audience, pains or offers and press Save strategy. Add or edit a content pillar.', '#/content/strategy'],
      ['Idea Lab: choose a pillar, platform or funnel stage, then press Generate ideas. Shortlist or archive ideas.', '#/content/ideas'],
      ['Press Create on an idea to open its creation brief: hooks, structure, call to action and how to make it.', '#/content/ideas'],
      ['Write your final version on the right, press Finalise content, then pick a channel and time and press Schedule post.', '#/content/create'],
      ['Calendar: click any post to Publish now, Reschedule or Cancel it. Due posts publish automatically while the page is open.', '#/content/calendar'],
      ['Creation Academy: short lessons on each content format.', '#/content/academy'],
    ],
  },
  {
    title: 'CRM',
    intro: 'Leads, deals and follow-ups, with the admin automated.',
    steps: [
      ['Press Add lead and save it. Watch the automation create a welcome-call task and a follow-up date.', '#/crm/contacts'],
      ['Click a contact to open their timeline. Log a call with a follow-up date, or change their stage.', '#/crm/contacts'],
      ['Pipeline: drag a deal to Proposal (creates a chase task) or Won (marks them a customer and starts onboarding).', '#/crm/pipeline'],
      ['Click any deal to edit its value, stage, owner or close date. Use New deal to add one.', '#/crm/pipeline'],
      ['Type a name in the search bar at the top and press Enter to find a contact.', '#/crm/contacts'],
    ],
  },
  {
    title: 'Tasks',
    intro: 'The team’s day-to-day work. Many tasks are created by automations.',
    steps: [
      ['Drag tasks between To do, In progress, Review and Done.', '#/tasks'],
      ['Press New task. Add a checklist and set it to repeat weekly. Completing it creates the next one.', '#/tasks'],
      ['Open My day and tick tasks off. Use “Just me” to see only your tasks.', '#/tasks/today'],
    ],
  },
  {
    title: 'Automations',
    intro: 'WHEN something happens, IF it matches, THEN the system does the work.',
    steps: [
      ['Switch an automation on or off with its toggle.', '#/automations'],
      ['Press Edit on one to see its trigger, conditions and actions, or Duplicate it.', '#/automations'],
      ['Press New automation and build your own. Use {{contact.first_name}} style placeholders in text.', '#/automations'],
      ['Check the activity log and the time-saved chart to see everything it has done.', '#/automations'],
      ['Press “Watch the walkthrough” for the client presentation: the onboarding journey, how it works and live examples. Use ← → to move, Notes for what to say, Present for full screen.', '#/automations/presentation'],
    ],
  },
  {
    title: 'Assistant (chat)',
    intro: 'The round chat button in the bottom-right corner, on every page. It finds the answer and takes you there.',
    steps: [
      ['Open the assistant and ask “What do I need to do today?” – it answers from your real tasks and opens My day.', null],
      ['Ask “How do I add a new lead?” – it opens the new lead form for you.', null],
      ['Say “I don’t know what to post” – it opens the Idea Lab and points at the Generate ideas button.', null],
      ['Type “Remind me to call Emma tomorrow” – it creates the task with tomorrow’s date.', null],
      ['Type “find Emma” or “take me to the pipeline” to jump straight there.', null],
      ['Type “Report a problem: customers can’t pay on the booking page” – it logs an urgent Help Desk issue and alerts the right person.', null],
      ['In Swift Plumbing & Heating ask “any missed calls?”, “who owes me money?”, “what jobs have I got today?” or “how do I link my WhatsApp?” – it answers from the real data and opens the right page.', null],
      ['Ask something it can’t answer – it offers to log it for the team so a person picks it up.', null],
    ],
  },
  {
    title: 'Help Desk',
    intro: 'Every problem tracked until it’s sorted, with response targets and automatic escalation.',
    steps: [
      ['Open the Help Desk and look at the open issues, including ones raised by the assistant.', '#/helpdesk'],
      ['Press “New issue”, describe a problem, pick a priority and raise it. It’s assigned automatically.', '#/helpdesk'],
      ['Click an issue to add an update, change its priority or reassign it.', '#/helpdesk'],
      ['Write how it was fixed and press “Mark resolved” – whoever raised it gets a notification.', '#/helpdesk'],
      ['Check “What people ask the assistant” to see where your team or clients get stuck.', '#/helpdesk'],
    ],
  },
  {
    title: 'Messages, calls & WhatsApp (trades)',
    intro: 'Switch to Swift Plumbing & Heating first. Calls to the business number ring Dave’s mobile; missed callers are texted straight back; every WhatsApp and text lands here and on the customer’s record, so nothing is missed while he’s on the tools.',
    steps: [
      ['Open Messages. Hannah’s WhatsApp about a burst pipe is flagged 🚨 at the top, with an urgent reply task and an alert already sent to Dave’s phone.', '#/messages'],
      ['Type a reply and press Send. It goes by WhatsApp (shown as “Demo – not actually sent”) and the reply task is ticked off.', '#/messages'],
      ['Press “Book” in the conversation to book Hannah in as an emergency straight from the chat.', '#/messages'],
      ['Press “Test a missed call”, then “Ring and miss it”. The caller is texted back in seconds with the booking link, and a call-back task appears. Look in the Calls tab.', '#/messages/calls'],
      ['Press “Test an incoming WhatsApp” and try the presets: “🚨 Leak” (emergency), “C” or “R” from a customer with a booking (confirms or flags it to rearrange) and “STOP” (opts them out).', '#/messages'],
      ['“Sent to your phone” shows every alert the team’s mobile received: new messages, missed calls, new bookings and the morning job sheet.', '#/messages/alerts'],
      ['Settings → Phone & WhatsApp holds the business number, the mobile calls ring, alert settings, emergency words and quiet hours, plus the one-off steps to go live with Twilio.', '#/settings/phone'],
      ['Settings → Message wording lets you edit every automatic message (missed-call text, reminders, invoice chasers).', '#/settings/wording'],
    ],
  },
  {
    title: 'Bookings & reminders',
    intro: 'The diary, online booking and automatic reminders that cut no-shows.',
    steps: [
      ['Open Bookings to see the week. Emily has replied R (wants to rearrange) and Priya replied C (confirmed).', '#/bookings'],
      ['Click a booking to open it: send “On my way”, mark it Done (drafts the invoice and queues a review request), move it, send a reminder now or cancel it.', '#/bookings'],
      ['Today’s jobs is the job sheet for the van: call, WhatsApp, directions, “On my way” with an ETA, Done and No-show.', '#/bookings/today'],
      ['Press “New booking” to book a job taken by phone or WhatsApp. Set Urgency to Emergency for call-outs.', '#/bookings'],
      ['Press “Copy booking link” and open it in a new tab: pick a service, a day and a time and book as a customer. It lands in the diary, the CRM and the team’s phone.', '#/bookings'],
      ['Services: add what customers can book, the price and an optional deposit. Hours & reminders: opening hours, how many jobs at once, reminder times, the morning job sheet and time off.', '#/bookings/services'],
      ['The calendar link under “Sync to Google, Outlook or iPhone” puts every booking in your phone’s calendar (on the live system).', '#/bookings'],
    ],
  },
  {
    title: 'Quotes, invoices & payments',
    intro: 'Won deal or finished job → quote → invoice → paid, with automatic chasing.',
    steps: [
      ['Open Quotes & invoices. Lucy’s invoice is overdue and the friendly reminder has already gone; a firmer one follows at 7 days and a call task at 14.', '#/invoices'],
      ['Click an invoice, then “Customer view”. Press “Pay by card” – the test build shows a pretend card form. Pay it and the invoice is marked paid and a thank-you is sent.', '#/invoices'],
      ['Quotes: open Tom’s boiler quote and its customer view. Type a name and press Accept quote – the deal moves to Won and a “book the work in” task appears. Then press “Turn into invoice”.', '#/invoices/quotes'],
      ['Press “New quote” or “New invoice”, add lines and press Save & send. On a deal in the CRM pipeline you can also press Create quote or Create invoice.', '#/invoices'],
      ['Settings: VAT, bank details for bank transfers, numbering and the chasing schedule.', '#/invoices/settings'],
    ],
  },
  {
    title: 'Lead forms & branding',
    intro: 'Website enquiries straight into the CRM, and each business in its own colours.',
    steps: [
      ['CRM → Lead forms: open the “Website – free quote” form, fill it in as a customer, then see the new lead, its thank-you message and its welcome-call task.', '#/crm/forms'],
      ['Press “New form” to build your own, then “Copy embed code” to put it on a website.', '#/crm/forms'],
      ['Settings → Branding: change the logo, name and colour. The app and every customer page (booking page, quotes, invoices, forms, reports) use it.', '#/settings/branding'],
    ],
  },
  {
    title: 'Agency control centre',
    intro: 'Your view across every client business, the audit → proposal → new client flow, and monthly reports.',
    steps: [
      ['Press Agency in the menu. Each client has a health score, hours saved and a list of what needs attention – click an item to jump into that client’s system.', '#/agency'],
      ['Press “Branding & details” on a client to set their logo, colour, contact and monthly fee.', '#/agency'],
      ['Audits & proposals: open “Bright Sparks Electrical” to see the scored audit and proposal, then “Preview proposal” to see what the client sees.', '#/agency/audits'],
      ['Press “New audit”: fill in the client, the discovery call and the time audit, then “Score it & write the proposal”. Send it, open the proposal link and accept it – the client’s branded system is created with a kick-off task.', '#/agency/audits'],
      ['Monthly reports: open Swift’s September report (hours saved, missed calls texted back, bookings, money collected), or build and send one for another client.', '#/agency/reports'],
    ],
  },
  {
    title: 'Settings & notifications',
    intro: 'Business details, team, channels and extra businesses.',
    steps: [
      ['Change the business name or niche and press Save.', '#/settings'],
      ['Add a team member, connect a publishing channel, or switch a channel off.', '#/settings'],
      ['Press “Add another business” to set up a new business in any niche. It comes ready with pillars, channels and automations.', '#/settings'],
      ['Press the bell at the top to read notifications from automations and kudos.', null],
    ],
  },
  {
    title: 'What this test build simulates',
    intro: 'Everything works end to end, with these limits for now:',
    steps: [
      ['Posts are “published” in demo mode. Connecting real Instagram, TikTok and other accounts comes in the full build.', null],
      ['The assistant here uses the built-in engine. On the full server, adding an Anthropic API key upgrades it to Claude for open-ended questions.', null],
      ['Emails, texts and WhatsApp messages are not actually sent (they show as “Demo – not actually sent”). On the live server, adding Twilio and email keys sends them for real, and calls to the business number are forwarded and texted back.', null],
      ['Card payments use a pretend card form. On the live server they go through Stripe and are marked paid automatically.', null],
      ['Calls and WhatsApp messages from customers are simulated with the Test buttons in Messages – a browser page can’t receive real calls.', null],
      ['Your data is saved in this browser only, so other people opening the link start with the demo data.', null],
      ['Timed automations (publishing, booking reminders, the morning job sheet, invoice chasing, follow-ups and monthly reports) run every 30 seconds while the page is open.', null],
    ],
  },
];

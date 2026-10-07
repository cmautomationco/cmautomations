// The test-build walkthrough: [instruction, screen to open]. Shown in the app's
// Walkthrough panel and written to docs/WALKTHROUGH.md by the build script.
export const GUIDE = [
  {
    title: 'Getting started',
    intro: 'This is the full system running in your browser with a demo business, Bright Path Coaching. Everything you change is saved in this browser.',
    steps: [
      ['Sign in. The demo email is already filled in and no password is needed while you test – just press Sign in.', '#/login'],
      ['Use the business switcher at the top to jump between Bright Path Coaching and Glow Studio. Each business has its own data.', null],
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
      ['Emails and texts are not sent; notifications appear in the bell instead.', null],
      ['Your data is saved in this browser only, so other people opening the link start with the demo data.', null],
      ['Timed automations (publishing, overdue reminders, follow-ups) run every 30 seconds while the page is open.', null],
    ],
  },
];

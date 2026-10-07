# CM Automations – test build walkthrough

Open the test build, sign in with the pre-filled demo details, then work through each section.
Every step below matches the **Walkthrough** panel inside the app (bottom of the screen), where each step has an **Open** button that takes you to the right screen.

## 1. Getting started

This is the full system running in your browser with a demo business, Bright Path Coaching. Everything you change is saved in this browser.

- [ ] Sign in. The demo email is already filled in and no password is needed while you test – just press Sign in.
- [ ] Use the business switcher at the top to jump between Bright Path Coaching and Glow Studio. Each business has its own data.
- [ ] Use Reset data at the bottom of the screen at any time to go back to the original demo.

## 2. Dashboard

Today across the whole business: time saved, pipeline, leads, tasks, content and team wins.

- [ ] Tick a task under “My focus today” to complete it.
- [ ] Press “Give kudos” to thank a teammate. They get a notification.
- [ ] Click a build under “Build Funnel progress” to jump straight into it.

## 3. Build Funnel

The guided journey from idea to fully built product or service.

- [ ] Open “Confidence Accelerator”. It is on Stage 3, Offer Design.
- [ ] On “Build the value stack & bonuses”, add a bonus, press Save progress, then Mark complete. It moves you to the next step.
- [ ] Fill in the required fields (marked *) for the guarantee and name & positioning steps, then mark them complete. When the stage finishes, an automation tells the team and creates a kick-off task.
- [ ] Click a locked stage at the top to preview its steps. Stages unlock in order.
- [ ] Press “Send to tasks” on any step to turn it into Task Manager tasks with a checklist.
- [ ] Press “New build” to start your own product or service from scratch.

## 4. Content Studio

Strategy, then ideas, then the brief. You create and finalise, then the system publishes.

- [ ] Strategy: edit the audience, pains or offers and press Save strategy. Add or edit a content pillar.
- [ ] Idea Lab: choose a pillar, platform or funnel stage, then press Generate ideas. Shortlist or archive ideas.
- [ ] Press Create on an idea to open its creation brief: hooks, structure, call to action and how to make it.
- [ ] Write your final version on the right, press Finalise content, then pick a channel and time and press Schedule post.
- [ ] Calendar: click any post to Publish now, Reschedule or Cancel it. Due posts publish automatically while the page is open.
- [ ] Creation Academy: short lessons on each content format.

## 5. CRM

Leads, deals and follow-ups, with the admin automated.

- [ ] Press Add lead and save it. Watch the automation create a welcome-call task and a follow-up date.
- [ ] Click a contact to open their timeline. Log a call with a follow-up date, or change their stage.
- [ ] Pipeline: drag a deal to Proposal (creates a chase task) or Won (marks them a customer and starts onboarding).
- [ ] Click any deal to edit its value, stage, owner or close date. Use New deal to add one.
- [ ] Type a name in the search bar at the top and press Enter to find a contact.

## 6. Tasks

The team’s day-to-day work. Many tasks are created by automations.

- [ ] Drag tasks between To do, In progress, Review and Done.
- [ ] Press New task. Add a checklist and set it to repeat weekly. Completing it creates the next one.
- [ ] Open My day and tick tasks off. Use “Just me” to see only your tasks.

## 7. Automations

WHEN something happens, IF it matches, THEN the system does the work.

- [ ] Switch an automation on or off with its toggle.
- [ ] Press Edit on one to see its trigger, conditions and actions, or Duplicate it.
- [ ] Press New automation and build your own. Use {{contact.first_name}} style placeholders in text.
- [ ] Check the activity log and the time-saved chart to see everything it has done.

## 8. Assistant (chat)

The round chat button in the bottom-right corner, on every page. It finds the answer and takes you there.

- [ ] Open the assistant and ask “What do I need to do today?” – it answers from your real tasks and opens My day.
- [ ] Ask “How do I add a new lead?” – it opens the new lead form for you.
- [ ] Say “I don’t know what to post” – it opens the Idea Lab and points at the Generate ideas button.
- [ ] Type “Remind me to call Emma tomorrow” – it creates the task with tomorrow’s date.
- [ ] Type “find Emma” or “take me to the pipeline” to jump straight there.
- [ ] Type “Report a problem: customers can’t pay on the booking page” – it logs an urgent Help Desk issue and alerts the right person.
- [ ] Ask something it can’t answer – it offers to log it for the team so a person picks it up.

## 9. Help Desk

Every problem tracked until it’s sorted, with response targets and automatic escalation.

- [ ] Open the Help Desk and look at the open issues, including ones raised by the assistant.
- [ ] Press “New issue”, describe a problem, pick a priority and raise it. It’s assigned automatically.
- [ ] Click an issue to add an update, change its priority or reassign it.
- [ ] Write how it was fixed and press “Mark resolved” – whoever raised it gets a notification.
- [ ] Check “What people ask the assistant” to see where your team or clients get stuck.

## 10. Settings & notifications

Business details, team, channels and extra businesses.

- [ ] Change the business name or niche and press Save.
- [ ] Add a team member, connect a publishing channel, or switch a channel off.
- [ ] Press “Add another business” to set up a new business in any niche. It comes ready with pillars, channels and automations.
- [ ] Press the bell at the top to read notifications from automations and kudos.

## 11. What this test build simulates

Everything works end to end, with these limits for now:

- [ ] Posts are “published” in demo mode. Connecting real Instagram, TikTok and other accounts comes in the full build.
- [ ] The assistant here uses the built-in engine. On the full server, adding an Anthropic API key upgrades it to Claude for open-ended questions.
- [ ] Emails and texts are not sent; notifications appear in the bell instead.
- [ ] Your data is saved in this browser only, so other people opening the link start with the demo data.
- [ ] Timed automations (publishing, overdue reminders, follow-ups) run every 30 seconds while the page is open.

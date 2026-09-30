# CM Automations

**One automated operating system you can roll out to any business, in any niche.**

It has three connected systems plus an automation engine that links them:

| System | What it does |
|---|---|
| 🚀 **Build Funnel** | Takes a product or service from a rough idea to fully built and launched, in **9 stages and 36 guided steps**. Each step says why it matters, what to do and when it's done. |
| ✨ **Content Studio** | Builds the content strategy and generates the ideas and creation briefs. It teaches the client how to make each piece. The client finalises it, and the system publishes it at the scheduled time. |
| 👥 **CRM** + ✅ **Task Manager** | Handles leads, the deal pipeline, follow-ups and the team's daily tasks. Automations do the routine admin, and team wins and kudos help keep morale up. |
| ⚡ **Automation engine** | Uses WHEN → IF → THEN rules to connect all of the above. It also logs the time it saves each business. |

The design uses sky blue on a white background with black text. Headers and key figures are in blue text or have a blue highlight.

---

## Screenshots

All screenshots come from the running app with the built-in demo business (`npm run screenshots` regenerates them).

### Dashboard
![Dashboard](docs/screenshots/01-dashboard.png)

### Build Funnel
| Overview of builds & the 9-stage journey | A guided step with its worksheet |
|---|---|
| ![Funnel overview](docs/screenshots/02-build-funnel-overview.png) | ![Funnel step](docs/screenshots/04-build-funnel-worksheet.png) |

![Funnel pricing step](docs/screenshots/03-build-funnel-step.png)

### Content Studio
| Idea Lab | Creation brief → client finalises |
|---|---|
| ![Idea Lab](docs/screenshots/05-content-idea-lab.png) | ![Creation brief](docs/screenshots/06-content-creation-brief.png) |

| Creation board | Scheduling calendar |
|---|---|
| ![Creation board](docs/screenshots/07-content-creation-board.png) | ![Calendar](docs/screenshots/08-content-calendar.png) |

| Strategy (brand profile & pillars) | Creation Academy |
|---|---|
| ![Strategy](docs/screenshots/09-content-strategy.png) | ![Academy](docs/screenshots/15-content-academy.png) |

### CRM
| Pipeline | Contacts & timeline |
|---|---|
| ![Pipeline](docs/screenshots/10-crm-pipeline.png) | ![Contacts](docs/screenshots/11-crm-contacts.png) |

### Tasks & Automations
| Task board | My day |
|---|---|
| ![Tasks](docs/screenshots/12-tasks-board.png) | ![My day](docs/screenshots/13-tasks-my-day.png) |

![Automations](docs/screenshots/14-automations.png)

---

## Quick start

Requirements: **Node.js 22.13 or newer**. The database is SQLite, built into Node, so there's nothing else to install.

```bash
npm install
npm start            # http://localhost:3000
```

On first start the server seeds a demo business. Sign in with:

- **Email:** `demo@cmautomations.com`
- **Password:** `demo1234`

Other commands:

```bash
npm run dev          # restart on file changes
npm run seed         # reset the database with fresh demo data
npm test             # API + automation test suite
npm run screenshots  # regenerate docs/screenshots (uses Playwright)
```

Configuration is in `.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Web + API port |
| `DATABASE_PATH` | `./data/cm-automations.db` | SQLite file |
| `SCHEDULER_INTERVAL_SECONDS` | `30` | How often publishing, reminders and follow-ups run |
| `ANTHROPIC_API_KEY` | – | Optional. Turns on AI idea generation (Claude) in the Idea Lab. Without it, the built-in idea engine is used. |

---

## Rolling it out to a new business

1. The business signs up (or you use **Settings → Add another business** to run several businesses from one login).
2. They choose a **niche**. The system then loads:
   - an audience profile, pains, desires and offers
   - 4 content pillars and default publishing channels
   - all 9 recommended automations, switched on
3. They start a build in **Build Funnel**, generate ideas in **Content Studio** and add leads in the **CRM**. The automations handle the rest.

Supported niches: Coaching & Consulting, E-commerce, Local Services & Trades, Health & Fitness, Beauty & Salon, Hospitality & Food, Agency & Creative, Real Estate, and Software & Tech. You add a niche with one entry in `server/modules/core/niches.js`.

---

## How each system works

### 1. Build Funnel: from idea to fully built

| # | Stage | Steps |
|---|---|---|
| 1 | Idea & Clarity | One-sentence idea · ideal customer · problem & pain · transformation · your edge |
| 2 | Market Validation | Competitor scan · 10 customer conversations · demand signals · go / pivot / stop |
| 3 | Offer Design | Core offer · value stack & bonuses · guarantee · name & positioning |
| 4 | Pricing & Economics | Cost to deliver · pricing model & tiers · **auto-calculated unit economics** · payments |
| 5 | Build | *Product:* MVP scope, suppliers, prototype · *Service:* delivery map, templates & SOPs, onboarding · pilot with real customers |
| 6 | Brand & Sales Assets | Brand basics · **sales page draft auto-written from earlier answers** · lead magnet · social proof |
| 7 | Operations & Systems | Legal & admin · tool stack · switch on automations · support process |
| 8 | Launch | Launch plan · pre-launch content (links to Content Studio) · warm outreach · launch-day checklist |
| 9 | Grow & Optimise | 30-day numbers · feedback loop · 90-day plan |

- Every step has **Why this matters**, numbered **Do this** instructions, a **worksheet**, and a **Done when** finish line.
- Required answers are checked before a step can be completed, and stages unlock in order so nothing gets skipped.
- **Send to tasks** turns a step into Task Manager tasks, with its instructions as a checklist.
- Finishing a stage tells the team and creates a kick-off task for the next stage.
- The blueprint lives in `server/modules/funnel/blueprint.js`. Improve it once and every business gets the change.

### 2. Content Studio: strategy → ideas → brief → *client creates* → auto-publish

1. **Strategy:** a brand and audience profile plus content pillars, pre-filled from the niche.
2. **Idea Lab:** the idea engine combines 15 proven content frameworks with the business's pillars, pains, desires, offers and platforms. It scores each idea. Ideas are balanced across the customer journey (40% awareness, 30% consideration, 20% conversion, 10% retention), and the engine favours stages that are under-represented. With `ANTHROPIC_API_KEY` set you can also pick **AI (Claude)** as the engine.
3. **Creation brief:** 3 hook options, the structure, audience, tone, call to action, hashtags, step-by-step *how to create this format* instructions, and a pre-publish checklist.
4. **The client finalises:** they write the final caption or script in their own words and add the media link. Only finalised content can be scheduled.
5. **Schedule:** choose channels and a time, or use one of the suggested free slots. The scheduler publishes it automatically, retries failures and raises an urgent fix task if a post still fails.
6. **Creation Academy:** short lessons on Reels and TikTok, carousels, stories, text posts, YouTube, newsletters, hooks and batching.

**Publishing adapters** (`server/automation/publishers.js`):
- `webhook` sends the post to Zapier, Make, n8n, Buffer or your own integration, which posts it to the real platform.
- `simulated` is for demos and training.

Native platform APIs can be added as new adapters with the same signature.

### 3. CRM & Task Manager: day-to-day admin handled

- **CRM:** contacts with lifecycle stages, a drag-and-drop deal pipeline, an activity timeline, follow-up dates and bulk import.
- **Tasks:** a Kanban board and a **My day** view, with priorities, checklists, recurring tasks and team workload.
- **Morale:** a team wins feed (completed tasks and won deals), kudos with notifications, and workload balancing.

### ⚡ Built-in automations (installed for every business)

| When… | …the system |
|---|---|
| A lead is added | Creates a welcome-call task for tomorrow, sets a 3-day follow-up and logs it on the timeline |
| A follow-up date arrives | Creates a follow-up task |
| A deal moves to Proposal | Creates a chase task for 3 days later and marks the contact as a prospect |
| A deal is won | Marks the contact as a customer, creates an onboarding checklist task and tells the team |
| A deal is lost | Creates a feedback task and a 90-day check-in |
| A task is overdue | Reminds the assignee (once) |
| A funnel stage is completed | Tells the team and creates a kick-off task for the next stage |
| Content is finalised | Tells admins it's ready to schedule |
| A post fails to publish | Creates an urgent fix task with the error |
| Every morning | Sends each person their plan for the day |
| A recurring task is completed | Creates the next occurrence |

Businesses can switch any of these off, duplicate and edit them, or build their own in the visual **WHEN → IF → THEN** builder.

The available actions are: create a task, notify someone, update a contact, set a follow-up, log a CRM activity, and send to a webhook. Every run is logged with an estimate of the minutes saved, and that estimate drives the **time saved** figures in the app.

---

## Architecture

```
server/
  index.js                 starts the API, web app and scheduler
  app.js                   Express app (mounted by tests too)
  config.js                .env loading
  db/schema.sql            multi-tenant schema (every row has org_id)
  db/index.js              node:sqlite wrapper + JSON column helpers
  db/seed.js               demo business
  lib/auth.js              scrypt passwords, bearer-token sessions, roles
  lib/util.js              ids, dates, validation, templating
  automation/
    engine.js              triggers, conditions, actions, run log
    recipes.js             default automations per business
    scheduler.js           publishing, overdue, follow-ups, daily digest
    publishers.js          channel adapters (simulated, webhook)
    routes.js              /api/automations
  modules/
    core/                  auth, businesses, team, notifications, kudos, dashboard, niches
    funnel/                blueprint.js (the 9-stage journey) + routes
    content/               idea engine, briefs, academy, optional Claude AI, routes
    crm/                   contacts, deals, activities
    tasks/                 task service (recurrence) + routes
public/                    front end: plain ES modules, no build step
  css/app.css              design system (sky blue / white / black)
  js/app.js                router + layout
  js/pages/*.js            one file per module
tests/api.test.js          end-to-end API + automation tests
scripts/screenshots.mjs    renders every module to docs/screenshots
```

**Design choices**

- **Multi-tenant from day one.** Every table is scoped by `org_id`, and one login can belong to several businesses and switch between them.
- **Few dependencies.** Express is the only required package. SQLite is built into Node and there is no front-end build step, so moving the system to a new server or business is `npm install && npm start`.
- **Automations run synchronously.** The API response already includes their results, so the UI can show "⚡ automation ran" straight away, and the work stays predictable and testable.

### API overview

All endpoints are under `/api` and use `Authorization: Bearer <token>`, except the auth endpoints.

| Area | Endpoints |
|---|---|
| Auth & business | `POST /auth/register`, `POST /auth/login`, `POST /auth/switch`, `GET /me`, `POST /orgs`, `PATCH /org`, `GET/POST /team`, `GET /notifications`, `GET/POST /kudos`, `GET /dashboard` |
| Build Funnel | `GET /funnel/blueprint`, `GET/POST /funnel/projects`, `GET/PATCH/DELETE /funnel/projects/:id`, `PATCH /funnel/projects/:id/steps/:step`, `POST /funnel/projects/:id/steps/:step/tasks` |
| Content | `GET/PUT /content/profile`, `/content/pillars`, `GET /content/ideas`, `POST /content/ideas/generate`, `POST /content/ideas/:id/brief`, `/finalise`, `/schedule`, `GET /content/calendar`, `GET /content/slots`, `PATCH /content/posts/:id`, `POST /content/posts/:id/publish-now`, `/content/channels`, `GET /content/academy` |
| CRM | `GET/POST /crm/contacts`, `POST /crm/contacts/import`, `GET/PATCH/DELETE /crm/contacts/:id`, `POST /crm/contacts/:id/activities`, `GET /crm/pipeline`, `POST /crm/deals`, `PATCH/DELETE /crm/deals/:id` |
| Tasks | `GET/POST /tasks`, `GET /tasks/workload`, `GET/PATCH/DELETE /tasks/:id` |
| Automations | `GET/POST /automations`, `PATCH/DELETE /automations/:id`, `POST /automations/:id/test`, `GET /automations/runs`, `GET /automations/impact`, `GET /automations/meta` |

---

## Credits

The Plus Jakarta Sans font is self-hosted under the SIL Open Font License.

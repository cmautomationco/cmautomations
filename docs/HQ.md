# HQ – your AI team

HQ is a command centre that runs alongside the main CM Automations dashboard. It's built around a team of AI "employees". Each one has its own desk. They check their part of the business every morning, sort out what they can, pass work to each other, and bring anything that needs a decision to **Your desk** for you to sign off.

Open it at **`/hq/`** on your server (or click **HQ · AI team** in the main sidebar). It uses the same sign-in as CM Automations.

## The team

| Agent | Desk | What it does |
|---|---|---|
| 💬 **Receptionist** | Leads | Auto-replies to every new enquiry (WhatsApp, Instagram, Facebook, email, website form) within a minute, 24/7. Captures name, business, need, budget and timeline, scores the lead, flags scams, and hands warm and hot leads to the Deal Manager. |
| 📨 **Deal Manager** | Inbox | Drafts a reply and a quote from your rate card for every deal. Follows up deals that go quiet (up to 3 nudges) and checks each contract against the quote before you sign. Also reaches out to leads that went cold and pitches rebooks to clients who are due one. |
| 🗂️ **Project Manager** | Projects | Keeps live jobs moving: books a kickoff for every signed job, flags anything past its due date, opens a job when a contract is signed, and briefs the Scriptwriter when a job includes content. |
| ✍️ **Scriptwriter** | Scripting | Turns briefs into short-form scripts (hook, body, call to action) in your voice, ready for you to sign off. |
| 💷 **Finance** | Income | Matches payments as they arrive and marks late invoices overdue. Chases them on a friendly → firmer → final ladder, raises deposit invoices when a contract is signed, and tells you when one needs a phone call. |

You can **hire more agents** (Briefing → *Hire another agent*, or Edit HQ → *Hire an agent*). Give each one a name, a job and written instructions. When Claude is connected, they follow those instructions on every run.

## How it works

- **Morning update.** The team checks in automatically the first time you open HQ each day. **Run morning update** makes them check in again at any time, and each desk has its own **Run** button.
- **Ask me first / Act on their own.** Each agent has an autonomy setting (Edit HQ → Your team). "Ask me first" puts everything on *Your desk* for sign-off. "Act on their own" sends it and tells you afterwards in *Team activity*.
- **Your desk.** Click **Review** on any item to see the draft, edit it, ask the agent to change it ("shorter", "firmer", "make it £1,200"), then approve or decline.
- **Team activity.** Every message an agent sends you or another agent, e.g. *Receptionist → Deal Manager: Hot lead: Apex Roofing wants a new website*.
- **Sync from CRM** (Leads desk) brings in recent CRM leads and invoices from the main CM Automations app.

## Claude

Set `ANTHROPIC_API_KEY` in `.env` and restart. The **Templates** pill at the top of HQ then turns into **Claude on**. After that:

- "Ask the agent to change it" accepts any instruction, not just the built-in ones.
- The Scriptwriter rewrites scripts on request.
- Agents you hire yourself follow their written instructions in the morning update.

Without a key, everything still works using built-in templates.

## Editing HQ

Everything is editable, either in the app or in the code.

**In the app**
- **Edit HQ** (sidebar): your details, quarter and target, colours (5 palettes, light/dark), every agent (name, emoji, colour, desk name, instructions, autonomy, on/off, order), the rate card the Deal Manager quotes from, and the agents' rules (follow-up days, cold-lead days, hot-lead score, scam words, chasing days).
- **The ✏️ buttons** on every lead, deal, job, script, invoice, client and calendar item. Every list has an Add button.
- **Leads desk:** edit the auto-reply message directly.
- **Your data:** Export / Import JSON (a full backup), **Start fresh** (clears demo records, keeps your team and settings), **Reset to demo**.

**In the code** (`public/hq/`)

| File | What's in it |
|---|---|
| `seed.js` | The starter data and the five default agents – the easiest place to change defaults. |
| `engine.js` | What each agent checks and does (`RUNS.receptionist`, `RUNS.deals`, …), the email/quote/chaser templates, and how they hand work to each other. |
| `app.js` | The pages: Briefing, Calendar, Clients, each desk, Edit HQ. |
| `hq.css` | The look. Colours are tokens at the top (`--a1`, `--a2`, `--a3`, `--bg`, `--panel`, …). |
| `store.js` | Saving: to your server when signed in, otherwise in the browser. |
| `server/modules/hq/` | The API (`/api/hq`): saving, live CRM data, and the Claude endpoints. |

HQ has no build step on the server – edit a file and refresh. `npm run build:hq` makes a single standalone file (`dist/hq/hq.html`) that runs anywhere, saving in the viewer's browser.

## Where the data lives

When you're signed in, HQ is one JSON document per business, saved on your server (`org_meta`, key `hq:state`), so it's the same on every device. Opened without the server, it saves in that browser instead. `npm test` covers the API and the agents (`tests/hq.test.js`).

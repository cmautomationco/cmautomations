# VSL: video sales letters

The back end for the video sales letter you send to brands, businesses and creators instead of normal outreach, which can later become a landing page. It lives in `server/modules/vsl/` and runs on the Automations service offer.

It has **no screens yet**. The design comes next. Everything below works through the API.

## How it fits together

```
foundation  ──►  niche pack  ──►  format  ──►  script  ──►  page  ──►  prospect links
(5 sections,     (fills the       (faceless,    (hook +       (hook       (one per brand,
 timings,         slots for one    voiceover,    line edits    variants,   so you see who
 rules)           kind of          on camera)    + real        button,     watched and who
                  business)                      proof)        breakdown)  clicked)
```

- **Foundation** (`foundation.js`): the five sections, their time windows, base slots, filming notes, honesty rules, the proof plan and the open decisions. This is your brief, word for word. Nothing else changes it.
- **Niche packs** (`niches.js`): fill the slots for one kind of business. `aesthetics_clinic` is v1 and uses your wording exactly. The others are starter drafts to check before you use them.
- **Formats** (`formats.js`): the same script made three ways. `faceless` is the one being made now.
- **Proof** (`proof.js`): real results, stored exactly as measured, with the honesty rules checked on every build.
- **Builder** (`builder.js`): turns all of the above into a full script with timings, on-screen cards or captions, a shot list and the checks.

## The foundation

| # | Section | Window | Base slot |
|---|---|---|---|
| 1 | The Hook | 0:00–0:05 | [who you're talking to] + [the problem costing them right now] |
| 2 | Problem & Agitation | 0:05–0:50 | [their day-to-day pain] → [what they've tried] → [what it's costing them] |
| 3 | The Solution | 0:50–2:20 | [your method in plain words] + [live demo] + [what changes for them] |
| 4 | Social Proof & Authority | 2:20–3:10 | [client result] + [a specific number] + [their words] |
| 5 | Call to Action | 3:10–3:30 | [the single action] + [what happens after they take it] |

The one next step is always to watch the full breakdown video under the VSL. The button under the video says the same words: **Watch the full breakdown**.

## Niche packs

| Pack | Status | Front door | Proof |
|---|---|---|---|
| `aesthetics_clinic` | **v1** (your wording) | Instagram DMs | Another niche: "same system, different front door" |
| `trades` | starter draft | Missed calls and texts | Same niche (the plumber) |
| `gym` | starter draft | DMs, website enquiries, missed calls | Another niche |
| `personal_trainer` | starter draft | Instagram DMs | Another niche |
| `online_coach` | starter draft | DMs and comments | Another niche |

`trades` covers plumbing, electrical and construction. Set `vars: { trade: "electrician", trade_plural: "electricians" }` on a script and every line changes, including "a"/"an".

For a niche that isn't listed, make your own based on the closest pack and change only what's different:

```
POST /api/vsl/niches
{ "label": "Dog groomers", "based_on": "aesthetics_clinic",
  "data": { "vars": { "business": "grooming salon", "business_plural": "grooming salons", ... },
            "hooks": ["..."], "what_changes": "..." } }
```

A pack can set: `vars`, `hooks` (up to 6), `problem` (the four beats + `sample_line`), `problem_lines` (what's said), `demo_lines`, `what_changes`, `proof_framing`, `proof_relation`, `cta_line`, `broll`.

## Formats

| Format | Status | How each line reaches the viewer |
|---|---|---|
| `faceless` | now | On-screen text cards (up to 9 words each, timed for reading) over b-roll and the screen recording. No face, no voice. The first card is on the first frame. |
| `voiceover` | next | Your voice over the same visuals. Captions on. |
| `on_camera` | later | Your face. The directions are the foundation's filming notes, word for word. |

`POST /api/vsl/scripts/:id/copy { "format": "voiceover" }` makes the next version and keeps your line edits.

## Proof and the honesty rules

Add each business you've built this for with `POST /api/vsl/proof`. Every build checks:

- **"Clients"**: in the proof and CTA, "client" is blocked unless that business paid. Say "businesses I've built this for".
- **No rounding**: every number in a proof line must match a recorded number exactly. "Over 40", "50+", "about £1k" and "hundreds" are blocked.
- **Small numbers are shown**: 3 enquiries and 0 bookings print as they are.
- **Blurred**: every screenshot must be marked `blurred: true`.
- **Checklist**: period, enquiries answered, recovered, bookings, log sheet screenshot, weekly report screenshot, their words, permission, and whether they paid.

A script can't leave `draft` until there are no errors. Warnings (timing, a starter-draft pack, proof from another niche) don't block it.

**v2:** swap in results from your first businesses in the niche on the founding rate (£150/month in exchange for a named case study). For every pack except `trades`, the build reminds you of this.

## Pages, prospect links and hook tests

1. `POST /api/vsl/pages` with one or more `variants` (each one is a script, usually with a different hook). Each visitor always sees the same variant.
2. Add each variant's `video_url` and the `breakdown_video_url`, then `PUT { "status": "live" }`. It won't go live with a draft script or a missing video.
3. `POST /api/vsl/pages/:id/shares` makes a personal link for one prospect, optionally tied to a CRM contact and pinned to one hook. When they open it, it's logged on their timeline. When they click **Watch the full breakdown**, you get a notification and a high-priority follow-up task (one per prospect, however many times they click).
4. `GET /api/vsl/pages/:id/stats` shows, per hook: views, plays, how many got past the hook, how many reached each section, button clicks, breakdown plays and completions, and booked calls. It won't name a winning hook until each one has 30 plays.

The page (when it's designed) reports what visitors do with `POST /api/public/vsl/:slug/events` using `{ visitor, type, seconds, share }`. The `type` is one of `play`, `progress`, `cta_click`, `breakdown_play`, `breakdown_progress`, `breakdown_complete` or `book_call`. A draft page works as a preview and records nothing.

## Still to decide

- **The CTA at the end of the breakdown video.** Booking a call is the natural next step. Set it with `PUT /api/vsl/pages/:id { "breakdown_cta": { "kind": "book_call", "url": "https://..." } }`. Until then the build lists it as open.
- **Which hook wins.** Pick one now and test the others with page variants.

## API

All under `/api/vsl` (signed in; changes need owner or admin).

| Method | Path | What it does |
|---|---|---|
| GET | `/foundation` | Sections, rules, proof plan, checklist, formats, niches, open decisions |
| GET/POST | `/niches` | List packs / make your own |
| GET/PUT/DELETE | `/niches/:key` | One pack (built-in packs can't be changed or deleted) |
| GET/POST | `/proof` | Results, each with its checklist |
| PUT/DELETE | `/proof/:id` | Update (numbers merge) / remove |
| GET/POST | `/scripts` | List / create (`niche_key`, `format`, `hook`, `vars`, `overrides`, `proof_ids`) |
| GET/PUT/DELETE | `/scripts/:id` | Full build / edit (a line override set to `null` restores the original) / remove |
| POST | `/scripts/:id/copy` | Another format, hook or niche |
| GET | `/scripts/:id/export?as=text\|srt\|shots` | Script doc, caption file, shot list |
| GET/POST | `/pages` | List with stats / create |
| GET/PUT/DELETE | `/pages/:id` | Detail with prospect links / edit, go live, pause / remove |
| GET | `/pages/:id/stats` | Hook test and section-by-section drop-off |
| POST/DELETE | `/pages/:id/shares[/:shareId]` | Prospect links |

Public (no sign-in): `GET /api/public/vsl/:slug?visitor=&share=` and `POST /api/public/vsl/:slug/events`.

Line keys for `overrides`: `hook.line`, `problem.day`, `problem.tried`, `problem.why_failing`, `problem.cost`, `problem.sample`, `solution.method`, `solution.demo.test_dm`, `solution.demo.instant_reply`, `solution.demo.nudge`, `solution.demo.spreadsheet`, `solution.demo.report`, `solution.add_ons`, `solution.what_changes`, `proof.framing`, `proof.numbers.<proof id>`, `cta.line`.

## The faceless preview (video)

`npm run build:vsl-preview` builds `dist/vsl-preview.html` from the back end: every niche pack, the faceless format and the card timings. It plays the full 3:30 cut in your brand colours, with a scrubber split into the five sections, a niche switcher, and the line, visual and direction for whatever is on screen. Change a pack or the foundation, rebuild, and the video follows.

- Each section's cards are stretched to fill that section's window, because the b-roll and screen recording hold the time between lines. A section that runs long pushes the next one back.
- The demo in section 3 is a **mock-up**, marked on screen. The real cut uses your screen recording of the demo account.
- The proof section stays a **placeholder** until real results are added. The video never makes numbers up.
- Open it with `?record&niche=<pack>` for a bare 1280×720 stage. That's what the MP4 export records.

## Wellness pack and the voiced cut

`wellness` covers gym owners and managers, personal trainers and online coaches in one pack. It's pain-first and built as a path:

| Point | Where they are | What the system does |
|---|---|---|
| A | Enquiry: someone gets in touch | Answered in seconds |
| B | Answered and booked in | Follow-ups at 30 min, midday, 5pm sweep |
| C | Onboarded: forms, welcome, first session | Sent by themselves, every step logged |
| D | Kept: checked in on, reported on | One report a week |

Through the problem section, the steps are shown waiting on the owner and then breaking where people drop off. The solution connects them. The usual fix, hiring someone or handing the work to someone already stretched, is set against the system in between with no new hire. The video also says that we watch over the system and are alerted when something breaks, needs changing or could work better.

**Voice:** `npm run vsl:voice -- wellness` (with `PIPER` and `PIPER_VOICE` set) voices each line with Piper, a free text-to-speech engine. It then times the video to the real audio and writes `dist/vsl-voice/wellness.m4a` and `.json`. `npm run build:vsl-preview` picks these up, and the player gets a Sound on/off button. To use a better voice later (an AI voice or your own recording), replace the clips and keep the same manifest.

Before it goes out, check that the monitoring promise ("we're alerted and we tell you") is backed by a real alerting setup for each client's automations.

## Online coach onboarding (current focus)

`coach_onboarding` is the version being sent out now. It's written in your own voice ("I build the system in between", "we keep an eye on it") and follows the path: paid (A), then welcomed with the intake form and call link in seconds (B), then started, with the form back, the call booked and the programme sent (C), then staying, checking in every week and reported on (D). The full timed script is in [vsl-scripts/online-coach-onboarding-v1.md](vsl-scripts/online-coach-onboarding-v1.md).

**Voice:** Kokoro (free, open-source, natural). Each line is one continuous take. The voice is a blend of two British male voices (`bm_george:0.65,bm_lewis:0.35`), so it isn't a stock voice people will recognise. To use a different voice, change `KOKORO_VOICE` and run `npm run vsl:voice -- coach_onboarding`. The model files come from the kokoro-onnx GitHub releases (`model-files-v1.0`).

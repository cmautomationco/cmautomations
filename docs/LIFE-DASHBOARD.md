# Life Dashboard (personal side)

A personal dashboard that sits apart from the business system. It covers the ADHD hub, life admin, finance, the content hub, social channels, and health with Strava.

- **Open it:** `/life` on the running server (for example `http://localhost:3000/life`). You can also open `public/life/index.html` straight from your computer or phone.
- **One file, no build:** everything is in `public/life/index.html`.
- **Your data:** it's saved in the browser you use, on that device only. Use **Settings → Export backup** to keep a copy, and **Import backup** to move it to another device.
- **First run:** choose **Start fresh**, or **Explore with example data** to see it filled in. You can clear the example data from Settings.

![Today](screenshots/40-life-today.png)

## 🎯 Task manager with a 1–5 importance bar

Every section except Finance has its own ranked task manager:

| Section | What it lists |
|---|---|
| **Today** | Your top 6 priorities from every area |
| **ADHD hub → Task manager** | Every task from every area, with area filters |
| **Life admin** | Admin, home and money jobs |
| **Content hub → Content tasks** | Filming, editing and posting jobs |
| **Social channels** | Replies, bio updates and collabs |
| **Health & Strava** | Appointments and training |

- **Ranking:** slide the bar from **1 (least important)** to **5 (most important)**. The list re-sorts as soon as you let go: 5s at the top, 1s at the bottom, each under its own heading.
- **Adding:** type the task, set the bar, add a date if it has one, then press **Add** or Enter.
- **Starting rank:** tasks added through the scorer start at the ranking their formula score suggests (score ÷ 20, rounded up). You can slide them anywhere after that.
- **Effect on Today's 3:** your ranking feeds into Today's 3, alongside the formula score and due dates.

![Admin task manager](screenshots/49-life-admin-task-manager.png)

## 🧠 ADHD hub (the core)

It has seven tabs, kept separate:

| Tab | What it does |
|---|---|
| **How I'm doing** | A daily score from 1 (really rough) to 10 (flying), plus optional energy (1–5), sleep, tags and a note. It shows a daily line chart (7/14/30 days), weekly averages for the last 8 weeks, your check-in streak, and **Patterns** (how your score changes on days tagged "Slept well", "Exercised", "Overwhelmed" and so on). |
| **Score & sort** | Score a task or idea *before* you add it. The formula is shown at the top. Four sliders (Impact, Urgency, Energy fit, Effort) show the sum (e.g. `4 × 3 × 4 ÷ 4`), a live score and a verdict: **Do it now**, **Schedule it** or **Park it**. Below it are the three buckets, where you can tick tasks off, move them or rescore them. |
| **Task manager** | Every task from every area, ranked 5 → 1 with the importance bar. Filter by area. |
| **Today's 3** | At least three tasks every day, with one always for your health. They're matched to today's check-in: on a low-energy day you get quick, gentle wins. If you haven't scored enough tasks, it suggests a simple health or admin task. |
| **Deep focus** | A 15–90 minute timer linked to a task. It logs your deep-focus hours. If a distracting thought comes up mid-session, type it in and it goes to the brain dump. |
| **Weekly wins** | **Time saved**, **problems solved**, **deep focus hours** and **ideas parked, not chased**, each compared with last week. It also lists your wins and parked ideas, shows time saved week by week, and has a two-minute reflection. |
| **Brain dump** | Get it out of your head now and score it later. You can also park an item in one tap. |

### The formula

Each slider runs from 1 to 5:

```
Score = Impact × Urgency × Energy fit ÷ Effort

15 or more   → Do it now
6 or more    → Schedule it
Below 6      → Park it
```

For example, 4 × 3 × 4 ÷ 4 = 12.0, which goes to **Schedule it**. Scores run from 0.2 (1 × 1 × 1 ÷ 5) to 125 (5 × 5 × 5 ÷ 1).

In **Settings → Your scoring formula** you can change the cut-offs. You can also switch back to the older weighted score out of 100, which has its own weights, cut-offs and two overrides.

### How the weekly numbers are worked out

- **Time saved:** two parts added together.
  - Each idea you park gets credited with the time its effort score says it would have taken (1 = 15 min, 2 = 1h, 3 = 2h, 4 = 4h, 5 = 8h).
  - Plus the time your systems save each week, from **Content hub → Overview → Where the hours come from**.
- **Problems solved:** tasks ticked off this week.
- **Deep focus:** minutes logged with the focus timer.
- **Ideas parked, not chased:** ideas parked this week that are still parked.

| Check-in | Score & sort |
|---|---|
| ![Check-in](screenshots/41-life-adhd-checkin.png) | ![Score & sort](screenshots/42-life-adhd-score-and-sort.png) |

| Weekly wins | Deep focus |
|---|---|
| ![Weekly wins](screenshots/43-life-adhd-weekly-wins.png) | ![Deep focus](screenshots/44-life-adhd-deep-focus.png) |

## The other sections

- **🗂️ Life admin:** home, admin and money tasks, grouped into overdue, today, next 7 days, later and no date. Tasks can repeat weekly, monthly or yearly, and the next one is created when you tick one off. Bills from Finance show here too.
- **💷 Finance:** money in and out, monthly budgets for each category (with warnings at 85% and when you go over), a 6-month spending trend, bills and subscriptions by the day they come out, and savings goals.
- **🎬 Content hub:** four tabs.
  - **Overview:**
    - Tiles for views last week, posts out last week and hours saved on content.
    - A 12-week views chart with last week highlighted. You log weekly views from your platforms' analytics.
    - **Where the hours come from:** each content job's time before and now and how often you do it, giving the hours saved a week.
  - **Strategy:**
    - *The big picture:* who you are, who it's for, what you sell, how you sound, your 90-day goal, and your always/never rules.
    - *Content pillars:* each with its share of your content.
    - *Pillar balance:* what you actually posted in the last 30 days compared with your plan.
    - *Posting plan:* posts per week on each platform.
    - *Weekly rhythm:* one pillar for each day.
  - **Ideas:** get 3 ideas at a time (today's pillar is picked for you), each with a hook, format and call to action. The board takes each idea from Idea → Scripted → Filmed → Posted, and every idea has its own 1–5 bar, so each column is ranked.
  - **Content tasks:** the content task manager.
- **📱 Social channels:** every channel with its follower count, change over 30 days, a sparkline, and posts this week.
- **💚 Health & Strava:** weekly distance for the last 8 weeks, recent activities, daily basics (habits you choose) and average sleep taken from your check-ins.
  - **To import Strava:** go to Strava → Settings → My Account → *Download or delete your account* → request your archive. Then import `activities.csv`. Activities you've already imported are skipped.

![Content hub overview](screenshots/51-life-content-hub-overview.png)

| Content hub → Strategy | Content hub → Ideas |
|---|---|
| ![Content strategy](screenshots/46-life-content-hub-strategy.png) | ![Content ideas](screenshots/48-life-content-hub-ideas.png) |

![Finance](screenshots/45-life-finance.png)

![Health & Strava](screenshots/47-life-health-strava.png)

## Next steps

1. **Sync across devices.** Save the data to the CM Automations server behind a personal sign-in, so your phone and laptop share it.
2. **Live Strava.** Strava's secure sign-in needs a server, so add it to the server with an automatic weekly import.
3. **Live follower counts.** Take them from the API hub's TikTok, Instagram and YouTube connections.
4. **Bank feed.** Use open banking, or import a bank CSV, so you don't have to type in what you spend.
5. **AI content ideas.** Use the assistant (the same Claude set-up as Content Studio) for ideas written in your own voice.
6. **Reminders.** A morning text or WhatsApp with Today's 3, and a Sunday-evening weekly wins summary.

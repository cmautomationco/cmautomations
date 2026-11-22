# Coaching: onboarding and progress for online coaches

The system the online coach VSL sells. It covers a client from the first conversation with the coach to fully onboarded, and then their progress week by week. The coach works in **Coaching** in the app. The client has their own page from a private link and doesn't need to sign in.

## Onboarding: from the first conversation

Ten steps in three phases. Each step waits on one person, and both sides can always see whose turn it is.

| Phase | Step | Whose turn | What happens |
|---|---|---|---|
| Getting to know each other | First conversation | Coach | Logged when the coach adds the client (where they spoke, what was said). Their page is created. |
| | Discovery call | Coach | The coach gets a task, then marks it done. |
| | Say yes to your coaching | Client | The client is messaged a link. Their page shows the programme, what's included and the price, with a "Yes, I'm in" button. |
| Getting started | Payment | Coach | The coach marks it paid. The contact becomes a customer in the CRM. |
| | Welcome | Automatic | Sent the moment they've paid, with exactly what happens next. |
| | Intake form | Client | Goals, history, injuries, their week, and two numbers: where they're starting from and their goal. These become the two ends of their chart. |
| | Coaching agreement | Client | They read it and type their name to agree. |
| | Kickoff call | Client, then coach | The client suggests times. The coach confirms one (the client is told) and marks the call done. |
| Your first week | Your programme | Coach | The coach sends it, with an optional link. Week 1 starts. |
| | First check-in | Client | Due at the end of week 1. Once it's in, they're fully onboarded. |

**Communication:** every step, message and check-in goes on one shared timeline that the coach and the client both see. Anything sent to the client also goes to them by text, WhatsApp or email, whichever reaches them, using the business's messaging settings.

**Reminders:** when a step waits on the client, they get up to three nudges: 30 minutes after it opens, then midday, then the 5pm sweep. Nothing is sent after 7pm or before 8am; anything that would land then moves to the next midday. After three reminders the client shows under **Needs a word**.

**The coach's week at a glance** (top of Coaching): who's waiting on the coach, who needs a word (stuck after three reminders, or a missed check-in), who started this week, and who checked in.

## Progress: the client's chart

- The client checks in weekly with their number, their energy (1–5), a win and anything tough. The coach replies, and the reply shows on the check-in and reaches the client.
- The chart shows their check-ins (solid blue) against the **expected path** from their starting point to their goal (dashed amber). The expected path is deliberately slow for the first weeks and then picks up week after week (`progress = (week ÷ weeks)^1.8`). Three weeks in it's under a tenth of the way, and each stretch after that gains more than the one before.
- The first three weeks are shaded **Building foundations**. In those weeks the client's page tells them a flat line is normal, and afterwards that this is where progress picks up. The coach sees a matching prompt to reassure them.
- It works for goals that go down (body weight) as well as up (a lift). There's a "See as a table" view, and a tooltip for each week.

## Demo data

Bright Path Coaching (in the demo and the test build) has a client at each point:
- Hannah: just talked
- Tom: agreement to sign
- Leah: kickoff times suggested
- Priya: week 4 with a flat start
- Sam: week 9 and picking up fast

All names and numbers are made up.

## API

Signed in, `/api/coaching`:
- `GET /` (clients and the weekly report)
- `PUT /settings` (programme, weeks, price, what's included, agreement, kickoff note, check-in day)
- `POST /clients`
- `GET|PUT|DELETE /clients/:id`
- `POST /clients/:id/steps/:key/done`
- `POST /clients/:id/kickoff` (confirm a time)
- `POST /clients/:id/messages`
- `POST /clients/:id/checkins/:week/reply`

The client's page, `/api/public/coach/:token`:
- `GET`
- `POST /accept`
- `POST /intake`
- `POST /agreement`
- `POST /kickoff`
- `POST /checkin`
- `POST /messages`

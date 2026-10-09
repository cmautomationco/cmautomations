# CM Automations – suggested next services

These are ordered by how much time they would save the widest range of businesses, from sole traders to larger teams. Each one plugs into what already exists:

- the CRM, Tasks and Help Desk hold the records
- the automation engine does the routine work
- the assistant guides people to it

Items marked **(asked for)** are things the assistant is already being asked about but can't do yet. The Help Desk's "What people ask the assistant" card tracks these, so real usage can re-order this list.

## Now built

These were the top suggestions and are now part of the system:

- **Invoicing, quotes and payments** – quote → invoice, card payments through Stripe, automatic chasing (friendly → firmer → a call task).
- **Online bookings and reminders** – booking page, deposits, day-before and 2-hour reminders, C/R replies, job sheet, calendar feed.
- **Real email, texts and WhatsApp** – automations send messages themselves; replies land on the contact's timeline.
- **Phone line for trades** – call forwarding, missed-call text-back, voicemail, emergency alerts and instant replies.
- **WhatsApp booking assistant** – customers book, move (R) or cancel (CANCEL) a job by replying with numbers on WhatsApp or by text.
- **Each business's own accounts** – Twilio, Stripe and email connected per business in Settings → Connections, with live checks, one-click number and payment-notification set-up, WhatsApp template approval and `npm run check:live`.
- **Lead capture forms.**
- **Agency control centre, audit & proposal builder, white-label branding and monthly client reports.**

Still to do from those areas:

- Two-way Google/Outlook calendar sync (today it's a subscription feed out of the system, and busy times in Google don't block slots yet).
- Xero / QuickBooks sync for invoices and payments.
- Inbound email directly into Messages without Zapier (an email parsing service pointed at `/api/hooks/inbound/<token>` works today).
- A spreadsheet upload screen for existing contact lists (the API exists: `POST /api/crm/contacts/import`).
- Recording calls and transcribing voicemails.
- Twilio sub-accounts created for each client by the agency, so a client doesn't need their own Twilio account.
- Submitting WhatsApp templates for approval straight from Settings → WhatsApp (today they're pasted into Twilio's Content Template Builder).

## Priority 1: next up

### 1. Client portal
- Clients sign in to see their progress, invoices and bookings, upload files and raise issues.
- Issues from the portal arrive in the Help Desk tagged as Customer.
- **Why:** it cuts "just checking in" emails and keeps every client conversation in one place.

## Priority 2: growth and visibility

### 2. Reviews and reputation
- Review requests already go out after each finished job. Next: catch unhappy replies before they become public reviews.
- Route unhappy replies to the Help Desk as urgent customer issues before they become public reviews.

### 3. Weekly owner report
- A Monday email or notification with the numbers the assistant already gives for "How is the business doing?": pipeline, wins, leads, overdue work, content, issues and time saved.

### 4. Direct social publishing and content analytics
- Publish straight to Instagram, Facebook, LinkedIn, TikTok and YouTube instead of through a webhook.
- Pull reach and engagement back in, so the idea engine learns which pillars, hooks and formats work for each business.

### 5. Knowledge base and SOP library
- Store the SOPs and templates created in the Build Funnel's "Templates & SOPs" step.
- Let the assistant search them, so it can answer business-specific questions like "how do we onboard a client?".

### 6. Team basics
- Staff onboarding checklists and holiday/time-off requests.
- Rotas and shifts for hospitality, beauty and trades.
- Simple time tracking.
- Automations can cover sickness and shift-swap requests.

## Priority 3: for specific niches or larger teams

| Service | Most useful for |
|---|---|
| Stock and orders, with low-stock alerts that become tasks | E-commerce, hospitality |
| Jobs and projects: job cards, site visits, before/after photos, client sign-off | Trades, agencies |
| Approvals, e.g. a client signs off content before it's scheduled | Agencies, larger teams |
| Finer roles and permissions, plus an audit log | Larger teams |
| Integrations hub: Google Workspace, Microsoft 365, Slack or WhatsApp alerts, a Zapier app | Everyone, as they grow |

## Quick fixes to do alongside

- **Password reset by email** (changing your own password and an admin setting one are already on screen).
- **Two-step sign-in** and GDPR tools to export or delete a contact's data.


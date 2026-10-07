# CM Automations – suggested next services

These are ordered by how much time they would save the widest range of businesses, from sole traders to larger teams. Each one plugs into what already exists:

- the CRM, Tasks and Help Desk hold the records
- the automation engine does the routine work
- the assistant guides people to it

Items marked **(asked for)** are things the assistant is already being asked about but can't do yet. The Help Desk's "What people ask the assistant" card tracks these, so real usage can re-order this list.

## Priority 1: saves time for almost every business

### 1. Invoicing, quotes and payments **(asked for)**
- Turn a won deal into a quote, then an invoice, in one click, with Stripe payment links.
- Chase overdue invoices automatically (polite reminder → firmer reminder → task for a person).
- Sync with Xero or QuickBooks.
- **Why:** chasing payments is one of the most-hated admin jobs, and it hits cash flow directly.
- **Builds on:** deals, automations (new triggers: invoice sent, overdue, paid), Help Desk billing issues.

### 2. Online bookings and calendar sync **(asked for)**
- A booking page per service, two-way Google/Outlook calendar sync, and deposits.
- Automatic reminders that cut no-shows.
- **Why:** salons, trades, coaches, fitness and hospitality all run on appointments.
- **Builds on:** contacts (a booking creates or updates a contact), tasks, automations (booking made, reminder due, no-show).

### 3. Real email and SMS
- Automations actually send the welcome email, follow-up and reminder, from templates.
- Replies appear on the contact's timeline.
- **Why:** today automations create tasks and notifications for a person to act on; sending directly removes that last manual step.
- **Builds on:** a new automation action ("send email / text") alongside the existing six.

### 4. Lead capture forms and import screen **(asked for)**
- Embeddable forms and lead-magnet pages that drop straight into the CRM and start the new-lead automation.
- A spreadsheet upload screen for existing contact lists. The back end for this already exists (`POST /api/crm/contacts/import`).
- **Builds on:** the "Lead magnet" step in the Build Funnel.

### 5. Client portal
- Clients sign in to see their progress, invoices and bookings, upload files and raise issues.
- Issues from the portal arrive in the Help Desk tagged as Customer.
- **Why:** it cuts "just checking in" emails and keeps every client conversation in one place.

## Priority 2: growth and visibility

### 6. Reviews and reputation
- After a deal is won or a job is finished, automatically ask for a Google review.
- Route unhappy replies to the Help Desk as urgent customer issues before they become public reviews.

### 7. Weekly owner report
- A Monday email or notification with the numbers the assistant already gives for "How is the business doing?": pipeline, wins, leads, overdue work, content, issues and time saved.

### 8. Direct social publishing and content analytics
- Publish straight to Instagram, Facebook, LinkedIn, TikTok and YouTube instead of through a webhook.
- Pull reach and engagement back in, so the idea engine learns which pillars, hooks and formats work for each business.

### 9. Knowledge base and SOP library
- Store the SOPs and templates created in the Build Funnel's "Templates & SOPs" step.
- Let the assistant search them, so it can answer business-specific questions like "how do we onboard a client?".

### 10. Team basics
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

- **Password reset and change on screen (asked for):** right now the assistant raises this for an admin.
- **Two-step sign-in** and GDPR tools to export or delete a contact's data.
- **Editing a contact's name, email and phone** from the contact panel. The back end already supports it.

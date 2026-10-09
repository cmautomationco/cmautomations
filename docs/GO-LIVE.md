# Going live: real texts, WhatsApp, calls, emails and card payments

The test build only pretends to send. On a live server each business connects
its own accounts, so messages come from its own number and payments go to its
own Stripe account:

| What | Service | Where it's connected |
|---|---|---|
| Calls, missed-call text-back, texts, WhatsApp | Twilio | Settings → Connections → Twilio |
| Emails (quotes, invoices, confirmations, reports) | Resend | Settings → Connections → Email |
| Card payments for invoices and booking deposits | Stripe | Settings → Connections → Stripe |

Allow about an hour, plus a few days for Meta to approve a WhatsApp number.

---

## 1. Put the system on a server with an https address

Twilio and Stripe have to reach the system to deliver incoming calls, messages
and payments, so it needs a public `https://` address. Customers also open the
links it sends (booking pages, invoices) at that address.

**Easiest: Render** (about £6 a month plus the disk)

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint** and pick the repository. `render.yaml`
   sets up the web service, a disk for the database, `APP_SECRET`,
   `REQUIRE_PASSWORDS=true` and `SEED_DEMO=false`.
3. When it's deployed, set **PUBLIC_URL** to the address Render shows (e.g.
   `https://cm-automations.onrender.com`), or to your own domain once it's
   pointed at Render. Save, and the service restarts.
4. Open the address and sign up. The first account owns the first business.

**Any other host** (a VPS, Railway, Fly.io, your own server): use the
`Dockerfile`, mount a persistent volume at `/data`, and set these environment
variables:

| Variable | Value |
|---|---|
| `PUBLIC_URL` | Your https address, without a trailing slash |
| `APP_SECRET` | Long random text, for example from `openssl rand -hex 32`. It encrypts every business's connected keys. **Keep a copy somewhere safe.** If it changes, businesses have to reconnect. |
| `REQUIRE_PASSWORDS` | `true` |
| `SEED_DEMO` | `false`, so the server starts with no demo businesses |
| `DATABASE_PATH` | `/data/cm-automations.db` (already set in the Dockerfile) |

Without Docker, use Node 22.13 or newer and run `npm ci --omit=dev && npm start`
behind a reverse proxy that handles https (Caddy, nginx).

**Check it:** run `npm run check:live` on the server (on Render, use the
service's **Shell** tab). It lists anything that would stop real messages or
payments. Nothing is sent or changed.

The server also prints these warnings when it starts.

---

## 2. Twilio: calls, texts and WhatsApp

### Account and number

1. Create an account at twilio.com and **upgrade it** (add a payment method).
   A trial account can only message numbers you've verified, and it adds
   "Sent from your Twilio trial account" to every message.
2. Buy a number: **Phone Numbers → Buy a number → United Kingdom**.
   - Choose a **mobile number (07…)**. It can take calls and send and receive
     texts. UK landline numbers (01…, 02…) on Twilio take calls only, with no texts.
   - UK numbers need a **regulatory bundle**: the business's address and proof
     of it. Twilio walks you through this, and approval usually takes 1–3
     working days.
3. **Keeping your existing number:** set your current landline or mobile to
   divert unanswered calls to the Twilio number. Missed calls are then still
   texted back, and nothing changes for customers. Or port the number to Twilio.

### Connect it

1. In the app, go to **Settings → Phone & alerts**. Enter the business number
   (the Twilio number), the WhatsApp number (often the same number) and the
   mobile that calls should ring.
2. Go to **Settings → Connections → Twilio**. Paste the **Account SID** and
   **Auth Token** from the Twilio console home page, and press **Connect**.
3. Press **Test connection**. It checks the account against Twilio and finds your numbers.
   Any problem is explained in plain English.
4. Press **Point my numbers here**. This sets your Twilio numbers so calls and
   texts come to this system, so you don't copy any addresses by hand.
5. Under **Send a real test message**, enter your own mobile and send a text.
   It should arrive within seconds.
6. Ring the business number from another phone and let it ring out. You should
   get the missed-call text, and the call appears in **Messages → Calls**.

### WhatsApp

1. In Twilio go to **Messaging → Senders → WhatsApp senders** and register the
   business number.
   - You'll connect your Meta (Facebook) Business account and choose the
     display name customers see.
   - Meta usually approves it within a few days.
2. Open the sender and set **Webhook URL for incoming messages** to the
   *messages address* shown in Settings → Connections:
   `https://your-address/api/hooks/twilio/messages`.
3. In **Settings → WhatsApp**, switch on the **booking assistant**. Copy your
   **Book on WhatsApp** link (`wa.me/…?text=BOOK`) to your website, Google
   Business Profile, van and invoices.

**Message templates (needed for reminders):** WhatsApp only lets a business
send free-form messages within 24 hours of the customer's last message. For
anything outside that window, such as a reminder the day before a job, Meta
requires an approved template.

1. **Settings → WhatsApp → WhatsApp message templates** lists every message that may be
   sent outside the window. Each one has the exact text to submit, with the
   placeholders numbered `{{1}}`, `{{2}}` and so on.
2. In Twilio go to **Messaging → Content Template Builder → Create**. Paste the
   text, choose category **Utility**, and submit it for WhatsApp approval.
3. When it's approved, copy its **Content SID** (`HX…`) into the template's box
   in Settings → WhatsApp and press **Save**.

Until a template is approved, that message goes **by text instead**, so the
customer still gets it.

**Try WhatsApp before Meta approves your number (Sandbox):**

1. In Twilio, go to **Messaging → Try it out → Send a WhatsApp message**.
2. From your phone, send the join code it shows to +1 415 523 8886.
3. In the Sandbox settings, set **When a message comes in** to the messages
   address.
4. In Settings → Phone & alerts, set the WhatsApp number to `+14155238886`.

Only people who have joined the sandbox can message it, and only one business
can use it at a time. Change the WhatsApp number back once your own sender is
approved.

---

## 3. Resend: emails

1. Create an account at resend.com.
2. Go to **Domains → Add domain** and enter the business's domain, for example
   `swiftplumbing.co.uk`.
3. Add the DNS records Resend shows you at your domain provider, then wait for
   the domain to show **Verified**.
4. Go to **API Keys → Create** and choose **Full access**. That lets the Test
   button check the domain.
5. In **Settings → Connections → Email**, paste the key and the address to send
   from (it must be on the verified domain, e.g. `hello@swiftplumbing.co.uk`).
   Press **Connect**, then **Test connection**.
6. Send a real test email to yourself.

---

## 4. Stripe: card payments

1. Create a Stripe account and **activate** it with your business and bank details.
2. Go to **Developers → API keys** and copy the **Secret key** (`sk_live_…`).
   - A **restricted key** (`rk_live_…`) also works. Give it write access to
     *Checkout Sessions* and *Webhook Endpoints*, and read access to *Account*.
   - Use a test key (`sk_test_…`) first if you want to try it with Stripe's
     test card 4242 4242 4242 4242.
3. In **Settings → Connections → Stripe**, paste the key, press **Connect**, then **Test connection**.
4. Press **Set up payment notifications**. This creates the Stripe webhook for
   this business and stores its signing secret, so invoices are marked paid the
   moment Stripe takes the money.
5. Send yourself a small invoice and pay it by card. It should show **Paid**
   straight away, and the thank-you message is sent.

Payments go straight to the business's own Stripe account. If a notification is
ever delayed, the payment is also confirmed when the customer comes back to the
invoice page. A payment is never counted twice.

---

## 5. Final checks

- [ ] `npm run check:live` shows no ❌.
- [ ] A missed call to the business number gets the text-back.
- [ ] A WhatsApp message saying **BOOK** gets the booking assistant, and a
      booking made that way appears in Bookings.
- [ ] A text saying **R** moves the next booking, and **CANCEL** cancels it.
- [ ] A word like "leak" gets the emergency reply, and the team's mobile gets
      the 🚨 alert.
- [ ] A test invoice paid by card shows as Paid.
- [ ] A test email arrives and isn't in spam.

## If something doesn't work

| What you see | What to check |
|---|---|
| Messages say "Demo – not actually sent" | That channel isn't connected in Settings → Connections, or this is the test build |
| "Couldn't reach Twilio/Stripe/Resend" | The server can't make outbound internet connections. Check its firewall or the host's network settings. |
| Texts fail with "can't receive texts" | It's a landline number. Missed-call text-back only works for mobiles. |
| WhatsApp falls back to a text | No approved template for that message yet (Settings → WhatsApp), or the customer isn't on WhatsApp |
| Incoming messages don't appear | The number isn't pointed here (press **Point my numbers here**), or the WhatsApp sender's webhook isn't the messages address. Also check that `PUBLIC_URL` exactly matches the address Twilio calls. Signatures are checked against it. |
| Invoices don't turn Paid by themselves | Press **Set up payment notifications** again. Check `PUBLIC_URL` is https. |
| Businesses have to reconnect after a restart | `APP_SECRET` changed, or the `/data` disk isn't persistent |

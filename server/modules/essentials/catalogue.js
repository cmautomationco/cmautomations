import { setSetting } from '../../lib/settings.js';
import { badRequest, id, now } from '../../lib/util.js';
import { RECIPES } from '../../automation/recipes.js';
import { getMessagingSettings } from '../messaging/service.js';
import { getBookingSettings } from '../bookings/service.js';
import { getBillingSettings } from '../billing/service.js';

/**
 * The Essentials offer: the automations that keep a business running, grouped
 * so it reads as a simple offer. "start" items are what most businesses begin
 * with; "grow" items are the next layer they add as they build.
 *
 * Every item maps onto real settings or automations in the business's system,
 * so switching it on here is exactly the same as switching it on where it lives.
 */

export const SECTIONS = [
  { key: 'respond', title: 'Never miss a lead', blurb: 'Every enquiry answered fast, wherever it comes in – and you know where each one came from.' },
  { key: 'bookings', title: 'Bookings that happen', blurb: 'Confirmed straight away, reminded twice, and rebooked if they don’t turn up.' },
  { key: 'customers', title: 'Look after every customer', blurb: 'The little touches that make people come back.' },
  { key: 'money', title: 'Win the work & get paid', blurb: 'Quotes followed up and invoices chased, without awkward messages.' },
  { key: 'growth', title: 'Reviews, referrals & follow-ups', blurb: 'Turn happy customers into reviews and referrals, and nothing left unanswered.' },
];

const MISSED_CALL_CHANNELS = [
  ['auto', 'Best way – WhatsApp if they use it, otherwise a text'],
  ['whatsapp', 'WhatsApp (a text if WhatsApp can’t reach them)'],
  ['sms', 'Always a text message'],
  ['instagram', 'Instagram if we already talk to them there, otherwise the best way'],
];

/**
 * Each item: key, section, stage ('start' | 'grow'), name, does (one line), result (why it matters),
 * on(s) → boolean, set(ctx, orgId, on), options (editable fields), needs(s) → setup still to do.
 * s = { messaging, bookings, billing, recipes: Map(recipe → enabled), counts }.
 */
export const ITEMS = [
  // ── Never miss a lead ──
  {
    key: 'lead_reply', section: 'respond', stage: 'start', name: '1-minute lead reply',
    does: 'Every new enquiry – a text, WhatsApp, DM, website form or a lead added by hand – gets a friendly reply within a minute, with the booking link.',
    result: 'The first business to reply usually wins the job.',
    on: (s) => s.messaging.auto_reply && s.recipes.get('new_lead_welcome_message') === true,
    set: (ctx, orgId, on) => { patchMessaging(ctx, orgId, { auto_reply: on }); setRecipe(ctx, orgId, 'new_lead_welcome_message', on); },
    edit: ['auto_reply', 'new_lead_welcome'],
  },
  {
    key: 'missed_call', section: 'respond', stage: 'start', name: 'Missed-call response',
    does: 'Anyone whose call you miss is messaged straight back – by WhatsApp, a text or Instagram, whichever you prefer – and you get a call-back task.',
    result: 'Most people who can’t get through ring the next business on the list.',
    on: (s) => s.messaging.missed_call_text_back,
    set: (ctx, orgId, on) => patchMessaging(ctx, orgId, { missed_call_text_back: on }),
    options: [{ key: 'missed_call_channel', store: 'messaging', label: 'Reply by', type: 'select', choices: MISSED_CALL_CHANNELS }],
    needs: (s) => (s.messaging.business_number ? [] : [{ text: 'Add your business number', link: '#/settings/phone' }]),
    edit: ['missed_call'],
  },
  {
    key: 'social_replies', section: 'respond', stage: 'grow', name: 'DM & comment auto replies',
    does: 'Instagram, Facebook and TikTok DMs and comments get an instant reply. Comments get a public “we’ve sent you a DM” and a DM with the details; keyword rules answer common questions like price.',
    result: 'Comments and DMs turn into conversations while people are still interested.',
    on: (s) => s.messaging.social_enabled,
    set: (ctx, orgId, on) => patchMessaging(ctx, orgId, { social_enabled: on }),
    options: [
      { key: 'dm_reply', store: 'messaging', label: 'Reply to a new DM', type: 'textarea', help: '{{first_name_spaced}} adds their name; {{book_line}} adds your booking link.' },
      { key: 'comment_public_reply', store: 'messaging', label: 'Public reply under a comment', type: 'text' },
      { key: 'comment_dm', store: 'messaging', label: 'DM sent to someone who comments', type: 'textarea' },
      { key: 'keyword_replies', store: 'messaging', label: 'Keyword replies (one per line)', type: 'textarea', placeholder: 'price, cost, how much → Our prices start at £45. Book here: …\nhours, open → We’re open Mon–Fri 8am–6pm.', help: 'Words, then → then the reply. A match answers the question for you.' },
      { key: 'social_webhook_url', store: 'messaging', label: 'Where replies are sent (your ManyChat, Make or Zapier web address)', type: 'url', help: 'Leave blank if your ManyChat/Make step posts the reply it gets back.' },
    ],
    needs: (s) => (s.counts.social_messages ? [] : [{ text: 'Connect Instagram/Facebook/TikTok (ManyChat, Make or Zapier) to your social address', link: null }]),
  },
  {
    key: 'lead_source', section: 'respond', stage: 'grow', name: 'Lead source tagging',
    does: 'Every new lead is tagged with where it came from – Instagram, TikTok, Google, your website, a phone call, WhatsApp or a referral.',
    result: 'You can see which channels actually bring in business, and spend where it works.',
    on: (s) => s.messaging.tag_lead_source,
    set: (ctx, orgId, on) => patchMessaging(ctx, orgId, { tag_lead_source: on }),
  },

  // ── Bookings that happen ──
  {
    key: 'booking_confirmation', section: 'bookings', stage: 'start', name: 'Booking confirmations',
    does: 'The moment something is booked – online, by WhatsApp or by you – the customer gets the date, time and address, with a link to move it.',
    result: 'No “did you get my booking?” calls.',
    on: (s) => s.bookings.send_confirmation !== false,
    set: (ctx, orgId, on) => patchBookings(ctx, orgId, { send_confirmation: on }),
    edit: ['booking_confirmation', 'booking_request_received'],
  },
  {
    key: 'reminder_day_before', section: 'bookings', stage: 'start', name: 'Day-before reminder',
    does: 'A reminder the day before at a time you choose. They can reply C to confirm or R to rearrange.',
    result: 'Far fewer no-shows, and early warning when someone can’t make it.',
    on: (s) => s.bookings.reminder_24h,
    set: (ctx, orgId, on) => patchBookings(ctx, orgId, { reminder_24h: on }),
    options: [{ key: 'reminder_time', store: 'bookings', label: 'Send at', type: 'time' }],
    edit: ['booking_reminder_24h'],
  },
  {
    key: 'reminder_hour_before', section: 'bookings', stage: 'start', name: 'Hour-before reminder',
    does: 'A short “see you soon” 1 or 2 hours before. Never sent during quiet hours.',
    result: 'Catches the people who forgot that morning.',
    on: (s) => s.bookings.reminder_2h,
    set: (ctx, orgId, on) => patchBookings(ctx, orgId, { reminder_2h: on }),
    options: [{ key: 'reminder_short_hours', store: 'bookings', label: 'How long before', type: 'select', choices: [['1', '1 hour before'], ['2', '2 hours before']], number: true }],
    edit: ['booking_reminder_2h'],
  },
  {
    key: 'no_show_rebook', section: 'bookings', stage: 'start', name: 'No-show rebooking',
    does: 'Mark a booking as a no-show and they get a friendly “sorry we missed you” with a link to rebook, and you get a call-back task.',
    result: 'Wins back a lot of missed appointments without chasing.',
    on: (s) => s.bookings.no_show_message !== false && s.recipes.get('no_show_follow_up') === true,
    set: (ctx, orgId, on) => { patchBookings(ctx, orgId, { no_show_message: on }); setRecipe(ctx, orgId, 'no_show_follow_up', on); },
    edit: ['booking_no_show'],
  },

  // ── Look after every customer ──
  {
    key: 'new_customer_welcome', section: 'customers', stage: 'start', name: 'New customer welcome',
    does: 'The first time someone becomes a customer – first job done, first invoice paid or deal won – they get a warm welcome.',
    result: 'Customers feel looked after from day one, and save your number.',
    on: (s) => s.messaging.welcome_new_customers,
    set: (ctx, orgId, on) => patchMessaging(ctx, orgId, { welcome_new_customers: on }),
    edit: ['new_customer_welcome'],
  },
  {
    key: 'thank_you', section: 'customers', stage: 'start', name: 'Thank you after the job',
    does: 'A thank-you when a job, appointment or session is marked done – and, if you like, after a phone call. (First-timers get the welcome instead, never both.)',
    result: 'A small touch people remember – and it sets up the review request.',
    on: (s) => s.messaging.thank_you_after_job || s.messaging.thank_you_after_call,
    set: (ctx, orgId, on) => patchMessaging(ctx, orgId, on ? { thank_you_after_job: true } : { thank_you_after_job: false, thank_you_after_call: false }),
    options: [{ key: 'thank_you_after_call', store: 'messaging', label: 'Also thank people after an answered call', type: 'toggle' }],
    edit: ['job_thank_you', 'call_thank_you'],
  },
  {
    key: 'occasions', section: 'customers', stage: 'grow', name: 'Birthday & special occasion messages',
    does: 'A message on their birthday or another date that matters to them (an anniversary, a pet’s birthday, the day they moved in) – saved on their record in the CRM.',
    result: 'Keeps you front of mind with no selling.',
    on: (s) => s.messaging.occasion_messages,
    set: (ctx, orgId, on) => patchMessaging(ctx, orgId, { occasion_messages: on }),
    needs: (s) => (s.counts.with_dates ? [] : [{ text: 'Add birthdays or special dates to customers in the CRM', link: '#/crm/contacts' }]),
    edit: ['birthday_message', 'special_occasion_message'],
  },

  // ── Win the work & get paid ──
  {
    key: 'quote_follow_up', section: 'money', stage: 'start', name: 'Quote follow-up',
    does: 'If a quote isn’t answered after a few days, the customer gets a friendly nudge with the link and you get a follow-up task.',
    result: 'Most quotes are won on the follow-up.',
    on: (s) => Number(s.billing.quote_follow_up_days) > 0 && s.billing.quote_follow_up_message,
    set: (ctx, orgId, on) => patchBilling(ctx, orgId, on ? { quote_follow_up_message: true, quote_follow_up_days: Number(getBillingSettings(ctx.db, orgId).quote_follow_up_days) || 3 } : { quote_follow_up_message: false }),
    options: [{ key: 'quote_follow_up_days', store: 'billing', label: 'Days after sending', type: 'number', min: 1, max: 30 }],
    edit: ['quote_follow_up'],
  },
  {
    key: 'invoice_reminders', section: 'money', stage: 'start', name: 'Unpaid invoice reminders',
    does: 'Overdue invoices are chased for you: a friendly reminder, then a firmer one, then a task for a person to call. Each has a “pay by card” link.',
    result: 'Get paid faster without the awkward conversations.',
    on: (s) => s.billing.chase_enabled,
    set: (ctx, orgId, on) => patchBilling(ctx, orgId, { chase_enabled: on }),
    edit: ['invoice_reminder_1', 'invoice_reminder_2'],
  },

  // ── Reviews, referrals & follow-ups ──
  {
    key: 'review_request', section: 'growth', stage: 'start', name: 'Review request',
    does: 'A couple of hours after a job is done, happy customers are asked for a Google review with a one-tap link.',
    result: 'A steady stream of reviews – the thing new customers check first.',
    on: (s) => s.bookings.review_request && Boolean(s.messaging.review_link),
    set: (ctx, orgId, on) => patchBookings(ctx, orgId, { review_request: on }),
    options: [
      { key: 'review_link', store: 'messaging', label: 'Your Google review link', type: 'url' },
      { key: 'review_delay_hours', store: 'bookings', label: 'Hours after the job', type: 'number', min: 0, max: 72 },
    ],
    needs: (s) => (s.messaging.review_link ? [] : [{ text: 'Add your Google review link', link: null }]),
    edit: ['booking_review_request'],
  },
  {
    key: 'reply_watch', section: 'growth', stage: 'grow', name: 'Replies to automatic messages – checked',
    does: 'When someone answers one of your automatic messages, DMs or comment replies and nobody has read it after a couple of hours, you’re alerted and it becomes an urgent task.',
    result: 'Automations start conversations – this makes sure a person finishes them.',
    on: (s) => s.messaging.reply_watch,
    set: (ctx, orgId, on) => patchMessaging(ctx, orgId, { reply_watch: on }),
    options: [{ key: 'reply_watch_hours', store: 'messaging', label: 'Alert after (hours)', type: 'number', min: 1, max: 48 }],
  },
  {
    key: 'referral_task', section: 'growth', stage: 'grow', name: 'Referral task',
    does: 'A week after a job is done, you get a task to ask the customer for a referral – with the wording ready to send.',
    result: 'Referrals are the cheapest, best customers you’ll get.',
    on: (s) => s.recipes.get('referral_after_job') === true,
    set: (ctx, orgId, on) => setRecipe(ctx, orgId, 'referral_after_job', on),
  },
  {
    key: 'cold_lead_check_in', section: 'growth', stage: 'grow', name: 'Cold lead check-in',
    does: 'Leads who went quiet get a friendly check-in after a set number of days (once every 3 months at most), sent during the working day.',
    result: 'Wakes up people who were interested but got busy.',
    on: (s) => s.messaging.cold_lead_check_in,
    set: (ctx, orgId, on) => patchMessaging(ctx, orgId, { cold_lead_check_in: on }),
    options: [{ key: 'cold_lead_days', store: 'messaging', label: 'Days without contact', type: 'number', min: 7, max: 365 }],
    edit: ['cold_lead_check_in'],
  },
];

export const itemByKey = (key) => ITEMS.find((i) => i.key === key);

// ───────────────────────── Reading and changing a business's settings ─────────────────────────

const orgOf = (db, orgId) => db.get('SELECT * FROM organizations WHERE id = ?', orgId);

function patchMessaging(ctx, orgId, patch) {
  setSetting(ctx.db, orgId, 'messaging', { ...getMessagingSettings(ctx.db, orgId), ...patch });
}
function patchBookings(ctx, orgId, patch) {
  setSetting(ctx.db, orgId, 'bookings', { ...getBookingSettings(ctx.db, orgOf(ctx.db, orgId)), ...patch });
}
function patchBilling(ctx, orgId, patch) {
  setSetting(ctx.db, orgId, 'billing', { ...getBillingSettings(ctx.db, orgId), ...patch });
}

/** Switches a built-in automation on or off, putting it back if the business deleted it. */
export function setRecipe(ctx, orgId, recipe, on) {
  const { db } = ctx;
  const row = db.get('SELECT id FROM automations WHERE org_id = ? AND recipe = ?', orgId, recipe);
  if (row) { db.run('UPDATE automations SET enabled = ? WHERE id = ?', on ? 1 : 0, row.id); return; }
  if (!on) return;
  const r = RECIPES.find((x) => x.recipe === recipe);
  if (!r) throw new Error(`Unknown recipe ${recipe}`);
  db.insert('automations', { id: id('aut'), org_id: orgId, name: r.name, description: r.description, trigger: r.trigger, conditions: r.conditions, actions: r.actions, enabled: 1, recipe: r.recipe, run_count: 0, created_at: now() });
}

export function snapshot(db, orgId) {
  const org = orgOf(db, orgId);
  return {
    messaging: getMessagingSettings(db, orgId),
    bookings: getBookingSettings(db, org),
    billing: getBillingSettings(db, orgId),
    recipes: new Map(db.all('SELECT recipe, enabled FROM automations WHERE org_id = ? AND recipe IS NOT NULL', orgId).map((r) => [r.recipe, Boolean(r.enabled)])),
    counts: {
      with_dates: db.get(`SELECT COUNT(*) AS n FROM contacts WHERE org_id = ? AND (birthday IS NOT NULL OR special_date IS NOT NULL)`, orgId).n,
      social_messages: db.get(`SELECT COUNT(*) AS n FROM messages WHERE org_id = ? AND channel IN ('instagram','facebook','tiktok') AND direction = 'in'`, orgId).n,
    },
  };
}

/** The whole offer for one business: every item with whether it's on and what it still needs. */
export function describe(db, orgId) {
  const s = snapshot(db, orgId);
  const stores = { messaging: s.messaging, bookings: s.bookings, billing: s.billing };
  const items = ITEMS.map((i) => ({
    key: i.key, section: i.section, stage: i.stage, name: i.name, does: i.does, result: i.result, on: Boolean(i.on(s)),
    needs: i.needs ? i.needs(s) : [], edit: i.edit || [],
    options: (i.options || []).map((o) => ({ ...o, value: o.number ? String(stores[o.store][o.key]) : stores[o.store][o.key] ?? '' })),
  }));
  return {
    sections: SECTIONS.map((sec) => ({ ...sec, items: items.filter((i) => i.section === sec.key) })),
    total: items.length, on: items.filter((i) => i.on).length,
    start: { total: items.filter((i) => i.stage === 'start').length, on: items.filter((i) => i.stage === 'start' && i.on).length },
  };
}

/** Switches items on or off (and saves any options), the same as changing them where they live. */
export function applyItems(ctx, orgId, changes) {
  const { db } = ctx;
  for (const { key, on, options } of changes) {
    const item = itemByKey(key);
    if (!item) throw badRequest(`Unknown automation ${key}`);
    if (options && typeof options === 'object') saveOptions(ctx, orgId, item, options);
    if (on !== undefined && on !== null) item.set(ctx, orgId, Boolean(on));
  }
  return describe(db, orgId);
}

function saveOptions(ctx, orgId, item, options) {
  const patch = { messaging: {}, bookings: {}, billing: {} };
  for (const o of item.options || []) {
    if (!(o.key in options)) continue;
    let v = options[o.key];
    if (o.type === 'toggle') v = Boolean(v);
    else if (o.type === 'number' || o.number) {
      v = Number(v);
      if (!Number.isFinite(v)) throw badRequest(`${o.label} must be a number`);
      v = Math.round(Math.min(o.max ?? 1e6, Math.max(o.min ?? 0, v)));
    } else if (o.type === 'select') {
      v = String(v);
      if (!o.choices.some(([c]) => c === v)) throw badRequest(`${o.label}: choose one of the options`);
    } else if (o.type === 'time') {
      if (!/^\d{2}:\d{2}$/.test(String(v))) throw badRequest(`${o.label} must be a time like 10:00`);
    } else if (o.type === 'url') {
      v = String(v || '').trim();
      if (v && !/^https:\/\//i.test(v)) throw badRequest(`${o.label} must start with https://`);
    } else {
      v = String(v ?? '').slice(0, 2000);
    }
    patch[o.store][o.key] = v;
  }
  if (Object.keys(patch.messaging).length) patchMessaging(ctx, orgId, patch.messaging);
  if (Object.keys(patch.bookings).length) patchBookings(ctx, orgId, patch.bookings);
  if (Object.keys(patch.billing).length) patchBilling(ctx, orgId, patch.billing);
}


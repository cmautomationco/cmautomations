import { config } from '../../config.js';
import { parseJson } from '../../db/index.js';
import { getSetting } from '../../lib/settings.js';
import { publicLink } from '../../lib/links.js';
import { displayPhone, toE164 } from '../../lib/phone.js';
import { formatClock, formatDay, inQuietHours, quietHoursEnd } from '../../lib/time.js';
import { addDays, id, now, render } from '../../lib/util.js';
import { notifyUsers } from '../core/notifications.js';
import { createContact, findContactByEmail, findContactByPhone, getContactRow } from '../crm/service.js';
import { createTask } from '../tasks/service.js';
import { deliver, providerFor } from './providers.js';
import { getCredentials } from '../integrations/service.js';
import { contentVariables } from './whatsapp.js';
import { TEMPLATES } from './templates.js';

/**
 * Messaging: every email, text and WhatsApp message the system sends or
 * receives goes through here, so opt-outs, quiet hours, the WhatsApp 24-hour
 * rule and the contact timeline are handled the same way everywhere.
 */

export const MESSAGING_DEFAULTS = {
  email_enabled: true,
  sms_enabled: true,
  whatsapp_enabled: true,
  email_from_name: '',
  email_reply_to: '',
  // The business phone number customers call and text (a Twilio number).
  business_number: '',
  // The WhatsApp Business number (often the same as the business number).
  whatsapp_number: '',
  // The mobile that calls to the business number ring through to.
  forward_to: '',
  // Where team alerts (new messages, missed calls, new bookings, job sheets) go.
  alert_number: '',
  alert_channel: 'whatsapp',
  missed_call_text_back: true,
  ring_seconds: 20,
  voicemail: true,
  // Messages containing these words are flagged as emergencies.
  emergency_keywords: 'emergency, urgent, leak, leaking, flood, flooding, burst, pouring, overflowing, water through, no water, no heating, no hot water, gas smell, smell gas, smell of gas, sparking, burning smell, smoke, no power, power cut, tripping, shock',
  quiet_hours: { enabled: true, start: '20:00', end: '08:00' },
  // Reply straight away to new messages (once every 12 hours per customer), and acknowledge emergencies.
  auto_reply: true,
  emergency_auto_reply: true,
  webhook_url: '',
  review_link: '',
  // Approved WhatsApp templates (Twilio Content SIDs) by message key, for messages sent outside the 24-hour window.
  whatsapp_content_sids: {},
};

export const getMessagingSettings = (db, orgId) => getSetting(db, orgId, 'messaging', MESSAGING_DEFAULTS);

/** The business's name as customers should see it (white-label display name first). */
export function businessName(org) {
  const brand = typeof org?.brand === 'string' ? safeJson(org.brand) : org?.brand || {};
  return brand.display_name || org?.name || 'us';
}
const safeJson = (s) => { try { return JSON.parse(s) || {}; } catch { return {}; } };

/** A template with the business's own wording applied, if they've edited it. */
export function getTemplate(db, orgId, key) {
  const base = TEMPLATES[key];
  if (!base) throw new Error(`Unknown message template ${key}`);
  const custom = db.get('SELECT subject, body, updated_at FROM message_templates WHERE org_id = ? AND key = ?', orgId, key);
  return { key, ...base, ...(custom ? { subject: custom.subject ?? base.subject, body: custom.body, customised: true, updated_at: custom.updated_at } : { customised: false }) };
}

/** Placeholders every message can use. */
export function baseVars(org, contact, settings = {}) {
  const first = contact?.first_name && !/^(new contact|caller|whatsapp enquiry|text enquiry)/i.test(contact.first_name) ? contact.first_name : '';
  const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : '';
  return {
    business: businessName(org),
    first_name: first,
    first_name_spaced: first ? ` ${first}` : '',
    first_name_comma: first ? `, ${first}` : '',
    // Contacts made from a call or message are known by their number until we learn their name.
    name: (first ? name : '') || displayPhone(contact?.phone_e164) || contact?.email || name || 'Someone',
    phone: displayPhone(contact?.phone_e164) || contact?.phone || 'no number',
    booking_link: org?.slug ? publicLink(`book/${org.slug}`) : '',
    review_link: settings.review_link || '',
    business_phone: displayPhone(settings.business_number) || '',
  };
}

/** Booking details as message placeholders. */
export function bookingVars(booking, service, tz) {
  const address = [booking.address, booking.postcode].filter(Boolean).join(', ');
  return {
    service: service?.name || 'appointment',
    date: formatDay(booking.starts_at, tz),
    time: formatClock(booking.starts_at, tz),
    address_line: address ? ` at ${address}` : '',
    address,
    manage_link: publicLink(`booking/${booking.public_token}`),
    urgent_line: booking.urgency === 'emergency' ? ' 🚨 EMERGENCY' : '',
  };
}

const tidy = (text) => String(text ?? '').replace(/[ \t]{2,}/g, ' ').replace(/ ([)’”,.!?])/g, '$1').trim();

function lastInbound(db, contactId, channel) {
  if (!contactId) return null;
  return db.get(`SELECT created_at FROM messages WHERE contact_id = ? AND channel = ? AND direction = 'in' ORDER BY created_at DESC LIMIT 1`, contactId, channel)?.created_at || null;
}

const within24h = (iso) => Boolean(iso && Date.now() - new Date(iso).getTime() < 24 * 3600_000);

/** Can we message this contact on WhatsApp? They opted in, or wrote to us in the last 24 hours. */
export function whatsappAllowed(db, contact) {
  if (!contact?.phone_e164) return false;
  return Boolean(contact.whatsapp_opt_in) || within24h(lastInbound(db, contact.id, 'whatsapp'));
}

/**
 * Picks the best channel for a contact: their preference first, then WhatsApp
 * (if they've opted in), then a text, then email. Returns null if they can't be reached.
 */
export function pickChannel(db, contact, settings, { audience = 'customer' } = {}) {
  if (!contact) return null;
  const customer = audience === 'customer';
  const can = {
    whatsapp: settings.whatsapp_enabled && whatsappAllowed(db, contact) && !(customer && contact.sms_opt_out),
    sms: settings.sms_enabled && Boolean(contact.phone_e164) && !(customer && contact.sms_opt_out),
    email: settings.email_enabled && Boolean(contact.email) && !(customer && contact.email_opt_out),
  };
  if (contact.preferred_channel && contact.preferred_channel !== 'auto' && can[contact.preferred_channel]) return contact.preferred_channel;
  return ['whatsapp', 'sms', 'email'].find((c) => can[c]) || null;
}

function addressFor(channel, contact) {
  if (!contact) return null;
  return channel === 'email' ? contact.email : contact.phone_e164;
}

function fromFor(channel, settings, creds) {
  if (channel === 'email') return creds?.email?.from || config.emailFrom || settings.email_reply_to || 'notifications';
  if (channel === 'whatsapp') return settings.whatsapp_number || settings.business_number || 'business';
  return settings.business_number || 'business';
}

/**
 * Prepares and stores a message (synchronously), ready to deliver.
 * opts: { contact | contactId, to, channel ('auto'), template, vars, subject, body,
 *         related: { type, id }, actorId, audience, force (ignore quiet hours), sendAfter,
 *         strict (send on exactly this channel – no switching to a text) }
 * Returns { message, skipped? }.
 */
export function queueMessage(ctx, orgId, opts) {
  const { db } = ctx;
  const org = db.get('SELECT * FROM organizations WHERE id = ?', orgId);
  const settings = opts.settings || getMessagingSettings(db, orgId);
  const creds = getCredentials(db, orgId);
  const contact = opts.contact ? getContactRow(db, opts.contact.id) || opts.contact : opts.contactId ? getContactRow(db, opts.contactId) : null;
  const tpl = opts.template ? getTemplate(db, orgId, opts.template) : null;
  const audience = opts.audience || tpl?.audience || 'customer';

  let channel = opts.channel && opts.channel !== 'auto' ? opts.channel : null;
  if (!channel) channel = opts.to ? (String(opts.to).includes('@') ? 'email' : 'sms') : pickChannel(db, contact, settings, { audience });
  if (!channel) return { message: null, skipped: 'No way to reach this contact (no number or email, or they have opted out)' };

  let to = opts.to || addressFor(channel, contact);
  if (channel !== 'email') to = toE164(to);
  let status = 'queued';
  let error = null;

  // Respect opt-outs for anything that isn't a direct reply to the customer's own request.
  if (audience === 'customer' && contact) {
    if (channel !== 'email' && contact.sms_opt_out) { status = 'blocked'; error = 'This contact replied STOP to texts and WhatsApp'; }
    if (channel === 'email' && contact.email_opt_out) { status = 'blocked'; error = 'This contact unsubscribed from email'; }
  }
  if (!to) { status = 'blocked'; error = channel === 'email' ? 'No email address' : 'No valid mobile number'; }
  if (status === 'queued' && !settings[`${channel}_enabled`]) { status = 'blocked'; error = `${channel === 'sms' ? 'Text messages are' : channel === 'whatsapp' ? 'WhatsApp is' : 'Email is'} switched off in Settings`; }

  let provider = providerFor(channel, settings, creds);
  const extra = {};
  // WhatsApp only allows free-form messages within 24 hours of the customer's last message.
  // Outside that window a pre-approved template is needed; otherwise fall back to a text.
  if (channel === 'whatsapp' && provider === 'twilio' && status === 'queued' && !opts.strict && !within24h(lastInbound(db, contact?.id, 'whatsapp'))) {
    const sid = tpl && settings.whatsapp_content_sids?.[tpl.key];
    if (sid) extra.contentSid = sid;
    else if (settings.sms_enabled && settings.business_number && !(audience === 'customer' && contact?.sms_opt_out)) {
      channel = 'sms';
      provider = providerFor('sms', settings, creds);
    } else { status = 'blocked'; error = 'WhatsApp needs an approved template outside the 24-hour window'; }
  }

  const vars = { ...baseVars(org, contact, settings), ...(opts.vars || {}) };
  const body = tidy(render(opts.body ?? tpl?.body ?? '', vars));
  const subject = channel === 'email' ? tidy(render(opts.subject ?? tpl?.subject ?? `A message from ${vars.business}`, vars)) : null;
  if (!body) return { message: null, skipped: 'Empty message' };
  // Approved WhatsApp templates number their placeholders in the order they appear in the wording.
  if (extra.contentSid) extra.contentVariables = contentVariables(tpl.body, vars);

  // Customer messages wait until quiet hours end (no texts at 11pm). Emails can go any time.
  let sendAfter = opts.sendAfter || null;
  const tz = org?.timezone || 'Europe/London';
  if (status === 'queued' && !opts.force && audience === 'customer' && channel !== 'email' && settings.quiet_hours?.enabled) {
    const at = sendAfter || now();
    if (inQuietHours(at, tz, settings.quiet_hours.start, settings.quiet_hours.end)) sendAfter = quietHoursEnd(at, tz, settings.quiet_hours.end);
  }

  const message = {
    id: id('msg'), org_id: orgId, contact_id: contact?.id || null, channel, direction: 'out',
    to_addr: to, from_addr: fromFor(channel, settings, creds), subject, body, status, provider: status === 'blocked' ? null : provider,
    provider_id: null, error, template_key: tpl?.key || null, related_type: opts.related?.type || null, related_id: opts.related?.id || null,
    send_after: sendAfter, read: 1, created_by: opts.actorId || null, created_at: now(), sent_at: null,
  };
  db.insert('messages', message);
  if (contact && status !== 'blocked' && audience !== 'staff') db.update('contacts', contact.id, { last_contacted_at: now(), updated_at: now() });
  return { message, extra, settings, creds };
}

/** Hands a queued message to its provider and records the result. */
export async function deliverMessage(ctx, message, settings, extra = {}, creds = null) {
  if (!message || message.status !== 'queued') return message;
  if (message.send_after && new Date(message.send_after) > new Date()) return message;
  const result = await deliver(message.provider, message, settings || getMessagingSettings(ctx.db, message.org_id), extra, creds || getCredentials(ctx.db, message.org_id));
  const patch = { status: result.status, provider_id: result.provider_id || null, error: result.error || null, sent_at: result.status === 'failed' ? null : now() };
  ctx.db.update('messages', message.id, patch);
  return { ...message, ...patch };
}

/** Prepares and delivers a message. Resolves with { message, skipped? }. */
export async function sendMessage(ctx, orgId, opts) {
  const queued = queueMessage(ctx, orgId, opts);
  if (!queued.message) return queued;
  const message = await deliverMessage(ctx, queued.message, queued.settings, queued.extra, queued.creds);
  return { message };
}

/** Queues now, delivers in the background (for automations, which run synchronously). */
export function sendInBackground(ctx, orgId, opts) {
  const queued = queueMessage(ctx, orgId, opts);
  if (queued.message) deliverMessage(ctx, queued.message, queued.settings, queued.extra, queued.creds).catch((err) => console.error('[messages]', err));
  return queued;
}

/** Sends held messages whose time has come (quiet hours over, review requests due). */
export async function dispatchDue(ctx, at = new Date()) {
  const due = ctx.db.all(`SELECT * FROM messages WHERE status = 'queued' AND direction = 'out' AND (send_after IS NULL OR send_after <= ?) ORDER BY created_at LIMIT 100`, at.toISOString());
  let sent = 0;
  for (const m of due) {
    // Anything queued before a restart is sent now; anything newer is still being sent by its request.
    if (!m.send_after && Date.now() - new Date(m.created_at).getTime() < 60_000) continue;
    const result = await deliverMessage(ctx, { ...m, send_after: null });
    if (result.status !== 'failed') sent++;
  }
  return sent;
}

// ───────────────────────── Team alerts ─────────────────────────

/** Admins and owners of a business (who get in-app alerts). */
const adminIds = (db, orgId) => db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin')`, orgId).map((r) => r.user_id);

/**
 * Alerts the team about something that mustn't be missed: in the app, and on
 * the alert phone by WhatsApp or text (any time of day – these are for the team).
 */
export function alertStaff(ctx, orgId, template, vars, { title, link = '#/messages', notify = true } = {}) {
  const { db } = ctx;
  const settings = getMessagingSettings(db, orgId);
  const org = db.get('SELECT * FROM organizations WHERE id = ?', orgId);
  const tpl = getTemplate(db, orgId, template);
  const text = tidy(render(tpl.body, { ...baseVars(org, null, settings), ...vars }));
  if (notify) notifyUsers(db, orgId, adminIds(db, orgId), { title: title || text.slice(0, 80), body: title ? text : '', link });
  const number = settings.alert_number || settings.forward_to;
  if (number && settings.alert_channel !== 'none') {
    return sendInBackground(ctx, orgId, { to: number, channel: settings.alert_channel === 'sms' ? 'sms' : 'whatsapp', body: text, audience: 'staff', force: true, template, settings });
  }
  return null;
}

// ───────────────────────── Incoming messages & calls ─────────────────────────

const STOP_WORDS = /^(stop|stopall|unsubscribe|end|quit|opt out|optout)$/i;
const START_WORDS = /^(start|unstop|subscribe|opt in|optin)$/i;
const CONFIRM_WORDS = /^(c|confirm|confirmed|yes|y|yes please|ok|okay|👍)[.!]*$/i;
const RESCHEDULE_WORDS = /^(r|reschedule|rearrange|change|move|can we change|cancel)[.!]*$/i;

export function isEmergency(text, settings) {
  const words = String(settings.emergency_keywords || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const lower = String(text || '').toLowerCase();
  return words.some((w) => lower.includes(w));
}

/** Finds the contact for a number/email, or creates one so nobody falls through the cracks. */
function contactFor(ctx, orgId, { phone, email, name, source, whatsapp }) {
  let contact = phone ? findContactByPhone(ctx.db, orgId, phone) : null;
  if (!contact && email) contact = findContactByEmail(ctx.db, orgId, email);
  if (contact) {
    if (whatsapp && !contact.whatsapp_opt_in) {
      ctx.db.update('contacts', contact.id, { whatsapp_opt_in: 1, updated_at: now() });
      contact = getContactRow(ctx.db, contact.id);
    }
    return { contact, created: false };
  }
  const [first, ...rest] = String(name || '').trim().split(/\s+/).filter(Boolean);
  // No "welcome call" automation here: the reply / call-back task below covers it.
  const { contact: created } = createContact(ctx, orgId, {
    first_name: first || (whatsapp ? 'WhatsApp enquiry' : phone ? 'Caller' : 'New contact'),
    last_name: rest.join(' ') || null, phone: phone || null, email: email || null, source, whatsapp_opt_in: whatsapp,
    preferred_channel: whatsapp ? 'whatsapp' : 'auto',
  }, { emit: false });
  return { contact: created, created: true };
}

/** One open "reply to"/"call back" task per contact, so repeat messages don't pile up tasks. */
export function ensureTask(ctx, orgId, contact, { title, description, priority }) {
  const open = ctx.db.get(`SELECT * FROM tasks WHERE org_id = ? AND source_ref = ? AND status != 'done' AND (title LIKE 'Reply to%' OR title LIKE 'Call back%' OR title LIKE '🚨%')`, orgId, contact.id);
  if (open) {
    if (priority === 'urgent' && open.priority !== 'urgent') ctx.db.update('tasks', open.id, { priority: 'urgent', title, updated_at: now() });
    return open;
  }
  return createTask(ctx, orgId, {
    title, description, priority, due_at: new Date(Date.now() + (priority === 'urgent' ? 1 : 4) * 3600_000).toISOString(),
    assignee_id: contact.owner_id || null, source: 'crm', source_ref: contact.id,
  }, { emit: false });
}

/** Completes the open reply task once someone has replied to the customer. */
export function closeReplyTasks(db, orgId, contactId) {
  db.run(`UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE org_id = ? AND source_ref = ? AND status != 'done' AND source = 'crm' AND (title LIKE 'Reply to%' OR title LIKE '🚨%')`, now(), now(), orgId, contactId);
}

/** The customer's next booking (to match "C" and "R" replies). */
function nextBooking(db, orgId, contactId) {
  return db.get(`SELECT b.*, s.name AS service_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id
    WHERE b.org_id = ? AND b.contact_id = ? AND b.status IN ('requested','confirmed') AND b.starts_at > ? AND b.starts_at < ?
    ORDER BY b.starts_at LIMIT 1`, orgId, contactId, now(), addDays(now(), 14));
}

/**
 * Handles a text or WhatsApp message from a customer: matches it to the
 * contact (creating one if new), handles STOP/START and booking replies,
 * flags emergencies, and makes sure someone on the team replies.
 */
export async function handleInbound(ctx, orgId, { channel, from, to, body, providerId = null, profileName = null, email = null, subject = null }) {
  const { db, engine } = ctx;
  const settings = getMessagingSettings(db, orgId);
  const org = db.get('SELECT * FROM organizations WHERE id = ?', orgId);
  const text = String(body || '').trim();
  const phone = channel === 'email' ? null : toE164(from);
  const { contact: found, created } = contactFor(ctx, orgId, {
    phone, email: channel === 'email' ? from || email : null, name: profileName,
    source: channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'Text message' : 'Email', whatsapp: channel === 'whatsapp',
  });
  let contact = found;
  const message = {
    id: id('msg'), org_id: orgId, contact_id: contact.id, channel, direction: 'in', to_addr: to || null, from_addr: phone || from,
    subject, body: text || '(empty message)', status: 'received', provider: null, provider_id: providerId, error: null, template_key: null,
    related_type: null, related_id: null, send_after: null, read: 0, created_by: null, created_at: now(), sent_at: null,
  };
  db.insert('messages', message);
  db.update('contacts', contact.id, { last_contacted_at: now(), updated_at: now() });
  const result = { message, contact, created, handled: null, urgent: false, automations: [] };

  if (channel !== 'email' && STOP_WORDS.test(text)) {
    db.update('contacts', contact.id, { sms_opt_out: 1, updated_at: now() });
    db.update('messages', message.id, { read: 1 });
    await sendMessage(ctx, orgId, { contact, channel, template: 'opt_out_confirm', audience: 'system', force: true });
    result.handled = 'opted_out';
    return result;
  }
  if (channel !== 'email' && START_WORDS.test(text)) {
    db.update('contacts', contact.id, { sms_opt_out: 0, updated_at: now() });
    db.update('messages', message.id, { read: 1 });
    contact = getContactRow(db, contact.id);
    await sendMessage(ctx, orgId, { contact, channel, template: 'opt_in_confirm', audience: 'system', force: true });
    result.handled = 'opted_in';
    return result;
  }

  const booking = channel !== 'email' ? nextBooking(db, orgId, contact.id) : null;
  // Describing the job while booking ("old radiator leaking") isn't an emergency call for help.
  const describing = db.get(`SELECT 1 FROM conversations WHERE org_id = ? AND contact_id = ? AND step IN ('name','address','notes')`, orgId, contact.id);
  const urgent = !describing && isEmergency(`${subject || ''} ${text}`, settings);
  result.urgent = urgent;

  // The WhatsApp / text booking assistant: BOOK, picking options, R to move, CANCEL.
  // Emergencies always go straight to a person.
  let handoff = false;
  if (!urgent && channel !== 'email') {
    const { createChat } = await import('../bookings/chat.js');
    const chat = await createChat(ctx).handle({ org, contact, channel, text, nextBooking: booking });
    if (chat?.handled) {
      db.update('messages', message.id, { read: 1, related_type: chat.booking ? 'booking' : 'assistant', related_id: chat.booking?.id || contact.id });
      if (chat.handled === 'chat_started' && booking && RESCHEDULE_WORDS.test(text)) {
        db.update('bookings', booking.id, { reschedule_requested: 1, updated_at: now() });
        result.automations = engine.emit(orgId, 'booking.reschedule_requested', { booking, contact });
      }
      result.handled = chat.handled;
      result.booking = chat.booking || null;
      if (!chat.handoff) return result;
      handoff = true;
    }
  }

  // "C" confirms and "R" asks to rearrange their next booking.
  if (!handoff && booking && (CONFIRM_WORDS.test(text) || RESCHEDULE_WORDS.test(text))) {
    const tz = org.timezone || 'Europe/London';
    const service = { name: booking.service_name };
    const vars = bookingVars(booking, service, tz);
    if (CONFIRM_WORDS.test(text)) {
      db.update('bookings', booking.id, { customer_confirmed_at: now(), reschedule_requested: 0, updated_at: now() });
      db.update('messages', message.id, { read: 1, related_type: 'booking', related_id: booking.id });
      await sendMessage(ctx, orgId, { contact, channel, template: 'booking_confirmed_by_customer', vars, audience: 'system', force: true, related: { type: 'booking', id: booking.id } });
      result.handled = 'booking_confirmed';
      result.automations = engine.emit(orgId, 'booking.customer_confirmed', { booking: { ...booking, customer_confirmed_at: now() }, contact });
    } else {
      db.update('bookings', booking.id, { reschedule_requested: 1, updated_at: now() });
      db.update('messages', message.id, { related_type: 'booking', related_id: booking.id });
      await sendMessage(ctx, orgId, { contact, channel, template: 'booking_reschedule', vars: { ...vars, booking_link: vars.manage_link }, audience: 'system', force: true, related: { type: 'booking', id: booking.id } });
      ensureTask(ctx, orgId, contact, {
        title: `Reply to ${baseVars(org, contact).name} – wants to rearrange ${vars.date}`,
        description: `They replied “${text}” to their ${vars.service} reminder. Agree a new time and move the booking in Bookings.`, priority: 'high',
      });
      alertStaff(ctx, orgId, 'staff_booking_update', { ...vars, name: baseVars(org, contact).name, update: 'wants to rearrange' }, { title: `Rearrange: ${baseVars(org, contact).name}`, link: '#/bookings' });
      result.handled = 'booking_reschedule';
      result.automations = engine.emit(orgId, 'booking.reschedule_requested', { booking, contact });
    }
    return result;
  }

  // Anything else needs a person: flag emergencies, alert the team and make a reply task.
  const label = { whatsapp: 'WhatsApp', sms: 'text', email: 'email' }[channel];
  contact = getContactRow(db, contact.id);
  const who = baseVars(org, contact).name;
  ensureTask(ctx, orgId, contact, {
    title: urgent ? `🚨 Emergency: reply to ${who} now` : `Reply to ${who} (${label})`,
    description: `“${text.slice(0, 400)}”\n\nReply from Messages so it's saved on their record.`,
    priority: urgent ? 'urgent' : 'high',
  });
  alertStaff(ctx, orgId, 'staff_new_message', {
    urgent_prefix: urgent ? '🚨 EMERGENCY – ' : '', channel: label, name: who, phone: baseVars(org, contact).phone, message: text.slice(0, 300),
  }, { title: `${urgent ? '🚨 ' : ''}New ${label} from ${who}`, link: `#/messages/${contact.id}` });

  // Let the customer know straight away that they've been heard.
  if (channel !== 'email' && !handoff) {
    if (urgent && settings.emergency_auto_reply && !sentRecently(db, contact.id, 2, 'emergency_ack')) {
      await sendMessage(ctx, orgId, { contact, channel, template: 'emergency_ack', audience: 'system', force: true, strict: true });
    } else if (!urgent && settings.auto_reply && !sentRecently(db, contact.id, 12)) {
      await sendMessage(ctx, orgId, { contact, channel, template: 'auto_reply', vars: { book_line: bookLine(db, org) }, audience: 'system', force: true, strict: true });
    }
  }
  result.automations = engine.emit(orgId, 'message.received', { message, contact, urgent, channel });
  return result;
}

/** Has anything (or a given message) gone to this contact in the last few hours? */
function sentRecently(db, contactId, hours, templateKey = null) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  return Boolean(db.get(`SELECT 1 FROM messages WHERE contact_id = ? AND direction = 'out' AND created_at > ? ${templateKey ? 'AND template_key = ?' : ''} LIMIT 1`, ...[contactId, since, ...(templateKey ? [templateKey] : [])]));
}

/** " Want to book a visit? Reply BOOK…" – only when the booking assistant can take bookings. */
function bookLine(db, org) {
  const row = db.get(`SELECT value FROM org_meta WHERE org_id = ? AND key = 'setting:bookings'`, org.id);
  let bookings = {};
  try { bookings = JSON.parse(row?.value || '{}'); } catch { /* defaults */ }
  if (bookings.enabled === false || bookings.chat_booking === false) return '';
  if (!db.get('SELECT 1 FROM services WHERE org_id = ? AND active = 1 AND online = 1 LIMIT 1', org.id)) return '';
  return ` Want to book ${org.niche === 'local_services' ? 'a visit' : 'an appointment'}? Reply BOOK and pick a time right here.`;
}

/**
 * Handles a call to the business number that nobody answered: texts the
 * caller straight back, makes a call-back task and alerts the team.
 */
export async function handleMissedCall(ctx, orgId, { from, to = null, providerId = null, voicemailUrl = null, status = 'missed', duration = null }) {
  const { db, engine } = ctx;
  const settings = getMessagingSettings(db, orgId);
  const org = db.get('SELECT * FROM organizations WHERE id = ?', orgId);
  const phone = toE164(from);
  const { contact, created } = contactFor(ctx, orgId, { phone, source: 'Phone call' });
  const call = {
    id: id('cal'), org_id: orgId, contact_id: contact.id, from_number: phone || String(from || 'unknown'), to_number: to,
    status: voicemailUrl ? 'voicemail' : status, duration_seconds: duration, recording_url: voicemailUrl, provider_id: providerId,
    texted_back: 0, handled: status === 'answered' ? 1 : 0, created_at: now(),
  };
  db.insert('calls', call);
  if (status === 'answered') return { call, contact, created, automations: [] };

  // Text back once per half hour per caller (people often ring two or three times).
  let textBack = null;
  const recent = db.get(`SELECT 1 FROM calls WHERE org_id = ? AND from_number = ? AND texted_back = 1 AND created_at > ?`, orgId, call.from_number, new Date(Date.now() - 30 * 60_000).toISOString());
  if (settings.missed_call_text_back && !recent && phone && !contact.sms_opt_out) {
    textBack = await sendMessage(ctx, orgId, {
      contact, channel: whatsappAllowed(db, contact) && settings.whatsapp_enabled ? 'whatsapp' : 'sms', template: 'missed_call',
      force: true, related: { type: 'call', id: call.id },
    });
    if (textBack.message && textBack.message.status !== 'blocked' && textBack.message.status !== 'failed') {
      db.update('calls', call.id, { texted_back: 1 });
      call.texted_back = 1;
    }
  }
  const vars = baseVars(org, contact, settings);
  ensureTask(ctx, orgId, contact, {
    title: `Call back ${vars.name}${voicemailUrl ? ' – left a voicemail' : ' – missed call'}`,
    description: `${vars.phone} rang the business number${voicemailUrl ? ' and left a voicemail (listen in Messages → Calls)' : ''}.${call.texted_back ? ' They were texted straight back automatically.' : ''}`,
    priority: 'high',
  });
  alertStaff(ctx, orgId, 'staff_missed_call', { name: vars.name, phone: vars.phone, texted_line: call.texted_back ? ' We’ve texted them back.' : '' },
    { title: `📞 Missed call from ${vars.name}`, link: '#/messages/calls' });
  engine.logSystemRun(orgId, 'Missed-call text-back', 'call.missed', call.texted_back ? `Texted ${vars.phone} back and made a call-back task` : `Made a call-back task for ${vars.phone}`, call.texted_back ? 4 : 2);
  const automations = engine.emit(orgId, 'call.missed', { call, contact });
  return { call, contact, created, textBack: textBack?.message || null, automations };
}

/** Message thread for one contact, oldest first. */
export function threadFor(db, orgId, contactId) {
  return db.all('SELECT m.*, u.name AS author FROM messages m LEFT JOIN users u ON u.id = m.created_by WHERE m.org_id = ? AND m.contact_id = ? ORDER BY m.created_at, m.rowid', orgId, contactId);
}

export const contactWithMessages = (db, contactId) => parseJson(db.get('SELECT * FROM contacts WHERE id = ?', contactId), 'tags');

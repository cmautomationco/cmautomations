import { config } from '../../config.js';
import { publicLink } from '../../lib/links.js';
import { formatMoney } from '../../lib/money.js';
import { getSetting, setSetting } from '../../lib/settings.js';
import { addLocalDays, formatClock, formatDay, inQuietHours, localDate, localTime, weekdayOf, zonedToUtc } from '../../lib/time.js';
import { badRequest, id, notFound, now, publicToken } from '../../lib/util.js';
import { notifyUsers } from '../core/notifications.js';
import { getContactRow, logActivity, upsertContact } from '../crm/service.js';
import { alertStaff, baseVars, bookingVars, deliverMessage, getMessagingSettings, queueMessage } from '../messaging/service.js';
import { createDocument, invoiceFrom, sendDocument, voidDocument } from '../billing/service.js';

/**
 * Bookings: services, opening hours, online booking, reminders that cut
 * no-shows, deposits, "on my way" texts, job sheets and a calendar feed for
 * Google/Outlook/Apple. Built for appointment businesses and for trades
 * (call-outs at the customer's address, emergencies, WhatsApp updates).
 */

export const ACTIVE = ['requested', 'confirmed', 'on_the_way'];
const TRADE_NICHES = ['local_services'];

const day = (open, start, end) => ({ open, start, end });

export function bookingDefaults(niche) {
  const trade = TRADE_NICHES.includes(niche);
  return {
    enabled: true,
    intro: trade ? 'Book a visit, a quote or a call-out. We’ll text or WhatsApp you to confirm.' : 'Pick a service and a time that suits you.',
    hours: {
      mon: day(true, trade ? '08:00' : '09:00', trade ? '17:30' : '17:00'),
      tue: day(true, trade ? '08:00' : '09:00', trade ? '17:30' : '17:00'),
      wed: day(true, trade ? '08:00' : '09:00', trade ? '17:30' : '17:00'),
      thu: day(true, trade ? '08:00' : '09:00', trade ? '17:30' : '17:00'),
      fri: day(true, trade ? '08:00' : '09:00', trade ? '17:00' : '17:00'),
      sat: day(trade, '09:00', '13:00'),
      sun: day(false, '10:00', '14:00'),
    },
    slot_step_min: 30,
    min_notice_hours: trade ? 4 : 2,
    max_days_ahead: 30,
    // How many jobs/appointments can run at the same time (e.g. number of engineers).
    capacity: 1,
    auto_confirm: true,
    require_address: trade,
    reminder_24h: true,
    reminder_time: '10:00',
    reminder_2h: true,
    review_request: true,
    review_delay_hours: 2,
    job_sheet: true,
    job_sheet_time: '07:00',
    emergency_callouts: trade,
    emergency_note: trade ? 'Emergency? (leak, no heating, no power) Don’t book online – call or WhatsApp us now and we’ll get to you as fast as we can.' : '',
    cancel_notice_hours: 24,
    calendar_token: '',
  };
}

export function getBookingSettings(db, org) {
  const settings = getSetting(db, org.id, 'bookings', bookingDefaults(org.niche));
  if (!settings.calendar_token) {
    settings.calendar_token = publicToken();
    setSetting(db, org.id, 'bookings', settings);
  }
  return settings;
}

export const calendarFeedUrl = (org, settings) => `${config.publicUrl.replace(/\/[^/]*\.[a-z0-9]+$/i, '')}/api/public/calendar/${org.slug}/${settings.calendar_token}.ics`;

export function getBooking(db, orgId, bookingId) {
  const b = db.get(`SELECT b.*, s.name AS service_name, s.kind AS service_kind, s.duration_min, c.first_name, c.last_name, c.phone_e164 AS contact_phone, c.email AS contact_email,
      c.whatsapp_opt_in, u.name AS staff_name
    FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN contacts c ON c.id = b.contact_id LEFT JOIN users u ON u.id = b.staff_id
    WHERE b.id = ? AND b.org_id = ?`, bookingId, orgId);
  if (!b) throw notFound('Booking');
  b.contact_name = [b.first_name, b.last_name].filter(Boolean).join(' ');
  b.manage_link = publicLink(`booking/${b.public_token}`);
  return b;
}

export function listServices(db, orgId, { onlineOnly = false } = {}) {
  return db.all(`SELECT * FROM services WHERE org_id = ? AND active = 1 ${onlineOnly ? 'AND online = 1' : ''} ORDER BY position, name`, orgId);
}

const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const plusMinutes = (iso, mins) => new Date(new Date(iso).getTime() + mins * 60_000).toISOString();

/** How many bookings (and time off) overlap a window. Time off for everyone blocks the window. */
function busyCount(db, orgId, start, end, { excludeId = null } = {}) {
  const jobs = db.get(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND status IN ('requested','confirmed','on_the_way') AND starts_at < ? AND ends_at > ? ${excludeId ? 'AND id != ?' : ''}`,
    ...[orgId, end, start, ...(excludeId ? [excludeId] : [])]).n;
  const off = db.all('SELECT staff_id FROM time_off WHERE org_id = ? AND starts_at < ? AND ends_at > ?', orgId, end, start);
  if (off.some((o) => !o.staff_id)) return Infinity;
  return jobs + off.length;
}

/** Free start times for a service on a local date. */
export function slotsFor(db, org, service, date, settings, { excludeId = null, at = new Date() } = {}) {
  const tz = org.timezone || 'Europe/London';
  const today = localDate(at, tz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || date < today || date > addLocalDays(today, settings.max_days_ahead)) return [];
  const hours = settings.hours?.[weekdayOf(date)];
  if (!hours?.open) return [];
  const earliest = at.getTime() + settings.min_notice_hours * 3600_000;
  const duration = service.duration_min || 60;
  const buffer = service.buffer_min || 0;
  const slots = [];
  for (let t = minutes(hours.start); t + duration <= minutes(hours.end); t += settings.slot_step_min || 30) {
    const start = zonedToUtc(date, hhmm(t), tz);
    if (new Date(start).getTime() < earliest) continue;
    const end = plusMinutes(start, duration);
    if (busyCount(db, org.id, plusMinutes(start, -buffer), plusMinutes(end, buffer), { excludeId }) >= (settings.capacity || 1)) continue;
    slots.push({ starts_at: start, label: formatClock(start, tz) });
  }
  return slots;
}

/** Which of the next days have free slots (for the booking page's date picker). */
export function availableDays(db, org, service, settings, { days = 14, at = new Date() } = {}) {
  const tz = org.timezone || 'Europe/London';
  const today = localDate(at, tz);
  const out = [];
  for (let i = 0; i < Math.min(days, settings.max_days_ahead + 1); i++) {
    const date = addLocalDays(today, i);
    const count = slotsFor(db, org, service, date, settings, { at }).length;
    out.push({ date, label: formatDay(zonedToUtc(date, '12:00', tz), tz), open: Boolean(settings.hours?.[weekdayOf(date)]?.open), slots: count });
  }
  return out;
}

const adminIds = (db, orgId) => db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin')`, orgId).map((r) => r.user_id);

async function sendBookingMessage(ctx, orgId, booking, template, extraVars = {}, opts = {}) {
  if (!booking.contact_id) return null;
  const org = ctx.db.get('SELECT * FROM organizations WHERE id = ?', orgId);
  const service = booking.service_id ? ctx.db.get('SELECT * FROM services WHERE id = ?', booking.service_id) : null;
  const vars = { ...bookingVars(booking, service, org.timezone), ...extraVars };
  const queued = queueMessage(ctx, orgId, { contactId: booking.contact_id, template, vars, related: { type: 'booking', id: booking.id }, ...opts });
  if (!queued.message) return null;
  return deliverMessage(ctx, queued.message, queued.settings, queued.extra);
}

/**
 * Creates a booking. data: service_id, starts_at, contact_id | contact {first_name, phone, email…},
 * staff_id, address, postcode, notes, urgency, price_pence, notify (default true).
 * source: 'online' | 'phone' | 'whatsapp' | 'manual'.
 */
export async function createBooking(ctx, orgId, data, { actorId = null, source = 'manual' } = {}) {
  const { db, engine } = ctx;
  const org = db.get('SELECT * FROM organizations WHERE id = ?', orgId);
  const settings = getBookingSettings(db, org);
  const service = data.service_id ? db.get('SELECT * FROM services WHERE id = ? AND org_id = ?', data.service_id, orgId) : null;
  if (!service) throw badRequest('Choose a service');
  const start = new Date(data.starts_at);
  if (Number.isNaN(start.getTime())) throw badRequest('Choose a date and time');
  const startsAt = start.toISOString();
  const endsAt = plusMinutes(startsAt, service.duration_min || 60);

  if (source === 'online') {
    const free = slotsFor(db, org, service, localDate(startsAt, org.timezone), settings).some((s) => s.starts_at === startsAt);
    if (!free) throw badRequest('Sorry, that time has just been taken – please pick another');
  }
  const clash = busyCount(db, orgId, startsAt, endsAt) >= (settings.capacity || 1);

  let contact;
  let contactCreated = false;
  if (data.contact_id) {
    contact = getContactRow(db, data.contact_id);
    if (!contact || contact.org_id !== orgId) throw badRequest('That contact isn’t in this business');
  } else {
    const c = data.contact || {};
    if (!c.first_name) throw badRequest('Add the customer’s name');
    if (!c.phone && !c.email) throw badRequest('Add a mobile number or email so we can confirm the booking');
    const sourceLabel = { online: 'Online booking', phone: 'Phone call', whatsapp: 'WhatsApp', manual: 'Booking' }[source];
    // The booking itself is the follow-up, so new customers skip the "welcome call" automation.
    const res = upsertContact(ctx, orgId, { ...c, address: data.address, postcode: data.postcode, source: sourceLabel }, { actorId, emit: false });
    contact = res.contact;
    contactCreated = res.created;
  }
  if (settings.require_address && source === 'online' && !data.address) throw badRequest('Add the address for the visit');

  const deposit = source === 'online' ? service.deposit_pence || 0 : 0;
  const status = data.status || (deposit > 0 || (source === 'online' && !settings.auto_confirm) ? 'requested' : 'confirmed');
  const ts = now();
  const booking = {
    id: id('bkg'), org_id: orgId, service_id: service.id, contact_id: contact.id, staff_id: data.staff_id || null,
    starts_at: startsAt, ends_at: endsAt, status, urgency: data.urgency === 'emergency' ? 'emergency' : 'normal', source,
    address: data.address || contact.address || null, postcode: (data.postcode || contact.postcode || '').toUpperCase() || null, notes: data.notes || null,
    customer_confirmed_at: source === 'online' ? ts : null, reschedule_requested: 0, deposit_pence: deposit,
    price_pence: data.price_pence ?? service.price_pence ?? 0, public_token: publicToken(), created_by: actorId, created_at: ts, updated_at: ts,
  };
  db.insert('bookings', booking);
  if (booking.address && !contact.address) db.update('contacts', contact.id, { address: booking.address, postcode: booking.postcode, updated_at: ts });
  const tz = org.timezone;
  logActivity(db, orgId, contact.id, `Booked: ${service.name} on ${formatDay(startsAt, tz)} at ${formatClock(startsAt, tz)} (${{ online: 'online', phone: 'by phone', whatsapp: 'via WhatsApp', manual: 'by the team' }[source]})`, { actorId });

  let message = null;
  let depositInvoice = null;
  if (data.notify !== false) {
    if (deposit > 0) {
      depositInvoice = createDocument(ctx, orgId, { kind: 'invoice', purpose: 'deposit', contact_id: contact.id, booking_id: booking.id, title: `Deposit – ${service.name}`, line_items: [{ description: `Deposit to secure ${service.name} on ${formatDay(startsAt, tz)} at ${formatClock(startsAt, tz)}`, quantity: 1, unit_pence: deposit, vat_rate: 0 }], chase: false });
      const sent = await sendDocument(ctx, orgId, depositInvoice.id, { actorId }).catch(() => null);
      message = sent?.message || null;
    } else {
      message = await sendBookingMessage(ctx, orgId, booking, status === 'confirmed' ? 'booking_confirmation' : 'booking_request_received', {}, { force: true });
    }
  }
  // The team is told about bookings customers make themselves, and about emergencies.
  if (source === 'online' || booking.urgency === 'emergency') {
    const vars = bookingVars(booking, service, tz);
    alertStaff(ctx, orgId, 'staff_new_booking', { ...vars, name: baseVars(org, contact).name }, { title: `${booking.urgency === 'emergency' ? '🚨 ' : '📅 '}New booking: ${service.name} – ${vars.date} ${vars.time}`, link: `#/bookings/${booking.id}` });
  }
  engine.logSystemRun(orgId, 'Booking', 'booking.created', `${service.name} booked ${source === 'online' ? 'online' : `(${source})`} – contact ${contactCreated ? 'created' : 'updated'}, confirmation sent`, source === 'online' ? 10 : 4);
  const full = getBooking(db, orgId, booking.id);
  const automations = engine.emit(orgId, 'booking.created', { booking: full, contact: getContactRow(db, contact.id), service }, { actorId });
  return { booking: full, contact: getContactRow(db, contact.id), message, depositInvoice, clash, automations };
}

/** Confirms a requested booking (e.g. its deposit was paid) and tells the customer. */
export async function confirmBooking(ctx, orgId, bookingId, { reason = '', actorId = null, notify = true } = {}) {
  const booking = getBooking(ctx.db, orgId, bookingId);
  if (booking.status !== 'requested') return booking;
  ctx.db.update('bookings', booking.id, { status: 'confirmed', updated_at: now() });
  logActivity(ctx.db, orgId, booking.contact_id, `Booking confirmed${reason ? ` – ${reason}` : ''}`, { actorId });
  const updated = getBooking(ctx.db, orgId, booking.id);
  if (notify) await sendBookingMessage(ctx, orgId, updated, 'booking_confirmation', {}, { force: true });
  return updated;
}

/** Moves a booking, assigns it or edits its details. Moving it tells the customer and resets reminders. */
export async function updateBooking(ctx, orgId, bookingId, patch, { actorId = null } = {}) {
  const { db } = ctx;
  const before = getBooking(db, orgId, bookingId);
  const changes = { updated_at: now() };
  for (const key of ['staff_id', 'address', 'notes', 'urgency', 'price_pence']) if (patch[key] !== undefined) changes[key] = patch[key];
  if (patch.postcode !== undefined) changes.postcode = patch.postcode ? String(patch.postcode).toUpperCase() : null;
  if (patch.service_id && patch.service_id !== before.service_id) {
    if (!db.get('SELECT 1 FROM services WHERE id = ? AND org_id = ?', patch.service_id, orgId)) throw badRequest('Unknown service');
    changes.service_id = patch.service_id;
  }
  const service = db.get('SELECT * FROM services WHERE id = ?', changes.service_id || before.service_id);
  let moved = false;
  if (patch.starts_at && new Date(patch.starts_at).toISOString() !== before.starts_at) {
    const startsAt = new Date(patch.starts_at).toISOString();
    Object.assign(changes, { starts_at: startsAt, ends_at: plusMinutes(startsAt, service?.duration_min || 60), reminder_24h_at: null, reminder_2h_at: null, customer_confirmed_at: null, reschedule_requested: 0, check_notified: 0 });
    moved = true;
  } else if (changes.service_id) {
    changes.ends_at = plusMinutes(before.starts_at, service?.duration_min || 60);
  }
  db.update('bookings', before.id, changes);
  const booking = getBooking(db, orgId, before.id);
  let message = null;
  if (moved) {
    const tz = db.get('SELECT timezone FROM organizations WHERE id = ?', orgId).timezone;
    logActivity(db, orgId, booking.contact_id, `Booking moved to ${formatDay(booking.starts_at, tz)} at ${formatClock(booking.starts_at, tz)}`, { actorId });
    if (patch.notify !== false && ACTIVE.includes(booking.status)) message = await sendBookingMessage(ctx, orgId, booking, 'booking_moved', {}, { force: true });
  }
  return { booking, message };
}

/**
 * Changes a booking's status: on_the_way (texts the customer an ETA), completed
 * (queues a review request, optionally drafts the invoice), no_show, cancelled.
 */
export async function setBookingStatus(ctx, orgId, bookingId, status, { actorId = null, etaMinutes = 30, reason = '', notify = true, createInvoice = false } = {}) {
  const { db, engine } = ctx;
  const booking = getBooking(db, orgId, bookingId);
  const org = db.get('SELECT * FROM organizations WHERE id = ?', orgId);
  const settings = getBookingSettings(db, org);
  const tz = org.timezone;
  const ts = now();
  const out = { message: null, invoice: null, automations: [] };
  const contact = booking.contact_id ? getContactRow(db, booking.contact_id) : null;

  if (status === 'confirmed') {
    out.booking = await confirmBooking(ctx, orgId, bookingId, { actorId, notify });
    return out;
  }
  if (status === 'on_the_way') {
    if (!ACTIVE.includes(booking.status)) throw badRequest(`This booking is ${booking.status.replace('_', ' ')}`);
    db.update('bookings', booking.id, { status: 'on_the_way', on_the_way_at: ts, updated_at: ts });
    const staff = actorId ? db.get('SELECT name FROM users WHERE id = ?', actorId)?.name : booking.staff_name;
    const eta = formatClock(plusMinutes(ts, Number(etaMinutes) || 30), tz);
    if (notify) out.message = await sendBookingMessage(ctx, orgId, booking, 'booking_on_my_way', { staff: (staff || 'Our engineer').split(' ')[0], eta }, { force: true });
    logActivity(db, orgId, booking.contact_id, `On the way – ETA ${eta}`, { actorId });
    engine.logSystemRun(orgId, 'On-my-way text', 'booking.on_the_way', `Told ${booking.contact_name || 'the customer'} we’re on the way (ETA ${eta})`, 2);
  } else if (status === 'completed') {
    if (['cancelled', 'no_show'].includes(booking.status)) throw badRequest(`This booking was ${booking.status.replace('_', ' ')}`);
    db.update('bookings', booking.id, { status: 'completed', completed_at: ts, updated_at: ts });
    logActivity(db, orgId, booking.contact_id, `Job completed: ${booking.service_name || 'booking'}`, { actorId });
    if (contact && contact.lifecycle !== 'customer') db.update('contacts', contact.id, { lifecycle: 'customer', updated_at: ts });
    const msgSettings = getMessagingSettings(db, orgId);
    if (notify && settings.review_request && msgSettings.review_link && booking.contact_id) {
      const queued = queueMessage(ctx, orgId, { contactId: booking.contact_id, template: 'booking_review_request', related: { type: 'booking', id: booking.id }, sendAfter: plusMinutes(ts, (settings.review_delay_hours || 0) * 60) });
      out.message = queued.message;
    }
    if (createInvoice) out.invoice = invoiceFrom(ctx, orgId, { booking: getBooking(db, orgId, booking.id) }, { actorId });
  } else if (status === 'no_show') {
    db.update('bookings', booking.id, { status: 'no_show', updated_at: ts });
    logActivity(db, orgId, booking.contact_id, `No-show: ${booking.service_name || 'booking'} on ${formatDay(booking.starts_at, tz)}`, { actorId });
    if (notify) out.message = await sendBookingMessage(ctx, orgId, booking, 'booking_no_show', {}, {});
  } else if (status === 'cancelled') {
    if (booking.status === 'cancelled') return { ...out, booking };
    db.update('bookings', booking.id, { status: 'cancelled', cancelled_at: ts, cancel_reason: reason || null, updated_at: ts });
    logActivity(db, orgId, booking.contact_id, `Booking cancelled${reason ? `: ${reason}` : ''}`, { actorId });
    for (const dep of db.all(`SELECT id FROM invoices WHERE booking_id = ? AND purpose = 'deposit' AND paid_pence = 0 AND status != 'void'`, booking.id)) voidDocument(ctx, orgId, dep.id, { actorId });
    if (notify) out.message = await sendBookingMessage(ctx, orgId, booking, 'booking_cancelled', {}, { force: true });
  } else {
    throw badRequest('Unknown status');
  }
  out.booking = getBooking(db, orgId, booking.id);
  out.automations = engine.emit(orgId, `booking.${status}`, { booking: out.booking, contact, service: { name: booking.service_name } }, { actorId });
  return out;
}

/** Customer self-service from the link in their messages: confirm, cancel or move. */
export async function customerAction(ctx, booking, action, data = {}) {
  const { db } = ctx;
  const org = db.get('SELECT * FROM organizations WHERE id = ?', booking.org_id);
  const settings = getBookingSettings(db, org);
  const name = booking.contact_name || 'The customer';
  if (!ACTIVE.includes(booking.status)) throw badRequest(`This booking is ${booking.status.replace('_', ' ')}`);
  const vars = bookingVars(booking, { name: booking.service_name }, org.timezone);
  if (action === 'confirm') {
    db.update('bookings', booking.id, { customer_confirmed_at: now(), updated_at: now() });
    logActivity(db, org.id, booking.contact_id, 'Customer confirmed their booking online');
    return getBooking(db, org.id, booking.id);
  }
  if (action === 'cancel') {
    const hoursAway = (new Date(booking.starts_at).getTime() - Date.now()) / 3600_000;
    if (hoursAway < settings.cancel_notice_hours) throw badRequest(`It’s less than ${settings.cancel_notice_hours} hours until your booking – please call or message us to cancel.`);
    const res = await setBookingStatus(ctx, org.id, booking.id, 'cancelled', { reason: data.reason || 'Cancelled by the customer online' });
    alertStaff(ctx, org.id, 'staff_booking_update', { ...vars, name, update: 'cancelled online' }, { title: `Cancelled: ${name} – ${vars.date} ${vars.time}`, link: `#/bookings/${booking.id}` });
    return res.booking;
  }
  if (action === 'reschedule') {
    const service = db.get('SELECT * FROM services WHERE id = ?', booking.service_id);
    const when = new Date(data.starts_at || '');
    if (Number.isNaN(when.getTime())) throw badRequest('Choose a new time');
    const startsAt = when.toISOString();
    const free = slotsFor(db, org, service, localDate(startsAt, org.timezone), settings, { excludeId: booking.id }).some((s) => s.starts_at === startsAt);
    if (!free) throw badRequest('Sorry, that time isn’t available – please pick another');
    const { booking: moved } = await updateBooking(ctx, org.id, booking.id, { starts_at: startsAt });
    db.update('bookings', booking.id, { customer_confirmed_at: now() });
    const newVars = bookingVars(moved, service, org.timezone);
    alertStaff(ctx, org.id, 'staff_booking_update', { ...newVars, name, update: `moved their booking (was ${vars.date} ${vars.time}) to` }, { title: `Moved: ${name} → ${newVars.date} ${newVars.time}`, link: `#/bookings/${booking.id}` });
    return getBooking(db, org.id, booking.id);
  }
  throw badRequest('Unknown action');
}

/**
 * Scheduler step: day-before and 2-hour reminders, the morning job sheet and a
 * nudge to close off jobs that have finished (so invoices and reviews go out).
 */
export async function runBookingSchedule(ctx, at = new Date()) {
  const { db, engine } = ctx;
  const summary = { reminders: 0, jobSheets: 0, checks: 0 };
  const iso = at.toISOString();
  const orgs = new Map();
  const orgInfo = (orgId) => {
    if (!orgs.has(orgId)) {
      const org = db.get('SELECT * FROM organizations WHERE id = ?', orgId);
      orgs.set(orgId, { org, settings: getBookingSettings(db, org), messaging: getMessagingSettings(db, orgId) });
    }
    return orgs.get(orgId);
  };

  const upcoming = db.all(`SELECT * FROM bookings WHERE status = 'confirmed' AND starts_at > ? AND starts_at < ? AND (reminder_24h_at IS NULL OR reminder_2h_at IS NULL)`, iso, new Date(at.getTime() + 2 * 86400_000).toISOString());
  for (const b of upcoming) {
    const { org, settings, messaging } = orgInfo(b.org_id);
    const tz = org.timezone;
    const msUntil = new Date(b.starts_at).getTime() - at.getTime();
    const ageHours = (at.getTime() - new Date(b.created_at).getTime()) / 3600_000;
    if (!b.reminder_24h_at && localDate(b.starts_at, tz) === addLocalDays(localDate(at, tz), 1) && localTime(at, tz) >= settings.reminder_time) {
      db.update('bookings', b.id, { reminder_24h_at: iso });
      // Booked in the last few hours? They've just had their confirmation, so no need.
      if (settings.reminder_24h && ageHours > 6) {
        await sendBookingMessage(ctx, b.org_id, b, 'booking_reminder_24h');
        engine.logSystemRun(b.org_id, 'Booking reminder', 'booking.reminder', `Day-before reminder sent for ${formatDay(b.starts_at, tz)} ${formatClock(b.starts_at, tz)}`, 3);
        summary.reminders++;
      }
    }
    if (!b.reminder_2h_at && msUntil <= 2 * 3600_000 && msUntil > 20 * 60_000) {
      db.update('bookings', b.id, { reminder_2h_at: iso });
      const quiet = messaging.quiet_hours?.enabled && inQuietHours(at, tz, messaging.quiet_hours.start, messaging.quiet_hours.end);
      if (settings.reminder_2h && ageHours > 3 && !quiet) {
        await sendBookingMessage(ctx, b.org_id, b, 'booking_reminder_2h');
        engine.logSystemRun(b.org_id, 'Booking reminder', 'booking.reminder', `2-hour reminder sent for ${formatClock(b.starts_at, tz)}`, 2);
        summary.reminders++;
      }
    }
  }

  // Jobs that finished over an hour ago but were never closed off.
  for (const b of db.all(`SELECT b.*, s.name AS service_name, c.first_name, c.last_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN contacts c ON c.id = b.contact_id
      WHERE b.status IN ('confirmed','on_the_way') AND b.check_notified = 0 AND b.ends_at < ?`, new Date(at.getTime() - 3600_000).toISOString())) {
    db.update('bookings', b.id, { check_notified: 1 });
    const who = b.staff_id ? [b.staff_id] : adminIds(db, b.org_id);
    notifyUsers(db, b.org_id, who, { title: `Was ${b.service_name || 'the job'} for ${[b.first_name, b.last_name].filter(Boolean).join(' ') || 'the customer'} done?`, body: 'Mark it done (sends the invoice and review request) or no-show.', link: `#/bookings/${b.id}` });
    summary.checks++;
  }

  // Morning job sheet to the team's phone.
  for (const org of db.all('SELECT * FROM organizations')) {
    const { settings } = orgInfo(org.id);
    if (!settings.enabled || !settings.job_sheet) continue;
    const tz = org.timezone;
    const today = localDate(at, tz);
    if (localTime(at, tz) < settings.job_sheet_time) continue;
    const last = db.get(`SELECT value FROM org_meta WHERE org_id = ? AND key = 'last_job_sheet'`, org.id)?.value;
    if (last === today) continue;
    db.run(`INSERT INTO org_meta (org_id, key, value) VALUES (?, 'last_job_sheet', ?) ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value`, org.id, today);
    const jobs = jobSheet(db, org, today);
    if (!jobs.length) continue;
    const lines = jobs.map((j) => `• ${formatClock(j.starts_at, tz)} ${j.service_name || 'Job'} – ${j.contact_name || 'Customer'}${j.address ? `, ${[j.address, j.postcode].filter(Boolean).join(' ')}` : ''}${j.contact_phone ? ` (${j.phone_display})` : ''}${j.urgency === 'emergency' ? ' 🚨' : ''}${j.customer_confirmed_at ? ' ✅' : ' ❔'}`);
    alertStaff(ctx, org.id, 'staff_job_sheet', { count: String(jobs.length), jobs: lines.join('\n') }, { title: `☀️ Today’s jobs (${jobs.length})`, link: '#/bookings/today' });
    for (const staffId of new Set(jobs.map((j) => j.staff_id).filter(Boolean))) {
      const mine = jobs.filter((j) => j.staff_id === staffId);
      notifyUsers(db, org.id, [staffId], { title: `☀️ Your jobs today (${mine.length})`, body: mine.map((j) => `${formatClock(j.starts_at, tz)} ${j.service_name}`).join(' · '), link: '#/bookings/today' });
    }
    engine.logSystemRun(org.id, 'Morning job sheet', 'schedule.daily', `Sent today’s ${jobs.length} job${jobs.length === 1 ? '' : 's'} to the team`, 10);
    summary.jobSheets++;
  }
  return summary;
}

/** A day's bookings, in time order, with what the team needs on the doorstep. */
export function jobSheet(db, org, date) {
  const tz = org.timezone || 'Europe/London';
  const start = zonedToUtc(date, '00:00', tz);
  const end = zonedToUtc(addLocalDays(date, 1), '00:00', tz);
  return db.all(`SELECT b.*, s.name AS service_name, s.kind AS service_kind, c.first_name, c.last_name, c.phone_e164 AS contact_phone, c.email AS contact_email, u.name AS staff_name
      FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN contacts c ON c.id = b.contact_id LEFT JOIN users u ON u.id = b.staff_id
      WHERE b.org_id = ? AND b.starts_at >= ? AND b.starts_at < ? AND b.status != 'cancelled' ORDER BY b.starts_at`, org.id, start, end)
    .map((b) => ({ ...b, contact_name: [b.first_name, b.last_name].filter(Boolean).join(' '), phone_display: displayPhoneSafe(b.contact_phone) }));
}

const displayPhoneSafe = (e164) => (e164 && e164.startsWith('+44') && e164.length === 13 ? `0${e164.slice(3, 7)} ${e164.slice(7)}` : e164 || '');

// ───────────────────────── Calendar feed (Google, Outlook, Apple) ─────────────────────────

const icsEscape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Lines longer than 75 bytes are folded, as the calendar format requires. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (size + len > (parts.length ? 74 : 75)) { parts.push(current); current = ''; size = 0; }
    current += ch;
    size += len;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * The business's bookings as a calendar subscription. Paste the link into
 * Google Calendar ("From URL"), Outlook ("Subscribe from web") or Apple
 * Calendar and every booking appears on the team's phones.
 */
export function icsFeed(db, org) {
  const rows = db.all(`SELECT b.*, s.name AS service_name, c.first_name, c.last_name, c.phone_e164 AS contact_phone, u.name AS staff_name
      FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN contacts c ON c.id = b.contact_id LEFT JOIN users u ON u.id = b.staff_id
      WHERE b.org_id = ? AND b.starts_at >= ? AND b.starts_at <= ? ORDER BY b.starts_at`, org.id, new Date(Date.now() - 30 * 86400_000).toISOString(), new Date(Date.now() + 180 * 86400_000).toISOString());
  const stamp = icsDate(now());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CM Automations//Bookings//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(`${org.name} bookings`)}`, 'X-PUBLISHED-TTL:PT15M', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M'];
  for (const b of rows) {
    const name = [b.first_name, b.last_name].filter(Boolean).join(' ') || 'Customer';
    const description = [
      `Customer: ${name}${b.contact_phone ? ` – ${displayPhoneSafe(b.contact_phone)}` : ''}`,
      b.staff_name ? `Assigned to: ${b.staff_name}` : null,
      b.notes ? `Notes: ${b.notes}` : null,
      `Status: ${b.status.replace('_', ' ')}${b.customer_confirmed_at ? ' (customer confirmed)' : ''}`,
      b.price_pence ? `Price: ${formatMoney(b.price_pence)}` : null,
    ].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${b.id}@cmautomations`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(b.starts_at)}`, `DTEND:${icsDate(b.ends_at)}`,
      `SUMMARY:${icsEscape(`${b.urgency === 'emergency' ? '🚨 ' : ''}${b.service_name || 'Booking'} – ${name}`)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      ...(b.address || b.postcode ? [`LOCATION:${icsEscape([b.address, b.postcode].filter(Boolean).join(', '))}`] : []),
      `STATUS:${b.status === 'cancelled' ? 'CANCELLED' : b.status === 'requested' ? 'TENTATIVE' : 'CONFIRMED'}`,
      `LAST-MODIFIED:${icsDate(b.updated_at)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

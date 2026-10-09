import { Router } from 'express';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { publicLink } from '../../lib/links.js';
import { formatMoney } from '../../lib/money.js';
import { setSetting } from '../../lib/settings.js';
import { addLocalDays, localDate, zonedToUtc } from '../../lib/time.js';
import { badRequest, id, notFound, now, pick } from '../../lib/util.js';
import { invoiceFrom } from '../billing/service.js';
import {
  ACTIVE, availableDays, calendarFeedUrl, createBooking, getBooking, getBookingSettings, jobSheet, listServices,
  setBookingStatus, slotsFor, updateBooking,
} from './service.js';
import { bookingVars, queueMessage, deliverMessage } from '../messaging/service.js';

const serviceSchema = {
  name: { required: true, max: 120 }, description: { max: 1000 }, kind: { enum: ['appointment', 'callout', 'quote_visit', 'job'] },
  duration_min: { type: 'number' }, buffer_min: { type: 'number' }, price_pence: { type: 'number' }, deposit_pence: { type: 'number' },
  online: { type: 'boolean' }, active: { type: 'boolean' }, position: { type: 'number' },
};

const bookingSchema = {
  service_id: { required: true }, starts_at: { required: true }, contact_id: {}, contact: { type: 'object' }, staff_id: {},
  address: { max: 300 }, postcode: { max: 12 }, notes: { max: 2000 }, urgency: { enum: ['normal', 'emergency'] },
  source: { enum: ['phone', 'whatsapp', 'manual'] }, price_pence: { type: 'number' }, notify: { type: 'boolean' },
};

function checkService(body) {
  if (body.duration_min != null && (body.duration_min < 5 || body.duration_min > 24 * 60)) throw badRequest('Duration must be between 5 minutes and 24 hours');
  if (body.price_pence != null && body.price_pence < 0) throw badRequest('Price can’t be negative');
  if (body.deposit_pence != null && body.deposit_pence < 0) throw badRequest('Deposit can’t be negative');
  if (body.deposit_pence && body.price_pence != null && body.deposit_pence > body.price_pence && body.price_pence > 0) throw badRequest('Deposit can’t be more than the price');
}

export function bookingRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));

  const assertStaff = (orgId, staffId) => {
    if (staffId && !db.get('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?', orgId, staffId)) throw badRequest('That person isn’t in your team');
  };

  /** Bookings between two dates (calendar), plus the headline numbers. */
  r.get('/', (req, res) => {
    const tz = req.org.timezone;
    const from = req.query.from || localDate(new Date(), tz);
    const to = req.query.to || addLocalDays(from, 7);
    const rows = db.all(`SELECT b.*, s.name AS service_name, s.kind AS service_kind, c.first_name, c.last_name, c.phone_e164 AS contact_phone, u.name AS staff_name
      FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN contacts c ON c.id = b.contact_id LEFT JOIN users u ON u.id = b.staff_id
      WHERE b.org_id = ? AND b.starts_at >= ? AND b.starts_at < ? ${req.query.status ? 'AND b.status = ?' : ''} ORDER BY b.starts_at`,
    ...[req.org.id, zonedToUtc(from, '00:00', tz), zonedToUtc(to, '00:00', tz), ...(req.query.status ? [req.query.status] : [])]);
    res.json(rows.map((b) => ({ ...b, contact_name: [b.first_name, b.last_name].filter(Boolean).join(' '), local_date: localDate(b.starts_at, tz) })));
  });

  r.get('/overview', (req, res) => {
    const o = req.org.id;
    const tz = req.org.timezone;
    const today = localDate(new Date(), tz);
    const settings = getBookingSettings(db, req.org);
    const week = new Date(Date.now() + 7 * 86400_000).toISOString();
    const last30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const done30 = db.get(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND starts_at >= ? AND starts_at < ? AND status IN ('completed','no_show')`, o, last30, now()).n;
    const noShow30 = db.get(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND starts_at >= ? AND starts_at < ? AND status = 'no_show'`, o, last30, now()).n;
    res.json({
      today: jobSheet(db, req.org, today),
      counts: {
        today: db.get(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND starts_at >= ? AND starts_at < ? AND status != 'cancelled'`, o, zonedToUtc(today, '00:00', tz), zonedToUtc(addLocalDays(today, 1), '00:00', tz)).n,
        next_7_days: db.get(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND starts_at >= ? AND starts_at < ? AND status IN ('requested','confirmed')`, o, now(), week).n,
        unconfirmed: db.get(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND starts_at >= ? AND starts_at < ? AND status = 'confirmed' AND customer_confirmed_at IS NULL`, o, now(), week).n,
        requested: db.get(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND status = 'requested' AND starts_at >= ?`, o, now()).n,
        reschedule: db.get(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND reschedule_requested = 1 AND status IN ('requested','confirmed') AND starts_at >= ?`, o, now()).n,
        no_show_rate: done30 ? Math.round((noShow30 / done30) * 100) : 0,
        online_30d: db.get(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND source = 'online' AND created_at >= ?`, o, last30).n,
      },
      booking_link: publicLink(`book/${req.org.slug}`),
      calendar_feed: calendarFeedUrl(req.org, settings),
      enabled: settings.enabled,
    });
  });

  r.get('/today', (req, res) => {
    const date = req.query.date || localDate(new Date(), req.org.timezone);
    res.json({ date, jobs: jobSheet(db, req.org, date) });
  });

  // ── Services ──
  r.get('/services', (req, res) => {
    res.json(db.all('SELECT * FROM services WHERE org_id = ? ORDER BY active DESC, position, name', req.org.id).map((s) => ({ ...s, price: formatMoney(s.price_pence), deposit: s.deposit_pence ? formatMoney(s.deposit_pence) : null })));
  });
  r.post('/services', requireRole('owner', 'admin'), (req, res) => {
    const body = pick(req.body, serviceSchema);
    checkService(body);
    const position = db.get('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM services WHERE org_id = ?', req.org.id).p;
    const service = {
      id: id('svc'), org_id: req.org.id, name: body.name, description: body.description || null, kind: body.kind || 'appointment',
      duration_min: Math.round(body.duration_min || 60), buffer_min: Math.round(body.buffer_min || 0), price_pence: Math.round(body.price_pence || 0),
      deposit_pence: Math.round(body.deposit_pence || 0), online: body.online === false ? 0 : 1, active: 1, position: body.position ?? position, created_at: now(),
    };
    db.insert('services', service);
    res.status(201).json(service);
  });
  r.patch('/services/:id', requireRole('owner', 'admin'), (req, res) => {
    if (!db.get('SELECT 1 FROM services WHERE id = ? AND org_id = ?', req.params.id, req.org.id)) throw notFound('Service');
    const patch = pick(req.body, serviceSchema, { partial: true });
    checkService(patch);
    for (const k of ['name']) if (patch[k] === null) delete patch[k];
    for (const k of ['duration_min', 'buffer_min', 'price_pence', 'deposit_pence']) if (patch[k] != null) patch[k] = Math.round(patch[k]);
    db.update('services', req.params.id, patch);
    res.json(db.get('SELECT * FROM services WHERE id = ?', req.params.id));
  });
  r.delete('/services/:id', requireRole('owner', 'admin'), (req, res) => {
    if (!db.get('SELECT 1 FROM services WHERE id = ? AND org_id = ?', req.params.id, req.org.id)) throw notFound('Service');
    // Keep past bookings intact: services with bookings are archived, not deleted.
    if (db.get('SELECT 1 FROM bookings WHERE service_id = ? LIMIT 1', req.params.id)) db.update('services', req.params.id, { active: 0, online: 0 });
    else db.run('DELETE FROM services WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });

  // ── Availability ──
  r.get('/slots', (req, res) => {
    const service = db.get('SELECT * FROM services WHERE id = ? AND org_id = ?', req.query.service, req.org.id);
    if (!service) throw badRequest('Choose a service');
    const settings = getBookingSettings(db, req.org);
    // The team can book inside the notice period, unlike customers online.
    const staffSettings = { ...settings, min_notice_hours: 0 };
    if (req.query.date) return res.json(slotsFor(db, req.org, service, req.query.date, staffSettings, { excludeId: req.query.exclude || null }));
    res.json(availableDays(db, req.org, service, staffSettings));
  });

  // ── Settings: hours, reminders, booking page ──
  r.get('/settings', (req, res) => {
    const settings = getBookingSettings(db, req.org);
    res.json({ settings: { ...settings, calendar_token: undefined }, booking_link: publicLink(`book/${req.org.slug}`), calendar_feed: calendarFeedUrl(req.org, settings) });
  });
  r.put('/settings', requireRole('owner', 'admin'), (req, res) => {
    const current = getBookingSettings(db, req.org);
    const body = pick(req.body, {
      enabled: { type: 'boolean' }, intro: { max: 500 }, hours: { type: 'object' }, slot_step_min: { type: 'number' }, min_notice_hours: { type: 'number' },
      max_days_ahead: { type: 'number' }, capacity: { type: 'number' }, auto_confirm: { type: 'boolean' }, require_address: { type: 'boolean' },
      reminder_24h: { type: 'boolean' }, reminder_time: {}, reminder_2h: { type: 'boolean' }, review_request: { type: 'boolean' }, review_delay_hours: { type: 'number' },
      job_sheet: { type: 'boolean' }, job_sheet_time: {}, emergency_callouts: { type: 'boolean' }, emergency_note: { max: 500 }, cancel_notice_hours: { type: 'number' },
      chat_booking: { type: 'boolean' },
    }, { partial: true });
    const time = /^\d{2}:\d{2}$/;
    if (body.hours) {
      for (const [dayKey, h] of Object.entries(body.hours)) {
        if (!['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(dayKey)) throw badRequest(`Unknown day ${dayKey}`);
        if (h.open && (!time.test(h.start) || !time.test(h.end) || h.start >= h.end)) throw badRequest(`Check the opening hours for ${dayKey}`);
      }
      body.hours = { ...current.hours, ...body.hours };
    }
    for (const k of ['reminder_time', 'job_sheet_time']) if (body[k] != null && !time.test(body[k])) throw badRequest(`${k.replace(/_/g, ' ')} must be a time like 07:00`);
    if (body.slot_step_min != null && ![10, 15, 20, 30, 45, 60, 90, 120].includes(body.slot_step_min)) throw badRequest('Slot steps can be 10, 15, 20, 30, 45, 60, 90 or 120 minutes');
    if (body.capacity != null) body.capacity = Math.min(50, Math.max(1, Math.round(body.capacity)));
    if (body.max_days_ahead != null) body.max_days_ahead = Math.min(365, Math.max(1, Math.round(body.max_days_ahead)));
    if (body.min_notice_hours != null) body.min_notice_hours = Math.min(336, Math.max(0, body.min_notice_hours));
    for (const [k, v] of Object.entries(body)) if (v === null) delete body[k];
    const next = setSetting(db, req.org.id, 'bookings', { ...current, ...body });
    res.json({ ...next, calendar_token: undefined });
  });
  r.post('/settings/new-calendar-link', requireRole('owner', 'admin'), (req, res) => {
    const current = getBookingSettings(db, req.org);
    const next = setSetting(db, req.org.id, 'bookings', { ...current, calendar_token: '' });
    res.json({ calendar_feed: calendarFeedUrl(req.org, getBookingSettings(db, { ...req.org })), ok: Boolean(next) });
  });

  // ── Time off (holidays, training days) ──
  r.get('/time-off', (req, res) => {
    res.json(db.all('SELECT t.*, u.name AS staff_name FROM time_off t LEFT JOIN users u ON u.id = t.staff_id WHERE t.org_id = ? AND t.ends_at >= ? ORDER BY t.starts_at', req.org.id, now()));
  });
  r.post('/time-off', (req, res) => {
    const body = pick(req.body, { staff_id: {}, starts_at: { required: true }, ends_at: { required: true }, reason: { max: 200 } });
    assertStaff(req.org.id, body.staff_id);
    const start = new Date(body.starts_at);
    const end = new Date(body.ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw badRequest('Check the dates');
    const row = { id: id('off'), org_id: req.org.id, staff_id: body.staff_id || null, starts_at: start.toISOString(), ends_at: end.toISOString(), reason: body.reason || null };
    db.insert('time_off', row);
    res.status(201).json(row);
  });
  r.delete('/time-off/:id', (req, res) => {
    db.run('DELETE FROM time_off WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    res.json({ ok: true });
  });

  // ── Bookings ──
  r.post('/', async (req, res) => {
    const body = pick(req.body, bookingSchema);
    assertStaff(req.org.id, body.staff_id);
    const result = await createBooking(ctx, req.org.id, body, { actorId: req.user.id, source: body.source || 'phone' });
    res.status(201).json(result);
  });

  r.get('/:id', (req, res) => {
    const booking = getBooking(db, req.org.id, req.params.id);
    booking.messages = db.all(`SELECT * FROM messages WHERE related_type = 'booking' AND related_id = ? ORDER BY created_at`, booking.id);
    booking.invoices = db.all('SELECT id, number, kind, purpose, status, total_pence, paid_pence FROM invoices WHERE booking_id = ? ORDER BY created_at', booking.id);
    res.json(booking);
  });

  r.patch('/:id', async (req, res) => {
    const patch = pick(req.body, { starts_at: {}, staff_id: {}, address: { max: 300 }, postcode: { max: 12 }, notes: { max: 2000 }, urgency: { enum: ['normal', 'emergency'] }, service_id: {}, price_pence: { type: 'number' }, notify: { type: 'boolean' } }, { partial: true });
    assertStaff(req.org.id, patch.staff_id);
    if (patch.starts_at && Number.isNaN(new Date(patch.starts_at).getTime())) throw badRequest('Check the date and time');
    res.json(await updateBooking(ctx, req.org.id, req.params.id, patch, { actorId: req.user.id }));
  });

  /** on_the_way | completed | no_show | cancelled | confirmed */
  r.post('/:id/status', async (req, res) => {
    const body = pick(req.body, { status: { required: true, enum: ['confirmed', 'on_the_way', 'completed', 'no_show', 'cancelled'] }, eta_minutes: { type: 'number' }, reason: { max: 300 }, notify: { type: 'boolean' }, create_invoice: { type: 'boolean' } });
    res.json(await setBookingStatus(ctx, req.org.id, req.params.id, body.status, { actorId: req.user.id, etaMinutes: body.eta_minutes, reason: body.reason || '', notify: body.notify !== false, createInvoice: Boolean(body.create_invoice) }));
  });

  /** Sends a reminder now (e.g. for a booking made on the phone for later today). */
  r.post('/:id/remind', async (req, res) => {
    const booking = getBooking(db, req.org.id, req.params.id);
    if (!ACTIVE.includes(booking.status)) throw badRequest(`This booking is ${booking.status.replace('_', ' ')}`);
    const service = db.get('SELECT * FROM services WHERE id = ?', booking.service_id);
    const queued = queueMessage(ctx, req.org.id, { contactId: booking.contact_id, template: 'booking_reminder_24h', vars: bookingVars(booking, service, req.org.timezone), related: { type: 'booking', id: booking.id }, actorId: req.user.id, force: true });
    if (!queued.message) throw badRequest(queued.skipped);
    const message = await deliverMessage(ctx, queued.message, queued.settings, queued.extra, queued.creds);
    if (message.status === 'blocked') throw badRequest(message.error);
    res.json(message);
  });

  r.post('/:id/invoice', (req, res) => {
    const booking = getBooking(db, req.org.id, req.params.id);
    res.status(201).json(invoiceFrom(ctx, req.org.id, { booking }, { actorId: req.user.id }));
  });

  return r;
}

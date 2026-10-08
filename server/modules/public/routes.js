import { Router } from 'express';
import { config } from '../../config.js';
import { formatMoney } from '../../lib/money.js';
import { displayPhone } from '../../lib/phone.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { formatClock, formatDay } from '../../lib/time.js';
import { HttpError, badRequest, notFound, pick } from '../../lib/util.js';
import { parseBrand, getAudit, acceptProposal } from '../agency/service.js';
import { acceptQuote, declineQuote, getBillingSettings, getDocument, recordPayment, startCardPayment } from '../billing/service.js';
import { ACTIVE, availableDays, createBooking, customerAction, getBooking, getBookingSettings, icsFeed, listServices, slotsFor } from '../bookings/service.js';
import { getForm, submitForm } from '../forms/service.js';
import { businessName, getMessagingSettings } from '../messaging/service.js';
import { parseJson } from '../../db/index.js';

/**
 * Pages customers open without signing in: the booking page, their booking,
 * lead forms, quotes and invoices, agency proposals and monthly reports.
 * Everything is looked up by an unguessable link, never by a guessable id.
 */

const limited = (req, bucket, max = 8) => {
  if (!rateLimit(`${bucket}:${req.ip || 'local'}`, { max, windowMs: 60_000 })) throw new HttpError(429, 'Too many attempts – please wait a minute and try again');
};

/** Name, logo, colour and contact details of a business, for its public pages. */
function businessCard(db, org) {
  const brand = parseBrand(org);
  const messaging = getMessagingSettings(db, org.id);
  const agency = org.agency_id ? db.get('SELECT name, brand FROM organizations WHERE id = ?', org.agency_id) : null;
  const wa = messaging.whatsapp_number || messaging.business_number;
  return {
    name: businessName(org), logo: brand.logo || null, color: brand.color || null,
    phone: messaging.business_number ? displayPhone(messaging.business_number) : null,
    phone_link: messaging.business_number ? `tel:${messaging.business_number}` : null,
    whatsapp_link: wa && messaging.whatsapp_enabled ? `https://wa.me/${wa.replace('+', '')}` : null,
    powered_by: brand.hide_powered_by ? null : agency ? parseBrand(agency).display_name || agency.name : 'CM Automations',
  };
}

const orgBySlug = (db, slug) => {
  const org = db.get('SELECT * FROM organizations WHERE slug = ?', slug);
  if (!org) throw notFound('Business');
  return org;
};

function publicBooking(db, booking, org) {
  const tz = org.timezone;
  const settings = getBookingSettings(db, org);
  const hoursAway = (new Date(booking.starts_at).getTime() - Date.now()) / 3600_000;
  return {
    service: booking.service_name, service_id: booking.service_id, starts_at: booking.starts_at, ends_at: booking.ends_at,
    date: formatDay(booking.starts_at, tz), time: formatClock(booking.starts_at, tz), status: booking.status,
    address: [booking.address, booking.postcode].filter(Boolean).join(', '), name: booking.first_name,
    confirmed_by_customer: Boolean(booking.customer_confirmed_at), staff: booking.staff_name ? booking.staff_name.split(' ')[0] : null,
    can_change: ACTIVE.includes(booking.status) && hoursAway >= settings.cancel_notice_hours, cancel_notice_hours: settings.cancel_notice_hours,
    deposit_pence: booking.deposit_pence,
    deposit_link: booking.deposit_pence ? (() => { const d = db.get(`SELECT public_token, status FROM invoices WHERE booking_id = ? AND purpose = 'deposit' ORDER BY created_at DESC LIMIT 1`, booking.id); return d && d.status !== 'paid' && d.status !== 'void' ? d.public_token : null; })() : null,
    business: businessCard(db, org),
  };
}

export function publicRoutes(ctx) {
  const { db } = ctx;
  const r = Router();

  // ── Booking page ──
  r.get('/book/:slug', (req, res) => {
    const org = orgBySlug(db, req.params.slug);
    const settings = getBookingSettings(db, org);
    if (!settings.enabled) throw new HttpError(404, 'Online booking is switched off for this business');
    res.json({
      business: businessCard(db, org),
      intro: settings.intro, emergency_note: settings.emergency_callouts ? settings.emergency_note : '', require_address: settings.require_address,
      services: listServices(db, org.id, { onlineOnly: true }).map((s) => ({ id: s.id, name: s.name, description: s.description, kind: s.kind, duration_min: s.duration_min, price_pence: s.price_pence, deposit_pence: s.deposit_pence, price: s.price_pence ? formatMoney(s.price_pence) : null, deposit: s.deposit_pence ? formatMoney(s.deposit_pence) : null })),
    });
  });

  const onlineService = (org, serviceId) => {
    const s = db.get('SELECT * FROM services WHERE id = ? AND org_id = ? AND active = 1 AND online = 1', serviceId, org.id);
    if (!s) throw badRequest('Choose a service');
    return s;
  };

  r.get('/book/:slug/days', (req, res) => {
    const org = orgBySlug(db, req.params.slug);
    res.json(availableDays(db, org, onlineService(org, req.query.service), getBookingSettings(db, org), { days: Math.min(31, Number(req.query.days) || 14) }));
  });

  r.get('/book/:slug/slots', (req, res) => {
    const org = orgBySlug(db, req.params.slug);
    res.json(slotsFor(db, org, onlineService(org, req.query.service), String(req.query.date || ''), getBookingSettings(db, org)));
  });

  r.post('/book/:slug', async (req, res) => {
    const org = orgBySlug(db, req.params.slug);
    const settings = getBookingSettings(db, org);
    if (!settings.enabled) throw badRequest('Online booking is switched off');
    if (req.body?.website) return res.status(201).json({ ok: true }); // honeypot: bots fill in hidden fields
    limited(req, 'book', 6);
    const body = pick(req.body, {
      service_id: { required: true }, starts_at: { required: true }, first_name: { required: true, max: 80 }, last_name: { max: 80 },
      phone: { max: 40 }, email: { max: 200 }, address: { max: 300 }, postcode: { max: 12 }, notes: { max: 1000 },
      whatsapp_opt_in: { type: 'boolean' }, preferred_channel: { enum: ['auto', 'whatsapp', 'sms', 'email'] },
    });
    onlineService(org, body.service_id);
    const { booking, depositInvoice } = await createBooking(ctx, org.id, {
      service_id: body.service_id, starts_at: body.starts_at, address: body.address, postcode: body.postcode, notes: body.notes,
      contact: { first_name: body.first_name, last_name: body.last_name, phone: body.phone, email: body.email, whatsapp_opt_in: body.whatsapp_opt_in, preferred_channel: body.preferred_channel || 'auto' },
    }, { source: 'online' });
    res.status(201).json({ token: booking.public_token, status: booking.status, deposit_token: depositInvoice?.public_token || null, booking: publicBooking(db, getBooking(db, org.id, booking.id), org) });
  });

  // ── The customer's own booking ──
  const bookingByToken = (token) => {
    const row = db.get('SELECT id, org_id FROM bookings WHERE public_token = ?', token);
    if (!row) throw notFound('Booking');
    return { booking: getBooking(db, row.org_id, row.id), org: db.get('SELECT * FROM organizations WHERE id = ?', row.org_id) };
  };
  r.get('/booking/:token', (req, res) => {
    const { booking, org } = bookingByToken(req.params.token);
    res.json(publicBooking(db, booking, org));
  });
  r.get('/booking/:token/slots', (req, res) => {
    const { booking, org } = bookingByToken(req.params.token);
    const service = db.get('SELECT * FROM services WHERE id = ?', booking.service_id);
    const settings = getBookingSettings(db, org);
    if (req.query.date) return res.json(slotsFor(db, org, service, String(req.query.date), settings, { excludeId: booking.id }));
    res.json(availableDays(db, org, service, settings));
  });
  r.post('/booking/:token/:action', async (req, res) => {
    if (!['confirm', 'cancel', 'reschedule'].includes(req.params.action)) throw notFound('Action');
    limited(req, 'booking-action', 10);
    const { booking, org } = bookingByToken(req.params.token);
    const updated = await customerAction(ctx, booking, req.params.action, { starts_at: req.body?.starts_at, reason: req.body?.reason });
    res.json(publicBooking(db, updated, org));
  });

  // ── Lead forms ──
  r.get('/form/:id', (req, res) => {
    const form = getForm(db, req.params.id);
    if (!form.active) throw notFound('Form');
    const org = db.get('SELECT * FROM organizations WHERE id = ?', form.org_id);
    res.json({ id: form.id, title: form.title, intro: form.intro, fields: form.fields, button_label: form.button_label, business: businessCard(db, org) });
  });
  r.post('/form/:id', async (req, res) => {
    const form = getForm(db, req.params.id);
    if (req.body?.website) return res.status(201).json({ message: form.thank_you });
    limited(req, 'form', 6);
    res.status(201).json(await submitForm(ctx, form, req.body || {}));
  });

  // ── Quotes & invoices ──
  const docByToken = (token) => {
    const row = db.get('SELECT id, org_id FROM invoices WHERE public_token = ?', token);
    if (!row) throw notFound('Document');
    return { doc: getDocument(db, row.org_id, row.id), org: db.get('SELECT * FROM organizations WHERE id = ?', row.org_id) };
  };
  r.get('/doc/:token', (req, res) => {
    const { doc, org } = docByToken(req.params.token);
    if (doc.status === 'draft') throw notFound('Document');
    const billing = getBillingSettings(db, org.id);
    res.json({
      kind: doc.kind, purpose: doc.purpose, number: doc.number, title: doc.title, status: doc.status, issue_date: doc.issue_date, due_date: doc.due_date,
      line_items: doc.line_items, subtotal_pence: doc.subtotal_pence, vat_pence: doc.vat_pence, total_pence: doc.total_pence, paid_pence: doc.paid_pence, balance_pence: doc.balance_pence,
      notes: doc.notes, accepted_at: doc.accepted_at, accepted_by: doc.accepted_by, paid_at: doc.paid_at,
      customer: { name: [doc.first_name, doc.last_name].filter(Boolean).join(' '), company: doc.company },
      seller: { address: billing.address, vat_number: billing.vat_registered ? billing.vat_number : '', company_number: billing.company_number, footer: billing.footer },
      bank: billing.account_number ? { bank_name: billing.bank_name, account_name: billing.account_name || org.name, sort_code: billing.sort_code, account_number: billing.account_number, reference: doc.number } : null,
      card: doc.kind === 'invoice' && billing.card_payments && doc.balance_pence > 0 && !['void', 'paid'].includes(doc.status),
      business: businessCard(db, org),
    });
  });
  r.post('/doc/:token/accept', (req, res) => {
    limited(req, 'doc', 10);
    const { doc, org } = docByToken(req.params.token);
    const body = pick(req.body, { name: { required: true, max: 120 } });
    const result = acceptQuote(ctx, org.id, doc.id, { name: body.name });
    res.json({ status: result.doc.status });
  });
  r.post('/doc/:token/decline', (req, res) => {
    limited(req, 'doc', 10);
    const { doc, org } = docByToken(req.params.token);
    const result = declineQuote(ctx, org.id, doc.id, { reason: String(req.body?.reason || '').slice(0, 500) });
    res.json({ status: result.doc.status });
  });
  r.post('/doc/:token/pay', async (req, res) => {
    limited(req, 'pay', 10);
    const { doc } = docByToken(req.params.token);
    if (doc.kind !== 'invoice' || doc.balance_pence <= 0 || ['void', 'draft'].includes(doc.status)) throw badRequest('There’s nothing to pay on this one');
    const returnUrl = String(req.body?.return_url || doc.link);
    res.json(await startCardPayment(ctx, doc, /^https?:\/\//.test(returnUrl) ? returnUrl : doc.link));
  });
  /** Test builds only: completes a pretend card payment so the whole flow can be tried. */
  r.post('/doc/:token/demo-pay', async (req, res) => {
    if (!config.demoMode) throw notFound('Route');
    const { doc, org } = docByToken(req.params.token);
    const result = await recordPayment(ctx, org.id, doc.id, { amount_pence: doc.balance_pence, method: 'card', provider_id: `demo_${doc.id}_${doc.paid_pence}`, reference: 'Test card payment' });
    res.json({ status: result.doc.status });
  });

  // ── Agency proposals ──
  const auditByToken = (token) => {
    const row = db.get('SELECT id, org_id FROM audits WHERE public_token = ?', token);
    if (!row) throw notFound('Proposal');
    return getAudit(db, row.org_id, row.id);
  };
  r.get('/proposal/:token', (req, res) => {
    const audit = auditByToken(req.params.token);
    if (!audit.proposal?.title) throw notFound('Proposal');
    const agency = db.get('SELECT * FROM organizations WHERE id = ?', audit.org_id);
    res.json({ client_name: audit.client_name, contact_name: audit.contact_name, status: audit.status, accepted_at: audit.accepted_at, proposal: audit.proposal, business: businessCard(db, agency) });
  });
  r.post('/proposal/:token/accept', (req, res) => {
    limited(req, 'proposal', 10);
    const audit = auditByToken(req.params.token);
    const body = pick(req.body, { name: { required: true, max: 120 } });
    const result = acceptProposal(ctx, audit, { name: body.name });
    res.json({ status: result.audit.status });
  });
  r.post('/proposal/:token/decline', (req, res) => {
    limited(req, 'proposal', 10);
    const audit = auditByToken(req.params.token);
    if (audit.status === 'accepted') throw badRequest('This proposal has already been accepted');
    db.update('audits', audit.id, { status: 'declined', declined_at: new Date().toISOString(), decline_reason: String(req.body?.reason || '').slice(0, 500) || null });
    res.json({ status: 'declined' });
  });

  // ── Monthly reports ──
  r.get('/report/:token', (req, res) => {
    const row = parseJson(db.get('SELECT * FROM reports WHERE public_token = ?', req.params.token), 'data');
    if (!row) throw notFound('Report');
    const org = db.get('SELECT * FROM organizations WHERE id = ?', row.org_id);
    const agency = row.agency_id ? db.get('SELECT * FROM organizations WHERE id = ?', row.agency_id) : null;
    res.json({ period: row.period, summary: row.summary, data: row.data, business: businessCard(db, org), agency: agency ? businessCard(db, agency) : null });
  });

  // ── Calendar subscription (Google, Outlook, Apple) ──
  r.get('/calendar/:slug/:file', (req, res) => {
    const org = orgBySlug(db, req.params.slug);
    const settings = getBookingSettings(db, org);
    const token = String(req.params.file).replace(/\.ics$/, '');
    if (!settings.calendar_token || token !== settings.calendar_token) throw notFound('Calendar');
    res.type('text/calendar; charset=utf-8').send(icsFeed(db, org));
  });

  return r;
}

import { config } from '../../config.js';
import { parseJson } from '../../db/index.js';
import { publicLink } from '../../lib/links.js';
import { formatMoney } from '../../lib/money.js';
import { getSetting } from '../../lib/settings.js';
import { formatDay, localDate } from '../../lib/time.js';
import { addDays, badRequest, id, notFound, now, publicToken } from '../../lib/util.js';
import { notifyUsers } from '../core/notifications.js';
import { getContactRow, logActivity, moveDealStage } from '../crm/service.js';
import { alertStaff, businessName, queueMessage, deliverMessage } from '../messaging/service.js';
import { createTask } from '../tasks/service.js';
import { createCheckoutSession, retrieveCheckoutSession, stripeReady } from './stripe.js';
import { getCredentials } from '../integrations/service.js';

/**
 * Quotes, invoices and payments. Money is held in pence. A won deal or a
 * finished job becomes a quote or invoice; customers view, accept and pay
 * online; unpaid invoices are chased automatically (polite → firmer → a task
 * for a person to call).
 */

export const BILLING_DEFAULTS = {
  vat_registered: false,
  vat_rate: 20,
  vat_number: '',
  company_number: '',
  address: '',
  payment_terms_days: 14,
  quote_valid_days: 30,
  invoice_prefix: 'INV-',
  quote_prefix: 'Q-',
  bank_name: '',
  account_name: '',
  sort_code: '',
  account_number: '',
  footer: 'Thank you for your business.',
  card_payments: true,
  chase_enabled: true,
  // Days after the due date: friendly reminder, firmer reminder, then a task for a person.
  chase_days: [1, 7, 14],
  // Days after sending a quote with no answer before someone is asked to follow up.
  quote_follow_up_days: 3,
};

export const getBillingSettings = (db, orgId) => getSetting(db, orgId, 'billing', BILLING_DEFAULTS);

const OPEN_INVOICE = ['sent', 'part_paid', 'overdue'];

/** Next quote/invoice number for a business, e.g. INV-0042. */
function nextNumber(db, orgId, kind, settings) {
  const key = `counter:${kind}`;
  const current = Number(db.get('SELECT value FROM org_meta WHERE org_id = ? AND key = ?', orgId, key)?.value || 0) + 1;
  db.run(`INSERT INTO org_meta (org_id, key, value) VALUES (?, ?, ?) ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value`, orgId, key, String(current));
  return `${kind === 'quote' ? settings.quote_prefix : settings.invoice_prefix}${String(current).padStart(4, '0')}`;
}

/** Cleans line items and works out the totals (VAT per line when VAT registered). */
export function computeTotals(rawItems = [], settings = BILLING_DEFAULTS) {
  const items = rawItems
    .filter((i) => i && String(i.description || '').trim())
    .slice(0, 100)
    .map((i) => {
      const quantity = Math.max(0, Number(i.quantity ?? 1)) || 0;
      const unit = Math.round(Number(i.unit_pence ?? 0)) || 0;
      const rate = settings.vat_registered ? Number(i.vat_rate ?? settings.vat_rate) || 0 : 0;
      const net = Math.round(quantity * unit);
      return { description: String(i.description).trim().slice(0, 300), quantity, unit_pence: unit, vat_rate: rate, total_pence: net, vat_pence: Math.round((net * rate) / 100) };
    });
  const subtotal = items.reduce((s, i) => s + i.total_pence, 0);
  const vat = items.reduce((s, i) => s + i.vat_pence, 0);
  return { items, subtotal_pence: subtotal, vat_pence: vat, total_pence: subtotal + vat };
}

export function getDocument(db, orgId, docId) {
  const doc = parseJson(db.get(`SELECT i.*, c.first_name, c.last_name, c.email AS contact_email, c.phone_e164 AS contact_phone, c.company, d.title AS deal_title
    FROM invoices i LEFT JOIN contacts c ON c.id = i.contact_id LEFT JOIN deals d ON d.id = i.deal_id WHERE i.id = ? AND i.org_id = ?`, docId, orgId), 'line_items');
  if (!doc) throw notFound(orgId ? 'Quote or invoice' : 'Document');
  doc.payments = db.all('SELECT p.*, u.name AS recorded_by FROM payments p LEFT JOIN users u ON u.id = p.created_by WHERE p.invoice_id = ? ORDER BY p.created_at', doc.id);
  doc.balance_pence = Math.max(0, doc.total_pence - doc.paid_pence);
  doc.link = publicLink(`doc/${doc.public_token}`);
  return doc;
}

/** Creates a draft quote or invoice. */
export function createDocument(ctx, orgId, data, { actorId = null } = {}) {
  const { db } = ctx;
  const settings = getBillingSettings(db, orgId);
  const kind = data.kind === 'quote' ? 'quote' : 'invoice';
  if (data.contact_id && !db.get('SELECT 1 FROM contacts WHERE id = ? AND org_id = ?', data.contact_id, orgId)) throw badRequest('That contact isn’t in this business');
  const totals = computeTotals(data.line_items, settings);
  if (!totals.items.length) throw badRequest('Add at least one line');
  const ts = now();
  const issue = data.issue_date || ts.slice(0, 10);
  const doc = {
    id: id(kind === 'quote' ? 'quo' : 'inv'), org_id: orgId, kind, purpose: data.purpose === 'deposit' ? 'deposit' : 'standard',
    number: nextNumber(db, orgId, kind, settings), contact_id: data.contact_id || null, deal_id: data.deal_id || null, booking_id: data.booking_id || null,
    status: 'draft', title: data.title || null, issue_date: issue,
    due_date: data.due_date || addDays(`${issue}T12:00:00Z`, kind === 'quote' ? settings.quote_valid_days : data.purpose === 'deposit' ? 0 : settings.payment_terms_days).slice(0, 10),
    line_items: totals.items, subtotal_pence: totals.subtotal_pence, vat_pence: totals.vat_pence, total_pence: totals.total_pence, paid_pence: 0,
    notes: data.notes || null, public_token: publicToken(), chase: data.chase === false ? 0 : 1, from_quote_id: data.from_quote_id || null,
    created_by: actorId, created_at: ts, updated_at: ts,
  };
  db.insert('invoices', doc);
  if (doc.contact_id) logActivity(db, orgId, doc.contact_id, `${kind === 'quote' ? 'Quote' : 'Invoice'} ${doc.number} created – ${formatMoney(doc.total_pence)}`, { dealId: doc.deal_id, actorId });
  return getDocument(db, orgId, doc.id);
}

/** Edits a draft (or re-totals a sent document that hasn't been paid). */
export function updateDocument(ctx, orgId, docId, patch) {
  const { db } = ctx;
  const doc = getDocument(db, orgId, docId);
  if (!['draft', 'sent'].includes(doc.status) || doc.paid_pence > 0) throw badRequest('Only drafts and unpaid documents can be edited');
  const changes = { updated_at: now() };
  for (const key of ['title', 'notes', 'due_date', 'issue_date', 'contact_id']) if (patch[key] !== undefined) changes[key] = patch[key] || null;
  if (patch.chase !== undefined) changes.chase = patch.chase ? 1 : 0;
  if (patch.line_items) {
    const totals = computeTotals(patch.line_items, getBillingSettings(db, orgId));
    if (!totals.items.length) throw badRequest('Add at least one line');
    Object.assign(changes, { line_items: totals.items, subtotal_pence: totals.subtotal_pence, vat_pence: totals.vat_pence, total_pence: totals.total_pence });
  }
  db.update('invoices', doc.id, changes);
  return getDocument(db, orgId, doc.id);
}

/** Placeholders for quote/invoice messages. */
export function documentVars(doc, org) {
  const tz = org?.timezone || 'Europe/London';
  const daysOverdue = doc.due_date ? Math.max(0, Math.floor((Date.now() - new Date(`${doc.due_date}T23:59:59Z`).getTime()) / 86400_000) + 1) : 0;
  return {
    number: doc.number,
    amount: formatMoney(doc.kind === 'invoice' ? Math.max(0, doc.total_pence - doc.paid_pence) || doc.total_pence : doc.total_pence),
    total: formatMoney(doc.total_pence),
    due_date: doc.due_date ? formatDay(`${doc.due_date}T12:00:00Z`, tz) : 'on receipt',
    days_overdue: String(daysOverdue),
    doc_link: publicLink(`doc/${doc.public_token}`),
  };
}

/** Sends (or re-sends) a quote or invoice to the customer by their best channel. */
export async function sendDocument(ctx, orgId, docId, { actorId = null, channel = 'auto' } = {}) {
  const { db, engine } = ctx;
  const doc = getDocument(db, orgId, docId);
  if (['void', 'paid', 'converted', 'declined'].includes(doc.status)) throw badRequest(`This ${doc.kind} is ${doc.status} and can’t be sent`);
  if (!doc.contact_id) throw badRequest('Choose a customer before sending');
  const org = db.get('SELECT * FROM organizations WHERE id = ?', orgId);
  const template = doc.purpose === 'deposit' ? 'deposit_request' : doc.kind === 'quote' ? 'quote_sent' : 'invoice_sent';
  const vars = documentVars(doc, org);
  if (doc.purpose === 'deposit' && doc.booking_id) {
    const b = db.get('SELECT b.starts_at, s.name FROM bookings b LEFT JOIN services s ON s.id = b.service_id WHERE b.id = ?', doc.booking_id);
    if (b) Object.assign(vars, { service: b.name || 'booking', date: formatDay(b.starts_at, org.timezone), time: '' });
  }
  const queued = queueMessage(ctx, orgId, { contactId: doc.contact_id, channel, template, vars, actorId, related: { type: doc.kind, id: doc.id }, force: true });
  if (!queued.message) throw badRequest(queued.skipped);
  const message = await deliverMessage(ctx, queued.message, queued.settings, queued.extra, queued.creds);
  if (message.status === 'blocked') throw badRequest(message.error);
  const ts = now();
  db.update('invoices', doc.id, { status: doc.status === 'draft' ? 'sent' : doc.status, sent_at: doc.sent_at || ts, updated_at: ts });
  logActivity(db, orgId, doc.contact_id, `${doc.kind === 'quote' ? 'Quote' : 'Invoice'} ${doc.number} sent by ${message.channel === 'sms' ? 'text' : message.channel}`, { dealId: doc.deal_id, actorId });
  const sent = getDocument(db, orgId, doc.id);
  const automations = engine.emit(orgId, `${doc.kind}.sent`, { [doc.kind]: sent, invoice: sent, contact: getContactRow(db, doc.contact_id) }, { actorId });
  return { doc: sent, message, automations };
}

/** The customer accepts a quote online (or the team marks it accepted). */
export function acceptQuote(ctx, orgId, docId, { name = '', actorId = null } = {}) {
  const { db, engine } = ctx;
  const doc = getDocument(db, orgId, docId);
  if (doc.kind !== 'quote') throw badRequest('Only quotes can be accepted');
  if (doc.status === 'accepted' || doc.status === 'converted') return { doc, automations: [] };
  if (!['sent', 'draft'].includes(doc.status)) throw badRequest(`This quote is ${doc.status}`);
  const ts = now();
  db.update('invoices', doc.id, { status: 'accepted', accepted_at: ts, accepted_by: name || null, updated_at: ts });
  const accepted = getDocument(db, orgId, doc.id);
  const contact = doc.contact_id ? getContactRow(db, doc.contact_id) : null;
  const who = name || [doc.first_name, doc.last_name].filter(Boolean).join(' ') || 'The customer';
  logActivity(db, orgId, doc.contact_id, `Quote ${doc.number} accepted${name ? ` by ${name}` : ''} – ${formatMoney(doc.total_pence)}`, { dealId: doc.deal_id, actorId });
  let automations = doc.deal_id ? moveDealStage(ctx, orgId, doc.deal_id, 'won', { actorId, reason: `quote ${doc.number} accepted` }) : [];
  notifyUsers(db, orgId, adminIds(db, orgId), { title: `✅ Quote accepted: ${doc.number}`, body: `${who} accepted ${formatMoney(doc.total_pence)}. Book the work in and convert it to an invoice when ready.`, link: `#/invoices/${doc.id}` });
  automations = automations.concat(engine.emit(orgId, 'quote.accepted', { quote: accepted, invoice: accepted, contact }, { actorId }));
  return { doc: accepted, automations };
}

export function declineQuote(ctx, orgId, docId, { reason = '', actorId = null } = {}) {
  const { db, engine } = ctx;
  const doc = getDocument(db, orgId, docId);
  if (doc.kind !== 'quote' || !['sent', 'draft'].includes(doc.status)) throw badRequest('This quote can’t be declined');
  const ts = now();
  db.update('invoices', doc.id, { status: 'declined', declined_at: ts, decline_reason: reason || null, updated_at: ts });
  logActivity(db, orgId, doc.contact_id, `Quote ${doc.number} declined${reason ? `: “${reason}”` : ''}`, { dealId: doc.deal_id, actorId });
  notifyUsers(db, orgId, adminIds(db, orgId), { title: `Quote declined: ${doc.number}`, body: reason || 'No reason given.', link: `#/invoices/${doc.id}` });
  const declined = getDocument(db, orgId, doc.id);
  const automations = engine.emit(orgId, 'quote.declined', { quote: declined, invoice: declined, contact: doc.contact_id ? getContactRow(db, doc.contact_id) : null }, { actorId });
  return { doc: declined, automations };
}

/** Turns an accepted (or sent) quote into a draft invoice with the same lines. */
export function convertQuote(ctx, orgId, quoteId, { actorId = null } = {}) {
  const { db } = ctx;
  const quote = getDocument(db, orgId, quoteId);
  if (quote.kind !== 'quote') throw badRequest('Only quotes can be converted');
  if (quote.converted_invoice_id) return getDocument(db, orgId, quote.converted_invoice_id);
  if (!['accepted', 'sent', 'draft'].includes(quote.status)) throw badRequest(`This quote is ${quote.status}`);
  const invoice = createDocument(ctx, orgId, {
    kind: 'invoice', contact_id: quote.contact_id, deal_id: quote.deal_id, booking_id: quote.booking_id, title: quote.title,
    line_items: quote.line_items, notes: quote.notes, from_quote_id: quote.id,
  }, { actorId });
  db.update('invoices', quote.id, { status: 'converted', converted_invoice_id: invoice.id, accepted_at: quote.accepted_at || now(), updated_at: now() });
  return invoice;
}

export function voidDocument(ctx, orgId, docId, { actorId = null } = {}) {
  const doc = getDocument(ctx.db, orgId, docId);
  if (doc.paid_pence > 0) throw badRequest('This has payments against it – refund those first');
  ctx.db.update('invoices', doc.id, { status: 'void', updated_at: now() });
  logActivity(ctx.db, orgId, doc.contact_id, `${doc.kind === 'quote' ? 'Quote' : 'Invoice'} ${doc.number} voided`, { dealId: doc.deal_id, actorId });
  return getDocument(ctx.db, orgId, doc.id);
}

const adminIds = (db, orgId) => db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin')`, orgId).map((r) => r.user_id);

/**
 * Records money received (card, bank transfer, cash). Fully paid invoices get a
 * thank-you message, a paid deposit confirms its booking. Card payments with
 * the same provider id are only recorded once.
 */
export async function recordPayment(ctx, orgId, docId, { amount_pence, method = 'bank_transfer', reference = null, provider_id = null, actorId = null }) {
  const { db, engine } = ctx;
  const doc = getDocument(db, orgId, docId);
  if (doc.kind !== 'invoice') throw badRequest('Payments are recorded against invoices');
  if (['void', 'draft'].includes(doc.status) && method !== 'card') throw badRequest(doc.status === 'void' ? 'This invoice is void' : 'Send the invoice before recording a payment');
  if (provider_id && db.get('SELECT 1 FROM payments WHERE provider_id = ?', provider_id)) return { doc, duplicate: true, automations: [] };
  const amount = Math.round(Number(amount_pence ?? doc.balance_pence));
  if (!(amount > 0)) throw badRequest('Enter an amount');
  if (amount > doc.balance_pence) throw badRequest(`That’s more than the ${formatMoney(doc.balance_pence)} owed`);
  const ts = now();
  db.insert('payments', { id: id('pay'), org_id: orgId, invoice_id: doc.id, amount_pence: amount, method, reference, provider_id, created_by: actorId, created_at: ts });
  const paid = doc.paid_pence + amount;
  const full = paid >= doc.total_pence;
  db.update('invoices', doc.id, { paid_pence: paid, status: full ? 'paid' : 'part_paid', paid_at: full ? ts : null, updated_at: ts });
  const updated = getDocument(db, orgId, doc.id);
  const org = db.get('SELECT * FROM organizations WHERE id = ?', orgId);
  logActivity(db, orgId, doc.contact_id, `Payment of ${formatMoney(amount)} received for ${doc.number} (${method.replace('_', ' ')})${full ? ' – paid in full' : ''}`, { dealId: doc.deal_id, actorId });
  notifyUsers(db, orgId, adminIds(db, orgId), { title: `💷 ${formatMoney(amount)} received – ${doc.number}`, body: full ? 'Paid in full.' : `${formatMoney(updated.balance_pence)} still to pay.`, link: `#/invoices/${doc.id}` });
  if (method === 'card') engine.logSystemRun(orgId, 'Card payment', 'invoice.paid', `${doc.number}: ${formatMoney(amount)} paid online and matched automatically`, 5);

  let automations = [];
  if (full) {
    if (doc.contact_id) {
      const queued = queueMessage(ctx, orgId, { contactId: doc.contact_id, template: 'invoice_paid_thanks', vars: { ...documentVars(doc, org), amount: formatMoney(doc.total_pence) }, related: { type: 'invoice', id: doc.id }, force: true });
      if (queued.message) await deliverMessage(ctx, queued.message, queued.settings, queued.extra, queued.creds);
    }
    // A paid deposit confirms the booking it was for.
    if (doc.purpose === 'deposit' && doc.booking_id) {
      const { confirmBooking } = await import('../bookings/service.js');
      await confirmBooking(ctx, orgId, doc.booking_id, { reason: 'deposit paid' });
    }
    automations = engine.emit(orgId, 'invoice.paid', { invoice: updated, contact: doc.contact_id ? getContactRow(db, doc.contact_id) : null, payment: { amount_pence: amount, method } }, { actorId });
  }
  return { doc: updated, automations };
}

/** Starts an online card payment for what's still owed, into the business's own Stripe account. */
export async function startCardPayment(ctx, doc, returnUrl) {
  const settings = getBillingSettings(ctx.db, doc.org_id);
  if (!settings.card_payments) return { error: 'This business takes payment by bank transfer.' };
  const creds = getCredentials(ctx.db, doc.org_id);
  if (!stripeReady(creds)) return config.demoMode ? { demo: true } : { error: 'Card payments aren’t set up yet – please pay by bank transfer.' };
  const org = ctx.db.get('SELECT * FROM organizations WHERE id = ?', doc.org_id);
  const session = await createCheckoutSession({ secretKey: creds.stripe.secretKey, doc, orgName: businessName(org), amountPence: doc.balance_pence, returnUrl });
  if (session.id) ctx.db.update('invoices', doc.id, { checkout_session: session.id });
  return session;
}

/**
 * When the customer comes back from Stripe, check the payment with Stripe
 * directly and record it – so it shows as paid at once, even before (or
 * without) the webhook. Safe to run alongside the webhook: each payment is
 * recorded only once.
 */
export async function confirmCardPayment(ctx, doc, sessionId) {
  const creds = getCredentials(ctx.db, doc.org_id);
  if (!stripeReady(creds)) return { status: doc.status };
  const r = await retrieveCheckoutSession(creds.stripe.secretKey, sessionId);
  if (r.error) return { status: doc.status, error: r.error };
  const session = r.data;
  if (session.metadata?.invoice_id !== doc.id || session.metadata?.org_id !== doc.org_id) return { status: doc.status, error: 'That payment is for a different invoice' };
  if (session.payment_status !== 'paid') return { status: doc.status, pending: true };
  const result = await recordPayment(ctx, doc.org_id, doc.id, { amount_pence: Math.min(session.amount_total, doc.balance_pence) || doc.balance_pence, method: 'card', provider_id: session.payment_intent || session.id, reference: 'Paid online by card' })
    .catch((err) => ({ doc: getDocument(ctx.db, doc.org_id, doc.id), error: err.message }));
  return { status: result.doc.status };
}

/** Money owed, overdue and collected, for the Invoices page and agency reports. */
export function billingSummary(db, orgId) {
  const one = (sql, ...p) => db.get(sql, orgId, ...p);
  const monthStart = `${now().slice(0, 7)}-01`;
  return {
    outstanding_pence: one(`SELECT COALESCE(SUM(total_pence - paid_pence),0) AS v FROM invoices WHERE org_id = ? AND kind = 'invoice' AND status IN ('sent','part_paid','overdue')`).v,
    overdue_pence: one(`SELECT COALESCE(SUM(total_pence - paid_pence),0) AS v FROM invoices WHERE org_id = ? AND kind = 'invoice' AND status = 'overdue'`).v,
    overdue_count: one(`SELECT COUNT(*) AS n FROM invoices WHERE org_id = ? AND kind = 'invoice' AND status = 'overdue'`).n,
    paid_month_pence: one(`SELECT COALESCE(SUM(amount_pence),0) AS v FROM payments WHERE org_id = ? AND created_at >= ?`, monthStart).v,
    quotes_open_pence: one(`SELECT COALESCE(SUM(total_pence),0) AS v FROM invoices WHERE org_id = ? AND kind = 'quote' AND status = 'sent'`).v,
    quotes_open_count: one(`SELECT COUNT(*) AS n FROM invoices WHERE org_id = ? AND kind = 'quote' AND status = 'sent'`).n,
    drafts: one(`SELECT COUNT(*) AS n FROM invoices WHERE org_id = ? AND status = 'draft'`).n,
    chased_recovered_pence: one(`SELECT COALESCE(SUM(p.amount_pence),0) AS v FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.org_id = ? AND i.reminders_sent > 0 AND p.created_at >= ?`, monthStart).v,
  };
}

/** Drafts an invoice for a finished job or a won deal (used by automations and buttons). */
export function invoiceFrom(ctx, orgId, { booking = null, deal = null }, { actorId = null } = {}) {
  const { db } = ctx;
  if (booking) {
    if (booking.invoice_id) {
      const existing = db.get('SELECT id FROM invoices WHERE id = ?', booking.invoice_id);
      if (existing) return getDocument(db, orgId, existing.id);
    }
    const service = db.get('SELECT * FROM services WHERE id = ?', booking.service_id);
    const org = db.get('SELECT timezone FROM organizations WHERE id = ?', orgId);
    const lines = [{ description: `${service?.name || 'Work carried out'} – ${formatDay(booking.starts_at, org?.timezone)}${booking.address ? `, ${booking.address}` : ''}`, quantity: 1, unit_pence: booking.price_pence || service?.price_pence || 0 }];
    const depositPaid = db.get(`SELECT COALESCE(SUM(paid_pence),0) AS v FROM invoices WHERE booking_id = ? AND purpose = 'deposit'`, booking.id).v;
    if (depositPaid) lines.push({ description: 'Less deposit already paid', quantity: 1, unit_pence: -depositPaid, vat_rate: 0 });
    const invoice = createDocument(ctx, orgId, { kind: 'invoice', contact_id: booking.contact_id, booking_id: booking.id, title: service?.name || 'Job', line_items: lines }, { actorId });
    db.update('bookings', booking.id, { invoice_id: invoice.id, updated_at: now() });
    return invoice;
  }
  if (deal) {
    const existing = db.get(`SELECT id FROM invoices WHERE deal_id = ? AND kind = 'invoice' AND status != 'void'`, deal.id);
    if (existing) return getDocument(db, orgId, existing.id);
    return createDocument(ctx, orgId, { kind: 'invoice', contact_id: deal.contact_id, deal_id: deal.id, title: deal.title, line_items: [{ description: deal.title, quantity: 1, unit_pence: Math.round(Number(deal.value || 0) * 100) }] }, { actorId });
  }
  throw badRequest('Nothing to invoice');
}

/**
 * Scheduler step: marks invoices overdue and chases them on the business's
 * schedule – a friendly reminder, a firmer one, then a task for a person.
 * Also asks someone to follow up quotes that haven't been answered.
 */
export async function runBillingChase(ctx, at = new Date()) {
  const { db, engine } = ctx;
  const summary = { overdue: 0, reminders: 0, escalated: 0, quotes: 0 };
  for (const doc of db.all(`SELECT i.*, o.timezone FROM invoices i JOIN organizations o ON o.id = i.org_id WHERE i.kind = 'invoice' AND i.status IN ('sent','part_paid','overdue') AND i.due_date IS NOT NULL`)) {
    const today = localDate(at, doc.timezone || 'Europe/London');
    if (doc.due_date >= today) continue;
    const daysOverdue = Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${doc.due_date}T12:00:00Z`)) / 86400_000);
    if (doc.status !== 'overdue') {
      db.update('invoices', doc.id, { status: 'overdue', updated_at: now() });
      const full = getDocument(db, doc.org_id, doc.id);
      engine.emit(doc.org_id, 'invoice.overdue', { invoice: full, contact: doc.contact_id ? getContactRow(db, doc.contact_id) : null, days_overdue: daysOverdue });
      summary.overdue++;
    }
    const settings = getBillingSettings(db, doc.org_id);
    if (!settings.chase_enabled || !doc.chase) continue;
    const steps = (settings.chase_days || [1, 7, 14]).map(Number);
    const step = doc.reminders_sent;
    if (step >= steps.length || daysOverdue < steps[step]) continue;
    // Never chase twice in one day (e.g. after a long gap the steps would bunch up).
    if (doc.last_reminder_at && localDate(doc.last_reminder_at, doc.timezone) === today) continue;
    const full = getDocument(db, doc.org_id, doc.id);
    const org = db.get('SELECT * FROM organizations WHERE id = ?', doc.org_id);
    if (step < 2 && doc.contact_id) {
      const queued = queueMessage(ctx, doc.org_id, { contactId: doc.contact_id, template: step === 0 ? 'invoice_reminder_1' : 'invoice_reminder_2', vars: { ...documentVars(full, org), days_overdue: String(daysOverdue) }, related: { type: 'invoice', id: doc.id } });
      if (queued.message) await deliverMessage(ctx, queued.message, queued.settings, queued.extra, queued.creds);
      logActivity(db, doc.org_id, doc.contact_id, `${step === 0 ? 'Friendly' : 'Firmer'} payment reminder sent for ${doc.number} (${daysOverdue} days overdue)`);
      engine.logSystemRun(doc.org_id, 'Invoice chaser', 'invoice.overdue', `${step === 0 ? 'Friendly' : 'Firmer'} reminder for ${doc.number} (${formatMoney(full.balance_pence)})`, 8);
      summary.reminders++;
    } else {
      const name = [full.first_name, full.last_name].filter(Boolean).join(' ') || full.company || 'the customer';
      createTask(ctx, doc.org_id, {
        title: `Call ${name} about unpaid ${doc.number} (${formatMoney(full.balance_pence)})`,
        description: `${daysOverdue} days overdue. Two reminders have gone out automatically. A quick friendly call usually sorts it – then record the payment on the invoice.`,
        priority: 'urgent', due_at: now(), assignee_id: adminIds(db, doc.org_id)[0] || null, source: 'crm', source_ref: doc.contact_id,
      });
      alertStaff(ctx, doc.org_id, 'staff_overdue_invoice', { ...documentVars(full, org), name, days_overdue: String(daysOverdue) }, { title: `💷 ${doc.number} needs a call`, link: `#/invoices/${doc.id}` });
      engine.logSystemRun(doc.org_id, 'Invoice chaser', 'invoice.overdue', `${doc.number} escalated to a person after two reminders`, 3);
      summary.escalated++;
    }
    db.update('invoices', doc.id, { reminders_sent: step + 1, last_reminder_at: now() });
  }

  for (const quote of db.all(`SELECT * FROM invoices WHERE kind = 'quote' AND status = 'sent' AND followed_up = 0 AND sent_at IS NOT NULL`)) {
    const settings = getBillingSettings(db, quote.org_id);
    if (Date.now() - new Date(quote.sent_at).getTime() < settings.quote_follow_up_days * 86400_000) continue;
    const full = getDocument(db, quote.org_id, quote.id);
    const name = [full.first_name, full.last_name].filter(Boolean).join(' ') || 'the customer';
    createTask(ctx, quote.org_id, {
      title: `Follow up quote ${quote.number} with ${name}`, description: `Sent ${settings.quote_follow_up_days} days ago for ${formatMoney(quote.total_pence)} and not answered yet. Ask if they have any questions.`,
      priority: 'high', due_at: now(), assignee_id: quote.created_by || adminIds(db, quote.org_id)[0] || null, source: 'crm', source_ref: quote.contact_id,
    });
    db.update('invoices', quote.id, { followed_up: 1 });
    engine.logSystemRun(quote.org_id, 'Quote follow-up', 'quote.sent', `Follow-up task for ${quote.number}`, 3);
    summary.quotes++;
  }
  return summary;
}

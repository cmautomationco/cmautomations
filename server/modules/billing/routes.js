import { Router } from 'express';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { setSetting } from '../../lib/settings.js';
import { badRequest, notFound, pick } from '../../lib/util.js';
import {
  acceptQuote, billingSummary, convertQuote, createDocument, declineQuote, getBillingSettings, getDocument, invoiceFrom,
  recordPayment, sendDocument, startCardPayment, updateDocument, voidDocument,
} from './service.js';
import { stripeReady } from './stripe.js';

const docSchema = {
  kind: { enum: ['quote', 'invoice'] }, contact_id: {}, deal_id: {}, booking_id: {}, title: { max: 160 }, line_items: { type: 'array' },
  notes: { max: 2000 }, due_date: {}, issue_date: {}, chase: { type: 'boolean' },
};

export function billingRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));

  r.get('/', (req, res) => {
    const where = ['i.org_id = ?'];
    const params = [req.org.id];
    if (req.query.kind) { where.push('i.kind = ?'); params.push(req.query.kind); }
    if (req.query.status) { where.push('i.status = ?'); params.push(req.query.status); }
    if (req.query.contact) { where.push('i.contact_id = ?'); params.push(req.query.contact); }
    res.json(db.all(`SELECT i.id, i.kind, i.purpose, i.number, i.status, i.title, i.issue_date, i.due_date, i.total_pence, i.paid_pence, i.sent_at, i.reminders_sent, i.contact_id,
        c.first_name, c.last_name, c.company FROM invoices i LEFT JOIN contacts c ON c.id = i.contact_id WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC LIMIT 500`, ...params));
  });

  r.get('/summary', (req, res) => res.json({ ...billingSummary(db, req.org.id), card_payments_live: stripeReady() }));

  r.get('/settings', (req, res) => res.json(getBillingSettings(db, req.org.id)));
  r.put('/settings', requireRole('owner', 'admin'), (req, res) => {
    const current = getBillingSettings(db, req.org.id);
    const body = pick(req.body, {
      vat_registered: { type: 'boolean' }, vat_rate: { type: 'number' }, vat_number: { max: 30 }, company_number: { max: 30 }, address: { max: 300 },
      payment_terms_days: { type: 'number' }, quote_valid_days: { type: 'number' }, invoice_prefix: { max: 10 }, quote_prefix: { max: 10 },
      bank_name: { max: 80 }, account_name: { max: 80 }, sort_code: { max: 10 }, account_number: { max: 12 }, footer: { max: 500 },
      card_payments: { type: 'boolean' }, chase_enabled: { type: 'boolean' }, chase_days: { type: 'array' }, quote_follow_up_days: { type: 'number' },
    }, { partial: true });
    if (body.chase_days) {
      const days = body.chase_days.map(Number);
      if (days.length !== 3 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 120) || !(days[0] < days[1] && days[1] < days[2])) throw badRequest('Chasing needs three increasing day counts, like 1, 7, 14');
      body.chase_days = days;
    }
    if (body.sort_code && !/^\d{2}-?\d{2}-?\d{2}$/.test(body.sort_code)) throw badRequest('Sort code should look like 12-34-56');
    if (body.account_number && !/^\d{8}$/.test(body.account_number)) throw badRequest('Account number should be 8 digits');
    if (body.vat_rate != null && (body.vat_rate < 0 || body.vat_rate > 100)) throw badRequest('VAT rate must be between 0 and 100');
    for (const k of ['payment_terms_days', 'quote_valid_days', 'quote_follow_up_days']) if (body[k] != null) body[k] = Math.min(365, Math.max(0, Math.round(body[k])));
    for (const [k, v] of Object.entries(body)) if (v === null) body[k] = '';
    res.json(setSetting(db, req.org.id, 'billing', { ...current, ...body }));
  });

  r.post('/', (req, res) => {
    const body = pick(req.body, docSchema);
    if (body.deal_id && !db.get('SELECT 1 FROM deals WHERE id = ? AND org_id = ?', body.deal_id, req.org.id)) throw badRequest('Unknown deal');
    res.status(201).json(createDocument(ctx, req.org.id, body, { actorId: req.user.id }));
  });

  /** Drafts an invoice (or quote) from a deal in one click. */
  r.post('/from-deal/:dealId', (req, res) => {
    const deal = db.get('SELECT * FROM deals WHERE id = ? AND org_id = ?', req.params.dealId, req.org.id);
    if (!deal) throw notFound('Deal');
    if (req.body?.kind === 'quote') {
      return res.status(201).json(createDocument(ctx, req.org.id, { kind: 'quote', contact_id: deal.contact_id, deal_id: deal.id, title: deal.title, line_items: [{ description: deal.title, quantity: 1, unit_pence: Math.round(Number(deal.value || 0) * 100) }] }, { actorId: req.user.id }));
    }
    res.status(201).json(invoiceFrom(ctx, req.org.id, { deal }, { actorId: req.user.id }));
  });

  r.get('/:id', (req, res) => {
    const doc = getDocument(db, req.org.id, req.params.id);
    doc.messages = db.all(`SELECT id, channel, status, template_key, created_at, error FROM messages WHERE related_type IN ('quote','invoice') AND related_id = ? ORDER BY created_at`, doc.id);
    res.json(doc);
  });
  r.patch('/:id', (req, res) => res.json(updateDocument(ctx, req.org.id, req.params.id, pick(req.body, docSchema, { partial: true }))));
  r.post('/:id/send', async (req, res) => {
    const body = pick(req.body, { channel: { enum: ['auto', 'email', 'sms', 'whatsapp'] } });
    res.json(await sendDocument(ctx, req.org.id, req.params.id, { actorId: req.user.id, channel: body.channel || 'auto' }));
  });
  r.post('/:id/accept', (req, res) => res.json(acceptQuote(ctx, req.org.id, req.params.id, { name: req.body?.name || '', actorId: req.user.id })));
  r.post('/:id/decline', (req, res) => res.json(declineQuote(ctx, req.org.id, req.params.id, { reason: req.body?.reason || '', actorId: req.user.id })));
  r.post('/:id/convert', (req, res) => res.status(201).json(convertQuote(ctx, req.org.id, req.params.id, { actorId: req.user.id })));
  r.post('/:id/void', requireRole('owner', 'admin'), (req, res) => res.json(voidDocument(ctx, req.org.id, req.params.id, { actorId: req.user.id })));
  r.post('/:id/payments', async (req, res) => {
    const body = pick(req.body, { amount_pence: { type: 'number' }, method: { enum: ['card', 'bank_transfer', 'cash', 'other'] }, reference: { max: 120 } });
    if (body.method === 'card') throw badRequest('Card payments are recorded automatically when the customer pays online');
    res.status(201).json(await recordPayment(ctx, req.org.id, req.params.id, { ...body, method: body.method || 'bank_transfer', actorId: req.user.id }));
  });
  /** A card payment link for the team to share (e.g. read out on the phone). */
  r.post('/:id/pay-link', async (req, res) => {
    const doc = getDocument(db, req.org.id, req.params.id);
    if (doc.kind !== 'invoice' || doc.balance_pence <= 0) throw badRequest('Nothing to pay on this one');
    res.json(await startCardPayment(ctx, doc, doc.link));
  });
  r.post('/:id/chase', (req, res) => {
    const doc = getDocument(db, req.org.id, req.params.id);
    db.update('invoices', doc.id, { chase: req.body?.chase === false ? 0 : 1 });
    res.json(getDocument(db, req.org.id, doc.id));
  });

  return r;
}

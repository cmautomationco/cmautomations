import { Router } from 'express';
import { parseJson } from '../../db/index.js';
import { requireAuth } from '../../lib/auth.js';
import { toE164 } from '../../lib/phone.js';
import { createContact } from './service.js';
import { badRequest, id, notFound, now, pick } from '../../lib/util.js';

export const DEAL_STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const LIFECYCLES = ['lead', 'prospect', 'customer', 'churned'];

const contactSchema = {
  first_name: { required: true, max: 80 }, last_name: { max: 80 }, email: { max: 200 }, phone: { max: 40 },
  company: { max: 120 }, source: { max: 80 }, lifecycle: { enum: LIFECYCLES }, owner_id: {}, tags: { type: 'array' },
  next_follow_up_at: {}, address: { max: 300 }, postcode: { max: 12 },
  preferred_channel: { enum: ['auto', 'email', 'sms', 'whatsapp'] }, whatsapp_opt_in: { type: 'boolean' },
  sms_opt_out: { type: 'boolean' }, email_opt_out: { type: 'boolean' },
};

function getContact(db, orgId, contactId) {
  const c = parseJson(db.get('SELECT * FROM contacts WHERE id = ? AND org_id = ?', contactId, orgId), 'tags');
  if (!c) throw notFound('Contact');
  return c;
}

function getDeal(db, orgId, dealId) {
  const d = db.get(`SELECT d.*, c.first_name, c.last_name, c.company, u.name AS owner_name FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id LEFT JOIN users u ON u.id = d.owner_id WHERE d.id = ? AND d.org_id = ?`, dealId, orgId);
  if (!d) throw notFound('Deal');
  return d;
}

function assertMember(db, orgId, userId) {
  if (userId && !db.get('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?', orgId, userId)) throw badRequest('Owner must be a member of this business');
}

export function crmRoutes({ db, engine }) {
  const r = Router();
  r.use(requireAuth(db));

  // ── Contacts ──
  r.get('/contacts', (req, res) => {
    const where = ['c.org_id = ?'];
    const params = [req.org.id];
    if (req.query.lifecycle) { where.push('c.lifecycle = ?'); params.push(req.query.lifecycle); }
    if (req.query.q) {
      where.push(`(c.first_name || ' ' || COALESCE(c.last_name,'') || ' ' || COALESCE(c.email,'') || ' ' || COALESCE(c.company,'')) LIKE ?`);
      params.push(`%${req.query.q}%`);
    }
    const rows = db.all(`SELECT c.*, u.name AS owner_name,
        (SELECT COALESCE(SUM(value),0) FROM deals d WHERE d.contact_id = c.id AND d.stage NOT IN ('won','lost')) AS open_value
      FROM contacts c LEFT JOIN users u ON u.id = c.owner_id WHERE ${where.join(' AND ')} ORDER BY c.updated_at DESC LIMIT 500`, ...params);
    res.json(parseJson(rows, 'tags'));
  });

  r.post('/contacts', (req, res) => {
    const body = pick(req.body, contactSchema);
    assertMember(db, req.org.id, body.owner_id);
    const { contact, automations } = createContact({ db, engine }, req.org.id, { ...body, owner_id: body.owner_id || req.user.id }, { actorId: req.user.id });
    res.status(201).json({ contact: getContact(db, req.org.id, contact.id), automations });
  });

  /** Bulk import (spreadsheet upload or a lead-form integration). Each contact runs the new-lead automations. */
  r.post('/contacts/import', (req, res) => {
    if (!Array.isArray(req.body?.contacts)) throw badRequest('Send { contacts: [...] }');
    const created = [];
    for (const raw of req.body.contacts.slice(0, 1000)) {
      const body = pick(raw, contactSchema);
      const { contact } = createContact({ db, engine }, req.org.id, { ...body, owner_id: req.user.id }, { actorId: req.user.id });
      created.push(contact.id);
    }
    res.status(201).json({ imported: created.length });
  });

  r.get('/contacts/:id', (req, res) => {
    const contact = getContact(db, req.org.id, req.params.id);
    contact.deals = db.all('SELECT * FROM deals WHERE contact_id = ? ORDER BY created_at DESC', contact.id);
    contact.activities = db.all('SELECT a.*, u.name AS author FROM activities a LEFT JOIN users u ON u.id = a.created_by WHERE a.contact_id = ? ORDER BY a.created_at DESC LIMIT 100', contact.id);
    contact.tasks = db.all(`SELECT id, title, status, due_at, priority FROM tasks WHERE org_id = ? AND source_ref = ? ORDER BY created_at DESC`, req.org.id, contact.id);
    contact.messages = db.all('SELECT id, channel, direction, body, status, created_at FROM messages WHERE contact_id = ? ORDER BY created_at, rowid', contact.id);
    contact.bookings = db.all('SELECT b.id, b.starts_at, b.status, s.name AS service_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id WHERE b.contact_id = ? ORDER BY b.starts_at DESC LIMIT 20', contact.id);
    contact.invoices = db.all('SELECT id, kind, number, status, total_pence FROM invoices WHERE contact_id = ? ORDER BY created_at DESC LIMIT 20', contact.id);
    res.json(contact);
  });

  r.patch('/contacts/:id', (req, res) => {
    getContact(db, req.org.id, req.params.id);
    const patch = pick(req.body, contactSchema, { partial: true });
    assertMember(db, req.org.id, patch.owner_id);
    if (patch.phone !== undefined) patch.phone_e164 = toE164(patch.phone);
    if (patch.postcode) patch.postcode = patch.postcode.toUpperCase();
    db.update('contacts', req.params.id, { ...patch, updated_at: now() });
    res.json(getContact(db, req.org.id, req.params.id));
  });

  r.delete('/contacts/:id', (req, res) => {
    getContact(db, req.org.id, req.params.id);
    db.run('DELETE FROM contacts WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });

  r.post('/contacts/:id/activities', (req, res) => {
    const contact = getContact(db, req.org.id, req.params.id);
    const body = pick(req.body, { type: { required: true, enum: ['note', 'call', 'email', 'meeting'] }, body: { required: true, max: 5000 }, deal_id: {}, follow_up_days: { type: 'number' } });
    const ts = now();
    const activity = { id: id('act'), org_id: req.org.id, contact_id: contact.id, deal_id: body.deal_id || null, type: body.type, body: body.body, created_by: req.user.id, created_at: ts };
    db.insert('activities', activity);
    const patch = { updated_at: ts };
    if (body.type !== 'note') patch.last_contacted_at = ts;
    if (body.follow_up_days) patch.next_follow_up_at = new Date(Date.now() + body.follow_up_days * 86400_000).toISOString();
    db.update('contacts', contact.id, patch);
    res.status(201).json(activity);
  });

  // ── Deals / pipeline ──
  r.get('/deals', (req, res) => {
    res.json(db.all(`SELECT d.*, c.first_name, c.last_name, c.company, u.name AS owner_name FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id LEFT JOIN users u ON u.id = d.owner_id WHERE d.org_id = ? ORDER BY d.updated_at DESC`, req.org.id));
  });

  r.get('/pipeline', (req, res) => {
    const deals = db.all(`SELECT d.*, c.first_name, c.last_name, c.company, u.name AS owner_name FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id LEFT JOIN users u ON u.id = d.owner_id WHERE d.org_id = ? ORDER BY d.updated_at DESC`, req.org.id);
    res.json(DEAL_STAGES.map((stage) => {
      const items = deals.filter((d) => d.stage === stage);
      return { stage, count: items.length, value: items.reduce((s, d) => s + d.value, 0), deals: items };
    }));
  });

  r.post('/deals', (req, res) => {
    const body = pick(req.body, { title: { required: true, max: 160 }, value: { type: 'number' }, contact_id: {}, stage: { enum: DEAL_STAGES }, owner_id: {}, expected_close: {} });
    if (body.contact_id) getContact(db, req.org.id, body.contact_id);
    assertMember(db, req.org.id, body.owner_id);
    const ts = now();
    const deal = { id: id('del'), org_id: req.org.id, ...body, value: body.value || 0, stage: body.stage || 'new', owner_id: body.owner_id || req.user.id, created_at: ts, updated_at: ts };
    db.insert('deals', deal);
    res.status(201).json(getDeal(db, req.org.id, deal.id));
  });

  /** Moving a deal between stages is what drives most sales automations. */
  r.patch('/deals/:id', (req, res) => {
    const before = getDeal(db, req.org.id, req.params.id);
    const patch = pick(req.body, { title: { max: 160 }, value: { type: 'number' }, stage: { enum: DEAL_STAGES }, owner_id: {}, expected_close: {}, contact_id: {} }, { partial: true });
    assertMember(db, req.org.id, patch.owner_id);
    const ts = now();
    if (patch.stage && ['won', 'lost'].includes(patch.stage) && before.stage !== patch.stage) patch.closed_at = ts;
    if (patch.stage && !['won', 'lost'].includes(patch.stage)) patch.closed_at = null;
    db.update('deals', before.id, { ...patch, updated_at: ts });
    const deal = getDeal(db, req.org.id, before.id);
    let automations = [];
    if (patch.stage && patch.stage !== before.stage) {
      const contact = deal.contact_id ? getContact(db, req.org.id, deal.contact_id) : null;
      if (contact) {
        db.insert('activities', { id: id('act'), org_id: req.org.id, contact_id: contact.id, deal_id: deal.id, type: 'system', body: `Deal “${deal.title}” moved from ${before.stage} to ${deal.stage}`, created_by: req.user.id, created_at: ts });
      }
      const payload = { deal, contact, from_stage: before.stage };
      automations = engine.emit(req.org.id, 'deal.stage_changed', payload, { actorId: req.user.id });
      if (deal.stage === 'won') automations = automations.concat(engine.emit(req.org.id, 'deal.won', payload, { actorId: req.user.id }));
      if (deal.stage === 'lost') automations = automations.concat(engine.emit(req.org.id, 'deal.lost', payload, { actorId: req.user.id }));
    }
    res.json({ deal, automations });
  });

  r.delete('/deals/:id', (req, res) => {
    getDeal(db, req.org.id, req.params.id);
    db.run('DELETE FROM deals WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });

  return r;
}

import { Router } from 'express';
import { requireAuth } from '../../lib/auth.js';
import { setSetting } from '../../lib/settings.js';
import { badRequest, id, notFound, now, pick, publicToken } from '../../lib/util.js';
import { NICHES } from '../core/niches.js';
import { DISCOVERY_FIELDS, TASK_LIBRARY, suggestedTasks } from './audit.js';
import {
  AGENCY_DEFAULTS, CLIENT_DEFAULTS, analyseAudit, cleanBrand, createClient, generateReport, getAgencySettings, getAudit, getClientProfile,
  getReport, hubData, parseBrand, previousPeriod, resolveAgency, sendProposal, sendReport,
} from './service.js';

const auditSchema = {
  client_name: { max: 120 }, contact_name: { max: 120 }, contact_email: { max: 200 }, contact_phone: { max: 40 }, niche: { enum: Object.keys(NICHES) },
  team_size: { type: 'number' }, hourly_cost_pence: { type: 'number' }, setup_fee_pence: { type: 'number' }, monthly_fee_pence: { type: 'number' },
  discovery: { type: 'object' }, tasks: { type: 'array' },
};

export function agencyRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));
  r.use((req, _res, next) => { req.agency = resolveAgency(db, req); next(); });

  /** Clients this agency manages (the person must be on the agency team). */
  const clientOf = (req, orgId) => {
    const org = db.get('SELECT * FROM organizations WHERE id = ? AND agency_id = ?', orgId, req.agency.id);
    if (!org) throw notFound('Client');
    return org;
  };

  r.get('/hub', (req, res) => res.json({ ...hubData(db, req.agency, req.user.id), settings: getAgencySettings(db, req.agency.id) }));

  r.put('/settings', (req, res) => {
    const body = pick(req.body, { auto_send_reports: { type: 'boolean' }, report_day: { type: 'number' }, default_setup_fee_pence: { type: 'number' }, default_monthly_fee_pence: { type: 'number' }, default_hourly_cost_pence: { type: 'number' } }, { partial: true });
    if (body.report_day != null) body.report_day = Math.min(28, Math.max(1, Math.round(body.report_day)));
    for (const [k, v] of Object.entries(body)) if (v === null) body[k] = AGENCY_DEFAULTS[k];
    res.json(setSetting(db, req.agency.id, 'agency', { ...getAgencySettings(db, req.agency.id), ...body }));
  });

  // ── Clients ──
  r.post('/clients', (req, res) => {
    const body = pick(req.body, { name: { required: true, max: 120 }, niche: { enum: Object.keys(NICHES) }, contact_name: { max: 120 }, email: { max: 200 }, phone: { max: 40 }, monthly_fee_pence: { type: 'number' } });
    const org = createClient(ctx, req.agency, { ...body, niche: body.niche || 'local_services', monthly_fee_pence: Math.round(body.monthly_fee_pence || 0) }, req.user.id);
    res.status(201).json(org);
  });

  r.get('/clients/:id', (req, res) => {
    const org = clientOf(req, req.params.id);
    res.json({ ...org, brand: parseBrand(org), profile: getClientProfile(db, org.id), reports: db.all('SELECT id, period, status, sent_at, summary, public_token FROM reports WHERE org_id = ? ORDER BY period DESC', org.id) });
  });

  r.patch('/clients/:id', (req, res) => {
    const org = clientOf(req, req.params.id);
    const body = pick(req.body, { contact_name: { max: 120 }, email: { max: 200 }, phone: { max: 40 }, monthly_fee_pence: { type: 'number' }, hourly_cost_pence: { type: 'number' }, brand: { type: 'object' } }, { partial: true });
    if (body.brand) db.update('organizations', org.id, { brand: cleanBrand(body.brand, parseBrand(org)) });
    const { brand, ...profile } = body;
    for (const [k, v] of Object.entries(profile)) if (v === null) profile[k] = CLIENT_DEFAULTS[k];
    setSetting(db, org.id, 'client_profile', { ...getClientProfile(db, org.id), ...profile });
    const updated = db.get('SELECT * FROM organizations WHERE id = ?', org.id);
    res.json({ ...updated, brand: parseBrand(updated), profile: getClientProfile(db, org.id) });
  });

  // ── Audits & proposals ──
  r.get('/audit-library', (_req, res) => res.json({ tasks: TASK_LIBRARY, discovery: DISCOVERY_FIELDS }));

  r.get('/audits', (req, res) => {
    res.json(db.all('SELECT id, client_name, contact_name, niche, status, setup_fee_pence, monthly_fee_pence, created_at, updated_at, sent_at, accepted_at, client_org_id FROM audits WHERE org_id = ? ORDER BY updated_at DESC', req.agency.id));
  });

  r.post('/audits', (req, res) => {
    const body = pick(req.body, { ...auditSchema, client_name: { required: true, max: 120 } });
    const settings = getAgencySettings(db, req.agency.id);
    const niche = body.niche || 'local_services';
    const ts = now();
    const audit = {
      id: id('aud'), org_id: req.agency.id, client_name: body.client_name, contact_name: body.contact_name || null, contact_email: body.contact_email || null,
      contact_phone: body.contact_phone || null, niche, team_size: Math.max(1, Math.round(body.team_size || 1)),
      hourly_cost_pence: Math.round(body.hourly_cost_pence || settings.default_hourly_cost_pence),
      setup_fee_pence: Math.round(body.setup_fee_pence ?? settings.default_setup_fee_pence), monthly_fee_pence: Math.round(body.monthly_fee_pence ?? settings.default_monthly_fee_pence),
      discovery: body.discovery || {}, tasks: body.tasks || suggestedTasks(niche), analysis: {}, proposal: {}, status: 'draft', public_token: publicToken(),
      client_org_id: null, created_by: req.user.id, created_at: ts, updated_at: ts,
    };
    db.insert('audits', audit);
    res.status(201).json(getAudit(db, req.agency.id, audit.id));
  });

  r.get('/audits/:id', (req, res) => res.json(getAudit(db, req.agency.id, req.params.id)));

  r.patch('/audits/:id', (req, res) => {
    const audit = getAudit(db, req.agency.id, req.params.id);
    if (audit.status === 'accepted') throw badRequest('This proposal has been accepted – it can’t be changed');
    const patch = pick(req.body, auditSchema, { partial: true });
    if (patch.client_name === null) delete patch.client_name;
    for (const k of ['hourly_cost_pence', 'setup_fee_pence', 'monthly_fee_pence']) if (patch[k] != null) patch[k] = Math.max(0, Math.round(patch[k]));
    if (patch.tasks) {
      patch.tasks = patch.tasks.slice(0, 60).map((t) => ({
        key: String(t.key || `custom_${Math.random().toString(36).slice(2, 8)}`), name: String(t.name || '').slice(0, 120), category: t.category || 'Other',
        per_week: Math.max(0, Number(t.per_week) || 0), minutes: Math.max(0, Number(t.minutes) || 0), people: Math.max(1, Number(t.people) || 1),
        pain: Math.min(5, Math.max(1, Number(t.pain) || 3)), selected: t.selected !== false,
        ...(t.solution ? { solution: String(t.solution).slice(0, 300) } : {}), ...(t.rate != null ? { rate: Math.min(1, Math.max(0, Number(t.rate))) } : {}), ...(t.effort ? { effort: Math.min(3, Math.max(1, Number(t.effort))) } : {}),
      }));
    }
    db.update('audits', audit.id, { ...patch, updated_at: now() });
    res.json(getAudit(db, req.agency.id, audit.id));
  });

  r.delete('/audits/:id', (req, res) => {
    getAudit(db, req.agency.id, req.params.id);
    db.run('DELETE FROM audits WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });

  /** Scores the tasks and writes the proposal. */
  r.post('/audits/:id/analyse', (req, res) => res.json(analyseAudit(db, req.agency, req.params.id, { preparedBy: req.user.name })));

  r.post('/audits/:id/send', async (req, res) => {
    const body = pick(req.body, { channel: { enum: ['auto', 'email', 'whatsapp', 'sms'] } });
    res.json(await sendProposal(ctx, req.agency, req.params.id, { actorId: req.user.id, channel: body.channel || 'auto' }));
  });

  // ── Monthly reports ──
  r.get('/reports', (req, res) => {
    res.json(db.all(`SELECT r.id, r.org_id, r.period, r.status, r.sent_at, r.summary, r.public_token, o.name AS org_name FROM reports r JOIN organizations o ON o.id = r.org_id WHERE o.agency_id = ? ORDER BY r.period DESC, o.name`, req.agency.id));
  });
  r.post('/reports', (req, res) => {
    const body = pick(req.body, { org_id: { required: true }, period: {} });
    const org = clientOf(req, body.org_id);
    res.status(201).json(generateReport(db, org, body.period || previousPeriod(org.timezone)));
  });
  r.get('/reports/:id', (req, res) => {
    const report = getReport(db, req.params.id);
    clientOf(req, report.org_id);
    res.json(report);
  });
  r.post('/reports/:id/send', async (req, res) => {
    const report = getReport(db, req.params.id);
    clientOf(req, report.org_id);
    res.json(await sendReport(ctx, report.id, { actorId: req.user.id }));
  });

  return r;
}

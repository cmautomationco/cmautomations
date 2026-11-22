import { Router } from 'express';
import { parseJson } from '../../db/index.js';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { setSetting } from '../../lib/settings.js';
import { HttpError, badRequest, notFound, now, pick } from '../../lib/util.js';
import { notifyUsers } from '../core/notifications.js';
import { businessCard } from '../public/routes.js';
import { DEFAULT_SETTINGS, STEP } from './journey.js';
import {
  addUpdate, completeStep, confirmKickoff, createClient, getClient, getCoachingSettings, journeyOf, messageClient,
  portalLink, progressOf, proposeKickoff, replyToCheckin, submitCheckin, updatesOf, weeklyReport,
} from './service.js';

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const adminIds = (db, orgId) => db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin')`, orgId).map((r) => r.user_id);

/** Coaching: the coach's side. Every client from the first conversation to fully onboarded, and their progress. */
export function coachingRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));
  const admin = requireRole('owner', 'admin');

  const summary = (c) => {
    const j = journeyOf(db, c);
    const last = db.get('SELECT body, author, step_key, created_at FROM coaching_updates WHERE client_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', c.id);
    const p = progressOf(db, c);
    return {
      id: c.id, name: c.name, status: c.status, goal: c.goal, programme: c.programme, met_via: c.met_via, created_at: c.created_at,
      done: j.done, total: j.total, current: j.current ? { key: j.current.key, title: j.current.title, owner: j.current.owner, opened_at: j.current.opened_at } : null,
      last_update: last, week: p.current_week, weeks: c.weeks, to_goal_pct: p.to_goal_pct, link: portalLink(c),
    };
  };

  r.get('/', (req, res) => {
    const clients = db.all('SELECT * FROM coaching_clients WHERE org_id = ? ORDER BY created_at DESC', req.org.id);
    res.json({ clients: clients.map(summary), report: weeklyReport(db, req.org.id), settings: getCoachingSettings(db, req.org.id) });
  });

  r.get('/report', (req, res) => res.json(weeklyReport(db, req.org.id)));

  r.put('/settings', admin, (req, res) => {
    const body = pick(req.body, { programme: { max: 120 }, weeks: { type: 'number' }, price_text: { max: 200 }, includes: { type: 'array' }, agreement: { max: 4000 }, kickoff_note: { max: 400 }, checkin_day: { max: 20 } }, { partial: true });
    const current = getCoachingSettings(db, req.org.id);
    const next = { ...current };
    for (const [k, v] of Object.entries(body)) if (v !== undefined) next[k] = v === null ? DEFAULT_SETTINGS[k] : v;
    if (next.weeks < 1 || next.weeks > 104) throw badRequest('weeks must be between 1 and 104');
    next.includes = (next.includes || []).map((x) => String(x).slice(0, 160)).filter(Boolean).slice(0, 10);
    res.json(setSetting(db, req.org.id, 'coaching', next));
  });

  /** A new client, from the first conversation. */
  r.post('/clients', admin, (req, res) => {
    const body = pick(req.body, {
      name: { required: true, max: 120 }, email: { max: 200 }, phone: { max: 40 }, instagram: { max: 60 }, contact_id: { max: 60 },
      met_via: { max: 80 }, notes: { max: 2000 }, goal: { max: 400 }, programme: { max: 120 }, weeks: { type: 'number' },
      metric_label: { max: 60 }, metric_unit: { max: 20 }, baseline: { type: 'number' }, target: { type: 'number' }, call_done: { type: 'boolean' },
    });
    if (body.weeks !== undefined && body.weeks !== null && (body.weeks < 1 || body.weeks > 104)) throw badRequest('weeks must be between 1 and 104');
    const client = createClient(ctx, req.org.id, body, { actorId: req.user.id });
    res.status(201).json(detail(client));
  });

  const detail = (c) => ({ ...c, link: portalLink(c), journey: journeyOf(db, c), updates: updatesOf(db, c.id), progress: progressOf(db, c) });

  r.get('/clients/:id', (req, res) => res.json(detail(getClient(db, req.org.id, req.params.id))));

  r.put('/clients/:id', admin, (req, res) => {
    const c = getClient(db, req.org.id, req.params.id);
    const body = pick(req.body, { name: { max: 120 }, goal: { max: 400 }, programme: { max: 120 }, weeks: { type: 'number' }, metric_label: { max: 60 }, metric_unit: { max: 20 },
      baseline: { type: 'number' }, target: { type: 'number' }, status: { enum: ['onboarding', 'active', 'paused', 'finished'] } }, { partial: true });
    const patch = {};
    for (const [k, v] of Object.entries(body)) if (v !== undefined) patch[k] = v;
    if (patch.weeks !== undefined && (patch.weeks < 1 || patch.weeks > 104)) throw badRequest('weeks must be between 1 and 104');
    db.update('coaching_clients', c.id, { ...patch, updated_at: now() });
    res.json(detail(getClient(db, req.org.id, c.id)));
  });

  /** The coach finishes a step (call held, paid, kickoff done, programme sent…). */
  r.post('/clients/:id/steps/:key/done', admin, (req, res) => {
    const c = getClient(db, req.org.id, req.params.id);
    const def = STEP[req.params.key];
    if (!def) throw notFound('Step');
    const body = pick(req.body, { note: { max: 1000 }, link: { max: 500 } }, { partial: true });
    if (body.link && !/^https?:\/\//i.test(body.link)) throw badRequest('The link must start with http(s)://');
    completeStep(ctx, c, def.key, { by: 'coach', data: body.link ? { link: body.link } : {}, note: body.note || null });
    res.json(detail(getClient(db, req.org.id, c.id)));
  });

  r.post('/clients/:id/kickoff', admin, (req, res) => {
    const c = getClient(db, req.org.id, req.params.id);
    const body = pick(req.body, { when: { required: true, max: 120 } });
    confirmKickoff(ctx, c, body.when);
    res.json(detail(getClient(db, req.org.id, c.id)));
  });

  /** A message to the client: on their page and sent to them. */
  r.post('/clients/:id/messages', (req, res) => {
    const c = getClient(db, req.org.id, req.params.id);
    const body = pick(req.body, { body: { required: true, max: 2000 } });
    messageClient(ctx, c, body.body.replace(/\{\{/g, '{ {'), { author: 'coach' });
    res.json(detail(getClient(db, req.org.id, c.id)));
  });

  r.post('/clients/:id/checkins/:week/reply', (req, res) => {
    const c = getClient(db, req.org.id, req.params.id);
    const body = pick(req.body, { reply: { required: true, max: 2000 } });
    replyToCheckin(ctx, c, Number(req.params.week), body.reply.replace(/\{\{/g, '{ {'));
    res.json(detail(getClient(db, req.org.id, c.id)));
  });

  r.delete('/clients/:id', admin, (req, res) => {
    const c = getClient(db, req.org.id, req.params.id);
    db.run('DELETE FROM coaching_clients WHERE id = ?', c.id);
    res.json({ ok: true });
  });

  return r;
}

/** The client's own page, from their link: their onboarding, their progress and the conversation. */
export function coachingPublicRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  const clientFor = (token) => {
    const c = db.get('SELECT * FROM coaching_clients WHERE token = ?', String(token).slice(0, 80));
    if (!c) throw notFound('Page');
    return c;
  };
  const limit = (req) => { if (!rateLimit(`coach-portal:${req.ip || 'local'}`, { max: 60, windowMs: 60_000 })) throw new HttpError(429, 'Too many requests – please wait a minute'); };
  const view = (c) => {
    const settings = getCoachingSettings(db, c.org_id);
    const org = db.get('SELECT * FROM organizations WHERE id = ?', c.org_id);
    const intake = parseJson(db.get(`SELECT data FROM coaching_steps WHERE client_id = ? AND key = 'intake'`, c.id), 'data')?.data || {};
    return {
      name: c.name, first_name: c.name.split(/\s+/)[0], status: c.status, goal: c.goal, programme: c.programme, weeks: c.weeks, programme_link: c.programme_link,
      offer: { programme: c.programme, weeks: c.weeks, price_text: settings.price_text, includes: settings.includes },
      agreement: settings.agreement, kickoff_note: settings.kickoff_note, checkin_day: settings.checkin_day,
      intake: { submitted: Boolean(intake.submitted_at) },
      journey: journeyOf(db, c, { forClient: true }),
      progress: progressOf(db, c),
      updates: updatesOf(db, c.id).map(({ author, body, created_at, step_key }) => ({ author, body, created_at, step_key })),
      business: businessCard(db, org),
    };
  };

  r.get('/:token', (req, res) => res.json(view(clientFor(req.params.token))));

  r.post('/:token/accept', (req, res) => {
    limit(req);
    const c = clientFor(req.params.token);
    completeStep(ctx, c, 'offer', { by: 'client' });
    notifyUsers(db, c.org_id, adminIds(db, c.org_id), { title: `🎉 ${c.name} said yes`, body: c.programme, link: `#/coaching/${c.id}` });
    res.json(view(clientFor(req.params.token)));
  });

  r.post('/:token/intake', (req, res) => {
    limit(req);
    const c = clientFor(req.params.token);
    const body = pick(req.body, { goals: { required: true, max: 2000 }, history: { max: 2000 }, injuries: { max: 1000 }, schedule: { max: 1000 }, starting_value: { type: 'number' }, goal_value: { type: 'number' } });
    completeStep(ctx, c, 'intake', { by: 'client', data: { ...body, submitted_at: now() } });
    // Their starting point and goal become the two ends of their progress chart.
    const patch = {};
    if (body.starting_value !== undefined && body.starting_value !== null) patch.baseline = body.starting_value;
    if (body.goal_value !== undefined && body.goal_value !== null) patch.target = body.goal_value;
    if (!c.goal && body.goals) patch.goal = body.goals.slice(0, 400);
    if (Object.keys(patch).length) db.update('coaching_clients', c.id, patch);
    res.json(view(clientFor(req.params.token)));
  });

  r.post('/:token/agreement', (req, res) => {
    limit(req);
    const c = clientFor(req.params.token);
    const body = pick(req.body, { signed_name: { required: true, max: 120 } });
    completeStep(ctx, c, 'agreement', { by: 'client', data: { signed_name: body.signed_name, signed_at: now() } });
    res.json(view(clientFor(req.params.token)));
  });

  r.post('/:token/kickoff', (req, res) => {
    limit(req);
    const c = clientFor(req.params.token);
    const body = pick(req.body, { times: { required: true, max: 300 } });
    proposeKickoff(ctx, c, body.times);
    res.json(view(clientFor(req.params.token)));
  });

  r.post('/:token/checkin', (req, res) => {
    limit(req);
    const c = clientFor(req.params.token);
    const body = pick(req.body, { week: { type: 'number' }, value: { type: 'number' }, energy: { type: 'number' }, wins: { max: 1000 }, struggles: { max: 1000 } });
    submitCheckin(ctx, c, body);
    res.json(view(clientFor(req.params.token)));
  });

  r.post('/:token/messages', (req, res) => {
    limit(req);
    const c = clientFor(req.params.token);
    const body = pick(req.body, { body: { required: true, max: 2000 } });
    addUpdate(db, c, 'client', body.body);
    notifyUsers(db, c.org_id, adminIds(db, c.org_id), { title: `💬 ${c.name}`, body: body.body.slice(0, 140), link: `#/coaching/${c.id}` });
    res.json(view(clientFor(req.params.token)));
  });

  return r;
}

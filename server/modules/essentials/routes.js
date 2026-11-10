import { Router } from 'express';
import { config } from '../../config.js';
import { parseJson } from '../../db/index.js';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { publicLink, serverBase } from '../../lib/links.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { HttpError, badRequest, id, notFound, now, pick, publicToken } from '../../lib/util.js';
import { notifyUsers } from '../core/notifications.js';
import { createTask } from '../tasks/service.js';
import { handleSocial, socialToken } from '../messaging/social.js';
import { businessCard } from '../public/routes.js';
import { ITEMS, applyItems, describe } from './catalogue.js';

const socialAddress = (token) => `${serverBase()}/api/hooks/social/${token}`;
const adminIds = (db, orgId) => db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin')`, orgId).map((r) => r.user_id);

/** Automations → Essentials: the offer, switching items on, and sending it to a business. */
export function essentialsRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));
  const admin = requireRole('owner', 'admin');

  r.get('/', (req, res) => {
    const offers = parseJson(db.all(`SELECT o.*, u.name AS created_by_name FROM automation_offers o LEFT JOIN users u ON u.id = o.created_by
                                      WHERE o.org_id = ? ORDER BY o.created_at DESC LIMIT 10`, req.org.id), 'items');
    res.json({
      ...describe(db, req.org.id),
      // The social address works like a password, so only owners and admins see it.
      social: { address: req.role === 'member' ? null : socialAddress(socialToken(db, req.org.id)), demo: config.demoMode },
      offers: offers.map((o) => ({ ...o, link: publicLink(`essentials/${o.token}`) })),
      business: req.org.name, client_of_agency: Boolean(req.org.agency_id),
    });
  });

  r.post('/apply', admin, (req, res) => {
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : null;
    if (!changes?.length) throw badRequest('Send { changes: [{ key, on, options }] }');
    res.json(applyItems(ctx, req.org.id, changes.slice(0, ITEMS.length)));
  });

  r.post('/offers', admin, (req, res) => {
    const body = pick(req.body, { items: { type: 'array', required: true }, note: { max: 2000 } });
    const items = [...new Set(body.items)].filter((k) => ITEMS.some((i) => i.key === k));
    if (!items.length) throw badRequest('Choose at least one automation for the offer');
    const offer = { id: id('off'), org_id: req.org.id, token: publicToken(), items, note: body.note || null, status: 'sent', created_by: req.user.id, created_at: now() };
    db.insert('automation_offers', offer);
    res.status(201).json({ ...offer, link: publicLink(`essentials/${offer.token}`) });
  });

  return r;
}

/** The offer as the business sees it from its link, and saying yes to it. */
export function essentialsPublicRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  const offerFor = (token) => {
    const o = parseJson(db.get('SELECT * FROM automation_offers WHERE token = ?', String(token)), 'items');
    if (!o) throw notFound('Offer');
    return o;
  };

  r.get('/:token', (req, res) => {
    const o = offerFor(req.params.token);
    if (!o.viewed_at) db.update('automation_offers', o.id, { viewed_at: now() });
    const org = db.get('SELECT * FROM organizations WHERE id = ?', o.org_id);
    const agency = org.agency_id ? db.get('SELECT * FROM organizations WHERE id = ?', org.agency_id) : null;
    const state = describe(db, o.org_id);
    const chosen = new Set(o.items);
    res.json({
      status: o.status, note: o.note, accepted_by: o.accepted_by, accepted_at: o.accepted_at, created_at: o.created_at,
      business: businessCard(db, org), from: agency ? businessCard(db, agency) : null,
      sections: state.sections.map((s) => ({ key: s.key, title: s.title, blurb: s.blurb, items: s.items.filter((i) => chosen.has(i.key)).map(({ key, name, does, result, stage, on }) => ({ key, name, does, result, stage, on })) }))
        .filter((s) => s.items.length),
    });
  });

  r.post('/:token/accept', (req, res) => {
    if (!rateLimit(`essentials:${req.ip || 'local'}`, { max: 10, windowMs: 60_000 })) throw new HttpError(429, 'Too many attempts – please wait a minute and try again');
    const o = offerFor(req.params.token);
    const body = pick(req.body, { name: { required: true, max: 120 } });
    if (o.status === 'accepted') return res.json({ status: 'accepted', already: true });
    const after = applyItems(ctx, o.org_id, o.items.map((key) => ({ key, on: true })));
    db.update('automation_offers', o.id, { status: 'accepted', accepted_at: now(), accepted_by: body.name });
    const org = db.get('SELECT * FROM organizations WHERE id = ?', o.org_id);
    const needs = after.sections.flatMap((s) => s.items).filter((i) => o.items.includes(i.key) && i.needs.length);
    const owners = adminIds(db, o.org_id);
    createTask(ctx, o.org_id, {
      title: `Finish setting up the Essentials ${body.name} said yes to`,
      description: `${o.items.length} automation${o.items.length === 1 ? ' is' : 's are'} now switched on in ${org.name}.${needs.length ? `\n\nStill to set up:\n${needs.map((i) => `• ${i.name}: ${i.needs.map((n) => n.text).join('; ')}`).join('\n')}` : ''}\n\nOpen Automations → Essentials to check the wording and options.`,
      priority: needs.length ? 'high' : 'medium', due_at: new Date(Date.now() + 86400_000).toISOString(), assignee_id: o.created_by || owners[0] || null, source: 'automation', source_ref: o.id,
    });
    const notice = { title: `✅ ${body.name} said yes to the Essentials`, body: `${o.items.length} automations switched on in ${org.name}.`, link: '#/automations' };
    notifyUsers(db, o.org_id, owners, notice);
    if (org.agency_id) notifyUsers(db, org.agency_id, adminIds(db, org.agency_id), { ...notice, link: '#/agency' });
    ctx.engine.logSystemRun(o.org_id, 'Essentials offer accepted', 'proposal.accepted', `${body.name} switched on ${o.items.length} automations`, 15);
    res.json({ status: 'accepted', switched_on: o.items.length });
  });

  return r;
}

/**
 * The social address: ManyChat, Make or Zapier send each Instagram, Facebook or
 * TikTok DM or comment here. The reply (if any) comes back in the response.
 */
export function socialHookRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.post('/:token', async (req, res) => {
    const token = String(req.params.token || '');
    if (!rateLimit(`social-hook:${token}`, { max: 240, windowMs: 60_000 })) throw new HttpError(429, 'Too many messages – slow down');
    const row = token.length >= 20 ? db.all(`SELECT org_id, value FROM org_meta WHERE key = 'setting:messaging'`).find((m) => {
      try { return JSON.parse(m.value).social_token === token; } catch { return false; }
    }) : null;
    if (!row) throw new HttpError(404, 'Not found');
    const b = req.body || {};
    try {
      const out = await handleSocial(ctx, row.org_id, b);
      const dm = out.replies.find((x) => x.type === 'dm');
      const comment = out.replies.find((x) => x.type === 'comment_reply');
      res.json({
        ok: true, contact_id: out.contact.id, sent_via: out.sent_via, answered: out.answered,
        // For ManyChat / Make / Zapier steps that post the reply themselves.
        reply: dm?.text || null, comment_reply: comment?.text || null, replies: out.replies,
      });
    } catch (err) {
      if (err.status === 400) throw badRequest(err.message);
      throw err;
    }
  });
  return r;
}


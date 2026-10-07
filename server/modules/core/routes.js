import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { parseJson } from '../../db/index.js';
import { createSession, hashPassword, requireAuth, requireRole, verifyPassword } from '../../lib/auth.js';
import { config } from '../../config.js';
import { HttpError, badRequest, id, now, pick } from '../../lib/util.js';
import { installMissingRecipes } from '../../automation/recipes.js';
import { NICHES, PLATFORMS, getNiche } from './niches.js';

/**
 * Creates a new business (tenant) and seeds it from its niche preset:
 * brand profile, content pillars, a default publishing channel and all
 * recommended automations.
 */
export function provisionOrganization(db, { name, niche, business_type, ownerId }) {
  const preset = getNiche(niche);
  const ts = now();
  const org = {
    id: id('org'), name, niche: NICHES[niche] ? niche : 'coaching',
    business_type: business_type || preset.businessType, timezone: 'Europe/London', created_at: ts,
  };
  db.insert('organizations', org);
  db.insert('memberships', { org_id: org.id, user_id: ownerId, role: 'owner' });
  db.insert('brand_profiles', {
    org_id: org.id, audience: preset.audience, pains: preset.pains, desires: preset.desires,
    offers: preset.offers, tone: 'Friendly, clear and confident', platforms: preset.platforms, posts_per_week: 4, updated_at: ts,
  });
  preset.pillars.forEach((p, i) => db.insert('content_pillars', {
    id: id('pil'), org_id: org.id, name: p.name, description: p.description, weight: i === 0 ? 2 : 1, created_at: ts,
  }));
  for (const platform of preset.platforms) {
    db.insert('channels', { id: id('chn'), org_id: org.id, platform, handle: `@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`, adapter: 'simulated', config: {}, active: 1, created_at: ts });
  }
  installMissingRecipes(db, org.id);
  return org;
}

/** While passwords are off, accounts get an unguessable password nobody knows (it can be reset later). */
const placeholderPassword = () => randomBytes(24).toString('hex');

export function coreRoutes({ db }) {
  const r = Router();
  const auth = requireAuth(db);

  r.get('/meta', (_req, res) => {
    res.json({
      require_passwords: config.requirePasswords,
      niches: Object.entries(NICHES).map(([key, n]) => ({ key, label: n.label, businessType: n.businessType })),
      platforms: Object.entries(PLATFORMS).map(([key, p]) => ({ key, ...p })),
    });
  });

  r.post('/auth/register', (req, res) => {
    const body = pick(req.body, {
      name: { required: true, max: 120 }, email: { required: true, max: 200 }, password: { required: config.requirePasswords },
      business_name: { required: true, max: 120 }, niche: { enum: Object.keys(NICHES) },
      business_type: { enum: ['product', 'service', 'hybrid'] },
    });
    if (config.requirePasswords && body.password.length < 8) throw badRequest('Password must be at least 8 characters');
    const email = body.email.toLowerCase();
    if (db.get('SELECT id FROM users WHERE email = ?', email)) throw badRequest('An account with that email already exists');
    const result = db.tx(() => {
      const user = { id: id('usr'), email, name: body.name, password_hash: hashPassword(body.password || placeholderPassword()), created_at: now() };
      db.insert('users', user);
      const org = provisionOrganization(db, { name: body.business_name, niche: body.niche || 'coaching', business_type: body.business_type, ownerId: user.id });
      return { user, org };
    });
    const token = createSession(db, result.user.id, result.org.id);
    res.status(201).json({ token, user: { id: result.user.id, name: result.user.name, email }, org: result.org });
  });

  r.post('/auth/login', (req, res) => {
    const { email, password } = pick(req.body, { email: { required: true }, password: { required: config.requirePasswords } });
    const user = db.get('SELECT * FROM users WHERE email = ?', email.toLowerCase());
    if (!config.requirePasswords) {
      if (!user) throw new HttpError(401, 'No account uses that email');
    } else if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'Email or password is incorrect');
    }
    const membership = db.get('SELECT org_id FROM memberships WHERE user_id = ? ORDER BY rowid LIMIT 1', user.id);
    if (!membership) throw new HttpError(403, 'This account is not part of a business yet');
    const token = createSession(db, user.id, membership.org_id);
    res.json({ token });
  });

  r.post('/auth/logout', auth, (req, res) => {
    db.run('DELETE FROM sessions WHERE token = ?', req.token);
    res.json({ ok: true });
  });

  r.get('/me', auth, (req, res) => {
    const orgs = db.all(`SELECT o.id, o.name, o.niche, m.role FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ? ORDER BY o.name`, req.user.id);
    const unread = db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND org_id = ? AND read = 0', req.user.id, req.org.id).n;
    res.json({ user: req.user, org: req.org, role: req.role, orgs, unread, niche: { key: req.org.niche, label: getNiche(req.org.niche).label } });
  });

  // Switch the active business (one login can manage several businesses).
  r.post('/auth/switch', auth, (req, res) => {
    const { org_id } = pick(req.body, { org_id: { required: true } });
    if (!db.get('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?', org_id, req.user.id)) throw new HttpError(403, 'Not a member of that business');
    db.run('UPDATE sessions SET org_id = ? WHERE token = ?', org_id, req.token);
    res.json({ ok: true });
  });

  // Add another business under the same login (agency / multi-business owners).
  r.post('/orgs', auth, (req, res) => {
    const body = pick(req.body, { name: { required: true, max: 120 }, niche: { enum: Object.keys(NICHES) }, business_type: { enum: ['product', 'service', 'hybrid'] } });
    const org = db.tx(() => provisionOrganization(db, { ...body, niche: body.niche || 'coaching', ownerId: req.user.id }));
    res.status(201).json(org);
  });

  r.patch('/org', auth, requireRole('owner', 'admin'), (req, res) => {
    const patch = pick(req.body, { name: { max: 120 }, niche: { enum: Object.keys(NICHES) }, business_type: { enum: ['product', 'service', 'hybrid'] }, timezone: {} }, { partial: true });
    db.update('organizations', req.org.id, patch);
    res.json(db.get('SELECT * FROM organizations WHERE id = ?', req.org.id));
  });

  // ── Team ──
  r.get('/team', auth, (req, res) => {
    res.json(db.all(`
      SELECT u.id, u.name, u.email, m.role,
        (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.org_id = m.org_id AND t.status != 'done') AS open_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.org_id = m.org_id AND t.status = 'done' AND t.completed_at >= date('now','-7 days')) AS done_this_week
      FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY u.name`, req.org.id));
  });

  r.post('/team', auth, requireRole('owner', 'admin'), (req, res) => {
    const body = pick(req.body, { name: { required: true }, email: { required: true }, password: { required: config.requirePasswords }, role: { enum: ['admin', 'member'] } });
    const email = body.email.toLowerCase();
    let user = db.get('SELECT * FROM users WHERE email = ?', email);
    if (!user) {
      user = { id: id('usr'), email, name: body.name, password_hash: hashPassword(body.password || placeholderPassword()), created_at: now() };
      db.insert('users', user);
    }
    if (db.get('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?', req.org.id, user.id)) throw badRequest('Already in the team');
    db.insert('memberships', { org_id: req.org.id, user_id: user.id, role: body.role || 'member' });
    res.status(201).json({ id: user.id, name: user.name, email, role: body.role || 'member' });
  });

  // ── Notifications ──
  r.get('/notifications', auth, (req, res) => {
    res.json(db.all('SELECT * FROM notifications WHERE user_id = ? AND org_id = ? ORDER BY created_at DESC LIMIT 50', req.user.id, req.org.id));
  });
  r.post('/notifications/read', auth, (req, res) => {
    db.run('UPDATE notifications SET read = 1 WHERE user_id = ? AND org_id = ?', req.user.id, req.org.id);
    res.json({ ok: true });
  });

  // ── Kudos (morale) ──
  r.get('/kudos', auth, (req, res) => {
    res.json(db.all(`SELECT k.*, f.name AS from_name, t.name AS to_name FROM kudos k JOIN users f ON f.id = k.from_user JOIN users t ON t.id = k.to_user WHERE k.org_id = ? ORDER BY k.created_at DESC LIMIT 20`, req.org.id));
  });
  r.post('/kudos', auth, (req, res) => {
    const body = pick(req.body, { to_user: { required: true }, message: { required: true, max: 280 } });
    if (!db.get('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?', req.org.id, body.to_user)) throw badRequest('That person is not in your team');
    const k = { id: id('kdo'), org_id: req.org.id, from_user: req.user.id, to_user: body.to_user, message: body.message, created_at: now() };
    db.insert('kudos', k);
    db.insert('notifications', { id: id('ntf'), org_id: req.org.id, user_id: body.to_user, title: `🙌 Kudos from ${req.user.name}`, body: body.message, link: '#/', read: 0, created_at: now() });
    res.status(201).json(k);
  });

  // ── Dashboard ──
  r.get('/dashboard', auth, (req, res) => {
    const o = req.org.id;
    const one = (sql, ...p) => db.get(sql, o, ...p);
    const projects = db.all('SELECT id, name, kind, current_stage, status FROM funnel_projects WHERE org_id = ? AND status != ? ORDER BY updated_at DESC LIMIT 4', o, 'archived')
      .map((p) => {
        const s = db.get(`SELECT COUNT(*) AS total, SUM(status IN ('done','skipped')) AS done FROM funnel_steps WHERE project_id = ?`, p.id);
        return { ...p, progress: s.total ? Math.round((s.done / s.total) * 100) : 0 };
      });
    const week = new Date(Date.now() - 7 * 86400_000).toISOString();
    const endOfToday = new Date(); endOfToday.setUTCHours(23, 59, 59, 999);
    res.json({
      kpis: {
        pipeline_value: one(`SELECT COALESCE(SUM(value),0) AS v FROM deals WHERE org_id = ? AND stage NOT IN ('won','lost')`).v,
        won_this_month: one(`SELECT COALESCE(SUM(value),0) AS v FROM deals WHERE org_id = ? AND stage = 'won' AND closed_at >= date('now','start of month')`).v,
        new_leads_week: one(`SELECT COUNT(*) AS n FROM contacts WHERE org_id = ? AND created_at >= ?`, week).n,
        tasks_due_today: one(`SELECT COUNT(*) AS n FROM tasks WHERE org_id = ? AND status != 'done' AND due_at <= ?`, endOfToday.toISOString()).n,
        posts_scheduled: one(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE org_id = ? AND status = 'queued'`).n,
        ideas_in_bank: one(`SELECT COUNT(*) AS n FROM content_ideas WHERE org_id = ? AND status IN ('idea','shortlisted','briefed','in_creation')`).n,
        minutes_saved_week: one(`SELECT COALESCE(SUM(minutes_saved),0) AS m FROM automation_runs WHERE org_id = ? AND created_at >= ?`, week).m,
        automations_run_week: one(`SELECT COUNT(*) AS n FROM automation_runs WHERE org_id = ? AND created_at >= ? AND status = 'success'`, week).n,
      },
      projects,
      my_tasks: parseJson(db.all(`SELECT * FROM tasks WHERE org_id = ? AND assignee_id = ? AND status != 'done' ORDER BY (due_at IS NULL), due_at, CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 6`, o, req.user.id), 'checklist'),
      upcoming_posts: db.all(`SELECT p.*, c.platform, c.handle, i.title FROM scheduled_posts p JOIN channels c ON c.id = p.channel_id LEFT JOIN content_ideas i ON i.id = p.idea_id WHERE p.org_id = ? AND p.status = 'queued' ORDER BY p.publish_at LIMIT 5`, o),
      recent_runs: db.all(`SELECT * FROM automation_runs WHERE org_id = ? ORDER BY created_at DESC LIMIT 6`, o),
      wins: [
        ...db.all(`SELECT 'task' AS kind, t.title, u.name AS who, t.completed_at AS at FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.org_id = ? AND t.status = 'done' AND t.completed_at >= ? ORDER BY t.completed_at DESC LIMIT 4`, o, week),
        ...db.all(`SELECT 'deal' AS kind, d.title, u.name AS who, d.closed_at AS at, d.value FROM deals d LEFT JOIN users u ON u.id = d.owner_id WHERE d.org_id = ? AND d.stage = 'won' AND d.closed_at >= ? ORDER BY d.closed_at DESC LIMIT 3`, o, week),
      ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 6),
    });
  });

  return r;
}

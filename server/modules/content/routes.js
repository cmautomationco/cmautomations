import { Router } from 'express';
import { parseJson } from '../../db/index.js';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { badRequest, id, notFound, now, pick } from '../../lib/util.js';
import { FORMAT_LABELS, PLATFORMS } from '../core/niches.js';
import { LESSONS } from './academy.js';
import { aiEnabled, generateIdeasWithAI } from './ai.js';
import { FRAMEWORKS, STAGE_TARGETS, buildBrief, generateIdeas, suggestSlots } from './ideaEngine.js';
import { publishPost } from '../../automation/publishers.js';

const STAGES = ['awareness', 'consideration', 'conversion', 'retention'];

function loadContext(db, org) {
  return {
    org,
    profile: parseJson(db.get('SELECT * FROM brand_profiles WHERE org_id = ?', org.id), 'pains', 'desires', 'offers', 'platforms') || {},
    pillars: db.all('SELECT * FROM content_pillars WHERE org_id = ? ORDER BY created_at', org.id),
    existing: db.all(`SELECT title, funnel_stage FROM content_ideas WHERE org_id = ? AND status != 'archived'`, org.id),
  };
}

function getIdea(db, orgId, ideaId) {
  const idea = parseJson(db.get(`SELECT i.*, p.name AS pillar_name FROM content_ideas i LEFT JOIN content_pillars p ON p.id = i.pillar_id WHERE i.id = ? AND i.org_id = ?`, ideaId, orgId), 'brief');
  if (!idea) throw notFound('Idea');
  return idea;
}

function saveIdea(db, orgId, idea, userId) {
  const ts = now();
  const row = {
    id: id('ida'), org_id: orgId, pillar_id: idea.pillar_id || null, title: idea.title, hook: idea.hook || null,
    angle: idea.angle || null, framework: idea.framework || null, format: idea.format, platform: idea.platform,
    funnel_stage: idea.funnel_stage || 'awareness', score: idea.score ?? 50, status: 'idea', source: idea.source || 'manual',
    brief: idea.brief || null, draft: null, media_url: null, assignee_id: userId || null, created_at: ts, updated_at: ts,
  };
  db.insert('content_ideas', row);
  return row;
}

export function contentRoutes({ db, engine }) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/meta', (_req, res) => {
    res.json({
      ai_enabled: aiEnabled(),
      frameworks: FRAMEWORKS.map(({ key, label, stage }) => ({ key, label, stage })),
      formats: FORMAT_LABELS,
      platforms: PLATFORMS,
      stage_targets: STAGE_TARGETS,
    });
  });

  // ── Strategy: brand profile & pillars ──
  r.get('/profile', (req, res) => {
    res.json(loadContext(db, req.org).profile);
  });

  r.put('/profile', requireRole('owner', 'admin'), (req, res) => {
    const body = pick(req.body, {
      audience: { max: 1000 }, tone: { max: 300 }, pains: { type: 'array' }, desires: { type: 'array' },
      offers: { type: 'array' }, platforms: { type: 'array' }, posts_per_week: { type: 'number' },
    }, { partial: true });
    if (body.platforms) body.platforms = body.platforms.filter((p) => PLATFORMS[p]);
    db.update('brand_profiles', req.org.id, { ...body, updated_at: now() }, 'org_id');
    res.json(loadContext(db, req.org).profile);
  });

  r.get('/pillars', (req, res) => {
    res.json(db.all(`SELECT p.*, (SELECT COUNT(*) FROM content_ideas i WHERE i.pillar_id = p.id AND i.status != 'archived') AS idea_count FROM content_pillars p WHERE p.org_id = ? ORDER BY p.created_at`, req.org.id));
  });
  r.post('/pillars', (req, res) => {
    const body = pick(req.body, { name: { required: true, max: 80 }, description: { max: 300 }, weight: { type: 'number' } });
    const row = { id: id('pil'), org_id: req.org.id, name: body.name, description: body.description || null, weight: body.weight || 1, created_at: now() };
    db.insert('content_pillars', row);
    res.status(201).json(row);
  });
  r.patch('/pillars/:id', (req, res) => {
    if (!db.get('SELECT 1 FROM content_pillars WHERE id = ? AND org_id = ?', req.params.id, req.org.id)) throw notFound('Pillar');
    db.update('content_pillars', req.params.id, pick(req.body, { name: { max: 80 }, description: { max: 300 }, weight: { type: 'number' } }, { partial: true }));
    res.json(db.get('SELECT * FROM content_pillars WHERE id = ?', req.params.id));
  });
  r.delete('/pillars/:id', (req, res) => {
    db.run('DELETE FROM content_pillars WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    res.json({ ok: true });
  });

  // ── Idea Lab ──
  r.get('/ideas', (req, res) => {
    const where = ['i.org_id = ?'];
    const params = [req.org.id];
    if (req.query.status) { where.push('i.status = ?'); params.push(req.query.status); } else { where.push(`i.status != 'archived'`); }
    if (req.query.pillar_id) { where.push('i.pillar_id = ?'); params.push(req.query.pillar_id); }
    if (req.query.funnel_stage) { where.push('i.funnel_stage = ?'); params.push(req.query.funnel_stage); }
    const rows = db.all(`SELECT i.*, p.name AS pillar_name FROM content_ideas i LEFT JOIN content_pillars p ON p.id = i.pillar_id WHERE ${where.join(' AND ')} ORDER BY i.score DESC, i.created_at DESC LIMIT 200`, ...params);
    res.json(parseJson(rows, 'brief'));
  });

  r.post('/ideas/generate', async (req, res) => {
    const body = pick(req.body, {
      count: { type: 'number' }, pillar_id: {}, platform: { enum: Object.keys(PLATFORMS) },
      funnel_stage: { enum: STAGES }, mode: { enum: ['engine', 'ai'] }, seed: {},
    }, { partial: true });
    const ctx = loadContext(db, req.org);
    const options = { count: body.count, pillarId: body.pillar_id, platform: body.platform, funnelStage: body.funnel_stage, seed: body.seed };
    let ideas;
    let mode = 'engine';
    let warning = null;
    if (body.mode === 'ai' && aiEnabled()) {
      try {
        ideas = (await generateIdeasWithAI(ctx, options)).map((idea) => ({ ...idea, brief: buildBrief(idea, ctx) }));
        mode = 'ai';
      } catch (err) {
        warning = `AI generation unavailable (${err.message}); used the built-in idea engine instead.`;
      }
    }
    if (!ideas) ideas = generateIdeas(ctx, options);
    const saved = db.tx(() => ideas.map((idea) => saveIdea(db, req.org.id, idea, req.user.id)));
    engine.logSystemRun(req.org.id, 'Idea generator', 'content.generate', `Generated ${saved.length} ideas (${mode})`, saved.length * 5);
    res.status(201).json({ mode, warning, ideas: saved.map((s) => getIdea(db, req.org.id, s.id)) });
  });

  r.post('/ideas', (req, res) => {
    const body = pick(req.body, {
      title: { required: true, max: 200 }, hook: { max: 300 }, angle: { max: 500 }, pillar_id: {},
      format: { required: true, enum: Object.keys(FORMAT_LABELS) }, platform: { required: true, enum: Object.keys(PLATFORMS) },
      funnel_stage: { enum: STAGES }, framework: { enum: FRAMEWORKS.map((f) => f.key) },
    });
    const ctx = loadContext(db, req.org);
    const idea = { ...body, source: 'manual', score: 60 };
    idea.brief = buildBrief(idea, ctx);
    const row = saveIdea(db, req.org.id, idea, req.user.id);
    res.status(201).json(getIdea(db, req.org.id, row.id));
  });

  r.get('/ideas/:id', (req, res) => {
    const idea = getIdea(db, req.org.id, req.params.id);
    idea.posts = db.all('SELECT p.*, c.platform, c.handle FROM scheduled_posts p JOIN channels c ON c.id = p.channel_id WHERE p.idea_id = ? ORDER BY p.publish_at', idea.id);
    res.json(idea);
  });

  r.patch('/ideas/:id', (req, res) => {
    getIdea(db, req.org.id, req.params.id);
    const patch = pick(req.body, {
      title: { max: 200 }, hook: { max: 300 }, angle: { max: 500 }, pillar_id: {}, draft: { max: 10000 }, media_url: { max: 1000 },
      format: { enum: Object.keys(FORMAT_LABELS) }, platform: { enum: Object.keys(PLATFORMS) }, funnel_stage: { enum: STAGES },
      status: { enum: ['idea', 'shortlisted', 'briefed', 'in_creation', 'archived'] }, assignee_id: {},
    }, { partial: true });
    // Starting to write the draft moves the idea into creation automatically.
    const current = getIdea(db, req.org.id, req.params.id);
    if (patch.draft && !patch.status && ['idea', 'shortlisted', 'briefed'].includes(current.status)) patch.status = 'in_creation';
    db.update('content_ideas', req.params.id, { ...patch, updated_at: now() });
    res.json(getIdea(db, req.org.id, req.params.id));
  });

  r.post('/ideas/:id/brief', (req, res) => {
    const idea = getIdea(db, req.org.id, req.params.id);
    const brief = buildBrief(idea, loadContext(db, req.org));
    db.update('content_ideas', idea.id, { brief, status: ['idea', 'shortlisted'].includes(idea.status) ? 'briefed' : idea.status, updated_at: now() });
    res.json(getIdea(db, req.org.id, idea.id));
  });

  // The client signs off their own version of the content.
  r.post('/ideas/:id/finalise', (req, res) => {
    const idea = getIdea(db, req.org.id, req.params.id);
    const body = pick(req.body, { draft: { max: 10000 }, media_url: { max: 1000 } }, { partial: true });
    const draft = body.draft ?? idea.draft;
    if (!draft || draft.trim().length < 10) throw badRequest('Write your final caption/script before finalising');
    db.update('content_ideas', idea.id, { draft, media_url: body.media_url ?? idea.media_url, status: 'finalised', updated_at: now() });
    const updated = getIdea(db, req.org.id, idea.id);
    const automations = engine.emit(req.org.id, 'content.finalised', { idea: updated }, { actorId: req.user.id });
    res.json({ idea: updated, automations });
  });

  r.post('/ideas/:id/schedule', (req, res) => {
    const idea = getIdea(db, req.org.id, req.params.id);
    if (!['finalised', 'scheduled'].includes(idea.status)) throw badRequest('Finalise the content before scheduling it');
    const body = pick(req.body, { channel_ids: { type: 'array', required: true }, publish_at: { required: true }, caption: { max: 10000 } });
    const when = new Date(body.publish_at);
    if (Number.isNaN(when.getTime())) throw badRequest('publish_at must be a valid date/time');
    const channels = body.channel_ids.map((cid) => db.get('SELECT * FROM channels WHERE id = ? AND org_id = ?', cid, req.org.id));
    if (!channels.length || channels.some((c) => !c)) throw badRequest('Pick at least one valid channel');
    const posts = db.tx(() => channels.map((c) => db.insert('scheduled_posts', {
      id: id('pst'), org_id: req.org.id, idea_id: idea.id, channel_id: c.id, caption: body.caption || idea.draft,
      media_url: idea.media_url, publish_at: when.toISOString(), status: 'queued', attempts: 0, created_at: now(),
    })));
    db.update('content_ideas', idea.id, { status: 'scheduled', updated_at: now() });
    engine.logSystemRun(req.org.id, 'Post scheduler', 'content.scheduled', `Queued “${idea.title}” on ${channels.length} channel(s)`, channels.length * 4);
    res.status(201).json(posts);
  });

  r.get('/stats', (req, res) => {
    const byStage = db.all(`SELECT funnel_stage, COUNT(*) AS n FROM content_ideas WHERE org_id = ? AND status != 'archived' GROUP BY funnel_stage`, req.org.id);
    const byStatus = db.all(`SELECT status, COUNT(*) AS n FROM content_ideas WHERE org_id = ? GROUP BY status`, req.org.id);
    res.json({ by_stage: Object.fromEntries(byStage.map((r) => [r.funnel_stage, r.n])), by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.n])), targets: STAGE_TARGETS });
  });

  // ── Calendar & scheduling ──
  r.get('/calendar', (req, res) => {
    const from = req.query.from || new Date(Date.now() - 31 * 86400_000).toISOString();
    const to = req.query.to || new Date(Date.now() + 62 * 86400_000).toISOString();
    res.json(db.all(`SELECT p.*, c.platform, c.handle, i.title, i.format FROM scheduled_posts p JOIN channels c ON c.id = p.channel_id LEFT JOIN content_ideas i ON i.id = p.idea_id WHERE p.org_id = ? AND p.publish_at BETWEEN ? AND ? AND p.status != 'cancelled' ORDER BY p.publish_at`, req.org.id, from, to));
  });

  r.get('/slots', (req, res) => {
    const profile = loadContext(db, req.org).profile;
    const taken = db.all(`SELECT publish_at FROM scheduled_posts WHERE org_id = ? AND status = 'queued'`, req.org.id).map((p) => p.publish_at);
    res.json(suggestSlots(profile.posts_per_week || 4, taken));
  });

  r.patch('/posts/:id', (req, res) => {
    const post = db.get('SELECT * FROM scheduled_posts WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    if (!post) throw notFound('Post');
    if (post.status === 'published') throw badRequest('This post has already been published');
    const patch = pick(req.body, { caption: { max: 10000 }, publish_at: {}, status: { enum: ['queued', 'cancelled'] } }, { partial: true });
    if (patch.publish_at) patch.publish_at = new Date(patch.publish_at).toISOString();
    db.update('scheduled_posts', post.id, patch);
    res.json(db.get('SELECT * FROM scheduled_posts WHERE id = ?', post.id));
  });

  r.post('/posts/:id/publish-now', async (req, res) => {
    const post = db.get('SELECT * FROM scheduled_posts WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    if (!post) throw notFound('Post');
    if (post.status === 'published') throw badRequest('Already published');
    res.json(await publishPost({ db, engine }, post));
  });

  // ── Channels ──
  r.get('/channels', (req, res) => {
    res.json(parseJson(db.all('SELECT * FROM channels WHERE org_id = ? ORDER BY platform', req.org.id), 'config'));
  });
  r.post('/channels', requireRole('owner', 'admin'), (req, res) => {
    const body = pick(req.body, { platform: { required: true, enum: Object.keys(PLATFORMS) }, handle: { required: true, max: 100 }, adapter: { enum: ['simulated', 'webhook'] }, webhook_url: { max: 500 } });
    if (body.adapter === 'webhook' && !/^https?:\/\//.test(body.webhook_url || '')) throw badRequest('A webhook URL is required for webhook channels');
    const row = { id: id('chn'), org_id: req.org.id, platform: body.platform, handle: body.handle, adapter: body.adapter || 'simulated', config: body.webhook_url ? { webhook_url: body.webhook_url } : {}, active: 1, created_at: now() };
    db.insert('channels', row);
    res.status(201).json(row);
  });
  r.patch('/channels/:id', requireRole('owner', 'admin'), (req, res) => {
    if (!db.get('SELECT 1 FROM channels WHERE id = ? AND org_id = ?', req.params.id, req.org.id)) throw notFound('Channel');
    const body = pick(req.body, { handle: { max: 100 }, active: { type: 'boolean' }, adapter: { enum: ['simulated', 'webhook'] }, webhook_url: { max: 500 } }, { partial: true });
    const { webhook_url, ...patch } = body;
    if (webhook_url !== undefined) patch.config = { webhook_url };
    db.update('channels', req.params.id, patch);
    res.json(parseJson(db.get('SELECT * FROM channels WHERE id = ?', req.params.id), 'config'));
  });
  r.delete('/channels/:id', requireRole('owner', 'admin'), (req, res) => {
    db.run('DELETE FROM channels WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    res.json({ ok: true });
  });

  // ── Creation Academy ──
  r.get('/academy', (_req, res) => res.json(LESSONS));

  return r;
}


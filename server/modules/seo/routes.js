import { Router } from 'express';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { getSetting, setSetting } from '../../lib/settings.js';
import { badRequest, id, notFound, now, pick } from '../../lib/util.js';
import { getNiche } from '../core/niches.js';
import { createTask } from '../tasks/service.js';
import { getBookingSettings } from '../bookings/service.js';
import { getMessagingSettings } from '../messaging/service.js';
import { BASICS, CHANNELS, CHECKLIST, GLOSSARY, PACKAGES, PILLARS, TIMELINE, nicheGuide } from './knowledge.js';

/**
 * SEO: the guide, a checklist that knows what's already done in the system,
 * a keyword planner built from the business's own services and areas, and
 * the SEO packages an agency can offer.
 */

const STATUSES = ['todo', 'doing', 'done', 'skip'];
const WEIGHT = { 3: 'High', 2: 'Medium', 1: 'Low' };

const getSeo = (db, orgId) => getSetting(db, orgId, 'seo', { profile: { location: '', areas: [], services: [] }, items: {}, keywords: [] });
const saveSeo = (db, orgId, seo) => setSetting(db, orgId, 'seo', seo);

/** Jobs the system can tick off by itself, from what's already set up. */
function detections(db, org) {
  const messaging = getMessagingSettings(db, org.id);
  const bookings = getBookingSettings(db, org);
  const services = db.get('SELECT COUNT(*) AS n FROM services WHERE org_id = ? AND active = 1 AND online = 1', org.id).n;
  return {
    booking_page: bookings.enabled !== false && services > 0 ? 'Your booking page is live (Bookings → Copy booking link).' : null,
    review_link: messaging.review_link ? 'Your Google review link is saved.' : null,
    review_request: bookings.review_request && messaging.review_link ? 'Review requests go out after every job (Automations → Essentials).' : null,
    lead_source: messaging.tag_lead_source ? 'Every new lead is tagged with its source (Automations → Essentials).' : null,
  };
}

function checklistFor(db, org, seo, local) {
  const found = detections(db, org);
  return CHECKLIST.filter((c) => local || !c.local).map((c) => {
    const saved = seo.items[c.key] || {};
    const detected = c.detect ? found[c.detect] : null;
    return {
      ...c, impact_label: WEIGHT[c.impact], pillar_title: PILLARS.find((p) => p.key === c.pillar).title,
      status: detected && saved.status !== 'skip' ? 'done' : saved.status || 'todo', detected: detected || null, note: saved.note || '', updated_at: saved.updated_at || null,
    };
  });
}

function scoreOf(items) {
  const counted = items.filter((i) => i.status !== 'skip');
  const total = counted.reduce((t, i) => t + i.impact, 0) || 1;
  const done = counted.filter((i) => i.status === 'done').reduce((t, i) => t + i.impact, 0);
  const doing = counted.filter((i) => i.status === 'doing').reduce((t, i) => t + i.impact, 0);
  const byPillar = PILLARS.map((p) => {
    const list = counted.filter((i) => i.pillar === p.key);
    return { key: p.key, title: p.title, done: list.filter((i) => i.status === 'done').length, total: list.length };
  }).filter((p) => p.total);
  return { pct: Math.round(((done + doing / 2) / total) * 100), done: counted.filter((i) => i.status === 'done').length, total: counted.length, byPillar };
}

/** The most valuable jobs not done yet, in the order that matters most for this kind of business. */
function nextSteps(items, guide, count = 5) {
  const order = (pillar) => guide.priorities.indexOf(pillar);
  return items.filter((i) => i.status === 'todo' || i.status === 'doing')
    .sort((a, b) => b.impact - a.impact || order(a.pillar) - order(b.pillar) || (a.effort === 'Quick' ? -1 : 0) - (b.effort === 'Quick' ? -1 : 0))
    .slice(0, count);
}

const cap = (s) => String(s || '').replace(/^\w/, (c) => c.toUpperCase());
const tidyList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 12);

/**
 * Keyword ideas from the business's services and areas, grouped by what the
 * searcher wants. (No search volumes here – check those free in Google Search
 * Console or Keyword Planner.)
 */
export function keywordIdeas({ guide, services, location, areas }) {
  const out = [];
  const add = (phrase, intent, page, priority, why) => {
    const p = phrase.replace(/\s+/g, ' ').trim().toLowerCase();
    if (p && !out.some((k) => k.phrase === p)) out.push({ phrase: p, intent, page, priority, why });
  };
  const loc = String(location || '').trim();
  const places = [loc, ...areas].filter(Boolean);
  const urgentNiches = ['plumber', 'electrician', 'tradesperson'];
  for (const raw of services.slice(0, 8)) {
    const s = raw.toLowerCase();
    const servicePage = `Service page: ${cap(raw)}`;
    if (guide.local) {
      add(`${s} near me`, 'ready', 'Google Business Profile + ' + servicePage, 'High', 'People ready to book nearby – mostly won in the map results.');
      for (const place of places.slice(0, 4)) add(`${s} ${place}`, 'ready', place === loc ? servicePage : `Location page: ${cap(place)}`, place === loc ? 'High' : 'Medium', 'Ready to buy in a named place.');
      if (urgentNiches.includes(guide.provider) || /emergency|repair|leak|call.?out/.test(s)) {
        const base = s.replace(/^(emergency|urgent|same day)\s+/, '');
        add(`emergency ${base}${loc ? ` ${loc}` : ''}`, 'urgent', 'Google Business Profile + ' + servicePage, 'High', 'Urgent – they’ll call the first trustworthy result.');
        add(`same day ${base}${loc ? ` ${loc}` : ''}`, 'urgent', servicePage, 'Medium', 'Urgent, and often willing to pay more.');
        add(`24 hour ${base}${loc ? ` ${loc}` : ''}`, 'urgent', 'Google Business Profile + ' + servicePage, 'Medium', 'Out-of-hours – only target it if you really answer at night.');
      }
    } else {
      add(s, 'ready', servicePage, 'High', 'Your core service, as people search for it.');
      add(`${s} online`, 'ready', servicePage, 'Medium', 'Ready to buy, happy to work remotely.');
      add(`${s} uk`, 'ready', servicePage, 'Medium', 'Ready to buy, looking for a UK provider.');
      if (loc) add(`${s} ${loc}`, 'ready', servicePage, 'Medium', 'Some people prefer someone local even for online services.');
    }
    add(`${s} cost${loc && guide.local ? ` ${loc}` : ''}`, 'compare', `${servicePage} (add a price guide)`, 'High', 'Comparing prices – a clear price guide wins these.');
    add(`best ${guide.local && loc ? `${s} ${loc}` : s}`, 'compare', `${servicePage} (reviews and proof)`, 'Medium', 'Comparing options – reviews and examples decide.');
    add(`how much does ${s} cost`, 'learn', 'Blog post or FAQ', 'Medium', 'Researching – answer honestly with real price ranges.');
  }
  if (guide.local && loc) add(`${guide.providerShort} ${loc}`, 'ready', 'Home page + Google Business Profile', 'High', 'The main search for your trade in your town.');
  if (guide.local) add(`${guide.providerShort} near me`, 'ready', 'Google Business Profile', 'High', 'Won almost entirely in the map results.');
  // Templates like “[product] care guide” are ideas to fill in, not searches to track.
  for (const idea of guide.content.map((c) => fillPlace(c, loc)).filter((c) => !c.includes('['))) add(idea.replace(/\?$/, ''), 'learn', 'Blog post', 'Low', 'A question customers ask before they buy.');
  return out;
}

const fillPlace = (text, place) => text.replace(/\[area\]|\[town\]/gi, place || 'your area').replace(/\[year\]/gi, String(new Date().getFullYear()));

const INTENTS = { urgent: 'Urgent – need it now', ready: 'Ready to buy', compare: 'Comparing options', learn: 'Researching' };

export function seoRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));
  const admin = requireRole('owner', 'admin');

  const state = (req) => {
    const org = req.org;
    const seo = getSeo(db, org.id);
    const guide = nicheGuide(org.niche);
    const local = guide.local || Boolean(seo.profile.local);
    const items = checklistFor(db, org, seo, local);
    const services = seo.profile.services?.length ? seo.profile.services
      : db.all('SELECT name FROM services WHERE org_id = ? AND active = 1 ORDER BY name LIMIT 6', org.id).map((s) => s.name.toLowerCase());
    return { org, seo, guide, local, items, services: services.length ? services : guide.services };
  };

  r.get('/', (req, res) => {
    const { org, seo, guide, local, items, services } = state(req);
    res.json({
      business: org.name, niche: { key: org.niche, label: getNiche(org.niche).label }, local,
      profile: { location: seo.profile.location || '', areas: seo.profile.areas || [], services },
      guide: {
        ...guide,
        // Content ideas use the business's own town (or “your area” until it's set).
        content: guide.content.map((c) => fillPlace(c, seo.profile.location)), quickWins: guide.quickWins.map((c) => fillPlace(c, seo.profile.location)),
        priorities: guide.priorities.map((k) => PILLARS.find((p) => p.key === k)).map(({ key, title, short }) => ({ key, title, short })),
      },
      score: scoreOf(items), next: nextSteps(items, guide), checklist: items,
      keywords: seo.keywords || [], intents: INTENTS,
      learn: { basics: BASICS, pillars: PILLARS, timeline: TIMELINE, channels: CHANNELS, glossary: GLOSSARY }, packages: PACKAGES,
    });
  });

  r.put('/profile', admin, (req, res) => {
    const body = pick(req.body, { location: { max: 80 }, areas: {}, services: {}, local: { type: 'boolean' } }, { partial: true });
    const seo = getSeo(db, req.org.id);
    seo.profile = {
      ...seo.profile,
      ...(body.location !== undefined ? { location: String(body.location || '').trim() } : {}),
      ...(body.areas !== undefined ? { areas: tidyList(body.areas) } : {}),
      ...(body.services !== undefined ? { services: tidyList(body.services).map((s) => s.toLowerCase()) } : {}),
      ...(body.local !== undefined ? { local: body.local } : {}),
    };
    saveSeo(db, req.org.id, seo);
    res.json(seo.profile);
  });

  r.put('/items/:key', (req, res) => {
    const item = CHECKLIST.find((c) => c.key === req.params.key);
    if (!item) throw notFound('Checklist item');
    const body = pick(req.body, { status: { enum: STATUSES }, note: { max: 1000 } }, { partial: true });
    const seo = getSeo(db, req.org.id);
    seo.items[item.key] = { ...(seo.items[item.key] || {}), ...body, updated_at: now() };
    saveSeo(db, req.org.id, seo);
    const s = state(req);
    res.json({ item: s.items.find((i) => i.key === item.key), score: scoreOf(s.items), next: nextSteps(s.items, s.guide) });
  });

  const taskFor = (req, item) => {
    const existing = db.get(`SELECT * FROM tasks WHERE org_id = ? AND source_ref = ? AND status != 'done'`, req.org.id, `seo:${item.key}`);
    if (existing) return { task: existing, existing: true };
    const pillar = PILLARS.find((p) => p.key === item.pillar);
    const task = createTask(ctx, req.org.id, {
      title: `SEO: ${item.title}`, description: `${item.how}\n\nWhy: ${pillar.why}\n\n(From SEO → Checklist – tick it off there when it’s done.)`,
      priority: item.impact === 3 ? 'high' : 'medium', due_at: new Date(Date.now() + (item.effort === 'Quick' ? 3 : 7) * 86400_000).toISOString(),
      assignee_id: req.user.id, source: 'automation', source_ref: `seo:${item.key}`,
    }, { actorId: req.user.id });
    const seo = getSeo(db, req.org.id);
    if (!seo.items[item.key]?.status || seo.items[item.key].status === 'todo') { seo.items[item.key] = { ...(seo.items[item.key] || {}), status: 'doing', updated_at: now() }; saveSeo(db, req.org.id, seo); }
    return { task, existing: false };
  };

  r.post('/items/:key/task', (req, res) => {
    const item = CHECKLIST.find((c) => c.key === req.params.key);
    if (!item) throw notFound('Checklist item');
    res.status(201).json(taskFor(req, item));
  });

  /** Turns the next most valuable jobs into tasks. */
  r.post('/plan', (req, res) => {
    const count = Math.min(10, Math.max(1, Number(req.body?.count) || 5));
    const s = state(req);
    const made = nextSteps(s.items, s.guide, count).map((i) => taskFor(req, CHECKLIST.find((c) => c.key === i.key)));
    res.status(201).json({ created: made.filter((m) => !m.existing).length, tasks: made.map((m) => m.task) });
  });

  // ── Keywords ──
  r.post('/keywords/ideas', (req, res) => {
    const s = state(req);
    const body = req.body || {};
    const services = body.services !== undefined ? tidyList(body.services) : s.services;
    const location = body.location !== undefined ? String(body.location).trim() : s.seo.profile.location || '';
    const areas = body.areas !== undefined ? tidyList(body.areas) : s.seo.profile.areas || [];
    if (!services.length) throw badRequest('Add at least one service');
    const tracked = new Set((s.seo.keywords || []).map((k) => k.phrase));
    res.json(keywordIdeas({ guide: { ...s.guide, local: s.local }, services, location, areas }).map((k) => ({ ...k, intent_label: INTENTS[k.intent], tracked: tracked.has(k.phrase) })));
  });

  r.post('/keywords', (req, res) => {
    const list = Array.isArray(req.body?.keywords) ? req.body.keywords : [];
    if (!list.length) throw badRequest('Send { keywords: [{ phrase, intent, page }] }');
    const seo = getSeo(db, req.org.id);
    seo.keywords = seo.keywords || [];
    let added = 0;
    for (const k of list.slice(0, 100)) {
      const phrase = String(k.phrase || '').trim().toLowerCase().slice(0, 120);
      if (!phrase || seo.keywords.some((x) => x.phrase === phrase)) continue;
      seo.keywords.push({ id: id('kw'), phrase, intent: INTENTS[k.intent] ? k.intent : 'ready', page: String(k.page || '').slice(0, 160), position: null, previous: null, history: [], added_at: now() });
      added++;
    }
    if (seo.keywords.length > 300) throw badRequest('Track at most 300 searches');
    saveSeo(db, req.org.id, seo);
    res.status(201).json({ added, keywords: seo.keywords });
  });

  r.patch('/keywords/:id', (req, res) => {
    const seo = getSeo(db, req.org.id);
    const k = (seo.keywords || []).find((x) => x.id === req.params.id);
    if (!k) throw notFound('Keyword');
    const body = pick(req.body, { position: {}, page: { max: 160 } }, { partial: true });
    if (body.position !== undefined) {
      const pos = body.position === null || body.position === '' ? null : Math.round(Number(body.position));
      if (pos !== null && !(pos >= 1 && pos <= 100)) throw badRequest('Position must be between 1 and 100 (or blank if not in the top 100)');
      if (pos !== k.position) {
        k.previous = k.position;
        k.position = pos;
        k.history = [...(k.history || []), { date: now().slice(0, 10), position: pos }].slice(-24);
      }
    }
    if (body.page !== undefined) k.page = body.page || '';
    saveSeo(db, req.org.id, seo);
    res.json(k);
  });

  r.delete('/keywords/:id', (req, res) => {
    const seo = getSeo(db, req.org.id);
    const before = (seo.keywords || []).length;
    seo.keywords = (seo.keywords || []).filter((x) => x.id !== req.params.id);
    if (seo.keywords.length === before) throw notFound('Keyword');
    saveSeo(db, req.org.id, seo);
    res.json({ ok: true });
  });

  return r;
}

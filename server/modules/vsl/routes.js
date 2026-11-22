import crypto from 'node:crypto';
import { Router } from 'express';
import { parseJson } from '../../db/index.js';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { publicLink } from '../../lib/links.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { HttpError, badRequest, id, now, pick, publicToken } from '../../lib/util.js';
import { businessCard } from '../public/routes.js';
import * as F from './foundation.js';
import { FORMATS } from './formats.js';
import { PACKS, packGaps } from './niches.js';
import { checklistFor } from './proof.js';
import { shotList, toSrt, toText } from './builder.js';
import {
  DEFAULT_PACK, buildFor, cleanNumbers, cleanScreenshots, cleanVariants, getPage, getProof, getProofs, getScript, listPacks, loadPack,
  makeSlug, packKeyFrom, pageStats, parseHook, pickVariant, recordEvent, scriptSummary,
} from './service.js';

const pageLink = (slug, token = null) => publicLink(`vsl/${slug}${token ? `/${token}` : ''}`);
const FORMAT_KEYS = Object.keys(FORMATS);
const SCRIPT_STATUSES = ['draft', 'ready', 'filmed', 'live'];
const PAGE_STATUSES = ['draft', 'live', 'paused'];
const httpUrl = (v, field) => {
  if (v === null || v === undefined || v === '') return v === undefined ? undefined : null;
  const s = String(v).trim();
  if (!/^https?:\/\//i.test(s)) throw badRequest(`${field} must start with http(s)://`);
  return s.slice(0, 500);
};

/** VSL: the foundation, niche packs, proof, scripts, pages and prospect links. */
export function vslRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));
  const admin = requireRole('owner', 'admin');

  // ── The foundation ──
  r.get('/foundation', (req, res) => {
    res.json({
      version: F.FOUNDATION_VERSION, principle: F.RESULT_CHAIN, offer: F.OFFER, sections: F.SECTIONS, total_seconds: F.TOTAL_SECONDS,
      honesty_rules: F.HONESTY_RULES, proof_plan: F.PROOF_PLAN, proof_checklist: F.PROOF_CHECKLIST, page: F.PAGE, open_decisions: F.OPEN_DECISIONS,
      formats: Object.entries(FORMATS).map(([key, f]) => ({ key, label: f.label, status: f.status, summary: f.summary, directions: f.directions })),
      niches: listPacks(db, req.org.id), default_niche: DEFAULT_PACK,
    });
  });

  // ── Niche packs ──
  r.get('/niches', (req, res) => res.json(listPacks(db, req.org.id)));
  r.get('/niches/:key', (req, res) => {
    const pack = loadPack(db, req.org.id, req.params.key);
    res.json({ key: req.params.key, ...pack, gaps: packGaps(pack) });
  });

  /** A new niche: start from a built-in pack (or the clinic v1) and change what's different. */
  r.post('/niches', admin, (req, res) => {
    const body = pick(req.body, { label: { required: true, max: 80 }, based_on: { max: 60 }, key: { max: 40 }, data: { type: 'object' } });
    const basedOn = body.based_on || DEFAULT_PACK;
    if (!PACKS[basedOn]) throw badRequest(`based_on must be one of: ${Object.keys(PACKS).join(', ')}`);
    const key = packKeyFrom(body.key || body.label);
    if (PACKS[key] || db.get('SELECT 1 FROM vsl_packs WHERE org_id = ? AND key = ?', req.org.id, key)) throw badRequest(`A niche called “${key}” already exists`);
    const data = cleanPackData(body.data || {});
    const ts = now();
    db.insert('vsl_packs', { id: id('vpack'), org_id: req.org.id, key, label: body.label, based_on: basedOn, data, created_at: ts, updated_at: ts });
    const pack = loadPack(db, req.org.id, key);
    res.status(201).json({ key, ...pack, gaps: packGaps(pack) });
  });

  r.put('/niches/:key', admin, (req, res) => {
    if (PACKS[req.params.key]) throw badRequest('Built-in packs can’t be changed here. Make a new niche based on it instead.');
    const row = parseJson(db.get('SELECT * FROM vsl_packs WHERE org_id = ? AND key = ?', req.org.id, req.params.key), 'data');
    if (!row) throw new HttpError(404, 'Niche pack not found');
    const body = pick(req.body, { label: { max: 80 }, data: { type: 'object' } }, { partial: true });
    const data = body.data ? mergePack(row.data, cleanPackData(body.data)) : row.data;
    db.update('vsl_packs', row.id, { label: body.label || row.label, data, updated_at: now() });
    const pack = loadPack(db, req.org.id, req.params.key);
    res.json({ key: req.params.key, ...pack, gaps: packGaps(pack) });
  });

  r.delete('/niches/:key', admin, (req, res) => {
    if (PACKS[req.params.key]) throw badRequest('Built-in packs can’t be deleted');
    const used = db.get('SELECT COUNT(*) AS n FROM vsl_scripts WHERE org_id = ? AND niche_key = ?', req.org.id, req.params.key).n;
    if (used) throw badRequest(`${used} script${used === 1 ? ' uses' : 's use'} this niche. Change or delete ${used === 1 ? 'it' : 'them'} first.`);
    db.run('DELETE FROM vsl_packs WHERE org_id = ? AND key = ?', req.org.id, req.params.key);
    res.json({ ok: true });
  });

  // ── Proof ──
  const proofSchema = {
    business_name: { required: true, max: 120 }, short_name: { max: 80 }, owner_name: { max: 80 }, kind: { max: 60 },
    paid: { type: 'boolean' }, front_door: { max: 160 }, period_start: { max: 30 }, period_end: { max: 30 }, period_label: { max: 80 },
    numbers: { type: 'object' }, value_basis: { max: 400 }, quote: { max: 600 }, clip_url: { max: 500 }, clip_seconds: { type: 'number' },
    screenshots: { type: 'array' }, permission: { type: 'boolean' }, use_in_vsl: { type: 'boolean' }, line_override: { max: 400 },
  };
  const proofRow = (body) => {
    const row = { ...body };
    if ('numbers' in body) row.numbers = cleanNumbers(body.numbers || {});
    if ('screenshots' in body) row.screenshots = cleanScreenshots(body.screenshots || []);
    if ('clip_url' in body) row.clip_url = httpUrl(body.clip_url, 'clip_url');
    for (const d of ['period_start', 'period_end']) if (body[d] && Number.isNaN(new Date(body[d]).getTime())) throw badRequest(`${d} must be a date (YYYY-MM-DD)`);
    // Untouched in a partial update; null means "not answered yet" (it decides "client" vs "business I've built this for").
    if ('paid' in body) row.paid = body.paid === null ? null : body.paid ? 1 : 0;
    return row;
  };
  const withChecklist = (p) => ({ ...p, checklist: checklistFor(p) });

  r.get('/proof', (req, res) => res.json({ proofs: getProofs(db, req.org.id).map(withChecklist), checklist: F.PROOF_CHECKLIST, rules: F.HONESTY_RULES, plan: F.PROOF_PLAN }));
  r.post('/proof', admin, (req, res) => {
    const body = pick(req.body, proofSchema);
    const ts = now();
    const row = { id: id('vprf'), org_id: req.org.id, numbers: {}, screenshots: [], permission: 0, use_in_vsl: 1, ...proofRow(body), created_at: ts, updated_at: ts };
    if (!('paid' in body)) row.paid = null;
    db.insert('vsl_proofs', row);
    res.status(201).json(withChecklist(getProof(db, req.org.id, row.id)));
  });
  r.put('/proof/:id', admin, (req, res) => {
    const p = getProof(db, req.org.id, req.params.id);
    const body = pick(req.body, proofSchema, { partial: true });
    for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
    const patch = proofRow(body);
    if (patch.numbers) patch.numbers = { ...p.numbers, ...patch.numbers };
    db.update('vsl_proofs', p.id, { ...patch, updated_at: now() });
    res.json(withChecklist(getProof(db, req.org.id, p.id)));
  });
  r.delete('/proof/:id', admin, (req, res) => {
    getProof(db, req.org.id, req.params.id);
    db.run('DELETE FROM vsl_proofs WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    res.json({ ok: true });
  });

  // ── Scripts ──
  const scriptSchema = {
    name: { max: 120 }, niche_key: { max: 60 }, format: { enum: FORMAT_KEYS }, hook: {}, vars: { type: 'object' }, overrides: { type: 'object' },
    proof_ids: { type: 'array' }, status: { enum: SCRIPT_STATUSES }, video_url: { max: 500 }, notes: { max: 4000 },
  };
  const cleanHook = (h) => {
    if (h === undefined) return undefined;
    if (typeof h === 'number' || /^\d+$/.test(String(h))) return String(Number(h));
    const s = String(h).trim();
    if (!s) return '0';
    if (s.length > 300) throw badRequest('hook is too long');
    return s;
  };
  const cleanStrings = (obj, field, max = 600) => {
    if (obj === undefined) return undefined;
    const out = {};
    for (const [k, v] of Object.entries(obj || {}).slice(0, 60)) {
      if (v === null || v === '') continue;
      if (typeof v !== 'string') throw badRequest(`${field}.${k} must be text`);
      out[String(k).slice(0, 80)] = v.slice(0, max);
    }
    return out;
  };

  r.get('/scripts', (req, res) => {
    const rows = parseJson(db.all('SELECT * FROM vsl_scripts WHERE org_id = ? ORDER BY created_at DESC', req.org.id), 'vars', 'overrides', 'proof_ids');
    res.json(rows.map((s) => scriptSummary(db, req.org.id, { ...s, hook: parseHook(s.hook) })));
  });

  r.post('/scripts', admin, (req, res) => {
    const body = pick(req.body, scriptSchema);
    const nicheKey = body.niche_key || DEFAULT_PACK;
    loadPack(db, req.org.id, nicheKey);
    if (body.status && body.status !== 'draft') throw badRequest('New scripts start as drafts');
    const ts = now();
    const row = {
      id: id('vscr'), org_id: req.org.id, name: body.name || `${loadPack(db, req.org.id, nicheKey).label} VSL (${FORMATS[body.format || 'faceless'].label})`,
      niche_key: nicheKey, format: body.format || 'faceless', hook: cleanHook(body.hook) ?? '0', vars: cleanStrings(body.vars, 'vars', 120) || {}, overrides: cleanStrings(body.overrides, 'overrides') || {},
      proof_ids: body.proof_ids || null, status: 'draft', video_url: httpUrl(body.video_url, 'video_url') || null, notes: body.notes || null, created_by: req.user.id, created_at: ts, updated_at: ts,
    };
    db.insert('vsl_scripts', row);
    const s = getScript(db, req.org.id, row.id);
    res.status(201).json({ ...s, built: buildFor(db, req.org.id, s) });
  });

  r.get('/scripts/:id', (req, res) => {
    const s = getScript(db, req.org.id, req.params.id);
    res.json({ ...s, built: buildFor(db, req.org.id, s) });
  });

  r.put('/scripts/:id', admin, (req, res) => {
    const s = getScript(db, req.org.id, req.params.id);
    const body = pick(req.body, scriptSchema, { partial: true });
    const patch = {};
    for (const k of ['name', 'format', 'notes', 'proof_ids']) if (body[k] !== undefined) patch[k] = body[k];
    if (body.niche_key) { loadPack(db, req.org.id, body.niche_key); patch.niche_key = body.niche_key; }
    if (req.body?.hook !== undefined) patch.hook = cleanHook(req.body.hook);
    if (body.vars !== undefined) patch.vars = cleanStrings(body.vars, 'vars', 120);
    // Overrides merge line by line; send a line as null to put the foundation's wording back.
    if (req.body?.overrides !== undefined) {
      const merged = { ...s.overrides };
      for (const [k, v] of Object.entries(req.body.overrides || {})) if (v === null || v === '') delete merged[k];
      patch.overrides = { ...merged, ...cleanStrings(req.body.overrides, 'overrides') };
    }
    if (body.video_url !== undefined) patch.video_url = httpUrl(body.video_url, 'video_url');
    if (body.status && body.status !== s.status) {
      const next = { ...s, ...patch };
      const built = buildFor(db, req.org.id, next);
      if (body.status !== 'draft' && !built.checks.ready) throw badRequest('Fix these before it leaves draft', built.checks.errors.map((e) => e.text));
      if (['filmed', 'live'].includes(body.status) && !next.video_url) throw badRequest('Add the video_url of the finished video first');
      patch.status = body.status;
    }
    db.update('vsl_scripts', s.id, { ...patch, updated_at: now() });
    const out = getScript(db, req.org.id, s.id);
    res.json({ ...out, built: buildFor(db, req.org.id, out) });
  });

  /** A copy for another format (voiceover, on camera), another hook to test, or another niche. */
  r.post('/scripts/:id/copy', admin, (req, res) => {
    const s = getScript(db, req.org.id, req.params.id);
    const body = pick(req.body, { name: { max: 120 }, format: { enum: FORMAT_KEYS }, niche_key: { max: 60 }, hook: {}, keep_overrides: { type: 'boolean' } });
    const nicheKey = body.niche_key || s.niche_key;
    loadPack(db, req.org.id, nicheKey);
    const sameNiche = nicheKey === s.niche_key;
    const format = body.format || s.format;
    const ts = now();
    const row = {
      id: id('vscr'), org_id: req.org.id, name: body.name || `${s.name} (${sameNiche ? FORMATS[format].label : loadPack(db, req.org.id, nicheKey).label})`,
      niche_key: nicheKey, format, hook: cleanHook(req.body?.hook) ?? (sameNiche ? String(s.hook) : '0'),
      vars: sameNiche ? s.vars : {}, overrides: sameNiche && body.keep_overrides !== false ? s.overrides : {}, proof_ids: s.proof_ids,
      status: 'draft', video_url: null, notes: s.notes, parent_id: s.id, created_by: req.user.id, created_at: ts, updated_at: ts,
    };
    db.insert('vsl_scripts', row);
    const out = getScript(db, req.org.id, row.id);
    res.status(201).json({ ...out, built: buildFor(db, req.org.id, out) });
  });

  /** Exports: ?as=text (teleprompter / edit doc), srt (captions or faceless cards), shots (shot list). */
  r.get('/scripts/:id/export', (req, res) => {
    const s = getScript(db, req.org.id, req.params.id);
    const built = buildFor(db, req.org.id, s);
    const as = String(req.query.as || 'text');
    const file = s.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'vsl';
    if (as === 'srt') return res.json({ filename: `${file}.srt`, content: toSrt(built.cards) });
    if (as === 'shots') return res.json({ filename: `${file}-shots.json`, shots: shotList(built) });
    if (as === 'text') return res.json({ filename: `${file}.txt`, content: toText(built, s.name) });
    throw badRequest('as must be text, srt or shots');
  });

  r.delete('/scripts/:id', admin, (req, res) => {
    getScript(db, req.org.id, req.params.id);
    const onPage = db.all('SELECT name, variants FROM vsl_pages WHERE org_id = ?', req.org.id).filter((p) => JSON.parse(p.variants).some((v) => v.script_id === req.params.id));
    if (onPage.length) throw badRequest(`This script is on ${onPage.map((p) => `“${p.name}”`).join(', ')}. Take it off first.`);
    db.run('DELETE FROM vsl_scripts WHERE id = ? AND org_id = ?', req.params.id, req.org.id);
    res.json({ ok: true });
  });

  // ── Pages ──
  const pageSchema = {
    name: { max: 120 }, headline: { max: 200 }, variants: { type: 'array' }, button_text: { max: 60 },
    breakdown_video_url: { max: 500 }, breakdown_cta: { type: 'object' }, status: { enum: PAGE_STATUSES },
  };
  const cleanCta = (c) => {
    if (c === undefined) return undefined;
    if (c === null) return null;
    const kind = String(c.kind || '');
    if (!['book_call', 'link', 'reply'].includes(kind)) throw badRequest('breakdown_cta.kind must be book_call, link or reply');
    const url = c.url ? httpUrl(c.url, 'breakdown_cta.url') : null;
    if (kind !== 'reply' && !url) throw badRequest('breakdown_cta.url is needed (your booking link or page)');
    return { kind, label: String(c.label || (kind === 'book_call' ? 'Book a call' : 'Get in touch')).slice(0, 60), url };
  };
  const pageOut = (p) => ({ ...p, link: pageLink(p.slug), button_matches_cta: !p.button_text || p.button_text === F.PAGE.button_text });

  r.get('/pages', (req, res) => {
    const pages = parseJson(db.all('SELECT * FROM vsl_pages WHERE org_id = ? ORDER BY created_at DESC', req.org.id), 'variants', 'breakdown_cta');
    res.json(pages.map((p) => ({ ...pageOut(p), stats: pageStats(db, p) })));
  });

  r.post('/pages', admin, (req, res) => {
    const body = pick(req.body, { ...pageSchema, name: { required: true, max: 120 }, variants: { type: 'array', required: true } });
    const variants = cleanVariants(db, req.org.id, body.variants);
    if (body.status === 'live') throw badRequest('Save the page first, then put it live');
    const ts = now();
    const row = {
      id: id('vpage'), org_id: req.org.id, slug: makeSlug(db, body.name), name: body.name, headline: body.headline || null, variants,
      button_text: body.button_text || F.PAGE.button_text, breakdown_video_url: httpUrl(body.breakdown_video_url, 'breakdown_video_url') || null,
      breakdown_cta: cleanCta(body.breakdown_cta) || null, status: 'draft', created_at: ts, updated_at: ts,
    };
    db.insert('vsl_pages', row);
    res.status(201).json(pageOut(getPage(db, 'id', row.id)));
  });

  const ownPage = (req) => {
    const p = getPage(db, 'id', req.params.id);
    if (p.org_id !== req.org.id) throw new HttpError(404, 'Page not found');
    return p;
  };

  r.get('/pages/:id', (req, res) => {
    const p = ownPage(req);
    const shares = db.all('SELECT * FROM vsl_shares WHERE page_id = ? ORDER BY created_at DESC', p.id);
    res.json({ ...pageOut(p), stats: pageStats(db, p), shares: shares.map((s) => shareOut(db, p, s)) });
  });

  r.put('/pages/:id', admin, (req, res) => {
    const p = ownPage(req);
    const body = pick(req.body, pageSchema, { partial: true });
    const patch = {};
    for (const k of ['name', 'headline', 'button_text']) if (body[k] !== undefined) patch[k] = body[k];
    if (body.variants) patch.variants = cleanVariants(db, req.org.id, body.variants);
    if (body.breakdown_video_url !== undefined) patch.breakdown_video_url = httpUrl(body.breakdown_video_url, 'breakdown_video_url');
    if (req.body?.breakdown_cta !== undefined) patch.breakdown_cta = cleanCta(req.body.breakdown_cta);
    if (body.status === 'live') {
      const next = { ...p, ...patch };
      const problems = [];
      for (const v of next.variants) {
        if (!v.video_url) problems.push(`Variant ${v.key}: add the video_url`);
        const s = db.get('SELECT * FROM vsl_scripts WHERE id = ?', v.script_id);
        if (s && s.status === 'draft') problems.push(`Variant ${v.key}: “${s.name}” is still a draft. Clear its checks first.`);
      }
      if (!next.breakdown_video_url) problems.push('Add the breakdown video (it goes right under the VSL)');
      if (problems.length) throw badRequest('Not ready to go live', problems);
    }
    if (body.status) patch.status = body.status;
    db.update('vsl_pages', p.id, { ...patch, updated_at: now() });
    res.json(pageOut(getPage(db, 'id', p.id)));
  });

  r.get('/pages/:id/stats', (req, res) => res.json(pageStats(db, ownPage(req))));

  r.delete('/pages/:id', admin, (req, res) => {
    const p = ownPage(req);
    db.run('DELETE FROM vsl_pages WHERE id = ?', p.id);
    res.json({ ok: true });
  });

  // ── Prospect links ──
  /** A personal link for one brand, business or creator you're reaching out to. */
  r.post('/pages/:id/shares', admin, (req, res) => {
    const p = ownPage(req);
    const body = pick(req.body, { label: { max: 120 }, contact_id: { max: 60 }, variant_key: { max: 1 } });
    let contact = null;
    if (body.contact_id) {
      contact = db.get('SELECT id, first_name, last_name, company FROM contacts WHERE id = ? AND org_id = ?', body.contact_id, req.org.id);
      if (!contact) throw badRequest('Contact not found');
    }
    if (body.variant_key && !p.variants.some((v) => v.key === body.variant_key)) throw badRequest('variant_key isn’t on this page');
    const label = body.label || (contact ? contact.company || [contact.first_name, contact.last_name].filter(Boolean).join(' ') : null);
    if (!label) throw badRequest('Give the link a label (who it’s for) or a contact_id');
    const row = { id: id('vshr'), org_id: req.org.id, page_id: p.id, token: publicToken().slice(0, 16), label, contact_id: contact?.id || null, variant_key: body.variant_key || null, created_by: req.user.id, created_at: now() };
    db.insert('vsl_shares', row);
    res.status(201).json(shareOut(db, p, row));
  });

  r.delete('/pages/:id/shares/:shareId', admin, (req, res) => {
    const p = ownPage(req);
    db.run('DELETE FROM vsl_shares WHERE id = ? AND page_id = ?', req.params.shareId, p.id);
    res.json({ ok: true });
  });

  return r;
}

function shareOut(db, page, s) {
  const views = db.all('SELECT * FROM vsl_views WHERE share_id = ?', s.id);
  const best = views.reduce((m, v) => Math.max(m, v.max_seconds), 0);
  return {
    ...s, link: pageLink(page.slug, s.token), opened: Boolean(s.first_viewed_at), clicked: Boolean(s.clicked_at),
    watched_seconds: best, watched_to: best ? F.sectionAt(best).title : null,
    breakdown_completed: views.some((v) => v.breakdown_completed_at), booked: views.some((v) => v.booked_at),
  };
}

/** The page as a visitor sees it, and what they do on it. No sign-in. */
export function vslPublicRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  const visible = (slug) => {
    const p = getPage(db, 'slug', String(slug));
    if (p.status === 'paused') throw new HttpError(404, 'Page not found');
    return p;
  };
  const shareFor = (page, token) => (token ? db.get('SELECT * FROM vsl_shares WHERE token = ? AND page_id = ?', String(token).slice(0, 40), page.id) : null);
  const cleanVisitor = (v) => (/^[\w-]{8,64}$/.test(String(v || '')) ? String(v) : null);

  r.get('/:slug', (req, res) => {
    const p = visible(req.params.slug);
    const share = shareFor(p, req.query.share);
    const visitor = cleanVisitor(req.query.visitor) || crypto.randomBytes(12).toString('hex');
    const known = db.get('SELECT variant_key FROM vsl_views WHERE page_id = ? AND visitor = ?', p.id, visitor);
    const variant = (known && p.variants.find((v) => v.key === known.variant_key)) || pickVariant(p, visitor, share?.variant_key);
    const preview = p.status !== 'live';
    if (!preview && rateLimit(`vsl-view:${req.ip || 'local'}`, { max: 120, windowMs: 60_000 })) recordEvent(ctx, p, { visitor, variantKey: variant.key, share, type: 'view' });
    const org = db.get('SELECT * FROM organizations WHERE id = ?', p.org_id);
    res.json({
      name: p.name, headline: p.headline, preview, visitor, share: share ? { label: share.label } : null,
      video: { variant: variant.key, url: variant.video_url, duration_seconds: variant.duration_seconds || F.TOTAL_SECONDS },
      // The button repeats the CTA's own words, right under the video.
      button_text: p.button_text || F.PAGE.button_text,
      breakdown: { video_url: p.breakdown_video_url, cta: p.breakdown_cta || null },
      business: businessCard(db, org),
    });
  });

  r.post('/:slug/events', (req, res) => {
    if (!rateLimit(`vsl-event:${req.ip || 'local'}`, { max: 240, windowMs: 60_000 })) throw new HttpError(429, 'Too many events – slow down');
    const p = visible(req.params.slug);
    const body = pick(req.body, { visitor: { required: true, max: 64 }, type: { required: true, max: 30 }, seconds: { type: 'number' }, share: { max: 40 }, variant: { max: 1 } });
    const visitor = cleanVisitor(body.visitor);
    if (!visitor) throw badRequest('visitor must be the id the page was given');
    if (p.status !== 'live') return res.json({ ok: true, preview: true });
    const share = shareFor(p, body.share);
    const known = db.get('SELECT variant_key FROM vsl_views WHERE page_id = ? AND visitor = ?', p.id, visitor);
    const variant = known?.variant_key || (p.variants.some((v) => v.key === body.variant) ? body.variant : pickVariant(p, visitor, share?.variant_key).key);
    recordEvent(ctx, p, { visitor, variantKey: variant, share, type: body.type, seconds: body.seconds });
    res.json({ ok: true });
  });

  return r;
}

// Keeps a custom pack's stored data to the fields a pack has, as text.
function cleanPackData(d) {
  const out = {};
  const text = (v, max = 600) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const obj = (o, keys, max) => {
    if (!o || typeof o !== 'object') return undefined;
    const r = {};
    for (const k of keys ? Object.keys(o).filter((x) => keys.includes(x)) : Object.keys(o).slice(0, 30)) { const t = text(o[k], max); if (t !== undefined) r[k] = t; }
    return r;
  };
  if (Array.isArray(d.hooks)) out.hooks = d.hooks.map((h) => text(h, 300)).filter(Boolean).slice(0, 6);
  for (const k of ['what_changes', 'proof_framing', 'cta_line', 'method_line', 'add_on_line', 'result_line']) if (text(d[k])) out[k] = text(d[k]);
  const chain = obj(d.result_chain, ['problem', 'solution', 'business_result', 'customer_result']); if (chain) out.result_chain = chain;
  if (['same_niche', 'other_niche'].includes(d.proof_relation)) out.proof_relation = d.proof_relation;
  if (['draft', 'v1', 'v2'].includes(d.status)) out.status = d.status;
  const vars = obj(d.vars, null, 120); if (vars) out.vars = vars;
  const problem = obj(d.problem, ['day', 'tried', 'why_failing', 'cost', 'sample_line']); if (problem) out.problem = problem;
  const lines = obj(d.problem_lines, ['day', 'tried', 'why_failing', 'cost']); if (lines) out.problem_lines = lines;
  const demo = obj(d.demo_lines, F.SECTIONS[2].demo_steps.map((s) => s.key)); if (demo) out.demo_lines = demo;
  const broll = obj(d.broll, ['hook', 'problem', 'proof', 'cta'], 300); if (broll) out.broll = broll;
  return out;
}

function mergePack(a, b) {
  const out = { ...a, ...b };
  for (const k of ['vars', 'problem', 'problem_lines', 'demo_lines', 'broll', 'result_chain']) if (a[k] || b[k]) out[k] = { ...(a[k] || {}), ...(b[k] || {}) };
  return out;
}


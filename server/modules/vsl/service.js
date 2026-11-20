import crypto from 'node:crypto';
import { parseJson } from '../../db/index.js';
import { badRequest, id, notFound, now } from '../../lib/util.js';
import { notifyUsers } from '../core/notifications.js';
import { logActivity } from '../crm/service.js';
import { createTask } from '../tasks/service.js';
import { SECTIONS, TOTAL_SECONDS } from './foundation.js';
import { DEFAULT_PACK, PACKS, completePack } from './niches.js';
import { buildScript } from './builder.js';

const JSON_PROOF = ['numbers', 'screenshots'];
const JSON_SCRIPT = ['vars', 'overrides', 'proof_ids'];
const JSON_PAGE = ['variants', 'breakdown_cta'];

export const adminIds = (db, orgId) => db.all(`SELECT user_id FROM memberships WHERE org_id = ? AND role IN ('owner','admin')`, orgId).map((r) => r.user_id);

// ── Niche packs ──

export function listPacks(db, orgId) {
  const builtIn = Object.entries(PACKS).map(([key, p]) => ({ key, label: p.label, status: p.status, source: p.source, custom: false, core_niche: p.core_niche, hooks: p.hooks.length }));
  const custom = parseJson(db.all('SELECT * FROM vsl_packs WHERE org_id = ? ORDER BY created_at', orgId), 'data')
    .map((r) => ({ key: r.key, label: r.label, status: r.data.status || 'draft', source: 'custom', custom: true, based_on: r.based_on, hooks: (r.data.hooks || []).length }));
  return [...builtIn, ...custom];
}

/** A built-in pack, or one of this business's own (filled from the pack it was based on). */
export function loadPack(db, orgId, key) {
  if (PACKS[key]) return completePack(PACKS[key]);
  const row = parseJson(db.get('SELECT * FROM vsl_packs WHERE org_id = ? AND key = ?', orgId, key), 'data');
  if (!row) throw notFound('Niche pack');
  return completePack({ ...row.data, label: row.label, based_on: row.based_on, status: row.data.status || 'draft', source: 'custom' });
}

export const packKeyFrom = (label) => String(label).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'niche';

// ── Proof ──

export const getProofs = (db, orgId) => parseJson(db.all('SELECT * FROM vsl_proofs WHERE org_id = ? ORDER BY created_at', orgId), ...JSON_PROOF).map(proofOut);

function proofOut(p) {
  return { ...p, paid: p.paid === null || p.paid === undefined ? null : Boolean(p.paid), permission: Boolean(p.permission), use_in_vsl: Boolean(p.use_in_vsl) };
}

export function getProof(db, orgId, proofId) {
  const p = parseJson(db.get('SELECT * FROM vsl_proofs WHERE id = ? AND org_id = ?', proofId, orgId), ...JSON_PROOF);
  if (!p) throw notFound('Proof');
  return proofOut(p);
}

/** Numbers must be real, non-negative values. Nothing is rounded on the way in. */
export function cleanNumbers(input = {}) {
  const allowed = ['enquiries_caught', 'recovered', 'bookings', 'value_pence', 'reply_time_before', 'reply_time_after'];
  const out = {};
  for (const k of allowed) {
    const v = input[k];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw badRequest(`${k} must be a number of 0 or more`);
    if (k !== 'reply_time_before' && k !== 'reply_time_after' && !Number.isInteger(n)) throw badRequest(`${k} must be a whole number`);
    out[k] = n;
  }
  if (out.recovered !== undefined && out.enquiries_caught !== undefined && out.recovered > out.enquiries_caught) throw badRequest('recovered can’t be more than enquiries_caught');
  return out;
}

export function cleanScreenshots(list = []) {
  if (!Array.isArray(list)) throw badRequest('screenshots must be a list');
  return list.slice(0, 10).map((s) => {
    if (!['log_sheet', 'weekly_report', 'other'].includes(s?.kind)) throw badRequest('Each screenshot needs a kind: log_sheet, weekly_report or other');
    return { kind: s.kind, url: s.url ? String(s.url).slice(0, 500) : null, blurred: Boolean(s.blurred) };
  });
}

// ── Scripts ──

export function getScript(db, orgId, scriptId) {
  const s = parseJson(db.get('SELECT * FROM vsl_scripts WHERE id = ? AND org_id = ?', scriptId, orgId), ...JSON_SCRIPT);
  if (!s) throw notFound('Script');
  return { ...s, hook: parseHook(s.hook) };
}

export const parseHook = (h) => (/^\d+$/.test(String(h)) ? Number(h) : String(h));

/** The script fully built: every line, timing, card and honesty check. */
export function buildFor(db, orgId, script, { page = null } = {}) {
  const pack = loadPack(db, orgId, script.niche_key);
  const all = getProofs(db, orgId);
  const proofs = Array.isArray(script.proof_ids) ? script.proof_ids.map((pid) => all.find((p) => p.id === pid)).filter(Boolean) : all;
  return buildScript({ pack, packKey: script.niche_key, format: script.format, hook: script.hook, vars: script.vars || {}, overrides: script.overrides || {}, proofs, page });
}

export function scriptSummary(db, orgId, s) {
  const b = buildFor(db, orgId, s);
  return {
    id: s.id, name: s.name, niche_key: s.niche_key, niche: b.niche.label, format: s.format, status: s.status, hook: b.hook.text, video_url: s.video_url,
    parent_id: s.parent_id, est_seconds: b.est_seconds, ready: b.checks.ready, errors: b.checks.errors.length, warnings: b.checks.warnings.length,
    created_at: s.created_at, updated_at: s.updated_at,
  };
}

// ── Pages ──

export function getPage(db, where, value) {
  const p = parseJson(db.get(`SELECT * FROM vsl_pages WHERE ${where} = ?`, value), ...JSON_PAGE);
  if (!p) throw notFound('Page');
  return p;
}

export function makeSlug(db, name) {
  const base = String(name).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'vsl';
  let slug = base;
  for (let i = 2; db.get('SELECT 1 FROM vsl_pages WHERE slug = ?', slug); i++) slug = `${base}-${i}`;
  return slug;
}

/** Hook variants on a page: each points at one of this business's scripts. */
export function cleanVariants(db, orgId, list) {
  if (!Array.isArray(list) || !list.length) throw badRequest('Add at least one variant: [{ script_id, video_url }]');
  if (list.length > 6) throw badRequest('Up to 6 variants per page');
  const keys = 'ABCDEF';
  return list.map((v, i) => {
    const s = db.get('SELECT id, name FROM vsl_scripts WHERE id = ? AND org_id = ?', String(v?.script_id || ''), orgId);
    if (!s) throw badRequest(`Variant ${i + 1}: script not found`);
    const url = v.video_url ? String(v.video_url).trim() : null;
    if (url && !/^https?:\/\//i.test(url)) throw badRequest(`Variant ${i + 1}: video_url must start with http(s)://`);
    const dur = v.duration_seconds === undefined || v.duration_seconds === null || v.duration_seconds === '' ? null : Number(v.duration_seconds);
    if (dur !== null && (!Number.isFinite(dur) || dur <= 0)) throw badRequest(`Variant ${i + 1}: duration_seconds must be more than 0`);
    return { key: keys[i], script_id: s.id, label: v.label ? String(v.label).slice(0, 80) : s.name, video_url: url ? url.slice(0, 500) : null, duration_seconds: dur };
  });
}

/** The same visitor always sees the same variant. */
export function pickVariant(page, visitor, pinned = null) {
  const vs = page.variants || [];
  if (pinned && vs.some((v) => v.key === pinned)) return vs.find((v) => v.key === pinned);
  // Hex digest so the same code runs in the browser test build.
  const n = parseInt(crypto.createHash('sha256').update(`${page.id}:${visitor}`).digest('hex').slice(0, 8), 16);
  return vs[n % vs.length];
}

// ── Tracking ──

export const EVENT_TYPES = ['view', 'play', 'progress', 'cta_click', 'breakdown_play', 'breakdown_progress', 'breakdown_complete', 'book_call'];

/** Records one thing a visitor did. Views are kept as one row per visitor, so a page never fills the database. */
export function recordEvent(ctx, page, { visitor, variantKey, share = null, type, seconds = null }) {
  const { db } = ctx;
  if (!EVENT_TYPES.includes(type)) throw badRequest(`type must be one of: ${EVENT_TYPES.join(', ')}`);
  const ts = now();
  let view = db.get('SELECT * FROM vsl_views WHERE page_id = ? AND visitor = ?', page.id, visitor);
  if (!view) {
    view = { id: id('vview'), org_id: page.org_id, page_id: page.id, share_id: share?.id || null, visitor, variant_key: variantKey, first_seen: ts, last_seen: ts, played: 0, max_seconds: 0, breakdown_played: 0, breakdown_max_seconds: 0 };
    db.insert('vsl_views', view);
  }
  const patch = { last_seen: ts };
  const secs = Number(seconds);
  const s = Number.isFinite(secs) && secs >= 0 ? Math.min(secs, 4 * 3600) : null;
  if (type === 'play') patch.played = 1;
  if (type === 'progress' && s !== null) { patch.played = 1; if (s > view.max_seconds) patch.max_seconds = s; }
  if (type === 'cta_click' && !view.cta_clicked_at) patch.cta_clicked_at = ts;
  if (type === 'breakdown_play') patch.breakdown_played = 1;
  if (type === 'breakdown_progress' && s !== null) { patch.breakdown_played = 1; if (s > view.breakdown_max_seconds) patch.breakdown_max_seconds = s; }
  if (type === 'breakdown_complete' && !view.breakdown_completed_at) { patch.breakdown_played = 1; patch.breakdown_completed_at = ts; }
  if (type === 'book_call' && !view.booked_at) patch.booked_at = ts;
  db.update('vsl_views', view.id, patch);
  if (share) shareSignals(ctx, page, share, type, view, patch);
  return { ...view, ...patch };
}

/** A prospect's personal link: their timeline, and a follow-up task when they click through. */
function shareSignals(ctx, page, share, type, view, patch) {
  const { db } = ctx;
  if (type === 'view' && !share.first_viewed_at) {
    db.update('vsl_shares', share.id, { first_viewed_at: now() });
    logActivity(db, page.org_id, share.contact_id, `Opened the VSL “${page.name}”`);
    notifyUsers(db, page.org_id, adminIds(db, page.org_id), { title: `👀 ${share.label} opened your VSL`, body: page.name, link: '#/vsl' });
  }
  if (type === 'cta_click' && patch.cta_clicked_at && !share.clicked_at) {
    db.update('vsl_shares', share.id, { clicked_at: now() });
    logActivity(db, page.org_id, share.contact_id, `Watched the VSL “${page.name}” to ${Math.round(view.max_seconds)}s and clicked “${page.button_text || 'Watch the full breakdown'}”`);
    const owners = adminIds(db, page.org_id);
    createTask(ctx, page.org_id, {
      title: `Follow up ${share.label}: they clicked through to the breakdown`,
      description: `${share.label} watched “${page.name}” and clicked through to the full breakdown. Reach out while it’s fresh.`,
      priority: 'high', due_at: new Date(Date.now() + 86400_000).toISOString(), assignee_id: share.created_by || owners[0] || null, source: share.contact_id ? 'crm' : 'manual', source_ref: share.id,
    });
    notifyUsers(db, page.org_id, owners, { title: `🔥 ${share.label} clicked through to the breakdown`, body: page.name, link: '#/vsl' });
  }
  if (type === 'book_call' && patch.booked_at) logActivity(db, page.org_id, share.contact_id, `Booked a call from the VSL “${page.name}”`);
}

/**
 * Per hook variant: how many watched, how many got past the hook, how far
 * they got through each section, and how many clicked the button.
 */
export function pageStats(db, page) {
  const rows = db.all('SELECT * FROM vsl_views WHERE page_id = ?', page.id);
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const variants = (page.variants || []).map((v) => {
    const vr = rows.filter((r) => r.variant_key === v.key);
    const played = vr.filter((r) => r.played);
    const length = v.duration_seconds || TOTAL_SECONDS;
    const scale = length / TOTAL_SECONDS;
    const clicks = vr.filter((r) => r.cta_clicked_at).length;
    return {
      key: v.key, label: v.label, script_id: v.script_id,
      views: vr.length, plays: played.length, play_rate: pct(played.length, vr.length),
      // Got past the hook: still watching when section 2 starts.
      hook_held: played.filter((r) => r.max_seconds >= SECTIONS[1].start * scale).length,
      hook_hold_rate: pct(played.filter((r) => r.max_seconds >= SECTIONS[1].start * scale).length, played.length),
      sections: SECTIONS.map((s) => ({ key: s.key, title: s.title, reached: played.filter((r) => r.max_seconds >= s.start * scale).length, rate: pct(played.filter((r) => r.max_seconds >= s.start * scale).length, played.length) })),
      finished: played.filter((r) => r.max_seconds >= length - 5).length,
      cta_clicks: clicks, cta_rate: pct(clicks, played.length),
      breakdown_plays: vr.filter((r) => r.breakdown_played).length,
      breakdown_completes: vr.filter((r) => r.breakdown_completed_at).length,
      booked_calls: vr.filter((r) => r.booked_at).length,
    };
  });
  return { variants, hook_test: hookVerdict(variants) };
}

export const MIN_PLAYS_TO_CALL = 30;

/** Says which hook is winning, but only once each one has enough plays to mean something. */
export function hookVerdict(variants) {
  if (variants.length < 2) return { status: 'single', text: 'One hook on this page. Add another variant to test hooks against each other.' };
  const short = variants.filter((v) => v.plays < MIN_PLAYS_TO_CALL);
  if (short.length) return { status: 'collecting', text: `Not enough plays to call it yet. Each hook needs ${MIN_PLAYS_TO_CALL}; ${short.map((v) => `${v.key} has ${v.plays}`).join(', ')}.` };
  const ranked = [...variants].sort((a, b) => b.cta_rate - a.cta_rate || b.hook_hold_rate - a.hook_hold_rate);
  return { status: 'leading', leader: ranked[0].key, text: `Hook ${ranked[0].key} is leading: ${ranked[0].cta_rate}% click through to the breakdown, against ${ranked[1].cta_rate}% for ${ranked[1].key}.` };
}

export { DEFAULT_PACK };

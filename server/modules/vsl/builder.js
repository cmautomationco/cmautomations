import { FOUNDATION_VERSION, OFFER, OPEN_DECISIONS, PAGE, PROOF_PLAN, SECTIONS, TOTAL_SECONDS, clock } from './foundation.js';
import { FORMATS, formatOf } from './formats.js';
import { PACKS, completePack, fill, packGaps, resolveVars } from './niches.js';
import { checkHonesty, numbersLine } from './proof.js';

/**
 * Builds a full VSL script from the foundation + a niche pack + a format,
 * with the chosen hook, any line overrides and the real proof records.
 *
 * Every line has a stable key (e.g. "problem.cost", "proof.numbers.prf_x") so
 * one line can be rewritten for a niche without touching the rest.
 */
export function buildScript({ pack: rawPack, packKey = null, format = 'faceless', hook = 0, vars = {}, overrides = {}, proofs = [], page = null }) {
  const pack = completePack(rawPack || PACKS.aesthetics_clinic);
  const v = resolveVars({ ...pack.vars, ...vars });
  const f = formatOf(format);
  const fmtKey = FORMATS[format] ? format : 'faceless';
  const say = (key, text) => fill(overrides[key] ?? text, v);

  const hooks = pack.hooks.map((h) => fill(h, v));
  const hookIndex = typeof hook === 'number' && hooks[hook] ? hook : 0;
  const hookText = typeof hook === 'string' && hook.trim() ? fill(hook, v) : hooks[hookIndex];
  const usedProofs = proofs.filter((p) => p.use_in_vsl !== false && p.use_in_vsl !== 0);

  const lines = {
    hook: [{ key: 'hook.line', kind: 'line', text: say('hook.line', hookText), visual: pack.broll.hook }],
    problem: [
      ...['day', 'tried', 'why_failing', 'cost'].map((b) => ({ key: `problem.${b}`, kind: 'line', beat: b, text: say(`problem.${b}`, pack.problem_lines[b] || pack.problem[b]), visual: pack.broll.problem })),
      { key: 'problem.sample', kind: 'line', beat: 'sample_line', text: say('problem.sample', pack.problem.sample_line), visual: pack.broll.problem },
    ],
    solution: [
      { key: 'solution.method', kind: 'line', camera: 'on_camera', text: say('solution.method', pack.method_line || OFFER.method_line), visual: 'Title card' },
      ...SECTIONS[2].demo_steps.map((st) => ({ key: `solution.demo.${st.key}`, kind: 'demo', step: fill(st.text, v), text: say(`solution.demo.${st.key}`, pack.demo_lines[st.key]), visual: `Screen recording: ${fill(st.text, v)}` })),
      { key: 'solution.add_ons', kind: 'line', text: say('solution.add_ons', pack.add_on_line), visual: 'Screen recording (one line only)' },
      { key: 'solution.what_changes', kind: 'line', text: say('solution.what_changes', pack.what_changes), visual: 'Title card' },
    ],
    proof: [
      { key: 'proof.framing', kind: 'line', text: say('proof.framing', pack.proof_framing), visual: 'Business names on screen' },
      ...usedProofs.flatMap((p) => {
        const out = [];
        const nl = p.line_override || numbersLine(p);
        out.push({ key: `proof.numbers.${p.id}`, kind: 'proof', proof_id: p.id, text: overrides[`proof.numbers.${p.id}`] ?? nl ?? `[${p.business_name}: real numbers from the checklist]`, visual: 'Log sheet and weekly report screenshots, customer details blurred', placeholder: !nl && !overrides[`proof.numbers.${p.id}`] });
        if (p.quote) out.push({ key: `proof.words.${p.id}`, kind: 'quote', proof_id: p.id, text: `“${p.quote.trim()}” – ${p.owner_name || p.business_name}`, visual: 'Quote on screen' });
        else if (p.clip_url) out.push({ key: `proof.words.${p.id}`, kind: 'quote', proof_id: p.id, text: `[Clip from ${p.owner_name || p.business_name}, ${p.clip_seconds || '15–20'}s]`, clip_url: p.clip_url, clip_seconds: p.clip_seconds || null, visual: 'Owner clip, captioned' });
        return out;
      }),
    ],
    cta: [{ key: 'cta.line', kind: 'line', text: say('cta.line', pack.cta_line), visual: pack.broll.cta }],
  };
  if (!usedProofs.length) lines.proof.push({ key: 'proof.numbers.pending', kind: 'proof', text: '[Real numbers from the plumber and the internet connections business go here]', placeholder: true, visual: 'Log sheet and weekly report screenshots, customer details blurred' });

  const warnings = [];
  const sections = SECTIONS.map((s) => {
    const ls = lines[s.key];
    const words = ls.reduce((n, l) => n + (l.clip_seconds ? 0 : wordCount(l.text)), 0);
    const clipSeconds = ls.reduce((n, l) => n + (Number(l.clip_seconds) || 0), 0);
    const est = Math.round((words / f.words_per_second + clipSeconds) * 10) / 10;
    const window = s.end - s.start;
    const fits = est <= window;
    if (!fits) warnings.push({ rule: 'timing', section: s.key, text: `${s.title} runs about ${Math.ceil(est - window)}s over its ${window}s window (${clock(s.start)}–${clock(s.end)}).` });
    return {
      key: s.key, number: s.number, title: s.title, start: s.start, end: s.end, window: `${clock(s.start)}–${clock(s.end)}`,
      goal: s.goal, slot: s.slot, rules: s.rules, direction: f.directions[s.key], filming_on_camera: s.filming,
      lines: ls, words, est_seconds: est, fits,
      ...(s.key === 'proof' ? { authority: PROOF_PLAN.v1.authority } : {}),
      ...(s.key === 'solution' ? { demo_steps: s.demo_steps.map((d) => ({ key: d.key, text: fill(d.text, v) })) } : {}),
    };
  });

  const honesty = checkHonesty({ proofs, sections, relation: pack.proof_relation, nicheWord: v.business_plural });
  if (pack.status === 'draft') warnings.unshift({ rule: 'draft_pack', text: `${pack.label} wording is a starter draft. Read it through and change anything that doesn’t sound like them.` });
  const gaps = packGaps(pack);
  if (gaps.length) honesty.errors.push({ rule: 'pack', text: `The niche pack is missing: ${gaps.join(', ')}` });
  if (sections.some((s) => s.lines.some((l) => l.placeholder))) honesty.errors.push({ rule: 'placeholder', text: 'Some proof lines are still placeholders.' });

  const breakdownCta = page?.breakdown_cta || null;
  return {
    foundation_version: FOUNDATION_VERSION,
    niche: { key: packKey, label: pack.label, status: pack.status, source: pack.source, vars: v, proof_relation: pack.proof_relation },
    format: { key: fmtKey, label: f.label, status: f.status, summary: f.summary },
    hook: { index: typeof hook === 'string' && hook.trim() ? null : hookIndex, text: lines.hook[0].text, options: hooks },
    total_seconds: TOTAL_SECONDS,
    est_seconds: Math.round(sections.reduce((n, s) => n + s.est_seconds, 0)),
    sections,
    cards: f.delivery === 'text' ? cardsFor(sections, f) : captionsFor(sections, f),
    page: {
      // The button under the VSL uses the same words as the CTA.
      button_text: page?.button_text || PAGE.button_text,
      breakdown_cta: breakdownCta,
      breakdown_covers: PAGE.breakdown.covers,
    },
    proof_plan: { v1: PROOF_PLAN.v1, v2: { ...PROOF_PLAN.v2, summary: fill(PROOF_PLAN.v2.summary, v) } },
    open_decisions: OPEN_DECISIONS.filter((d) => !(d.key === 'breakdown_cta' && breakdownCta)),
    checks: { errors: honesty.errors, warnings: [...warnings, ...honesty.warnings], ready: honesty.errors.length === 0 },
  };
}

export const wordCount = (t) => (String(t || '').match(/[\p{L}\p{N}’'£]+/gu) || []).length;

/** Splits a line into on-screen cards of a readable size, at sentence then comma breaks. */
export function splitCards(text, max = 9) {
  const sentences = String(text).match(/[^.!?]+[.!?]*\s*/g) || [String(text)];
  const out = [];
  for (const s of sentences.map((x) => x.trim()).filter(Boolean)) {
    if (wordCount(s) <= max) { out.push(s); continue; }
    const parts = s.split(/(?<=,|–|—|:)\s+/);
    let cur = '';
    for (const p of parts) {
      const next = cur ? `${cur} ${p}` : p;
      if (wordCount(next) <= max) cur = next;
      else {
        if (cur) out.push(cur);
        if (wordCount(p) <= max) cur = p;
        else {
          const w = p.split(/\s+/);
          for (let i = 0; i < w.length; i += max) out.push(w.slice(i, i + max).join(' '));
          cur = '';
        }
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Faceless: text cards laid out from each section's start, timed for reading. */
function cardsFor(sections, f) {
  const cards = [];
  let t = 0;
  for (const s of sections) {
    // A section that runs long pushes the next one back, so cards never overlap.
    t = Math.max(t, s.start);
    for (const l of s.lines) {
      if (l.clip_seconds) {
        cards.push({ section: s.key, line: l.key, start: t, end: t + Number(l.clip_seconds), text: l.text, visual: l.visual, clip: true });
        t += Number(l.clip_seconds);
        continue;
      }
      for (const text of splitCards(l.text, f.card_max_words)) {
        const d = Math.max(f.card_min_seconds, Math.round((wordCount(text) / f.words_per_second + 0.3) * 10) / 10);
        cards.push({ section: s.key, line: l.key, start: round1(t), end: round1(t + d), text, visual: l.visual });
        t += d;
      }
    }
  }
  return cards;
}

/** Voiceover / on camera: one caption per sentence, timed for speaking. */
function captionsFor(sections, f) {
  const out = [];
  let t = 0;
  for (const s of sections) {
    t = Math.max(t, s.start);
    for (const l of s.lines) {
      for (const text of splitCards(l.text, 12)) {
        const d = Math.max(1, wordCount(text) / f.words_per_second);
        out.push({ section: s.key, line: l.key, start: round1(t), end: round1(t + d), text, visual: l.visual });
        t += d;
      }
    }
  }
  return out;
}

const round1 = (n) => Math.round(n * 10) / 10;

/** SubRip captions (.srt) for the editor. */
export function toSrt(cards) {
  const ts = (s) => {
    const ms = Math.round(s * 1000);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  return cards.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
}

/** The full script as plain text: a teleprompter / edit doc. */
export function toText(built, name = 'VSL') {
  const out = [`${name}`, `${built.niche.label} · ${built.format.label} · foundation ${built.foundation_version}`, `Runs ${clock(built.total_seconds)} (estimated ${clock(built.est_seconds)})`, ''];
  for (const s of built.sections) {
    out.push(`${s.number}. ${s.title.toUpperCase()} (${s.window})`, `Goal: ${s.goal}`, `Direction: ${s.direction}`, '');
    let lastVisual = null;
    for (const l of s.lines) {
      out.push(`  ${l.kind === 'demo' ? `[${l.step}] ` : ''}${l.text}`);
      if (l.visual && l.visual !== lastVisual) out.push(`    Visual: ${l.visual}`);
      lastVisual = l.visual;
    }
    if (s.authority) out.push('', `  Note: ${s.authority}`);
    out.push('');
  }
  out.push(`ON THE PAGE`, `  Button: ${built.page.button_text}`, `  Breakdown video CTA: ${built.page.breakdown_cta ? built.page.breakdown_cta.label : 'Still to decide (suggested: book a call)'}`, '');
  if (built.checks.errors.length || built.checks.warnings.length) {
    out.push('BEFORE IT GOES OUT');
    for (const e of built.checks.errors) out.push(`  ✗ ${e.text}`);
    for (const w of built.checks.warnings) out.push(`  ! ${w.text}`);
  }
  return out.join('\n');
}

/** A shot list for the edit: what to film or record, section by section. */
export function shotList(built) {
  return built.sections.map((s) => ({
    section: s.key, title: s.title, window: s.window, direction: s.direction,
    shots: [...new Set(s.lines.map((l) => l.visual).filter(Boolean))],
    ...(s.demo_steps ? { screen_recording: s.demo_steps.map((d) => d.text) } : {}),
  }));
}

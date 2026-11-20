import { PROOF_CHECKLIST } from './foundation.js';

/**
 * Real results for the proof section, and the honesty rules that keep them real:
 *  - “businesses I’ve built this for”, not “clients”, unless they paid
 *  - never round a number up
 *  - small numbers are shown anyway
 *  - customer details blurred
 * Numbers are stored exactly as measured and printed exactly as stored.
 */

const REQUIRED_NUMBERS = ['enquiries_caught', 'recovered', 'bookings'];
const has = (v) => v !== undefined && v !== null && v !== '';

/** 1240 → "1,240". Whole numbers stay whole, decimals keep every digit given. */
export function exact(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const [whole, dec] = String(v).split('.');
  return `${Number(whole).toLocaleString('en-GB')}${dec ? `.${dec}` : ''}`;
}

/** Pence → "£1,240" or "£1,240.50". Never rounded to a nicer number. */
export function money(pence) {
  const p = Math.round(Number(pence));
  const pounds = Math.trunc(p / 100);
  const rest = Math.abs(p % 100);
  return `£${pounds.toLocaleString('en-GB')}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

const shortDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export function periodText(p) {
  if (p.period_start && p.period_end) {
    const a = shortDate(p.period_start);
    const b = shortDate(p.period_end);
    const ya = a.slice(-4);
    return ya === b.slice(-4) && /^\d{4}$/.test(ya) ? `${a.slice(0, -5)} to ${b}` : `${a} to ${b}`;
  }
  return p.period_label || null;
}

/** The numbers line, built only from what was recorded. */
export function numbersLine(p) {
  const n = p.numbers || {};
  const who = p.short_name || p.business_name;
  const plural = (v, one, many) => `${exact(v)} ${Number(v) === 1 ? one : many}`;
  const parts = [];
  if (has(n.enquiries_caught)) parts.push(`${plural(n.enquiries_caught, 'enquiry', 'enquiries')} answered.`);
  if (has(n.recovered)) parts.push(`${exact(n.recovered)} of them would have been missed.`);
  if (has(n.bookings)) parts.push(`${exact(n.bookings)} turned into ${Number(n.bookings) === 1 ? 'a booking' : 'bookings'}${has(n.value_pence) ? `, worth an estimated ${money(n.value_pence)}` : ''}.`);
  else if (has(n.value_pence)) parts.push(`Worth an estimated ${money(n.value_pence)}.`);
  if (!parts.length) return null;
  const period = periodText(p);
  return `${who}${period ? `, ${period}` : ''}: ${parts.join(' ')}`;
}

/** Every number the proof is allowed to say, as text. */
export function recordedNumbers(proofs) {
  const out = new Set();
  for (const p of proofs) {
    for (const [k, v] of Object.entries(p.numbers || {})) {
      if (!has(v)) continue;
      if (k === 'value_pence') {
        const m = money(v).replace('£', '');
        out.add(m); out.add(m.replace(/,/g, ''));
      } else {
        out.add(exact(v)); out.add(String(v));
      }
    }
    // Dates and the 15–20 second clip length aren't claims.
    for (const d of [p.period_start, p.period_end]) if (d) for (const part of String(d).match(/\d+/g) || []) out.add(String(Number(part)));
  }
  return out;
}

/** Checklist status for one proof record: which items are done and which still to do. */
export function checklistFor(p) {
  const n = p.numbers || {};
  const shots = Array.isArray(p.screenshots) ? p.screenshots : [];
  const done = {
    period: Boolean(periodText(p)),
    enquiries_caught: has(n.enquiries_caught),
    reply_time: has(n.reply_time_before) || has(n.reply_time_after),
    recovered: has(n.recovered),
    bookings: has(n.bookings),
    value: has(n.value_pence),
    log_sheet: shots.some((s) => s.kind === 'log_sheet'),
    weekly_report: shots.some((s) => s.kind === 'weekly_report'),
    their_words: Boolean(p.quote || p.clip_url),
    permission: Boolean(p.permission),
    paid: p.paid === true || p.paid === false || p.paid === 1 || p.paid === 0,
  };
  const items = PROOF_CHECKLIST.map((c) => ({ ...c, done: Boolean(done[c.key]) }));
  return { items, missing: items.filter((i) => i.required && !i.done).map((i) => i.label), complete: items.every((i) => !i.required || i.done) };
}

const CLIENT_WORD = /\b(my|our|the|these|those|two|both)\s+clients?\b|\bclients?\s+(i|we)\b|\bclients?\s+like\b|\bclients?\b(?=[^.]*\b(plumber|internet|built|worked)\b)/i;
const VAGUE = /\b(around|about|roughly|approximately|approx\.?|nearly|almost|over|more than|upwards of|up to|dozens|hundreds|thousands|loads|countless|tons)\s+(of\s+)?(£?\d|enquir|booking|job|client|lead)|\d+\s*\+|\d+k\b/i;
const NUMBER = /£?\d[\d,]*(\.\d+)?/g;

/**
 * Checks a built script's proof and CTA against the honesty rules.
 * Returns { errors, warnings }. Errors stop a script being marked ready.
 */
export function checkHonesty({ proofs, sections, relation, nicheWord = 'businesses in this niche' }) {
  const errors = [];
  const warnings = [];
  const used = proofs.filter((p) => p.use_in_vsl !== false && p.use_in_vsl !== 0);
  const anyPaid = used.some((p) => p.paid === true || p.paid === 1);

  if (!used.length) errors.push({ rule: 'proof', text: 'No real results added yet. Add the plumber and internet connections numbers before this goes out.' });
  for (const p of used) {
    const c = checklistFor(p);
    for (const m of c.missing) errors.push({ rule: 'checklist', proof_id: p.id, text: `${p.business_name}: ${m}` });
    const shots = Array.isArray(p.screenshots) ? p.screenshots : [];
    for (const s of shots) if (!s.blurred) errors.push({ rule: 'blur', proof_id: p.id, text: `${p.business_name}: blur customer details in the ${s.kind === 'weekly_report' ? 'weekly report' : 'log sheet'} screenshot.` });
    if (p.quote) {
      const words = p.quote.trim().split(/\s+/).length;
      const sentences = (p.quote.match(/[.!?](\s|$)/g) || []).length;
      if (words > 40 || sentences > 2) warnings.push({ rule: 'their_words', proof_id: p.id, text: `${p.business_name}: keep their words to two lines (it’s ${words} words).` });
    }
    if (p.clip_url && p.clip_seconds && (p.clip_seconds < 15 || p.clip_seconds > 20)) {
      warnings.push({ rule: 'their_words', proof_id: p.id, text: `${p.business_name}: the clip is ${p.clip_seconds}s. Aim for 15 to 20 seconds.` });
    }
  }

  const allowed = recordedNumbers(used);
  for (const s of sections.filter((x) => x.key === 'proof' || x.key === 'cta')) {
    for (const line of s.lines) {
      if (line.kind === 'quote') continue; // The owner's own words are theirs, as said.
      const text = line.text || '';
      if (!anyPaid && CLIENT_WORD.test(text)) {
        errors.push({ rule: 'clients_word', line: line.key, text: `“${excerpt(text, CLIENT_WORD)}”: say “businesses I’ve built this for”, not “clients”, unless they paid.` });
      }
      if (VAGUE.test(text)) errors.push({ rule: 'no_rounding', line: line.key, text: `“${excerpt(text, VAGUE)}”: use the exact number. Never round a number up.` });
      if (s.key === 'proof' && line.kind === 'proof') {
        for (const m of text.match(NUMBER) || []) {
          const bare = m.replace('£', '');
          if (!allowed.has(bare) && !allowed.has(bare.replace(/,/g, ''))) {
            errors.push({ rule: 'no_rounding', line: line.key, text: `${m} isn’t one of the recorded numbers. Show the real number, even if it’s small.` });
          }
        }
      }
    }
  }
  for (const p of used) {
    if (!(p.paid === true || p.paid === 1) && p.line_override && /\bclients?\b/i.test(p.line_override)) {
      errors.push({ rule: 'clients_word', proof_id: p.id, text: `${p.business_name} didn’t pay, so don’t call them a client.` });
    }
  }
  if (relation === 'other_niche') warnings.push({ rule: 'v2', text: `This proof is from another niche. For v2, swap in results from your first ${nicheWord} on the founding rate.` });
  return { errors: dedupe(errors), warnings: dedupe(warnings) };
}

function excerpt(text, re) {
  const m = text.match(re);
  if (!m) return text.slice(0, 60);
  const i = Math.max(0, m.index - 20);
  return `${i ? '…' : ''}${text.slice(i, m.index + m[0].length + 20).trim()}…`;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => (seen.has(x.text) ? false : seen.add(x.text)));
}

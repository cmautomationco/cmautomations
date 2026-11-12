import { parseJson } from '../../db/index.js';
import { now } from '../../lib/util.js';
import { OBJECTIONS, PAINS, winningResponses } from './analyse.js';
import { localClock } from '../crm/geo.js';

/**
 * Opening lines for each lead, and the call script that keeps improving:
 * every finished call (its opener, outcome and transcript) updates which
 * openers book the most calls, the objections that come up most, and the
 * exact words that turned objections into bookings.
 */

const safe = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v) || {}; } catch { return {}; } };
const firstName = (c) => (c.first_name && !/^(new contact|caller|whatsapp enquiry|text enquiry|@)/i.test(c.first_name) ? c.first_name : '');

/** Opener performance across this business's calls: connected, booked and booking rate per opener. */
export function openerStats(db, orgId) {
  const rows = db.all(`SELECT opener_key, outcome FROM dial_calls WHERE org_id = ? AND status = 'ended' AND opener_key IS NOT NULL`, orgId);
  const stats = {};
  for (const r of rows) {
    const s = (stats[r.opener_key] ||= { used: 0, connected: 0, booked: 0 });
    s.used++;
    if (['booked', 'interested', 'callback', 'not_interested'].includes(r.outcome)) s.connected++;
    if (r.outcome === 'booked') s.booked++;
  }
  for (const s of Object.values(stats)) s.rate = s.connected ? Math.round((s.booked / s.connected) * 100) : 0;
  return stats;
}

/** 3–5 openers written for this lead from everything we know, best performers first. */
export function buildOpeners(db, org, contact, { caller = 'me', stats = null } = {}) {
  const c = contact;
  const e = safe(c.enrichment);
  const q = safe(c.qualification);
  const name = firstName(c);
  const hi = name ? `Hi ${name}` : 'Hi there';
  const me = String(caller || 'me').split(' ')[0];
  const biz = (() => { try { return JSON.parse(org.brand || '{}').display_name || org.name; } catch { return org.name; } })();
  const local = e.timezone ? localClock(e.timezone) : null;
  const greeting = local ? (local.hour < 12 ? 'Good morning' : local.hour < 18 ? 'Good afternoon' : 'Good evening') : 'Hi';
  const form = db.get(`SELECT fs.data, f.name FROM form_submissions fs LEFT JOIN forms f ON f.id = fs.form_id WHERE fs.contact_id = ? ORDER BY fs.created_at DESC LIMIT 1`, c.id);
  const formAnswer = form ? Object.entries(safe(form.data)).find(([k, v]) => v && !['first_name', 'last_name', 'email', 'phone'].includes(k) && String(v).length > 8)?.[1] : null;
  const lastIn = db.get(`SELECT channel, body, created_at FROM messages WHERE contact_id = ? AND direction = 'in' ORDER BY created_at DESC LIMIT 1`, c.id);
  const missed = db.get(`SELECT created_at FROM calls WHERE contact_id = ? AND status IN ('missed','voicemail') ORDER BY created_at DESC LIMIT 1`, c.id);
  const quote = db.get(`SELECT number, title FROM invoices WHERE contact_id = ? AND kind = 'quote' AND status = 'sent' ORDER BY created_at DESC LIMIT 1`, c.id);
  const lastCall = db.get(`SELECT outcome, ended_at, analysis FROM dial_calls WHERE contact_id = ? AND status = 'ended' AND outcome IN ('interested','callback','not_interested') ORDER BY started_at DESC LIMIT 1`, c.id);
  const pain = q.pain || (q.pains || [])[0] || null;
  const out = [];
  const add = (key, label, text, why) => out.push({ key, label, text: text.replace(/\s+/g, ' ').trim(), why });

  if (missed) add('missed_call', 'They rang you', `${hi}, it's ${me} from ${biz} – you tried to call us earlier and I didn't want you waiting. What can I help with?`, 'They called you first – the warmest possible opener.');
  if (form) add('form', 'Their form', `${hi}, it's ${me} from ${biz}. You filled in our ${form.name || 'enquiry form'}${formAnswer ? ` and mentioned “${String(formAnswer).slice(0, 80)}”` : ''} – have you got two minutes so I can make sure we point you in the right direction?`, 'Uses their own words from the form.');
  if (lastIn) add('message', 'Their message', `${hi}, ${me} from ${biz} – thanks for your ${lastIn.channel === 'sms' ? 'text' : lastIn.channel === 'whatsapp' ? 'WhatsApp' : 'message'}. It's quicker to chat it through – is now a good moment?`, 'Follows up something they started.');
  if (quote) add('quote', 'Their quote', `${hi}, it's ${me} from ${biz}. I sent over the quote for ${quote.title || 'the work'} and wanted to check it made sense – any questions I can answer?`, 'Picks up an open quote.');
  if (lastCall) add('follow_up', 'Last conversation', `${hi}, ${me} from ${biz} again – when we spoke ${lastCall.outcome === 'callback' ? 'you asked me to call back' : 'last time'}${pain ? ` you mentioned ${String(pain).toLowerCase()}` : ''}. Is now better?`, 'Continues where you left off.');
  if (pain) add('pain', 'Their problem', `${greeting} ${name || ''}, it's ${me} from ${biz}. I'm calling because a lot of ${e.company ? 'businesses like ' + e.company : 'people'} tell us ${String(pain).toLowerCase()} costs them time and money – is that something you're dealing with too?`, 'Leads with the problem they care about.');
  const hoursOld = (Date.now() - new Date(c.created_at).getTime()) / 3600_000;
  if (!form && !lastIn && !missed && c.source && !/referral|refer|import|manual/i.test(c.source)) {
    add('source', 'Where they found you', `${hi}, it’s ${me} from ${biz} – you got in touch through ${/insta/i.test(c.source) ? 'Instagram' : /facebook/i.test(c.source) ? 'Facebook' : /tiktok/i.test(c.source) ? 'TikTok' : /google/i.test(c.source) ? 'Google' : 'our website'}${hoursOld < 2 ? ' a little while ago' : ''}, so I wanted to give you a quick call. What made you get in touch?`, 'Reminds them they reached out first.');
  }
  if (hoursOld < 24 && !c.dial_attempts) add('speed', 'Straight back to them', `${hi}, ${me} here from ${biz} – I saw your enquiry come in and wanted to catch you while it’s fresh. Is now still a good time?`, 'Speed wins: calling within the hour books far more.');
  if (/referral|refer/i.test(c.source || '')) add('referral', 'Referral', `${hi}, it's ${me} from ${biz} – you were recommended to us, so I thought I'd say hello personally. Is now an OK time?`, 'Borrowed trust from whoever referred them.');
  add('permission', 'Permission opener', `${greeting}${name ? ` ${name}` : ''}, it's ${me} from ${biz}. I know I'm calling out of the blue – can I take 30 seconds to tell you why, and you can tell me if it's worth carrying on?`, 'Honest and low-pressure – works for colder leads.');
  add('curiosity', 'Quick question', `${hi}, ${me} from ${biz} – quick question: when someone calls you and you can't pick up, what happens to that enquiry?`, 'Opens a conversation about a common, costly problem.');

  // Best performers first (once there's data), otherwise in order of how warm they are.
  const s = stats || openerStats(db, org.id);
  const ranked = out.map((o, i) => ({ ...o, stats: s[o.key] || null, order: i }))
    .sort((a, b) => ((b.stats?.connected >= 2 ? b.stats.rate : -1) - (a.stats?.connected >= 2 ? a.stats.rate : -1)) || a.order - b.order);
  if (ranked[0]) ranked[0].best = true;
  return ranked.slice(0, 5).map(({ order: _o, ...o }) => o);
}

const DEFAULT_HANDLERS = {
  price: 'Totally fair – most people ask that first. Can I ask what it’s costing you now in missed jobs or time? If what we do doesn’t pay for itself, it’s not worth doing.',
  timing: 'I get it – you’re busy, which is exactly why this exists. Shall we find 15 minutes next week instead of now? Which is better, Tuesday or Thursday?',
  existing: 'Makes sense – what do you like about what you use now? And if you could change one thing about it, what would it be?',
  think: 'Of course – who else would want to see it? Why don’t we book a short call with both of you so they can ask their own questions?',
  send_info: 'Happy to. So I send the right thing – what’s the one problem you’d most want it to fix? I’ll send that and we can talk it through for ten minutes.',
  trust: 'That’s completely understandable after a bad experience. What went wrong last time? I’ll be straight with you about whether we’d be any different.',
  not_interested: 'No problem at all – can I ask, is it the timing or just not something you need? Either way I won’t chase you.',
};

const DISCOVERY = [
  'What made you look into this now?',
  'Walk me through what happens today when a new enquiry comes in.',
  'What’s that costing you – in time, missed jobs or money?',
  'If we fixed that, what would it mean for you?',
  'Who else would be involved in a decision like this?',
  'What would need to be true for this to be a no-brainer?',
];

/** The current best script for this business, rebuilt from its own calls. */
export function buildScript(db, orgId) {
  const calls = parseJson(db.all(`SELECT outcome, opener_key, opener_text, transcript, analysis FROM dial_calls WHERE org_id = ? AND status = 'ended' ORDER BY started_at DESC LIMIT 500`, orgId), 'analysis');
  const stats = openerStats(db, orgId);
  const connected = calls.filter((c) => ['booked', 'interested', 'callback', 'not_interested'].includes(c.outcome));
  const booked = calls.filter((c) => c.outcome === 'booked');
  // Openers by booking rate (with enough calls to trust it).
  const openerExample = {};
  for (const c of calls) if (c.opener_key && c.opener_text && !openerExample[c.opener_key]) openerExample[c.opener_key] = c.opener_text;
  const openers = Object.entries(stats).map(([key, s]) => ({ key, ...s, example: openerExample[key] || null }))
    .sort((a, b) => (b.connected >= 2 ? b.rate : -1) - (a.connected >= 2 ? a.rate : -1) || b.booked - a.booked);
  // Objections: how often, and how often the call still ended booked.
  const objections = OBJECTIONS.map((o) => {
    const withIt = connected.filter((c) => (c.analysis?.objections || []).some((x) => x.key === o.key));
    const wins = withIt.filter((c) => c.outcome === 'booked');
    const replies = booked.flatMap((c) => winningResponses(c.transcript)).filter((r) => r.objection === o.key);
    return { key: o.key, label: o.label, count: withIt.length, booked: wins.length, rate: withIt.length ? Math.round((wins.length / withIt.length) * 100) : 0,
      handler: replies[0]?.reply || DEFAULT_HANDLERS[o.key], from_calls: Boolean(replies[0]), heard: replies[0]?.said || null };
  }).sort((a, b) => b.count - a.count);
  const painCounts = PAINS.map((p) => ({ key: p.key, label: p.label, count: calls.filter((c) => (c.analysis?.pains || []).some((x) => x.key === p.key)).length }))
    .filter((p) => p.count).sort((a, b) => b.count - a.count);
  const questions = {};
  for (const c of calls) for (const q of c.analysis?.questions || []) { const k = q.toLowerCase().replace(/[^a-z ]/g, '').trim(); if (k) questions[k] = (questions[k] || 0) + 1; }
  const topQuestions = Object.entries(questions).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([q, n]) => ({ question: q.charAt(0).toUpperCase() + q.slice(1) + '?', count: n }));
  const talk = calls.map((c) => c.analysis?.talk_ratio).filter((x) => x != null);
  const bookedTalk = booked.map((c) => c.analysis?.talk_ratio).filter((x) => x != null);
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const bestOpener = openers.find((o) => o.connected >= 2) || null;
  const pitchPains = painCounts.slice(0, 3);
  return {
    totals: { calls: calls.length, connected: connected.length, booked: booked.length, connect_rate: calls.length ? Math.round((connected.length / calls.length) * 100) : 0, book_rate: connected.length ? Math.round((booked.length / connected.length) * 100) : 0, transcripts: calls.filter((c) => c.transcript).length },
    openers, objections, pains: painCounts, questions: topQuestions,
    talk: { average: avg(talk), booked_average: avg(bookedTalk) },
    script: {
      opener: bestOpener ? { text: bestOpener.example, why: `Your best opener: ${bestOpener.booked} booked from ${bestOpener.connected} conversations (${bestOpener.rate}%).` } : { text: 'Use the opener suggested for each lead (it’s written from what they’ve told you).', why: 'Not enough calls yet to pick a winner – keep logging calls and this updates itself.' },
      discovery: [...DISCOVERY.slice(0, 3), ...(pitchPains[0] ? [`You mentioned ${pitchPains[0].label.toLowerCase()} – how often does that happen?`] : []), ...DISCOVERY.slice(3)],
      pitch: pitchPains.length ? `Most people you speak to mention ${pitchPains.map((p) => p.label.toLowerCase()).join(', ')}. Lead with whichever they raise and show exactly how it gets fixed.` : 'Lead with the problem they raised and show exactly how it gets fixed – one problem, one fix, one example.',
      close: 'Based on what you’ve told me, the best next step is a short demo where I show you this working for your business. I’ve got Tuesday at 10 or Thursday at 2 – which suits you better?',
      objections: objections.filter((o) => o.count || DEFAULT_HANDLERS[o.key]).slice(0, 7),
      tips: [
        ...(avg(bookedTalk) != null ? [`On calls that booked, you talked ${avg(bookedTalk)}% of the time${avg(talk) != null ? ` (vs ${avg(talk)}% overall)` : ''} – ${avg(bookedTalk) <= 50 ? 'letting them talk works' : 'ask more questions and listen more'}.`] : []),
        ...(topQuestions[0] ? [`The question you’re asked most is “${topQuestions[0].question}” – have a crisp answer ready.`] : []),
        'Ask one question at a time and let them finish.',
        'Always end with a clear next step and a time in the diary.',
      ],
    },
  };
}

/** Saves a new script version when calls have changed it, with what changed. */
export function recordScriptVersion(db, orgId, reason) {
  const script = buildScript(db, orgId);
  const row = db.get(`SELECT value FROM org_meta WHERE org_id = ? AND key = 'dialer_script_versions'`, orgId);
  const versions = row ? safe(row.value).list || [] : [];
  const prev = versions[versions.length - 1];
  const changes = [];
  const best = script.openers.find((o) => o.connected >= 2);
  if (best && prev?.best_opener !== best.key) changes.push(`New best opener: “${best.key.replace(/_/g, ' ')}” (${best.rate}% booked)`);
  const topObj = script.objections.find((o) => o.count);
  if (topObj && prev?.top_objection !== topObj.key) changes.push(`Most common objection is now ${topObj.label.toLowerCase()}`);
  const learnt = script.objections.filter((o) => o.from_calls).map((o) => o.key);
  for (const k of learnt) if (!(prev?.learnt || []).includes(k)) changes.push(`Learnt a winning answer to “${OBJECTIONS.find((o) => o.key === k).label}” from your own calls`);
  const version = { n: (prev?.n || 0) + 1, at: now(), reason, calls: script.totals.calls, book_rate: script.totals.book_rate, best_opener: best?.key || null, top_objection: topObj?.key || null, learnt, changes };
  db.run(`INSERT INTO org_meta (org_id, key, value) VALUES (?, 'dialer_script_versions', ?) ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value`, orgId, JSON.stringify({ list: [...versions, version].slice(-30) }));
  return version;
}

export function scriptVersions(db, orgId) {
  const row = db.get(`SELECT value FROM org_meta WHERE org_id = ? AND key = 'dialer_script_versions'`, orgId);
  return (row ? safe(row.value).list || [] : []).slice().reverse();
}

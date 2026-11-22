// ─────────────────────────────────────────────────────────────────────────────
//  HQ – your AI team command centre.
//  Pages: Briefing · Calendar · Clients · one desk per agent · Edit HQ.
// ─────────────────────────────────────────────────────────────────────────────
import { emptyState, newResult, seedState } from './seed.js';
import { PERIODS, STATUS, actionsOn, doneOn, endDate, milestones, monthOf, periodSummary, portfolio, programmeDay, progress, streak, toggleAction, totalDays } from './results.js';
import { aiAgent, aiDraft, clearLocal, liveData, loadState, saveState, store, upgrade } from './store.js';
import {
  DEAL_OPEN, PROJECT_STAGES, addApproval, agentById, agentFor, approve, buildQuote, cardBullets, chaseText, dealValue,
  decline, earnings, handOver, heat, log, nameOf, nextInvoiceNumber, quoteTotal, replyDraft, runAgent, runAll, scoreLead, sendDeal, thisWeek, writeScript,
} from './engine.js';
import { addDaysIso, ago, clone, daysSince, daysUntil, firstName, greeting, longDate, money, nowIso, relDay, shortDate, sum, timeOf, today, uid } from './util.js';
import { chip, confirmBox, dot, h, icon, modal, mount, openForm, toast } from './ui.js';

let S = null;
// Which item is open on each desk (kept between re-renders).
const SEL = {};
const root = document.getElementById('hq');
const cur = () => S.profile.currency || '£';
const $ = (v) => money(v, cur());

const ACCENTS = {
  aurora: ['#22d3ee', '#a78bfa', '#f472b6'],
  sunset: ['#fb923c', '#f472b6', '#facc15'],
  ocean: ['#38bdf8', '#2dd4bf', '#818cf8'],
  lime: ['#a3e635', '#22d3ee', '#34d399'],
  ember: ['#f87171', '#fb923c', '#fbbf24'],
};
const PALETTE = ['#22d3ee', '#f472b6', '#fbbf24', '#a78bfa', '#34d399', '#3b82f6', '#fb923c', '#f87171', '#2dd4bf', '#e879f9'];

// ── State & saving ───────────────────────────────────────────────────────────
function commit(msg) {
  saveState(S, renderSaveStatus);
  render();
  if (msg) toast(msg);
}
function renderSaveStatus() {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = store.error ? `Not saved: ${store.error}` : store.saving ? 'Saving…' : store.mode === 'server' ? 'Saved to your server' : 'Saved in this browser';
  el.className = `save-status ${store.error ? 'bad' : ''}`;
}

async function ai(agent, snapshot) {
  if (!store.ai) throw new Error('Claude isn’t connected');
  return aiAgent({ name: agent.name, role: agent.role, instructions: agent.instructions }, snapshot);
}

async function runTeam(btn) {
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try {
    await runAll(S, store.ai ? ai : null);
    commit(`Morning update done – ${S.approvals.length} thing${S.approvals.length === 1 ? '' : 's'} on your desk`);
  } finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
}
async function runOne(agent, btn) {
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try { await runAgent(S, agent, store.ai ? ai : null); commit(`${agent.name} checked in`); }
  finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
}

/** Redraft text: Claude when connected, simple built-in edits otherwise. */
async function redraft(agent, context, draft, instruction) {
  if (store.ai) {
    try { return await aiDraft({ agent: { name: agent?.name, role: agent?.role, instructions: agent?.instructions }, context, draft, instruction }); }
    catch (err) { toast(err.message, 'bad'); return null; }
  }
  let text = draft;
  const i = instruction.toLowerCase();
  const price = instruction.match(/(£|\$|€)\s?([\d,]+(?:\.\d+)?)/);
  if (price) {
    const all = [...text.matchAll(/(£|\$|€)\s?[\d,]+(?:\.\d+)?/g)];
    if (all.length) { const last = all[all.length - 1]; text = text.slice(0, last.index) + price[0].replace(/\s/, '') + text.slice(last.index + last[0].length); }
  }
  if (/short|brief|less/.test(i)) {
    const [greet, ...rest] = text.split('\n\n');
    const sign = rest.slice(-1);
    text = [greet, rest.slice(0, -1).join(' ').split(/(?<=[.!?])\s+/).slice(0, 2).join(' '), ...sign].join('\n\n');
  }
  if (/friend|warm/.test(i)) text = text.replace(/^(Hi [^\n]+)\n\n/, '$1\n\nHope you’re having a good week! ');
  if (/firm|strict|urgent/.test(i)) text = text.replace(/\n\n(Best|Thanks),/, '\n\nI’d appreciate a reply by the end of the week so I can plan the schedule.\n\n$1,');
  if (text === draft) toast('Connect Claude for free-form changes – or just edit the text directly.', 'warn');
  return text;
}

// ── Router ───────────────────────────────────────────────────────────────────
const route = () => (location.hash.replace(/^#\/?/, '') || 'briefing').split('/');
window.addEventListener('hashchange', () => { render(); document.querySelector('.main')?.scrollTo?.(0, 0); window.scrollTo(0, 0); });

function applyTheme() {
  const [a1, a2, a3] = ACCENTS[S.profile.accent] || ACCENTS.aurora;
  const r = document.documentElement;
  r.style.setProperty('--a1', a1); r.style.setProperty('--a2', a2); r.style.setProperty('--a3', a3);
  r.dataset.theme = S.profile.theme === 'light' ? 'light' : 'dark';
  document.title = `${S.profile.business} HQ`;
}

function render() {
  applyTheme();
  const [page, arg] = route();
  const main = h('main', { class: 'main' });
  mount(root, sidebar(page, arg), h('div', { class: 'content' }, topbar(page, arg), main));
  const agent = page === 'desk' ? agentById(S, arg) : null;
  if (page === 'calendar') calendarPage(main);
  else if (page === 'clients') clientsPage(main);
  else if (page === 'settings') settingsPage(main);
  else if (page === 'results') { const r = (S.results || []).find((x) => x.id === arg); if (r) resultsClient(main, r); else resultsOverview(main); }
  else if (agent) deskPage(main, agent);
  else briefingPage(main);
  renderSaveStatus();
}

// ── Shell ────────────────────────────────────────────────────────────────────
function sidebar(page, arg) {
  const e = earnings(S);
  const nav = (href, label, sub, { color, badge, active, ic } = {}) => h('a', { class: `nav-item ${active ? 'active' : ''}`, href, vars: color ? { '--c': color } : null, onclick: () => document.body.classList.remove('nav-open') },
    ic ? h('span', { class: 'nav-ic' }, ic) : h('span', { class: 'nav-dot' }),
    h('span', { class: 'nav-text' }, h('b', label), h('small', sub)),
    badge ? h('span', { class: `badge ${badge.tone || ''}` }, badge.n) : null);
  const week = thisWeek(S).length;
  return h('aside', { class: 'side' },
    h('div', { class: 'ws' }, h('div', { class: 'ws-logo' }, S.profile.business.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()),
      h('div', { class: 'ws-name' }, h('b', `${S.profile.business} HQ`), h('small', S.profile.handle))),
    h('div', { class: 'nav-label' }, 'Office'),
    nav('#/briefing', 'Briefing', 'You, the boss', { ic: icon('home'), active: page === 'briefing', badge: S.approvals.length ? { n: S.approvals.length, tone: 'hot' } : null }),
    nav('#/calendar', 'Calendar', 'Calls and deadlines', { ic: icon('calendar'), active: page === 'calendar', badge: week ? { n: week } : null }),
    nav('#/clients', 'Clients', 'Clients and rebooks', { ic: icon('users'), active: page === 'clients' }),
    nav('#/results', 'Results', 'Client goals & progress', { ic: icon('target'), active: page === 'results', badge: (S.results || []).some((r) => progress(r).status === 'behind') ? { n: (S.results || []).filter((r) => progress(r).status === 'behind').length, tone: 'hot' } : null }),
    h('div', { class: 'nav-label' }, 'Your team'),
    S.agents.map((a) => {
      const n = S.approvals.filter((x) => x.agentId === a.id).length;
      return nav(`#/desk/${a.id}`, a.desk || a.name, a.name, { color: a.color, active: page === 'desk' && arg === a.id, badge: n ? { n, tone: 'hot' } : null, ic: h('span', { class: 'nav-emoji', style: { background: a.color } }, a.icon || '🤖') });
    }),
    h('div', { class: 'nav-label' }, 'Make it yours'),
    nav('#/settings', 'Edit HQ', 'Team, prices, look', { ic: icon('cog'), active: page === 'settings' }),
    h('div', { class: 'side-foot' },
      h('div', { class: 'earned' }, h('b', $(e.received + e.owed)), h('small', `earned in ${S.profile.quarterLabel}`)),
      h('div', { id: 'save-status', class: 'save-status' }),
      store.mode === 'server' ? h('a', { class: 'back-link', href: '/' }, icon('back', 14), 'Back to CM Automations') : null));
}

function topbar(page, arg) {
  const agent = page === 'desk' ? agentById(S, arg) : null;
  const res = page === 'results' && arg ? (S.results || []).find((x) => x.id === arg) : null;
  const crumb = agent ? `${agent.desk || agent.name}` : res ? `Results / ${res.client}` : { calendar: 'Calendar', clients: 'Clients', settings: 'Edit HQ', results: 'Results' }[page] || 'Briefing';
  return h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Menu', onclick: () => document.body.classList.toggle('nav-open') }, icon('menu')),
    h('div', { class: 'crumb' }, h('span', { class: 'muted' }, `${S.profile.business} HQ`), h('span', { class: 'muted' }, ' / '), crumb),
    h('div', { class: 'top-actions' },
      store.signedOut ? h('a', { class: 'btn ghost sm', href: '/#/login' }, 'Sign in to sync') : null,
      h('span', { class: `ai-pill ${store.ai ? 'on' : ''}`, title: store.ai ? 'Agents write with Claude' : 'Agents use built-in templates. Add ANTHROPIC_API_KEY on your server to let them write with Claude.' }, icon('sparkles', 13), store.ai ? 'Claude on' : 'Templates'),
      h('button', { class: 'icon-btn', 'aria-label': 'Switch light or dark', onclick: () => { S.profile.theme = S.profile.theme === 'light' ? 'dark' : 'light'; commit(); } }, icon(S.profile.theme === 'light' ? 'moon' : 'sun'))));
}

const pageHead = (title, sub, ...actions) => h('div', { class: 'page-head' }, h('div', h('h1', title), sub ? h('p', { class: 'sub' }, sub) : null), h('div', { class: 'row' }, actions));
const card = (attrs, ...kids) => h('section', { class: `card ${attrs?.class || ''}`, vars: attrs?.color ? { '--c': attrs.color } : null }, kids);
const cardHead = (title, extra, ...right) => h('div', { class: 'card-head' }, h('h2', title, extra ? h('span', { class: 'muted small' }, ` ${extra}`) : null), h('div', { class: 'row' }, right));
const btn = (label, onClick, { kind = '', ic, sm, title } = {}) => h('button', { class: `btn ${kind} ${sm ? 'sm' : ''}`, onclick: onClick, title }, ic ? icon(ic, sm ? 13 : 15) : null, label);
const empty = (text) => h('div', { class: 'empty' }, text);

// ── Briefing ────────────────────────────────────────────────────────────────
function briefingPage(el) {
  const e = earnings(S);
  const need = S.approvals.length + sum(Object.values(S.updates), (u) => u?.needs?.length || 0);
  const runBtn = btn('Run morning update', (ev) => runTeam(ev.currentTarget), { kind: 'primary', ic: 'play' });
  mount(el,
    pageHead(`${greeting()}, ${S.profile.owner}`, `${longDate()} · ${need ? `${need} thing${need === 1 ? '' : 's'} need your decision` : 'nothing needs you right now'}`,
      S.meta.lastRunAt ? h('span', { class: 'muted small' }, `Team last checked in ${ago(S.meta.lastRunAt)}`) : null, runBtn),
    earningsCard(e),
    morningUpdate(),
    resultsBriefing(),
    weekCard(),
    h('div', { class: 'section-title' }, h('h2', 'Your team'), h('span', { class: 'muted small' }, 'Click a desk to open it')),
    h('div', { class: 'team-grid' }, S.agents.map(teamCard), h('button', { class: 'team-card add', onclick: () => addAgentForm() }, icon('plus', 22), h('b', 'Hire another agent'), h('small', 'Give it a job and instructions'))),
    h('div', { class: 'section-title' }, h('h2', 'Your desk')),
    h('div', { class: 'desk-grid' }, approvalsCard(S.approvals, 'Awaiting your approval'), activityCard()));
}

function earningsCard(e) {
  const total = e.received + e.owed;
  const target = Number(S.profile.target) || 0;
  const pct = target ? Math.min(100, Math.round((total / target) * 100)) : 0;
  const [start, end] = (() => { const s = new Date(S.profile.quarterStart + 'T12:00:00'); const en = new Date(s); en.setMonth(en.getMonth() + 2); return [s, en]; })();
  const mon = (d) => d.toLocaleDateString('en-GB', { month: 'short' });
  const stat = (label, value, sub, tone) => h('div', { class: `stat ${tone || ''}` }, h('small', label), h('b', value), h('span', sub));
  const split = [['Received', e.received, 'var(--a1)'], ['Owed to you', e.owed, 'var(--a2)'], ['In the pipeline', e.pipeline, 'var(--a3)']];
  const splitTotal = sum(split, (x) => x[1]) || 1;
  return card({ class: 'earnings' },
    h('div', { class: 'earn-top' },
      h('div', { class: 'earn-title' }, h('h2', `${S.profile.quarterLabel} earnings`), chip(`${mon(start)} to ${mon(end)}`)),
      h('div', { class: 'earn-row' },
        h('div', { class: 'hero-num' }, h('b', $(total)), h('small', target ? `${pct}% of your ${$(target)} target` : 'earned this quarter'),
          target ? h('div', { class: 'target-bar' }, h('i', { style: { width: `${pct}%` } })) : null),
        stat('Received', $(e.received), 'Cash landed this quarter', 'a1'),
        stat('Owed to you', $(e.owed), e.overdue ? `${$(e.overdue)} overdue` : 'Nothing overdue', 'a2'),
        stat('In the pipeline', $(e.pipeline), `${e.counts.pipeline} open deals`, 'a3'),
        stat('Deals won', String(e.won), 'Signed jobs')),
    ),
    h('div', { class: 'earn-bottom' },
      h('div', { class: 'split' },
        h('h3', `${S.profile.quarterLabel} split`, h('span', { class: 'muted small' }, ' · received vs owed vs pipeline')),
        h('div', { class: 'split-bar' }, split.map(([l, v, c]) => h('i', { title: `${l}: ${$(v)}`, style: { width: `${(v / splitTotal) * 100}%`, background: c } }))),
        h('div', { class: 'split-legend' }, split.map(([l, v, c]) => h('div', { class: 'legend-row' }, dot(c), h('span', l), h('b', $(v)), h('span', { class: 'muted' }, `${Math.round((v / splitTotal) * 100)}%`))))),
      donut(e.byClient)));
}

function donut(byClient) {
  const rows = Object.entries(byClient).sort((a, b) => b[1] - a[1]);
  const total = sum(rows, (r) => r[1]);
  const top = rows.slice(0, 7);
  if (rows.length > 7) top.push(['Other', sum(rows.slice(7), (r) => r[1])]);
  const R = 52; const C = 2 * Math.PI * R;
  let offset = 0;
  const svg = h('svg', { viewBox: '0 0 140 140', class: 'donut-svg', role: 'img', 'aria-label': 'Earnings by client' });
  svg.appendChild(h('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: 'var(--line)', 'stroke-width': 16 }));
  top.forEach(([name, v], i) => {
    const len = total ? (v / total) * C : 0;
    const gap = top.length > 1 ? 2 : 0;
    const c = h('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: PALETTE[i % PALETTE.length], 'stroke-width': 16, 'stroke-dasharray': `${Math.max(0, len - gap)} ${C}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 70 70)' });
    c.appendChild(h('title', `${name}: ${$(v)}`));
    svg.appendChild(c);
    offset += len;
  });
  return h('div', { class: 'donut' },
    h('div', { class: 'donut-chart' }, svg, h('div', { class: 'donut-mid' }, h('b', $(total)), h('small', `${rows.length} client${rows.length === 1 ? '' : 's'}`))),
    h('div', { class: 'donut-legend' }, h('h3', 'By client'), top.length ? top.map(([name, v], i) => h('div', { class: 'legend-row' }, dot(PALETTE[i % PALETTE.length]), h('span', { class: 'truncate' }, name), h('b', $(v)))) : h('div', { class: 'muted small' }, 'No income yet')));
}

function morningUpdate() {
  const ran = S.agents.filter((a) => S.updates[a.id]);
  const last = S.meta.lastRunAt;
  return card({ class: 'morning' },
    cardHead('Morning update', last ? `${new Date(last).toLocaleDateString('en-GB', { weekday: 'short' })} ${timeOf(last)}` : 'not run yet'),
    ran.length ? h('div', { class: 'update-grid' }, S.agents.filter((a) => a.enabled !== false).map((a) => {
      const u = S.updates[a.id];
      return h('div', { class: 'update', vars: { '--c': a.color } },
        h('div', { class: 'agent-line' }, h('span', { class: 'avatar', style: { background: a.color } }, a.icon), h('b', a.name)),
        h('p', { class: 'muted' }, u?.summary || 'Not checked in yet.'),
        u?.needs?.length ? [h('div', { class: 'mini-label' }, 'Needs you'), h('ul', { class: 'bullets red' }, u.needs.slice(0, 4).map((x) => h('li', x)))] : null,
        u?.fixed?.length ? [h('div', { class: 'mini-label' }, 'Checked and fixed'), h('ul', { class: 'bullets green' }, u.fixed.slice(0, 4).map((x) => h('li', x)))] : null);
    })) : h('div', { class: 'empty big' }, h('p', 'Your team hasn’t checked in yet today.'), btn('Run morning update', (ev) => runTeam(ev.currentTarget), { kind: 'primary', ic: 'play' })));
}

function weekCard() {
  const items = thisWeek(S);
  return card({ class: 'week' },
    cardHead('This week', null, btn('Add', () => eventForm(), { sm: true, kind: 'ghost', ic: 'plus' })),
    items.length ? h('div', { class: 'week-list' }, items.map((x) => h('div', { class: 'week-row' },
      h('span', { class: 'week-type' }, dot(x.color), x.type), h('b', x.title), h('span', { class: 'muted truncate' }, x.detail), h('span', { class: 'week-date' }, shortDate(x.date))))) : empty('Nothing booked in for the next 7 days.'));
}

function teamCard(a) {
  return h('a', { class: `team-card ${a.enabled === false ? 'off' : ''}`, href: `#/desk/${a.id}`, vars: { '--c': a.color } },
    h('div', { class: 'agent-line' }, h('span', { class: 'avatar lg', style: { background: a.color } }, a.icon), h('div', h('b', a.name), h('small', a.role))),
    a.enabled === false ? h('p', { class: 'muted small' }, 'Switched off') : h('ul', { class: 'bullets', vars: { '--c': a.color } }, cardBullets(S, a).map((x) => h('li', x))));
}

function approvalsCard(list, title) {
  const order = { contract: 0, reply: 1, invoice: 2, chase: 3, followup: 4, script: 5 };
  const items = [...list].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  return card({ class: 'approvals' },
    cardHead(title, null, items.length ? h('span', { class: 'badge hot' }, items.length) : null),
    items.length ? h('div', { class: 'ap-list' }, items.map((ap) => {
      const a = agentById(S, ap.agentId) || {};
      return h('div', { class: 'ap-row', vars: { '--c': a.color || 'var(--a1)' } },
        h('span', { class: 'avatar sm', style: { background: a.color } }, a.icon || '🤖'),
        h('div', { class: 'grow' }, h('b', ap.title), h('small', { class: 'muted' }, ap.sub || '')),
        btn('Review', () => reviewApproval(ap), { sm: true, kind: 'primary' }));
    })) : empty('All clear – nothing waiting for your sign-off. 🎉'));
}

function activityCard() {
  return card({ class: 'activity' },
    cardHead('Team activity'),
    S.activity.length ? h('div', { class: 'feed' }, S.activity.slice(0, 14).map((x) => {
      const a = agentById(S, x.from);
      return h('div', { class: 'feed-row' },
        h('span', { class: 'avatar sm', style: { background: a?.color || 'var(--muted)' } }, a?.icon || '👤'),
        h('div', { class: 'grow' }, h('div', { class: 'feed-who' }, h('b', nameOf(S, x.from)), ' → ', h('b', nameOf(S, x.to))), h('div', x.text), h('small', { class: 'muted' }, ago(x.at))));
    })) : empty('Your team’s messages to you – and to each other – appear here.'));
}

function reviewApproval(ap) {
  const a = agentById(S, ap.agentId) || {};
  const ta = h('textarea', { rows: 12, value: ap.body || '' });
  const ask = h('input', { placeholder: `Ask the ${a.name || 'agent'} to change it, e.g. “shorter”, “firmer”, “make it £1,200”` });
  const askBtn = btn('Redraft', async (ev) => {
    if (!ask.value.trim()) return;
    ev.currentTarget.disabled = true;
    const text = await redraft(a, `${ap.title}\n${ap.sub || ''}`, ta.value, ask.value.trim());
    ev.currentTarget.disabled = false;
    if (text) { ta.value = text; ask.value = ''; }
  }, { ic: 'sparkles', sm: true });
  const label = { contract: 'Approve & sign', script: 'Sign off', invoice: 'Send invoice', chase: 'Send reminder' }[ap.kind] || 'Approve & send';
  modal(ap.title, h('div', { class: 'review' },
    h('div', { class: 'agent-line' }, h('span', { class: 'avatar', style: { background: a.color } }, a.icon), h('div', h('b', a.name), h('small', { class: 'muted' }, ap.sub))),
    ta, h('div', { class: 'ask-row' }, ask, askBtn)), {
    wide: true,
    actions: [
      { label: 'Decline', kind: 'ghost', icon: 'x', onClick: (close) => { decline(S, ap); close(); commit('Declined – your agent has been told'); } },
      { label, kind: 'primary', icon: 'check', onClick: (close) => { approve(S, ap, ta.value); close(); commit('Done ✅'); } },
    ],
  });
}

// ── Calendar ─────────────────────────────────────────────────────────────────
function calendarPage(el) {
  const items = [];
  const add = (date, type, title, detail, color, ev) => { if (date && daysUntil(date) >= -1 && daysUntil(date) <= 45) items.push({ date: String(date).slice(0, 10), type, title, detail, color, ev }); };
  for (const e of S.events) add(e.date, e.type, e.title, e.detail, '#22d3ee', e);
  for (const p of S.projects) if (p.stage !== 'Live') { add(p.due, 'Build due', p.client, p.title, '#fbbf24'); add(p.kickoff, 'Kickoff', p.client, p.title, '#fbbf24'); }
  for (const sc of S.scripts) if (sc.status !== 'posted') add(sc.postBy, 'Post by', sc.client, sc.title, '#a78bfa');
  for (const i of S.invoices) if (i.status === 'sent') add(i.due, 'Invoice due', i.client, `${i.number} · ${$(i.amount)}`, '#34d399');
  for (const d of S.deals) if (DEAL_OPEN.includes(d.stage)) add(d.deadline, 'Deadline', d.client, d.want, '#3b82f6');
  for (const c of S.clients) add(c.rebookDue, 'Rebook due', c.name, c.services, '#f472b6');
  for (const r of S.results || []) for (const m of milestones(r)) add(m.date, 'Milestone', r.client, `Month ${m.month} target: ${$(m.target)}`, '#e879f9');
  items.sort((a, b) => a.date.localeCompare(b.date));
  const days = [...new Set(items.map((x) => x.date))];
  mount(el,
    pageHead('Calendar', 'Calls, build deadlines, posting dates, invoices and rebooks – everything with a date, in one place.', btn('Add to calendar', () => eventForm(), { kind: 'primary', ic: 'plus' })),
    days.length ? days.map((d) => card({ class: 'day' },
      h('div', { class: 'day-head' }, h('b', shortDate(d)), chip(relDay(d), daysUntil(d) === 0 ? 'hot' : '')),
      items.filter((x) => x.date === d).map((x) => h('div', { class: 'week-row' },
        h('span', { class: 'week-type' }, dot(x.color), x.type), h('b', x.title), h('span', { class: 'muted truncate' }, x.detail || ''),
        x.ev ? h('button', { class: 'icon-btn sm', 'aria-label': 'Edit', onclick: () => eventForm(x.ev) }, icon('edit', 14)) : h('span'))))) : card({}, empty('Nothing in the next 45 days.')));
}

function eventForm(ev) {
  openForm({
    title: ev ? 'Edit calendar item' : 'Add to calendar',
    fields: [
      { key: 'title', label: 'What', full: true }, { key: 'date', label: 'Date', type: 'date' },
      { key: 'type', label: 'Type', type: 'select', options: ['Call', 'Meeting', 'Go live', 'Shoot', 'Deadline', 'Personal'] }, { key: 'detail', label: 'Details', full: true },
    ],
    values: ev || { date: today(), type: 'Call' },
    onSave: (v) => { if (!v.title || !v.date) { toast('Add a title and date', 'bad'); return false; } if (ev) Object.assign(ev, v); else S.events.push({ id: uid('e'), ...v }); commit('Saved'); },
    onDelete: ev ? () => { S.events = S.events.filter((x) => x !== ev); commit('Deleted'); } : null,
  });
}

// ── Clients ──────────────────────────────────────────────────────────────────
function clientsPage(el) {
  const paid = (name) => sum(S.invoices.filter((i) => i.client === name && i.status === 'paid'), (i) => i.amount);
  const rows = [...S.clients].sort((a, b) => paid(b.name) - paid(a.name));
  const dm = agentFor(S, 'deals');
  mount(el,
    pageHead('Clients', `${S.clients.length} clients · ${$(sum(S.clients, (c) => c.retainer))}/month in care plans`, btn('Add client', () => clientForm(), { kind: 'primary', ic: 'plus' })),
    rows.length ? h('div', { class: 'client-grid' }, rows.map((c) => {
      const due = c.rebookDue ? daysUntil(c.rebookDue) : null;
      return card({ class: 'client' },
        h('div', { class: 'client-top' }, h('span', { class: 'avatar', style: { background: PALETTE[S.clients.indexOf(c) % PALETTE.length] } }, c.name[0]),
          h('div', { class: 'grow' }, h('b', c.name), h('small', { class: 'muted' }, [c.contact, c.email].filter(Boolean).join(' · '))),
          h('button', { class: 'icon-btn sm', 'aria-label': 'Edit client', onclick: () => clientForm(c) }, icon('edit', 14))),
        h('div', { class: 'kv' }, h('span', 'Lifetime'), h('b', $(paid(c.name))), h('span', 'Care plan'), h('b', c.retainer ? `${$(c.retainer)}/mo` : '–'), h('span', 'Client since'), h('b', c.since ? shortDate(c.since) : '–'), h('span', 'Rebook'), h('b', { class: due != null && due <= 14 ? 'warn-text' : '' }, c.rebookDue ? `${shortDate(c.rebookDue)} (${relDay(c.rebookDue)})` : '–')),
        c.services ? h('p', { class: 'small' }, c.services) : null,
        c.notes ? h('p', { class: 'muted small' }, c.notes) : null,
        h('div', { class: 'row' }, dm ? btn(c.rebookPitchedAt ? `Pitched ${ago(c.rebookPitchedAt)}` : 'Ask Deal Manager to pitch a rebook', () => {
          c.rebookPitchedAt = null;
          addApproval(S, { agentId: dm.id, kind: 'rebook', refId: c.id, title: `Rebook pitch for ${c.name} is ready`, sub: c.services || 'existing client', body: `Hi ${firstName(c.contact)},\n\nHope everything’s running smoothly! I’ve got a couple of ideas that could save you even more time this month – fancy a quick 15-minute catch-up? ${S.profile.bookingLink}\n\nBest,\n${S.profile.owner}` });
          log(S, dm.id, 'you', `Drafted a rebook pitch for ${c.name}`);
          commit('Drafted – it’s on your desk');
        }, { sm: true, kind: 'ghost', ic: 'sparkles' }) : null));
    })) : card({}, empty('No clients yet – add your first one.')));
}

function clientForm(c) {
  openForm({
    title: c ? `Edit ${c.name}` : 'Add client',
    fields: [
      { key: 'name', label: 'Business name' }, { key: 'contact', label: 'Contact name' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
      { key: 'services', label: 'What you do for them', full: true }, { key: 'retainer', label: `Care plan (${cur()}/month)`, type: 'number' },
      { key: 'since', label: 'Client since', type: 'date' }, { key: 'rebookDue', label: 'Rebook due', type: 'date' }, { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    values: c || { since: today() },
    onSave: (v) => { if (!v.name) return false; if (c) Object.assign(c, v); else S.clients.push({ id: uid('c'), ...v }); commit('Saved'); },
    onDelete: c ? () => { S.clients = S.clients.filter((x) => x !== c); commit('Deleted'); } : null,
  });
}

// ── Agent desks ─────────────────────────────────────────────────────────────
function deskHead(a, sub, ...extra) {
  return h('div', { class: 'desk-head', vars: { '--c': a.color } },
    h('span', { class: 'avatar xl', style: { background: a.color } }, a.icon),
    h('div', { class: 'grow' }, h('h1', a.desk || a.name), h('p', { class: 'sub' }, `${a.name} · ${sub}`)),
    h('div', { class: 'row' }, extra, btn(`Run ${a.name}`, (ev) => runOne(a, ev.currentTarget), { ic: 'play' }), btn('Edit agent', () => agentForm(a), { kind: 'ghost', ic: 'edit' })));
}
function deskUpdate(a) {
  const u = S.updates[a.id];
  const mine = S.approvals.filter((x) => x.agentId === a.id);
  return h('div', { class: 'desk-grid' },
    approvalsCard(mine, `Waiting for you from ${a.name}`),
    card({ class: 'update solo', color: a.color }, cardHead('Latest check-in', u ? ago(u.at) : 'not run yet'),
      h('p', { class: 'muted' }, u?.summary || 'Press “Run” to have this agent check in now.'),
      u?.needs?.length ? [h('div', { class: 'mini-label' }, 'Needs you'), h('ul', { class: 'bullets red' }, u.needs.map((x) => h('li', x)))] : null,
      u?.fixed?.length ? [h('div', { class: 'mini-label' }, 'Checked and fixed'), h('ul', { class: 'bullets green' }, u.fixed.map((x) => h('li', x)))] : null,
      h('details', { class: 'instructions' }, h('summary', 'Standing instructions'), h('p', a.instructions || 'None yet.'))));
}

function deskPage(el, a) {
  const pages = { receptionist: leadsDesk, deals: inboxDesk, projects: projectsDesk, scripts: scriptsDesk, finance: incomeDesk };
  (pages[a.builtIn] || customDesk)(el, a);
}

// Receptionist ─ leads & auto-replies
function leadsDesk(el, a) {
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 'all';
  const tabs = [['all', 'All'], ['new', 'New'], ['replied', 'Replied'], ['handed', 'Handed over'], ['cold', 'Cold'], ['scam', 'Scams']];
  const list = S.leads.filter((l) => tab === 'all' || l.status === tab).sort((x, y) => String(y.receivedAt).localeCompare(String(x.receivedAt)));
  const sel = S.leads.find((l) => l.id === SEL[a.id]) || list[0];
  const ar = S.settings.autoReply;
  const tone = { new: 'hot', replied: 'blue', handed: 'green', cold: '', scam: 'red', lost: '' };
  mount(el,
    deskHead(a, `${S.leads.filter((l) => l.status === 'new').length} new · ${S.leads.filter((l) => daysSince(l.receivedAt) <= 7).length} this week`,
      btn('Test: new enquiry', () => simulateLead(a), { kind: 'ghost', ic: 'sparkles' }), btn('Add lead', () => leadForm(), { kind: 'ghost', ic: 'plus' }),
      store.mode === 'server' ? btn('Sync from CRM', () => syncFromCrm(), { kind: 'ghost', ic: 'refresh' }) : null),
    card({ class: 'auto-reply', color: a.color },
      h('div', { class: 'card-head' }, h('h2', 'Auto-responder'),
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: ar.enabled, onchange: (e) => { ar.enabled = e.target.checked; commit(ar.enabled ? 'Auto-replies are on' : 'Auto-replies are off – drafts will wait for you'); } }), h('i'), h('span', ar.enabled ? 'On – replies within a minute, 24/7' : 'Off'))),
      h('p', { class: 'muted small' }, 'Every new enquiry from WhatsApp, Instagram, Facebook, email or your website form gets this reply straight away, then the lead is scored and the hot ones go to the Deal Manager. Placeholders: {first} {need} {business} {owner} {booking_link}'),
      h('textarea', { rows: 4, value: ar.template, onchange: (e) => { ar.template = e.target.value; commit('Auto-reply saved'); } })),
    h('div', { class: 'split-pane' },
      card({ class: 'list-pane' },
        h('div', { class: 'tabs' }, tabs.map(([k, l]) => h('a', { class: `tab ${tab === k ? 'on' : ''}`, href: `#/desk/${a.id}?tab=${k}` }, l, k !== 'all' ? h('span', { class: 'count' }, S.leads.filter((x) => x.status === k).length) : null))),
        list.length ? list.map((l) => h('button', { class: `list-row ${sel === l ? 'on' : ''}`, onclick: () => { SEL[a.id] = l.id; leadsDesk(el, a); } },
          h('div', { class: 'row between' }, h('b', l.name), h('small', { class: 'muted' }, ago(l.receivedAt))),
          h('small', { class: 'muted truncate' }, `${l.business ? `${l.business} · ` : ''}${l.need || l.message}`),
          h('div', { class: 'row' }, chip(l.channel), chip(l.status, tone[l.status]), l.score ? chip(`${heat(S, l.score)} ${l.score}`, heat(S, l.score) === 'hot' ? 'hot' : '') : null))) : empty('No leads here.')),
      sel ? leadDetail(sel, a) : card({}, empty('Pick a lead.'))));
}

function leadDetail(l, a) {
  const box = h('textarea', { rows: 3, placeholder: `Reply to ${firstName(l.name)} yourself…` });
  const field = (k, v) => h('div', { class: 'info' }, h('small', k), h('b', v || '–'));
  return card({ class: 'detail', color: a.color },
    h('div', { class: 'row between' }, h('div', h('h2', l.name), h('small', { class: 'muted' }, `${l.channel} · ${l.contact || ''}`)),
      h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Edit lead', onclick: () => leadForm(l) }, icon('edit')))),
    h('div', { class: 'info-grid' }, field('Business', l.business), field('What they need', l.need), field('Budget', l.budget ? $(l.budget) : ''), field('Timeline', l.timeline), field('Lead score', l.score ? `${l.score} – ${heat(S, l.score)}` : 'Not scored'), field('Received', `${shortDate(l.receivedAt)} ${timeOf(l.receivedAt)}`)),
    h('div', { class: 'thread' }, (l.thread?.length ? l.thread : [{ from: 'them', text: l.message, at: l.receivedAt }]).map((m) => h('div', { class: `bubble ${m.from === 'them' ? 'them' : 'us'}` },
      h('small', m.from === 'auto' ? `${a.name} (auto-reply)` : m.from === 'us' ? 'You' : l.name, ' · ', ago(m.at)), h('p', m.text)))),
    h('div', { class: 'reply-box' }, box, h('div', { class: 'row' },
      btn('Send', () => { if (!box.value.trim()) return; l.thread = [...(l.thread?.length ? l.thread : [{ from: 'them', text: l.message, at: l.receivedAt }]), { from: 'us', text: box.value.trim(), at: nowIso() }]; if (l.status === 'new') l.status = 'replied'; l.lastReplyAt = nowIso(); commit('Reply saved to the conversation'); }, { kind: 'primary', ic: 'send', sm: true }),
      l.status !== 'handed' && agentFor(S, 'deals') ? btn('Hand to Deal Manager', () => { l.score = l.score || scoreLead(S, l); handOver(S, l, 'handed over by you'); commit('Handed over – the Deal Manager will draft a quote'); }, { sm: true, ic: 'arrow' }) : null,
      l.status !== 'scam' ? btn('Mark as scam', () => { l.status = 'scam'; commit('Marked as a scam'); }, { sm: true, kind: 'ghost' }) : null)));
}

function leadForm(l) {
  openForm({
    title: l ? `Edit ${l.name}` : 'Add a lead',
    fields: [
      { key: 'name', label: 'Name' }, { key: 'business', label: 'Business' },
      { key: 'channel', label: 'Came in from', type: 'select', options: ['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'Email', 'Website form', 'Phone', 'Referral'] }, { key: 'contact', label: 'Contact (email, number or handle)' },
      { key: 'need', label: 'What they need', full: true }, { key: 'budget', label: `Budget (${cur()})`, type: 'number' }, { key: 'timeline', label: 'Timeline' },
      { key: 'status', label: 'Status', type: 'select', options: ['new', 'replied', 'handed', 'cold', 'scam', 'lost'] }, { key: 'message', label: 'Their message', type: 'textarea' },
    ],
    values: l || { channel: 'WhatsApp', status: 'new' },
    onSave: (v) => {
      if (!v.name) return false;
      if (l) { Object.assign(l, v); l.score = scoreLead(S, l); } else S.leads.unshift({ id: uid('l'), ...v, receivedAt: nowIso(), score: 0, thread: [] });
      commit(l ? 'Saved' : 'Lead added – run the Receptionist to reply');
    },
    onDelete: l ? () => { S.leads = S.leads.filter((x) => x !== l); commit('Deleted'); } : null,
  });
}

async function simulateLead(a) {
  const samples = [
    { name: 'Amy Turner', business: 'Turner Dog Grooming', channel: 'Instagram', contact: '@turnergrooming', need: 'an Instagram DM auto-reply that books appointments', budget: 800, timeline: 'This month', message: 'I get so many DMs asking for prices and slots, can you automate the replies and bookings?' },
    { name: 'Josh Reid', business: 'Reid Electrical', channel: 'WhatsApp', contact: '+44 7700 900777', need: 'missed-call text back and WhatsApp booking', budget: 1500, timeline: 'ASAP', message: 'Lose loads of jobs when I can’t answer on site. Need something that texts them back and books them in.' },
    { name: 'Lauren Day', business: 'Day Spa', channel: 'Website form', contact: 'lauren@dayspa.co.uk', need: 'a new website with online booking', budget: 2000, timeline: 'Next month', message: 'Our website is dated and doesn’t take bookings.' },
  ];
  const pick = { ...samples[Math.floor(Math.random() * samples.length)] };
  const lead = { id: uid('l'), ...pick, receivedAt: nowIso(), status: 'new', score: 0, thread: [] };
  S.leads.unshift(lead);
  await runAgent(S, a, null);
  SEL[a.id] = lead.id;
  commit(`${lead.name} messaged on ${lead.channel} – ${S.settings.autoReply.enabled ? 'replied instantly' : 'reply drafted for you'}`);
}

async function syncFromCrm() {
  try {
    const live = await liveData();
    let added = 0;
    for (const c of live.leads) {
      const ext = `crm:${c.id}`;
      if (S.leads.some((l) => l.ext === ext)) continue;
      S.leads.unshift({ id: uid('l'), ext, name: [c.first_name, c.last_name].filter(Boolean).join(' '), business: c.company || '', channel: c.source || 'CRM', contact: c.email || c.phone || '', need: '', budget: null, timeline: '', message: `Added to your CRM ${shortDate(c.created_at)}`, receivedAt: c.created_at, status: c.last_contacted_at ? 'replied' : 'new', lastReplyAt: c.last_contacted_at, score: 0, thread: [] });
      added++;
    }
    for (const i of live.invoices) {
      const ext = `crm:${i.id}`;
      if (S.invoices.some((x) => x.ext === ext)) continue;
      const status = i.status === 'paid' ? 'paid' : i.status === 'overdue' ? 'overdue' : 'sent';
      S.invoices.push({ id: uid('i'), ext, number: i.number, client: i.company || [i.first_name, i.last_name].filter(Boolean).join(' ') || 'Client', title: i.title || 'Invoice', amount: (i.total_pence || 0) / 100, issued: i.issue_date, due: i.due_date, status, paidAt: status === 'paid' ? i.issue_date : null, chases: [] });
      added++;
    }
    commit(added ? `Brought in ${added} item${added === 1 ? '' : 's'} from CM Automations${live.unread_messages ? ` · ${live.unread_messages} unread messages in your inbox` : ''}` : 'Already up to date');
  } catch (err) { toast(err.message, 'bad'); }
}

// Deal Manager ─ inbox, quotes, follow-ups, contracts
function inboxDesk(el, a) {
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 'new';
  const follow = S.deals.filter((d) => d.stage === 'sent');
  const groups = {
    new: S.deals.filter((d) => ['new', 'drafted', 'negotiating'].includes(d.stage)),
    follow,
    won: S.deals.filter((d) => d.stage === 'won'),
    all: S.deals,
  };
  const list = groups[tab] || groups.new;
  const sel = S.deals.find((d) => d.id === SEL[a.id]) || list[0];
  const tone = { new: 'hot', drafted: 'hot', sent: 'blue', negotiating: 'warn', won: 'green', lost: '' };
  mount(el,
    deskHead(a, `${groups.new.length} new deal${groups.new.length === 1 ? '' : 's'} · ${S.approvals.filter((x) => x.kind === 'followup').length} to follow up`, btn('New deal', () => dealForm(), { kind: 'ghost', ic: 'plus' })),
    h('div', { class: 'split-pane' },
      card({ class: 'list-pane' },
        h('div', { class: 'tabs' }, [['new', 'New deals'], ['follow', 'Follow ups'], ['won', 'Won'], ['all', 'All']].map(([k, l]) => h('a', { class: `tab ${tab === k ? 'on' : ''}`, href: `#/desk/${a.id}?tab=${k}` }, l, h('span', { class: 'count' }, groups[k].length)))),
        list.length ? list.map((d) => h('button', { class: `list-row ${sel === d ? 'on' : ''}`, onclick: () => { SEL[a.id] = d.id; inboxDesk(el, a); } },
          h('div', { class: 'row between' }, h('b', d.client), h('small', { class: 'muted' }, ago(d.lastContactAt))),
          h('small', { class: 'muted truncate' }, d.stage === 'sent' ? `No reply for ${daysSince(d.lastContactAt)} days${d.followUps ? `, ${d.followUps} nudge${d.followUps === 1 ? '' : 's'}` : ''}` : d.want),
          h('div', { class: 'row' }, chip(d.stage, tone[d.stage]), chip($(dealValue(d)), 'green')))) : empty('Nothing here.')),
      sel ? dealDetail(sel, a) : card({}, empty('Pick a deal.'))));
}

function dealDetail(d, a) {
  const box = (k, v) => h('div', { class: 'info' }, h('small', k), h('b', v || '–'));
  const draftBox = h('textarea', { rows: 11, value: d.draft || (d.stage === 'sent' ? d.lastFollowUp || '' : '') });
  draftBox.addEventListener('change', () => { d.draft = draftBox.value; saveState(S, renderSaveStatus); });
  const ask = h('input', { placeholder: `Ask the ${a.name} to change it, e.g. “firmer on price” or “make it £1,200”` });
  const addSel = h('select', h('option', { value: '' }, '+ Add from your rate card…'), S.rateCard.map((r, i) => h('option', { value: i }, `${r.item} – ${$(r.price)}`)));
  addSel.addEventListener('change', () => { const r = S.rateCard[addSel.value]; if (r) { d.quote = [...(d.quote || []), { item: r.item, price: Number(r.price) }]; d.draft = replyDraft(S, d); commit(); } });
  const pendingAp = S.approvals.find((x) => x.refId === d.id);
  return card({ class: 'detail', color: a.color },
    h('div', { class: 'row between' }, h('div', h('h2', d.client), h('small', { class: 'muted' }, [d.contact, d.email].filter(Boolean).join(' · '))),
      h('div', { class: 'row' },
        h('select', { class: 'stage-select', 'aria-label': 'Stage', onchange: (e) => { d.stage = e.target.value; if (d.stage === 'won' && d.contract.status === 'none') d.contract = { status: 'received', value: quoteTotal(d) }; commit(`Moved to ${d.stage}`); } }, ['new', 'drafted', 'sent', 'negotiating', 'won', 'lost'].map((s) => h('option', { value: s, selected: d.stage === s }, s))),
        h('button', { class: 'icon-btn', 'aria-label': 'Edit deal', onclick: () => dealForm(d) }, icon('edit')))),
    h('div', { class: 'info-grid three' }, box('What they want', d.want), box('Their budget', d.budget ? $(d.budget) : 'Not stated'), box('Deadline', d.deadline ? shortDate(d.deadline) : 'Not set')),
    h('div', { class: 'mini-label' }, 'Quote from your rate card'),
    h('div', { class: 'quote' },
      (d.quote || []).map((l, i) => h('div', { class: 'quote-row' },
        h('input', { value: l.item, 'aria-label': 'Item', onchange: (e) => { l.item = e.target.value; commit(); } }),
        h('input', { type: 'number', value: l.price, 'aria-label': 'Price', onchange: (e) => { l.price = Number(e.target.value) || 0; commit(); } }),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Remove line', onclick: () => { d.quote.splice(i, 1); commit(); } }, icon('x', 14)))),
      h('div', { class: 'quote-row total' }, addSel, h('b', $(quoteTotal(d))), h('span'))),
    d.stage === 'won' ? h('div', { class: 'contract' },
      h('div', { class: 'mini-label' }, 'Contract'),
      h('div', { class: 'row' }, chip(d.contract?.status || 'none', d.contract?.status === 'signed' ? 'green' : d.contract?.status === 'received' ? 'warn' : ''),
        h('span', { class: 'muted small' }, 'Contract value'), h('input', { type: 'number', class: 'narrow', value: d.contract?.value || 0, onchange: (e) => { d.contract.value = Number(e.target.value) || 0; if (d.contract.status === 'none') d.contract.status = 'received'; commit(); } }),
        d.contract?.status !== 'signed' ? btn('Check contract', () => runOne(a), { sm: true, ic: 'check' }) : null)) : null,
    h('div', { class: 'mini-label' }, d.stage === 'sent' ? 'Follow up' : 'Reply'),
    draftBox,
    h('div', { class: 'ask-row' }, ask, btn('Redraft', async (ev) => {
      if (!ask.value.trim()) return;
      ev.currentTarget.disabled = true;
      const text = await redraft(a, `Client: ${d.client}\nWants: ${d.want}\nBudget: ${d.budget}\nQuote: ${(d.quote || []).map((l) => `${l.item} ${$(l.price)}`).join(', ')}`, draftBox.value, ask.value.trim());
      ev.currentTarget.disabled = false;
      if (text) { draftBox.value = text; d.draft = text; ask.value = ''; saveState(S, renderSaveStatus); }
    }, { ic: 'sparkles', sm: true })),
    h('div', { class: 'row' },
      ['new', 'drafted', 'negotiating'].includes(d.stage) ? btn('Send', () => { d.draft = draftBox.value; sendDeal(S, d, a); S.approvals = S.approvals.filter((x) => x.refId !== d.id); commit(`Sent to ${d.client}`); }, { kind: 'primary', ic: 'send' }) : null,
      d.stage === 'sent' && pendingAp ? btn('Review follow up', () => reviewApproval(pendingAp), { kind: 'primary', ic: 'send' }) : null,
      d.stage === 'new' || !d.draft ? btn('Draft it for me', () => { if (!d.quote?.length) d.quote = buildQuote(S, d); d.draft = replyDraft(S, d); if (d.stage === 'new') d.stage = 'drafted'; commit('Drafted'); }, { ic: 'sparkles', kind: 'ghost' }) : null,
      d.stage !== 'won' && d.stage !== 'lost' ? btn('Mark as won', () => { d.stage = 'won'; d.contract = { status: 'received', value: quoteTotal(d) || Number(d.budget) || 0 }; commit('Won 🎉 – the Deal Manager will check the contract'); }, { kind: 'ghost', ic: 'check' }) : null));
}

function dealForm(d) {
  openForm({
    title: d ? `Edit ${d.client}` : 'New deal',
    fields: [
      { key: 'client', label: 'Client / business' }, { key: 'contact', label: 'Contact name' }, { key: 'email', label: 'Email' },
      { key: 'budget', label: `Budget (${cur()})`, type: 'number' }, { key: 'want', label: 'What they want', full: true }, { key: 'deadline', label: 'Deadline', type: 'date' },
      { key: 'stage', label: 'Stage', type: 'select', options: ['new', 'drafted', 'sent', 'negotiating', 'won', 'lost'] },
    ],
    values: d || { stage: 'new' },
    onSave: (v) => {
      if (!v.client) return false;
      if (d) Object.assign(d, v); else S.deals.unshift({ id: uid('dl'), ...v, quote: [], draft: '', lastContactAt: nowIso(), followUps: 0, contract: { status: 'none', value: 0 }, createdAt: nowIso() });
      commit('Saved');
    },
    onDelete: d ? () => { S.deals = S.deals.filter((x) => x !== d); S.approvals = S.approvals.filter((x) => x.refId !== d.id); commit('Deleted'); } : null,
  });
}

// Project Manager ─ board
function projectsDesk(el, a) {
  const live = S.projects.filter((p) => p.stage !== 'Live');
  mount(el,
    deskHead(a, `${live.length} live jobs · ${$(sum(live, (p) => p.value))} in progress`, btn('New job', () => projectForm(), { kind: 'ghost', ic: 'plus' })),
    deskUpdate(a),
    h('div', { class: 'board' }, PROJECT_STAGES.map((stage, si) => h('div', { class: 'col' },
      h('div', { class: 'col-head' }, h('b', stage), h('span', { class: 'count' }, S.projects.filter((p) => p.stage === stage).length)),
      S.projects.filter((p) => p.stage === stage).map((p) => {
        const late = p.due && stage !== 'Live' && daysSince(p.due) > 0;
        return h('div', { class: `job ${late ? 'late' : ''}`, vars: { '--c': a.color } },
          h('div', { class: 'row between' }, h('b', p.client), h('button', { class: 'icon-btn sm', 'aria-label': 'Edit job', onclick: () => projectForm(p) }, icon('edit', 13))),
          h('small', p.title), h('div', { class: 'row' }, chip($(p.value), 'green'), p.due ? chip(late ? `${daysSince(p.due)}d late` : `due ${relDay(p.due)}`, late ? 'red' : '') : null),
          p.notes ? h('small', { class: 'muted' }, p.notes) : null,
          h('div', { class: 'row move' },
            si > 0 ? h('button', { class: 'icon-btn sm', 'aria-label': 'Move back', onclick: () => { p.stage = PROJECT_STAGES[si - 1]; commit(); } }, icon('back', 13)) : h('span'),
            si < PROJECT_STAGES.length - 1 ? h('button', { class: 'icon-btn sm', 'aria-label': 'Move forward', onclick: () => { p.stage = PROJECT_STAGES[si + 1]; if (p.stage === 'Live') log(S, a.id, 'you', `${p.client} – ${p.title} is live 🚀`); commit(); } }, icon('arrow', 13)) : null));
      })))));
}
function projectForm(p) {
  openForm({
    title: p ? `Edit ${p.client}` : 'New job',
    fields: [
      { key: 'client', label: 'Client' }, { key: 'title', label: 'Job' }, { key: 'value', label: `Value (${cur()})`, type: 'number' },
      { key: 'stage', label: 'Stage', type: 'select', options: PROJECT_STAGES }, { key: 'kickoff', label: 'Kickoff', type: 'date' }, { key: 'due', label: 'Due', type: 'date' }, { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    values: p || { stage: 'Signed', due: addDaysIso(21) },
    onSave: (v) => { if (!v.client) return false; if (p) Object.assign(p, v); else S.projects.unshift({ id: uid('p'), ...v }); commit('Saved'); },
    onDelete: p ? () => { S.projects = S.projects.filter((x) => x !== p); commit('Deleted'); } : null,
  });
}

// Scriptwriter
function scriptsDesk(el, a) {
  const order = { drafted: 0, brief: 1, approved: 2, posted: 3 };
  const list = [...S.scripts].sort((x, y) => (order[x.status] - order[y.status]) || String(x.postBy).localeCompare(String(y.postBy)));
  const sel = S.scripts.find((x) => x.id === SEL[a.id]) || list[0];
  const tone = { brief: '', drafted: 'hot', approved: 'green', posted: 'blue' };
  mount(el,
    deskHead(a, `${S.scripts.filter((x) => x.status === 'drafted').length} waiting for sign-off · ${S.scripts.filter((x) => x.status === 'brief').length} briefs`, btn('New brief', () => scriptForm(), { kind: 'ghost', ic: 'plus' })),
    h('div', { class: 'split-pane' },
      card({ class: 'list-pane' }, list.length ? list.map((sc) => h('button', { class: `list-row ${sel === sc ? 'on' : ''}`, onclick: () => { SEL[a.id] = sc.id; scriptsDesk(el, a); } },
        h('div', { class: 'row between' }, h('b', sc.title), h('small', { class: 'muted' }, sc.postBy ? relDay(sc.postBy) : '')),
        h('small', { class: 'muted' }, `${sc.client} · ${sc.platform}`), h('div', { class: 'row' }, chip(sc.status, tone[sc.status])))) : empty('No scripts yet.')),
      sel ? scriptDetail(sel, a) : card({}, empty('Add a brief to get started.'))));
}
function scriptDetail(sc, a) {
  const part = (key, label, rows) => h('label', { class: 'field full' }, h('span', label), h('textarea', { rows, value: sc[key] || '', onchange: (e) => { sc[key] = e.target.value; if (sc.status === 'brief' && sc.hook) sc.status = 'drafted'; saveState(S, renderSaveStatus); } }));
  const ask = h('input', { placeholder: `Ask the ${a.name}, e.g. “punchier hook” or “add a stat”` });
  return card({ class: 'detail', color: a.color },
    h('div', { class: 'row between' }, h('div', h('h2', sc.title), h('small', { class: 'muted' }, `${sc.client} · ${sc.platform} · post by ${shortDate(sc.postBy)}`)),
      h('button', { class: 'icon-btn', 'aria-label': 'Edit script details', onclick: () => scriptForm(sc) }, icon('edit'))),
    part('hook', 'Hook (first 2 seconds)', 2), part('body', 'Body', 6), part('cta', 'Call to action', 2),
    h('div', { class: 'ask-row' }, ask, btn('Rewrite', async (ev) => {
      ev.currentTarget.disabled = true;
      const instruction = ask.value.trim() || 'Write this script.';
      if (store.ai) {
        const text = await redraft(a, `Short-form video script for ${sc.client} on ${sc.platform}. Title: ${sc.title}. Reply as three parts labelled HOOK:, BODY:, CTA:`, `HOOK: ${sc.hook}\nBODY: ${sc.body}\nCTA: ${sc.cta}`, instruction);
        if (text) {
          const grab = (k) => (text.match(new RegExp(`${k}:\\s*([\\s\\S]*?)(?=\\n\\s*(HOOK|BODY|CTA):|$)`, 'i')) || [])[1]?.trim();
          sc.hook = grab('HOOK') || sc.hook; sc.body = grab('BODY') || sc.body; sc.cta = grab('CTA') || sc.cta;
          if (sc.status === 'brief') sc.status = 'drafted';
          commit('Rewritten');
        }
      } else { sc.hook = ''; sc.body = ''; sc.cta = ''; writeScript(S, sc); commit('Drafted from the template – connect Claude for custom rewrites'); }
      ev.currentTarget.disabled = false;
    }, { ic: 'sparkles', sm: true })),
    h('div', { class: 'row' },
      sc.status !== 'approved' && sc.status !== 'posted' ? btn('Sign off', () => { sc.status = 'approved'; S.approvals = S.approvals.filter((x) => x.refId !== sc.id); log(S, a.id, 'you', `“${sc.title}” signed off – ready to film`); commit('Signed off ✅'); }, { kind: 'primary', ic: 'check' }) : null,
      sc.status === 'approved' ? btn('Mark as posted', () => { sc.status = 'posted'; commit('Posted 🎬'); }, { kind: 'primary', ic: 'check' }) : null));
}
function scriptForm(sc) {
  openForm({
    title: sc ? 'Edit script details' : 'New brief',
    fields: [
      { key: 'title', label: 'Topic / title', full: true }, { key: 'client', label: 'For' },
      { key: 'platform', label: 'Platform', type: 'select', options: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'LinkedIn', 'Facebook'] },
      { key: 'postBy', label: 'Post by', type: 'date' }, { key: 'status', label: 'Status', type: 'select', options: ['brief', 'drafted', 'approved', 'posted'] },
    ],
    values: sc || { client: S.profile.business, platform: 'TikTok', postBy: addDaysIso(5), status: 'brief' },
    onSave: (v) => { if (!v.title) return false; if (sc) Object.assign(sc, v); else S.scripts.push({ id: uid('s'), ...v, hook: '', body: '', cta: '' }); commit(sc ? 'Saved' : 'Brief added – the Scriptwriter will write it on the next run'); },
    onDelete: sc ? () => { S.scripts = S.scripts.filter((x) => x !== sc); S.approvals = S.approvals.filter((x) => x.refId !== sc.id); commit('Deleted'); } : null,
  });
}

// Finance
function incomeDesk(el, a) {
  const e = earnings(S);
  const ch = S.settings.chase;
  const tone = { paid: 'green', overdue: 'red', sent: 'blue', draft: '' };
  const rows = [...S.invoices].sort((x, y) => ({ overdue: 0, draft: 1, sent: 2, paid: 3 }[x.status] - { overdue: 0, draft: 1, sent: 2, paid: 3 }[y.status]) || String(y.issued).localeCompare(String(x.issued)));
  const stat = (label, value, sub, cls) => h('div', { class: `stat ${cls || ''}` }, h('small', label), h('b', value), h('span', sub));
  mount(el,
    deskHead(a, `${$(e.owed)} owed · ${S.invoices.filter((i) => i.status === 'overdue').length} overdue`, btn('New invoice', () => invoiceForm(), { kind: 'ghost', ic: 'plus' })),
    card({ class: 'stats-row' }, stat('Received this quarter', $(e.received), `${e.counts.received} payments`, 'a1'), stat('Owed to you', $(e.owed), `${e.counts.owed} invoices`, 'a2'), stat('Overdue', $(e.overdue), 'Being chased', 'red'), stat('In the pipeline', $(e.pipeline), 'Not invoiced yet', 'a3')),
    deskUpdate(a),
    card({ class: 'table-card' },
      cardHead('Invoices'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', h('tr', ['Invoice', 'Client', 'For', 'Amount', 'Due', 'Status', 'Chasers', ''].map((t) => h('th', t)))),
        h('tbody', rows.map((i) => h('tr',
          h('td', h('b', i.number)), h('td', i.client), h('td', { class: 'muted' }, i.title), h('td', h('b', $(i.amount))),
          h('td', i.due ? `${shortDate(i.due)}${i.status === 'overdue' ? ` (${daysSince(i.due)}d late)` : ''}` : '–'),
          h('td', chip(i.status, tone[i.status])),
          h('td', h('span', { class: 'chase-dots' }, ['friendly', 'firmer', 'final'].map((st, k) => h('i', { class: (i.chases || []).length > k ? 'on' : '', title: st })))),
          h('td', { class: 'actions' },
            i.status !== 'paid' && i.status !== 'draft' ? btn('Mark paid', () => { i.status = 'paid'; i.paidAt = nowIso(); i.matched = true; log(S, a.id, 'you', `${$(i.amount)} from ${i.client} matched to ${i.number}`); S.approvals = S.approvals.filter((x) => x.refId !== i.id); commit('Marked as paid 💷'); }, { sm: true, kind: 'ghost' }) : null,
            i.status === 'overdue' ? btn('Chase', () => {
              const step = ['friendly', 'firmer', 'final'][(i.chases || []).length] || 'final';
              const ap = addApproval(S, { agentId: a.id, kind: 'chase', refId: i.id, title: `${step[0].toUpperCase()}${step.slice(1)} reminder to ${i.client} is ready`, sub: `${i.number} · ${$(i.amount)} · ${daysSince(i.due)} days late`, body: chaseText(S, i, step) }) || S.approvals.find((x) => x.refId === i.id);
              reviewApproval(ap); saveState(S, renderSaveStatus);
            }, { sm: true }) : null,
            h('button', { class: 'icon-btn sm', 'aria-label': 'Edit invoice', onclick: () => invoiceForm(i) }, icon('edit', 13))))))))),
    card({ class: 'chase-card' }, cardHead('Chasing rules'),
      h('p', { class: 'muted small' }, 'How long after the due date each reminder goes out. Set Finance to “Act on its own” in Edit agent to send these without asking.'),
      h('div', { class: 'rule-row' }, [['friendlyAfter', 'Friendly'], ['firmerAfter', 'Firmer'], ['finalAfter', 'Final notice'], ['callAfter', 'Flag for a call']].map(([k, l]) => h('label', { class: 'field' }, h('span', `${l} after (days)`), h('input', { type: 'number', value: ch[k], onchange: (e) => { ch[k] = Number(e.target.value) || 0; commit('Saved'); } }))))));
}
function invoiceForm(i) {
  openForm({
    title: i ? `Edit ${i.number}` : 'New invoice',
    fields: [
      { key: 'number', label: 'Number' }, { key: 'client', label: 'Client' }, { key: 'title', label: 'For', full: true }, { key: 'amount', label: `Amount (${cur()})`, type: 'number' },
      { key: 'issued', label: 'Issued', type: 'date' }, { key: 'due', label: 'Due', type: 'date' }, { key: 'status', label: 'Status', type: 'select', options: ['draft', 'sent', 'overdue', 'paid'] }, { key: 'paidAt', label: 'Paid on', type: 'date' },
    ],
    values: i || { number: nextInvoiceNumber(S), issued: today(), due: addDaysIso(14), status: 'sent' },
    onSave: (v) => { if (!v.client || !v.amount) { toast('Add a client and amount', 'bad'); return false; } if (i) Object.assign(i, v); else S.invoices.unshift({ id: uid('i'), chases: [], ...v }); commit('Saved'); },
    onDelete: i ? () => { S.invoices = S.invoices.filter((x) => x !== i); S.approvals = S.approvals.filter((x) => x.refId !== i.id); commit('Deleted'); } : null,
  });
}

// Agents you add yourself
function customDesk(el, a) {
  mount(el,
    deskHead(a, a.role || 'Custom agent'),
    !store.ai ? card({ class: 'note' }, h('p', h('b', 'This agent follows its written instructions using Claude. '), store.mode === 'server' ? 'Add ANTHROPIC_API_KEY to your server’s .env file and restart to switch it on.' : 'Open HQ from your CM Automations server with ANTHROPIC_API_KEY set to switch it on.')) : null,
    deskUpdate(a));
}

// ── Results ─────────────────────────────────────────────────────────────────
// Every client's goal, the daily actions that build up to it, and what's been
// done over the last week, 30 days, 3 months or 6 months.
let RESULT_PERIOD = 30;
let RESULT_DAY = null; // which day the checklist shows (null = today)

const isMoney = (r) => !r.unit || r.unit === '£' || r.unit === cur();
const fmtVal = (r, v) => (isMoney(r) ? $(v) : `${Math.round(Number(v) || 0).toLocaleString('en-GB')} ${r.unit}`);
const fmtShort = (r, v) => {
  const n = Number(v) || 0;
  const s = Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n));
  return isMoney(r) ? `${cur()}${s}` : s;
};
const pct = (x) => `${Math.round(x * 100)}%`;
const goalLine = (r) => `${fmtVal(r, r.baseline)} → ${fmtVal(r, r.goal)}${Number(r.stretch) > Number(r.goal) ? `–${fmtVal(r, r.stretch)}` : ''} ${isMoney(r) ? 'a month ' : ''}by ${shortDate(endDate(r))}`;
const statusChip = (p) => chip(STATUS[p.status][0], STATUS[p.status][1]);

function goalBar(r, p) {
  return h('div', { class: 'goal-bar', title: `${pct(p.toGoal)} of the way to the goal` },
    h('i', { style: { width: pct(p.toGoal) } }),
    h('b', { class: 'expected', style: { left: pct(Math.min(1, p.timeUsed)) }, title: 'Where they should be by now' }));
}

function resultsOverview(el) {
  const list = S.results || [];
  const t = portfolio(list);
  const step = (n, title, big, text) => h('div', { class: 'chain-step' }, h('span', { class: 'chain-n' }, n), h('small', title), h('b', big), h('p', { class: 'muted' }, text));
  mount(el,
    pageHead('Results', 'Every client’s goal, where they are now, and the daily work that gets them there.', btn('Add a client goal', () => resultForm(), { kind: 'primary', ic: 'plus' })),
    card({ class: 'chain' },
      step(1, 'What we deliver', `${list.length} brand${list.length === 1 ? '' : 's'} on a plan`, 'Systems, content and a daily action plan for each brand.'),
      h('span', { class: 'chain-arrow', 'aria-hidden': 'true' }, icon('arrow', 22)),
      step(2, 'The brands’ result', `${$(t.now)}/mo`, `Up from ${$(t.baseline)} at the start, heading for ${$(t.goal)} a month. ${t.onTrack} of ${t.clients} on track.`),
      h('span', { class: 'chain-arrow', 'aria-hidden': 'true' }, icon('arrow', 22)),
      step(3, 'Their customers’ result', 'Faster, better service', 'More of their customers get looked after properly – and they come back and tell their friends.')),
    h('div', { class: 'section-title' }, h('h2', 'Clients'), h('span', { class: 'muted small' }, `${t.doneToday} of ${t.actionsToday} daily actions done today`)),
    list.length ? h('div', { class: 'result-grid' }, list.map((r) => {
      const p = progress(r);
      const acts = actionsOn(r);
      const done = acts.filter((a) => doneOn(r, today()).has(a.id)).length;
      const st = streak(r);
      return h('a', { class: `result-card ${p.status}`, href: `#/results/${r.id}` },
        h('div', { class: 'row between' }, h('b', r.client), statusChip(p)),
        h('small', { class: 'muted' }, goalLine(r)),
        h('div', { class: 'result-now' }, h('b', fmtVal(r, p.now)), h('span', { class: p.growth >= 0 ? 'up' : 'down' }, `${p.growth >= 0 ? '+' : ''}${pct(p.growth)} since start`)),
        goalBar(r, p),
        h('div', { class: 'row between small muted' }, h('span', `${pct(p.toGoal)} to goal`), h('span', `Month ${p.month} of ${r.months} · day ${Math.min(p.day, p.totalDays)}`)),
        h('div', { class: 'today-mini' }, h('span', `Today ${done}/${acts.length}`), h('div', { class: 'mini-bar' }, h('i', { style: { width: acts.length ? pct(done / acts.length) : '0%' } })), st ? h('span', `🔥 ${st}-day streak`) : null));
    })) : card({}, empty('No client goals yet. Add one to start tracking their results.')));
}

function resultsClient(el, r) {
  const p = progress(r);
  const day = RESULT_DAY && RESULT_DAY >= r.startDate && RESULT_DAY <= today() ? RESULT_DAY : today();
  const stat = (label, value, sub, cls) => h('div', { class: `stat ${cls || ''}` }, h('small', label), h('b', value), h('span', sub));
  mount(el,
    h('a', { class: 'back-link', href: '#/results' }, icon('back', 14), 'All results'),
    h('div', { class: 'desk-head' },
      h('span', { class: 'avatar xl', style: { background: PALETTE[(S.results || []).indexOf(r) % PALETTE.length] } }, r.client[0] || '?'),
      h('div', { class: 'grow' }, h('h1', r.client), h('p', { class: 'sub' }, `${r.metric}: ${goalLine(r)}`)),
      h('div', { class: 'row' }, statusChip(p), btn('Edit goal', () => resultForm(r), { kind: 'ghost', ic: 'edit' }))),
    card({ class: 'stats-row five' },
      stat('Started at', fmtVal(r, r.baseline), shortDate(r.startDate)),
      stat('Now', fmtVal(r, p.now), `${p.growth >= 0 ? '+' : ''}${pct(p.growth)} since start`, 'a1'),
      stat('Goal', fmtVal(r, r.goal), `${pct(p.toGoal)} of the way`, 'a2'),
      stat('Stretch', Number(r.stretch) > Number(r.goal) ? fmtVal(r, r.stretch) : '–', Number(r.stretch) > Number(r.goal) ? `${pct(p.toStretch)} of the way` : 'not set', 'a3'),
      stat('Time used', `Month ${p.month} of ${r.months}`, `Day ${Math.min(p.day, p.totalDays)} of ${p.totalDays}`)),
    h('div', { class: 'desk-grid' },
      card({ class: 'chart-card' }, cardHead(`${r.metric} vs the plan`, `goal ${fmtShort(r, r.goal)}${Number(r.stretch) > Number(r.goal) ? ` · stretch ${fmtShort(r, r.stretch)}` : ''}`, h('span', { class: 'legend-inline' }, dot('var(--a1)'), 'Actual', dot('var(--faint)'), 'Plan to goal')), resultChart(r)),
      todayCard(r, day)),
    doneCard(r),
    roadmapCard(r),
    card({ class: 'chain small-chain' },
      ['us', 'brand', 'customers'].map((k, i) => [
        i ? h('span', { class: 'chain-arrow', 'aria-hidden': 'true' }, icon('arrow', 18)) : null,
        h('div', { class: 'chain-step' }, h('span', { class: 'chain-n' }, i + 1), h('small', ['What we deliver', `${r.client}’s result`, 'Their customers’ result'][i]), h('p', (r.chain || {})[k] || h('span', { class: 'muted' }, 'Not written yet – click Edit goal.')))])),
    h('div', { class: 'desk-grid even' }, checkinsCard(r), winsCard(r)),
    actionsCard(r));
}

function todayCard(r, day) {
  const acts = actionsOn(r, day);
  const set = doneOn(r, day);
  const done = acts.filter((a) => set.has(a.id)).length;
  const go = (n) => { const d = addDaysIso(n, new Date(day + 'T12:00:00')); RESULT_DAY = d > today() ? today() : d < r.startDate ? r.startDate : d; render(); };
  return card({ class: 'today-card', color: 'var(--a1)' },
    h('div', { class: 'card-head' },
      h('h2', day === today() ? 'Today’s actions' : `Actions on ${shortDate(day)}`),
      h('div', { class: 'row' },
        h('button', { class: 'icon-btn sm', 'aria-label': 'Previous day', onclick: () => go(-1), disabled: day <= r.startDate }, icon('back', 14)),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Next day', onclick: () => go(1), disabled: day >= today() }, icon('arrow', 14)))),
    h('div', { class: 'today-progress' }, h('b', `${done}/${acts.length}`), h('div', { class: 'mini-bar big' }, h('i', { style: { width: acts.length ? pct(done / acts.length) : '0%' } })), h('span', { class: 'muted small' }, streak(r) ? `🔥 ${streak(r)}-day streak` : 'Start a streak today')),
    acts.length ? h('div', { class: 'checklist' }, acts.map((a) => h('label', { class: `check-row ${set.has(a.id) ? 'done' : ''}` },
      h('input', { type: 'checkbox', checked: set.has(a.id), onchange: () => { const on = toggleAction(r, a.id, day); commit(on && done + 1 === acts.length ? 'Every action done – that’s how it builds 🔥' : null); } }),
      h('span', a.title)))) : empty(day < r.startDate ? 'Before the plan started.' : 'No daily actions set for this month – add some below.'),
    h('p', { class: 'muted small' }, `${sum(Object.values(r.log || {}), (x) => x.length)} actions done since ${shortDate(r.startDate)} – each one builds on the last.`));
}

function doneCard(r) {
  const s = periodSummary(r, RESULT_PERIOD);
  const select = h('select', { class: 'period-select', 'aria-label': 'Period', onchange: (e) => { RESULT_PERIOD = Number(e.target.value); render(); } },
    PERIODS.map(([d, l]) => h('option', { value: d, selected: d === RESULT_PERIOD }, l)));
  const stat = (label, value, sub, cls) => h('div', { class: `stat ${cls || ''}` }, h('small', label), h('b', value), h('span', sub));
  const shown = [...s.perDay].reverse().filter((d) => d.done);
  return card({ class: 'done-card' },
    cardHead('What’s been done', `${shortDate(s.from)} – ${shortDate(s.to)}`, select),
    h('div', { class: 'stats-row' },
      stat('Actions done', `${s.done}`, `of ${s.possible} (${pct(s.rate)})`, 'a1'),
      stat('Perfect days', `${s.perfectDays}`, `of ${s.days} days`, 'a2'),
      stat(`${r.metric} change`, `${s.change >= 0 ? '+' : ''}${fmtVal(r, s.change)}`, `${fmtShort(r, s.startValue)} → ${fmtShort(r, s.endValue)}`, s.change >= 0 ? 'a3' : 'red'),
      stat('Wins', `${s.wins.length}`, s.wins[0] ? s.wins[0].text : 'None logged yet')),
    h('div', { class: 'done-grid' },
      h('div', h('div', { class: 'mini-label' }, 'Day by day'), heatmap(s), h('div', { class: 'heat-legend muted small' }, 'Less', [0, 0.34, 0.67, 1].map((x) => h('i', { vars: { '--r': String(x) } })), 'More')),
      h('div', h('div', { class: 'mini-label' }, 'Each daily action'),
        s.perAction.length ? s.perAction.map((x) => h('div', { class: 'action-stat' },
          h('div', { class: 'row between' }, h('span', { class: 'truncate' }, x.action.title), h('b', `${x.done}/${x.possible}`)),
          h('div', { class: 'mini-bar' }, h('i', { style: { width: pct(x.possible ? x.done / x.possible : 0) } })))) : empty('Nothing in this period yet.'))),
    s.wins.length || s.checkins.length ? h('div', { class: 'period-notes' },
      s.wins.map((w) => h('div', { class: 'note-row' }, chip('Win', 'green'), h('span', w.text), h('small', { class: 'muted' }, shortDate(w.date)))),
      s.checkins.map((c) => h('div', { class: 'note-row' }, chip('Check-in', 'blue'), h('span', `${fmtVal(r, c.value)}${c.note ? ` – ${c.note}` : ''}`), h('small', { class: 'muted' }, shortDate(c.date))))) : null,
    h('details', { class: 'day-log' }, h('summary', `Show each day (${shown.length} active day${shown.length === 1 ? '' : 's'})`),
      shown.slice(0, 120).map((d) => h('div', { class: 'day-log-row' }, h('b', shortDate(d.date)), h('span', { class: 'muted' }, `${d.done}/${d.possible}`), h('span', d.items.join(' · '))))));
}

function heatmap(s) {
  const first = new Date(s.from + 'T12:00:00');
  const pad = (first.getDay() + 6) % 7; // Monday first
  const cells = [...Array(pad).fill(null), ...s.perDay];
  return h('div', { class: `heat ${s.days > 40 ? 'small' : ''}` }, cells.map((d) => (d
    ? h('i', { vars: { '--r': String(d.possible ? d.done / d.possible : 0) }, title: `${shortDate(d.date)}: ${d.done}/${d.possible}` })
    : h('i', { class: 'blank' }))));
}

function resultChart(r) {
  const W = 640; const H = 230; const L = 52; const R = 16; const T = 16; const B = 30;
  const total = totalDays(r);
  const pts = [{ day: 0, v: Number(r.baseline) || 0 }, ...[...(r.checkins || [])].sort((a, b) => a.date.localeCompare(b.date)).map((c) => ({ day: programmeDay(r, c.date) - 1, v: Number(c.value) || 0 }))].filter((x) => x.day >= 0);
  const top = Math.max(Number(r.goal) * 1.12, ...pts.map((x) => x.v * 1.08));
  const bottom = Math.min(Number(r.baseline) * 0.85, ...pts.map((x) => x.v * 0.95));
  const x = (d) => L + (Math.min(d, total) / total) * (W - L - R);
  const y = (v) => T + (1 - (v - bottom) / (top - bottom || 1)) * (H - T - B);
  const svg = h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': `${r.metric} against the plan` });
  const add = (tag, attrs) => { const el = h(tag, attrs); svg.appendChild(el); return el; };
  // Selected period shading.
  const from = Math.max(0, programmeDay(r) - RESULT_PERIOD);
  add('rect', { x: x(from), y: T, width: Math.max(0, x(Math.min(programmeDay(r), total)) - x(from)), height: H - T - B, fill: 'var(--a1)', opacity: 0.06 });
  // Grid + labels.
  for (let i = 0; i <= 3; i++) {
    const v = bottom + ((top - bottom) * i) / 3;
    add('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'var(--line)', 'stroke-width': 1 });
    add('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'chart-label' }).textContent = fmtShort(r, v);
  }
  for (let m = 1; m <= (Number(r.months) || 6); m++) add('text', { x: x(m * 30) - 2, y: H - 10, 'text-anchor': 'end', class: 'chart-label' }).textContent = `M${m}`;
  // Plan line + goal.
  add('line', { x1: x(0), y1: y(Number(r.baseline)), x2: x(total), y2: y(Number(r.goal)), stroke: 'var(--faint)', 'stroke-width': 2, 'stroke-dasharray': '6 6' });
  // Today.
  const td = Math.min(programmeDay(r) - 1, total);
  add('line', { x1: x(td), x2: x(td), y1: T, y2: H - B, stroke: 'var(--a2)', 'stroke-width': 1, 'stroke-dasharray': '2 4' });
  add('text', { x: x(td) + 4, y: H - B - 6, class: 'chart-label' }).textContent = 'Today';
  // Actual: area + line + dots.
  const d = pts.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.day)},${y(pt.v)}`).join(' ');
  if (pts.length > 1) add('path', { d: `${d} L${x(pts[pts.length - 1].day)},${H - B} L${x(0)},${H - B} Z`, fill: 'var(--a1)', opacity: 0.12 });
  add('path', { d, fill: 'none', stroke: 'var(--a1)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  pts.forEach((pt, i) => {
    const last = i === pts.length - 1;
    const c = add('circle', { cx: x(pt.day), cy: y(pt.v), r: last ? 6 : 4, fill: last ? 'var(--a1)' : 'var(--panel)', stroke: 'var(--a1)', 'stroke-width': 2 });
    c.appendChild(h('title', `${fmtVal(r, pt.v)}`));
  });
  if (pts.length) { const lp = pts[pts.length - 1]; add('text', { x: Math.min(x(lp.day) + 10, W - R - 60), y: y(lp.v) - 10, class: 'chart-label strong' }).textContent = fmtShort(r, lp.v); }
  return h('div', { class: 'chart-wrap' }, svg);
}

function roadmapCard(r) {
  const ms = milestones(r);
  return card({ class: 'roadmap' }, cardHead(`${r.months}-month roadmap`, `to ${fmtVal(r, r.goal)}`),
    h('div', { class: 'milestones' }, ms.map((m) => {
      const state = m.current ? 'current' : m.passed ? (m.hit ? 'hit' : 'missed') : 'next';
      return h('button', { class: `milestone ${state}`, onclick: () => openForm({ title: `Month ${m.month} – ${r.client}`, fields: [{ key: 'note', label: 'Focus or notes for this month', type: 'textarea' }], values: { note: m.note }, onSave: (v) => { r.milestoneNotes = { ...(r.milestoneNotes || {}), [m.month]: v.note }; commit('Saved'); } }) },
        h('small', `Month ${m.month} · ${shortDate(m.date)}`), h('b', fmtShort(r, m.target)),
        h('span', { class: 'ms-state' }, { hit: `✓ Hit (${fmtShort(r, m.value)})`, missed: `Reached ${fmtShort(r, m.value)}`, current: 'This month', next: 'Coming up' }[state]),
        m.note ? h('small', { class: 'muted' }, m.note) : null);
    })));
}

function checkinsCard(r) {
  const rows = [...(r.checkins || [])].sort((a, b) => b.date.localeCompare(a.date));
  return card({}, cardHead('Check-ins', `${r.metric}`, btn('Log a check-in', () => checkinForm(r), { sm: true, kind: 'primary', ic: 'plus' })),
    rows.length ? h('div', { class: 'note-list' }, rows.map((c) => h('div', { class: 'note-row' },
      h('b', fmtVal(r, c.value)), h('span', { class: 'muted grow' }, c.note || ''), h('small', { class: 'muted' }, shortDate(c.date)),
      h('button', { class: 'icon-btn sm', 'aria-label': 'Edit check-in', onclick: () => checkinForm(r, c) }, icon('edit', 13))))) : empty(`Log their ${String(r.metric).toLowerCase()} once a month to see the line move.`));
}
function checkinForm(r, c) {
  openForm({
    title: c ? 'Edit check-in' : `Log ${r.metric.toLowerCase()} – ${r.client}`,
    fields: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'value', label: `${r.metric} (${r.unit || cur()})`, type: 'number' }, { key: 'note', label: 'What drove it?', full: true }],
    values: c || { date: today(), value: progress(r).now },
    onSave: (v) => { if (v.value == null || !v.date) { toast('Add a date and a number', 'bad'); return false; } if (c) Object.assign(c, v); else r.checkins = [...(r.checkins || []), { id: uid('ck'), ...v }]; commit('Check-in saved'); },
    onDelete: c ? () => { r.checkins = r.checkins.filter((x) => x !== c); commit('Deleted'); } : null,
  });
}

function winsCard(r) {
  const rows = [...(r.wins || [])].sort((a, b) => b.date.localeCompare(a.date));
  return card({}, cardHead('Wins', null, btn('Add a win', () => winForm(r), { sm: true, kind: 'ghost', ic: 'plus' })),
    rows.length ? h('div', { class: 'note-list' }, rows.map((w) => h('div', { class: 'note-row' }, h('span', '🏆'), h('span', { class: 'grow' }, w.text), h('small', { class: 'muted' }, shortDate(w.date)),
      h('button', { class: 'icon-btn sm', 'aria-label': 'Edit win', onclick: () => winForm(r, w) }, icon('edit', 13))))) : empty('Log the wins as they happen – they make the best testimonials.'));
}
function winForm(r, w) {
  openForm({
    title: w ? 'Edit win' : `New win for ${r.client}`,
    fields: [{ key: 'text', label: 'What happened?', full: true }, { key: 'date', label: 'Date', type: 'date' }],
    values: w || { date: today() },
    onSave: (v) => { if (!v.text) return false; if (w) Object.assign(w, v); else { r.wins = [...(r.wins || []), { id: uid('w'), ...v }]; log(S, 'you', 'you', `Win for ${r.client}: ${v.text}`); } commit('🏆 Saved'); },
    onDelete: w ? () => { r.wins = r.wins.filter((x) => x !== w); commit('Deleted'); } : null,
  });
}

function actionsCard(r) {
  const months = Array.from({ length: Number(r.months) || 6 }, (_, i) => i + 1);
  const sel = (a, key) => h('select', { 'aria-label': key === 'fromMonth' ? 'From month' : 'To month', onchange: (e) => { a[key] = Number(e.target.value); commit(); } }, months.map((m) => h('option', { value: m, selected: Number(a[key] || (key === 'fromMonth' ? 1 : months.length)) === m }, `M${m}`)));
  return card({}, cardHead('Daily actions', 'what they do each day', btn('Add action', () => { r.actions = [...(r.actions || []), { id: uid('act'), title: 'New daily action', fromMonth: monthOf(r), toMonth: Number(r.months) || 6 }]; commit(); }, { sm: true, kind: 'ghost', ic: 'plus' })),
    h('p', { class: 'muted small' }, 'Set which months each action runs, so the plan builds as they grow (e.g. “pitch commercial contracts” from month 4).'),
    h('div', { class: 'rate-rows' }, (r.actions || []).map((a) => h('div', { class: 'action-row' },
      h('input', { value: a.title, 'aria-label': 'Action', onchange: (e) => { a.title = e.target.value; commit(); } }),
      sel(a, 'fromMonth'), h('span', { class: 'muted small' }, 'to'), sel(a, 'toMonth'),
      h('button', { class: 'icon-btn sm', 'aria-label': 'Remove action', onclick: () => confirmBox(`Remove “${a.title}”? Its history stays in the log.`, () => { r.actions = r.actions.filter((x) => x !== a); commit('Removed'); }, { yes: 'Remove' }) }, icon('trash', 14))))));
}

function resultForm(r) {
  const v = r ? { ...r, chain_us: r.chain?.us, chain_brand: r.chain?.brand, chain_customers: r.chain?.customers } : { metric: 'Monthly revenue', unit: cur(), startDate: today(), months: 6 };
  openForm({
    title: r ? `Edit ${r.client}’s goal` : 'Add a client goal',
    fields: [
      { key: 'client', label: 'Client / brand' }, { key: 'contact', label: 'Contact name' },
      { key: 'metric', label: 'What we measure', hint: 'e.g. Monthly revenue, Members, Bookings a week' }, { key: 'unit', label: 'Unit', hint: `${cur()} for money, or e.g. members` },
      { key: 'baseline', label: 'Where they are now (start)', type: 'number' }, { key: 'goal', label: 'Goal', type: 'number' },
      { key: 'stretch', label: 'Stretch goal (optional)', type: 'number' }, { key: 'months', label: 'Months', type: 'select', options: [3, 4, 5, 6, 9, 12] },
      { key: 'startDate', label: 'Start date', type: 'date' },
      { key: 'chain_us', label: '1 · What we deliver for them', type: 'textarea', rows: 2 },
      { key: 'chain_brand', label: '2 · Their result', type: 'textarea', rows: 2 },
      { key: 'chain_customers', label: '3 · Their customers’ result', type: 'textarea', rows: 2 },
    ],
    values: v,
    onSave: (f) => {
      if (!f.client || f.goal == null || f.baseline == null) { toast('Add the client, where they are now and the goal', 'bad'); return false; }
      const fields = { client: f.client, contact: f.contact, metric: f.metric || 'Monthly revenue', unit: f.unit || cur(), baseline: f.baseline, goal: f.goal, stretch: f.stretch || 0, months: Number(f.months) || 6, startDate: f.startDate || today(), chain: { us: f.chain_us, brand: f.chain_brand, customers: f.chain_customers } };
      if (r) Object.assign(r, fields);
      else { const n = { ...newResult(f.client), ...fields }; S.results = [...(S.results || []), n]; location.hash = `#/results/${n.id}`; }
      commit(r ? 'Goal updated' : 'Client goal added – tick off today’s actions to start the streak');
    },
    onDelete: r ? () => { S.results = S.results.filter((x) => x !== r); S.approvals = S.approvals.filter((x) => x.refId !== r.id); location.hash = '#/results'; commit('Deleted'); } : null,
  });
}

function resultsBriefing() {
  const list = S.results || [];
  if (!list.length) return null;
  return card({ class: 'results-brief' },
    cardHead('Client results', `${portfolio(list).onTrack} of ${list.length} on track`, h('a', { class: 'btn sm ghost', href: '#/results' }, 'Open Results', icon('arrow', 13))),
    h('div', { class: 'rb-list' }, list.map((r) => {
      const p = progress(r);
      const acts = actionsOn(r);
      const done = acts.filter((a) => doneOn(r, today()).has(a.id)).length;
      return h('a', { class: 'rb-row', href: `#/results/${r.id}` },
        h('b', { class: 'truncate' }, r.client), h('span', { class: 'muted small truncate' }, `${fmtShort(r, p.now)} of ${fmtShort(r, r.goal)}`),
        goalBar(r, p), statusChip(p), h('span', { class: 'muted small' }, `Today ${done}/${acts.length}`));
    })));
}

// ── Edit HQ (settings) ───────────────────────────────────────────────────────
function settingsPage(el) {
  const p = S.profile;
  const input = (obj, key, label, type = 'text', hint) => h('label', { class: 'field' }, h('span', label),
    h('input', { type, value: obj[key] ?? '', onchange: (e) => { obj[key] = type === 'number' ? Number(e.target.value) || 0 : e.target.value; commit('Saved'); } }), hint ? h('small', hint) : null);
  const rules = S.settings.deals;
  mount(el,
    pageHead('Edit HQ', 'Everything here is yours to change – your details, your team, your prices and how the agents behave. Changes save automatically.'),
    card({}, cardHead('Your business'),
      h('div', { class: 'form-grid' }, input(p, 'business', 'Business name'), input(p, 'handle', 'Handle'), input(p, 'owner', 'Your first name', 'text', 'Used in greetings and sign-offs'), input(p, 'currency', 'Currency symbol'),
        input(p, 'quarterLabel', 'Quarter label', 'text', 'e.g. Q1 2027'), input(p, 'quarterStart', 'Quarter starts', 'date'), input(p, 'target', `Quarter target (${cur()})`, 'number'), input(p, 'bookingLink', 'Your booking link'))),
    card({}, cardHead('Look'),
      h('div', { class: 'row wrap' }, Object.entries(ACCENTS).map(([k, cs]) => h('button', { class: `swatch ${p.accent === k ? 'on' : ''}`, onclick: () => { p.accent = k; commit(); }, 'aria-label': `${k} colours` },
        h('span', { style: { background: `linear-gradient(135deg, ${cs.join(', ')})` } }), k)),
        h('button', { class: 'btn ghost', onclick: () => { p.theme = p.theme === 'light' ? 'dark' : 'light'; commit(); } }, icon(p.theme === 'light' ? 'moon' : 'sun'), p.theme === 'light' ? 'Switch to dark' : 'Switch to light'))),
    card({}, cardHead('Your team', null, btn('Hire an agent', () => addAgentForm(), { kind: 'primary', ic: 'plus', sm: true })),
      h('p', { class: 'muted small' }, '“Ask me first” agents put everything on your desk for sign-off. “Act on their own” agents send it and tell you after.'),
      h('div', { class: 'agent-rows' }, S.agents.map((a, i) => h('div', { class: 'agent-row', vars: { '--c': a.color } },
        h('span', { class: 'avatar', style: { background: a.color } }, a.icon),
        h('div', { class: 'grow' }, h('b', a.name), h('small', { class: 'muted' }, `${a.role} · desk: ${a.desk}`)),
        h('select', { 'aria-label': 'Autonomy', onchange: (e) => { a.autonomy = e.target.value; commit('Saved'); } }, [['ask', 'Ask me first'], ['auto', 'Act on their own']].map(([v, l]) => h('option', { value: v, selected: a.autonomy === v }, l))),
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: a.enabled !== false, onchange: (e) => { a.enabled = e.target.checked; commit(a.enabled ? `${a.name} is back on` : `${a.name} is switched off`); } }), h('i')),
        h('button', { class: 'icon-btn', 'aria-label': 'Move up', onclick: () => { if (i) { [S.agents[i - 1], S.agents[i]] = [S.agents[i], S.agents[i - 1]]; commit(); } } }, '↑'),
        btn('Edit', () => agentForm(a), { sm: true, kind: 'ghost', ic: 'edit' }))))),
    card({}, cardHead('Rate card', 'the Deal Manager quotes from this', btn('Add line', () => { S.rateCard.push({ id: uid('r'), item: 'New service', price: 0, keywords: '' }); commit(); }, { sm: true, kind: 'ghost', ic: 'plus' })),
      h('p', { class: 'muted small' }, 'Keywords: when a deal mentions one of these words, that line goes on the quote automatically.'),
      h('div', { class: 'rate-rows' }, S.rateCard.map((r) => h('div', { class: 'rate-row' },
        h('input', { value: r.item, 'aria-label': 'Service', onchange: (e) => { r.item = e.target.value; commit(); } }),
        h('input', { type: 'number', value: r.price, 'aria-label': 'Price', onchange: (e) => { r.price = Number(e.target.value) || 0; commit(); } }),
        h('input', { value: r.keywords || '', 'aria-label': 'Keywords', placeholder: 'keywords, comma, separated', onchange: (e) => { r.keywords = e.target.value; commit(); } }),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Remove', onclick: () => { S.rateCard = S.rateCard.filter((x) => x !== r); commit(); } }, icon('trash', 14)))))),
    card({}, cardHead('Agent rules'),
      h('div', { class: 'form-grid' },
        input(rules, 'followUpDays', 'Follow up quiet deals after (days)', 'number'), input(rules, 'maxFollowUps', 'Max follow ups before closing', 'number'),
        input(rules, 'coldDays', 'Lead counts as cold after (days)', 'number'), input(rules, 'rebookWindowDays', 'Pitch rebooks this many days early', 'number'),
        input(S.settings.autoReply, 'hotScore', 'Hot lead score (0–100)', 'number', 'Leads at or above this go straight to the Deal Manager'),
        h('label', { class: 'field full' }, h('span', 'Scam warning words'), h('textarea', { rows: 2, value: S.settings.autoReply.scamWords, onchange: (e) => { S.settings.autoReply.scamWords = e.target.value; commit('Saved'); } })))),
    card({}, cardHead('Your data'),
      h('p', { class: 'muted small' }, store.mode === 'server' ? 'HQ saves to your CM Automations server, so it’s the same on every device you sign in on.' : 'HQ is saving in this browser. Open it from your CM Automations server (signed in) to keep it on every device.'),
      h('div', { class: 'row wrap' },
        btn('Export (JSON)', () => { const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }); const aEl = h('a', { href: URL.createObjectURL(blob), download: `hq-${today()}.json` }); document.body.appendChild(aEl); aEl.click(); aEl.remove(); }, { kind: 'ghost', ic: 'download' }),
        btn('Import (JSON)', () => {
          const f = h('input', { type: 'file', accept: 'application/json,.json' });
          f.addEventListener('change', async () => { try { S = upgrade(JSON.parse(await f.files[0].text())); commit('Imported'); } catch { toast('That file isn’t an HQ export', 'bad'); } });
          f.click();
        }, { kind: 'ghost', ic: 'upload' }),
        btn('Start fresh', () => confirmBox('Clear all the demo leads, deals, jobs, scripts, invoices and clients? Your team, rate card and settings stay.', () => { S = emptyState(clone(S)); commit('Clean slate – over to you'); }, { yes: 'Clear demo data' }), { kind: 'ghost' }),
        btn('Reset to demo', () => confirmBox('Replace everything in HQ with the demo data?', () => { const keep = clone(S.profile); clearLocal(); S = seedState(); S.profile = { ...S.profile, business: keep.business, owner: keep.owner, handle: keep.handle }; commit('Demo restored'); }, { yes: 'Reset to demo' }), { kind: 'danger ghost' }))));
}

function agentForm(a) {
  openForm({
    title: `Edit ${a.name}`,
    fields: [
      { key: 'name', label: 'Name' }, { key: 'role', label: 'What they do' }, { key: 'desk', label: 'Desk name (in the sidebar)' }, { key: 'icon', label: 'Emoji' },
      { key: 'color', label: 'Colour', type: 'color' }, { key: 'autonomy', label: 'Autonomy', type: 'select', options: [['ask', 'Ask me first'], ['auto', 'Act on their own']] },
      { key: 'instructions', label: 'Standing instructions', type: 'textarea', rows: 6, hint: store.ai ? 'Claude follows these whenever this agent writes anything.' : 'Used by Claude when it’s connected.' },
    ],
    values: a,
    onSave: (v) => { Object.assign(a, v); commit('Agent updated'); },
    onDelete: a.builtIn ? null : () => { S.agents = S.agents.filter((x) => x !== a); S.approvals = S.approvals.filter((x) => x.agentId !== a.id); location.hash = '#/settings'; commit('Agent removed'); },
  });
}

function addAgentForm() {
  openForm({
    title: 'Hire an agent',
    fields: [
      { key: 'name', label: 'Name', placeholder: 'e.g. Social Media Manager' }, { key: 'role', label: 'What they do', placeholder: 'e.g. Comments, DMs & posting' },
      { key: 'desk', label: 'Desk name', placeholder: 'e.g. Socials' }, { key: 'icon', label: 'Emoji' }, { key: 'color', label: 'Colour', type: 'color' },
      { key: 'autonomy', label: 'Autonomy', type: 'select', options: [['ask', 'Ask me first'], ['auto', 'Act on their own']] },
      { key: 'instructions', label: 'Instructions – tell them their job like you would a new hire', type: 'textarea', rows: 6 },
    ],
    values: { icon: '🤖', color: PALETTE[S.agents.length % PALETTE.length], autonomy: 'ask' },
    saveLabel: 'Hire',
    onSave: (v) => {
      if (!v.name) { toast('Give your agent a name', 'bad'); return false; }
      const agent = { id: uid('ag'), builtIn: null, enabled: true, ...v, desk: v.desk || v.name };
      S.agents.push(agent);
      log(S, agent.id, 'you', `Hi ${S.profile.owner} – ${agent.name} here, reporting for duty.`);
      location.hash = `#/desk/${agent.id}`;
      commit(`${agent.name} has joined the team`);
    },
  });
}

// ── Start ────────────────────────────────────────────────────────────────────
(async function start() {
  root.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), 'Opening HQ…'));
  S = await loadState();
  render();
  // The team checks in once a day by itself.
  if (S.meta.lastRunDate !== today()) await runTeam();
  else saveState(S, renderSaveStatus);
})();

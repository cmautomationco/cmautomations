import { del, get, patch, post, put } from '../api.js';
import { state } from '../app.js';
import {
  ago, announce, confirmDialog, copyText, date, dateTime, field, formData, h, icon, modal, mount, select, showError, toast, toPence,
} from '../ui.js';

/**
 * API hub: every income stream (TikTok, trading, digital products…) in its own
 * section – separate figures, separate web address, separate API key if you
 * want one – with the totals across all of them, the API keys, the activity
 * log and the API docs in one place.
 */

const SYMBOLS = { GBP: '£', USD: '$', EUR: '€' };
const money = (pence, currency = 'GBP', { sign = false, whole = false } = {}) => {
  const n = Number(pence) || 0;
  const s = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(Math.abs(n) / 100);
  return `${n < 0 ? '-' : sign && n > 0 ? '+' : ''}${s}`;
};
const shortMoney = (pence, currency = 'GBP') => {
  const n = Math.abs(Number(pence) || 0) / 100;
  const v = n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n));
  return `${pence < 0 ? '-' : ''}${SYMBOLS[currency] || ''}${v}`;
};
const monthLabel = (ym, opts = { month: 'short' }) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', opts);
const isAdmin = () => state.me.role !== 'member';
const SOURCE_LABELS = { manual: 'Typed in', import: 'CSV import', webhook: 'Web address', api: 'API' };
const KIND_LABELS = { income: 'In', expense: 'Out', transfer_in: 'Moved in', transfer_out: 'Moved out' };
const stat = (label, value, sub, cls = '') => h('div', { class: `card kpi ${cls}` }, h('div', { class: 'label' }, label), h('div', { class: `value ${cls ? '' : 'blue'}` }, value), h('div', { class: 'sub' }, sub));
const metricValue = (m, currency) => (m.latest ? (m.money ? money(Math.round(m.latest.value * 100), currency) : `${Number(m.latest.value).toLocaleString('en-GB')}${m.unit || ''}`) : '–');

const TYPE_ICONS = { tiktok: 'music', trading: 'trend', digital_products: 'file', youtube: 'play', affiliate: 'link', ecommerce: 'cart', client_work: 'briefcase', property: 'home', other: 'plus' };
const streamIcon = (type) => h('span', { class: 'stream-icon', 'aria-hidden': 'true' }, icon(TYPE_ICONS[type] || 'pound'));

let typesCache = null;
const loadTypes = async () => { typesCache = typesCache || await get('/streams/types'); return typesCache; };

export async function render(el, route) {
  const [, sub, streamId] = route.parts;
  if (sub === 'streams' && streamId) return renderStream(el, streamId, route);
  const tab = ['keys', 'activity', 'docs'].includes(sub) ? sub : 'streams';
  const hub = await get('/streams');
  const t = hub.totals;
  const body = h('div');
  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'API hub'),
        h('h1', { style: { marginTop: '6px' } }, 'Every income stream, ', h('span', { class: 'blue' }, 'one place')),
        h('p', 'Each income stream has its own section – its own money in and out, its own figures and its own web address for other apps to send to – so nothing is mixed up, and you never have to switch between apps to see how everything is doing.')),
      isAdmin() ? h('div', { class: 'row' },
        h('button', { class: 'btn soft', onclick: () => { location.hash = '#/api/docs'; } }, icon('link'), 'API docs'),
        h('button', { class: 'btn primary', onclick: () => addStreamModal() }, icon('plus'), 'Add an income stream')) : null),
    h('div', { class: 'grid g4', style: { marginBottom: '16px' } },
      stat('This month · all streams', money(t.month_net_pence, hub.currency), `${money(t.month_income_pence, hub.currency)} in · ${money(t.month_expense_pence, hub.currency)} out`, 'accent'),
      stat('Last month', money(t.last_month_net_pence, hub.currency), 'profit across every stream'),
      stat(`Tax year ${hub.tax_year.label}`, money(t.tax_year_net_pence, hub.currency), `since ${date(hub.tax_year.start, { day: 'numeric', month: 'short', year: 'numeric' })}`),
      stat('Put aside for tax', money(t.set_aside_pence, hub.currency), 'using each stream’s own % – a guide, not tax advice')),
    hub.not_counted.length ? h('p', { class: 'small muted', style: { margin: '-6px 0 14px' } }, `Not in these totals (different currency): ${hub.not_counted.map((s) => `${s.name} (${s.currency})`).join(', ')}.`) : null,
    h('div', { class: 'tabs' }, [['streams', `Income streams (${hub.streams.length})`], ['keys', `API keys${hub.api_keys ? ` (${hub.api_keys})` : ''}`], ['activity', 'Activity'], ['docs', 'API docs & try it']]
      .map(([k, l]) => h('a', { href: `#/api${k === 'streams' ? '' : `/${k}`}`, class: tab === k ? 'active' : '' }, l))),
    body);
  if (tab === 'keys') return renderKeys(body, hub);
  if (tab === 'activity') return renderActivity(body, route.query.kind || '');
  if (tab === 'docs') return renderDocs(body, hub);
  return renderStreams(body, hub);
}

// ───────────────────────── All streams ─────────────────────────

async function renderStreams(el, hub) {
  if (!hub.streams.length) {
    const types = await loadTypes();
    return mount(el, h('div', { class: 'card' }, h('div', { class: 'card-body', style: { padding: '26px' } },
      h('h2', 'Add your first ', h('span', { class: 'blue' }, 'income stream')),
      h('p', { class: 'muted', style: { margin: '6px 0 16px', maxWidth: '640px' } }, 'Pick what kind of income it is. Each one gets its own page with the right categories and figures – wins and losses for trading, sales and refunds for digital products, Creator Rewards and followers for TikTok – plus its own web address so other apps can send it data.'),
      typeTiles(types, (type) => addStreamModal(type)))));
  }
  const withIncome = hub.streams.filter((s) => s.currency === hub.currency && s.summary.month.income_pence > 0).sort((a, b) => b.summary.month.income_pence - a.summary.month.income_pence);
  const maxIncome = Math.max(1, ...withIncome.map((s) => s.summary.month.income_pence));
  mount(el,
    h('div', { class: 'grid g3 stream-grid' },
      hub.streams.map(streamCard),
      isAdmin() ? h('button', { class: 'stream-card add', onclick: () => addStreamModal() }, icon('plus'), h('b', 'Add an income stream'), h('span', { class: 'small muted' }, 'TikTok, trading, digital products, YouTube, affiliate, an online shop, client work, property…')) : null),
    withIncome.length > 1 ? h('div', { class: 'card', style: { marginTop: '16px' } },
      h('div', { class: 'card-head' }, h('h3', 'Where this month’s ', h('span', { class: 'blue' }, 'money came from'))),
      h('div', { class: 'card-body' }, withIncome.map((s) => h('a', { class: 'hbar-row', href: `#/api/streams/${s.id}`, 'aria-label': `${s.name}: ${money(s.summary.month.income_pence, s.currency)} in` },
        h('span', { class: 'hbar-label' }, s.name),
        h('span', { class: 'hbar-track' }, h('span', { class: 'hbar-fill', style: { width: `${Math.max(2, s.summary.month.income_pence / maxIncome * 100)}%` } })),
        h('span', { class: 'hbar-value' }, money(s.summary.month.income_pence, s.currency, { whole: true }), h('span', { class: 'muted' }, ` · ${Math.round(s.summary.month.income_pence / hub.totals.month_income_pence * 100)}%`)))))) : null,
    hub.archived.length ? h('p', { class: 'small muted', style: { marginTop: '14px' } }, `Archived: ${hub.archived.map((s) => s.name).join(', ')} – open one from its old link or the API to bring it back.`) : null);
}

function streamCard(s) {
  const m = s.summary.month;
  const diff = m.net_pence - s.summary.last_month.net_pence;
  const live = s.summary.connected.filter((c) => c === 'webhook' || c === 'api');
  return h('a', { class: 'stream-card', href: `#/api/streams/${s.id}` },
    h('div', { class: 'row', style: { justifyContent: 'space-between', flexWrap: 'nowrap' } },
      h('div', { class: 'row', style: { flexWrap: 'nowrap', minWidth: 0 } }, streamIcon(s.type),
        h('div', { style: { minWidth: 0 } }, h('b', { class: 'ellipsis' }, s.name), h('div', { class: 'small muted ellipsis' }, s.handle || s.type_label))),
      h('span', { class: 'small blue', style: { whiteSpace: 'nowrap', fontWeight: 700 } }, 'Open →')),
    h('div', { class: 'stream-value' }, money(m.net_pence, s.currency)),
    h('div', { class: 'small muted' }, 'profit this month', s.summary.last_month.count || m.count ? h('span', ` · ${diff >= 0 ? '▲' : '▼'} ${money(Math.abs(diff), s.currency, { whole: true })} on last month`) : null),
    netChart(s.summary.series, s.currency, { mini: true }),
    s.summary.goal ? h('div', { style: { marginTop: '8px' } },
      h('div', { class: 'small row', style: { justifyContent: 'space-between' } }, h('span', { class: 'muted' }, `Target ${money(s.summary.goal.target_pence, s.currency, { whole: true })}`), h('b', { class: 'blue' }, `${Math.min(999, s.summary.goal.progress_pct)}%`)),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(Math.min(100, s.summary.goal.progress_pct)), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { style: { width: `${Math.min(100, s.summary.goal.progress_pct)}%` } }))) : null,
    h('div', { class: 'small muted stream-foot' },
      s.summary.headline ? h('span', `${metricValue(s.summary.headline, s.currency)} ${s.summary.headline.label.toLowerCase()}`) : null,
      h('span', live.length ? `● Data arriving automatically${s.summary.last_entry_at ? ` · ${ago(s.summary.last_entry_at)}` : ''}` : s.summary.last_entry_at ? `Last added ${ago(s.summary.last_entry_at)}` : 'Nothing added yet')));
}

/** Monthly profit bars. Profit is blue above the line, a loss is dark grey below it. */
function netChart(series, currency, { mini = false } = {}) {
  const max = Math.max(1, ...series.map((p) => Math.abs(p.net_pence)));
  const hasLoss = series.some((p) => p.net_pence < 0);
  return h('div', { class: `netchart ${mini ? 'mini' : ''} ${hasLoss ? 'has-loss' : ''}`, role: 'img', 'aria-label': `Profit by month: ${series.map((p) => `${monthLabel(p.month)} ${money(p.net_pence, currency, { whole: true })}`).join(', ')}` },
    series.map((p) => {
      const pct = Math.abs(p.net_pence) / max * 100;
      const tip = `${monthLabel(p.month, { month: 'short', year: 'numeric' })}: ${money(p.net_pence, currency)}${mini ? '' : ` (${money(p.income_pence, currency, { whole: true })} in, ${money(p.expense_pence, currency, { whole: true })} out)`}`;
      return h('div', { class: 'nc-col', 'data-tip': tip, tabindex: mini ? null : '0' },
        h('div', { class: 'nc-up' }, p.net_pence > 0 ? h('span', { class: 'nc-bar pos', style: { height: `${Math.max(3, pct)}%` } }) : null),
        hasLoss ? h('div', { class: 'nc-down' }, p.net_pence < 0 ? h('span', { class: 'nc-bar neg', style: { height: `${Math.max(3, pct)}%` } }) : null) : null,
        mini ? null : h('div', { class: 'nc-label' }, monthLabel(p.month)));
    }));
}

function typeTiles(types, onPick, selected = null) {
  return h('div', { class: 'type-tiles' }, types.map((t) => h('button', {
    type: 'button', class: `type-tile ${selected === t.key ? 'active' : ''}`, onclick: () => onPick(t.key),
  }, streamIcon(t.key), h('b', t.label), h('span', { class: 'small muted' }, t.blurb))));
}

async function addStreamModal(preset = null) {
  const types = await loadTypes();
  let chosen = preset;
  const form = h('div');
  const draw = () => {
    const t = types.find((x) => x.key === chosen);
    mount(form,
      typeTiles(types, (k) => { chosen = k; draw(); }, chosen),
      t ? h('div', { class: 'grid g2', style: { marginTop: '16px' } },
        field('Name', h('input', { name: 'name', value: t.default_name, maxlength: 80 }), { required: true, help: 'e.g. “TikTok – @yourname”, “Trading 212 ISA”, “Gumroad shop”' }),
        field(t.handle_label, h('input', { name: 'handle', maxlength: 120 })),
        field('Monthly profit target (£, optional)', h('input', { name: 'goal', type: 'number', min: 0, step: 1 })),
        field('Put aside for tax (%)', h('input', { name: 'tax_set_aside_pct', type: 'number', min: 0, max: 60, step: 1, value: 20 }), { help: 'Shown as “Put aside for tax” – a guide, not tax advice.' }),
        field('Currency', select('currency', [['GBP', '£ GBP'], ['USD', '$ USD'], ['EUR', '€ EUR']], 'GBP'), { help: 'Use USD for a US-dollar trading account. Only £ streams count in the all-streams totals.' })) : h('p', { class: 'small muted', style: { marginTop: '12px' } }, 'Choose one to carry on.'));
  };
  draw();
  modal('Add an income stream', form, { wide: true, actions: [
    { label: 'Cancel' },
    { label: 'Add it', primary: true, onClick: async () => {
      if (!chosen) { toast('Choose what kind of income it is', 'error'); return false; }
      const d = formData(form);
      const s = await post('/streams', { type: chosen, name: d.name, handle: d.handle, currency: d.currency, tax_set_aside_pct: d.tax_set_aside_pct, goal_monthly_pence: d.goal ? toPence(d.goal) : null });
      toast(`${s.name} added – it has its own page and web address`);
      location.hash = `#/api/streams/${s.id}`;
      return true;
    } },
  ] });
}

// ───────────────────────── One stream ─────────────────────────

async function renderStream(el, streamId, route) {
  const month = /^\d{4}-\d{2}$/.test(route.query.month || '') ? route.query.month : '';
  const d = await get(`/streams/${streamId}${month ? `?month=${month}` : ''}`);
  const { stream: s, type: t, summary: sum } = d;
  const cur = s.currency;
  const reload = () => render(el, route);
  const fourth = sum.goal
    ? stat('Monthly target', `${Math.min(999, sum.goal.progress_pct)}%`, `${money(Math.max(0, sum.month.net_pence), cur, { whole: true })} of ${money(sum.goal.target_pence, cur, { whole: true })} this month`)
    : sum.stats.kind === 'trading' ? stat('Win rate', sum.stats.win_rate === null ? '–' : `${sum.stats.win_rate}%`, `${sum.stats.wins} wins · ${sum.stats.losses} losses this tax year`)
      : sum.stats.kind === 'sales' ? stat('Sales', String(sum.stats.sales), `average ${money(sum.stats.avg_sale_pence, cur)} · this tax year`)
        : stat('Payments', String(sum.stats.payments), `average ${money(sum.stats.avg_payment_pence, cur)} · this tax year`);
  mount(el,
    h('a', { href: '#/api', class: 'small', style: { display: 'inline-block', marginBottom: '10px', fontWeight: 700 } }, '← All income streams'),
    h('div', { class: 'page-head' },
      h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } }, streamIcon(s.type), h('div', h('div', { class: 'eyebrow' }, `${t.label}${s.archived ? ' · archived' : ''}`),
        h('h1', { style: { marginTop: '6px' } }, h('span', { class: 'blue' }, s.name)),
        h('p', [s.handle, t.blurb].filter(Boolean).join(' · ')))),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => entryModal(d, 'income', reload) }, icon('plus'), `Add ${t.income_label.toLowerCase()}`),
        h('button', { class: 'btn soft', onclick: () => entryModal(d, 'expense', reload) }, icon('plus'), `Add ${t.expense_label.toLowerCase()}`),
        h('button', { class: 'btn', onclick: () => importModal(d, reload) }, icon('list'), 'Import CSV'),
        t.metrics.length ? h('button', { class: 'btn', onclick: () => metricsModal(d, reload) }, icon('trend'), 'Update figures') : null,
        isAdmin() ? h('button', { class: 'btn ghost', title: 'Stream settings', 'aria-label': 'Stream settings', onclick: () => settingsModal(d, reload) }, icon('cog')) : null)),
    h('div', { class: 'grid g4', style: { marginBottom: '16px' } },
      stat(`${monthLabel(sum.month.key, { month: 'long' })} profit`, money(sum.month.net_pence, cur), `${money(sum.month.income_pence, cur)} in · ${money(sum.month.expense_pence, cur)} out`, 'accent'),
      stat(`${monthLabel(sum.last_month.key, { month: 'long' })}`, money(sum.last_month.net_pence, cur), `${sum.last_month.count} entr${sum.last_month.count === 1 ? 'y' : 'ies'}`),
      stat(`Tax year ${sum.tax_year.label}`, money(sum.tax_year.net_pence, cur), `Put aside ${money(sum.tax_year.set_aside_pence, cur)} (${s.tax_set_aside_pct}%)`),
      fourth),
    sum.other_currency_count ? h('div', { class: 'why small', style: { marginBottom: '14px' } }, h('b', 'Different currency: '), `${sum.other_currency_count} entr${sum.other_currency_count === 1 ? 'y is' : 'ies are'} in another currency and not in these totals. Edit them to enter the ${cur} amount.`) : null,
    sum.test_entries ? h('div', { class: 'why small row', style: { marginBottom: '14px', justifyContent: 'space-between' } },
      h('span', h('b', 'Test entries: '), `${sum.test_entries} entr${sum.test_entries === 1 ? 'y' : 'ies'} from “Send a test” ${sum.test_entries === 1 ? 'is' : 'are'} in the totals.`),
      h('button', { class: 'btn sm', onclick: async () => { const r = await del(`/streams/${s.id}/test-entries`); toast(`Removed ${r.removed} test entr${r.removed === 1 ? 'y' : 'ies'}`); reload(); } }, 'Remove them')) : null,
    h('div', { class: 'grid g2', style: { alignItems: 'start' } },
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', 'Profit, ', h('span', { class: 'blue' }, 'last 12 months')), h('span', { class: 'small muted' }, `Tax year so far: ${money(sum.tax_year.income_pence, cur, { whole: true })} in · ${money(sum.tax_year.expense_pence, cur, { whole: true })} out`)),
        h('div', { class: 'card-body' }, netChart(sum.series, cur), h('p', { class: 'small muted', style: { marginTop: '6px' } }, sum.series.some((p) => p.net_pence < 0) ? 'Blue is profit; grey below the line is a loss. Hover a month for the detail.' : 'Hover a month for the detail.'))),
      statsCard(sum, s, t)),
    h('div', { class: 'grid g2', style: { alignItems: 'start', marginTop: '16px' } },
      categoriesCard(sum, cur),
      connectCard(d, reload)),
    entriesCard(d, month, reload));
}

function statsCard(sum, s, t) {
  const st = sum.stats;
  const cur = s.currency;
  const rows = [];
  if (st.kind === 'trading') {
    rows.push(['Closed trades', String(st.trades)], ['Win rate', st.win_rate === null ? '–' : `${st.win_rate}%`], ['Average win', money(st.avg_win_pence, cur)], ['Average loss', money(st.avg_loss_pence, cur)],
      ['Profit factor', st.profit_factor === null ? '–' : String(st.profit_factor)], ['Fees & charges', money(st.fees_pence, cur)]);
    if (st.best_trade) rows.push(['Best trade', `${money(st.best_trade.amount_pence, cur)} · ${st.best_trade.reference || st.best_trade.description || ''}`]);
    if (st.best_markets.length) rows.push(['Best markets', st.best_markets.filter((m) => m.net > 0).map((m) => `${m.symbol} ${money(m.net, cur, { whole: true })}`).join(', ') || '–']);
    if (st.worst_markets.length) rows.push(['Losing markets', st.worst_markets.map((m) => `${m.symbol} ${money(m.net, cur, { whole: true })}`).join(', ')]);
    rows.push(['Deposits / withdrawals', `${money(sum.tax_year.transfer_in_pence, cur, { whole: true })} in · ${money(sum.tax_year.transfer_out_pence, cur, { whole: true })} out`]);
  } else if (st.kind === 'sales') {
    rows.push(['Sales', String(st.sales)], ['Average sale', money(st.avg_sale_pence, cur)], ['Refunds', `${st.refunds} (${money(st.refunded_pence, cur)})`], ['Refund rate', st.refund_rate === null ? '–' : `${st.refund_rate}%`]);
    if (st.top_products.length) rows.push(['Top sellers', st.top_products.slice(0, 3).map((p) => `${p.product} – ${money(p.total, cur, { whole: true })} (${p.n})`).join('\n')]);
  } else {
    rows.push(['Payments', String(st.payments)], ['Average payment', money(st.avg_payment_pence, cur)]);
  }
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', 'How it’s ', h('span', { class: 'blue' }, 'going')), h('span', { class: 'small muted' }, `tax year ${sum.tax_year.label}`)),
    h('div', { class: 'card-body' },
      rows.map(([k, v]) => h('div', { class: 'kv' }, h('span', { class: 'muted' }, k), h('b', { style: { whiteSpace: 'pre-line', textAlign: 'right' } }, v))),
      sum.metrics.length ? h('div', { style: { marginTop: '14px' } }, h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Figures'),
        sum.metrics.map((m) => h('div', { class: 'kv' },
          h('span', { class: 'muted' }, m.label),
          h('span', h('b', metricValue(m, cur)),
            m.change ? h('span', { class: 'small muted' }, ` ${m.change.value >= 0 ? '▲' : '▼'} ${m.money ? money(Math.round(Math.abs(m.change.value) * 100), cur, { whole: true }) : Math.abs(m.change.value).toLocaleString('en-GB')}${m.unit || ''} in ${Math.round((Date.parse(m.latest.date) - Date.parse(m.change.since)) / 86400000)} days`) : null,
            m.latest ? h('div', { class: 'small muted', style: { textAlign: 'right' } }, `as of ${date(m.latest.date)}`) : h('div', { class: 'small muted', style: { textAlign: 'right' } }, 'not added yet'))))) : null));
}

function categoriesCard(sum, cur) {
  const income = sum.categories.filter((c) => c.kind === 'income');
  const costs = sum.categories.filter((c) => c.kind === 'expense');
  const max = Math.max(1, ...sum.categories.map((c) => c.total));
  const rows = (list) => list.map((c) => h('div', { class: 'hbar-row', 'aria-label': `${c.category}: ${money(c.total, cur)}` },
    h('span', { class: 'hbar-label' }, c.category),
    h('span', { class: 'hbar-track' }, h('span', { class: 'hbar-fill', style: { width: `${Math.max(2, c.total / max * 100)}%` } })),
    h('span', { class: 'hbar-value' }, money(c.total, cur, { whole: true }), h('span', { class: 'muted' }, ` · ${c.n}`))));
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', 'Where the money ', h('span', { class: 'blue' }, 'comes from')), h('span', { class: 'small muted' }, `tax year ${sum.tax_year.label}`)),
    h('div', { class: 'card-body' },
      income.length ? [h('div', { class: 'eyebrow', style: { marginBottom: '4px' } }, 'In'), rows(income)] : h('p', { class: 'muted small' }, 'Nothing in yet this tax year.'),
      costs.length ? [h('div', { class: 'eyebrow', style: { margin: '12px 0 4px' } }, 'Out'), h('div', { class: 'hbar-muted' }, rows(costs))] : null));
}

function connectCard(d, reload) {
  const { stream: s, type: t } = d;
  const samples = [['generic', 'Any app (JSON)'], ['stripe', 'Stripe sale'], ['shopify', 'Shopify order'], ['gumroad', 'Gumroad sale'], ...(t.metrics.length ? [['metrics', 'Figures update']] : [])];
  const sample = select('sample', samples, ['digital_products', 'ecommerce'].includes(s.type) ? 'stripe' : 'generic');
  const curl = `curl -X POST ${d.hook_url} \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(s.type === 'trading' ? { amount: -42.5, symbol: 'EURUSD', description: 'Closed trade', id: 'trade-1001' } : { amount: 49.99, description: t.income[0], id: 'sale-1001' })}'`;
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', 'Get data ', h('span', { class: 'blue' }, 'in automatically')), h('span', { class: 'badge' }, d.summary.last_webhook ? `last delivery ${ago(d.summary.last_webhook.created_at)}` : 'no deliveries yet')),
    h('div', { class: 'card-body' },
      h('ul', { class: 'connect-steps small' }, t.connect.map((c) => h('li', c))),
      h('div', { class: 'small', style: { fontWeight: 700, margin: '12px 0 4px' } }, `${s.name}’s own web address`),
      h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('input', { readonly: true, value: d.hook_url, class: 'mono', 'aria-label': 'Web address', onfocus: (e) => e.target.select() }),
        h('button', { class: 'btn sm', onclick: () => copyText(d.hook_url, 'Web address copied') }, icon('copy'), 'Copy')),
      h('p', { class: 'small muted', style: { marginTop: '4px' } }, 'Keep it private – anything sent to it is added to this stream only. Sending the same sale twice (with the same id) is ignored.'),
      h('div', { class: 'row', style: { marginTop: '10px' } }, sample,
        h('button', { class: 'btn sm primary', onclick: async () => {
          try {
            const r = await post(`/streams/${s.id}/hook/test`, { sample: sample.value });
            toast(r.result.recorded ? `Test received – ${r.result.recorded} entry added (marked as a test)` : r.result.metrics ? 'Test received – figures updated' : `Test received: ${r.result.ignored || 'nothing new'}`);
            reload();
          } catch (err) { showError(err); }
        } }, icon('send'), 'Send a test')),
      h('details', { style: { marginTop: '10px' } }, h('summary', { class: 'small', style: { cursor: 'pointer', fontWeight: 700 } }, 'Example: send from Zapier, Make or code'),
        h('pre', { class: 'pre mono small', style: { marginTop: '6px', overflowX: 'auto' } }, curl),
        h('p', { class: 'small muted' }, 'Send amount (negative for money out), and optionally description, category, date, symbol or product, currency and an id. Send { "metrics": { … } } to update figures. Or a list of entries at once.')),
      isAdmin() ? h('div', { class: 'row', style: { marginTop: '10px' } },
        h('button', { class: 'btn sm', onclick: () => keyModal(null, s.id) }, icon('link'), 'Make an API key just for this stream'),
        h('button', { class: 'btn sm ghost', onclick: () => secretModal(d, reload) }, s.hook_signed ? 'Signing secret: on' : 'Add a Stripe/Shopify signing secret'),
        h('button', { class: 'btn sm ghost', onclick: async () => { if (await confirmDialog('Make a new web address? The old one stops working straight away, so update any app that uses it.', 'Make a new one')) { await post(`/streams/${s.id}/hook/rotate`); toast('New web address made'); reload(); } } }, 'New address')) : null,
      d.keys.length ? h('p', { class: 'small muted', style: { marginTop: '8px' } }, `API keys for this stream only: ${d.keys.map((k) => `${k.name} (${k.prefix})`).join(', ')}`) : null,
      d.deliveries.length ? h('div', { style: { marginTop: '12px' } }, h('div', { class: 'eyebrow', style: { marginBottom: '4px' } }, 'Latest deliveries'),
        d.deliveries.slice(0, 5).map((l) => h('div', { class: 'small list-item' }, statusBadge(l.status), h('span', { class: 'grow' }, l.summary || ''), h('span', { class: 'muted' }, ago(l.created_at))))) : null));
}

const statusBadge = (status) => h('span', { class: `badge ${status < 300 ? 'green' : status === 429 ? 'amber' : 'red'}` }, String(status));

function entriesCard(d, month, reload) {
  const { stream: s, summary: sum } = d;
  const cur = s.currency;
  const months = [...sum.series].reverse().slice(0, 6).map((p) => p.month);
  const base = `#/api/streams/${s.id}`;
  const shown = d.month;
  const totals = d.entries.filter((e) => e.currency === cur).reduce((t, e) => { t[e.kind] = (t[e.kind] || 0) + e.amount_pence; return t; }, {});
  return h('div', { class: 'card', style: { marginTop: '16px' } },
    h('div', { class: 'card-head' }, h('h3', 'Money ', h('span', { class: 'blue' }, 'in and out')),
      h('div', { class: 'row', style: { gap: '6px' } },
        months.map((m) => h('a', { class: `chip ${shown === m ? 'active' : ''}`, href: m === sum.month.key ? base : `${base}?month=${m}` }, m === sum.month.key ? 'This month' : monthLabel(m, { month: 'short', year: '2-digit' }))))),
    h('div', { class: 'card-body', style: { padding: d.entries.length ? 0 : undefined } }, d.entries.length ? h('table', { class: 'table entries' },
      h('thead', h('tr', ['Date', 'What', 'Category', 'From', 'Amount', ''].map((x) => h('th', x)))),
      h('tbody', d.entries.map((e) => h('tr', { onclick: (ev) => { if (!ev.target.closest('button')) entryModal(d, e.kind, reload, e); } },
        h('td', { style: { whiteSpace: 'nowrap' } }, date(e.date, { day: 'numeric', month: 'short' })),
        h('td', h('span', e.description || '–'), e.reference ? h('span', { class: 'small muted' }, ` · ${e.reference}`) : null, e.meta?.test ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, 'test') : null),
        h('td', { class: 'muted' }, e.category || ''),
        h('td', { class: 'small muted' }, SOURCE_LABELS[e.source]),
        h('td', { class: `amount ${e.kind}` }, e.kind.startsWith('transfer') ? h('span', { class: 'muted' }, `${KIND_LABELS[e.kind]} ${money(e.amount_pence, e.currency)}`)
          : h('b', { class: e.kind === 'income' ? 'blue' : '' }, money(e.kind === 'income' ? e.amount_pence : -e.amount_pence, e.currency, { sign: true })),
        e.currency !== cur ? h('div', { class: 'small muted' }, 'not in totals') : null),
        h('td', h('button', { class: 'icon-btn', title: 'Delete', 'aria-label': 'Delete entry', onclick: async () => { if (await confirmDialog(`Delete this ${money(e.amount_pence, e.currency)} entry?`)) { await del(`/streams/${s.id}/entries/${e.id}`); toast('Deleted'); reload(); } } }, icon('x')))))))
      : h('div', { class: 'empty' }, `Nothing recorded in ${monthLabel(shown, { month: 'long', year: 'numeric' })} yet. Add money in or out, import a CSV, or send a test to the web address above.`)),
    d.entries.length ? h('div', { class: 'card-body small row', style: { justifyContent: 'flex-end', gap: '18px', borderTop: '1px solid var(--line-soft)' } },
      h('span', { class: 'muted' }, `${d.entries.length} entr${d.entries.length === 1 ? 'y' : 'ies'} in ${monthLabel(shown, { month: 'long', year: 'numeric' })}`),
      h('span', 'In ', h('b', { class: 'blue' }, money(totals.income || 0, cur))),
      h('span', 'Out ', h('b', money(totals.expense || 0, cur))),
      totals.transfer_in || totals.transfer_out ? h('span', { class: 'muted' }, `Moved ${money(totals.transfer_in || 0, cur, { whole: true })} in / ${money(totals.transfer_out || 0, cur, { whole: true })} out`) : null,
      h('span', 'Profit ', h('b', { class: 'blue' }, money((totals.income || 0) - (totals.expense || 0), cur)))) : null);
}

function entryModal(d, kind, reload, existing = null) {
  const { stream: s, type: t } = d;
  const today = new Date().toISOString().slice(0, 10);
  const transfers = t.transfers;
  const kinds = [['income', t.income_label], ['expense', t.expense_label], ['transfer_in', `${transfers[0]} (not profit)`], ['transfer_out', `${transfers[1] || transfers[0]} (not profit)`]];
  const body = h('div');
  const draw = (k) => {
    const cats = k === 'income' ? t.income : k === 'expense' ? t.expenses : [k === 'transfer_in' ? transfers[0] : transfers[1] || transfers[0]];
    const current = existing?.category && cats.includes(existing.category) ? existing.category : cats[0];
    mount(body,
      h('div', { class: 'grid g2' },
        field('Type', select('kind', kinds, k)),
        field(`Amount (${SYMBOLS[s.currency] || s.currency})`, h('input', { name: 'amount', type: 'number', step: '0.01', min: '0', required: true, value: existing ? (existing.amount_pence / 100).toFixed(2) : '', autofocus: true }), { required: true }),
        field('Date', h('input', { name: 'date', type: 'date', value: existing?.date || today })),
        field('Category', select('category', cats, current)),
        field('Description', h('input', { name: 'description', maxlength: 200, value: existing?.description || '', placeholder: s.type === 'trading' ? 'e.g. Long breakout' : s.type === 'tiktok' ? 'e.g. October Creator Rewards' : 'e.g. Notion template pack' })),
        field(s.type === 'trading' ? 'Market / symbol' : ['digital_products', 'ecommerce'].includes(s.type) ? 'Product' : 'Reference', h('input', { name: 'reference', maxlength: 80, value: existing?.reference || '', placeholder: s.type === 'trading' ? 'e.g. EURUSD, TSLA' : '' }))),
      s.type === 'trading' && !existing ? h('p', { class: 'small muted' }, 'A losing trade is “Loss or cost” with the category Closed trade. Deposits and withdrawals are kept apart from profit.') : null);
    body.querySelector('[name=kind]').addEventListener('change', (e) => draw(e.target.value));
  };
  draw(kind);
  modal(existing ? 'Edit entry' : `Add to ${s.name}`, body, { actions: [
    existing ? { label: 'Delete', onClick: async () => { if (!(await confirmDialog(`Delete this ${money(existing.amount_pence, existing.currency)} entry?`))) return false; await del(`/streams/${s.id}/entries/${existing.id}`); toast('Deleted'); reload(); return true; } } : { label: 'Cancel' },
    { label: existing ? 'Save' : 'Add', primary: true, onClick: async () => {
      const f = formData(body);
      if (!(Number(f.amount) > 0)) { toast('Enter an amount', 'error'); return false; }
      const payload = { kind: f.kind, amount_pence: toPence(f.amount), date: f.date, category: f.category, description: f.description, reference: f.reference };
      if (existing) { await patch(`/streams/${s.id}/entries/${existing.id}`, payload); toast('Saved'); } else {
        const r = await post(`/streams/${s.id}/entries`, payload);
        announce(r.automations);
        toast(`${KIND_LABELS[f.kind] === 'In' ? 'Added' : 'Recorded'} ${money(toPence(f.amount), s.currency)}`);
      }
      reload();
      return true;
    } },
  ] });
}

function metricsModal(d, reload) {
  const { stream: s, type: t, summary: sum } = d;
  const body = h('div', { class: 'grid g2' },
    t.metrics.map((m) => {
      const cur = sum.metrics.find((x) => x.key === m.key);
      return field(`${m.label}${m.unit ? ` (${m.unit})` : m.money ? ` (${SYMBOLS[s.currency] || s.currency})` : ''}`, h('input', { name: m.key, type: 'number', step: 'any', placeholder: cur?.latest ? String(cur.latest.value) : '' }));
    }),
    field('As of', h('input', { name: 'date', type: 'date', value: new Date().toISOString().slice(0, 10) })));
  modal(`Update ${s.name} figures`, body, { actions: [
    { label: 'Cancel' },
    { label: 'Save', primary: true, onClick: async () => {
      const f = formData(body);
      const metrics = Object.fromEntries(Object.entries(f).filter(([k, v]) => k !== 'date' && v !== ''));
      if (!Object.keys(metrics).length) { toast('Fill in at least one figure', 'error'); return false; }
      await post(`/streams/${s.id}/metrics`, { date: f.date, metrics });
      toast('Figures saved');
      reload();
      return true;
    } },
  ] });
}

function importModal(d, reload) {
  const { stream: s } = d;
  const area = h('textarea', { rows: 8, class: 'mono small', placeholder: s.type === 'trading' ? 'Action,Time,Ticker,Result,Total\nMarket sell,2026-10-03 14:00,TSLA,45.20,300.00\nDeposit,2026-10-01 09:00,,,1000.00' : 'Date,Description,Amount\n02/10/2026,October Creator Rewards,412.30' });
  const file = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', onchange: async (e) => { const f = e.target.files[0]; if (f) area.value = await f.text(); } });
  const result = h('div');
  let checked = false;
  const check = async () => {
    const r = await post(`/streams/${s.id}/import`, { csv: area.value, dry_run: true });
    checked = true;
    mount(result,
      h('div', { class: 'why small', style: { margin: '12px 0' } },
        h('b', `${r.readable} of ${r.rows} lines can be imported`), r.already_imported ? ` (${r.already_imported} already are, and will be skipped)` : '', r.skipped.length ? ` · ${r.skipped.length} skipped – ${[...new Set(r.skipped.map((x) => x.reason))].slice(0, 3).join('; ')}` : '',
        h('div', { style: { marginTop: '4px' } }, 'Read as: ', Object.entries(r.mapping).filter(([k]) => k !== 'id' || r.mapping.id).map(([k, v]) => `${k} = “${v}”`).join(', '))),
      r.preview.length ? h('table', { class: 'table lines' }, h('thead', h('tr', ['Date', 'What', 'Category', 'Amount'].map((x) => h('th', x)))),
        h('tbody', r.preview.map((p) => (p.error ? h('tr', h('td', { colspan: 4, class: 'small' }, p.error)) : h('tr',
          h('td', p.date), h('td', [p.description, p.reference].filter(Boolean).join(' · ')), h('td', p.category),
          h('td', p.kind.startsWith('transfer') ? `${KIND_LABELS[p.kind]} ${money(p.amount_pence, p.currency)}` : money(p.kind === 'income' ? p.amount_pence : -p.amount_pence, p.currency, { sign: true }))))))) : null);
  };
  modal(`Import into ${s.name}`, h('div',
    h('p', { class: 'small muted' }, 'Upload or paste a CSV – a broker statement, TikTok or YouTube earnings, Gumroad, Etsy or Shopify sales, or a bank statement. The date, amount and description columns are found for you. Importing the same file again won’t double anything up.'),
    h('div', { style: { margin: '10px 0' } }, file), area, result), { wide: true, actions: [
    { label: 'Cancel' },
    { label: 'Check it', onClick: async () => { await check(); return false; } },
    { label: 'Import', primary: true, onClick: async () => {
      if (!checked) { await check(); toast('Check the preview, then press Import'); return false; }
      const r = await post(`/streams/${s.id}/import`, { csv: area.value });
      toast(`Imported ${r.recorded} entr${r.recorded === 1 ? 'y' : 'ies'}${r.duplicates ? ` · ${r.duplicates} already there` : ''}`);
      reload();
      return true;
    } },
  ] });
  area.addEventListener('input', () => { checked = false; });
}

function settingsModal(d, reload) {
  const { stream: s, type: t } = d;
  const body = h('div', { class: 'grid g2' },
    field('Name', h('input', { name: 'name', value: s.name, maxlength: 80 })),
    field(t.handle_label, h('input', { name: 'handle', value: s.handle || '', maxlength: 120 })),
    field('Monthly profit target (£, blank for none)', h('input', { name: 'goal', type: 'number', min: 0, value: s.goal_monthly_pence ? s.goal_monthly_pence / 100 : '' })),
    field('Put aside for tax (%)', h('input', { name: 'tax_set_aside_pct', type: 'number', min: 0, max: 60, value: s.tax_set_aside_pct })),
    field('Currency', select('currency', [['GBP', '£ GBP'], ['USD', '$ USD'], ['EUR', '€ EUR']], s.currency)),
    field('Notes', h('textarea', { name: 'notes', rows: 2 }, s.notes || '')));
  modal(`${s.name} settings`, h('div', body,
    h('div', { class: 'row', style: { marginTop: '14px' } },
      h('button', { class: 'btn sm ghost', onclick: async () => { await patch(`/streams/${s.id}`, { archived: !s.archived }); document.querySelector('.modal-back')?.remove(); toast(s.archived ? 'Back on the hub' : 'Archived – hidden from the hub and totals'); location.hash = s.archived ? `#/api/streams/${s.id}` : '#/api'; } }, s.archived ? 'Unarchive' : 'Archive'),
      state.me.role === 'owner' ? h('button', { class: 'btn sm ghost danger', onclick: async () => { if (await confirmDialog(`Delete ${s.name} and everything recorded in it? This can’t be undone.`, 'Delete for good')) { await del(`/streams/${s.id}`); document.querySelector('.modal-back')?.remove(); toast('Deleted'); location.hash = '#/api'; } } }, 'Delete') : null)), { actions: [
    { label: 'Cancel' },
    { label: 'Save', primary: true, onClick: async () => {
      const f = formData(body);
      await patch(`/streams/${s.id}`, { name: f.name, handle: f.handle, currency: f.currency, notes: f.notes, tax_set_aside_pct: f.tax_set_aside_pct, goal_monthly_pence: f.goal ? toPence(f.goal) : null });
      toast('Saved');
      reload();
      return true;
    } },
  ] });
}

function secretModal(d, reload) {
  const { stream: s } = d;
  const input = h('input', { name: 'secret', placeholder: 'whsec_… (Stripe) or the Shopify webhook secret', class: 'mono', disabled: !d.secrets_available });
  modal('Signing secret', h('div',
    h('p', { class: 'small' }, 'Optional extra security. Stripe and Shopify sign every delivery; with the secret saved here, anything not signed by them is refused. Find it in Stripe → Developers → Webhooks → your endpoint → Signing secret, or at the bottom of Shopify → Settings → Notifications → Webhooks.'),
    d.secrets_available ? null : h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'This is the test build – secrets can only be saved on the live server.'),
    h('div', { style: { marginTop: '10px' } }, input)), { actions: [
    { label: 'Cancel' },
    ...(s.hook_signed ? [{ label: 'Remove secret', onClick: async () => { await put(`/streams/${s.id}/hook/secret`, { secret: '' }); toast('Signing secret removed'); reload(); } }] : []),
    { label: 'Save', primary: true, onClick: async () => { await put(`/streams/${s.id}/hook/secret`, { secret: input.value }); toast('Signing secret saved – unsigned deliveries are now refused'); reload(); } },
  ] });
}

// ───────────────────────── API keys ─────────────────────────

async function renderKeys(el) {
  const data = await get('/api-keys');
  const active = data.keys.filter((k) => !k.revoked_at);
  const revoked = data.keys.filter((k) => k.revoked_at);
  mount(el,
    h('div', { class: 'why small', style: { marginBottom: '14px' } }, h('b', 'One API for everything. '),
      'Give each app its own key with only the permissions it needs. A key can be locked to a single income stream – so the Zapier step feeding your TikTok numbers can never see or change your trading account. Revoke a key and it stops working straight away.'),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', 'API ', h('span', { class: 'blue' }, 'keys')), isAdmin() ? h('button', { class: 'btn sm primary', onclick: () => keyModal(data) }, icon('plus'), 'Create a key') : null),
      h('div', { class: 'card-body' }, active.length ? active.map((k) => h('div', { class: 'list-item', style: { alignItems: 'flex-start' } },
        h('div', { class: 'grow' }, h('b', k.name), h('span', { class: 'small muted mono' }, `  ${k.prefix}`),
          h('div', { class: 'small', style: { marginTop: '3px' } }, k.stream_name ? h('span', h('span', { class: 'blue', style: { fontWeight: 700 } }, `Only ${k.stream_name}`), ' · ') : null, k.scopes.map((sc) => data.scopes[sc] || sc).join(' · ')),
          h('div', { class: 'small muted' }, `Made by ${k.created_by_name || 'someone'} ${ago(k.created_at)} · ${k.last_used_at ? `last used ${ago(k.last_used_at)}` : 'not used yet'}`)),
        isAdmin() ? h('button', { class: 'btn sm ghost danger', onclick: async () => { if (await confirmDialog(`Revoke “${k.name}”? Any app using it stops working straight away.`, 'Revoke')) { await del(`/api-keys/${k.id}`); toast('Key revoked'); renderKeys(el); } } }, 'Revoke') : null))
        : h('div', { class: 'empty' }, 'No keys yet. Create one for each app that should send or read data – Zapier, Make, a trading bot, your website or a spreadsheet script.'))),
    revoked.length ? h('p', { class: 'small muted', style: { marginTop: '10px' } }, `Revoked: ${revoked.map((k) => k.name).join(', ')}`) : null);
}

async function keyModal(data, streamId = null) {
  const [keys, hub] = await Promise.all([data ? data : get('/api-keys'), get('/streams')]);
  const body = h('div');
  const draw = (sid) => {
    const forStream = Boolean(sid);
    const typed = body.querySelector('[name=name]')?.value || '';
    mount(body,
      field('Name', h('input', { name: 'name', maxlength: 80, value: typed, placeholder: forStream ? `e.g. Zapier → ${hub.streams.find((s) => s.id === sid)?.name}` : 'e.g. Website lead form, Trading bot, Zapier' }), { required: true }),
      field('Which income streams can it use?', select('stream_id', [['', 'All of them'], ...hub.streams.map((s) => [s.id, `Only ${s.name}`])], sid || '')),
      h('div', { class: 'field' }, h('span', 'Permissions'),
        Object.entries(keys.scopes).filter(([k]) => !forStream || k.startsWith('income:')).map(([k, label]) => h('label', { class: 'check' },
          h('input', { type: 'checkbox', name: `scope:${k}`, checked: k.startsWith('income:') }), h('span', label)))),
      forStream ? h('p', { class: 'small muted' }, 'Locked to one stream, so it can only read and add to that stream.') : null);
    body.querySelector('[name=stream_id]').addEventListener('change', (e) => draw(e.target.value));
  };
  draw(streamId);
  modal('Create an API key', body, { actions: [
    { label: 'Cancel' },
    { label: 'Create key', primary: true, onClick: async () => {
      const f = formData(body);
      const scopes = Object.entries(f).filter(([k, v]) => k.startsWith('scope:') && v).map(([k]) => k.slice(6));
      const created = await post('/api-keys', { name: f.name, stream_id: f.stream_id || null, scopes });
      showKey(created);
      return true;
    } },
  ] });
}

function showKey(created) {
  modal('Your new API key', h('div',
    h('p', { class: 'small' }, h('b', 'Copy it now – it won’t be shown again. '), 'Treat it like a password: anyone with it can use the permissions you gave it.'),
    h('div', { class: 'row', style: { marginTop: '10px', flexWrap: 'nowrap' } }, h('input', { readonly: true, value: created.key, class: 'mono', onfocus: (e) => e.target.select() }),
      h('button', { class: 'btn sm primary', onclick: () => copyText(created.key, 'Key copied') }, icon('copy'), 'Copy')),
    h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Send it with each request as the header ', h('code', 'Authorization: Bearer <key>'), '. Try it under API docs & try it.')), { actions: [
    { label: 'Try it now', onClick: () => { sessionStorage.setItem('cm-try-key', created.key); location.hash = '#/api/docs'; if (location.hash === '#/api/docs') window.dispatchEvent(new HashChangeEvent('hashchange')); } },
    { label: 'Done', primary: true, onClick: () => { if (location.hash.startsWith('#/api/keys')) window.dispatchEvent(new HashChangeEvent('hashchange')); } },
  ] });
}

// ───────────────────────── Activity ─────────────────────────

async function renderActivity(el, kind) {
  const rows = await get(`/api-keys/activity${kind ? `?kind=${kind}` : ''}`);
  mount(el,
    h('div', { class: 'row', style: { marginBottom: '12px', gap: '6px' } }, [['', 'Everything'], ['api', 'API requests'], ['webhook', 'Web address deliveries']].map(([k, l]) => h('a', { class: `chip ${kind === k ? 'active' : ''}`, href: `#/api/activity${k ? `?kind=${k}` : ''}` }, l))),
    h('div', { class: 'card', style: { overflow: 'hidden' } }, rows.length ? h('div', { class: 'card-body', style: { padding: 0 } }, h('table', { class: 'table static' },
      h('thead', h('tr', ['When', 'Result', 'Request', 'Key / stream', 'What happened'].map((x) => h('th', x)))),
      h('tbody', rows.map((l) => h('tr',
        h('td', { class: 'small', style: { whiteSpace: 'nowrap' } }, dateTime(l.created_at)),
        h('td', statusBadge(l.status)),
        h('td', { class: 'small mono' }, `${l.method} ${l.path}`),
        h('td', { class: 'small' }, l.kind === 'webhook' ? `${l.stream_name || 'Stream'} web address` : l.key_name || '–', l.kind === 'api' && l.stream_name ? h('div', { class: 'muted' }, l.stream_name) : null),
        h('td', { class: 'small muted' }, l.summary || '')))))) : h('div', { class: 'empty' }, 'Nothing yet. Every API request and every delivery to a stream’s web address is listed here, so you can see exactly what came in and whether it worked.')));
}

// ───────────────────────── Docs & try it ─────────────────────────

async function renderDocs(el, hub) {
  const data = await get('/api-keys');
  const first = hub.streams[0];
  const endpointsWithIds = data.endpoints.map((e) => ({ ...e, filled: e.path.replace(':id', first?.id || ':id').replace(':entryId', 'ent_…') }));
  const keyInput = h('input', { class: 'mono', placeholder: 'cmk_… – paste a key (create one under API keys)', value: sessionStorage.getItem('cm-try-key') || '' });
  const endpoint = select('endpoint', endpointsWithIds.map((e, i) => [String(i), `${e.method} ${e.path}`]), '0');
  const streamPick = select('stream', hub.streams.map((s) => [s.id, s.name]), first?.id);
  const bodyArea = h('textarea', { rows: 6, class: 'mono small' });
  const out = h('pre', { class: 'pre mono small try-out' }, 'The response will appear here.');
  const sync = () => {
    const e = endpointsWithIds[Number(endpoint.value)];
    bodyArea.value = e.method === 'POST' ? JSON.stringify(e.example || {}, null, 2) : '';
    bodyArea.disabled = e.method !== 'POST';
    streamPick.disabled = !e.path.includes(':id');
  };
  endpoint.addEventListener('change', sync);
  sync();
  const send = async () => {
    const e = endpointsWithIds[Number(endpoint.value)];
    const path = e.path.replace(':id', streamPick.value || ':id').replace(':entryId', 'ent_unknown');
    if (!keyInput.value.trim()) { toast('Paste an API key first (create one under API keys)', 'error'); return; }
    sessionStorage.setItem('cm-try-key', keyInput.value.trim());
    let parsed;
    if (e.method === 'POST') { try { parsed = JSON.parse(bodyArea.value || '{}'); } catch { toast('The body isn’t valid JSON', 'error'); return; } }
    out.textContent = 'Sending…';
    try {
      const res = await fetch(`/api${path}`, { method: e.method, headers: { 'content-type': 'application/json', authorization: `Bearer ${keyInput.value.trim()}` }, body: parsed ? JSON.stringify(parsed) : undefined });
      const json = await res.json().catch(() => null);
      out.textContent = `${res.status} ${res.ok ? 'OK' : 'Error'}  ·  ${e.method} /api${path}\n\n${JSON.stringify(json, null, 2)}`;
    } catch (err) { out.textContent = `Couldn’t reach the server: ${err.message}`; }
  };
  const example = first ? `curl ${data.base_url}/v1/streams/${first.id}/entries \\\n  -H "Authorization: Bearer cmk_live_…" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount": 49.99, "description": "Notion template", "id": "order-1042"}'` : `curl ${data.base_url}/v1 -H "Authorization: Bearer cmk_live_…"`;
  mount(el,
    h('div', { class: 'grid g2', style: { alignItems: 'start' } },
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', 'Try it ', h('span', { class: 'blue' }, 'live'))),
        h('div', { class: 'card-body' },
          h('p', { class: 'small muted' }, data.demo ? 'This is the test build: requests run against this page’s own data, exactly as they would on the live server.' : 'Requests go to this system with the key you paste – exactly what another app would do.'),
          field('API key', keyInput),
          h('div', { class: 'grid g2' }, field('Endpoint', endpoint), field('Income stream', streamPick)),
          field('Body (JSON)', bodyArea),
          h('button', { class: 'btn primary', onclick: send }, icon('send'), 'Send request'),
          h('div', { style: { marginTop: '12px' } }, out))),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', 'How it ', h('span', { class: 'blue' }, 'works'))),
        h('div', { class: 'card-body small' },
          h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Base address'), h('code', `${data.base_url}`)),
          h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Sign in with'), h('code', 'Authorization: Bearer cmk_…')),
          h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Format'), h('span', 'JSON in, JSON out. Money as pounds (49.99) or amount_pence.')),
          h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Limit'), h('span', '120 requests a minute per key')),
          h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'No double counting'), h('span', 'send an id with each entry – the same id twice is ignored')),
          h('pre', { class: 'pre mono', style: { marginTop: '10px', overflowX: 'auto' } }, example)))),
    h('div', { class: 'card', style: { marginTop: '16px' } },
      h('div', { class: 'card-head' }, h('h3', 'Endpoints')),
      h('div', { class: 'card-body', style: { padding: 0 } }, h('table', { class: 'table static' },
        h('thead', h('tr', ['Request', 'Permission', 'What it does'].map((x) => h('th', x)))),
        h('tbody', data.endpoints.map((e) => h('tr',
          h('td', { class: 'mono small', style: { whiteSpace: 'nowrap' } }, h('b', e.method), ` ${e.path}`),
          h('td', { class: 'small' }, e.scope || '–'),
          h('td', { class: 'small' }, e.about, e.example ? h('div', { class: 'mono muted', style: { marginTop: '3px' } }, JSON.stringify(e.example)) : null))))))),
    h('div', { class: 'card', style: { marginTop: '16px' } },
      h('div', { class: 'card-head' }, h('h3', 'Each stream’s ', h('span', { class: 'blue' }, 'web address'))),
      h('div', { class: 'card-body small' },
        h('p', 'Every income stream also has its own web address (on its page) that needs no key – the address itself is the password. It understands:'),
        h('ul', { class: 'connect-steps' },
          h('li', h('b', 'Stripe'), ' – charge.succeeded, checkout.session.completed, payment_intent.succeeded, invoice.paid and charge.refunded. One sale is never counted twice, even if several of these arrive.'),
          h('li', h('b', 'Shopify'), ' – “Order payment” (orders/paid) and “Refund create” webhooks, JSON format.'),
          h('li', h('b', 'Gumroad'), ' – the Ping (sales and refunds).'),
          h('li', h('b', 'Anything else'), ' – { "amount": 49.99, "description": "…", "id": "…" }, a list of those, or { "metrics": { "followers": 12500 } }. A negative amount is money out.')),
        h('p', { class: 'muted' }, 'Add a signing secret on the stream page and Stripe/Shopify deliveries without a valid signature are refused.'))));
}


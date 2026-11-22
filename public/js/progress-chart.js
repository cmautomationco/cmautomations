import { h } from './ui.js';

/**
 * The client's progress chart: their check-ins against the expected path to
 * their goal. The expected path is slow for the first few weeks and then picks
 * up, so a flat start reads as normal, not as failure.
 *
 * Colours (validated for colour-blind separation on white): the client's line is
 * the brand blue; the expected path is amber and dashed, so it never relies on
 * colour alone. Both are named in the legend and labelled at their ends.
 */

const C_YOU = '#1e6a9e';
const C_EXPECTED = '#c2700f';
const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, text) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
};

function niceTicks(min, max, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) || raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const fmt = (v, unit) => `${Number.isInteger(v) ? v : Number(v).toFixed(1)}${unit ? ` ${unit}` : ''}`;

/** progress: { actual: [{week, value}], expected: [{week, value}], weeks, metric_label, metric_unit, current_week } */
export function progressChart(progress, { audience = 'client' } = {}) {
  const { actual = [], expected = [], weeks = 12, metric_unit: unit = '', metric_label: label = 'Progress' } = progress;
  // Drawn at the size it's shown, so the labels stay readable on a phone.
  const narrow = typeof window !== 'undefined' && window.innerWidth < 600;
  const W = narrow ? 380 : 640;
  const H = narrow ? 250 : 280;
  const PAD = narrow ? { l: 38, r: 74, t: 18, b: 34 } : { l: 46, r: 96, t: 18, b: 36 };
  const wrap = h('div', { class: 'pchart' });
  if (!actual.length && !expected.length) {
    wrap.append(h('div', { class: 'pchart-empty' }, audience === 'client'
      ? 'Your chart appears once you’ve shared your starting point in your intake form.'
      : 'The chart appears once they share a starting point (intake form) or you add one.'));
    return wrap;
  }
  const values = [...actual, ...expected].map((p) => p.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const x = (w) => PAD.l + (w / weeks) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);

  const legend = h('div', { class: 'pchart-legend' },
    h('span', h('i', { class: 'sw you' }), audience === 'client' ? 'You' : 'Client'),
    expected.length ? h('span', h('i', { class: 'sw expected' }), 'Expected path') : null,
    h('span', { class: 'muted' }, `${label}${unit ? ` (${unit})` : ''} by week`));

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pchart-svg', role: 'img', 'aria-label': `${label} by week: ${actual.map((p) => `week ${p.week} ${fmt(p.value, unit)}`).join(', ')}` });
  // The early weeks: foundations, where little shows yet.
  const early = Math.min(3, weeks);
  svg.append(s('rect', { x: x(0), y: PAD.t, width: x(early) - x(0), height: H - PAD.t - PAD.b, fill: '#f2f7fb' }));
  // The band's label goes wherever the lines aren't: the bottom when they start high (a goal that goes down).
  const startsHigh = y((actual[0] || expected[0]).value) < PAD.t + (H - PAD.t - PAD.b) / 2;
  svg.append(s('text', { x: x(early / 2), y: startsHigh ? H - PAD.b - 8 : PAD.t + 14, 'text-anchor': 'middle', class: 'pchart-band' }, narrow ? 'Foundations' : 'Building foundations'));
  for (const t of ticks) {
    svg.append(s('line', { x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t), stroke: '#e2e8f0', 'stroke-width': 1 }));
    svg.append(s('text', { x: PAD.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'pchart-tick' }, fmt(t, '')));
  }
  const every = weeks > 16 ? 4 : weeks > 8 || narrow ? (narrow && weeks > 8 ? 4 : 2) : 1;
  for (let w = 0; w <= weeks; w += every) svg.append(s('text', { x: x(w), y: H - PAD.b + 18, 'text-anchor': 'middle', class: 'pchart-tick' }, w === 0 ? 'Start' : `Wk ${w}`));

  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.week).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  if (expected.length) {
    svg.append(s('path', { d: path(expected), fill: 'none', stroke: C_EXPECTED, 'stroke-width': 2, 'stroke-dasharray': '6 5', 'stroke-linecap': 'round' }));
    const end = expected[expected.length - 1];
    svg.append(s('text', { x: x(end.week) + 8, y: y(end.value) + 4, class: 'pchart-label' }, `Goal ${fmt(end.value, unit)}`));
  }
  if (actual.length) {
    if (actual.length > 1) svg.append(s('path', { d: path(actual), fill: 'none', stroke: C_YOU, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    for (const p of actual) svg.append(s('circle', { cx: x(p.week), cy: y(p.value), r: 4.5, fill: C_YOU, stroke: '#fff', 'stroke-width': 2 }));
    const last = actual[actual.length - 1];
    svg.append(s('text', { x: x(last.week) + 9, y: y(last.value) - 8, class: 'pchart-label strong' }, `${audience === 'client' ? 'You' : 'Now'}: ${fmt(last.value, unit)}`));
  }

  // Hover: a crosshair and a tooltip for each week.
  const cross = s('line', { y1: PAD.t, y2: H - PAD.b, stroke: '#94a3b8', 'stroke-width': 1, visibility: 'hidden' });
  svg.append(cross);
  const tip = h('div', { class: 'pchart-tip', hidden: true });
  const byWeek = (list, w) => list.find((p) => p.week === w);
  for (let w = 0; w <= weeks; w++) {
    const hit = s('rect', { x: x(w) - (x(1) - x(0)) / 2, y: PAD.t, width: x(1) - x(0), height: H - PAD.t - PAD.b, fill: 'transparent' });
    const show = () => {
      const a = byWeek(actual, w); const e = byWeek(expected, w);
      cross.setAttribute('x1', x(w)); cross.setAttribute('x2', x(w)); cross.setAttribute('visibility', 'visible');
      tip.replaceChildren(h('b', w === 0 ? 'Start' : `Week ${w}`),
        h('div', h('i', { class: 'sw you' }), audience === 'client' ? 'You: ' : 'Client: ', a ? fmt(a.value, unit) : w > (progress.current_week || 0) ? 'to come' : 'no check-in'),
        e ? h('div', h('i', { class: 'sw expected' }), 'Expected: ', fmt(e.value, unit)) : null);
      tip.hidden = false;
      tip.style.left = `${(x(w) / W) * 100}%`;
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
    svg.append(hit);
  }

  const table = h('details', { class: 'pchart-table' }, h('summary', 'See as a table'),
    h('table', { class: 'table' }, h('thead', h('tr', h('th', 'Week'), h('th', audience === 'client' ? 'You' : 'Client'), h('th', 'Expected'))),
      h('tbody', Array.from({ length: weeks + 1 }, (_, w) => {
        const a = byWeek(actual, w); const e = byWeek(expected, w);
        return a || (e && w <= Math.max(progress.current_week || 0, 0)) ? h('tr', h('td', w === 0 ? 'Start' : `Week ${w}`), h('td', a ? fmt(a.value, unit) : '–'), h('td', e ? fmt(e.value, unit) : '–')) : null;
      }))));

  wrap.append(legend, h('div', { class: 'pchart-plot' }, svg, tip), table);
  return wrap;
}

/** The words that go with the chart, so a slow start reads as normal. */
export function progressNote(progress, { audience = 'client' } = {}) {
  const wk = progress.current_week || 0;
  const you = audience === 'client';
  if (wk <= 3) return you
    ? 'The first two or three weeks are about building the habits and foundations. Most people see little change on the chart yet. That’s normal and expected. After that it picks up, and keeps picking up.'
    : 'Weeks 1–3 are foundations: expect a flat line. Reassure them that this is normal.';
  return you
    ? 'You’re past the foundation weeks. This is where progress picks up, week after week, as long as the check-ins keep coming.'
    : 'Past the foundation weeks: progress should now be picking up.';
}

/** A small single-line trend for one 1–5 rating, from their starting point to now. */
function sparkline(series, label) {
  const w = 120; const hgt = 34; const pad = 4;
  const weeks = Math.max(1, series[series.length - 1].week - series[0].week);
  const x = (wk) => pad + ((wk - series[0].week) / weeks) * (w - pad * 2);
  const y = (v) => pad + (1 - (v - 1) / 4) * (hgt - pad * 2);
  const svg = s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'spark', role: 'img', 'aria-label': `${label}: ${series.map((p) => `${p.week ? `week ${p.week}` : 'start'} ${p.value} out of 5`).join(', ')}` });
  svg.append(s('line', { x1: pad, x2: w - pad, y1: y(3), y2: y(3), stroke: '#e2e8f0', 'stroke-width': 1 }));
  if (series.length > 1) svg.append(s('path', { d: series.map((p, i) => `${i ? 'L' : 'M'}${x(p.week).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '), fill: 'none', stroke: C_YOU, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const last = series[series.length - 1];
  svg.append(s('circle', { cx: x(last.week), cy: y(last.value), r: 4, fill: C_YOU, stroke: '#fff', 'stroke-width': 2 }));
  return svg;
}

/**
 * Their results: the number, how they feel, and their wins. Results aren't only
 * on the scales: a clearer head, better habits and happier days count, and they
 * often come first. At the end of the programme this is their transformation.
 */
export function resultsPanel(progress, { audience = 'client' } = {}) {
  const r = progress.results || { items: [], wins: [], improved: [] };
  const you = audience === 'client';
  const feel = (progress.wellbeing || []).filter((d) => d.series.length);
  const wrap = h('div', { class: 'results stack' },
    h('div', { class: 'cp-phase-head' }, h('h2', r.finished ? (you ? 'Your transformation' : 'Their transformation') : (you ? 'Your results so far' : 'Their results so far'))),
    h('p', { class: 'small muted', style: { margin: 0 } }, you
      ? 'Results aren’t only on the chart. A clearer head, better habits and happier days count too, and they often come first.'
      : 'Not just the number: how they feel, their habits and their wins. Use these when the chart is slow.'));
  if (r.improved.length) {
    wrap.append(h('div', { class: 'results-better' }, h('b', you ? 'Better since you started: ' : 'Better since they started: '), r.improved.join(', ')));
  }
  if (feel.length) {
    wrap.append(h('div', { class: 'feel-grid' }, feel.map((d) => h('div', { class: 'feel' },
      h('div', { class: 'feel-head' }, h('b', d.label), d.now !== null ? h('span', { class: 'feel-now' }, `${d.now}/5`) : null),
      sparkline(d.series, d.label),
      h('div', { class: 'small muted' }, d.change === null ? 'One more check-in to see the change' : d.change > 0 ? `Up ${d.change} since ${you ? 'you' : 'they'} started (${d.start}/5)` : d.change < 0 ? `Down ${-d.change} since the start (${d.start}/5)` : `Same as the start (${d.start}/5)`)))));
  } else {
    wrap.append(h('div', { class: 'pchart-empty' }, you ? 'Rate how you feel in your check-ins and your results show here.' : 'Their ratings show here once they check in.'));
  }
  if (r.wins.length) {
    wrap.append(h('div', h('b', `${r.wins.length} win${r.wins.length === 1 ? '' : 's'} logged`),
      h('ul', { class: 'wins' }, [...r.wins].reverse().slice(0, 3).map((w) => h('li', h('span', { class: 'muted' }, `Week ${w.week}: `), w.text)))));
  }
  return wrap;
}

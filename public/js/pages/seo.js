import { del, get, patch, post, put } from '../api.js';
import { state } from '../app.js';
import { field, h, icon, mount, select, showError, toast } from '../ui.js';

/**
 * SEO: what Google search can do for this business, a checklist that knows
 * what's already done, a keyword planner from the business's own services and
 * areas, the full guide, and the SEO packages to offer a business.
 */

const TABS = [['plan', 'Your plan'], ['checklist', 'Checklist'], ['keywords', 'Keywords'], ['learn', 'SEO explained'], ['offer', 'What to offer']];
const STATUS = [['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done'], ['skip', 'Not relevant']];
const isAdmin = () => state.me.role !== 'member';
const stat = (label, value, sub, cls = '') => h('div', { class: `card kpi ${cls}` }, h('div', { class: 'label' }, label), h('div', { class: `value ${cls ? '' : 'blue'}` }, value), h('div', { class: 'sub' }, sub));
const bar = (done, total) => h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(Math.round((done / (total || 1)) * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { style: { width: `${Math.round((done / (total || 1)) * 100)}%` } }));

export async function render(el, route) {
  const tab = TABS.some(([k]) => k === route.parts[1]) ? route.parts[1] : 'plan';
  const d = await get('/seo');
  const body = h('div');
  const reload = () => render(el, route);
  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'SEO'),
        h('h1', { style: { marginTop: '6px' } }, 'Get found on ', h('span', { class: 'blue' }, 'Google')),
        h('p', `What search can do for ${d.business}, the jobs that make the difference (in the right order), the searches to aim for, and everything explained in plain words.`)),
      h('div', { class: 'row' },
        h('a', { class: 'btn soft', href: '#/seo/learn' }, icon('book'), 'SEO explained'),
        isAdmin() ? h('button', { class: 'btn primary', onclick: () => makePlan(5, reload) }, icon('check'), 'Turn the next 5 jobs into tasks') : null)),
    h('div', { class: 'grid g4', style: { marginBottom: '16px' } },
      stat('SEO score', `${d.score.pct}%`, 'weighted by how much each job matters', 'accent'),
      stat('Jobs done', `${d.score.done} / ${d.score.total}`, 'on the checklist'),
      stat('Searches tracked', String(d.keywords.length), d.keywords.filter((k) => k.position && k.position <= 10).length ? `${d.keywords.filter((k) => k.position && k.position <= 10).length} on page one` : 'add them in Keywords'),
      stat('Your kind of business', d.niche.label, d.local ? 'Local – the Google map matters most' : 'Online / national – content matters most')),
    h('div', { class: 'tabs' }, TABS.map(([k, l]) => h('a', { href: `#/seo${k === 'plan' ? '' : `/${k}`}`, class: tab === k ? 'active' : '' }, l))),
    body);
  if (tab === 'checklist') return renderChecklist(body, d, route.query.show || '', reload);
  if (tab === 'keywords') return renderKeywords(body, d, reload);
  if (tab === 'learn') return renderLearn(body, d);
  if (tab === 'offer') return renderOffer(body, d);
  return renderPlan(body, d, reload);
}

async function makePlan(count, reload) {
  try {
    const r = await post('/seo/plan', { count });
    toast(r.created ? `${r.created} SEO task${r.created === 1 ? '' : 's'} added to Tasks` : 'Those jobs are already on your task list');
    reload();
  } catch (err) { showError(err); }
}

async function setStatus(key, status, reload) {
  try { await put(`/seo/items/${key}`, { status }); toast(status === 'done' ? 'Nice – ticked off' : 'Updated'); reload(); } catch (err) { showError(err); }
}

async function makeTask(key) {
  try { const r = await post(`/seo/items/${key}/task`); toast(r.existing ? 'It’s already on your task list' : 'Added to Tasks'); } catch (err) { showError(err); }
}

// ───────────────────────── Your plan ─────────────────────────

function renderPlan(el, d, reload) {
  const g = d.guide;
  mount(el,
    h('div', { class: 'grid g2', style: { alignItems: 'start' } },
      h('div', { class: 'stack' },
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', 'What SEO will do for ', h('span', { class: 'blue' }, d.business))),
          h('div', { class: 'card-body stack', style: { gap: '10px' } },
            h('p', h('b', 'How your customers search: '), g.searches),
            h('div', h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'What you’ll get from it'), h('ul', { class: 'seo-list' }, g.gets.map((x) => h('li', x)))),
            h('p', { class: 'small' }, h('b', 'The numbers to watch: '), g.kpi),
            h('p', { class: 'small muted' }, 'Honest expectations: first movement usually in 2–3 months, real results in 4–12 months depending on competition. Nobody can guarantee a #1 spot.'))),
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', 'Quick ', h('span', { class: 'blue' }, 'wins')), h('span', { class: 'small muted' }, 'start here this week')),
          h('div', { class: 'card-body' }, h('ol', { class: 'seo-list' }, g.quickWins.map((x) => h('li', x))))),
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', 'Content ', h('span', { class: 'blue' }, 'ideas'))),
          h('div', { class: 'card-body' },
            h('p', { class: 'small muted', style: { marginBottom: '6px' } }, 'Questions your customers search before they buy – each one is a page or post. Content Studio can turn them into briefs.'),
            h('ul', { class: 'seo-list' }, g.content.map((x) => h('li', x)))))),
      h('div', { class: 'stack' },
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', 'Your next ', h('span', { class: 'blue' }, `${d.next.length} jobs`)), h('a', { class: 'small', href: '#/seo/checklist' }, 'Full checklist →')),
          h('div', { class: 'card-body' }, d.next.length ? d.next.map((i) => h('div', { class: 'list-item', style: { alignItems: 'flex-start' } },
            h('div', { class: 'grow' }, h('b', i.title), h('div', { class: 'small muted' }, `${i.pillar_title} · ${i.impact_label} impact · ${i.effort}`), h('div', { class: 'small', style: { marginTop: '3px' } }, i.how)),
            h('div', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } },
              h('button', { class: 'btn sm', onclick: () => makeTask(i.key) }, 'Task'),
              h('button', { class: 'btn sm primary', onclick: () => setStatus(i.key, 'done', reload) }, icon('tick'), 'Done'))))
            : h('div', { class: 'empty' }, 'Everything on the checklist is done – keep the reviews, photos and content flowing.'))),
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', 'Where to focus, ', h('span', { class: 'blue' }, 'in order'))),
          h('div', { class: 'card-body' },
            h('p', { class: 'small muted', style: { marginBottom: '8px' } }, `The order that matters most for ${d.niche.label.toLowerCase()}.`),
            g.priorities.map((p, idx) => {
              const sc = d.score.byPillar.find((x) => x.key === p.key);
              return h('a', { class: 'seo-focus', href: `#/seo/learn?p=${p.key}` },
                h('span', { class: 'seo-rank' }, String(idx + 1)),
                h('div', { class: 'grow' }, h('b', p.title), h('div', { class: 'small muted' }, p.short), sc ? bar(sc.done, sc.total) : null),
                sc ? h('span', { class: 'small muted', style: { whiteSpace: 'nowrap' } }, `${sc.done}/${sc.total}`) : null);
            }))),
        profileCard(d, reload))));
}

function profileCard(d, reload) {
  const box = h('div', { class: 'stack', style: { gap: '10px' } },
    field(d.local ? 'Your main town or city' : 'Where you’re based (optional)', h('input', { name: 'location', value: d.profile.location, placeholder: 'e.g. Bristol' })),
    d.local ? field('Other areas you cover', h('input', { name: 'areas', value: d.profile.areas.join(', '), placeholder: 'e.g. Clifton, Bath, Keynsham' }), { help: 'Separate with commas – each can have its own page.' }) : null,
    field('Your main services', h('input', { name: 'services', value: d.profile.services.join(', ') }), { help: 'Separate with commas, in the words customers would use.' }));
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', 'Your ', h('span', { class: 'blue' }, 'services & areas'))),
    h('div', { class: 'card-body' }, box,
      isAdmin() ? h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn sm primary', onclick: async () => {
        const v = (n) => box.querySelector(`[name=${n}]`)?.value;
        try { await put('/seo/profile', { location: v('location'), ...(d.local ? { areas: v('areas') } : {}), services: v('services') }); toast('Saved – keyword ideas now use these'); reload(); } catch (err) { showError(err); }
      } }, 'Save'), h('a', { class: 'btn sm', href: '#/seo/keywords' }, 'Suggest searches →')) : null));
}

// ───────────────────────── Checklist ─────────────────────────

function renderChecklist(el, d, show, reload) {
  const order = d.guide.priorities.map((p) => p.key);
  const pillars = d.learn.pillars.filter((p) => d.checklist.some((i) => i.pillar === p.key)).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const visible = (i) => !show || (show === 'todo' ? ['todo', 'doing'].includes(i.status) : i.status === show);
  mount(el,
    h('div', { class: 'row', style: { marginBottom: '12px', gap: '6px' } },
      [['', `All (${d.checklist.length})`], ['todo', `Still to do (${d.checklist.filter((i) => ['todo', 'doing'].includes(i.status)).length})`], ['done', `Done (${d.checklist.filter((i) => i.status === 'done').length})`]]
        .map(([k, l]) => h('a', { class: `chip ${show === k ? 'active' : ''}`, href: `#/seo/checklist${k ? `?show=${k}` : ''}` }, l))),
    h('p', { class: 'small muted', style: { marginBottom: '12px' } }, 'Sections are in the order that matters most for your kind of business. Items marked ✓ in your system were ticked automatically from what’s already set up here.'),
    pillars.map((p) => {
      const items = d.checklist.filter((i) => i.pillar === p.key && visible(i));
      if (!items.length) return null;
      const all = d.checklist.filter((i) => i.pillar === p.key);
      return h('div', { class: 'card', style: { marginBottom: '14px' } },
        h('div', { class: 'card-head' }, h('div', h('h3', p.title), h('div', { class: 'small muted' }, p.short)), h('span', { class: 'small muted' }, `${all.filter((i) => i.status === 'done').length}/${all.length} done`)),
        h('div', { class: 'card-body' }, items.map((i) => {
          const how = h('div', { class: 'small seo-how', hidden: true }, i.how);
          const pickStatus = select('status', STATUS, i.status);
          pickStatus.setAttribute('aria-label', `Status: ${i.title}`);
          pickStatus.onchange = () => setStatus(i.key, pickStatus.value, reload);
          return h('div', { class: `seo-item ${i.status}` },
            h('div', { class: 'seo-item-main' },
              h('div', { class: 'grow', style: { minWidth: 0 } },
                h('button', { class: 'seo-title', type: 'button', 'aria-expanded': 'false', onclick: (e) => { how.hidden = !how.hidden; e.currentTarget.setAttribute('aria-expanded', String(!how.hidden)); } }, i.status === 'done' ? '✓ ' : '', i.title),
                h('div', { class: 'small muted' }, `${i.impact_label} impact · ${i.effort}${i.local ? ' · local' : ''}`),
                i.detected ? h('div', { class: 'small blue', style: { fontWeight: 600 } }, `✓ In your system: ${i.detected}`) : null,
                how),
              h('div', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } },
                h('div', { style: { width: '130px' } }, pickStatus),
                i.status !== 'done' ? h('button', { class: 'btn sm', onclick: () => makeTask(i.key), title: 'Add to Tasks' }, 'Task') : null)));
        })));
    }));
}

// ───────────────────────── Keywords ─────────────────────────

function renderKeywords(el, d, reload) {
  const ideasBox = h('div');
  const suggest = async () => {
    try {
      const ideas = await post('/seo/keywords/ideas', {});
      const groups = Object.entries(d.intents).map(([k, label]) => [k, label, ideas.filter((i) => i.intent === k)]).filter(([, , list]) => list.length);
      mount(ideasBox, h('div', { class: 'card', style: { marginBottom: '16px' } },
        h('div', { class: 'card-head' }, h('h3', 'Suggested ', h('span', { class: 'blue' }, 'searches')), h('span', { class: 'small muted' }, `${ideas.length} ideas from your services${d.profile.location ? ` and ${d.profile.location}` : ''}`)),
        h('div', { class: 'card-body stack' },
          h('p', { class: 'small muted' }, 'Tick the ones to track. We can’t see search volumes here – check them free in Google Search Console (searches you already appear for) or Google Keyword Planner. Aim first for “ready to buy” and “urgent” searches; “researching” ones are for helpful content.'),
          groups.map(([k, label, list]) => h('div', h('div', { class: 'eyebrow', style: { margin: '6px 0' } }, label),
            list.map((i) => h('label', { class: 'check seo-idea' },
              h('input', { type: 'checkbox', 'data-idea': JSON.stringify({ phrase: i.phrase, intent: i.intent, page: i.page }), checked: !i.tracked && i.priority === 'High', disabled: i.tracked }),
              h('span', { class: 'grow' }, h('b', i.phrase), i.tracked ? h('span', { class: 'muted' }, ' (tracked)') : null, h('div', { class: 'small muted' }, `${i.priority} priority · aim with: ${i.page} · ${i.why}`)))))),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: async () => {
            const keywords = [...ideasBox.querySelectorAll('input[data-idea]:checked:not(:disabled)')].map((x) => JSON.parse(x.dataset.idea));
            if (!keywords.length) return toast('Tick at least one search', 'error');
            try { const r = await post('/seo/keywords', { keywords }); toast(`Tracking ${r.added} new search${r.added === 1 ? '' : 'es'}`); reload(); } catch (err) { showError(err); }
          } }, icon('plus'), 'Track the ticked searches')))));
    } catch (err) { showError(err); }
  };
  const addOwn = h('input', { placeholder: 'Add your own, e.g. combi boiler installation bristol', 'aria-label': 'Add a search to track' });
  mount(el,
    h('div', { class: 'why small', style: { marginBottom: '14px' } }, h('b', 'How this works: '), 'pick the searches that bring you customers, note which page should win each one, and once a month copy your average position from Google Search Console (Performance → Queries). Watching them climb shows the work paying off.'),
    h('div', { class: 'row', style: { marginBottom: '14px' } },
      h('button', { class: 'btn primary', onclick: suggest }, icon('wand'), 'Suggest searches for my services'),
      h('a', { class: 'btn ghost', href: '#/seo' }, 'Edit services & areas')),
    ideasBox,
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', 'Searches you’re ', h('span', { class: 'blue' }, 'tracking'))),
      h('div', { class: 'card-body', style: { padding: d.keywords.length ? 0 : undefined } }, d.keywords.length ? h('table', { class: 'table static seo-table' },
        h('thead', h('tr', ['Search', 'Type', 'Page that should win it', 'Position', ''].map((x) => h('th', x)))),
        h('tbody', d.keywords.map((k) => {
          const pos = h('input', { type: 'number', min: 1, max: 100, value: k.position ?? '', placeholder: '–', 'aria-label': `Position for ${k.phrase}`, style: { width: '72px' } });
          pos.onchange = async () => { try { await patch(`/seo/keywords/${k.id}`, { position: pos.value === '' ? null : Number(pos.value) }); toast('Position saved'); reload(); } catch (err) { showError(err); } };
          const change = k.position && k.previous ? k.previous - k.position : 0;
          return h('tr',
            h('td', h('b', k.phrase)),
            h('td', { class: 'small muted' }, d.intents[k.intent] || ''),
            h('td', { class: 'small' }, k.page || '–'),
            h('td', { style: { whiteSpace: 'nowrap' } }, pos, change ? h('span', { class: `small ${change > 0 ? 'blue' : 'muted'}`, style: { marginLeft: '6px', fontWeight: 700 } }, change > 0 ? `▲ ${change}` : `▼ ${-change}`) : null,
              k.position && k.position <= 3 ? h('span', { class: 'small blue', style: { marginLeft: '6px' } }, 'top 3') : k.position && k.position <= 10 ? h('span', { class: 'small muted', style: { marginLeft: '6px' } }, 'page one') : null),
            h('td', h('button', { class: 'icon-btn', 'aria-label': `Stop tracking ${k.phrase}`, onclick: async () => { await del(`/seo/keywords/${k.id}`); reload(); } }, icon('x'))));
        })))
        : h('div', { class: 'empty' }, 'Nothing tracked yet. Press “Suggest searches” to start from your services and areas.')),
      h('div', { class: 'card-body row', style: { borderTop: '1px solid var(--line-soft)', flexWrap: 'nowrap' } }, addOwn,
        h('button', { class: 'btn sm', onclick: async () => {
          if (!addOwn.value.trim()) return;
          try { await post('/seo/keywords', { keywords: [{ phrase: addOwn.value, intent: 'ready' }] }); reload(); } catch (err) { showError(err); }
        } }, icon('plus'), 'Track'))));
}

// ───────────────────────── SEO explained ─────────────────────────

function renderLearn(el, d) {
  const L = d.learn;
  const sections = [['what', 'What SEO is'], ['gets', 'What a business gets from it'], ['need', 'Do you need it?'], ['how', 'How Google decides'], ...L.pillars.map((p) => [`p-${p.key}`, p.title]), ['timeline', 'What to expect, month by month'], ['channels', 'SEO vs ads vs social'], ['glossary', 'Jargon in plain words']];
  mount(el,
    h('div', { class: 'seo-learn' },
      h('nav', { class: 'card seo-toc', 'aria-label': 'Contents' }, h('div', { class: 'card-body' }, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, 'Contents'),
        h('ol', sections.map(([id, title]) => h('li', h('a', { href: '#', onclick: (e) => { e.preventDefault(); document.getElementById(`seo-${id}`)?.scrollIntoView({ behavior: 'smooth' }); } }, title)))))),
      h('div', { class: 'stack seo-article' },
        section('what', 'What SEO ', 'is', L.basics.what.map((p) => h('p', p))),
        section('gets', 'What a business ', 'gets from it', [
          h('div', { class: 'grid g2' }, L.basics.gets.map((g) => h('div', { class: 'seo-box' }, h('b', g.title), h('p', { class: 'small' }, g.text)))),
          h('h4', 'What it doesn’t do'), h('ul', { class: 'seo-list' }, L.basics.doesnt.map((x) => h('li', x)))]),
        section('need', 'Do you ', 'need it?', [h('p', 'You almost certainly do if any of these are true:'), h('ul', { class: 'seo-list' }, L.basics.needIt.map((x) => h('li', x)))]),
        section('how', 'How Google ', 'decides', [h('p', 'Google’s own guidance comes down to a few things. Everything in the checklist serves one of these:'),
          h('div', { class: 'stack', style: { gap: '8px' } }, L.basics.howGoogleDecides.map((x) => h('div', { class: 'seo-box' }, h('b', x.title), h('p', { class: 'small' }, x.text))))]),
        L.pillars.map((p, i) => section(`p-${p.key}`, `${i + 1}. `, p.title, [
          h('p', h('b', 'Why it matters: '), p.why),
          h('h4', 'What to do'), h('ol', { class: 'seo-list' }, p.do.map((x) => h('li', x))),
          h('h4', 'Mistakes to avoid'), h('ul', { class: 'seo-list' }, p.mistakes.map((x) => h('li', x))),
          h('p', { class: 'small' }, h('b', 'How to measure it: '), p.measure),
          h('a', { class: 'small', href: `#/seo/checklist` }, `See the ${p.title.toLowerCase()} jobs in your checklist →`)])),
        section('timeline', 'What to expect, ', 'month by month', h('div', { class: 'stack', style: { gap: '10px' } }, L.timeline.map((t) => h('div', { class: 'seo-box' },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', `${t.when}: ${t.title}`)),
          h('ul', { class: 'seo-list small' }, t.items.map((x) => h('li', x))), t.expect ? h('p', { class: 'small muted' }, h('b', 'Usually: '), t.expect) : null)))),
        section('channels', 'SEO vs ads ', 'vs social', [h('div', { class: 'seo-table-wrap' }, h('table', { class: 'table static' },
          h('thead', h('tr', ['', 'How fast', 'Cost', 'How long it lasts', 'Best for'].map((x) => h('th', x)))),
          h('tbody', L.channels.map((c) => h('tr', h('td', h('b', c.name)), h('td', c.speed), h('td', c.cost), h('td', c.lasts), h('td', c.best)))))),
          h('p', { class: 'small' }, 'They work best together: ads fill the diary while SEO builds, social shows your work and personality, and SEO brings the steady, lower-cost leads.')]),
        section('glossary', 'Jargon in ', 'plain words', h('dl', { class: 'seo-glossary' }, L.glossary.map(([term, def]) => [h('dt', term), h('dd', def)]))))));
  const target = new URLSearchParams(location.hash.split('?')[1] || '').get('p');
  if (target) setTimeout(() => document.getElementById(`seo-p-${target}`)?.scrollIntoView(), 50);
}

function section(id, start, blue, content) {
  return h('section', { class: 'card', id: `seo-${id}` }, h('div', { class: 'card-body stack', style: { gap: '10px' } }, h('h2', start, h('span', { class: 'blue' }, blue)), content));
}

// ───────────────────────── What to offer ─────────────────────────

function renderOffer(el, d) {
  mount(el,
    h('div', { class: 'why small', style: { marginBottom: '14px' } }, h('b', 'Offering SEO to a business: '), 'these packages explain in plain words what’s included, what the business gets and what they need to give you. Pick the one that fits – local businesses usually start with Local SEO Starter, then move to Growth. Prices are yours to set.'),
    h('div', { class: 'grid g2', style: { alignItems: 'start' } }, d.packages.map((p) => h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', h('h3', p.name), h('div', { class: 'small muted' }, p.for))),
      h('div', { class: 'card-body stack', style: { gap: '8px' } },
        h('div', h('div', { class: 'eyebrow', style: { marginBottom: '4px' } }, 'What’s included'), h('ul', { class: 'seo-list small' }, p.includes.map((x) => h('li', x)))),
        h('div', h('div', { class: 'eyebrow', style: { marginBottom: '4px' } }, 'What the business gets'), h('ul', { class: 'seo-list small' }, p.gets.map((x) => h('li', x)))),
        h('div', h('div', { class: 'eyebrow', style: { marginBottom: '4px' } }, 'What we need from them'), h('ul', { class: 'seo-list small' }, p.needs.map((x) => h('li', x)))),
        h('p', { class: 'small' }, h('b', 'Timeline: '), p.timeline))))),
    h('p', { class: 'small muted', style: { marginTop: '12px' } }, 'Pair SEO with the Essentials (Automations): review requests, lead source tagging and the 1-minute lead reply make sure the extra searches turn into customers – and that you can prove it.'));
}

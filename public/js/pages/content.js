import { del, get, patch, post, put } from '../api.js';
import { state } from '../app.js';
import { announce, dateTime, field, formData, h, icon, modal, mount, select, showError, titleCase, toast, PLATFORM_LABELS } from '../ui.js';

const TABS = [['strategy', 'Strategy'], ['ideas', 'Idea Lab'], ['create', 'Creation'], ['calendar', 'Calendar'], ['academy', 'Creation Academy']];
const STAGE_LABEL = { awareness: 'Awareness', consideration: 'Consideration', conversion: 'Conversion', retention: 'Retention' };
const PIPE = ['idea', 'shortlisted', 'briefed', 'in_creation', 'finalised', 'scheduled', 'published'];
let meta;

export async function render(el, route) {
  meta = meta || await get('/content/meta');
  const tab = route.parts[1] || 'ideas';
  const body = h('div');
  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Content Studio'),
        h('h1', { style: { marginTop: '6px' } }, 'Strategy, ', h('span', { class: 'blue' }, 'ideas'), ' & ', h('span', { class: 'blue' }, 'scheduling')),
        h('p', 'The system plans your strategy and generates the ideas and creation briefs. You add your voice and finalise each piece – then it’s published automatically at the time you choose.')),
      h('div', { class: 'pipeline-steps' }, ['Strategy', 'Ideas', 'Brief', 'You create', 'Finalise', 'Auto-publish'].map((s, i) => h('span', { class: `ps ${i === 3 || i === 4 ? 'on' : 'past'}` }, `${i + 1}. ${s}`)))),
    h('div', { class: 'tabs' }, TABS.map(([k, l]) => h('a', { href: `#/content/${k}`, class: k === tab ? 'active' : '' }, l))),
    body);
  if (tab === 'strategy') return renderStrategy(body);
  if (tab === 'create' && route.parts[2]) return renderWorkspace(body, route.parts[2]);
  if (tab === 'create') return renderCreation(body);
  if (tab === 'calendar') return renderCalendar(body, route.query);
  if (tab === 'academy') return renderAcademy(body, route.query);
  return renderIdeas(body, route.query);
}

// ───────────── Idea Lab ─────────────
async function renderIdeas(el, query) {
  const [ideas, pillars, stats, profile] = await Promise.all([get(`/content/ideas${query.status ? `?status=${query.status}` : ''}`), get('/content/pillars'), get('/content/stats'), get('/content/profile')]);
  const controls = h('div', { class: 'card card-pad', style: { marginBottom: '16px' } },
    h('div', { class: 'row', style: { alignItems: 'flex-end', gap: '12px' } },
      h('div', { style: { flex: '1 1 160px' } }, field('Pillar', select('pillar_id', [['', 'All pillars'], ...pillars.map((p) => [p.id, p.name])]))),
      h('div', { style: { flex: '1 1 140px' } }, field('Platform', select('platform', [['', 'My platforms'], ...profile.platforms.map((p) => [p, PLATFORM_LABELS[p]])]))),
      h('div', { style: { flex: '1 1 150px' } }, field('Funnel stage', select('funnel_stage', [['', 'Balanced mix'], ...Object.entries(STAGE_LABEL)]))),
      h('div', { style: { flex: '0 1 100px' } }, field('How many', select('count', ['6', '8', '12', '16'], '8'))),
      meta.ai_enabled ? h('div', { style: { flex: '0 1 150px' } }, field('Engine', select('mode', [['engine', 'Idea engine'], ['ai', 'AI (Claude)']]))) : null,
      h('button', { class: 'btn primary', style: { height: '40px' }, onclick: async (e) => {
        const data = formData(controls);
        e.target.disabled = true;
        try {
          const res = await post('/content/ideas/generate', { ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '')), count: Number(data.count) });
          if (res.warning) toast(res.warning);
          toast(`✨ ${res.ideas.length} new ideas added to your bank`, 'auto');
          renderIdeas(el, query);
        } catch (err) { showError(err); } finally { e.target.disabled = false; }
      } }, icon('wand'), 'Generate ideas')));

  const total = Object.values(stats.by_stage).reduce((a, b) => a + b, 0) || 1;
  const mix = h('div', { class: 'card card-pad', style: { marginBottom: '16px' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } },
      h('h3', 'Content ', h('span', { class: 'blue' }, 'mix'), ' across the customer journey'),
      h('span', { class: 'small muted' }, 'Target: 40% awareness · 30% consideration · 20% conversion · 10% retention')),
    h('div', { class: 'mix' }, Object.keys(STAGE_LABEL).map((k) => h('span', { style: { width: `${((stats.by_stage[k] || 0) / total) * 100}%` } }))),
    h('div', { class: 'legend' }, Object.entries(STAGE_LABEL).map(([k, l], i) => h('span', h('i', { style: { background: ['var(--blue-600)', 'var(--blue-400)', 'var(--blue-300)', 'var(--blue-200)'][i] } }), `${l} ${Math.round(((stats.by_stage[k] || 0) / total) * 100)}%`))));

  const filters = h('div', { class: 'row', style: { marginBottom: '14px' } },
    [['', 'All active'], ['idea', 'New'], ['shortlisted', '⭐ Shortlisted'], ['archived', 'Archived']].map(([k, l]) => h('a', { class: `chip ${(query.status || '') === k ? 'active' : ''}`, href: `#/content/ideas${k ? `?status=${k}` : ''}` }, l)));

  mount(el, controls, mix, filters,
    ideas.length ? h('div', { class: 'grid g3' }, ideas.map((i) => ideaCard(i, () => renderIdeas(el, query))))
      : h('div', { class: 'card card-pad empty' }, 'No ideas here yet – hit “Generate ideas”.'));
}

function ideaCard(i, reload) {
  const act = async (fn) => { try { await fn(); reload(); } catch (err) { showError(err); } };
  return h('div', { class: 'card idea-card' },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } },
      h('div', { class: 'row', style: { gap: '6px' } },
        h('span', { class: 'badge solid' }, STAGE_LABEL[i.funnel_stage]),
        h('span', { class: 'badge blue' }, PLATFORM_LABELS[i.platform]),
        h('span', { class: 'badge' }, meta.formats[i.format] || i.format)),
      h('span', { class: 'score', title: 'Idea score' }, i.score)),
    h('h3', i.title),
    i.hook ? h('div', { class: 'hook' }, `“${i.hook}”`) : null,
    h('p', { class: 'small muted' }, i.angle),
    h('div', { class: 'row small muted', style: { gap: '6px' } }, i.pillar_name ? h('span', '📌 ', i.pillar_name) : null, i.source === 'ai' ? h('span', { class: 'badge blue' }, 'AI') : null, h('span', { class: 'badge' }, titleCase(i.status))),
    h('div', { class: 'row', style: { marginTop: 'auto', paddingTop: '6px' } },
      h('a', { class: 'btn sm primary', href: `#/content/create/${i.id}`, onclick: () => { if (['idea', 'shortlisted'].includes(i.status)) post(`/content/ideas/${i.id}/brief`).catch(() => {}); } }, icon('edit'), 'Create'),
      i.status === 'idea' ? h('button', { class: 'btn sm soft', onclick: () => act(() => patch(`/content/ideas/${i.id}`, { status: 'shortlisted' })) }, '⭐ Shortlist') : null,
      i.status !== 'archived' ? h('button', { class: 'btn sm ghost', onclick: () => act(() => patch(`/content/ideas/${i.id}`, { status: 'archived' })) }, 'Archive') : h('button', { class: 'btn sm ghost', onclick: () => act(() => patch(`/content/ideas/${i.id}`, { status: 'idea' })) }, 'Restore')));
}

// ───────────── Creation pipeline ─────────────
async function renderCreation(el) {
  const all = await get('/content/ideas');
  const cols = [['briefed', 'Brief ready', 'The system’s plan – start here'], ['in_creation', 'You’re creating', 'Film, design, write'], ['finalised', 'Finalised', 'Signed off, ready to schedule'], ['scheduled', 'Scheduled', 'Will publish automatically'], ['published', 'Published', 'Live 🎉']];
  const shortlisted = all.filter((i) => i.status === 'shortlisted');
  mount(el,
    shortlisted.length ? h('div', { class: 'card card-pad', style: { marginBottom: '16px' } },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } },
        h('div', h('h3', h('span', { class: 'blue' }, `${shortlisted.length} shortlisted`), ' ideas waiting for a brief'), h('p', { class: 'small muted' }, 'Turn them into creation briefs in one click.')),
        h('button', { class: 'btn soft', onclick: async () => { for (const i of shortlisted) await post(`/content/ideas/${i.id}/brief`); toast('Briefs created', 'auto'); renderCreation(el); } }, icon('wand'), 'Create all briefs'))) : null,
    h('div', { class: 'board' }, cols.map(([status, label, hint]) => {
      const items = all.filter((i) => i.status === status);
      return h('div', { class: 'column' },
        h('div', { class: 'column-head' }, h('div', h('h3', label), h('div', { class: 'small muted' }, hint)), h('span', { class: 'badge blue' }, items.length)),
        items.map((i) => h('a', { class: 'kcard', href: `#/content/create/${i.id}`, style: { display: 'block', color: 'inherit', textDecoration: 'none' } },
          h('div', { class: 'title' }, i.title),
          h('div', { class: 'meta' }, h('span', { class: 'badge blue' }, PLATFORM_LABELS[i.platform]), h('span', { class: 'badge' }, meta.formats[i.format]), h('span', STAGE_LABEL[i.funnel_stage])))),
        items.length ? null : h('div', { class: 'small muted', style: { padding: '8px 4px' } }, 'Nothing here'));
    })));
}

async function renderWorkspace(el, ideaId) {
  const [idea, channels, slots] = await Promise.all([get(`/content/ideas/${ideaId}`), get('/content/channels'), get('/content/slots')]);
  const b = idea.brief || {};
  const draft = h('textarea', { style: { minHeight: '260px' }, value: idea.draft || b.caption_template || '' });
  const media = h('input', { placeholder: 'Link to your video/images (Drive, Dropbox, Canva…)', value: idea.media_url || '' });
  const reload = () => renderWorkspace(el, ideaId);
  const stepIdx = PIPE.indexOf(idea.status);

  const scheduleCard = () => {
    const when = h('input', { type: 'datetime-local', value: toLocalInput(slots[0]) });
    const boxes = channels.filter((c) => c.active).map((c) => h('label', { class: 'row', style: { gap: '8px', fontWeight: 600 } },
      h('input', { type: 'checkbox', value: c.id, checked: c.platform === idea.platform, style: { width: '16px', accentColor: 'var(--blue-500)' } }), `${PLATFORM_LABELS[c.platform]} · ${c.handle}`));
    return h('div', { class: 'card card-pad', style: { marginTop: '16px' } },
      h('h3', { style: { marginBottom: '10px' } }, '3. ', h('span', { class: 'blue' }, 'Schedule'), ' – we’ll publish it for you'),
      h('div', { class: 'stack' },
        h('div', { class: 'stack', style: { gap: '6px' } }, boxes),
        field('Publish at', when),
        h('div', { class: 'row small' }, h('span', { class: 'muted' }, 'Suggested free slots:'), slots.slice(0, 4).map((s) => h('button', { class: 'chip', onclick: () => { when.value = toLocalInput(s); } }, dateTime(s)))),
        h('button', { class: 'btn primary', onclick: async () => {
          const ids = boxes.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
          try {
            await post(`/content/ideas/${idea.id}/schedule`, { channel_ids: ids, publish_at: new Date(when.value).toISOString() });
            toast('📅 Scheduled – it will publish automatically', 'auto');
            reload();
          } catch (err) { showError(err); }
        } }, icon('calendar'), 'Schedule post')));
  };

  mount(el,
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '14px' } },
      h('a', { href: '#/content/create', class: 'small' }, '← Creation board'),
      h('div', { class: 'pipeline-steps' }, PIPE.map((s, i) => h('span', { class: `ps ${i === stepIdx ? 'on' : i < stepIdx ? 'past' : ''}` }, titleCase(s))))),
    h('div', { class: 'grid g2', style: { alignItems: 'start' } },
      h('div', { class: 'card card-pad' },
        h('div', { class: 'row', style: { gap: '6px', marginBottom: '10px' } }, h('span', { class: 'badge solid' }, STAGE_LABEL[idea.funnel_stage]), h('span', { class: 'badge blue' }, PLATFORM_LABELS[idea.platform]), h('span', { class: 'badge' }, b.format_label || idea.format), idea.pillar_name ? h('span', { class: 'badge' }, `📌 ${idea.pillar_name}`) : null),
        h('div', { class: 'eyebrow' }, '1. Your creation brief'),
        h('h2', { style: { margin: '6px 0 8px', fontSize: '21px' } }, idea.title),
        h('p', { class: 'muted' }, b.objective),
        h('div', { class: 'brief-section' }, h('h4', 'Hook options (pick one)'), h('div', { class: 'stack', style: { gap: '6px' } }, (b.hooks || []).map((x, i) => h('div', { class: 'row', style: { gap: '8px', alignItems: 'flex-start' } }, h('span', { class: 'num' }, i + 1), h('span', x))))),
        h('div', { class: 'brief-section' }, h('h4', 'Structure'), h('ol', { class: 'outline' }, (b.outline || []).map((x) => h('li', x)))),
        h('div', { class: 'brief-section grid g2' }, h('div', h('h4', 'Audience'), h('p', { class: 'small' }, b.audience)), h('div', h('h4', 'Tone of voice'), h('p', { class: 'small' }, b.tone))),
        h('div', { class: 'brief-section' }, h('h4', 'Call to action'), h('p', h('b', b.cta)), h('p', { class: 'small blue', style: { marginTop: '6px' } }, (b.hashtags || []).join(' '))),
        h('div', { class: 'brief-section' }, h('h4', `How to create this ${String(b.format_label || '').toLowerCase()}`), h('ol', { class: 'how' }, (b.creation_steps || []).map((x) => h('li', x))),
          b.lesson_key ? h('a', { href: `#/content/academy?lesson=${b.lesson_key}`, class: 'btn sm soft', style: { marginTop: '10px' } }, icon('book'), 'Open the full lesson') : null),
        h('div', { class: 'brief-section' }, h('h4', 'Before you finalise'), (b.checklist || []).map((c) => h('label', { class: 'row small', style: { gap: '8px', marginBottom: '4px' } }, h('input', { type: 'checkbox', style: { width: '15px', accentColor: 'var(--blue-500)' } }), c)))),

      h('div',
        h('div', { class: 'card card-pad' },
          h('div', { class: 'eyebrow' }, '2. You create & finalise'),
          h('h2', { style: { margin: '6px 0 12px' } }, 'Your ', h('span', { class: 'blue' }, 'final version')),
          h('div', { class: 'stack' },
            field('Caption / script', draft, { help: 'Start from the template and make it yours. This exact text is what gets published.' }),
            field('Media link', media),
            idea.status === 'published' || idea.status === 'scheduled'
              ? h('div', { class: 'why' }, idea.status === 'published' ? '🎉 Published! ' : '📅 Scheduled. ', (idea.posts || []).map((p) => `${PLATFORM_LABELS[p.platform]} – ${dateTime(p.publish_at)} (${p.status})`).join(' · '))
              : h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
                h('button', { class: 'btn', onclick: async () => { try { await patch(`/content/ideas/${idea.id}`, { draft: draft.value, media_url: media.value }); toast('Draft saved'); reload(); } catch (err) { showError(err); } } }, 'Save draft'),
                h('button', { class: 'btn primary', onclick: async () => {
                  try { const res = await post(`/content/ideas/${idea.id}/finalise`, { draft: draft.value, media_url: media.value }); announce(res.automations); toast('✅ Finalised – ready to schedule'); reload(); } catch (err) { showError(err); }
                } }, icon('tick'), idea.status === 'finalised' ? 'Update final version' : 'Finalise content')))),
        ['finalised', 'scheduled'].includes(idea.status) ? scheduleCard() : null)));
}

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// ───────────── Calendar ─────────────
async function renderCalendar(el, query) {
  const base = query.month ? new Date(`${query.month}-01T00:00:00`) : new Date();
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const end = new Date(start); end.setDate(start.getDate() + 42);
  const posts = await get(`/content/calendar?from=${start.toISOString()}&to=${end.toISOString()}`);
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(first); prev.setMonth(prev.getMonth() - 1);
  const next = new Date(first); next.setMonth(next.getMonth() + 1);
  const today = new Date().toDateString();

  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const dayPosts = posts.filter((p) => new Date(p.publish_at).toDateString() === d.toDateString());
    days.push(h('div', { class: `day ${d.getMonth() !== first.getMonth() ? 'other' : ''} ${d.toDateString() === today ? 'today' : ''}` },
      h('div', { class: 'd' }, d.getDate()),
      dayPosts.map((p) => h('span', { class: `post-pill ${p.status}`, title: p.title, onclick: () => postModal(p, () => renderCalendar(el, query)) },
        h('b', `${new Date(p.publish_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ${PLATFORM_LABELS[p.platform]}`), p.title || p.caption))));
  }

  const queued = posts.filter((p) => p.status === 'queued').length;
  mount(el,
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '14px' } },
      h('div', { class: 'row' },
        h('a', { class: 'btn sm', href: `#/content/calendar?month=${monthKey(prev)}` }, '‹'),
        h('h2', first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })),
        h('a', { class: 'btn sm', href: `#/content/calendar?month=${monthKey(next)}` }, '›')),
      h('div', { class: 'row' }, h('span', { class: 'badge blue' }, `${queued} queued`), h('span', { class: 'badge green' }, `${posts.filter((p) => p.status === 'published').length} published`),
        h('a', { class: 'btn soft sm', href: '#/content/create' }, icon('plus'), 'Schedule more'))),
    h('div', { class: 'calendar' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('div', { class: 'dow' }, d)), days));
}

function postModal(p, reload) {
  const when = h('input', { type: 'datetime-local', value: toLocalInput(p.publish_at) });
  const body = h('div', { class: 'stack' },
    h('div', { class: 'row' }, h('span', { class: 'badge blue' }, PLATFORM_LABELS[p.platform]), h('span', { class: 'badge' }, p.handle), h('span', { class: `badge ${p.status === 'published' ? 'green' : p.status === 'failed' ? 'red' : ''}` }, titleCase(p.status))),
    h('h3', p.title || 'Post'),
    h('div', { class: 'pre' }, p.caption),
    p.last_error ? h('p', { class: 'small', style: { color: 'var(--red)' } }, `Last error: ${p.last_error}`) : null,
    p.status === 'queued' || p.status === 'failed' ? field('Publish time', when) : h('p', { class: 'small muted' }, `Published ${dateTime(p.published_at)}`));
  const editable = p.status === 'queued' || p.status === 'failed';
  modal('Scheduled post', body, { actions: editable ? [
    { label: 'Cancel post', onClick: async () => { await patch(`/content/posts/${p.id}`, { status: 'cancelled' }); toast('Post cancelled'); reload(); } },
    { label: 'Publish now', onClick: async () => { const r = await post(`/content/posts/${p.id}/publish-now`); toast(r.status === 'published' ? '🚀 Published' : `Publish failed: ${r.last_error}`, r.status === 'published' ? 'auto' : 'error'); reload(); } },
    { label: 'Reschedule', primary: true, onClick: async () => { await patch(`/content/posts/${p.id}`, { publish_at: new Date(when.value).toISOString(), status: 'queued' }); toast('Rescheduled'); reload(); } },
  ] : [{ label: 'Close' }] });
}

// ───────────── Strategy ─────────────
async function renderStrategy(el) {
  const [profile, pillars, stats] = await Promise.all([get('/content/profile'), get('/content/pillars'), get('/content/stats')]);
  const listField = (name, label, values) => field(label, h('textarea', { name, value: (values || []).join('\n'), style: { minHeight: '100px' } }), { help: 'One per line' });
  const platformBoxes = h('div', { class: 'row' }, Object.entries(PLATFORM_LABELS).map(([k, l]) => h('label', { class: `chip ${profile.platforms.includes(k) ? 'active' : ''}` },
    h('input', { type: 'checkbox', value: k, checked: profile.platforms.includes(k), style: { display: 'none' }, onchange: (e) => e.target.parentElement.classList.toggle('active', e.target.checked) }), l)));
  const form = h('div', { class: 'stack' },
    field('Who is your audience?', h('textarea', { name: 'audience', value: profile.audience || '' })),
    field('Tone of voice', h('input', { name: 'tone', value: profile.tone || '' })),
    h('div', { class: 'grid g3' }, listField('pains', 'Their pains', profile.pains), listField('desires', 'What they want', profile.desires), listField('offers', 'Your offers', profile.offers)),
    field('Platforms', platformBoxes),
    field('Posts per week', select('posts_per_week', ['1', '2', '3', '4', '5', '6', '7'].map((n) => [n, n]), String(profile.posts_per_week))));

  const saveProfile = async () => {
    const d = formData(form);
    const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
    try {
      await put('/content/profile', {
        audience: d.audience, tone: d.tone, pains: lines(d.pains), desires: lines(d.desires), offers: lines(d.offers),
        platforms: [...platformBoxes.querySelectorAll('input:checked')].map((i) => i.value), posts_per_week: Number(d.posts_per_week),
      });
      toast('Strategy saved – new ideas will use it');
    } catch (err) { showError(err); }
  };

  mount(el, h('div', { class: 'grid g3', style: { alignItems: 'start' } },
    h('div', { class: 'card span2' },
      h('div', { class: 'card-head' }, h('h3', 'Brand & ', h('span', { class: 'blue' }, 'audience'), ' profile'), state.me.role !== 'member' ? h('button', { class: 'btn primary sm', onclick: saveProfile }, 'Save strategy') : null),
      h('div', { class: 'card-body' }, h('p', { class: 'small muted', style: { marginBottom: '14px' } }, 'Pre-filled from your niche. Everything the idea engine writes is built from this profile, so the more specific it is, the better your ideas.'), form)),
    h('div', { class: 'stack' },
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', 'Content ', h('span', { class: 'blue' }, 'pillars')), h('button', { class: 'btn sm soft', onclick: () => pillarModal(null, () => renderStrategy(el)) }, icon('plus'), 'Add')),
        h('div', { class: 'card-body' }, pillars.map((p) => h('div', { class: 'list-item' },
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, p.name, p.weight > 1 ? h('span', { class: 'badge blue', style: { marginLeft: '6px' } }, 'Priority') : null), h('div', { class: 'small muted' }, p.description)),
          h('span', { class: 'badge' }, `${p.idea_count} ideas`),
          h('button', { class: 'btn sm ghost', onclick: () => pillarModal(p, () => renderStrategy(el)) }, icon('edit')))))),
      h('div', { class: 'card card-pad feature' },
        h('div', { class: 'eyebrow' }, 'How the strategy works'),
        h('ol', { class: 'how', style: { marginTop: '10px' } },
          h('li', 'Pillars keep your content varied and on-brand.'),
          h('li', 'Every idea is mapped to a stage of the customer journey.'),
          h('li', `The engine balances the mix – you have ${Object.values(stats.by_stage).reduce((a, b) => a + b, 0)} active ideas now.`),
          h('li', 'Briefs teach you how to create each piece; you finalise it.'),
          h('li', 'Scheduling and publishing are automated.'))))));
}

function pillarModal(p, reload) {
  const body = h('div', { class: 'stack' },
    field('Pillar name', h('input', { name: 'name', value: p?.name || '' }), { required: true }),
    field('What it covers', h('textarea', { name: 'description', value: p?.description || '' })),
    field('Priority', select('weight', [['1', 'Normal'], ['2', 'High – show more ideas']], String(p?.weight || 1))));
  const actions = [{ label: 'Cancel' }];
  if (p) actions.push({ label: 'Delete', onClick: async () => { await del(`/content/pillars/${p.id}`); reload(); } });
  actions.push({ label: 'Save', primary: true, onClick: async () => {
    const d = formData(body);
    d.weight = Number(d.weight);
    if (p) await patch(`/content/pillars/${p.id}`, d); else await post('/content/pillars', d);
    reload();
  } });
  modal(p ? 'Edit pillar' : 'New pillar', body, { actions });
}

// ───────────── Academy ─────────────
async function renderAcademy(el, query) {
  const lessons = await get('/content/academy');
  mount(el,
    h('div', { class: 'card card-pad feature', style: { marginBottom: '16px' } },
      h('h2', 'Learn to ', h('span', { class: 'blue' }, 'create it yourself')),
      h('p', { class: 'muted', style: { marginTop: '6px' } }, 'Short, practical lessons. Each creation brief links to the lesson for its format, so you always know exactly how to film, design or write it.')),
    h('div', { class: 'grid g3' }, lessons.map((l) => {
      const open = query.lesson === l.key;
      return h('div', { class: 'card card-pad', id: `lesson-${l.key}`, style: open ? { borderColor: 'var(--blue-400)', boxShadow: '0 0 0 3px var(--blue-100)' } : {} },
        h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'badge blue' }, icon('book'), `${l.minutes} min`), l.formats.length ? h('span', { class: 'small muted' }, l.formats.map((f) => meta.formats[f]).join(', ')) : h('span', { class: 'badge' }, 'Skill')),
        h('h3', { style: { margin: '10px 0 6px' } }, l.title),
        h('p', { class: 'small muted', style: { marginBottom: '12px' } }, l.summary),
        h('ol', { class: 'how' }, l.steps.map((s) => h('li', { class: 'small' }, s))),
        h('div', { class: 'why small', style: { marginTop: '12px' } }, h('b', 'Pro tips: '), l.tips.join(' · ')));
    })));
  if (query.lesson) document.getElementById(`lesson-${query.lesson}`)?.scrollIntoView({ block: 'center' });
}


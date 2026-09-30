import { get, patch, post } from '../api.js';
import { state } from '../app.js';
import { ago, avatar, dateTime, field, h, icon, isOverdue, modal, money, mount, relative, select, showError, toast, PLATFORM_LABELS } from '../ui.js';

export async function render(el) {
  const [d, kudos, team] = await Promise.all([get('/dashboard'), get('/kudos'), get('/team')]);
  const { kpis } = d;
  const first = state.me.user.name.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const kpi = (label, value, sub, ic, cls = '') => h('div', { class: `card kpi ${cls}` },
    h('div', { class: 'label' }, icon(ic), label), h('div', { class: `value ${cls ? '' : 'blue'}` }, value), h('div', { class: 'sub' }, sub));

  const taskList = h('div', d.my_tasks.length ? d.my_tasks.map((t) => {
    const box = h('input', { type: 'checkbox', style: { width: '18px', height: '18px', accentColor: 'var(--sky-500)' }, onchange: async () => {
      try { await patch(`/tasks/${t.id}`, { status: 'done' }); row.style.opacity = 0.4; toast('Nice work – task completed ✅'); } catch (err) { showError(err); }
    } });
    const row = h('div', { class: 'list-item' }, box,
      h('div', { class: 'grow' }, h('div', { class: 'truncate', style: { fontWeight: 600 } }, t.title),
        h('div', { class: 'small muted row', style: { gap: '6px' } }, h('span', { class: `prio ${t.priority}` }), t.priority, t.source !== 'manual' ? h('span', { class: 'badge blue' }, `⚡ ${t.source}`) : null)),
      h('span', { class: `badge ${isOverdue(t.due_at) ? 'red' : 'blue'}` }, t.due_at ? relative(t.due_at) : 'No date'));
    return row;
  }) : h('div', { class: 'empty' }, 'Nothing due – enjoy the calm ☀️'));

  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })),
        h('h1', { style: { marginTop: '6px' } }, `${greeting}, `, h('span', { class: 'blue' }, first), ' 👋'),
        h('p', 'Here’s everything happening across ', h('b', state.me.org.name), ' today. Automations have handled the admin – you focus on the work that matters.')),
      h('div', { class: 'row' },
        h('a', { class: 'btn soft', href: '#/content/ideas' }, icon('wand'), 'Generate ideas'),
        h('a', { class: 'btn primary', href: '#/crm/contacts?new=1' }, icon('plus'), 'Add lead'))),

    h('div', { class: 'grid g4', style: { marginBottom: '16px' } },
      kpi('Time saved this week', `${(kpis.minutes_saved_week / 60).toFixed(1)} hrs`, `${kpis.automations_run_week} automated actions`, 'zap', 'accent'),
      kpi('Open pipeline', money(kpis.pipeline_value), `${money(kpis.won_this_month)} won this month`, 'pound'),
      kpi('New leads (7 days)', kpis.new_leads_week, 'Follow-ups created automatically', 'users'),
      kpi('Tasks due today', kpis.tasks_due_today, `${kpis.posts_scheduled} posts scheduled · ${kpis.ideas_in_bank} ideas banked`, 'check')),

    h('div', { class: 'grid g3' },
      h('div', { class: 'card span2' },
        h('div', { class: 'card-head' }, h('h3', 'My ', h('span', { class: 'blue' }, 'focus'), ' today'), h('a', { href: '#/tasks', class: 'small' }, 'All tasks →')),
        h('div', { class: 'card-body' }, taskList)),

      h('div', { class: 'card feature' },
        h('div', { class: 'card-head' }, h('h3', h('span', { class: 'blue' }, 'Build Funnel'), ' progress'), h('a', { href: '#/funnel', class: 'small' }, 'Open →')),
        h('div', { class: 'card-body stack' }, d.projects.length ? d.projects.map((p) => h('a', { href: `#/funnel/${p.id}`, style: { color: 'inherit', textDecoration: 'none' } },
          h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '6px' } }, h('b', p.name), h('span', { class: 'badge blue' }, `${p.progress}%`)),
          h('div', { class: 'progress' }, h('span', { style: { width: `${p.progress}%` } })),
          h('div', { class: 'small muted', style: { marginTop: '4px' } }, `${p.kind === 'product' ? 'Product' : 'Service'} · now on `, h('b', { class: 'blue' }, stageName(p.current_stage)))))
          : h('div', { class: 'empty' }, h('a', { href: '#/funnel' }, 'Start your first build →')))),

      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', 'Content going ', h('span', { class: 'hl' }, 'out')), h('a', { href: '#/content/calendar', class: 'small' }, 'Calendar →')),
        h('div', { class: 'card-body' }, d.upcoming_posts.length ? d.upcoming_posts.map((p) => h('div', { class: 'list-item' },
          h('div', { class: 'run-item', style: { border: 'none', padding: 0 } }, h('div', { class: 'ico' }, icon('calendar'))),
          h('div', { class: 'grow' }, h('div', { class: 'truncate', style: { fontWeight: 600 } }, p.title || p.caption.slice(0, 50)), h('div', { class: 'small muted' }, `${PLATFORM_LABELS[p.platform]} · ${dateTime(p.publish_at)}`))))
          : h('div', { class: 'empty' }, 'No posts queued yet.'))),

      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', h('span', { class: 'blue' }, '⚡'), ' Automations at work'), h('a', { href: '#/automations', class: 'small' }, 'All →')),
        h('div', { class: 'card-body' }, d.recent_runs.map((r) => h('div', { class: 'run-item' },
          h('div', { class: 'ico' }, icon('zap')),
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600, fontSize: '13px' } }, r.name), h('div', { class: 'small muted truncate', style: { maxWidth: '260px' } }, r.detail)),
          h('div', { class: 'small muted' }, ago(r.created_at)))))),

      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', 'Team ', h('span', { class: 'blue' }, 'wins'), ' 🎉'), h('button', { class: 'btn sm soft', onclick: () => giveKudos(team) }, icon('heart'), 'Give kudos')),
        h('div', { class: 'card-body' },
          d.wins.map((w) => h('div', { class: 'list-item' }, h('span', w.kind === 'deal' ? '🏆' : '✅'),
            h('div', { class: 'grow' }, h('div', { class: 'truncate', style: { fontWeight: 600, fontSize: '13px' } }, w.title), h('div', { class: 'small muted' }, `${w.who || 'Team'}${w.value ? ` · ${money(w.value)}` : ''}`)))),
          kudos.slice(0, 2).map((k) => h('div', { class: 'list-item' }, avatar(k.from_name, true),
            h('div', { class: 'grow small' }, h('b', k.from_name), ' → ', h('b', { class: 'blue' }, k.to_name), h('div', { class: 'muted' }, k.message)))))),
    ),
  );
}

const STAGE_NAMES = { idea: 'Idea & Clarity', validation: 'Market Validation', offer: 'Offer Design', pricing: 'Pricing & Economics', build: 'Build', brand: 'Brand & Sales Assets', operations: 'Operations & Systems', launch: 'Launch', grow: 'Grow & Optimise' };
const stageName = (k) => STAGE_NAMES[k] || k;

function giveKudos(team) {
  const others = team.filter((t) => t.id !== state.me.user.id);
  const body = h('div', { class: 'stack' },
    field('Who deserves it?', select('to_user', others.map((t) => [t.id, t.name]))),
    field('What for?', h('textarea', { name: 'message', placeholder: 'Thanks for…', maxLength: 280 })));
  modal('Give kudos 🙌', body, { actions: [
    { label: 'Cancel' },
    { label: 'Send kudos', primary: true, onClick: async () => {
      const res = await post('/kudos', { to_user: body.querySelector('[name=to_user]').value, message: body.querySelector('[name=message]').value });
      toast('Kudos sent – they’ll get a notification 💙');
      return res;
    } },
  ] });
}

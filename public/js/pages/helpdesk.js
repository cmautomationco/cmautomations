import { del, get, patch, post } from '../api.js';
import { state } from '../app.js';
import { ago, announce, avatar, confirmDialog, dateTime, field, formData, h, icon, isOverdue, modal, mount, relative, select, showError, titleCase, toast } from '../ui.js';

const STATUS_BADGE = { open: 'blue', in_progress: 'amber', waiting: '', resolved: 'green' };
const SOURCE_LABEL = { assistant: '💬 Via assistant', customer: '👤 Customer', manual: null };

export async function render(el, route) {
  const view = route.query.view || 'open';
  const isAdmin = state.me.role !== 'member';
  const [issues, stats, team, meta, insights] = await Promise.all([
    get(`/helpdesk/issues?view=${view}`), get('/helpdesk/stats'), get('/team'), get('/helpdesk/meta'),
    isAdmin ? get('/assistant/insights').catch(() => null) : Promise.resolve(null),
  ]);
  const reload = () => render(el, { ...route, parts: ['helpdesk'], query: { view } });
  const kpi = (label, value, sub, ic, cls = '') => h('div', { class: `card kpi ${cls}` },
    h('div', { class: 'label' }, icon(ic), label), h('div', { class: `value ${cls ? '' : 'blue'}` }, value), h('div', { class: 'sub' }, sub));

  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Help Desk'),
        h('h1', { style: { marginTop: '6px' } }, 'Every issue, ', h('span', { class: 'blue' }, 'sorted')),
        h('p', 'Problems raised by the team, by clients or by the assistant land here. Each one is assigned, given a response target by priority, and escalated automatically if it’s missed.')),
      h('button', { class: 'btn primary', onclick: () => issueModal(team, meta, reload) }, icon('plus'), 'New issue')),

    h('div', { class: 'grid g4', style: { marginBottom: '16px' } },
      kpi('Open issues', stats.open, `${stats.urgent} high or urgent`, 'lifebuoy', 'accent'),
      kpi('Past response target', stats.overdue, stats.overdue ? 'Escalated to admins automatically' : 'Everything on track', 'clock'),
      kpi('Resolved this week', stats.resolved_week, stats.avg_resolution_hours != null ? `Average ${stats.avg_resolution_hours} hrs to resolve` : 'No resolutions yet this week', 'check'),
      kpi('Response targets', '4h · 1d · 3d', 'Urgent · high · medium', 'flag')),

    h('div', { class: 'grid', style: { gridTemplateColumns: insights ? 'minmax(0, 1fr) 300px' : 'minmax(0, 1fr)', alignItems: 'start' } },
      h('div',
        h('div', { class: 'row', style: { marginBottom: '14px' } },
          [['open', 'Open'], ['mine', 'Assigned to me'], ['resolved', 'Resolved'], ['all', 'All']].map(([k, l]) => h('a', { class: `chip ${view === k ? 'active' : ''}`, href: `#/helpdesk?view=${k}` }, l))),
        h('div', { class: 'card', style: { overflow: 'hidden' } },
          issues.length ? h('div', { class: 'card-body', style: { padding: 0, overflowX: 'auto' } }, h('table', { class: 'table' },
            h('thead', h('tr', ['Issue', 'Priority', 'Status', 'Respond by', 'Assigned'].map((c) => h('th', c)))),
            h('tbody', issues.map((i) => h('tr', { onclick: () => { location.hash = `#/helpdesk/${i.id}`; } },
              h('td', h('div', { style: { fontWeight: 700 } }, i.title),
                h('div', { class: 'row small muted', style: { gap: '6px', marginTop: '4px' } },
                  h('span', { class: 'badge' }, titleCase(i.category)),
                  SOURCE_LABEL[i.source] ? h('span', { class: 'badge blue' }, SOURCE_LABEL[i.source]) : null,
                  i.comment_count ? h('span', `💬 ${i.comment_count}`) : null,
                  h('span', `Raised ${ago(i.created_at)}${i.reporter_name ? ` by ${i.reporter_name}` : ''}`))),
              h('td', h('span', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } }, h('span', { class: `prio ${i.priority}` }), titleCase(i.priority))),
              h('td', h('span', { class: `badge ${STATUS_BADGE[i.status]}` }, titleCase(i.status))),
              h('td', i.status === 'resolved' ? h('span', { class: 'small muted' }, `Resolved ${ago(i.resolved_at)}`)
                : h('span', { class: `badge ${isOverdue(i.due_at) ? 'red' : 'blue'}` }, isOverdue(i.due_at) ? `Overdue · ${relative(i.due_at)}` : relative(i.due_at))),
              h('td', avatar(i.assignee_name, true)))))))
            : h('div', { class: 'empty' }, view === 'resolved' ? 'Nothing resolved yet.' : 'No open issues – everything is sorted ✨'))),

      insights ? h('div', { class: 'stack' },
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', 'What people ask the ', h('span', { class: 'blue' }, 'assistant'))),
          h('div', { class: 'card-body' },
            h('p', { class: 'small muted', style: { marginBottom: '10px' } }, `${insights.total} questions in the last 30 days. Frequent questions show where people need more help.`),
            insights.top.length ? insights.top.map((t) => h('div', { class: 'list-item' }, h('div', { class: 'grow small', style: { fontWeight: 600 } }, t.title), h('span', { class: 'badge blue' }, t.n)))
              : h('div', { class: 'small muted' }, 'No questions yet – try the assistant button in the corner.'),
            insights.unanswered.length ? h('div', { style: { marginTop: '14px' } },
              h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Couldn’t answer'),
              insights.unanswered.map((u) => h('div', { class: 'small', style: { padding: '6px 0', borderBottom: '1px solid var(--line-soft)' } }, `“${u.message}”`, h('div', { class: 'muted' }, ago(u.created_at))))) : null)),
        h('div', { class: 'card card-pad feature small' },
          h('div', { class: 'eyebrow' }, 'Handled automatically'),
          h('ul', { style: { paddingLeft: '18px', margin: '8px 0 0', display: 'grid', gap: '4px' } },
            h('li', 'New issues go to the admin with the fewest open'),
            h('li', 'Urgent and high issues alert the team at once'),
            h('li', 'Missed response targets are escalated'),
            h('li', 'The reporter is told when it’s resolved')))) : null));

  if (route.parts[1]) issueDrawer(route.parts[1], team, meta, reload);
  if (route.query.new) issueModal(team, meta, () => { location.hash = '#/helpdesk'; }, { category: route.query.category });
}

function issueModal(team, meta, reload, prefill = {}) {
  const body = h('div', { class: 'stack' },
    field('What’s the problem?', h('input', { name: 'title', placeholder: 'e.g. Customer can’t pay through the booking page' }), { required: true }),
    field('Details', h('textarea', { name: 'description', placeholder: 'What happened, who is affected, anything already tried…' })),
    h('div', { class: 'grid g3' },
      field('Category', select('category', meta.categories.map((c) => [c, titleCase(c)]), prefill.category || 'other')),
      field('Priority', select('priority', meta.priorities.map((p) => [p, `${titleCase(p)} – respond within ${meta.sla_hours[p] < 24 ? `${meta.sla_hours[p]}h` : `${meta.sla_hours[p] / 24}d`}`]), 'medium')),
      field('Assign to', select('assignee_id', [['', 'Automatically'], ...team.map((t) => [t.id, t.name])], ''))));
  modal('New issue', body, { actions: [
    { label: 'Cancel' },
    { label: 'Raise issue', primary: true, onClick: async () => {
      const d = formData(body);
      if (!d.assignee_id) delete d.assignee_id;
      const res = await post('/helpdesk/issues', d);
      announce(res.automations);
      toast(`Issue raised and assigned to ${res.issue.assignee_name || 'the team'}`);
      reload();
    } },
  ] });
}

async function issueDrawer(issueId, team, meta, reload) {
  document.querySelector('.drawer')?.remove();
  let issue;
  try { issue = await get(`/helpdesk/issues/${issueId}`); } catch (err) { showError(err); return; }
  const close = () => {
    drawer.remove();
    try { if (location.hash.startsWith('#/helpdesk/')) history.replaceState(null, '', '#/helpdesk'); } catch { /* history blocked */ }
  };
  const save = async (changes, message) => {
    try {
      const res = await patch(`/helpdesk/issues/${issue.id}`, changes);
      announce(res.automations);
      if (message) toast(message);
      reload();
      issueDrawer(issue.id, team, meta, reload);
    } catch (err) { showError(err); }
  };
  const sel = (name, options, value, onChange) => { const s = select(name, options, value); s.onchange = () => onChange(s.value); return s; };
  const comment = h('textarea', { placeholder: 'Add an update or a note for the team…', style: { minHeight: '70px' } });
  const resolution = h('textarea', { placeholder: 'How was it resolved? The person who raised it will see this.', style: { minHeight: '70px' }, value: issue.resolution || '' });
  const resolved = issue.status === 'resolved';

  const drawer = h('div', { class: 'drawer' },
    h('div', { class: 'modal-head' },
      h('div', { style: { minWidth: 0 } }, h('div', { class: 'eyebrow' }, `${titleCase(issue.category)} issue`), h('h2', { style: { marginTop: '4px' } }, issue.title)),
      h('button', { class: 'icon-btn', onclick: close }, icon('x'))),
    h('div', { class: 'modal-body' },
      h('div', { class: 'row' },
        h('span', { class: `badge ${STATUS_BADGE[issue.status]}` }, titleCase(issue.status)),
        h('span', { class: 'badge' }, h('span', { class: `prio ${issue.priority}` }), titleCase(issue.priority)),
        SOURCE_LABEL[issue.source] ? h('span', { class: 'badge blue' }, SOURCE_LABEL[issue.source]) : null,
        !resolved && issue.due_at ? h('span', { class: `badge ${isOverdue(issue.due_at) ? 'red' : 'blue'}` }, `Respond by ${dateTime(issue.due_at)}`) : null),
      issue.description ? h('div', { class: 'pre' }, issue.description) : null,
      h('div', { class: 'grid g2' },
        field('Status', sel('status', meta.statuses.filter((s) => s !== 'resolved' || resolved).map((s) => [s, titleCase(s)]), issue.status, (v) => save({ status: v }, 'Status updated'))),
        field('Priority', sel('priority', meta.priorities.map((p) => [p, titleCase(p)]), issue.priority, (v) => save({ priority: v }, 'Priority updated – response target reset'))),
        field('Assigned to', sel('assignee_id', team.map((t) => [t.id, t.name]), issue.assignee_id, (v) => save({ assignee_id: v }, 'Reassigned'))),
        field('Category', sel('category', meta.categories.map((c) => [c, titleCase(c)]), issue.category, (v) => save({ category: v })))),
      h('div', { class: 'small muted' }, `Raised ${dateTime(issue.created_at)}${issue.reporter_name ? ` by ${issue.reporter_name}` : ''}${issue.contact_name?.trim() ? ` · about ${issue.contact_name.trim()}` : ''}`),

      h('div', h('h3', { style: { marginBottom: '8px' } }, 'Updates'),
        issue.comments.length ? issue.comments.map((c) => h('div', { class: 'run-item' }, avatar(c.author, true),
          h('div', { class: 'grow' }, h('div', { class: 'small' }, h('b', c.author || 'Team'), ` · ${ago(c.created_at)}`), h('div', c.body))))
          : h('p', { class: 'small muted' }, 'No updates yet.'),
        h('div', { class: 'stack', style: { marginTop: '10px' } }, comment,
          h('button', { class: 'btn', onclick: async () => {
            if (!comment.value.trim()) return;
            try { await post(`/helpdesk/issues/${issue.id}/comments`, { body: comment.value }); toast('Update added'); reload(); issueDrawer(issue.id, team, meta, reload); } catch (err) { showError(err); }
          } }, 'Add update'))),

      h('div', { class: 'card card-pad', style: { boxShadow: 'none', background: 'var(--blue-50)' } },
        h('h3', { style: { marginBottom: '8px' } }, resolved ? 'Resolution' : h('span', 'Mark as ', h('span', { class: 'blue' }, 'resolved'))),
        resolved
          ? h('div', h('p', issue.resolution), h('p', { class: 'small muted', style: { marginTop: '6px' } }, `Resolved ${dateTime(issue.resolved_at)}`),
            h('button', { class: 'btn sm', style: { marginTop: '10px' }, onclick: () => save({ status: 'open' }, 'Issue re-opened') }, 'Re-open'))
          : h('div', { class: 'stack' }, resolution,
            h('button', { class: 'btn primary', onclick: () => save({ status: 'resolved', resolution: resolution.value }, '✅ Issue resolved – the reporter has been told') }, icon('tick'), 'Mark resolved'))),

      state.me.role !== 'member' ? h('button', { class: 'btn ghost danger sm', onclick: async () => {
        if (await confirmDialog('Delete this issue and its updates?')) { await del(`/helpdesk/issues/${issue.id}`); close(); reload(); }
      } }, 'Delete issue') : null));
  document.body.append(drawer);
}

import { del, get, patch, post } from '../api.js';
import { state } from '../app.js';
import { avatar, field, formData, h, icon, isOverdue, modal, mount, relative, select, showError, titleCase, toast } from '../ui.js';

const COLS = [['todo', 'To do'], ['in_progress', 'In progress'], ['review', 'Review'], ['done', 'Done']];
const SOURCE_LABEL = { automation: '⚡ Auto', funnel: '🚀 Funnel', crm: '👥 CRM', content: '✨ Content', manual: null };

export async function render(el, route) {
  const view = route.parts[1] || 'board';
  const who = route.query.assignee || '';
  const [tasks, team, workload] = await Promise.all([get(`/tasks${who ? `?assignee=${who}` : ''}`), get('/team'), get('/tasks/workload')]);
  const reload = () => render(el, route);
  const open = tasks.filter((t) => t.status !== 'done');
  const automated = tasks.filter((t) => t.source !== 'manual').length;

  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Task Manager'),
        h('h1', { style: { marginTop: '6px' } }, 'Less admin. More ', h('span', { class: 'blue' }, 'done'), '.'),
        h('p', `${automated} of these tasks were created for you by automations, funnel steps and the CRM – so nothing slips and nobody has to remember the busywork.`)),
      h('button', { class: 'btn primary', onclick: () => taskModal(null, team, reload) }, icon('plus'), 'New task')),
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '14px' } },
      h('div', { class: 'tabs', style: { marginBottom: 0, borderBottom: 'none' } },
        [['board', 'Board'], ['today', 'My day']].map(([k, l]) => h('a', { href: `#/tasks/${k}${who ? `?assignee=${who}` : ''}`, class: view === k ? 'active' : '' }, l))),
      h('div', { class: 'row' }, [['', 'Everyone'], ['me', 'Just me']].map(([k, l]) => h('a', { class: `chip ${who === k ? 'active' : ''}`, href: `#/tasks/${view}${k ? `?assignee=${k}` : ''}` }, l)))),
    h('div', { class: 'grid tasks-layout' },
      view === 'today' ? myDay(tasks, team, reload) : board(tasks, team, reload),
      h('div', { class: 'stack' },
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', 'Team ', h('span', { class: 'blue' }, 'workload'))),
          h('div', { class: 'card-body' }, workload.map((w) => h('div', { class: 'list-item' }, avatar(w.name, true),
            h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600, fontSize: '13px' } }, w.name),
              h('div', { class: 'progress', style: { marginTop: '4px' } }, h('span', { style: { width: `${Math.min(100, (w.open || 0) * 12)}%` } }))),
            h('div', { class: 'small', style: { textAlign: 'right' } }, h('b', w.open || 0), h('div', { class: w.overdue ? '' : 'muted', style: { color: w.overdue ? 'var(--red)' : '' } }, `${w.overdue || 0} late`)))),
          h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Balanced workloads keep the team happy. Reassign from any task.'))),
        h('div', { class: 'card card-pad feature small' },
          h('div', { class: 'eyebrow' }, 'Handled automatically'),
          h('ul', { style: { paddingLeft: '18px', margin: '8px 0 0', display: 'grid', gap: '4px' } },
            h('li', 'Recurring tasks re-create themselves'),
            h('li', 'Overdue reminders to the assignee'),
            h('li', 'Morning digest of what’s due'),
            h('li', 'Lead, proposal & onboarding tasks'),
            h('li', 'Funnel steps → tasks with checklists'))),
        h('div', { class: 'card card-pad' }, h('div', { class: 'small muted' }, 'Open tasks'), h('div', { style: { fontSize: '26px', fontWeight: 800, color: 'var(--sky-600)' } }, open.length), h('div', { class: 'small muted' }, `${open.filter((t) => isOverdue(t.due_at)).length} overdue`)))));
}

function taskCard(t, team, reload) {
  const done = t.checklist.filter((c) => c.done).length;
  return h('div', { class: 'kcard', draggable: true, ondragstart: (e) => e.dataTransfer.setData('text/plain', t.id), onclick: () => taskModal(t, team, reload) },
    h('div', { class: 'title', style: t.status === 'done' ? { textDecoration: 'line-through', color: 'var(--muted)' } : {} }, t.title),
    h('div', { class: 'meta', style: { justifyContent: 'space-between' } },
      h('span', { class: 'row', style: { gap: '6px' } },
        h('span', { class: `prio ${t.priority}`, title: `${t.priority} priority` }),
        t.due_at ? h('span', { class: `badge ${t.status !== 'done' && isOverdue(t.due_at) ? 'red' : 'blue'}` }, relative(t.due_at)) : null,
        t.checklist.length ? h('span', `☑ ${done}/${t.checklist.length}`) : null,
        t.recurrence ? h('span', { title: `Repeats ${t.recurrence}` }, '🔁') : null),
      avatar(t.assignee_name, true)),
    SOURCE_LABEL[t.source] ? h('div', { style: { marginTop: '8px' } }, h('span', { class: 'badge blue' }, SOURCE_LABEL[t.source])) : null);
}

function board(tasks, team, reload) {
  return h('div', { class: 'board', style: { gridAutoColumns: 'minmax(220px, 1fr)' } }, COLS.map(([status, label]) => {
    const items = tasks.filter((t) => t.status === status);
    const col = h('div', { class: 'column',
      ondragover: (e) => { e.preventDefault(); col.classList.add('drop'); },
      ondragleave: () => col.classList.remove('drop'),
      ondrop: async (e) => {
        e.preventDefault(); col.classList.remove('drop');
        try {
          await patch(`/tasks/${e.dataTransfer.getData('text/plain')}`, { status });
          if (status === 'done') toast('Task done – great work! 🎉');
          reload();
        } catch (err) { showError(err); }
      } },
    h('div', { class: 'column-head' }, h('h3', label), h('span', { class: 'badge blue' }, items.length)),
    items.map((t) => taskCard(t, team, reload)));
    return col;
  }));
}

function myDay(tasks, team, reload) {
  const mine = tasks.filter((t) => t.assignee_id === state.me.user.id && t.status !== 'done');
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const groups = [
    ['Overdue', mine.filter((t) => t.due_at && isOverdue(t.due_at) && new Date(t.due_at).toDateString() !== new Date().toDateString())],
    ['Today', mine.filter((t) => t.due_at && new Date(t.due_at).toDateString() === new Date().toDateString())],
    ['Coming up', mine.filter((t) => t.due_at && new Date(t.due_at) > end)],
    ['No date', mine.filter((t) => !t.due_at)],
  ];
  return h('div', { class: 'stack' }, groups.filter(([, items]) => items.length).map(([label, items]) => h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', label === 'Overdue' ? h('span', { style: { color: 'var(--red)' } }, label) : label === 'Today' ? h('span', { class: 'blue' }, label) : label), h('span', { class: 'badge' }, items.length)),
    h('div', { class: 'card-body' }, items.map((t) => h('div', { class: 'list-item' },
      h('input', { type: 'checkbox', style: { width: '18px', height: '18px', accentColor: 'var(--sky-500)' }, onchange: async () => { await patch(`/tasks/${t.id}`, { status: 'done' }); toast('Done ✅'); reload(); } }),
      h('div', { class: 'grow', style: { cursor: 'pointer' }, onclick: () => taskModal(t, team, reload) }, h('div', { style: { fontWeight: 600 } }, t.title), t.description ? h('div', { class: 'small muted truncate' }, t.description.split('\n')[0]) : null),
      SOURCE_LABEL[t.source] ? h('span', { class: 'badge blue' }, SOURCE_LABEL[t.source]) : null,
      h('span', { class: `prio ${t.priority}` }),
      h('span', { class: 'small muted' }, t.due_at ? relative(t.due_at) : '')))))),
  mine.length ? null : h('div', { class: 'card card-pad empty' }, 'Your day is clear ✨'));
}

function taskModal(t, team, reload) {
  const checklist = h('div', { class: 'stack', style: { gap: '6px' } });
  const addItem = (item = { text: '', done: false }) => {
    const row = h('div', { class: 'row', style: { gap: '8px', flexWrap: 'nowrap' } },
      h('input', { type: 'checkbox', checked: item.done, style: { width: '16px', accentColor: 'var(--sky-500)' } }),
      h('input', { value: item.text, placeholder: 'Checklist item' }),
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => row.remove() }, icon('x')));
    checklist.append(row);
  };
  (t?.checklist || []).forEach(addItem);
  const due = t?.due_at ? new Date(t.due_at) : null;
  const body = h('div', { class: 'stack' },
    field('Task', h('input', { name: 'title', value: t?.title || '' }), { required: true }),
    field('Details', h('textarea', { name: 'description', value: t?.description || '' })),
    h('div', { class: 'grid g2' },
      field('Assign to', select('assignee_id', team.map((m) => [m.id, m.name]), t?.assignee_id || state.me.user.id)),
      field('Due date', h('input', { type: 'date', name: 'due_at', value: due ? due.toISOString().slice(0, 10) : '' }))),
    h('div', { class: 'grid g3' },
      field('Priority', select('priority', ['low', 'medium', 'high', 'urgent'].map((p) => [p, titleCase(p)]), t?.priority || 'medium')),
      field('Status', select('status', COLS, t?.status || 'todo')),
      field('Repeats', select('recurrence', [['', 'Never'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']], t?.recurrence || ''))),
    field('Checklist', h('div', checklist, h('button', { class: 'btn sm soft', type: 'button', style: { marginTop: '6px' }, onclick: () => addItem() }, icon('plus'), 'Add item'))),
    t && t.source !== 'manual' ? h('div', { class: 'why small' }, `Created automatically from ${t.source}.`) : null);

  const collect = () => {
    const d = formData(body);
    const payload = {
      title: d.title, description: d.description, assignee_id: d.assignee_id, priority: d.priority, status: d.status,
      due_at: d.due_at ? new Date(`${d.due_at}T17:00:00`).toISOString() : null, recurrence: d.recurrence || null,
      checklist: [...checklist.children].map((row) => ({ done: row.querySelector('[type=checkbox]').checked, text: row.querySelectorAll('input')[1].value })).filter((c) => c.text.trim()),
    };
    return payload;
  };
  const actions = [{ label: 'Cancel' }];
  if (t) actions.push({ label: 'Delete', onClick: async () => { await del(`/tasks/${t.id}`); reload(); } });
  actions.push({ label: t ? 'Save' : 'Create task', primary: true, onClick: async () => {
    const payload = collect();
    if (t) await patch(`/tasks/${t.id}`, payload); else await post('/tasks', payload);
    reload();
  } });
  modal(t ? 'Edit task' : 'New task', body, { actions });
}

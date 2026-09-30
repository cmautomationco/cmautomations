import { del, get, patch, post } from '../api.js';
import { state } from '../app.js';
import { ago, announce, date, field, h, icon, modal, mount, select, showError, toast } from '../ui.js';

export async function render(el) {
  const [rules, runs, impact, meta, team] = await Promise.all([get('/automations'), get('/automations/runs'), get('/automations/impact'), get('/automations/meta'), get('/team')]);
  const reload = () => render(el);
  const canEdit = state.me.role !== 'member';
  const max = Math.max(1, ...impact.days.map((d) => d.minutes));

  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Automation engine'),
        h('h1', { style: { marginTop: '6px' } }, 'The mundane stuff, ', h('span', { class: 'hl' }, 'handled')),
        h('p', 'Every automation follows a simple rule: ', h('b', { class: 'blue' }, 'WHEN'), ' something happens, ', h('b', { class: 'blue' }, 'IF'), ' it matches, ', h('b', { class: 'blue' }, 'THEN'), ' do the work. They connect the funnel, content, CRM and tasks so your team can focus on real work.')),
      canEdit ? h('button', { class: 'btn primary', onclick: () => builder(null, meta, team, reload) }, icon('plus'), 'New automation') : null),

    h('div', { class: 'grid g3', style: { marginBottom: '16px' } },
      h('div', { class: 'card card-pad span2' },
        h('div', { class: 'row', style: { justifyContent: 'space-between' } },
          h('h3', 'Time ', h('span', { class: 'blue' }, 'saved'), ' – last 30 days'),
          h('span', { class: 'hl-box' }, `${(impact.total_minutes / 60).toFixed(1)} hours`)),
        h('div', { class: 'bars' }, impact.days.map((d) => h('div', { class: 'bar', style: { height: `${(d.minutes / max) * 100}%` }, 'data-tip': `${date(d.day)} · ${d.minutes} min · ${d.runs} runs` }))),
        h('div', { class: 'row small muted', style: { justifyContent: 'space-between', marginTop: '6px' } }, h('span', impact.days[0] ? date(impact.days[0].day) : ''), h('span', 'Today'))),
      h('div', { class: 'card kpi accent' },
        h('div', { class: 'label' }, icon('zap'), 'Automated actions'),
        h('div', { class: 'value' }, impact.total_runs),
        h('div', { class: 'sub' }, `${rules.filter((r) => r.enabled).length} of ${rules.length} automations switched on`),
        h('div', { class: 'sub', style: { marginTop: '14px' } }, `≈ ${Math.round(impact.total_minutes / 60 / 4.3 * 10) / 10} hrs saved per week, per business`))),

    h('div', { class: 'grid g3', style: { alignItems: 'start' } },
      h('div', { class: 'stack span2' }, rules.map((r) => h('div', { class: 'card card-pad' },
        h('div', { class: 'row', style: { justifyContent: 'space-between', flexWrap: 'nowrap' } },
          h('div', { style: { minWidth: 0 } }, h('h3', r.name), h('p', { class: 'small muted', style: { marginTop: '4px' } }, r.description || '')),
          h('button', { class: `switch ${r.enabled ? 'on' : ''}`, disabled: !canEdit, title: r.enabled ? 'On' : 'Off', onclick: async () => {
            try { await patch(`/automations/${r.id}`, { enabled: !r.enabled }); toast(r.enabled ? 'Automation paused' : 'Automation switched on'); reload(); } catch (err) { showError(err); }
          } })),
        h('div', { class: 'flow', style: { marginTop: '12px' } },
          h('span', { class: 'node when' }, 'WHEN ', meta.triggers[r.trigger]),
          r.conditions.length ? [h('span', { class: 'arrow' }, '→'), h('span', { class: 'node if' }, 'IF ', r.conditions.map((c) => `${c.field.replace(/_/g, ' ').replace('.', ' ')} ${OPS[c.op || 'eq']} ${c.value ?? ''}`).join(' & '))] : null,
          r.actions.map((a) => [h('span', { class: 'arrow' }, '→'), h('span', { class: 'node then' }, actionLabel(a))])),
        h('div', { class: 'row small muted', style: { marginTop: '12px', justifyContent: 'space-between' } },
          h('span', `Ran ${r.run_count} time${r.run_count === 1 ? '' : 's'}${r.last_run_at ? ` · last ${ago(r.last_run_at)}` : ''}`),
          canEdit ? h('div', { class: 'row' },
            h('button', { class: 'btn sm ghost', onclick: () => builder(r, meta, team, reload) }, icon('edit'), 'Edit'),
            h('button', { class: 'btn sm ghost', onclick: () => builder({ ...r, id: null, name: `${r.name} (copy)` }, meta, team, reload) }, 'Duplicate')) : null)))),

      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', 'Activity ', h('span', { class: 'blue' }, 'log'))),
        h('div', { class: 'card-body' }, runs.slice(0, 25).map((r) => h('div', { class: 'run-item' },
          h('div', { class: 'ico', style: r.status === 'error' ? { background: 'var(--red-bg)', color: 'var(--red)' } : {} }, icon('zap')),
          h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { style: { fontWeight: 600, fontSize: '13px' } }, r.name), h('div', { class: 'small muted' }, r.detail)),
          h('div', { class: 'small muted', style: { whiteSpace: 'nowrap' } }, ago(r.created_at))))))));
}

// Shows {{contact.first_name}} as ‹first name› so rules read naturally.
const placeholders = (text = '') => text.replace(/\{\{\s*[\w]+\.(\w+)\s*\}\}/g, (_, k) => `‹${k.replace(/_/g, ' ')}›`);
const OPS = { eq: 'is', neq: 'is not', gt: '>', gte: '≥', lt: '<', contains: 'contains', in: 'is one of', exists: 'is set' };

function actionLabel(a) {
  switch (a.type) {
    case 'create_task': return `Create task “${placeholders(a.title)}”${a.due_in_days != null ? ` (due in ${a.due_in_days}d)` : ''}`;
    case 'notify': return `Notify ${a.to || 'owner'}`;
    case 'update_contact': return `Set contact ${Object.entries(a).filter(([k]) => k !== 'type').map(([k, v]) => `${k.replace('_', ' ')}: ${v}`).join(', ')}`;
    case 'set_follow_up': return `Follow up in ${a.days} days`;
    case 'log_activity': return 'Log to CRM timeline';
    case 'webhook': return 'Send to webhook';
    default: return a.type;
  }
}

const RECIPIENTS = [['owner', 'Record owner'], ['assignee', 'Task assignee'], ['actor', 'Person who triggered it'], ['admins', 'Owners & admins'], ['all', 'Whole team']];

/** Simple visual builder: trigger → conditions → actions. */
function builder(rule, meta, team, reload) {
  const recipients = [...RECIPIENTS, ...team.map((t) => [t.id, t.name])];
  const name = h('input', { value: rule?.name || '' });
  const description = h('input', { value: rule?.description || '' });
  const trigger = select('trigger', Object.entries(meta.triggers), rule?.trigger || 'contact.created');
  const conds = h('div', { class: 'stack', style: { gap: '6px' } });
  const acts = h('div', { class: 'stack', style: { gap: '10px' } });

  const addCond = (c = { field: '', op: 'eq', value: '' }) => {
    const row = h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
      h('input', { placeholder: 'e.g. deal.value', value: c.field, 'data-k': 'field' }),
      (() => { const s = select('op', [['eq', 'equals'], ['neq', 'is not'], ['gt', '>'], ['lt', '<'], ['contains', 'contains'], ['in', 'is one of'], ['exists', 'is set']], c.op); s.dataset.k = 'op'; return s; })(),
      h('input', { placeholder: 'value', value: c.value ?? '', 'data-k': 'value' }),
      h('button', { class: 'btn sm ghost', onclick: () => row.remove() }, icon('x')));
    conds.append(row);
  };

  const addAct = (a = { type: 'create_task' }) => {
    const box = h('div', { class: 'card card-pad', style: { boxShadow: 'none', background: 'var(--sky-50)' } });
    const type = select('type', Object.entries(meta.actions).map(([k, v]) => [k, v.label]), a.type);
    const fields = h('div', { class: 'grid g2', style: { marginTop: '8px' } });
    const inp = (k, label, value, extra = {}) => { const i = h('input', { value: value ?? '', ...extra }); i.dataset.k = k; return field(label, i); };
    const sel = (k, label, opts, value) => { const s = select(k, opts, value); s.dataset.k = k; return field(label, s); };
    const drawFields = () => {
      const t = type.value;
      fields.replaceChildren(...{
        create_task: () => [inp('title', 'Task title', a.title), inp('due_in_days', 'Due in (days)', a.due_in_days ?? 1, { type: 'number' }), sel('priority', 'Priority', ['low', 'medium', 'high', 'urgent'], a.priority || 'medium'), sel('assign_to', 'Assign to', recipients, a.assign_to || 'owner')],
        notify: () => [inp('title', 'Title', a.title), inp('body', 'Message', a.body), sel('to', 'Send to', recipients, a.to || 'owner')],
        update_contact: () => [sel('lifecycle', 'Set stage', [['', 'No change'], ['lead', 'Lead'], ['prospect', 'Prospect'], ['customer', 'Customer'], ['churned', 'Churned']], a.lifecycle || ''), inp('add_tag', 'Add tag', a.add_tag)],
        set_follow_up: () => [inp('days', 'Follow up in (days)', a.days ?? 3, { type: 'number' })],
        log_activity: () => [inp('body', 'Timeline note', a.body)],
        webhook: () => [inp('url', 'Webhook URL', a.url, { placeholder: 'https://hooks.zapier.com/…' })],
      }[t]());
    };
    type.addEventListener('change', drawFields);
    drawFields();
    box.append(h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('b', { class: 'blue' }, 'THEN'), type, h('button', { class: 'btn sm ghost', onclick: () => box.remove() }, icon('x'))), fields);
    box.collect = () => {
      const out = { type: type.value };
      fields.querySelectorAll('[data-k]').forEach((i) => { if (i.value !== '') out[i.dataset.k] = i.type === 'number' ? Number(i.value) : i.value; });
      return out;
    };
    acts.append(box);
  };

  (rule?.conditions || []).forEach(addCond);
  (rule?.actions?.length ? rule.actions : [{ type: 'create_task' }]).forEach(addAct);

  const body = h('div', { class: 'stack' },
    field('Name', name, { required: true }),
    field('Description', description),
    field(h('span', h('b', { class: 'blue' }, 'WHEN'), ' this happens'), trigger),
    field(h('span', h('b', { class: 'blue' }, 'IF'), ' (optional conditions)'), h('div', conds, h('button', { class: 'btn sm soft', style: { marginTop: '6px' }, onclick: () => addCond() }, icon('plus'), 'Add condition'))),
    h('div', { class: 'small muted' }, 'Tip: use {{contact.first_name}}, {{deal.title}}, {{task.title}}, {{project.name}} in text to insert details.'),
    field(h('span', h('b', { class: 'blue' }, 'THEN'), ' do this'), h('div', acts, h('button', { class: 'btn sm soft', style: { marginTop: '8px' }, onclick: () => addAct({ type: 'notify' }) }, icon('plus'), 'Add action'))));

  const actions = [{ label: 'Cancel' }];
  if (rule?.id) {
    actions.push({ label: 'Delete', onClick: async () => { if (!confirm('Delete this automation?')) return false; await del(`/automations/${rule.id}`); reload(); } });
    actions.push({ label: 'Test run', onClick: async () => { const res = await post(`/automations/${rule.id}/test`, { payload: {} }); announce(res); if (!res.length) toast('Conditions did not match the empty test data'); reload(); } });
  }
  actions.push({ label: 'Save automation', primary: true, onClick: async () => {
    const payload = {
      name: name.value, description: description.value, trigger: trigger.value,
      conditions: [...conds.children].map((row) => Object.fromEntries([...row.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value]))).filter((c) => c.field),
      actions: [...acts.children].map((b) => b.collect()),
    };
    if (rule?.id) await patch(`/automations/${rule.id}`, payload); else await post('/automations', payload);
    toast('Automation saved');
    reload();
  } });
  modal(rule?.id ? 'Edit automation' : 'New automation', body, { wide: true, actions });
}


import { del, get, patch, post } from '../api.js';
import { navigate } from '../app.js';
import { announce, date, field, formData, h, icon, modal, money, mount, select, showError, titleCase, toast } from '../ui.js';

export async function render(el, route) {
  if (route.parts[1]) return renderProject(el, route.parts[1], route.query);
  return renderList(el);
}

async function renderList(el) {
  const [projects, blueprint] = await Promise.all([get('/funnel/projects'), get('/funnel/blueprint?kind=service')]);
  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Build Funnel'),
        h('h1', { style: { marginTop: '6px' } }, 'From ', h('span', { class: 'blue' }, 'idea'), ' to ', h('span', { class: 'hl' }, 'fully built')),
        h('p', 'A guided, step-by-step path that takes any product or service idea through validation, offer design, pricing, building, systems and launch. Each step tells you why it matters, exactly what to do and when it’s done.')),
      h('button', { class: 'btn primary', onclick: newProject }, icon('plus'), 'New build')),

    projects.length ? h('div', { class: 'grid g3', style: { marginBottom: '26px' } }, projects.map((p) => h('a', { href: `#/funnel/${p.id}`, class: 'card card-pad', style: { color: 'inherit', textDecoration: 'none' } },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } },
        h('span', { class: 'badge blue' }, p.kind === 'product' ? '📦 Product' : '🤝 Service'),
        h('span', { class: `badge ${p.status === 'launched' ? 'green' : ''}` }, titleCase(p.status))),
      h('h2', { style: { margin: '12px 0 4px' } }, p.name),
      h('p', { class: 'muted small', style: { minHeight: '38px' } }, (p.idea || '').slice(0, 110)),
      h('div', { class: 'row', style: { justifyContent: 'space-between', margin: '14px 0 6px' } }, h('span', { class: 'small' }, 'Now: ', h('b', { class: 'blue' }, p.stage_title)), h('b', `${p.progress}%`)),
      h('div', { class: 'progress' }, h('span', { style: { width: `${p.progress}%` } })),
      h('div', { class: 'small muted', style: { marginTop: '6px' } }, `${p.steps_done} of ${p.steps_total} steps complete`))))
      : h('div', { class: 'card card-pad empty', style: { marginBottom: '26px' } }, 'No builds yet. Start with your idea – the system guides you from there.'),

    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', 'The ', h('span', { class: 'blue' }, '9-stage'), ' journey every build follows')),
      h('div', { class: 'card-body' }, h('div', { class: 'grid g3' }, blueprint.map((s, i) => h('div', { class: 'card-pad', style: { border: '1px solid var(--line)', borderRadius: '12px' } },
        h('div', { class: 'row' }, h('span', { class: 'hl-box' }, i + 1), h('h3', s.title)),
        h('p', { class: 'small muted', style: { margin: '8px 0' } }, s.goal),
        h('div', { class: 'small' }, `${s.steps.length} steps · ~${Math.round(s.steps.reduce((m, x) => m + x.minutes, 0) / 60)} hrs`)))))),
  );
}

function newProject() {
  const body = h('div', { class: 'stack' },
    field('What are you building?', h('input', { name: 'name', placeholder: 'e.g. Confidence Accelerator' }), { required: true }),
    field('Is it a product or a service?', select('kind', [['service', 'Service (coaching, done-for-you, trades…)'], ['product', 'Product (physical, digital, software…)']])),
    field('Describe the idea (rough is fine)', h('textarea', { name: 'idea', placeholder: 'I want to help… by…' }), { help: 'This pre-fills your first step.' }));
  modal('Start a new build', body, { actions: [
    { label: 'Cancel' },
    { label: 'Create build', primary: true, onClick: async () => {
      const p = await post('/funnel/projects', formData(body));
      navigate(`#/funnel/${p.id}`);
    } },
  ] });
}

async function renderProject(el, projectId, query) {
  let project = await get(`/funnel/projects/${projectId}`);
  let stageKey = query.stage || project.stages.find((s) => s.status === 'active')?.key || project.stages[0].key;
  let stepKey = query.step;

  const draw = () => {
    const stage = project.stages.find((s) => s.key === stageKey);
    const step = stage.steps.find((s) => s.key === stepKey) || stage.steps.find((s) => s.status !== 'done' && s.status !== 'skipped') || stage.steps[0];
    stepKey = step.key;

    mount(el,
      h('div', { class: 'page-head' },
        h('div', h('a', { href: '#/funnel', class: 'small' }, '← All builds'),
          h('h1', { style: { marginTop: '8px' } }, project.name, ' ', h('span', { class: 'badge blue', style: { verticalAlign: 'middle' } }, project.kind === 'product' ? 'Product' : 'Service')),
          h('p', project.idea || '')),
        h('div', { class: 'row' },
          h('div', { class: 'ring', style: { '--p': project.progress } }, h('span', `${project.progress}%`)),
          h('div', h('div', { style: { fontWeight: 800 } }, `${project.steps_done} / ${project.steps_total} steps`), h('div', { class: 'small muted' }, project.status === 'launched' ? '🚀 Launched!' : 'Keep going – one step at a time')),
          h('button', { class: 'btn ghost danger sm', onclick: async () => { if (confirm('Delete this build?')) { await del(`/funnel/projects/${project.id}`); navigate('#/funnel'); } } }, 'Delete'))),

      h('div', { class: 'stepper' }, project.stages.map((s, i) => h('div', {
        class: `stage-pill ${s.status} ${s.key === stageKey ? 'selected' : ''}`,
        title: s.status === 'locked' ? 'Unlocks when the previous stage is complete' : s.goal,
        onclick: () => { stageKey = s.key; stepKey = null; draw(); },
      }, h('div', { class: 'n' }, s.status === 'done' ? `✓ STAGE ${i + 1}` : s.status === 'locked' ? `🔒 STAGE ${i + 1}` : `STAGE ${i + 1}`),
      h('div', { class: 't' }, s.title), h('div', { class: 'progress' }, h('span', { style: { width: `${s.progress}%` } }))))),

      h('div', { class: 'funnel-layout' },
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('div', h('div', { class: 'eyebrow' }, stage.status === 'locked' ? 'Preview · locked' : `${stage.progress}% complete`), h('h2', { style: { marginTop: '4px' } }, stage.title))),
          h('div', { class: 'card-body' },
            h('p', { class: 'small muted', style: { marginBottom: '12px' } }, stage.goal),
            stage.steps.map((s) => h('div', { class: `step-link ${s.status} ${s.key === step.key ? 'selected' : ''}`, onclick: () => { stepKey = s.key; draw(); } },
              h('span', { class: 'tick' }, s.status === 'done' ? icon('tick') : null),
              h('div', h('div', { style: { fontWeight: 650 } }, s.title), h('div', { class: 'small muted' }, `~${s.minutes} min${s.status === 'skipped' ? ' · skipped' : ''}`)))))),
        stepPanel(project, stage, step, (updated, next) => { project = updated; if (next) { stageKey = next.stage; stepKey = next.step; } draw(); }),
      ),
    );
  };
  draw();
}

function stepPanel(project, stage, step, onChange) {
  const inputs = h('div', { class: 'stack' }, step.fields.map((f) => fieldFor(f, step.answers[f.key])));
  const collect = () => {
    const data = {};
    for (const f of step.fields) {
      if (f.type === 'list') data[f.key] = [...inputs.querySelectorAll(`[data-list="${f.key}"] input`)].map((i) => i.value.trim()).filter(Boolean);
      else {
        const v = inputs.querySelector(`[name="${f.key}"]`).value;
        data[f.key] = f.type === 'number' ? (v === '' ? null : Number(v)) : v;
      }
    }
    return data;
  };

  const save = async (status) => {
    try {
      const res = await patch(`/funnel/projects/${project.id}/steps/${step.key}`, { answers: collect(), ...(status ? { status } : {}) });
      announce(res.automations);
      if (status === 'done') toast(`✅ “${step.title}” complete`);
      else if (!status) toast('Saved');
      // Move to the next open step after completing one.
      let next = null;
      if (status === 'done' || status === 'skipped') {
        const flat = res.project.stages.flatMap((s) => s.steps.map((x) => ({ stage: s.key, step: x.key, status: x.status, locked: s.status === 'locked' })));
        const idx = flat.findIndex((x) => x.step === step.key);
        next = flat.slice(idx + 1).find((x) => x.status !== 'done' && x.status !== 'skipped' && !x.locked) || null;
      }
      onChange(res.project, next);
    } catch (err) { showError(err); }
  };

  const locked = stage.status === 'locked';
  const extras = [];
  if (step.computed === 'economics') {
    const e = project.economics;
    extras.push(h('div', { class: 'brief-section' }, h('h4', 'Your numbers (calculated automatically)'),
      h('div', { class: 'econ' },
        h('div', h('span', { class: 'small muted' }, 'Price'), h('b', money(e.price))),
        h('div', h('span', { class: 'small muted' }, 'Profit / sale'), h('b', money(e.profitPerSale))),
        h('div', h('span', { class: 'small muted' }, 'Margin'), h('b', `${e.margin}%`)),
        h('div', h('span', { class: 'small muted' }, 'Sales for goal'), h('b', e.salesForGoal ?? '–'))),
      h('p', { class: 'small', style: { marginTop: '10px' } }, h('b', { class: 'blue' }, 'Verdict: '), e.verdict, e.breakEvenSales != null ? ` Break-even at ${e.breakEvenSales} sales/month.` : '')));
  }
  if (step.prefill === 'sales_page') {
    extras.push(h('div', { class: 'brief-section' }, h('h4', 'Sales page draft – built from your earlier answers'),
      h('div', { class: 'pre' }, project.sales_page_draft),
      h('button', { class: 'btn sm soft', style: { marginTop: '8px' }, onclick: () => navigator.clipboard?.writeText(project.sales_page_draft).then(() => toast('Copied')) }, 'Copy draft')));
  }

  return h('div', { class: 'card' },
    h('div', { class: 'card-head', style: { alignItems: 'flex-start' } },
      h('div', h('div', { class: 'eyebrow' }, `${stage.title} · step ${stage.steps.indexOf(step) + 1} of ${stage.steps.length}`),
        h('h2', { style: { marginTop: '6px', fontSize: '22px' } }, step.title)),
      h('div', { class: 'row' },
        h('span', { class: 'badge' }, icon('clock'), `~${step.minutes} min`),
        h('span', { class: `badge ${step.status === 'done' ? 'green' : step.status === 'in_progress' ? 'blue' : ''}` }, titleCase(step.status)))),
    h('div', { class: 'card-body stack', style: { gap: '18px' } },
      h('div', { class: 'why' }, h('div', { class: 'eyebrow', style: { marginBottom: '4px' } }, 'Why this matters'), step.why),
      h('div', h('h3', { style: { marginBottom: '10px' } }, 'Do ', h('span', { class: 'blue' }, 'this')), h('ol', { class: 'how' }, step.how.map((x) => h('li', x)))),
      h('div', h('h3', { style: { marginBottom: '10px' } }, 'Your ', h('span', { class: 'hl' }, 'worksheet')), inputs),
      extras,
      h('div', { class: 'done-when' }, icon('flag'), h('div', h('b', 'Done when: '), step.doneWhen)),
      step.missing.length && step.status !== 'done' ? h('p', { class: 'small muted' }, 'Still needed: ', step.missing.join(', ')) : null,
      step.completed_at ? h('p', { class: 'small muted' }, `Completed ${date(step.completed_at)}`) : null,
      h('div', { class: 'row', style: { justifyContent: 'space-between', borderTop: '1px solid var(--line-soft)', paddingTop: '14px' } },
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => save() }, 'Save progress'),
          h('button', { class: 'btn soft', onclick: async () => {
            try {
              const tasks = await post(`/funnel/projects/${project.id}/steps/${step.key}/tasks`);
              toast(`Sent ${tasks.length} task${tasks.length > 1 ? 's' : ''} to the Task Manager`, 'auto');
            } catch (err) { showError(err); }
          } }, icon('send'), 'Send to tasks')),
        h('div', { class: 'row' },
          step.status !== 'done' ? h('button', { class: 'btn ghost', disabled: locked, onclick: () => save('skipped') }, 'Skip') : h('button', { class: 'btn ghost', onclick: () => save('in_progress') }, 'Re-open'),
          step.status !== 'done' ? h('button', { class: 'btn primary', disabled: locked, title: locked ? 'Complete the earlier stages first' : '', onclick: () => save('done') }, icon('tick'), 'Mark complete') : null))));
}

function fieldFor(f, value) {
  let input;
  if (f.type === 'textarea') input = h('textarea', { name: f.key, placeholder: f.placeholder || '', value: value ?? '' });
  else if (f.type === 'number') input = h('input', { name: f.key, type: 'number', value: value ?? '', placeholder: f.placeholder || '' });
  else if (f.type === 'select') input = select(f.key, [['', 'Choose…'], ...f.options.map((o) => [o, titleCase(o)])], value || '');
  else if (f.type === 'list') {
    const wrap = h('div', { class: 'list-input', 'data-list': f.key });
    const addRow = (v = '') => {
      const row = h('div', { class: 'item' }, h('input', { value: v, placeholder: 'Add an item…' }), h('button', { class: 'btn sm ghost', type: 'button', onclick: () => row.remove() }, icon('x')));
      wrap.insertBefore(row, addBtn);
    };
    const addBtn = h('button', { class: 'btn sm soft', type: 'button', onclick: () => addRow() }, icon('plus'), 'Add');
    wrap.append(addBtn);
    const items = Array.isArray(value) && value.length ? value : [''];
    items.forEach((v) => addRow(v));
    input = wrap;
  } else input = h('input', { name: f.key, value: value ?? '', placeholder: f.placeholder || '' });
  return field(f.label, input, { required: f.required, help: f.help });
}

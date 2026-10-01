import { del, get, patch, post } from '../api.js';
import { ago, announce, avatar, confirmDialog, date, field, formData, h, icon, modal, money, mount, relative, select, showError, titleCase, toast } from '../ui.js';

const STAGES = [['new', 'New'], ['qualified', 'Qualified'], ['proposal', 'Proposal'], ['negotiation', 'Negotiation'], ['won', 'Won'], ['lost', 'Lost']];
const LIFE = { lead: 'blue', prospect: 'amber', customer: 'green', churned: '' };

export async function render(el, route) {
  const tab = route.parts[1] || 'pipeline';
  const team = await get('/team');
  const body = h('div');
  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'CRM'),
        h('h1', { style: { marginTop: '6px' } }, 'Every lead, deal & ', h('span', { class: 'blue' }, 'follow-up')),
        h('p', 'Add a lead and the system books the welcome call, sets the follow-up and chases proposals for you. Move a deal to Won and onboarding starts automatically.')),
      h('div', { class: 'row' },
        h('button', { class: 'btn soft', onclick: () => dealModal(null, team, () => render(el, route)) }, icon('plus'), 'New deal'),
        h('button', { class: 'btn primary', onclick: () => contactModal(team, () => render(el, route)) }, icon('plus'), 'Add lead'))),
    h('div', { class: 'tabs' }, [['pipeline', 'Pipeline'], ['contacts', 'Contacts']].map(([k, l]) => h('a', { href: `#/crm/${k}`, class: tab === k ? 'active' : '' }, l))),
    body);
  if (route.query.new) contactModal(team, () => { location.hash = '#/crm/contacts'; });
  if (tab === 'contacts') return renderContacts(body, route.query, team);
  return renderPipeline(body, team);
}

async function renderPipeline(el, team) {
  const pipeline = await get('/crm/pipeline');
  const open = pipeline.filter((s) => !['won', 'lost'].includes(s.stage));
  const openValue = open.reduce((s, c) => s + c.value, 0);
  const won = pipeline.find((s) => s.stage === 'won');
  const lost = pipeline.find((s) => s.stage === 'lost');
  const winRate = won.count + lost.count ? Math.round((won.count / (won.count + lost.count)) * 100) : 0;

  const board = h('div', { class: 'board' }, pipeline.map((col) => {
    const column = h('div', { class: 'column', 'data-stage': col.stage,
      ondragover: (e) => { e.preventDefault(); column.classList.add('drop'); },
      ondragleave: () => column.classList.remove('drop'),
      ondrop: async (e) => {
        e.preventDefault(); column.classList.remove('drop');
        const dealId = e.dataTransfer.getData('text/plain');
        try {
          const res = await patch(`/crm/deals/${dealId}`, { stage: col.stage });
          announce(res.automations);
          if (!res.automations.length) toast(`Moved to ${titleCase(col.stage)}`);
          renderPipeline(el, team);
        } catch (err) { showError(err); }
      } },
    h('div', { class: 'column-head' }, h('div', h('h3', STAGES.find((s) => s[0] === col.stage)[1]), h('div', { class: 'small muted' }, `${col.count} deal${col.count === 1 ? '' : 's'}`)), h('span', { class: 'sum' }, money(col.value))),
    col.deals.map((d) => h('div', { class: 'kcard', draggable: true, ondragstart: (e) => e.dataTransfer.setData('text/plain', d.id), onclick: () => dealModal(d, team, () => renderPipeline(el, team)) },
      h('div', { class: 'title' }, d.title),
      h('div', { class: 'meta', style: { justifyContent: 'space-between' } },
        h('span', { class: 'value' }, money(d.value)),
        h('span', { class: 'row', style: { gap: '6px' } }, d.expected_close && !['won', 'lost'].includes(d.stage) ? h('span', `📅 ${date(d.expected_close)}`) : null, avatar(d.owner_name, true))),
      d.company ? h('div', { class: 'small muted', style: { marginTop: '6px' } }, `${d.first_name} ${d.last_name || ''} · ${d.company}`) : null)));
    return column;
  }));

  mount(el,
    h('div', { class: 'grid g4', style: { marginBottom: '16px' } },
      stat('Open pipeline', money(openValue), `${open.reduce((s, c) => s + c.count, 0)} open deals`, 'accent'),
      stat('Won', money(won.value), `${won.count} deals`),
      stat('Win rate', `${winRate}%`, 'won vs lost'),
      stat('Avg deal size', money(openValue / Math.max(1, open.reduce((s, c) => s + c.count, 0))), 'open deals')),
    h('p', { class: 'small muted', style: { marginBottom: '10px' } }, '💡 Drag deals between columns. Automations run on Proposal, Won and Lost.'),
    board);
}

const stat = (label, value, sub, cls = '') => h('div', { class: `card kpi ${cls}` }, h('div', { class: 'label' }, label), h('div', { class: `value ${cls ? '' : 'blue'}` }, value), h('div', { class: 'sub' }, sub));

async function renderContacts(el, query, team) {
  const qs = new URLSearchParams();
  if (query.q) qs.set('q', query.q);
  if (query.lifecycle) qs.set('lifecycle', query.lifecycle);
  const contacts = await get(`/crm/contacts?${qs}`);
  const search = h('input', { placeholder: 'Search name, email or company…', value: query.q || '', style: { maxWidth: '320px' }, onkeydown: (e) => { if (e.key === 'Enter') location.hash = `#/crm/contacts?q=${encodeURIComponent(e.target.value)}`; } });
  mount(el,
    h('div', { class: 'row', style: { marginBottom: '14px', justifyContent: 'space-between' } },
      h('div', { class: 'row' }, [['', 'All'], ['lead', 'Leads'], ['prospect', 'Prospects'], ['customer', 'Customers'], ['churned', 'Churned']].map(([k, l]) => h('a', { class: `chip ${(query.lifecycle || '') === k ? 'active' : ''}`, href: `#/crm/contacts${k ? `?lifecycle=${k}` : ''}` }, l))),
      search),
    h('div', { class: 'card', style: { overflow: 'hidden' } },
      h('table', { class: 'table' },
        h('thead', h('tr', ['Name', 'Company', 'Stage', 'Source', 'Open value', 'Next follow-up', 'Owner'].map((c) => h('th', c)))),
        h('tbody', contacts.map((c) => h('tr', { onclick: () => contactDrawer(c.id, team, () => renderContacts(el, query, team)) },
          h('td', h('div', { class: 'row', style: { gap: '10px' } }, avatar(`${c.first_name} ${c.last_name || ''}`), h('div', h('div', { style: { fontWeight: 700 } }, `${c.first_name} ${c.last_name || ''}`), h('div', { class: 'small muted' }, c.email)))),
          h('td', c.company || '–'),
          h('td', h('span', { class: `badge ${LIFE[c.lifecycle]}` }, titleCase(c.lifecycle))),
          h('td', { class: 'muted' }, c.source || '–'),
          h('td', h('b', { class: 'blue' }, c.open_value ? money(c.open_value) : '–')),
          h('td', c.next_follow_up_at ? h('span', { class: 'badge blue' }, relative(c.next_follow_up_at)) : h('span', { class: 'muted' }, '–')),
          h('td', avatar(c.owner_name, true))))))),
    contacts.length ? null : h('div', { class: 'empty' }, 'No contacts match.'));
}

function contactModal(team, reload) {
  const body = h('div', { class: 'stack' },
    h('div', { class: 'grid g2' }, field('First name', h('input', { name: 'first_name' }), { required: true }), field('Last name', h('input', { name: 'last_name' }))),
    h('div', { class: 'grid g2' }, field('Email', h('input', { name: 'email', type: 'email' })), field('Phone', h('input', { name: 'phone' }))),
    h('div', { class: 'grid g2' }, field('Company', h('input', { name: 'company' })), field('Source', select('source', ['Instagram', 'LinkedIn', 'Referral', 'Website', 'Lead magnet', 'Google', 'Event', 'Other']))),
    h('div', { class: 'grid g2' }, field('Stage', select('lifecycle', [['lead', 'Lead'], ['prospect', 'Prospect'], ['customer', 'Customer']])), field('Owner', select('owner_id', team.map((t) => [t.id, t.name])))),
    h('div', { class: 'why small' }, '⚡ When you save a lead, the system creates a welcome-call task for the owner, sets a follow-up in 3 days and logs it.'));
  modal('Add a lead', body, { actions: [
    { label: 'Cancel' },
    { label: 'Save lead', primary: true, onClick: async () => { const res = await post('/crm/contacts', formData(body)); announce(res.automations); reload(); } },
  ] });
}

async function contactDrawer(id, team, reload) {
  document.querySelector('.drawer')?.remove();
  const c = await get(`/crm/contacts/${id}`);
  const note = h('textarea', { placeholder: 'Log a call, email, meeting or note…', style: { minHeight: '70px' } });
  const type = select('type', [['note', 'Note'], ['call', 'Call'], ['email', 'Email'], ['meeting', 'Meeting']]);
  const followUp = select('follow', [['', 'No follow-up'], ['1', 'Follow up tomorrow'], ['3', 'In 3 days'], ['7', 'In a week'], ['14', 'In 2 weeks']]);
  const close = () => drawer.remove();
  const drawer = h('div', { class: 'drawer' },
    h('div', { class: 'modal-head' }, h('div', { class: 'row' }, avatar(`${c.first_name} ${c.last_name || ''}`), h('div', h('h2', `${c.first_name} ${c.last_name || ''}`), h('div', { class: 'small muted' }, c.company || ''))), h('button', { class: 'icon-btn', onclick: close }, icon('x'))),
    h('div', { class: 'modal-body' },
      h('div', { class: 'row' },
        h('span', { class: `badge ${LIFE[c.lifecycle]}` }, titleCase(c.lifecycle)),
        c.next_follow_up_at ? h('span', { class: 'badge blue' }, `Follow-up ${relative(c.next_follow_up_at)}`) : null,
        c.last_contacted_at ? h('span', { class: 'badge' }, `Last contact ${ago(c.last_contacted_at)}`) : null),
      h('div', { class: 'grid g2 small' }, h('div', h('div', { class: 'muted' }, 'Email'), c.email || '–'), h('div', h('div', { class: 'muted' }, 'Phone'), c.phone || '–'), h('div', h('div', { class: 'muted' }, 'Source'), c.source || '–'), h('div', h('div', { class: 'muted' }, 'Stage'),
        (() => { const s = select('lifecycle', [['lead', 'Lead'], ['prospect', 'Prospect'], ['customer', 'Customer'], ['churned', 'Churned']], c.lifecycle); s.onchange = async () => { await patch(`/crm/contacts/${c.id}`, { lifecycle: s.value }); toast('Updated'); reload(); }; return s; })())),
      h('div', { class: 'card card-pad', style: { boxShadow: 'none' } },
        h('h3', { style: { marginBottom: '8px' } }, 'Log ', h('span', { class: 'blue' }, 'activity')),
        h('div', { class: 'stack' }, note, h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, type), h('div', { style: { flex: 1 } }, followUp)),
          h('button', { class: 'btn primary', onclick: async () => {
            if (!note.value.trim()) return;
            try { await post(`/crm/contacts/${c.id}/activities`, { type: type.value, body: note.value, follow_up_days: followUp.value ? Number(followUp.value) : undefined }); toast('Logged'); contactDrawer(id, team, reload); reload(); } catch (err) { showError(err); }
          } }, 'Save'))),
      c.deals.length ? h('div', h('h3', { style: { marginBottom: '8px' } }, 'Deals'), c.deals.map((d) => h('div', { class: 'list-item' }, h('div', { class: 'grow' }, h('b', d.title)), h('span', { class: 'badge blue' }, titleCase(d.stage)), h('b', { class: 'blue' }, money(d.value))))) : null,
      c.tasks.length ? h('div', h('h3', { style: { marginBottom: '8px' } }, 'Tasks'), c.tasks.map((t) => h('div', { class: 'list-item' }, h('div', { class: 'grow' }, t.title), h('span', { class: `badge ${t.status === 'done' ? 'green' : 'blue'}` }, titleCase(t.status))))) : null,
      h('div', h('h3', { style: { marginBottom: '8px' } }, 'Timeline'), c.activities.map((a) => h('div', { class: 'run-item' },
        h('div', { class: 'ico' }, icon(a.type === 'system' ? 'zap' : a.type === 'call' ? 'users' : a.type === 'email' ? 'send' : 'edit')),
        h('div', { class: 'grow' }, h('div', { class: 'small' }, h('b', a.type === 'system' ? 'Automation' : titleCase(a.type)), ` · ${a.author || 'System'} · ${ago(a.created_at)}`), h('div', a.body))))),
      h('button', { class: 'btn ghost danger sm', onclick: async () => { if (await confirmDialog('Delete this contact?')) { await del(`/crm/contacts/${c.id}`); close(); reload(); } } }, 'Delete contact')));
  document.body.append(drawer);
}

async function dealModal(deal, team, reload) {
  const contacts = await get('/crm/contacts');
  const body = h('div', { class: 'stack' },
    field('Deal name', h('input', { name: 'title', value: deal?.title || '' }), { required: true }),
    h('div', { class: 'grid g2' }, field('Value (£)', h('input', { name: 'value', type: 'number', value: deal?.value ?? '' })), field('Expected close', h('input', { name: 'expected_close', type: 'date', value: deal?.expected_close || '' }))),
    h('div', { class: 'grid g2' }, field('Contact', select('contact_id', [['', '—'], ...contacts.map((c) => [c.id, `${c.first_name} ${c.last_name || ''}`])], deal?.contact_id || '')), field('Stage', select('stage', STAGES, deal?.stage || 'new'))),
    field('Owner', select('owner_id', team.map((t) => [t.id, t.name]), deal?.owner_id)));
  const actions = [{ label: 'Cancel' }];
  if (deal) actions.push({ label: 'Delete', onClick: async () => { await del(`/crm/deals/${deal.id}`); reload(); } });
  actions.push({ label: deal ? 'Save' : 'Create deal', primary: true, onClick: async () => {
    const d = formData(body);
    d.value = Number(d.value || 0);
    if (!d.contact_id) delete d.contact_id;
    if (!d.expected_close) delete d.expected_close;
    if (deal) { const res = await patch(`/crm/deals/${deal.id}`, d); announce(res.automations); } else await post('/crm/deals', d);
    reload();
  } });
  modal(deal ? 'Edit deal' : 'New deal', body, { actions });
}

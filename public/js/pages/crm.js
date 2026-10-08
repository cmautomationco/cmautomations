import { del, get, patch, post } from '../api.js';
import { CHANNEL_LABELS, contactName, ago, announce, avatar, channelIcon, confirmDialog, copyText, date, dateTime, field, formData, h, icon, modal, money, mount, pounds, relative, select, showError, titleCase, toast } from '../ui.js';
import { bookingModal } from './bookings.js';
import { documentModal } from './invoices.js';

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
    h('div', { class: 'tabs' }, [['pipeline', 'Pipeline'], ['contacts', 'Contacts'], ['forms', 'Lead forms']].map(([k, l]) => h('a', { href: `#/crm/${k}`, class: tab === k ? 'active' : '' }, l))),
    body);
  if (route.query.new) contactModal(team, () => { location.hash = '#/crm/contacts'; }, route.query);
  if (route.query.open) contactDrawer(route.query.open, team, () => {});
  if (tab === 'forms') return renderForms(body);
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
          h('td', h('div', { class: 'row', style: { gap: '10px' } }, avatar(contactName(c)), h('div', h('div', { style: { fontWeight: 700 } }, contactName(c)), h('div', { class: 'small muted' }, c.email)))),
          h('td', c.company || '–'),
          h('td', h('span', { class: `badge ${LIFE[c.lifecycle]}` }, titleCase(c.lifecycle))),
          h('td', { class: 'muted' }, c.source || '–'),
          h('td', h('b', { class: 'blue' }, c.open_value ? money(c.open_value) : '–')),
          h('td', c.next_follow_up_at ? h('span', { class: 'badge blue' }, relative(c.next_follow_up_at)) : h('span', { class: 'muted' }, '–')),
          h('td', avatar(c.owner_name, true))))))),
    contacts.length ? null : h('div', { class: 'empty' }, 'No contacts match.'));
}

function contactModal(team, reload, prefill = {}) {
  const body = h('div', { class: 'stack' },
    h('div', { class: 'grid g2' }, field('First name', h('input', { name: 'first_name', value: prefill.first_name || '' }), { required: true }), field('Last name', h('input', { name: 'last_name', value: prefill.last_name || '' }))),
    h('div', { class: 'grid g2' }, field('Email', h('input', { name: 'email', type: 'email' })), field('Mobile', h('input', { name: 'phone' }))),
    h('div', { class: 'grid g2' }, field('Company', h('input', { name: 'company' })), field('Source', select('source', ['Instagram', 'LinkedIn', 'Referral', 'Website', 'Lead magnet', 'Google', 'Facebook', 'Checkatrade', 'Event', 'Other']))),
    h('div', { class: 'grid g2' }, field('Address', h('input', { name: 'address' })), field('Postcode', h('input', { name: 'postcode' }))),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'whatsapp_opt_in', style: { width: 'auto' } }), 'Happy to get messages on WhatsApp'),
    h('div', { class: 'grid g2' }, field('Stage', select('lifecycle', [['lead', 'Lead'], ['prospect', 'Prospect'], ['customer', 'Customer']])), field('Owner', select('owner_id', team.map((t) => [t.id, t.name])))),
    h('div', { class: 'why small' }, '⚡ When you save a lead, they get an instant welcome message, the owner gets a welcome-call task, a follow-up is set for 3 days and it’s all logged.'));
  modal('Add a lead', body, { actions: [
    { label: 'Cancel' },
    { label: 'Save lead', primary: true, onClick: async () => { const res = await post('/crm/contacts', formData(body)); announce(res.automations); reload(); } },
  ] });
}

async function contactDrawer(id, team, reload) {
  document.querySelector('.drawer')?.remove();
  const c = await get(`/crm/contacts/${id}`);
  const name = `${c.first_name} ${c.last_name || ''}`.trim();
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
      h('div', { class: 'row' },
        h('a', { class: 'btn sm primary', href: `#/messages/${c.id}`, onclick: close }, icon('chat'), 'Message'),
        c.phone_e164 ? h('a', { class: 'btn sm', href: `tel:${c.phone_e164}` }, icon('phone'), 'Call') : null,
        h('button', { class: 'btn sm', onclick: () => bookingModal({ contact: c, onDone: () => contactDrawer(id, team, reload) }) }, icon('calendar'), 'Book'),
        h('button', { class: 'btn sm', onclick: () => documentModal({ kind: 'quote', contact_id: c.id }) }, icon('receipt'), 'Quote'),
        h('button', { class: 'btn sm ghost', onclick: () => editContact(c, () => { contactDrawer(id, team, reload); reload(); }) }, icon('edit'), 'Edit')),
      h('div', { class: 'grid g2 small' }, h('div', h('div', { class: 'muted' }, 'Email'), c.email || '–', c.email_opt_out ? h('span', { class: 'badge red', style: { marginLeft: '6px' } }, 'Unsubscribed') : null), h('div', h('div', { class: 'muted' }, 'Mobile'), c.phone || '–', c.sms_opt_out ? h('span', { class: 'badge red', style: { marginLeft: '6px' } }, 'Replied STOP') : c.whatsapp_opt_in ? h('span', { class: 'badge green', style: { marginLeft: '6px' } }, 'WhatsApp OK') : null),
        c.address || c.postcode ? h('div', { class: 'span2' }, h('div', { class: 'muted' }, 'Address'), h('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.address, c.postcode].filter(Boolean).join(', '))}`, target: '_blank', rel: 'noopener' }, [c.address, c.postcode].filter(Boolean).join(', '))) : null,
        h('div', h('div', { class: 'muted' }, 'Source'), c.source || '–'), h('div', h('div', { class: 'muted' }, 'Stage'),
        (() => { const s = select('lifecycle', [['lead', 'Lead'], ['prospect', 'Prospect'], ['customer', 'Customer'], ['churned', 'Churned']], c.lifecycle); s.onchange = async () => { await patch(`/crm/contacts/${c.id}`, { lifecycle: s.value }); toast('Updated'); reload(); }; return s; })())),
      h('div', { class: 'card card-pad', style: { boxShadow: 'none' } },
        h('h3', { style: { marginBottom: '8px' } }, 'Log ', h('span', { class: 'blue' }, 'activity')),
        h('div', { class: 'stack' }, note, h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, type), h('div', { style: { flex: 1 } }, followUp)),
          h('button', { class: 'btn primary', onclick: async () => {
            if (!note.value.trim()) return;
            try { await post(`/crm/contacts/${c.id}/activities`, { type: type.value, body: note.value, follow_up_days: followUp.value ? Number(followUp.value) : undefined }); toast('Logged'); contactDrawer(id, team, reload); reload(); } catch (err) { showError(err); }
          } }, 'Save'))),
      c.deals.length ? h('div', h('h3', { style: { marginBottom: '8px' } }, 'Deals'), c.deals.map((d) => h('div', { class: 'list-item' }, h('div', { class: 'grow' }, h('b', d.title)), h('span', { class: 'badge blue' }, titleCase(d.stage)), h('b', { class: 'blue' }, money(d.value))))) : null,
      c.bookings?.length ? h('div', h('h3', { style: { marginBottom: '8px' } }, 'Bookings'), c.bookings.map((b) => h('a', { class: 'list-item', href: `#/bookings/${b.id}`, onclick: close, style: { color: 'inherit', textDecoration: 'none' } }, h('div', { class: 'grow' }, h('b', b.service_name || 'Booking'), h('div', { class: 'small muted' }, dateTime(b.starts_at))), h('span', { class: 'badge blue' }, titleCase(b.status))))) : null,
      c.invoices?.length ? h('div', h('h3', { style: { marginBottom: '8px' } }, 'Quotes & invoices'), c.invoices.map((i) => h('a', { class: 'list-item', href: `#/invoices/${i.id}`, onclick: close, style: { color: 'inherit', textDecoration: 'none' } }, h('div', { class: 'grow' }, h('b', `${titleCase(i.kind)} ${i.number}`)), h('span', { class: 'badge blue' }, titleCase(i.status)), h('b', { class: 'blue' }, pounds(i.total_pence))))) : null,
      c.messages?.length ? h('div', h('h3', { style: { marginBottom: '8px' } }, 'Messages ', h('a', { class: 'small', href: `#/messages/${c.id}`, onclick: close, style: { fontWeight: 600 } }, 'Open conversation ›')), c.messages.slice(-5).map((m) => h('div', { class: 'run-item' }, h('div', { class: 'ico' }, channelIcon(m.channel)), h('div', { class: 'grow' }, h('div', { class: 'small muted' }, `${m.direction === 'in' ? 'From them' : 'To them'} · ${CHANNEL_LABELS[m.channel]} · ${ago(m.created_at)}`), h('div', { class: 'small' }, m.body.length > 160 ? `${m.body.slice(0, 160)}…` : m.body))))) : null,
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
  if (deal) {
    body.append(h('div', { class: 'row' },
      h('button', { class: 'btn sm soft', type: 'button', onclick: async () => { try { const q = await post(`/invoices/from-deal/${deal.id}`, { kind: 'quote' }); document.querySelector('.modal-back')?.remove(); toast(`Quote ${q.number} drafted – check it and press Send`); location.hash = `#/invoices/${q.id}`; } catch (err) { showError(err); } } }, icon('receipt'), 'Create quote'),
      h('button', { class: 'btn sm soft', type: 'button', onclick: async () => { try { const inv = await post(`/invoices/from-deal/${deal.id}`, {}); document.querySelector('.modal-back')?.remove(); toast(`Invoice ${inv.number} ready`); location.hash = `#/invoices/${inv.id}`; } catch (err) { showError(err); } } }, icon('pound'), 'Create invoice')));
  }
  modal(deal ? 'Edit deal' : 'New deal', body, { actions });
}

function editContact(c, done) {
  const body = h('div', { class: 'stack' },
    h('div', { class: 'grid g2' }, field('First name', h('input', { name: 'first_name', value: c.first_name })), field('Last name', h('input', { name: 'last_name', value: c.last_name || '' }))),
    h('div', { class: 'grid g2' }, field('Email', h('input', { name: 'email', type: 'email', value: c.email || '' })), field('Mobile', h('input', { name: 'phone', value: c.phone || '' }))),
    h('div', { class: 'grid g2' }, field('Address', h('input', { name: 'address', value: c.address || '' })), field('Postcode', h('input', { name: 'postcode', value: c.postcode || '' }))),
    h('div', { class: 'grid g2' }, field('Company', h('input', { name: 'company', value: c.company || '' })), field('Prefers', select('preferred_channel', [['auto', 'Whatever works best'], ['whatsapp', 'WhatsApp'], ['sms', 'Text'], ['email', 'Email']], c.preferred_channel || 'auto'))),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'whatsapp_opt_in', checked: Boolean(c.whatsapp_opt_in), style: { width: 'auto' } }), 'Happy to get WhatsApp messages'),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'sms_opt_out', checked: Boolean(c.sms_opt_out), style: { width: 'auto' } }), 'Don’t send texts or WhatsApp (they opted out)'),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'email_opt_out', checked: Boolean(c.email_opt_out), style: { width: 'auto' } }), 'Don’t send marketing emails (they unsubscribed)'));
  modal(`Edit ${c.first_name}`, body, { actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: async () => { await patch(`/crm/contacts/${c.id}`, formData(body)); toast('Saved'); done(); } }] });
}

// ───────────────────────── Lead forms ─────────────────────────

const FIELD_TYPES = [['text', 'Short text'], ['textarea', 'Long text'], ['email', 'Email'], ['tel', 'Phone'], ['postcode', 'Postcode'], ['select', 'Drop-down'], ['checkbox', 'Tick box']];

async function renderForms(el) {
  const forms = await get('/forms');
  const reload = () => renderForms(el);
  mount(el,
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '12px' } },
      h('p', { class: 'small muted', style: { maxWidth: '640px' } }, 'Put a form on your website, Facebook page or link in bio. Every submission becomes a lead here, gets an instant thank-you and runs your new-lead automations.'),
      h('button', { class: 'btn primary', onclick: () => formEditor(null, reload) }, icon('plus'), 'New form')),
    forms.length ? h('div', { class: 'grid g2' }, forms.map((f) => h('div', { class: 'card card-pad stack' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', h('h3', f.name), h('div', { class: 'small muted' }, `${f.fields.length} fields · ${f.submissions} submission${f.submissions === 1 ? '' : 's'}`)), h('span', { class: `badge ${f.active ? 'green' : ''}` }, f.active ? 'Live' : 'Paused')),
      h('div', { class: 'copy-row' }, h('input', { value: f.link, readOnly: true }), h('button', { class: 'btn sm', onclick: () => copyText(f.link, 'Form link copied') }, icon('copy'), 'Link')),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => copyText(f.embed, 'Embed code copied – paste it into your website') }, 'Copy embed code'),
        h('a', { class: 'btn sm', href: f.link.slice(f.link.indexOf('#')), target: '_blank' }, 'Open'),
        h('button', { class: 'btn sm', onclick: () => formSubmissions(f.id) }, 'Submissions'),
        h('button', { class: 'btn sm ghost', onclick: () => formEditor(f, reload) }, icon('edit'), 'Edit')))))
      : h('div', { class: 'card card-pad empty' }, 'No forms yet. Create one – e.g. “Get a free quote” – and put it on your website.'));
}

async function formSubmissions(formId) {
  const f = await get(`/forms/${formId}`);
  modal(`${f.name} – submissions`, f.recent.length ? h('div', f.recent.map((s) => h('div', { class: 'list-item', style: { alignItems: 'flex-start' } },
    h('div', { class: 'grow' }, h('a', { href: `#/crm/contacts?open=${s.contact_id}`, onclick: () => document.querySelector('.modal-back')?.remove() }, h('b', `${s.first_name || ''} ${s.last_name || ''}`)), h('div', { class: 'small muted' }, Object.entries(s.data).filter(([, v]) => v !== '' && v !== false).map(([k, v]) => `${f.fields.find((x) => x.key === k)?.label || k}: ${v === true ? 'Yes' : v}`).join(' · '))),
    h('span', { class: 'small muted' }, ago(s.created_at))))) : h('p', { class: 'muted' }, 'No submissions yet.'), { wide: true });
}

function formEditor(f, reload) {
  const rows = h('div', { class: 'stack', style: { gap: '6px' } });
  const addRow = (x = {}) => {
    const type = select('type', FIELD_TYPES, x.type || 'text');
    const options = h('input', { class: 'opts', placeholder: 'Options, separated by commas', value: (x.options || []).join(', '), style: { display: (x.type || 'text') === 'select' ? '' : 'none' } });
    type.addEventListener('change', () => { options.style.display = type.value === 'select' ? '' : 'none'; });
    const row = h('div', { class: 'form-field-row' },
      h('input', { class: 'label', placeholder: 'Question / label', value: x.label || '' }),
      h('input', { class: 'key', placeholder: 'name', value: x.key || '', title: 'Use first_name, last_name, email, phone, address, postcode or company to fill in the contact record' }),
      type,
      h('label', { class: 'row small', style: { gap: '4px', fontWeight: 600 } }, h('input', { type: 'checkbox', class: 'req', checked: Boolean(x.required), style: { width: 'auto' } }), 'Required'),
      h('button', { class: 'icon-btn', type: 'button', onclick: () => row.remove() }, icon('x')),
      options);
    rows.append(row);
  };
  (f?.fields || [
    { key: 'first_name', label: 'First name', type: 'text', required: true },
    { key: 'phone', label: 'Mobile number', type: 'tel', required: true },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'postcode', label: 'Postcode', type: 'postcode' },
    { key: 'message', label: 'What do you need help with?', type: 'textarea' },
  ]).forEach(addRow);
  const body = h('div', { class: 'stack' },
    h('div', { class: 'grid g2' }, field('Name (just for you)', h('input', { name: 'name', value: f?.name || 'Website enquiry' })), field('Heading on the form', h('input', { name: 'title', value: f?.title || 'Get a free quote' }))),
    field('Intro (optional)', h('input', { name: 'intro', value: f?.intro || '' })),
    h('div', h('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'Fields – name them first_name, last_name, email, phone, address, postcode or company to fill in the contact; anything else is saved with the enquiry.'), rows,
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => addRow() }, icon('plus'), 'Add field')),
    h('div', { class: 'grid g2' }, field('Button text', h('input', { name: 'button_label', value: f?.button_label || 'Send' })), field('Tag new leads with', h('input', { name: 'tags', value: (f?.tags || ['website']).join(', ') }))),
    field('Thank-you message (on screen)', h('input', { name: 'thank_you', value: f?.thank_you || 'Thanks – we’ve got your message and will be in touch shortly.' })),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'send_thank_you', checked: f ? Boolean(f.send_thank_you) : true, style: { width: 'auto' } }), 'Also send them a thank-you by WhatsApp, text or email'),
    f ? h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'active', checked: Boolean(f.active), style: { width: 'auto' } }), 'Form is live') : null);
  const actions = [{ label: 'Cancel' }];
  if (f) actions.push({ label: 'Delete', onClick: async () => { if (!(await confirmDialog('Delete this form? Its leads stay in the CRM.'))) return false; await del(`/forms/${f.id}`); reload(); } });
  actions.push({ label: f ? 'Save' : 'Create form', primary: true, onClick: async () => {
    const d = formData(body);
    const fields = [...rows.querySelectorAll('.form-field-row')].map((r) => ({ label: r.querySelector('.label').value, key: r.querySelector('.key').value || r.querySelector('.label').value, type: r.querySelector('select').value, required: r.querySelector('.req').checked, options: r.querySelector('.opts').value }));
    const payload = { name: d.name, title: d.title, intro: d.intro, button_label: d.button_label, thank_you: d.thank_you, send_thank_you: d.send_thank_you, tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean), fields, ...(f ? { active: d.active } : {}) };
    if (f) await patch(`/forms/${f.id}`, payload); else await post('/forms', payload);
    toast('Form saved');
    reload();
  } });
  modal(f ? `Edit ${f.name}` : 'New lead form', body, { wide: true, actions });
}

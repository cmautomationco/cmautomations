import { del, get, patch, post, put } from '../api.js';
import { refresh, state } from '../app.js';
import {
  ago, confirmDialog, copyText, date, field, formData, h, icon, modal, mount, paybackLabel, pounds, select, showError, titleCase, toast, toPence,
} from '../ui.js';

/**
 * The agency area: one control centre for every client business, the audit →
 * proposal → new client flow, and each client's monthly report.
 */
export async function render(el, route) {
  // The agency area lives in the agency's own workspace (its name and branding).
  if (state.me.org.kind !== 'agency') {
    const home = state.me.orgs.find((o) => o.kind === 'agency' && ['owner', 'admin'].includes(o.role));
    if (home) { await post('/auth/switch', { org_id: home.id }); refresh(); return; }
  }
  const tab = route.parts[1] || 'hub';
  const body = h('div');
  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Agency'),
        h('h1', { style: { marginTop: '6px' } }, 'Every client, ', h('span', { class: 'blue' }, 'one screen')),
        h('p', 'Hours saved, overdue work, open issues and anything that needs attention across all your clients. Run audits, send branded proposals, and send each client a monthly report of what their system did.')),
      h('div', { class: 'row' },
        h('button', { class: 'btn soft', onclick: () => newClientModal() }, icon('plus'), 'Add client'),
        h('button', { class: 'btn primary', onclick: () => newAuditModal() }, icon('clipboard'), 'New audit'))),
    h('div', { class: 'tabs' }, [['hub', 'Control centre'], ['audits', 'Audits & proposals'], ['reports', 'Monthly reports']].map(([k, l]) => h('a', { href: `#/agency${k === 'hub' ? '' : `/${k}`}`, class: tab === k ? 'active' : '' }, l))),
    body);
  try {
    if (tab === 'audits' && route.parts[2]) return await renderAudit(body, route.parts[2], route.query.step);
    if (tab === 'audits') return await renderAudits(body);
    if (tab === 'reports') return await renderReports(body);
    return await renderHub(body);
  } catch (err) {
    if (err.status === 403) return mount(body, h('div', { class: 'card card-pad empty' }, 'The agency area is for agency owners and admins.'));
    throw err;
  }
}

const stat = (label, value, sub, cls = '') => h('div', { class: `card kpi ${cls}` }, h('div', { class: 'label' }, label), h('div', { class: `value ${cls ? '' : 'blue'}` }, value), h('div', { class: 'sub' }, sub));

/** Switches into a client's system and opens a page there. */
export async function openClient(orgId, link = '#/') {
  try {
    await post('/auth/switch', { org_id: orgId });
    if (location.hash === link) refresh(); else location.hash = link;
  } catch (err) { showError(err); }
}

// ───────────────────────── Control centre ─────────────────────────

async function renderHub(el) {
  const hub = await get('/agency/hub');
  const t = hub.totals;
  const reload = () => renderHub(el);
  mount(el,
    h('div', { class: 'grid g4', style: { marginBottom: '16px' } },
      stat('Hours saved for clients', `${t.hours_saved_30d}`, 'last 30 days, all clients', 'accent'),
      stat('Clients', t.clients, `${pounds(t.mrr_pence)} a month`),
      stat('Need attention', t.needs_attention, `${t.attention_items} item${t.attention_items === 1 ? '' : 's'} to look at`),
      stat('Proposals out', t.open_proposals, `${pounds(t.pipeline_pence)}/month in the pipeline`)),
    hub.clients.length ? h('div', { class: 'client-grid' }, hub.clients.map((c) => clientCard(c, reload)))
      : h('div', { class: 'card card-pad empty' }, 'No clients yet. Run an audit and send a proposal – when the client accepts, their system is created here automatically. Or add a client directly.'),
    h('div', { class: 'card card-pad stack', style: { marginTop: '18px' } },
      h('h3', 'Reports ', h('span', { class: 'blue' }, 'settings')),
      h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, (() => {
        const box = h('input', { type: 'checkbox', checked: hub.settings.auto_send_reports, style: { width: 'auto' } });
        box.onchange = async () => { await put('/agency/settings', { auto_send_reports: box.checked }); toast(box.checked ? 'Reports will be sent to clients automatically on the 1st' : 'Reports will wait for you to review them'); };
        return box;
      })(), 'Send each client’s monthly report automatically on the 1st (otherwise you get a task to review and send them)')));
}

function clientCard(c, reload) {
  const trend = c.minutes_saved_prev_30d ? Math.round(((c.minutes_saved_30d - c.minutes_saved_prev_30d) / c.minutes_saved_prev_30d) * 100) : null;
  return h('div', { class: `card client ${c.health}` },
    h('div', { class: 'client-head' },
      c.brand.logo ? h('img', { src: c.brand.logo, alt: '', class: 'client-logo' }) : h('div', { class: 'client-logo mark', style: c.brand.color ? { background: c.brand.color } : {} }, (c.brand.display_name || c.name).slice(0, 2).toUpperCase()),
      h('div', { class: 'grow' }, h('h3', c.brand.display_name || c.name), h('div', { class: 'small muted' }, `${titleCase(c.niche)}${c.contact_name ? ` · ${c.contact_name}` : ''}`)),
      h('div', { class: `health ${c.health}`, title: 'Health score' }, c.score)),
    h('div', { class: 'client-stats' },
      h('div', h('b', `${c.hours_saved_30d}h`), h('span', 'saved (30 days)', trend != null ? ` ${trend >= 0 ? '▲' : '▼'}${Math.abs(trend)}%` : '')),
      h('div', h('b', c.overdue_tasks), h('span', 'overdue tasks')),
      h('div', h('b', c.open_issues), h('span', 'open issues')),
      h('div', h('b', c.new_leads_7d), h('span', 'new leads (7 days)'))),
    c.attention.length ? h('div', { class: 'attention' }, c.attention.map((a) => h('button', { class: `att ${a.level}`, onclick: () => (c.member ? openClient(c.id, a.link) : toast('You’re not on this client’s team')) }, icon('alert'), a.text)))
      : h('div', { class: 'small', style: { color: 'var(--green)', fontWeight: 600 } }, '✓ Nothing needs attention'),
    h('div', { class: 'row', style: { marginTop: 'auto' } },
      c.member ? h('button', { class: 'btn sm primary', onclick: () => openClient(c.id, '#/') }, 'Open system') : h('span', { class: 'small muted' }, 'Not on their team'),
      c.report ? h('a', { class: 'btn sm', href: `#/agency/reports` }, `${c.report.status === 'sent' ? '✓ ' : ''}Report`) : h('button', { class: 'btn sm', onclick: async () => { try { await post('/agency/reports', { org_id: c.id, period: c.report_period }); toast('Report built'); location.hash = '#/agency/reports'; } catch (err) { showError(err); } } }, 'Build report'),
      h('button', { class: 'btn sm ghost', onclick: () => clientModal(c, reload) }, 'Branding & details')));
}

async function clientModal(c, reload) {
  const full = await get(`/agency/clients/${c.id}`);
  let logo = full.brand.logo || '';
  const preview = h('div', { class: 'logo-preview' }, logo ? h('img', { src: logo, alt: '' }) : h('span', { class: 'small muted' }, 'No logo'));
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml,image/webp' });
  file.onchange = () => readLogo(file.files[0], (data) => { logo = data; mount(preview, h('img', { src: data, alt: '' })); });
  const body = h('div', { class: 'stack' },
    h('h3', 'Branding'),
    h('div', { class: 'grid g2' },
      field('Name shown in their system', h('input', { name: 'display_name', value: full.brand.display_name || full.name })),
      field('Main colour', h('input', { name: 'color', type: 'color', value: full.brand.color || '#1e6a9e' }))),
    h('div', { class: 'row' }, preview, h('div', { class: 'grow' }, field('Logo (PNG, JPG, SVG – under 300KB)', file)), logo ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { logo = ''; mount(preview, h('span', { class: 'small muted' }, 'No logo')); } }, 'Remove') : null),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'hide_powered_by', checked: Boolean(full.brand.hide_powered_by), style: { width: 'auto' } }), `Hide “Powered by ${state.me.agency?.name || 'your agency'}”`),
    h('h3', { style: { marginTop: '6px' } }, 'Client details'),
    h('div', { class: 'grid g2' }, field('Contact name', h('input', { name: 'contact_name', value: full.profile.contact_name })), field('Report goes to (email)', h('input', { name: 'email', type: 'email', value: full.profile.email }))),
    h('div', { class: 'grid g2' }, field('Mobile', h('input', { name: 'phone', value: full.profile.phone })), field('Monthly fee (£)', h('input', { name: 'fee', type: 'number', step: '0.01', value: (full.profile.monthly_fee_pence / 100).toFixed(2) }))),
    field('Their time is worth (£ per hour)', h('input', { name: 'hourly', type: 'number', step: '0.01', value: (full.profile.hourly_cost_pence / 100).toFixed(2) }), { help: 'Used to put a £ value on hours saved in their report.' }));
  modal(`${full.name}`, body, { actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: async () => {
    const f = formData(body);
    await patch(`/agency/clients/${c.id}`, {
      brand: { display_name: f.display_name, color: f.color, logo, hide_powered_by: f.hide_powered_by },
      contact_name: f.contact_name, email: f.email, phone: f.phone, monthly_fee_pence: toPence(f.fee), hourly_cost_pence: toPence(f.hourly),
    });
    toast('Saved – their system now uses this branding');
    reload();
  } }] });
}

/** Reads an image file into a data URL (shrinking big photos so they stay small). */
export function readLogo(fileObj, done) {
  if (!fileObj) return;
  if (fileObj.size > 2_000_000) { toast('That image is over 2MB – please pick a smaller one', 'error'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    if (fileObj.type === 'image/svg+xml' || fileObj.size < 250_000) { done(reader.result); return; }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 320 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      done(canvas.toDataURL('image/png'));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(fileObj);
}

function newClientModal() {
  const body = h('div', { class: 'stack' },
    field('Business name', h('input', { name: 'name' }), { required: true }),
    field('Niche', select('niche', state.meta.niches.map((n) => [n.key, n.label]), 'local_services')),
    h('div', { class: 'grid g2' }, field('Contact name', h('input', { name: 'contact_name' })), field('Email', h('input', { name: 'email', type: 'email' }))),
    h('div', { class: 'grid g2' }, field('Mobile', h('input', { name: 'phone' })), field('Monthly fee (£)', h('input', { name: 'fee', type: 'number', step: '0.01' }))),
    h('div', { class: 'why small' }, 'Their system is set up for the niche straight away – automations, content pillars and channels – and your agency team is added to it.'));
  modal('Add a client', body, { actions: [{ label: 'Cancel' }, { label: 'Create their system', primary: true, onClick: async () => {
    const f = formData(body);
    await post('/agency/clients', { name: f.name, niche: f.niche, contact_name: f.contact_name, email: f.email, phone: f.phone, monthly_fee_pence: toPence(f.fee) });
    toast(`${f.name} created`);
    location.hash = '#/agency';
    refresh();
  } }] });
}

// ───────────────────────── Audits & proposals ─────────────────────────

const AUDIT_STATUS = { draft: ['Draft', ''], proposal_sent: ['Proposal sent', 'blue'], accepted: ['Accepted', 'green'], declined: ['Declined', 'red'] };

async function renderAudits(el) {
  const audits = await get('/agency/audits');
  mount(el,
    h('div', { class: 'why small', style: { marginBottom: '14px' } }, h('b', 'How it works: '), '1. Fill in the discovery call and the time audit with the client. 2. The system scores every task, picks the quick wins and works out hours saved and money recovered. 3. Send the branded proposal – when they accept online, their system is created and a kick-off task lands with you.'),
    h('div', { class: 'card', style: { overflow: 'hidden' } }, audits.length ? h('table', { class: 'table' },
      h('thead', h('tr', ['Client', 'Niche', 'Status', 'Set-up', 'Monthly', 'Updated'].map((t) => h('th', t)))),
      h('tbody', audits.map((a) => h('tr', { onclick: () => { location.hash = `#/agency/audits/${a.id}`; } },
        h('td', h('b', a.client_name), a.contact_name ? h('div', { class: 'small muted' }, a.contact_name) : null),
        h('td', titleCase(a.niche)),
        h('td', h('span', { class: `badge ${AUDIT_STATUS[a.status][1]}` }, AUDIT_STATUS[a.status][0])),
        h('td', pounds(a.setup_fee_pence)), h('td', h('b', { class: 'blue' }, pounds(a.monthly_fee_pence))),
        h('td', { class: 'muted' }, ago(a.updated_at))))))
      : h('div', { class: 'empty' }, 'No audits yet. Start one before (or during) your discovery call.')));
}

function newAuditModal() {
  const body = h('div', { class: 'stack' },
    field('Client business', h('input', { name: 'client_name', placeholder: 'e.g. Pipe Pros Plumbing' }), { required: true }),
    field('Niche', select('niche', state.meta.niches.map((n) => [n.key, n.label]), 'local_services'), { help: 'Pre-loads the tasks businesses like this usually do by hand.' }),
    h('div', { class: 'grid g2' }, field('Contact name', h('input', { name: 'contact_name' })), field('Email', h('input', { name: 'contact_email', type: 'email' }))),
    h('div', { class: 'grid g2' }, field('Mobile', h('input', { name: 'contact_phone' })), field('Team size', h('input', { name: 'team_size', type: 'number', min: 1, value: 1 }))));
  modal('New audit', body, { actions: [{ label: 'Cancel' }, { label: 'Start audit', primary: true, onClick: async () => {
    const f = formData(body);
    const audit = await post('/agency/audits', { ...f, team_size: Number(f.team_size || 1) });
    location.hash = `#/agency/audits/${audit.id}`;
  } }] });
}

const STEPS = [['details', '1. Client'], ['discovery', '2. Discovery call'], ['tasks', '3. Time audit'], ['results', '4. Results & proposal']];

async function renderAudit(el, auditId, stepParam) {
  const [audit, lib] = await Promise.all([get(`/agency/audits/${auditId}`), get('/agency/audit-library')]);
  const step = STEPS.some(([k]) => k === stepParam) ? stepParam : audit.proposal?.title ? 'results' : 'details';
  const locked = audit.status === 'accepted';
  const go = (s) => { location.hash = `#/agency/audits/${auditId}?step=${s}`; };
  const panel = h('div');
  mount(el,
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '12px' } },
      h('div', h('a', { href: '#/agency/audits', class: 'small' }, '‹ All audits'), h('h2', { style: { marginTop: '4px' } }, audit.client_name, ' ', h('span', { class: `badge ${AUDIT_STATUS[audit.status][1]}` }, AUDIT_STATUS[audit.status][0]))),
      h('div', { class: 'row' },
        audit.proposal?.title ? h('button', { class: 'btn sm', onclick: () => copyText(audit.link, 'Proposal link copied') }, icon('link'), 'Copy proposal link') : null,
        audit.proposal?.title ? h('a', { class: 'btn sm soft', href: audit.link.slice(audit.link.indexOf('#')), target: '_blank' }, 'Preview proposal') : null,
        !locked ? h('button', { class: 'btn sm ghost danger', onclick: async () => { if (await confirmDialog('Delete this audit?')) { await del(`/agency/audits/${auditId}`); location.hash = '#/agency/audits'; } } }, 'Delete') : null)),
    locked ? h('div', { class: 'why small', style: { marginBottom: '12px' } }, `🎉 Accepted${audit.accepted_by ? ` by ${audit.accepted_by}` : ''} on ${date(audit.accepted_at, { day: 'numeric', month: 'short', year: 'numeric' })}. Their system has been created – `, h('a', { href: '#', onclick: (e) => { e.preventDefault(); openClient(audit.client_org_id, '#/'); } }, 'open it'), '.') : null,
    h('div', { class: 'audit-steps' }, STEPS.map(([k, l]) => h('a', { href: `#/agency/audits/${auditId}?step=${k}`, class: k === step ? 'active' : '' }, l))),
    panel);
  const save = async (patchBody, next) => {
    try { await patch(`/agency/audits/${auditId}`, patchBody); toast('Saved'); if (next) go(next); else renderAudit(el, auditId, step); } catch (err) { showError(err); }
  };
  if (step === 'details') return auditDetails(panel, audit, save, locked);
  if (step === 'discovery') return auditDiscovery(panel, audit, lib, save, locked);
  if (step === 'tasks') return auditTasks(panel, audit, lib, save, locked);
  return auditResults(panel, audit, el, locked);
}

function auditDetails(el, a, save, locked) {
  const form = h('div', { class: 'card card-pad stack' },
    h('div', { class: 'grid g2' }, field('Client business', h('input', { name: 'client_name', value: a.client_name })), field('Niche', select('niche', state.meta.niches.map((n) => [n.key, n.label]), a.niche))),
    h('div', { class: 'grid g3' }, field('Contact name', h('input', { name: 'contact_name', value: a.contact_name || '' })), field('Email', h('input', { name: 'contact_email', type: 'email', value: a.contact_email || '' })), field('Mobile', h('input', { name: 'contact_phone', value: a.contact_phone || '' }))),
    h('div', { class: 'grid g4' },
      field('Team size', h('input', { name: 'team_size', type: 'number', min: 1, value: a.team_size })),
      field('Their time is worth (£/hour)', h('input', { name: 'hourly', type: 'number', step: '0.01', value: (a.hourly_cost_pence / 100).toFixed(2) })),
      field('Set-up fee (£)', h('input', { name: 'setup', type: 'number', step: '0.01', value: (a.setup_fee_pence / 100).toFixed(2) })),
      field('Monthly fee (£)', h('input', { name: 'monthly', type: 'number', step: '0.01', value: (a.monthly_fee_pence / 100).toFixed(2) }))));
  mount(el, form, locked ? null : h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: () => {
    const f = formData(form);
    save({ client_name: f.client_name, niche: f.niche, contact_name: f.contact_name, contact_email: f.contact_email, contact_phone: f.contact_phone, team_size: Number(f.team_size || 1), hourly_cost_pence: toPence(f.hourly), setup_fee_pence: toPence(f.setup), monthly_fee_pence: toPence(f.monthly) }, 'discovery');
  } }, 'Save & continue')));
}

function auditDiscovery(el, a, lib, save, locked) {
  const form = h('div', { class: 'card card-pad stack' },
    h('p', { class: 'small muted' }, 'Fill this in with the client on the discovery call. The numbers feed the money case in the proposal.'),
    h('div', { class: 'grid g2' }, lib.discovery.map((f) => field(f.label, f.type === 'textarea'
      ? h('textarea', { name: f.key, value: a.discovery[f.key] || '', style: { minHeight: '70px' } })
      : h('input', { name: f.key, type: f.type === 'number' ? 'number' : 'text', placeholder: f.placeholder || '', value: a.discovery[f.key] ?? '' })))));
  mount(el, form, locked ? null : h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: () => {
    const f = formData(form);
    for (const d of lib.discovery) if (d.type === 'number' && f[d.key] !== '') f[d.key] = Number(f[d.key]);
    save({ discovery: f }, 'tasks');
  } }, 'Save & continue')));
}

function auditTasks(el, a, lib, save, locked) {
  const rows = h('tbody');
  const addRow = (t) => {
    const libTask = lib.tasks.find((l) => l.key === t.key);
    const tr = h('tr', { style: { cursor: 'default' }, 'data-key': t.key },
      h('td', h('input', { type: 'checkbox', class: 'sel', checked: t.selected !== false, style: { width: 'auto' } })),
      h('td', libTask ? h('div', h('b', t.name), h('div', { class: 'small muted' }, libTask.solution)) : h('input', { class: 'name', value: t.name, placeholder: 'Task name' })),
      h('td', h('input', { class: 'per_week', type: 'number', min: 0, value: t.per_week, style: { width: '70px' } })),
      h('td', h('input', { class: 'minutes', type: 'number', min: 0, value: t.minutes, style: { width: '70px' } })),
      h('td', h('input', { class: 'people', type: 'number', min: 1, value: t.people || 1, style: { width: '60px' } })),
      h('td', select('pain', [1, 2, 3, 4, 5].map((n) => [String(n), ['1 – fine', '2', '3 – annoying', '4', '5 – hate it'][n - 1]]), String(t.pain || 3))),
      h('td', { class: 'hrs small' }));
    tr.dataset.name = t.name;
    tr.dataset.category = t.category || 'Other';
    tr.addEventListener('input', () => calc(tr));
    rows.append(tr);
    calc(tr);
  };
  const calc = (tr) => {
    const hrs = (Number(tr.querySelector('.per_week').value) * Number(tr.querySelector('.minutes').value) * Number(tr.querySelector('.people').value || 1)) / 60;
    tr.querySelector('.hrs').textContent = `${Math.round(hrs * 10) / 10} h/wk`;
  };
  a.tasks.forEach(addRow);
  const read = () => [...rows.querySelectorAll('tr')].map((tr) => ({
    key: tr.dataset.key, name: tr.querySelector('.name')?.value || tr.dataset.name, category: tr.dataset.category,
    per_week: Number(tr.querySelector('.per_week').value), minutes: Number(tr.querySelector('.minutes').value), people: Number(tr.querySelector('.people').value || 1),
    pain: Number(tr.querySelector('select').value), selected: tr.querySelector('.sel').checked,
  })).filter((t) => t.name);
  mount(el,
    h('div', { class: 'card', style: { overflow: 'hidden' } },
      h('div', { class: 'card-head' }, h('h3', 'What do they do ', h('span', { class: 'blue' }, 'by hand?')), locked ? null : h('button', { class: 'btn sm soft', onclick: () => addRow({ key: `custom_${Date.now()}`, name: '', per_week: 1, minutes: 30, people: 1, pain: 3, selected: true, category: 'Other' }) }, icon('plus'), 'Add their own task')),
      h('div', { class: 'card-body' }, h('p', { class: 'small muted', style: { marginBottom: '10px' } }, 'Tick what applies and adjust how often, how long and how much they hate it. Untick anything that doesn’t apply.'),
        h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'table audit-table' }, h('thead', h('tr', ['', 'Task', 'Times a week', 'Minutes each', 'People', 'How painful?', 'Time'].map((t) => h('th', t)))), rows)))),
    locked ? null : h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } },
      h('button', { class: 'btn', onclick: () => save({ tasks: read() }) }, 'Save'),
      h('button', { class: 'btn primary', onclick: async () => {
        try { await patch(`/agency/audits/${a.id}`, { tasks: read() }); await post(`/agency/audits/${a.id}/analyse`); location.hash = `#/agency/audits/${a.id}?step=results`; } catch (err) { showError(err); }
      } }, icon('wand'), 'Score it & write the proposal')));
}

function auditResults(el, a, pageEl, locked) {
  const an = a.analysis;
  const p = a.proposal;
  if (!p?.title) {
    mount(el, h('div', { class: 'card card-pad empty' }, 'Not scored yet. ', h('button', { class: 'btn sm primary', onclick: async () => { await post(`/agency/audits/${a.id}/analyse`); renderAudit(pageEl, a.id, 'results'); } }, 'Score it now')));
    return;
  }
  mount(el,
    h('div', { class: 'grid g4', style: { marginBottom: '16px' } },
      stat('Hours saved a week', an.hours_saved_per_week, `of ${an.hours_now_per_week} hours spent on these tasks`, 'accent'),
      stat('Hours saved a year', an.hours_saved_per_year, 'back to the business'),
      stat('Worth a month', pounds(an.monthly_value_pence), an.revenue_recovered_monthly_pence ? `incl. ${pounds(an.revenue_recovered_monthly_pence)} in extra jobs` : 'in time saved'),
      stat('Pays for itself in', paybackLabel(an.payback_months), `${pounds(a.setup_fee_pence)} set-up · ${pounds(a.monthly_fee_pence)}/month`)),
    h('div', { class: 'grid g2', style: { alignItems: 'start' } },
      h('div', { class: 'card card-pad stack' },
        h('h3', '⚡ Quick ', h('span', { class: 'blue' }, 'wins')),
        p.quick_wins.length ? p.quick_wins.map((q) => h('div', { class: 'list-item' }, h('div', { class: 'grow' }, h('b', q.name), h('div', { class: 'small muted' }, q.solution)), h('b', { class: 'blue' }, `${q.saved_per_week}h/wk`))) : h('div', { class: 'small muted' }, 'No quick wins – everything here is a bigger build.'),
        h('h3', { style: { marginTop: '8px' } }, 'Every task, ', h('span', { class: 'blue' }, 'scored')),
        h('table', { class: 'table' }, h('thead', h('tr', ['Task', 'Now', 'Saved', 'Score'].map((t) => h('th', t)))),
          h('tbody', an.tasks.map((t) => h('tr', { style: { cursor: 'default' } }, h('td', t.name, t.quick_win ? h('span', { class: 'badge green', style: { marginLeft: '6px' } }, 'Quick win') : null), h('td', `${t.hours_per_week}h`), h('td', h('b', { class: 'blue' }, `${t.saved_per_week}h`)), h('td', t.score)))))),
      h('div', { class: 'card card-pad stack' },
        h('h3', 'The ', h('span', { class: 'blue' }, 'proposal')),
        h('p', { class: 'small' }, p.intro),
        h('div', h('b', { class: 'small' }, 'What we found'), h('ul', { class: 'small', style: { margin: '4px 0 0', paddingLeft: '18px' } }, p.problems.map((x) => h('li', x)))),
        p.phases.map((ph) => h('div', h('b', { class: 'small' }, `${ph.name} (${ph.weeks})`), h('ul', { class: 'small', style: { margin: '4px 0 0', paddingLeft: '18px' } }, ph.items.map((i) => h('li', `${i.name} – ${i.solution}`))))),
        h('div', { class: 'small muted' }, h('b', 'Assumptions: '), p.assumptions.join(' ')),
        locked ? null : h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: async () => { await post(`/agency/audits/${a.id}/analyse`); toast('Re-scored'); renderAudit(pageEl, a.id, 'results'); } }, 'Re-score'),
          h('button', { class: 'btn primary', onclick: () => sendProposalModal(a, () => renderAudit(pageEl, a.id, 'results')) }, icon('send'), a.status === 'proposal_sent' ? 'Send again' : 'Send proposal')))));
}

function sendProposalModal(a, done) {
  const body = h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, `${a.contact_name || 'The client'} gets a link to the branded proposal and can accept it online. When they do, their system is created and you get a kick-off task.`),
    field('Send by', select('channel', [['auto', 'Email if we have it, otherwise WhatsApp'], ['email', 'Email'], ['whatsapp', 'WhatsApp'], ['sms', 'Text']])));
  modal('Send the proposal', body, { actions: [{ label: 'Cancel' }, { label: 'Send', primary: true, onClick: async () => {
    const res = await post(`/agency/audits/${a.id}/send`, formData(body));
    toast(`Proposal sent${res.message.status === 'demo' ? ' (demo mode – saved, not actually sent)' : ''}`);
    done();
  } }] });
}

// ───────────────────────── Monthly reports ─────────────────────────

async function renderReports(el) {
  const [reports, hub] = await Promise.all([get('/agency/reports'), get('/agency/hub')]);
  const reload = () => renderReports(el);
  const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const form = h('div', { class: 'row' },
    h('div', { style: { minWidth: '220px' } }, select('org_id', hub.clients.map((c) => [c.id, c.brand.display_name || c.name]))),
    h('div', { style: { width: '170px' } }, select('period', [[lastMonth, 'Last month'], [thisMonth, 'This month so far']])),
    h('button', { class: 'btn primary', onclick: async () => { try { await post('/agency/reports', formData(form)); toast('Report built'); reload(); } catch (err) { showError(err); } } }, 'Build report'));
  mount(el,
    h('div', { class: 'card card-pad stack', style: { marginBottom: '16px' } },
      h('p', { class: 'small muted' }, 'Each report shows the client what their system did: hours saved (and what that’s worth), leads followed up, missed calls texted back, bookings and reminders, money collected and issues resolved. They’re built automatically on the 1st of each month.'),
      hub.clients.length ? form : h('div', { class: 'small muted' }, 'Add a client first.')),
    h('div', { class: 'card', style: { overflow: 'hidden' } }, reports.length ? h('table', { class: 'table' },
      h('thead', h('tr', ['Client', 'Month', 'Summary', 'Status', ''].map((t) => h('th', t)))),
      h('tbody', reports.map((r) => h('tr', { style: { cursor: 'default' } },
        h('td', h('b', r.org_name)), h('td', r.period),
        h('td', { class: 'small muted', style: { maxWidth: '420px' } }, r.summary),
        h('td', h('span', { class: `badge ${r.status === 'sent' ? 'green' : ''}` }, r.status === 'sent' ? `Sent ${date(r.sent_at)}` : 'Draft')),
        h('td', h('div', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } },
          h('a', { class: 'btn sm', href: `#/report/${r.public_token}`, target: '_blank' }, 'View'),
          h('button', { class: 'btn sm primary', onclick: async () => { try { const res = await post(`/agency/reports/${r.id}/send`); toast(`Sent to ${res.message.to_addr}${res.message.status === 'demo' ? ' (demo mode)' : ''}`); reload(); } catch (err) { showError(err); } } }, r.status === 'sent' ? 'Resend' : 'Send')))))))
      : h('div', { class: 'empty' }, 'No reports yet.')));
}

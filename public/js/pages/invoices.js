import { get, patch, post, put } from '../api.js';
import { state } from '../app.js';
import {
  CHANNEL_LABELS, announce, confirmDialog, copyText, date, dateTime, field, formData, h, icon, modal, mount, pounds, select, showError, titleCase, toast, toPence,
} from '../ui.js';

/**
 * Quotes & invoices: won deal or finished job → quote → invoice → paid,
 * with a card-payment link and automatic chasing of anything overdue.
 */
const STATUS = {
  draft: ['Draft', ''], sent: ['Sent', 'blue'], accepted: ['Accepted', 'green'], declined: ['Declined', 'red'], converted: ['Invoiced', 'green'],
  part_paid: ['Part paid', 'amber'], paid: ['Paid', 'green'], overdue: ['Overdue', 'red'], void: ['Void', ''],
};
const badge = (s) => h('span', { class: `badge ${STATUS[s][1]}` }, STATUS[s][0]);
const CHASE = ['Not chased yet', 'Friendly reminder sent', 'Firmer reminder sent', 'Passed to a person'];

export async function render(el, route) {
  const sub = route.parts[1];
  const tab = ['quotes', 'settings'].includes(sub) ? sub : 'invoices';
  const summary = await get('/invoices/summary');
  const admin = state.me.role !== 'member';
  const body = h('div');
  const reload = () => render(el, route);
  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Quotes & invoices'),
        h('h1', { style: { marginTop: '6px' } }, 'Get paid ', h('span', { class: 'blue' }, 'without chasing')),
        h('p', 'Quotes customers accept online, invoices they pay by card, and polite → firmer reminders that go out on their own. If an invoice is still unpaid after that, a person gets a task to call.')),
      h('div', { class: 'row' },
        h('button', { class: 'btn soft', onclick: () => documentModal({ kind: 'quote', onDone: reload }) }, icon('plus'), 'New quote'),
        h('button', { class: 'btn primary', onclick: () => documentModal({ kind: 'invoice', onDone: reload }) }, icon('plus'), 'New invoice'))),
    h('div', { class: 'grid g4', style: { marginBottom: '16px' } },
      stat('Owed to you', pounds(summary.outstanding_pence), `${summary.drafts} draft${summary.drafts === 1 ? '' : 's'} not sent yet`, 'accent'),
      stat('Overdue', pounds(summary.overdue_pence), `${summary.overdue_count} invoice${summary.overdue_count === 1 ? '' : 's'} – being chased automatically`),
      stat('Paid this month', pounds(summary.paid_month_pence), summary.chased_recovered_pence ? `${pounds(summary.chased_recovered_pence)} after automatic reminders` : 'card, bank transfer and cash'),
      stat('Quotes waiting', pounds(summary.quotes_open_pence), `${summary.quotes_open_count} sent, not answered yet`)),
    summary.card_payments_live ? null : h('div', { class: 'why small', style: { marginBottom: '14px' } }, h('b', 'Card payments: '), 'customers see a “Pay by card” button once Stripe is connected (add STRIPE_SECRET_KEY on the server). Until then invoices show your bank details', state.me.role !== 'member' ? [' – add them under ', h('a', { href: '#/invoices/settings' }, 'Settings'), '.'] : '.'),
    h('div', { class: 'tabs' }, [['invoices', 'Invoices'], ['quotes', 'Quotes'], ...(admin ? [['settings', 'Settings']] : [])].map(([k, l]) => h('a', { href: `#/invoices${k === 'invoices' ? '' : `/${k}`}`, class: tab === k ? 'active' : '' }, l))),
    body);
  if (sub && !['quotes', 'settings'].includes(sub)) documentDrawer(sub, reload);
  if (tab === 'settings') return renderSettings(body);
  return renderList(body, tab === 'quotes' ? 'quote' : 'invoice', route.query.status || '');
}

const stat = (label, value, sub, cls = '') => h('div', { class: `card kpi ${cls}` }, h('div', { class: 'label' }, label), h('div', { class: `value ${cls ? '' : 'blue'}` }, value), h('div', { class: 'sub' }, sub));

async function renderList(el, kind, status) {
  const rows = await get(`/invoices?kind=${kind}${status ? `&status=${status}` : ''}`);
  const filters = kind === 'invoice'
    ? [['', 'All'], ['draft', 'Drafts'], ['sent', 'Sent'], ['overdue', 'Overdue'], ['part_paid', 'Part paid'], ['paid', 'Paid']]
    : [['', 'All'], ['draft', 'Drafts'], ['sent', 'Waiting'], ['accepted', 'Accepted'], ['converted', 'Invoiced'], ['declined', 'Declined']];
  const base = kind === 'quote' ? '#/invoices/quotes' : '#/invoices';
  mount(el,
    h('div', { class: 'row', style: { marginBottom: '12px', gap: '6px' } }, filters.map(([k, l]) => h('a', { class: `chip ${status === k ? 'active' : ''}`, href: `${base}${k ? `?status=${k}` : ''}` }, l))),
    h('div', { class: 'card', style: { overflow: 'hidden' } }, rows.length ? h('div', { class: 'card-body', style: { padding: 0 } }, h('table', { class: 'table' },
      h('thead', h('tr', ['Number', 'Customer', 'For', 'Issued', kind === 'quote' ? 'Valid until' : 'Due', 'Total', 'Status', kind === 'invoice' ? 'Chasing' : ''].map((t) => h('th', t)))),
      h('tbody', rows.map((r) => h('tr', { onclick: () => { location.hash = `#/invoices/${r.id}`; } },
        h('td', h('b', r.number), r.purpose === 'deposit' ? h('div', { class: 'small muted' }, 'Deposit') : null),
        h('td', [r.first_name, r.last_name].filter(Boolean).join(' ') || '–', r.company ? h('div', { class: 'small muted' }, r.company) : null),
        h('td', { class: 'muted' }, r.title || '–'),
        h('td', date(r.issue_date)),
        h('td', r.due_date ? date(r.due_date) : '–'),
        h('td', h('b', { class: 'blue' }, pounds(r.total_pence)), r.paid_pence && r.paid_pence < r.total_pence ? h('div', { class: 'small muted' }, `${pounds(r.total_pence - r.paid_pence)} left`) : null),
        h('td', badge(r.status)),
        h('td', { class: 'small muted' }, kind === 'invoice' && ['sent', 'overdue', 'part_paid'].includes(r.status) ? CHASE[Math.min(3, r.reminders_sent)] : ''))))))
      : h('div', { class: 'empty' }, kind === 'quote' ? 'No quotes yet. Create one here, from a deal in the CRM, or from a WhatsApp conversation.' : 'No invoices yet. They’re drafted automatically when a job is marked done, or you can create one here.')));
}

// ───────────────────────── Document drawer ─────────────────────────

export async function documentDrawer(docId, reload) {
  document.querySelector('.drawer')?.remove();
  let d;
  try { d = await get(`/invoices/${docId}`); } catch (err) { showError(err); return; }
  const close = () => { drawer.remove(); if (location.hash.startsWith(`#/invoices/${docId}`)) history.replaceState(null, '', d.kind === 'quote' ? '#/invoices/quotes' : '#/invoices'); };
  const refresh = () => { documentDrawer(docId, reload); reload?.(); };
  const run = async (fn, msg) => { try { const res = await fn(); if (res?.automations) announce(res.automations); if (msg) toast(typeof msg === 'function' ? msg(res) : msg); refresh(); return res; } catch (err) { showError(err); return null; } };
  const customer = [d.first_name, d.last_name].filter(Boolean).join(' ');
  const open = !['void', 'paid', 'converted', 'declined'].includes(d.status);
  const editable = ['draft', 'sent'].includes(d.status) && !d.paid_pence;
  const viewLink = d.link.slice(d.link.indexOf('#'));
  const drawer = h('div', { class: 'drawer' },
    h('div', { class: 'modal-head' }, h('div', h('div', { class: 'eyebrow' }, `${d.purpose === 'deposit' ? 'Deposit ' : ''}${titleCase(d.kind)} ${d.number}`), h('h2', d.title || customer || d.number)), h('button', { class: 'icon-btn', onclick: close }, icon('x'))),
    h('div', { class: 'modal-body' },
      h('div', { class: 'row' }, badge(d.status),
        d.kind === 'invoice' && ['sent', 'overdue', 'part_paid'].includes(d.status) ? h('span', { class: 'badge' }, d.chase ? CHASE[Math.min(3, d.reminders_sent)] : 'Chasing paused') : null,
        d.accepted_by ? h('span', { class: 'badge green' }, `Accepted by ${d.accepted_by}`) : null),
      h('div', { class: 'grid g2 small' },
        h('div', h('div', { class: 'muted' }, 'Customer'), d.contact_id ? h('a', { href: `#/messages/${d.contact_id}` }, customer || 'Customer') : '–'),
        h('div', h('div', { class: 'muted' }, d.kind === 'quote' ? 'Valid until' : 'Due'), d.due_date ? date(d.due_date, { day: 'numeric', month: 'short', year: 'numeric' }) : '–'),
        h('div', h('div', { class: 'muted' }, 'Sent'), d.sent_at ? dateTime(d.sent_at) : 'Not yet'),
        h('div', h('div', { class: 'muted' }, 'Deal'), d.deal_title || '–')),
      linesTable(d),
      d.notes ? h('div', { class: 'pre small' }, d.notes) : null,
      h('div', { class: 'row' },
        open && d.status !== 'accepted' ? h('button', { class: 'btn sm primary', onclick: () => sendModal(d, run) }, icon('send'), d.status === 'draft' ? `Send ${d.kind}` : 'Send again') : null,
        d.status !== 'draft' ? h('button', { class: 'btn sm', onclick: () => copyText(d.link, 'Customer link copied') }, icon('link'), 'Copy link') : null,
        d.status !== 'draft' ? h('a', { class: 'btn sm', href: viewLink, target: '_blank' }, 'Customer view') : null,
        editable ? h('button', { class: 'btn sm', onclick: () => documentModal({ doc: d, onDone: refresh }) }, icon('edit'), 'Edit') : null),
      d.kind === 'quote' && ['sent', 'draft', 'accepted'].includes(d.status) ? h('div', { class: 'row' },
        d.status !== 'accepted' ? h('button', { class: 'btn sm soft', onclick: () => run(() => post(`/invoices/${d.id}/accept`, { name: 'Accepted by phone' }), 'Marked accepted – deal moved to Won') }, 'Mark accepted') : null,
        h('button', { class: 'btn sm primary', onclick: async () => { const inv = await run(() => post(`/invoices/${d.id}/convert`)); if (inv) { toast(`Invoice ${inv.number} drafted from this quote`); location.hash = `#/invoices/${inv.id}`; } } }, icon('receipt'), 'Turn into invoice'),
        d.status !== 'accepted' ? h('button', { class: 'btn sm ghost', onclick: () => run(() => post(`/invoices/${d.id}/decline`, { reason: 'Marked declined by the team' }), 'Marked declined') }, 'Mark declined') : null) : null,
      d.converted_invoice_id ? h('a', { class: 'btn sm soft', href: `#/invoices/${d.converted_invoice_id}` }, 'Open the invoice') : null,
      d.kind === 'invoice' && ['sent', 'overdue', 'part_paid'].includes(d.status) ? h('div', { class: 'row' },
        h('button', { class: 'btn sm primary', onclick: () => paymentModal(d, run) }, icon('pound'), 'Record a payment'),
        h('button', { class: 'btn sm', onclick: async () => { try { const r = await post(`/invoices/${d.id}/pay-link`); if (r.url) copyText(r.url, 'Card payment link copied'); else if (r.demo) copyText(d.link, 'Test build: the customer view has a test “Pay by card” button – link copied'); else toast(r.error, 'error'); } catch (err) { showError(err); } } }, 'Card payment link'),
        h('button', { class: 'btn sm ghost', onclick: () => run(() => post(`/invoices/${d.id}/chase`, { chase: !d.chase }), d.chase ? 'Chasing paused for this invoice' : 'Chasing switched back on') }, d.chase ? 'Pause chasing' : 'Resume chasing')) : null,
      open && !d.paid_pence && state.me.role !== 'member' ? h('button', { class: 'btn sm ghost danger', onclick: async () => { if (await confirmDialog(`Void ${d.number}? It stays on record but can’t be paid or chased.`, 'Void')) run(() => post(`/invoices/${d.id}/void`), 'Voided'); } }, 'Void') : null,
      d.payments.length ? h('div', h('h3', { style: { marginBottom: '6px' } }, 'Payments'), d.payments.map((p) => h('div', { class: 'list-item' },
        h('div', { class: 'grow' }, h('b', pounds(p.amount_pence)), h('div', { class: 'small muted' }, `${titleCase(p.method)} · ${dateTime(p.created_at)}${p.reference ? ` · ${p.reference}` : ''}${p.recorded_by ? ` · ${p.recorded_by}` : ''}`))))) : null,
      d.messages.length ? h('div', h('h3', { style: { marginBottom: '6px' } }, 'Sent to the customer'), d.messages.map((m) => h('div', { class: 'small list-item' },
        h('div', { class: 'grow' }, `${{ quote_sent: 'Quote', invoice_sent: 'Invoice', deposit_request: 'Deposit request', invoice_reminder_1: 'Friendly reminder', invoice_reminder_2: 'Firmer reminder', invoice_paid_thanks: 'Payment thank-you' }[m.template_key] || 'Message'} by ${CHANNEL_LABELS[m.channel]}`),
        h('span', { class: 'muted' }, `${dateTime(m.created_at)}${m.status === 'demo' ? ' · demo' : ''}`)))) : null));
  document.body.append(drawer);
}

function linesTable(d) {
  const vat = d.vat_pence > 0;
  return h('div', { class: 'card', style: { overflow: 'hidden', boxShadow: 'none' } }, h('table', { class: 'table lines' },
    h('thead', h('tr', h('th', 'Item'), h('th', 'Qty'), h('th', 'Price'), vat ? h('th', 'VAT') : null, h('th', { style: { textAlign: 'right' } }, 'Total'))),
    h('tbody',
      d.line_items.map((l) => h('tr', { style: { cursor: 'default' } }, h('td', l.description), h('td', l.quantity), h('td', pounds(l.unit_pence)), vat ? h('td', `${l.vat_rate}%`) : null, h('td', { style: { textAlign: 'right' } }, pounds(l.total_pence)))),
      vat ? h('tr', { class: 'sum' }, h('td', { colSpan: vat ? 4 : 3 }, 'Subtotal'), h('td', { style: { textAlign: 'right' } }, pounds(d.subtotal_pence))) : null,
      vat ? h('tr', { class: 'sum' }, h('td', { colSpan: 4 }, 'VAT'), h('td', { style: { textAlign: 'right' } }, pounds(d.vat_pence))) : null,
      h('tr', { class: 'sum total' }, h('td', { colSpan: vat ? 4 : 3 }, 'Total'), h('td', { style: { textAlign: 'right' } }, pounds(d.total_pence))),
      d.paid_pence ? h('tr', { class: 'sum' }, h('td', { colSpan: vat ? 4 : 3 }, 'Still to pay'), h('td', { style: { textAlign: 'right' } }, pounds(d.balance_pence))) : null)));
}

function sendModal(d, run) {
  const body = h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, `${d.first_name || 'The customer'} gets a link to view${d.kind === 'quote' ? ' and accept the quote online' : ' and pay the invoice'}.`),
    field('Send by', select('channel', [['auto', 'Best way for this customer'], ['whatsapp', 'WhatsApp'], ['sms', 'Text message'], ['email', 'Email']])));
  modal(`Send ${d.kind} ${d.number}`, body, { actions: [{ label: 'Cancel' }, { label: 'Send', primary: true, onClick: () => run(() => post(`/invoices/${d.id}/send`, formData(body)), (r) => `Sent by ${CHANNEL_LABELS[r.message.channel]}${r.message.status === 'demo' ? ' (demo mode – saved, not actually sent)' : ''}`) }] });
}

function paymentModal(d, run) {
  const body = h('div', { class: 'stack' },
    h('div', { class: 'grid g2' },
      field('Amount (£)', h('input', { name: 'amount', type: 'number', step: '0.01', min: '0.01', value: (d.balance_pence / 100).toFixed(2) })),
      field('How', select('method', [['bank_transfer', 'Bank transfer'], ['cash', 'Cash'], ['other', 'Other']]))),
    field('Reference (optional)', h('input', { name: 'reference' })),
    h('p', { class: 'small muted' }, 'Card payments made online are recorded automatically.'));
  modal(`Record a payment for ${d.number}`, body, { actions: [{ label: 'Cancel' }, { label: 'Record payment', primary: true, onClick: () => {
    const f = formData(body);
    return run(() => post(`/invoices/${d.id}/payments`, { amount_pence: toPence(f.amount), method: f.method, reference: f.reference }), (r) => (r.doc.status === 'paid' ? 'Paid in full – thank-you sent to the customer' : 'Payment recorded'));
  } }] });
}

// ───────────────────────── Create / edit ─────────────────────────

export async function documentModal({ kind = 'invoice', contact_id = null, doc = null, onDone } = {}) {
  const [contacts, settings] = await Promise.all([get('/crm/contacts'), get('/invoices/settings')]);
  const k = doc?.kind || kind;
  const vat = settings.vat_registered;
  const lines = h('div', { class: 'stack', style: { gap: '6px' } });
  const totals = h('div', { class: 'doc-totals' });
  const addLine = (l = {}) => {
    const row = h('div', { class: `line-row ${vat ? 'vat' : ''}` },
      h('input', { class: 'desc', placeholder: 'Description (e.g. Labour – 3 hours)', value: l.description || '' }),
      h('input', { class: 'qty', type: 'number', step: 'any', min: 0, value: l.quantity ?? 1, title: 'Quantity' }),
      h('input', { class: 'unit', type: 'number', step: '0.01', placeholder: '£', value: l.unit_pence != null ? (l.unit_pence / 100).toFixed(2) : '', title: 'Price each (£)' }),
      vat ? h('input', { class: 'rate', type: 'number', step: 'any', min: 0, value: l.vat_rate ?? settings.vat_rate, title: 'VAT %' }) : null,
      h('button', { class: 'icon-btn', type: 'button', title: 'Remove line', onclick: () => { row.remove(); recalc(); } }, icon('x')));
    row.addEventListener('input', recalc);
    lines.append(row);
  };
  const read = () => [...lines.querySelectorAll('.line-row')].map((r) => ({
    description: r.querySelector('.desc').value, quantity: Number(r.querySelector('.qty').value || 0), unit_pence: toPence(r.querySelector('.unit').value),
    ...(vat ? { vat_rate: Number(r.querySelector('.rate').value || 0) } : {}),
  })).filter((l) => l.description.trim());
  const recalc = () => {
    const items = read();
    const sub = items.reduce((s, l) => s + Math.round(l.quantity * l.unit_pence), 0);
    const v = vat ? items.reduce((s, l) => s + Math.round((Math.round(l.quantity * l.unit_pence) * (l.vat_rate || 0)) / 100), 0) : 0;
    mount(totals, vat ? h('div', `Subtotal ${pounds(sub)} · VAT ${pounds(v)}`) : null, h('b', `Total ${pounds(sub + v)}`));
  };
  (doc?.line_items?.length ? doc.line_items : [{}]).forEach(addLine);
  recalc();
  const body = h('div', { class: 'stack' },
    field('Customer', select('contact_id', [['', '— Choose —'], ...contacts.map((c) => [c.id, `${c.first_name} ${c.last_name || ''}${c.company ? ` (${c.company})` : ''}`])], doc?.contact_id || contact_id || '')),
    field('Title', h('input', { name: 'title', value: doc?.title || '', placeholder: k === 'quote' ? 'e.g. New combi boiler – supply & fit' : 'e.g. Kitchen tap replacement' })),
    h('div', h('div', { class: `line-row head ${vat ? 'vat' : ''}` }, h('span', 'Item'), h('span', 'Qty'), h('span', 'Price £'), vat ? h('span', 'VAT %') : null, h('span')), lines,
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { addLine(); } }, icon('plus'), 'Add line')),
    totals,
    field(k === 'quote' ? 'Valid until' : 'Due date', h('input', { type: 'date', name: 'due_date', value: doc?.due_date || '' }), { help: doc ? '' : `Leave blank for ${k === 'quote' ? `${settings.quote_valid_days} days` : `${settings.payment_terms_days} days`} from today.` }),
    field('Notes for the customer', h('textarea', { name: 'notes', value: doc?.notes || '', style: { minHeight: '60px' }, placeholder: k === 'quote' ? 'e.g. Includes parts and labour. 12-month guarantee on workmanship.' : '' })),
    vat ? null : h('p', { class: 'small muted' }, 'Not VAT registered – change this in Quotes & invoices → Settings.'));
  const save = async (send) => {
    const f = formData(body);
    const payload = { title: f.title, contact_id: f.contact_id || undefined, line_items: read(), notes: f.notes, due_date: f.due_date || undefined };
    const saved = doc ? await patch(`/invoices/${doc.id}`, payload) : await post('/invoices', { ...payload, kind: k });
    if (send) {
      const res = await post(`/invoices/${saved.id}/send`, { channel: 'auto' });
      toast(`${titleCase(k)} ${saved.number} sent by ${CHANNEL_LABELS[res.message.channel]}${res.message.status === 'demo' ? ' (demo mode)' : ''}`);
    } else toast(`${titleCase(k)} ${saved.number} saved`);
    onDone?.();
    location.hash = `#/invoices/${saved.id}`;
  };
  modal(doc ? `Edit ${doc.number}` : `New ${k}`, body, { wide: true, actions: [{ label: 'Cancel' }, { label: 'Save draft', onClick: () => save(false) }, { label: doc?.status === 'sent' ? 'Save' : 'Save & send', primary: true, onClick: () => save(doc?.status !== 'sent') }] });
}

// ───────────────────────── Settings ─────────────────────────

async function renderSettings(el) {
  const s = await get('/invoices/settings');
  const check = (name, checked, label) => h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name, checked, style: { width: 'auto' } }), label);
  const form = h('div', { class: 'grid g2', style: { alignItems: 'start' } },
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Your ', h('span', { class: 'blue' }, 'details')),
      field('Business address (shown on quotes and invoices)', h('textarea', { name: 'address', value: s.address, style: { minHeight: '60px' } })),
      h('div', { class: 'grid g2' }, field('Company number', h('input', { name: 'company_number', value: s.company_number })), field('Invoice footer', h('input', { name: 'footer', value: s.footer }))),
      check('vat_registered', s.vat_registered, 'VAT registered'),
      h('div', { class: 'grid g2' }, field('VAT number', h('input', { name: 'vat_number', value: s.vat_number })), field('Standard VAT rate %', h('input', { name: 'vat_rate', type: 'number', value: s.vat_rate }))),
      h('div', { class: 'grid g2' }, field('Invoice numbers start with', h('input', { name: 'invoice_prefix', value: s.invoice_prefix })), field('Quote numbers start with', h('input', { name: 'quote_prefix', value: s.quote_prefix })))),
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Getting ', h('span', { class: 'blue' }, 'paid')),
      check('card_payments', s.card_payments, 'Show a “Pay by card” button (needs Stripe on the server)'),
      h('div', { class: 'grid g2' }, field('Bank name', h('input', { name: 'bank_name', value: s.bank_name })), field('Account name', h('input', { name: 'account_name', value: s.account_name }))),
      h('div', { class: 'grid g2' }, field('Sort code', h('input', { name: 'sort_code', value: s.sort_code, placeholder: '12-34-56' })), field('Account number', h('input', { name: 'account_number', value: s.account_number, placeholder: '12345678' }))),
      h('div', { class: 'grid g2' }, field('Payment terms (days)', h('input', { name: 'payment_terms_days', type: 'number', value: s.payment_terms_days })), field('Quotes valid for (days)', h('input', { name: 'quote_valid_days', type: 'number', value: s.quote_valid_days })))),
    h('div', { class: 'card card-pad stack span2' },
      h('h3', 'Automatic ', h('span', { class: 'blue' }, 'chasing')),
      check('chase_enabled', s.chase_enabled, 'Chase overdue invoices automatically'),
      h('div', { class: 'grid g4' },
        field('Friendly reminder (days after due)', h('input', { name: 'chase_0', type: 'number', value: s.chase_days[0] })),
        field('Firmer reminder', h('input', { name: 'chase_1', type: 'number', value: s.chase_days[1] })),
        field('Task for a person to call', h('input', { name: 'chase_2', type: 'number', value: s.chase_days[2] })),
        field('Follow up unanswered quotes after (days)', h('input', { name: 'quote_follow_up_days', type: 'number', value: s.quote_follow_up_days }))),
      h('p', { class: 'small muted' }, 'Reminders use the wording in Settings → Message wording, and go by WhatsApp, text or email – whichever suits the customer.')));
  mount(el, form, h('div', { class: 'row', style: { marginTop: '16px', justifyContent: 'flex-end' } }, h('button', { class: 'btn primary', onclick: async () => {
    const f = formData(form);
    const payload = { ...f, vat_rate: Number(f.vat_rate), payment_terms_days: Number(f.payment_terms_days), quote_valid_days: Number(f.quote_valid_days), quote_follow_up_days: Number(f.quote_follow_up_days), chase_days: [Number(f.chase_0), Number(f.chase_1), Number(f.chase_2)] };
    delete payload.chase_0; delete payload.chase_1; delete payload.chase_2;
    try { await put('/invoices/settings', payload); toast('Saved'); } catch (err) { showError(err); }
  } }, 'Save settings')));
}

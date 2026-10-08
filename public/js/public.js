import { get, post } from './api.js';
import { applyBrandColor, field, h, icon, mount, paybackLabel, pounds, showError, toast } from './ui.js';

/**
 * Pages customers open from a link, without signing in: the booking page,
 * their own booking, lead forms, quotes & invoices, proposals and reports.
 * Each one wears the business's own name, logo and colour.
 */
export const PUBLIC_PAGES = ['book', 'booking', 'form', 'doc', 'proposal', 'report'];

export async function renderPublic(root, route) {
  const [page, key] = route.parts;
  document.body.classList.add('public');
  const embed = route.query.embed === '1';
  const shell = h('div', { class: `pub ${embed ? 'embed' : ''}` }, h('div', { class: 'pub-loading' }, 'Loading…'));
  mount(root, shell);
  try {
    if (page === 'book') return await bookPage(shell, key);
    if (page === 'booking') return await bookingPage(shell, key, route.query);
    if (page === 'form') return await formPage(shell, key, embed);
    if (page === 'doc') return await docPage(shell, key, route.query);
    if (page === 'proposal') return await proposalPage(shell, key);
    if (page === 'report') return await reportPage(shell, key);
  } catch (err) {
    mount(shell, h('div', { class: 'pub-card pub-empty' }, h('h2', 'This link isn’t working'), h('p', err.status === 404 ? 'It may have expired or been replaced. Please contact the business that sent it.' : err.message)));
  }
  return null;
}

/** Header with the business's logo and quick ways to get in touch. */
function header(b) {
  applyBrandColor(b.color);
  document.title = b.name;
  return h('header', { class: 'pub-head' },
    b.logo ? h('img', { src: b.logo, alt: b.name, class: 'pub-logo' }) : h('div', { class: 'pub-mark' }, b.name.slice(0, 2).toUpperCase()),
    h('div', { class: 'pub-name' }, b.name),
    h('div', { class: 'row', style: { marginLeft: 'auto', gap: '6px' } },
      b.phone_link ? h('a', { class: 'btn sm', href: b.phone_link }, icon('phone'), h('span', { class: 'hide-sm' }, b.phone)) : null,
      b.whatsapp_link ? h('a', { class: 'btn sm', href: b.whatsapp_link, target: '_blank', rel: 'noopener' }, icon('whatsapp'), h('span', { class: 'hide-sm' }, 'WhatsApp')) : null));
}
const footer = (b) => (b.powered_by ? h('footer', { class: 'pub-foot' }, `Powered by ${b.powered_by}`) : null);
const check = (name, label, checked = false) => h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600, alignItems: 'flex-start' } }, h('input', { type: 'checkbox', name, checked, style: { width: 'auto', marginTop: '2px' } }), h('span', label));
const honeypot = () => h('input', { name: 'website', tabIndex: -1, autocomplete: 'off', class: 'hp', 'aria-hidden': 'true' });
const read = (el) => Object.fromEntries([...el.querySelectorAll('[name]')].map((i) => [i.name, i.type === 'checkbox' ? i.checked : i.value]));

// ───────────────────────── Booking page ─────────────────────────

async function bookPage(shell, slug) {
  const page = await get(`/public/book/${slug}`);
  const b = page.business;
  const state = { service: null, date: null, slot: null };
  const steps = h('div', { class: 'pub-card stack' });
  mount(shell, header(b), h('main', { class: 'pub-main' },
    h('h1', 'Book with ', h('span', { class: 'blue' }, b.name)),
    page.intro ? h('p', { class: 'muted' }, page.intro) : null,
    page.emergency_note ? h('div', { class: 'pub-emergency' }, icon('alert'), h('div', page.emergency_note, h('div', { class: 'row', style: { marginTop: '8px', gap: '6px' } },
      b.phone_link ? h('a', { class: 'btn sm primary', href: b.phone_link }, icon('phone'), `Call ${b.phone}`) : null,
      b.whatsapp_link ? h('a', { class: 'btn sm', href: b.whatsapp_link, target: '_blank', rel: 'noopener' }, icon('whatsapp'), 'WhatsApp us') : null))) : null,
    steps), footer(b));

  const chooseService = () => {
    mount(steps, h('h2', '1. What do you need?'),
      page.services.length ? h('div', { class: 'stack', style: { gap: '8px' } }, page.services.map((s) => h('button', { class: 'pub-option', onclick: () => { state.service = s; chooseDay(); } },
        h('div', { class: 'grow' }, h('b', s.name), s.description ? h('div', { class: 'small muted' }, s.description) : null, h('div', { class: 'small muted' }, `${s.duration_min >= 60 ? `${Math.round((s.duration_min / 60) * 10) / 10} hour${s.duration_min === 60 ? '' : 's'}` : `${s.duration_min} min`}${s.deposit ? ` · ${s.deposit} deposit to book` : ''}`)),
        h('b', { class: 'blue' }, s.price || 'Free quote'))))
        : h('p', { class: 'muted' }, 'Online booking isn’t available right now – please call or message us.'));
  };

  const chooseDay = async () => {
    mount(steps, h('div', { class: 'muted small' }, 'Loading available days…'));
    const days = await get(`/public/book/${slug}/days?service=${state.service.id}&days=21`);
    const open = days.filter((d) => d.slots > 0);
    mount(steps, back(chooseService, state.service.name), h('h2', '2. Pick a day'),
      open.length ? h('div', { class: 'day-grid' }, days.filter((d) => d.open).map((d) => h('button', { class: 'pub-day', disabled: !d.slots, onclick: () => { state.date = d; chooseTime(); } }, h('b', d.label), h('span', { class: 'small' }, d.slots ? `${d.slots} time${d.slots === 1 ? '' : 's'}` : 'Full'))))
        : h('p', { class: 'muted' }, 'No free times in the next few weeks – please call or message us and we’ll fit you in.'));
  };

  const chooseTime = async () => {
    const slots = await get(`/public/book/${slug}/slots?service=${state.service.id}&date=${state.date.date}`);
    mount(steps, back(chooseDay, `${state.service.name} · ${state.date.label}`), h('h2', '3. Pick a time'),
      slots.length ? h('div', { class: 'slot-grid' }, slots.map((s) => h('button', { class: 'pub-slot', onclick: () => { state.slot = s; details(); } }, s.label)))
        : h('p', { class: 'muted' }, 'That day has just filled up – please pick another.'));
  };

  const details = () => {
    const form = h('div', { class: 'stack' },
      h('div', { class: 'grid g2' }, field('First name', h('input', { name: 'first_name', autocomplete: 'given-name', required: true }), { required: true }), field('Last name', h('input', { name: 'last_name', autocomplete: 'family-name' }))),
      h('div', { class: 'grid g2' }, field('Mobile', h('input', { name: 'phone', type: 'tel', autocomplete: 'tel', placeholder: '07700 900123' }), { required: true }), field('Email', h('input', { name: 'email', type: 'email', autocomplete: 'email' }))),
      page.require_address ? h('div', { class: 'grid g2' }, field('Address', h('input', { name: 'address', autocomplete: 'street-address' }), { required: true }), field('Postcode', h('input', { name: 'postcode', autocomplete: 'postal-code' }), { required: true })) : null,
      field(page.require_address ? 'What’s the problem? (helps us bring the right parts)' : 'Anything we should know?', h('textarea', { name: 'notes', style: { minHeight: '70px' } })),
      check('whatsapp_opt_in', 'Send my confirmation and reminders on WhatsApp', true),
      honeypot());
    const submit = h('button', { class: 'btn primary', onclick: async () => {
      const d = read(form);
      if (!d.first_name || !(d.phone || d.email)) return toast('Please add your name and a mobile number or email', 'error');
      submit.disabled = true;
      try {
        const res = await post(`/public/book/${slug}`, { ...d, service_id: state.service.id, starts_at: state.slot.starts_at, preferred_channel: d.whatsapp_opt_in ? 'whatsapp' : 'auto' });
        if (res.deposit_token) { location.hash = `#/doc/${res.deposit_token}?booking=${res.token}`; return; }
        location.hash = `#/booking/${res.token}?new=1`;
      } catch (err) { showError(err); submit.disabled = false; if (/taken|available/i.test(err.message)) chooseTime(); }
    } }, state.service.deposit ? `Continue to pay ${state.service.deposit} deposit` : 'Confirm booking');
    mount(steps, back(chooseTime, `${state.service.name} · ${state.date.label} at ${state.slot.label}`), h('h2', '4. Your details'), form, submit,
      h('p', { class: 'small muted' }, 'We’ll only use your details for this booking. Reply STOP to any text to opt out.'));
  };

  const back = (fn, summary) => h('div', { class: 'row pub-back' }, h('button', { class: 'btn sm ghost', onclick: fn }, '‹ Back'), h('span', { class: 'small muted' }, summary));
  chooseService();
}

// ───────────────────────── The customer's booking ─────────────────────────

async function bookingPage(shell, token, query) {
  const bk = await get(`/public/booking/${token}`);
  const b = bk.business;
  const reload = () => bookingPage(shell, token, {});
  const act = async (action, body = {}) => {
    try { await post(`/public/booking/${token}/${action}`, body); toast(action === 'cancel' ? 'Booking cancelled' : action === 'reschedule' ? 'Booking moved – see you then!' : 'Thanks – you’re confirmed'); reload(); } catch (err) { showError(err); }
  };
  const active = ['requested', 'confirmed', 'on_the_way'].includes(bk.status);
  const panel = h('div');
  const statusLine = {
    requested: bk.deposit_link ? 'Waiting for your deposit' : 'Request received – we’ll confirm shortly', confirmed: 'Booked', on_the_way: `${bk.staff || 'We’re'} on the way`,
    completed: 'Done – thank you!', cancelled: 'Cancelled', no_show: 'Missed',
  }[bk.status];
  mount(shell, header(b), h('main', { class: 'pub-main' },
    query.new ? h('div', { class: 'pub-success' }, icon('tick'), h('div', h('b', bk.status === 'confirmed' ? 'You’re booked in!' : 'Thanks – we’ve got your request.'), h('div', { class: 'small' }, 'We’ve sent you a confirmation. Save this page to manage your booking.'))) : null,
    h('div', { class: 'pub-card stack' },
      h('div', { class: 'eyebrow' }, statusLine),
      h('h1', bk.service),
      h('div', { class: 'pub-when' }, icon('calendar'), h('b', `${bk.date} at ${bk.time}`)),
      bk.address ? h('div', { class: 'pub-when' }, icon('pin'), bk.address) : null,
      bk.deposit_link ? h('a', { class: 'btn primary', href: `#/doc/${bk.deposit_link}?booking=${token}` }, `Pay ${pounds(bk.deposit_pence)} deposit to secure it`) : null,
      active ? h('div', { class: 'row' },
        !bk.confirmed_by_customer ? h('button', { class: 'btn primary', onclick: () => act('confirm') }, icon('tick'), 'Confirm I’ll be there') : h('span', { class: 'badge green' }, '✓ You’ve confirmed'),
        bk.can_change ? h('button', { class: 'btn', onclick: () => movePanel(panel, token, act) }, 'Change time') : null,
        bk.can_change ? h('button', { class: 'btn ghost danger', onclick: () => cancelPanel(panel, act) }, 'Cancel') : null) : null,
      active && !bk.can_change ? h('p', { class: 'small muted' }, `It’s less than ${bk.cancel_notice_hours} hours to go – to change or cancel, please call or message us.`) : null,
      active ? addToCalendar(bk) : null,
      panel),
    h('p', { class: 'small muted', style: { textAlign: 'center' } }, 'Questions? Just reply to our message, or call or WhatsApp us.')), footer(b));
}

/** "Add to calendar" for the customer: Google Calendar, or a file for iPhone/Outlook. */
function addToCalendar(bk) {
  const stamp = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const title = `${bk.service} – ${bk.business.name}`;
  const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${stamp(bk.starts_at)}/${stamp(bk.ends_at)}`, location: bk.address || '', details: `Booked with ${bk.business.name}${bk.business.phone ? ` – ${bk.business.phone}` : ''}` })}`;
  const esc = (v) => String(v).replace(/([,;\\])/g, '\\$1');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CM Automations//Booking//EN', 'BEGIN:VEVENT', `UID:${stamp(bk.starts_at)}-${Math.random().toString(36).slice(2)}@cmautomations`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(bk.starts_at)}`, `DTEND:${stamp(bk.ends_at)}`, `SUMMARY:${esc(title)}`, bk.address ? `LOCATION:${esc(bk.address)}` : null, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  return h('div', { class: 'row' },
    h('a', { class: 'btn sm', href: google, target: '_blank', rel: 'noopener' }, icon('calendar'), 'Add to Google Calendar'),
    h('a', { class: 'btn sm', href: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`, download: 'booking.ics' }, icon('calendar'), 'iPhone / Outlook'));
}

async function movePanel(panel, token, act) {
  const days = await get(`/public/booking/${token}/slots`);
  const times = h('div');
  mount(panel, h('h3', 'Pick a new day'), h('div', { class: 'day-grid' }, days.filter((d) => d.open).map((d) => h('button', { class: 'pub-day', disabled: !d.slots, onclick: async () => {
    const slots = await get(`/public/booking/${token}/slots?date=${d.date}`);
    mount(times, h('h3', d.label), h('div', { class: 'slot-grid' }, slots.map((s) => h('button', { class: 'pub-slot', onclick: () => act('reschedule', { starts_at: s.starts_at }) }, s.label))));
  } }, h('b', d.label), h('span', { class: 'small' }, d.slots ? `${d.slots} times` : 'Full')))), times);
}

function cancelPanel(panel, act) {
  const reason = h('input', { placeholder: 'Reason (optional)' });
  mount(panel, h('div', { class: 'stack' }, h('h3', 'Cancel this booking?'), reason, h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => act('cancel', { reason: reason.value }) }, 'Yes, cancel'), h('button', { class: 'btn', onclick: () => mount(panel) }, 'Keep it'))));
}

// ───────────────────────── Lead forms ─────────────────────────

async function formPage(shell, id, embed) {
  const form = await get(`/public/form/${id}`);
  const b = form.business;
  const fields = h('div', { class: 'stack' }, form.fields.map((f) => {
    const opts = { name: f.key, placeholder: f.placeholder || '', required: f.required };
    let input;
    if (f.type === 'textarea') input = h('textarea', opts);
    else if (f.type === 'select') input = h('select', { name: f.key }, h('option', { value: '' }, 'Choose…'), f.options.map((o) => h('option', { value: o }, o)));
    else if (f.type === 'checkbox') return check(f.key, f.label);
    else input = h('input', { ...opts, type: f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text', autocomplete: { first_name: 'given-name', last_name: 'family-name', email: 'email', phone: 'tel', postcode: 'postal-code' }[f.key] || 'on' });
    return field(f.label, input, { required: f.required });
  }), honeypot());
  const card = h('div', { class: 'pub-card stack' }, h('h1', form.title), form.intro ? h('p', { class: 'muted' }, form.intro) : null, fields);
  const submit = h('button', { class: 'btn primary', onclick: async () => {
    submit.disabled = true;
    try {
      const res = await post(`/public/form/${id}`, read(fields));
      mount(card, h('div', { class: 'pub-success' }, icon('tick'), h('div', h('b', 'Sent!'), h('div', res.message))));
    } catch (err) { showError(err); submit.disabled = false; }
  } }, form.button_label);
  card.append(submit);
  mount(shell, embed ? null : header(b), h('main', { class: 'pub-main' }, card), embed ? null : footer(b));
}

// ───────────────────────── Quotes & invoices ─────────────────────────

async function docPage(shell, token, query) {
  const d = await get(`/public/doc/${token}`);
  const b = d.business;
  const reload = () => docPage(shell, token, {});
  const isQuote = d.kind === 'quote';
  const vat = d.vat_pence > 0;
  const actions = h('div', { class: 'stack' });
  const title = isQuote ? 'Quote' : d.purpose === 'deposit' ? 'Deposit' : 'Invoice';
  if (query.paid === '1' && d.status !== 'paid') toast('Thanks – your payment is being confirmed');

  if (isQuote && d.status === 'sent') {
    const name = h('input', { placeholder: 'Your full name' });
    mount(actions, h('h3', 'Happy to go ahead?'), field('Type your name to accept', name),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: async () => { if (!name.value.trim()) return toast('Please type your name', 'error'); try { await post(`/public/doc/${token}/accept`, { name: name.value }); toast('Accepted – thank you! We’ll be in touch to book it in.'); reload(); } catch (err) { showError(err); } } }, icon('tick'), 'Accept quote'),
        h('button', { class: 'btn ghost', onclick: () => {
          const reason = h('input', { placeholder: 'Anything we could do differently? (optional)' });
          mount(actions, h('h3', 'Decline this quote'), reason, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { await post(`/public/doc/${token}/decline`, { reason: reason.value }); toast('Thanks for letting us know'); reload(); } }, 'Decline'), h('button', { class: 'btn ghost', onclick: reload }, 'Back')));
        } }, 'Decline')));
  } else if (!isQuote && d.balance_pence > 0 && !['void', 'paid'].includes(d.status)) {
    mount(actions, h('h3', `${pounds(d.balance_pence)} to pay`),
      d.card ? h('button', { class: 'btn primary pay-btn', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          const res = await post(`/public/doc/${token}/pay`, { return_url: location.href.replace(/[?&]paid=1/, '') });
          if (res.url) { location.href = res.url; return; }
          if (res.demo) { demoPay(token, d, query, reload); return; }
          toast(res.error || 'Card payment isn’t available – please pay by bank transfer', 'error');
        } catch (err) { showError(err); }
        e.currentTarget.disabled = false;
      } }, icon('pound'), `Pay ${pounds(d.balance_pence)} by card`) : null,
      d.bank ? h('div', { class: 'pub-bank' }, h('b', 'Or pay by bank transfer'),
        h('div', `Account name: ${d.bank.account_name}`), d.bank.bank_name ? h('div', `Bank: ${d.bank.bank_name}`) : null,
        h('div', `Sort code: ${d.bank.sort_code}`), h('div', `Account number: ${d.bank.account_number}`), h('div', `Reference: ${d.bank.reference}`)) : null);
  }

  const status = {
    sent: isQuote ? 'Waiting for your answer' : `Due ${fmtDate(d.due_date)}`, accepted: `Accepted${d.accepted_by ? ` by ${d.accepted_by}` : ''} – thank you`, declined: 'Declined',
    converted: 'Accepted – thank you', part_paid: `Part paid – ${pounds(d.balance_pence)} left`, paid: 'Paid – thank you!', overdue: `Overdue – was due ${fmtDate(d.due_date)}`, void: 'Cancelled',
  }[d.status];
  mount(shell, header(b), h('main', { class: 'pub-main wide' },
    query.booking && d.status === 'paid' ? h('a', { class: 'pub-success', href: `#/booking/${query.booking}?new=1` }, icon('tick'), h('div', h('b', 'Deposit paid – your booking is confirmed.'), h('div', { class: 'small' }, 'View your booking ›'))) : null,
    h('div', { class: 'pub-card doc' },
      h('div', { class: 'doc-head' },
        h('div', h('div', { class: 'eyebrow' }, status), h('h1', `${title} ${d.number}`), d.title ? h('div', { class: 'muted' }, d.title) : null),
        h('div', { class: 'doc-meta small' }, h('div', h('b', 'From: '), b.name), d.seller.address ? h('div', { style: { whiteSpace: 'pre-line' } }, d.seller.address) : null, d.seller.vat_number ? h('div', `VAT: ${d.seller.vat_number}`) : null, d.seller.company_number ? h('div', `Company no: ${d.seller.company_number}`) : null,
          h('div', { style: { marginTop: '6px' } }, h('b', 'For: '), d.customer.name || '–', d.customer.company ? ` (${d.customer.company})` : ''),
          h('div', `Issued ${fmtDate(d.issue_date)}${d.due_date ? ` · ${isQuote ? 'valid until' : 'due'} ${fmtDate(d.due_date)}` : ''}`))),
      h('table', { class: 'table lines' },
        h('thead', h('tr', h('th', 'Item'), h('th', 'Qty'), h('th', 'Price'), vat ? h('th', 'VAT') : null, h('th', { style: { textAlign: 'right' } }, 'Total'))),
        h('tbody',
          d.line_items.map((l) => h('tr', { style: { cursor: 'default' } }, h('td', l.description), h('td', l.quantity), h('td', pounds(l.unit_pence)), vat ? h('td', `${l.vat_rate}%`) : null, h('td', { style: { textAlign: 'right' } }, pounds(l.total_pence)))),
          vat ? h('tr', { class: 'sum' }, h('td', { colSpan: 4 }, 'Subtotal'), h('td', { style: { textAlign: 'right' } }, pounds(d.subtotal_pence))) : null,
          vat ? h('tr', { class: 'sum' }, h('td', { colSpan: 4 }, 'VAT'), h('td', { style: { textAlign: 'right' } }, pounds(d.vat_pence))) : null,
          h('tr', { class: 'sum total' }, h('td', { colSpan: vat ? 4 : 3 }, 'Total'), h('td', { style: { textAlign: 'right' } }, pounds(d.total_pence))),
          d.paid_pence ? h('tr', { class: 'sum' }, h('td', { colSpan: vat ? 4 : 3 }, 'Paid'), h('td', { style: { textAlign: 'right' } }, `-${pounds(d.paid_pence)}`)) : null)),
      d.notes ? h('p', { class: 'small', style: { whiteSpace: 'pre-line' } }, d.notes) : null,
      actions,
      d.seller.footer ? h('p', { class: 'small muted' }, d.seller.footer) : null,
      h('button', { class: 'btn sm ghost no-print', onclick: () => window.print() }, 'Print or save as PDF'))), footer(b));
}

const fmtDate = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Test builds only: a pretend card form (no Stripe account behind the test build). */
function demoPay(token, d, query, reload) {
  const back = h('div', { class: 'modal-back' }, h('div', { class: 'modal' },
    h('div', { class: 'modal-head' }, h('h2', `Pay ${pounds(d.balance_pence)}`)),
    h('div', { class: 'modal-body' },
      h('div', { class: 'why small' }, 'Test build: this stands in for Stripe’s secure card page. On the live system customers pay on Stripe and the invoice is marked paid automatically.'),
      field('Card number', h('input', { value: '4242 4242 4242 4242', readOnly: true })),
      h('div', { class: 'grid g2' }, field('Expiry', h('input', { value: '12 / 30', readOnly: true })), field('CVC', h('input', { value: '123', readOnly: true })))),
    h('div', { class: 'modal-foot' }, h('button', { class: 'btn', onclick: () => back.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
      try { await post(`/public/doc/${token}/demo-pay`); back.remove(); toast('Payment received – thank you!'); if (query.booking) location.hash = `#/booking/${query.booking}?new=1`; else reload(); } catch (err) { showError(err); }
    } }, `Pay ${pounds(d.balance_pence)}`))));
  document.body.append(back);
}

// ───────────────────────── Agency proposals ─────────────────────────

async function proposalPage(shell, token) {
  const data = await get(`/public/proposal/${token}`);
  const p = data.proposal;
  const b = data.business;
  const accept = h('div', { class: 'stack' });
  if (data.status === 'accepted') {
    mount(accept, h('div', { class: 'pub-success' }, icon('tick'), h('div', h('b', 'Accepted – welcome aboard!'), h('div', { class: 'small' }, 'We’ll be in touch to book your kick-off call.'))));
  } else if (data.status === 'declined') {
    mount(accept, h('p', { class: 'muted' }, 'This proposal was declined. Get in touch if anything changes.'));
  } else {
    const name = h('input', { placeholder: 'Your full name' });
    const agree = h('input', { type: 'checkbox', style: { width: 'auto' } });
    mount(accept, h('h2', 'Ready to ', h('span', { class: 'blue' }, 'get started?')), field('Your name', name),
      h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, agree, `I accept this proposal for ${data.client_name}`),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: async () => {
          if (!name.value.trim() || !agree.checked) return toast('Please add your name and tick the box', 'error');
          try { await post(`/public/proposal/${token}/accept`, { name: name.value }); proposalPage(shell, token); } catch (err) { showError(err); }
        } }, icon('tick'), 'Accept proposal'),
        h('button', { class: 'btn ghost', onclick: async () => { await post(`/public/proposal/${token}/decline`, {}); toast('Thanks for letting us know'); proposalPage(shell, token); } }, 'Not right now')));
  }
  const r = p.roi;
  mount(shell, header(b), h('main', { class: 'pub-main wide' },
    h('div', { class: 'pub-card stack proposal' },
      h('div', { class: 'eyebrow' }, `Prepared by ${p.prepared_by} · valid until ${fmtDate(p.valid_until)}`),
      h('h1', p.title),
      h('p', p.intro),
      h('div', { class: 'pub-stats' },
        h('div', h('b', `${r.hours_saved_per_week}`), h('span', 'hours saved every week')),
        h('div', h('b', `${r.hours_saved_per_year}`), h('span', 'hours a year back')),
        h('div', h('b', pounds(r.monthly_value_pence)), h('span', 'worth a month')),
        r.payback_months ? h('div', h('b', paybackLabel(r.payback_months)), h('span', 'to pay for itself')) : null),
      h('h2', 'What we ', h('span', { class: 'blue' }, 'found')), h('ul', p.problems.map((x) => h('li', x))),
      p.quick_wins.length ? [h('h2', 'Quick ', h('span', { class: 'blue' }, 'wins')), h('div', { class: 'stack', style: { gap: '8px' } }, p.quick_wins.map((q) => h('div', { class: 'pub-option static' }, h('div', { class: 'grow' }, h('b', q.name), h('div', { class: 'small muted' }, q.solution)), h('b', { class: 'blue' }, `${q.saved_per_week}h/wk`))))] : null,
      h('h2', 'The ', h('span', { class: 'blue' }, 'plan')),
      p.phases.map((ph) => h('div', { class: 'phase' }, h('h3', ph.name, h('span', { class: 'muted small' }, ` · ${ph.weeks}`)), h('ul', ph.items.map((i) => h('li', h('b', i.name), ` – ${i.solution}`))))),
      h('h2', 'What’s ', h('span', { class: 'blue' }, 'included')), h('ul', p.included.map((x) => h('li', x))),
      h('h2', 'Investment'),
      h('div', { class: 'pub-stats' }, h('div', h('b', pounds(p.investment.setup_pence)), h('span', 'one-off set-up')), h('div', h('b', pounds(p.investment.monthly_pence)), h('span', 'per month'))),
      h('p', { class: 'small muted' }, h('b', 'How we worked it out: '), p.assumptions.join(' ')),
      h('h2', 'Next ', h('span', { class: 'blue' }, 'steps')), h('ol', p.next_steps.map((x) => h('li', x))),
      accept)), footer(b));
}

// ───────────────────────── Monthly reports ─────────────────────────

async function reportPage(shell, token) {
  const r = await get(`/public/report/${token}`);
  const d = r.data;
  const b = r.business;
  const tile = (value, label) => h('div', h('b', value), h('span', label));
  mount(shell, header(b), h('main', { class: 'pub-main wide' },
    h('div', { class: 'pub-card stack' },
      h('div', { class: 'eyebrow' }, `Monthly report · ${d.label}`),
      h('h1', `${d.hours_saved} hours `, h('span', { class: 'blue' }, 'saved'), ` in ${d.label}`),
      h('p', r.summary),
      h('div', { class: 'pub-stats' },
        tile(`${d.hours_saved}h`, `admin done for you (≈ ${pounds(d.value_pence)})`),
        tile(`${d.leads_followed_up}/${d.leads}`, 'new enquiries followed up'),
        tile(`${d.missed_calls_texted_back}`, `of ${d.missed_calls} missed calls texted back`),
        tile(`${d.bookings_made}`, `bookings (${d.bookings_online} online)`)),
      h('div', { class: 'pub-stats' },
        tile(pounds(d.payments_pence), 'collected'),
        tile(pounds(d.chased_recovered_pence), 'recovered by automatic chasing'),
        tile(`${d.reminders_sent}`, `reminders sent · ${d.no_shows} no-show${d.no_shows === 1 ? '' : 's'}`),
        tile(`${d.issues_resolved}`, `issues resolved${d.avg_resolution_hours ? ` (avg ${d.avg_resolution_hours}h)` : ''}`)),
      h('h2', 'Highlights'), h('ul', d.highlights.map((x) => h('li', x))),
      d.top_automations.length ? [h('h2', 'Hardest-working ', h('span', { class: 'blue' }, 'automations')), h('table', { class: 'table' }, h('thead', h('tr', h('th', 'Automation'), h('th', 'Times run'), h('th', 'Time saved'))), h('tbody', d.top_automations.map((a) => h('tr', { style: { cursor: 'default' } }, h('td', a.name), h('td', a.runs), h('td', `${Math.round((a.minutes / 60) * 10) / 10}h`)))))] : null,
      d.previous?.hours_saved != null ? h('p', { class: 'small muted' }, `${d.previous.label}: ${d.previous.hours_saved} hours saved, ${d.previous.leads} new enquiries, ${pounds(d.previous.payments_pence)} collected.`) : null,
      r.agency ? h('p', { class: 'small muted' }, `Prepared by ${r.agency.name}.`) : null)), footer(b));
}

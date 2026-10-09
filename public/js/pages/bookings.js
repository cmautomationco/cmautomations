import { del, get, patch, post, put } from '../api.js';
import { state } from '../app.js';
import {
  announce, confirmDialog, copyText, dateTime, field, formData, h, icon, messageStatus, modal, mount, pounds, select, showError, time, titleCase, toast, toPence, ukPhone, CHANNEL_LABELS,
} from '../ui.js';

/**
 * Bookings: the diary, today's job sheet, services and opening hours. Online
 * bookings, reminders, "on my way" texts and the calendar feed are all here.
 */
const STATUS = {
  requested: ['Waiting', 'amber'], confirmed: ['Booked', 'blue'], on_the_way: ['On the way', 'blue'],
  completed: ['Done', 'green'], cancelled: ['Cancelled', ''], no_show: ['No-show', 'red'],
};
const KINDS = [['appointment', 'Appointment'], ['callout', 'Call-out'], ['quote_visit', 'Quote visit'], ['job', 'Job']];
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const mondayOf = (date) => { const d = new Date(`${date}T12:00:00`); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d); };
const clock = time;
const statusBadge = (s) => h('span', { class: `badge ${STATUS[s][1]}` }, STATUS[s][0]);

export async function render(el, route) {
  const tab = ['today', 'services', 'settings'].includes(route.parts[1]) ? route.parts[1] : 'diary';
  const overview = await get('/bookings/overview');
  const admin = state.me.role !== 'member';
  const body = h('div');
  const reload = () => render(el, route);
  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Bookings'),
        h('h1', { style: { marginTop: '6px' } }, 'Bookings that ', h('span', { class: 'blue' }, 'remind themselves')),
        h('p', 'Customers book online or you add jobs from a call or WhatsApp. Confirmations, day-before and 2-hour reminders, “on my way” texts and review requests go out on their own – and customers reply C to confirm or R to rearrange.')),
      h('div', { class: 'row' },
        h('button', { class: 'btn soft', onclick: () => copyText(overview.booking_link, 'Booking page link copied') }, icon('link'), 'Copy booking link'),
        h('button', { class: 'btn primary', onclick: () => bookingModal({ onDone: reload }) }, icon('plus'), 'New booking'))),
    h('div', { class: 'grid g4', style: { marginBottom: '16px' } },
      stat('Today', overview.counts.today, overview.counts.today === 1 ? 'job' : 'jobs', 'accent'),
      stat('Next 7 days', overview.counts.next_7_days, `${overview.counts.unconfirmed} not confirmed by the customer yet`),
      stat('Needs you', overview.counts.requested + overview.counts.reschedule, `${overview.counts.requested} waiting · ${overview.counts.reschedule} want to rearrange`),
      stat('No-shows', `${overview.counts.no_show_rate}%`, `last 30 days · ${overview.counts.online_30d} booked online`)),
    h('div', { class: 'tabs' }, [['diary', 'Diary'], ['today', 'Today’s jobs'], ['services', 'Services'], ...(admin ? [['settings', 'Hours & reminders']] : [])].map(([k, l]) => h('a', { href: `#/bookings${k === 'diary' ? '' : `/${k}`}`, class: tab === k ? 'active' : '' }, l))),
    body);
  if (route.parts[1] && !['today', 'services', 'settings'].includes(route.parts[1])) bookingDrawer(route.parts[1], reload);
  if (tab === 'today') return renderToday(body, overview, reload);
  if (tab === 'services') return renderServices(body, admin);
  if (tab === 'settings') return renderSettings(body, overview);
  return renderDiary(body, route, overview, reload);
}

const stat = (label, value, sub, cls = '') => h('div', { class: `card kpi ${cls}` }, h('div', { class: 'label' }, label), h('div', { class: `value ${cls ? '' : 'blue'}` }, value), h('div', { class: 'sub' }, sub));

// ───────────────────────── Diary (week) ─────────────────────────

async function renderDiary(el, route, overview, reload) {
  const today = ymd(new Date());
  const start = mondayOf(route.query.week || today);
  const rows = await get(`/bookings?from=${start}&to=${addDays(start, 7)}`);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const label = `${new Date(`${start}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(`${addDays(start, 6)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  mount(el,
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '12px' } },
      h('div', { class: 'row' },
        h('a', { class: 'btn sm', href: `#/bookings?week=${addDays(start, -7)}` }, '‹ Previous'),
        h('a', { class: 'btn sm', href: '#/bookings' }, 'This week'),
        h('a', { class: 'btn sm', href: `#/bookings?week=${addDays(start, 7)}` }, 'Next ›'),
        h('b', { style: { marginLeft: '6px' } }, label)),
      h('span', { class: 'small muted' }, `${rows.filter((b) => b.status !== 'cancelled').length} bookings this week`)),
    h('div', { class: 'week' }, days.map((d) => {
      const items = rows.filter((b) => b.local_date === d);
      return h('div', { class: `week-day ${d === today ? 'today' : ''}` },
        h('div', { class: 'week-day-head' }, h('b', new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })), h('span', new Date(`${d}T12:00:00`).getDate()),
          h('button', { class: 'icon-btn add-day', title: 'Add a booking on this day', onclick: () => bookingModal({ date: d, onDone: reload }) }, icon('plus'))),
        items.length ? items.map((b) => h('a', { href: `#/bookings/${b.id}`, class: `bk ${b.status} ${b.urgency === 'emergency' ? 'emergency' : ''}` },
          h('div', { class: 'bk-time' }, clock(b.starts_at), b.urgency === 'emergency' ? ' 🚨' : '', b.customer_confirmed_at && ['confirmed', 'on_the_way'].includes(b.status) ? h('span', { class: 'bk-ok', title: 'Customer confirmed' }, ' ✓ confirmed') : ''),
          h('div', { class: 'bk-title' }, b.service_name || 'Booking'),
          h('div', { class: 'bk-sub' }, b.contact_name || 'Customer'),
          b.status !== 'confirmed' ? h('div', { class: 'bk-sub' }, STATUS[b.status][0]) : null,
          b.reschedule_requested ? h('div', { class: 'bk-sub', style: { color: 'var(--amber)' } }, 'Wants to rearrange') : null))
          : h('div', { class: 'small muted', style: { padding: '6px 2px' } }, '—'));
    })),
    shareCard(overview));
}

function shareCard(overview) {
  return h('div', { class: 'grid g2', style: { marginTop: '18px' } },
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Your ', h('span', { class: 'blue' }, 'booking page')),
      h('p', { class: 'small muted' }, 'Put this link on your website, Google Business profile, Facebook page and WhatsApp Business profile. It’s also sent automatically when you miss a call.'),
      h('div', { class: 'copy-row' }, h('input', { value: overview.booking_link, readOnly: true }), h('button', { class: 'btn sm', onclick: () => copyText(overview.booking_link) }, icon('copy'), 'Copy'), h('a', { class: 'btn sm soft', href: overview.booking_link.slice(overview.booking_link.indexOf('#')), target: '_blank' }, 'Open'))),
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Sync to ', h('span', { class: 'blue' }, 'Google, Outlook or iPhone')),
      h('p', { class: 'small muted' }, 'Subscribe once and every booking appears in your phone’s calendar (it refreshes on its own):'),
      h('ul', { class: 'small', style: { margin: 0, paddingLeft: '18px' } },
        h('li', h('b', 'Google Calendar: '), 'Other calendars → + → From URL'),
        h('li', h('b', 'Outlook: '), 'Add calendar → Subscribe from web'),
        h('li', h('b', 'iPhone: '), 'Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar')),
      h('div', { class: 'copy-row' }, h('input', { value: overview.calendar_feed, readOnly: true }), h('button', { class: 'btn sm', onclick: () => copyText(overview.calendar_feed, 'Calendar link copied') }, icon('copy'), 'Copy')),
      h('p', { class: 'small muted' }, 'Keep this link private – anyone with it can see your bookings.')));
}

// ───────────────────────── Today (job sheet) ─────────────────────────

function renderToday(el, overview, reload) {
  const jobs = overview.today;
  mount(el,
    jobs.length ? h('div', { class: 'stack' }, jobs.map((j) => jobCard(j, reload)))
      : h('div', { class: 'card card-pad empty' }, 'No jobs today. ', h('a', { href: '#/bookings' }, 'See the diary'), '.'),
    h('p', { class: 'small muted', style: { marginTop: '12px' } }, '☀️ This list is also sent to your phone every morning, with addresses and customer numbers.'));
}

function jobCard(j, reload) {
  const address = [j.address, j.postcode].filter(Boolean).join(', ');
  const act = async (status, extra = {}) => {
    try {
      const res = await post(`/bookings/${j.id}/status`, { status, ...extra });
      toast(status === 'on_the_way' ? `“On my way” sent to ${j.first_name || 'the customer'}` : status === 'completed' ? 'Marked done – review request and invoice are on their way' : 'Updated');
      announce(res.automations);
      reload();
    } catch (err) { showError(err); }
  };
  const eta = select('eta', [['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '1 hour']], '30');
  return h('div', { class: `card card-pad job ${j.urgency === 'emergency' ? 'emergency' : ''}` },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } },
      h('div', h('div', { class: 'job-time' }, clock(j.starts_at), j.urgency === 'emergency' ? ' 🚨 Emergency' : ''), h('h3', `${j.service_name || 'Job'} – ${j.contact_name || 'Customer'}`)),
      h('div', { class: 'row', style: { gap: '6px' } }, statusBadge(j.status), ['requested', 'confirmed', 'on_the_way'].includes(j.status) ? (j.customer_confirmed_at ? h('span', { class: 'badge green' }, 'Customer confirmed') : h('span', { class: 'badge' }, 'Not confirmed yet')) : null)),
    address ? h('a', { class: 'small', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, target: '_blank', rel: 'noopener' }, icon('pin'), ` ${address}`) : null,
    j.notes ? h('div', { class: 'small muted' }, `📝 ${j.notes}`) : null,
    h('div', { class: 'row job-actions' },
      j.contact_phone ? h('a', { class: 'btn sm', href: `tel:${j.contact_phone}` }, icon('phone'), 'Call') : null,
      j.contact_phone ? h('a', { class: 'btn sm', href: `https://wa.me/${j.contact_phone.replace('+', '')}`, target: '_blank', rel: 'noopener' }, icon('whatsapp'), 'WhatsApp') : null,
      ['confirmed', 'requested'].includes(j.status) ? h('span', { class: 'row', style: { gap: '6px' } }, h('div', { style: { width: '110px' } }, eta), h('button', { class: 'btn sm soft', onclick: () => act('on_the_way', { eta_minutes: Number(eta.value) }) }, icon('car'), 'On my way')) : null,
      ['confirmed', 'on_the_way', 'requested'].includes(j.status) ? h('button', { class: 'btn sm primary', onclick: () => act('completed') }, icon('tick'), 'Done') : null,
      ['confirmed', 'on_the_way'].includes(j.status) ? h('button', { class: 'btn sm ghost', onclick: async () => { if (await confirmDialog(`Mark ${j.contact_name || 'this customer'} as a no-show? They’ll get a “sorry we missed you” message with a link to rebook.`, 'No-show')) act('no_show'); } }, 'No-show') : null,
      h('a', { class: 'btn sm ghost', href: `#/bookings/${j.id}` }, 'Details')));
}

// ───────────────────────── Booking drawer ─────────────────────────

export async function bookingDrawer(bookingId, reload) {
  document.querySelector('.drawer')?.remove();
  let b;
  try { b = await get(`/bookings/${bookingId}`); } catch (err) { showError(err); return; }
  const close = () => { drawer.remove(); if (location.hash.startsWith(`#/bookings/${bookingId}`)) history.replaceState(null, '', '#/bookings'); };
  const refresh = () => { bookingDrawer(bookingId, reload); reload?.(); };
  const address = [b.address, b.postcode].filter(Boolean).join(', ');
  const act = async (status, extra = {}) => {
    try { const res = await post(`/bookings/${b.id}/status`, { status, ...extra }); announce(res.automations); toast('Updated'); refresh(); } catch (err) { showError(err); }
  };
  const active = ['requested', 'confirmed', 'on_the_way'].includes(b.status);
  const drawer = h('div', { class: 'drawer' },
    h('div', { class: 'modal-head' }, h('div', h('div', { class: 'eyebrow' }, `${dateTime(b.starts_at)}${b.urgency === 'emergency' ? ' · 🚨 Emergency' : ''}`), h('h2', `${b.service_name || 'Booking'} – ${b.contact_name || 'Customer'}`)), h('button', { class: 'icon-btn', onclick: close }, icon('x'))),
    h('div', { class: 'modal-body' },
      h('div', { class: 'row' }, statusBadge(b.status),
        b.customer_confirmed_at ? h('span', { class: 'badge green' }, 'Customer confirmed') : active ? h('span', { class: 'badge' }, 'Not confirmed by customer yet') : null,
        b.reschedule_requested ? h('span', { class: 'badge amber' }, 'Wants to rearrange') : null,
        h('span', { class: 'badge' }, `Booked ${{ online: 'online', phone: 'by phone', whatsapp: 'via WhatsApp', manual: 'by the team' }[b.source]}`)),
      h('div', { class: 'grid g2 small' },
        h('div', h('div', { class: 'muted' }, 'Customer'), h('a', { href: `#/messages/${b.contact_id}` }, b.contact_name || '–')),
        h('div', h('div', { class: 'muted' }, 'When'), `${dateTime(b.starts_at)} – ${clock(b.ends_at)}`),
        h('div', h('div', { class: 'muted' }, 'Phone'), b.contact_phone ? h('a', { href: `tel:${b.contact_phone}` }, ukPhone(b.contact_phone)) : '–'),
        h('div', h('div', { class: 'muted' }, 'Address'), address ? h('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, target: '_blank', rel: 'noopener' }, address) : '–'),
        h('div', h('div', { class: 'muted' }, 'Price'), b.price_pence ? pounds(b.price_pence) : '–', b.deposit_pence ? ` (deposit ${pounds(b.deposit_pence)})` : ''),
        h('div', h('div', { class: 'muted' }, 'Assigned to'), b.staff_name || 'Anyone'),
        h('div', h('div', { class: 'muted' }, 'Customer link'), h('a', { href: b.manage_link.slice(b.manage_link.indexOf('#')), target: '_blank' }, 'Open their page'))),
      b.notes ? h('div', { class: 'pre small' }, b.notes) : null,
      active ? h('div', { class: 'row' },
        b.status === 'requested' ? h('button', { class: 'btn sm primary', onclick: () => act('confirmed') }, 'Confirm booking') : null,
        b.status !== 'on_the_way' ? h('button', { class: 'btn sm soft', onclick: () => act('on_the_way', { eta_minutes: 30 }) }, icon('car'), 'On my way (30 min)') : null,
        h('button', { class: 'btn sm primary', onclick: () => act('completed') }, icon('tick'), 'Mark done'),
        h('button', { class: 'btn sm', onclick: () => moveModal(b, refresh) }, 'Move'),
        h('button', { class: 'btn sm', onclick: async () => { try { const m = await post(`/bookings/${b.id}/remind`); toast(`Reminder ${m.status === 'demo' ? 'saved (demo mode)' : 'sent'} by ${CHANNEL_LABELS[m.channel]}`); refresh(); } catch (err) { showError(err); } } }, 'Send reminder now'),
        h('button', { class: 'btn sm ghost', onclick: async () => { if (await confirmDialog('Mark as a no-show? They’ll get a “sorry we missed you” message with a rebooking link.', 'No-show')) act('no_show'); } }, 'No-show'),
        h('button', { class: 'btn sm ghost danger', onclick: () => cancelModal(b, act) }, 'Cancel')) : null,
      b.status === 'completed' && !b.invoices.some((i) => i.purpose === 'standard') ? h('button', { class: 'btn sm soft', onclick: async () => { const inv = await post(`/bookings/${b.id}/invoice`); toast(`Invoice ${inv.number} drafted`); location.hash = `#/invoices/${inv.id}`; } }, icon('receipt'), 'Create the invoice') : null,
      b.invoices.length ? h('div', h('h3', { style: { marginBottom: '6px' } }, 'Money'), b.invoices.map((i) => h('a', { class: 'list-item', href: `#/invoices/${i.id}`, style: { color: 'inherit', textDecoration: 'none' } },
        h('div', { class: 'grow' }, h('b', `${i.purpose === 'deposit' ? 'Deposit' : titleCase(i.kind)} ${i.number}`)), h('span', { class: 'badge blue' }, titleCase(i.status)), h('b', { class: 'blue' }, pounds(i.total_pence))))) : null,
      h('div', h('h3', { style: { marginBottom: '6px' } }, 'Messages about this booking'),
        b.messages.length ? b.messages.map((m) => h('div', { class: 'run-item' }, h('div', { class: 'ico' }, icon(m.direction === 'in' ? 'inbox' : 'send')),
          h('div', { class: 'grow' }, h('div', { class: 'small muted' }, `${CHANNEL_LABELS[m.channel]} · ${dateTime(m.created_at)} · ${m.direction === 'in' ? 'from customer' : messageStatus(m)}`), h('div', { class: 'small' }, m.body))))
          : h('div', { class: 'small muted' }, 'None yet.'))));
  document.body.append(drawer);
}

function cancelModal(b, act) {
  const body = h('div', { class: 'stack' },
    field('Reason (for your records)', h('input', { name: 'reason', placeholder: 'e.g. customer called to cancel' })),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'notify', checked: true, style: { width: 'auto' } }), 'Tell the customer (with a link to rebook)'));
  modal('Cancel this booking?', body, { actions: [{ label: 'Keep it' }, { label: 'Cancel booking', primary: true, onClick: () => act('cancelled', formData(body)) }] });
}

async function moveModal(b, done) {
  const dateInput = h('input', { type: 'date', name: 'date', value: ymd(new Date(b.starts_at)) });
  const slotWrap = h('div');
  const loadSlots = async () => {
    const slots = await get(`/bookings/slots?service=${b.service_id}&date=${dateInput.value}&exclude=${b.id}`);
    mount(slotWrap, slots.length ? select('starts_at', slots.map((s) => [s.starts_at, s.label])) : h('div', { class: 'small muted' }, 'No free times that day – pick another day or type a time below.'));
  };
  dateInput.addEventListener('change', loadSlots);
  const custom = h('input', { type: 'time', name: 'custom_time' });
  const body = h('div', { class: 'stack' }, field('New date', dateInput), field('Free times', slotWrap), field('…or a specific time', custom, { help: 'Overrides the free times (e.g. squeezing in a job).' }),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'notify', checked: true, style: { width: 'auto' } }), 'Tell the customer about the new time'));
  await loadSlots();
  modal('Move booking', body, { actions: [{ label: 'Cancel' }, { label: 'Move', primary: true, onClick: async () => {
    const d = formData(body);
    const startsAt = d.custom_time ? new Date(`${d.date}T${d.custom_time}`).toISOString() : d.starts_at;
    if (!startsAt) throw new Error('Pick a time');
    const res = await patch(`/bookings/${b.id}`, { starts_at: startsAt, notify: d.notify });
    toast(res.message ? 'Moved – the customer has been told' : 'Moved');
    done();
  } }] });
}

// ───────────────────────── New booking ─────────────────────────

export async function bookingModal({ contact = null, date = null, source = 'phone', onDone } = {}) {
  const [services, team, contacts] = await Promise.all([get('/bookings/services'), get('/team'), contact ? Promise.resolve([]) : get('/crm/contacts')]);
  const live = services.filter((s) => s.active);
  if (!live.length) {
    modal('Add a service first', h('p', 'Bookings are for a service (e.g. “Boiler service – 1 hour – £85”). Add your services, then come back.'), { actions: [{ label: 'Close' }, { label: 'Add services', primary: true, onClick: () => { location.hash = '#/bookings/services'; } }] });
    return;
  }
  const serviceSel = select('service_id', live.map((s) => [s.id, `${s.name} · ${s.duration_min} min${s.price_pence ? ` · ${pounds(s.price_pence)}` : ''}`]));
  const dateInput = h('input', { type: 'date', name: 'date', value: date || ymd(new Date()) });
  const slotWrap = h('div');
  const custom = h('input', { type: 'time', name: 'custom_time' });
  const loadSlots = async () => {
    const slots = await get(`/bookings/slots?service=${serviceSel.value}&date=${dateInput.value}`).catch(() => []);
    mount(slotWrap, slots.length ? select('starts_at', slots.map((s) => [s.starts_at, s.label])) : h('div', { class: 'small muted' }, 'No free times – type a time below, or pick another day.'));
  };
  serviceSel.addEventListener('change', loadSlots);
  dateInput.addEventListener('change', loadSlots);
  const who = contact
    ? h('div', { class: 'why small' }, `For ${contact.first_name} ${contact.last_name || ''}${contact.phone_display ? ` · ${contact.phone_display}` : ''}`)
    : h('div', { class: 'stack' },
      field('Existing customer', select('contact_id', [['', '— New customer —'], ...contacts.map((c) => [c.id, `${c.first_name} ${c.last_name || ''}${c.phone ? ` · ${c.phone}` : ''}`])])),
      h('div', { class: 'grid g2' }, field('First name', h('input', { name: 'first_name' })), field('Mobile', h('input', { name: 'phone', placeholder: '07700 900123' }))),
      field('Email (optional)', h('input', { name: 'email', type: 'email' })));
  const body = h('div', { class: 'stack' },
    who,
    field('Service', serviceSel),
    h('div', { class: 'grid g2' }, field('Date', dateInput), field('Free times', slotWrap)),
    field('…or a specific time', custom),
    h('div', { class: 'grid g2' }, field('Address', h('input', { name: 'address', value: contact?.address || '' })), field('Postcode', h('input', { name: 'postcode', value: contact?.postcode || '' }))),
    h('div', { class: 'grid g2' },
      field('How did they book?', select('source', [['phone', 'Phone call'], ['whatsapp', 'WhatsApp'], ['manual', 'Other']], source)),
      field('Urgency', select('urgency', [['normal', 'Normal'], ['emergency', '🚨 Emergency']]))),
    field('Assign to', select('staff_id', [['', 'Anyone'], ...team.map((t) => [t.id, t.name])])),
    field('Notes for the job', h('textarea', { name: 'notes', placeholder: 'e.g. boiler losing pressure, side gate code 1234' })),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'notify', checked: true, style: { width: 'auto' } }), 'Send the customer a confirmation (WhatsApp, text or email)'));
  await loadSlots();
  modal('New booking', body, { actions: [{ label: 'Cancel' }, { label: 'Book it', primary: true, onClick: async () => {
    const d = formData(body);
    const startsAt = d.custom_time ? new Date(`${d.date}T${d.custom_time}`).toISOString() : d.starts_at;
    if (!startsAt) throw new Error('Pick a time');
    const payload = { service_id: d.service_id, starts_at: startsAt, address: d.address, postcode: d.postcode, source: d.source, urgency: d.urgency, staff_id: d.staff_id || undefined, notes: d.notes, notify: d.notify };
    if (contact) payload.contact_id = contact.id;
    else if (d.contact_id) payload.contact_id = d.contact_id;
    else payload.contact = { first_name: d.first_name, phone: d.phone, email: d.email };
    const res = await post('/bookings', payload);
    toast(res.clash ? 'Booked – note this overlaps another booking' : res.message ? `Booked – confirmation sent by ${CHANNEL_LABELS[res.message.channel]}` : 'Booked');
    announce(res.automations);
    onDone?.();
  } }] });
}

// ───────────────────────── Services ─────────────────────────

async function renderServices(el, admin) {
  const services = await get('/bookings/services');
  const reload = () => renderServices(el, admin);
  mount(el,
    h('div', { class: 'card', style: { overflow: 'hidden' } },
      h('div', { class: 'card-head' }, h('h3', 'What customers can ', h('span', { class: 'blue' }, 'book')), admin ? h('button', { class: 'btn sm primary', onclick: () => serviceModal(null, reload) }, icon('plus'), 'Add service') : null),
      h('div', { class: 'card-body' }, services.length ? h('table', { class: 'table' },
        h('thead', h('tr', ['Service', 'Type', 'Length', 'Price', 'Deposit', 'Online', ''].map((t) => h('th', t)))),
        h('tbody', services.map((s) => h('tr', { style: { opacity: s.active ? 1 : 0.5 }, onclick: () => admin && serviceModal(s, reload) },
          h('td', h('b', s.name), s.description ? h('div', { class: 'small muted' }, s.description) : null),
          h('td', KINDS.find((k) => k[0] === s.kind)?.[1]),
          h('td', `${s.duration_min} min${s.buffer_min ? ` + ${s.buffer_min} travel` : ''}`),
          h('td', h('b', { class: 'blue' }, s.price_pence ? pounds(s.price_pence) : 'Free / quote')),
          h('td', s.deposit_pence ? pounds(s.deposit_pence) : '–'),
          h('td', s.online && s.active ? h('span', { class: 'badge green' }, 'Bookable online') : h('span', { class: 'badge' }, s.active ? 'Team only' : 'Archived')),
          h('td', admin ? h('button', { class: 'btn sm ghost' }, 'Edit') : null)))))
        : h('div', { class: 'empty' }, 'No services yet. Add what customers can book – e.g. “Boiler service”, “Emergency call-out”, “Free quote visit”.'))));
}

function serviceModal(s, reload) {
  const body = h('div', { class: 'stack' },
    field('Name', h('input', { name: 'name', value: s?.name || '', placeholder: 'e.g. Boiler service' }), { required: true }),
    field('Description (shown on the booking page)', h('textarea', { name: 'description', value: s?.description || '', style: { minHeight: '60px' } })),
    h('div', { class: 'grid g2' }, field('Type', select('kind', KINDS, s?.kind || 'appointment')), field('Length (minutes)', h('input', { name: 'duration_min', type: 'number', min: 5, value: s?.duration_min || 60 }))),
    h('div', { class: 'grid g2' }, field('Travel / tidy-up time after (minutes)', h('input', { name: 'buffer_min', type: 'number', min: 0, value: s?.buffer_min || 0 })), field('Price (£)', h('input', { name: 'price', type: 'number', step: '0.01', min: 0, value: s ? s.price_pence / 100 : '' }), { help: 'Leave blank for “we’ll quote”.' })),
    field('Deposit to book online (£)', h('input', { name: 'deposit', type: 'number', step: '0.01', min: 0, value: s?.deposit_pence ? s.deposit_pence / 100 : '' }), { help: 'Optional. Online bookings are held until the deposit is paid by card – this cuts no-shows.' }),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'online', checked: s ? Boolean(s.online) : true, style: { width: 'auto' } }), 'Customers can book this online'));
  const actions = [{ label: 'Cancel' }];
  if (s) actions.push({ label: 'Remove', onClick: async () => { if (!(await confirmDialog('Remove this service? Past bookings are kept.', 'Remove'))) return false; await del(`/bookings/services/${s.id}`); reload(); } });
  actions.push({ label: s ? 'Save' : 'Add service', primary: true, onClick: async () => {
    const d = formData(body);
    const payload = { name: d.name, description: d.description, kind: d.kind, duration_min: Number(d.duration_min), buffer_min: Number(d.buffer_min || 0), price_pence: toPence(d.price), deposit_pence: toPence(d.deposit), online: d.online };
    if (s) await patch(`/bookings/services/${s.id}`, { ...payload, active: true }); else await post('/bookings/services', payload);
    toast('Saved');
    reload();
  } });
  modal(s ? 'Edit service' : 'Add a service', body, { actions });
}

// ───────────────────────── Hours & reminders ─────────────────────────

async function renderSettings(el, overview) {
  const [{ settings: s }, timeOff, team, msg] = await Promise.all([get('/bookings/settings'), get('/bookings/time-off'), get('/team'), get('/messages/settings')]);
  const hours = h('div', { class: 'stack', style: { gap: '6px' } }, DAYS.map(([k, label]) => {
    const d = s.hours[k];
    return h('div', { class: 'hours-row', 'data-day': k },
      h('label', { class: 'row', style: { gap: '8px', fontWeight: 700, width: '130px' } }, h('input', { type: 'checkbox', class: 'open', checked: d.open, style: { width: 'auto' } }), label),
      h('input', { type: 'time', class: 'start', value: d.start }), h('span', { class: 'muted' }, 'to'), h('input', { type: 'time', class: 'end', value: d.end }));
  }));
  const check = (name, checked, label) => h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name, checked, style: { width: 'auto' } }), label);
  const form = h('div', { class: 'grid g2', style: { alignItems: 'start' } },
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Opening ', h('span', { class: 'blue' }, 'hours')),
      hours,
      h('div', { class: 'grid g2' },
        field('Time slots every', select('slot_step_min', [10, 15, 20, 30, 45, 60, 90, 120].map((m) => [String(m), `${m} minutes`]), String(s.slot_step_min))),
        field('Jobs at the same time', h('input', { name: 'capacity', type: 'number', min: 1, value: s.capacity }), { help: 'e.g. the number of engineers or chairs' })),
      h('div', { class: 'grid g2' },
        field('Minimum notice (hours)', h('input', { name: 'min_notice_hours', type: 'number', min: 0, value: s.min_notice_hours })),
        field('Book up to (days ahead)', h('input', { name: 'max_days_ahead', type: 'number', min: 1, value: s.max_days_ahead }))),
      field('Customers can cancel or move online up to (hours before)', h('input', { name: 'cancel_notice_hours', type: 'number', min: 0, value: s.cancel_notice_hours }))),
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Booking ', h('span', { class: 'blue' }, 'page')),
      check('enabled', s.enabled, 'Online booking is switched on'),
      check('auto_confirm', s.auto_confirm, 'Confirm online bookings straight away (untick to approve each one)'),
      check('require_address', s.require_address, 'Ask for the address (for visits and call-outs)'),
      check('chat_booking', s.chat_booking, 'Customers can also book, move and cancel by WhatsApp or text (reply BOOK) – see Settings → WhatsApp'),
      field('Welcome line', h('input', { name: 'intro', value: s.intro })),
      check('emergency_callouts', s.emergency_callouts, 'Show an emergency message with your phone and WhatsApp'),
      field('Emergency message', h('textarea', { name: 'emergency_note', value: s.emergency_note, style: { minHeight: '60px' } })),
      h('div', { class: 'copy-row' }, h('input', { value: overview.booking_link, readOnly: true }), h('button', { class: 'btn sm', onclick: () => copyText(overview.booking_link) }, icon('copy'), 'Copy'))),
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Automatic ', h('span', { class: 'blue' }, 'reminders')),
      h('div', { class: 'row' }, check('reminder_24h', s.reminder_24h, 'Day-before reminder at'), h('input', { type: 'time', name: 'reminder_time', value: s.reminder_time, style: { width: '120px' } })),
      check('reminder_2h', s.reminder_2h, '2-hour reminder on the day'),
      h('div', { class: 'row' }, check('review_request', s.review_request, 'Ask for a review'), h('input', { type: 'number', name: 'review_delay_hours', min: 0, value: s.review_delay_hours, style: { width: '80px' } }), h('span', { class: 'small muted' }, 'hours after the job is done')),
      msg.settings.review_link ? null : h('div', { class: 'small', style: { color: 'var(--amber)' } }, 'Add your Google review link in ', h('a', { href: '#/settings/phone' }, 'Settings → Phone & alerts'), ' to switch on review requests.'),
      h('p', { class: 'small muted' }, 'Reminders go by WhatsApp if the customer has opted in, otherwise text, otherwise email – never during quiet hours. Customers reply C to confirm or R to rearrange.')),
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Morning ', h('span', { class: 'blue' }, 'job sheet')),
      h('div', { class: 'row' }, check('job_sheet', s.job_sheet, 'Send today’s jobs to the team’s phone at'), h('input', { type: 'time', name: 'job_sheet_time', value: s.job_sheet_time, style: { width: '120px' } })),
      h('p', { class: 'small muted' }, msg.settings.alert_number || msg.settings.forward_to ? `Goes to ${msg.settings.alert_number || msg.settings.forward_to} by ${msg.settings.alert_channel === 'sms' ? 'text' : 'WhatsApp'}, with times, addresses and customer numbers.` : 'Add the team’s mobile in Settings → Phone & alerts to get it on your phone.'),
      h('h3', { style: { marginTop: '8px' } }, 'Time ', h('span', { class: 'blue' }, 'off')),
      timeOff.length ? timeOff.map((t) => h('div', { class: 'list-item' }, h('div', { class: 'grow small' }, h('b', t.staff_name || 'Everyone'), ` · ${dateTime(t.starts_at)} → ${dateTime(t.ends_at)}${t.reason ? ` · ${t.reason}` : ''}`), h('button', { class: 'btn sm ghost danger', onclick: async () => { await del(`/bookings/time-off/${t.id}`); renderSettings(el, overview); } }, 'Remove'))) : h('div', { class: 'small muted' }, 'No time off booked.'),
      h('button', { class: 'btn sm soft', onclick: () => timeOffModal(team, () => renderSettings(el, overview)) }, icon('plus'), 'Add time off')));
  mount(el, form, h('div', { class: 'row', style: { marginTop: '16px', justifyContent: 'flex-end' } }, h('button', { class: 'btn primary', onclick: async () => {
    const d = formData(form);
    const hoursOut = {};
    form.querySelectorAll('.hours-row').forEach((row) => { hoursOut[row.dataset.day] = { open: row.querySelector('.open').checked, start: row.querySelector('.start').value, end: row.querySelector('.end').value }; });
    try {
      await put('/bookings/settings', { ...d, hours: hoursOut, slot_step_min: Number(d.slot_step_min), capacity: Number(d.capacity), min_notice_hours: Number(d.min_notice_hours), max_days_ahead: Number(d.max_days_ahead), cancel_notice_hours: Number(d.cancel_notice_hours), review_delay_hours: Number(d.review_delay_hours) });
      toast('Saved');
    } catch (err) { showError(err); }
  } }, 'Save settings')));
}

function timeOffModal(team, done) {
  const today = ymd(new Date());
  const body = h('div', { class: 'stack' },
    field('Who', select('staff_id', [['', 'Everyone (closed)'], ...team.map((t) => [t.id, t.name])])),
    h('div', { class: 'grid g2' }, field('From', h('input', { type: 'date', name: 'from', value: today })), field('To (inclusive)', h('input', { type: 'date', name: 'to', value: today }))),
    field('Reason', h('input', { name: 'reason', placeholder: 'e.g. holiday, training' })));
  modal('Add time off', body, { actions: [{ label: 'Cancel' }, { label: 'Add', primary: true, onClick: async () => {
    const d = formData(body);
    await post('/bookings/time-off', { staff_id: d.staff_id || undefined, starts_at: new Date(`${d.from}T00:00`).toISOString(), ends_at: new Date(`${addDays(d.to, 1)}T00:00`).toISOString(), reason: d.reason });
    toast('Time off added – those days are blocked online');
    done();
  } }] });
}

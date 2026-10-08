import { get, post } from '../api.js';
import { state } from '../app.js';
import {
  CHANNEL_LABELS, ago, announce, avatar, channelIcon, contactName, ukPhone, dateTime, field, formData, h, icon, messageStatus, modal, mount, select, showError, toast,
} from '../ui.js';
import { bookingModal } from './bookings.js';
import { documentModal } from './invoices.js';

/**
 * Messages: one inbox for texts, WhatsApp and email, the call log (missed calls
 * are texted back automatically) and the alerts sent to the team's phone.
 */
export async function render(el, route) {
  const tab = ['calls', 'alerts'].includes(route.parts[1]) ? route.parts[1] : 'inbox';
  const contactId = tab === 'inbox' ? route.parts[1] : null;
  const [info, summary] = await Promise.all([get('/messages/settings'), get('/messages/summary')]);
  const admin = state.me.role !== 'member';
  const body = h('div');
  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Messages'),
        h('h1', { style: { marginTop: '6px' } }, 'Every call & ', h('span', { class: 'blue' }, 'message'), ' in one place'),
        h('p', 'Texts, WhatsApp messages and emails from customers land here and on their CRM record. Missed calls are texted back in seconds, emergencies are flagged, and each one stays on someone’s task list until it’s answered.')),
      admin ? h('div', { class: 'row' },
        h('button', { class: 'btn soft', onclick: () => simulateCall(() => render(el, route)) }, icon('phoneMissed'), 'Test a missed call'),
        h('button', { class: 'btn primary', onclick: () => simulateMessage(() => render(el, route)) }, icon('whatsapp'), 'Test an incoming WhatsApp')) : null),
    modeBanner(info),
    h('div', { class: 'tabs' },
      h('a', { href: '#/messages', class: tab === 'inbox' ? 'active' : '' }, 'Inbox', summary.unread ? h('span', { class: 'count-pill' }, summary.unread) : null),
      h('a', { href: '#/messages/calls', class: tab === 'calls' ? 'active' : '' }, 'Calls', summary.missed_calls ? h('span', { class: 'count-pill' }, summary.missed_calls) : null),
      h('a', { href: '#/messages/alerts', class: tab === 'alerts' ? 'active' : '' }, 'Sent to your phone')),
    body);
  if (tab === 'calls') return renderCalls(body);
  if (tab === 'alerts') return renderAlerts(body, info);
  return renderInbox(body, route, contactId);
}

function modeBanner(info) {
  const s = info.settings;
  if (info.status.mode === 'live') {
    return h('div', { class: 'why small', style: { marginBottom: '16px' } },
      h('b', 'Live. '), s.business_number ? `Calls to ${ukPhone(s.business_number)} ring ${ukPhone(s.forward_to) || 'nobody yet'}; ` : 'Add your business number in Settings → Phone & WhatsApp. ',
      s.missed_call_text_back ? 'missed calls are texted back automatically.' : 'missed-call text-back is off.');
  }
  return h('div', { class: 'why small', style: { marginBottom: '16px' } },
    h('b', info.status.mode === 'webhook' ? 'Sending through your webhook. ' : 'Demo mode. '),
    info.status.mode === 'webhook' ? 'Messages are passed to your Zapier/Make webhook to send. ' : 'Messages are saved and shown exactly as customers would get them, but nothing leaves the system yet. ',
    'To go live, connect a Twilio number (texts, WhatsApp and calls) and an email service – ', h('a', { href: '#/settings/phone' }, 'Settings → Phone & WhatsApp'), '.');
}

// ───────────────────────── Inbox ─────────────────────────

async function renderInbox(el, route, contactId) {
  const filter = route.query.filter || '';
  const q = route.query.q || '';
  const threads = await get(`/messages/threads?${new URLSearchParams({ ...(filter ? { filter } : {}), ...(q ? { q } : {}) })}`);
  const selected = contactId || (window.innerWidth > 900 ? threads[0]?.id : null);
  const search = h('input', { placeholder: 'Search name or number…', value: q, onkeydown: (e) => { if (e.key === 'Enter') location.hash = `#/messages?q=${encodeURIComponent(e.target.value)}`; } });
  const pane = h('div', { class: 'card msg-pane' });
  mount(el,
    h('div', { class: `msg-layout ${contactId ? 'has-open' : ''}` },
      h('div', { class: 'card msg-list' },
        h('div', { class: 'msg-list-head' },
          h('div', { class: 'row', style: { gap: '6px' } }, [['', 'All'], ['unread', 'Unread'], ['urgent', '🚨 Urgent']].map(([k, l]) => h('a', { class: `chip ${filter === k ? 'active' : ''}`, href: `#/messages${k ? `?filter=${k}` : ''}` }, l))),
          search),
        threads.length ? threads.map((t) => h('a', { href: `#/messages/${t.id}`, class: `thread ${t.id === selected ? 'selected' : ''} ${t.unread ? 'unread' : ''}` },
          avatar(contactName(t)),
          h('div', { class: 'grow' },
            h('div', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } },
              h('b', { class: 'truncate' }, `${t.urgent ? '🚨 ' : ''}${contactName(t)}`),
              h('span', { class: 'small muted', style: { marginLeft: 'auto', whiteSpace: 'nowrap' } }, ago(t.last_at))),
            h('div', { class: 'small muted row', style: { gap: '5px', flexWrap: 'nowrap' } },
              h('span', { class: 'ch-ico' }, channelIcon(t.last_channel)),
              h('span', { class: 'truncate' }, `${t.last_direction === 'out' ? 'You: ' : ''}${t.last_body}`))),
          t.unread ? h('span', { class: 'count-pill' }, t.unread) : null))
          : h('div', { class: 'empty' }, filter || q ? 'Nothing matches.' : 'No messages yet. When customers text, WhatsApp or email, or you miss a call, it shows up here.')),
      pane));
  if (selected) renderThread(pane, selected, () => renderInbox(el, route, contactId));
  else mount(pane, h('div', { class: 'empty' }, 'Pick a conversation.'));
}

async function renderThread(el, contactId, reloadList) {
  let data;
  try { data = await get(`/messages/threads/${contactId}`); } catch (err) { showError(err); return; }
  const { contact: c, messages, channels, open_tasks: tasks, next_booking: booking } = data;
  const name = contactName(c);
  const options = [['auto', `Best way (${CHANNEL_LABELS[channels.best] || 'none'})`]];
  if (channels.whatsapp.available) options.push(['whatsapp', 'WhatsApp']);
  if (channels.sms.available) options.push(['sms', 'Text message']);
  if (channels.email.available) options.push(['email', 'Email']);
  const channel = select('channel', options, 'auto');
  const subject = h('input', { name: 'subject', placeholder: 'Subject', value: `Re: your enquiry`, style: { display: 'none' } });
  const text = h('textarea', { name: 'body', placeholder: `Reply to ${name}…`, style: { minHeight: '70px' } });
  const note = h('div', { class: 'small muted' });
  const updateChannel = () => {
    const ch = channel.value === 'auto' ? channels.best : channel.value;
    subject.style.display = ch === 'email' ? '' : 'none';
    note.textContent = ch === 'whatsapp' ? channels.whatsapp.note || '' : ch === 'sms' ? channels.sms.note || '' : '';
  };
  channel.addEventListener('change', updateChannel);
  updateChannel();
  const send = async (btn) => {
    if (!text.value.trim()) return;
    btn.disabled = true;
    try {
      const m = await post(`/messages/threads/${c.id}/send`, { channel: channel.value, body: text.value, subject: subject.value });
      toast(m.status === 'demo' ? `Saved – demo mode, ${CHANNEL_LABELS[m.channel]} not actually sent` : `${CHANNEL_LABELS[m.channel]} sent`);
      text.value = '';
      reloadList();
    } catch (err) { showError(err); } finally { btn.disabled = false; }
  };
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(sendBtn); });
  const sendBtn = h('button', { class: 'btn primary', onclick: (e) => send(e.currentTarget) }, icon('send'), 'Send');
  const list = h('div', { class: 'bubbles' }, messages.map((m) => h('div', { class: `bubble ${m.direction}` },
    m.subject ? h('div', { class: 'small', style: { fontWeight: 700 } }, m.subject) : null,
    h('div', { class: 'bubble-text' }, linkify(m.body)),
    h('div', { class: 'bubble-meta' }, channelIcon(m.channel), ` ${CHANNEL_LABELS[m.channel]} · ${dateTime(m.created_at)}`, m.author ? ` · ${m.author}` : m.direction === 'out' ? ' · automatic' : '',
      m.direction === 'out' ? h('span', { class: `st ${m.status}` }, ` · ${messageStatus(m)}`) : null))));
  mount(el,
    h('div', { class: 'msg-head' },
      h('a', { href: '#/messages', class: 'icon-btn msg-back', title: 'Back' }, icon('x')),
      avatar(name),
      h('div', { class: 'grow' }, h('h3', name), h('div', { class: 'small muted' }, [c.phone_display, c.email].filter(Boolean).join(' · ') || 'No contact details')),
      h('div', { class: 'row', style: { gap: '6px' } },
        c.phone_e164 ? h('a', { class: 'btn sm', href: `tel:${c.phone_e164}` }, icon('phone'), 'Call') : null,
        h('button', { class: 'btn sm', onclick: () => bookingModal({ contact: c, source: 'whatsapp', onDone: () => renderThread(el, contactId, reloadList) }) }, icon('calendar'), 'Book'),
        h('button', { class: 'btn sm', onclick: () => documentModal({ kind: 'quote', contact_id: c.id }) }, icon('receipt'), 'Quote'),
        h('a', { class: 'btn sm ghost', href: `#/crm/contacts?open=${c.id}` }, 'CRM'))),
    h('div', { class: 'msg-flags' },
      channels.whatsapp.allowed ? h('span', { class: 'badge green' }, 'WhatsApp OK') : null,
      c.sms_opt_out ? h('span', { class: 'badge red' }, 'Replied STOP') : null,
      booking ? h('a', { class: 'badge blue', href: `#/bookings/${booking.id}` }, `📅 ${booking.service_name} · ${dateTime(booking.starts_at)}`) : null,
      tasks.map((t) => h('a', { class: `badge ${t.priority === 'urgent' ? 'red' : 'amber'}`, href: '#/tasks' }, t.title))),
    list,
    h('div', { class: 'composer' },
      h('div', { class: 'row', style: { gap: '8px' } }, h('div', { style: { flex: '1 1 180px' } }, channel), h('div', { style: { flex: '2 1 220px' } }, subject)),
      text, note,
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'small muted' }, 'Ctrl + Enter to send · replying completes the “Reply to…” task'), sendBtn)));
  list.scrollTop = list.scrollHeight;
}

/** Turns links in a message into clickable links (e.g. photos customers send). */
function linkify(text) {
  return String(text).split(/(https?:\/\/[^\s]+)/g).map((part) => (/^https?:\/\//.test(part) ? h('a', { href: part, target: '_blank', rel: 'noopener' }, part.length > 48 ? `${part.slice(0, 45)}…` : part) : part));
}

// ───────────────────────── Calls ─────────────────────────

async function renderCalls(el) {
  const calls = await get('/messages/calls');
  const label = { missed: ['Missed', 'red'], voicemail: ['Voicemail', 'amber'], answered: ['Answered', 'green'] };
  mount(el,
    h('div', { class: 'card', style: { overflow: 'hidden' } },
      calls.length ? h('div', { class: 'card-body', style: { padding: 0 } }, h('table', { class: 'table' },
        h('thead', h('tr', ['When', 'Caller', 'Call', 'Texted back', 'Voicemail', ''].map((t) => h('th', t)))),
        h('tbody', calls.map((k) => h('tr', { style: { cursor: 'default' } },
          h('td', dateTime(k.created_at)),
          h('td', h('a', { href: `#/messages/${k.contact_id}` }, h('b', k.first_name ? contactName({ ...k, phone_e164: k.from_number }) : 'Unknown')), h('div', { class: 'small muted' }, k.from_display)),
          h('td', h('span', { class: `badge ${label[k.status][1]}` }, label[k.status][0]), k.duration_seconds ? h('span', { class: 'small muted' }, ` ${Math.round(k.duration_seconds / 60)} min`) : null),
          h('td', k.texted_back ? h('span', { class: 'blue' }, '✓ Within seconds') : h('span', { class: 'muted' }, '–')),
          h('td', k.recording_url && k.recording_url !== 'demo-voicemail' ? h('a', { href: k.recording_url, target: '_blank', rel: 'noopener' }, 'Listen') : k.recording_url ? h('span', { class: 'small muted' }, 'Demo voicemail') : h('span', { class: 'muted' }, '–')),
          h('td', k.status === 'answered' || k.handled ? h('span', { class: 'small muted' }, k.status === 'answered' ? '' : 'Called back') : h('button', { class: 'btn sm soft', onclick: async () => { await post(`/messages/calls/${k.id}/handled`); toast('Marked as called back'); renderCalls(el); } }, 'Mark called back'))))))) : h('div', { class: 'empty' }, 'No calls yet. Once your business number is connected, every call is logged here – missed ones are texted back automatically.')));
}

// ───────────────────────── Alerts to the team's phone ─────────────────────────

async function renderAlerts(el, info) {
  const alerts = await get('/messages/alerts');
  const to = ukPhone(info.settings.alert_number || info.settings.forward_to);
  mount(el,
    h('div', { class: 'why small', style: { marginBottom: '14px' } }, to
      ? `New messages, missed calls, new bookings and the morning job sheet are sent to ${to} by ${info.settings.alert_channel === 'sms' ? 'text' : 'WhatsApp'}, so nothing is missed while you’re on a job.`
      : h('span', 'Add the mobile that should get alerts (new messages, missed calls, bookings and the morning job sheet) in ', h('a', { href: '#/settings/phone' }, 'Settings → Phone & WhatsApp'), '. Until then alerts appear in the app only.')),
    h('div', { class: 'card card-pad' }, alerts.length ? alerts.map((m) => h('div', { class: 'run-item' },
      h('div', { class: 'ico' }, channelIcon(m.channel)),
      h('div', { class: 'grow' }, h('div', { class: 'small muted' }, `${CHANNEL_LABELS[m.channel]} to ${ukPhone(m.to_addr)} · ${dateTime(m.created_at)} · ${messageStatus(m)}`), h('div', { style: { whiteSpace: 'pre-wrap' } }, m.body))))
      : h('div', { class: 'empty' }, 'No alerts sent yet.')));
}

// ───────────────────────── Try it ─────────────────────────

const randomMobile = () => `07700 900${String(Math.floor(Math.random() * 900) + 100)}`;

function simulateMessage(reload) {
  const text = h('textarea', { name: 'body', value: 'Hi, water is leaking through my kitchen ceiling – can someone come today?' });
  const presets = [
    ['🚨 Leak', 'Hi, water is leaking through my kitchen ceiling – can someone come today?'],
    ['Quote request', 'Hi, could I get a quote for a new bathroom radiator? Postcode BS7 8AB.'],
    ['C – confirm booking', 'C'],
    ['R – rearrange', 'R'],
    ['STOP', 'STOP'],
  ];
  const body = h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, 'Pretend to be a customer. This runs exactly what happens when a real WhatsApp or text arrives: the contact is found or created, emergencies are flagged, booking replies (C / R) are handled and the team is alerted.'),
    h('div', { class: 'grid g2' }, field('Channel', select('channel', [['whatsapp', 'WhatsApp'], ['sms', 'Text message']])), field('From (mobile)', h('input', { name: 'from', value: randomMobile() }))),
    field('Their name (as shown on WhatsApp)', h('input', { name: 'name', value: 'Jess Walker' })),
    h('div', { class: 'row', style: { gap: '6px' } }, presets.map(([l, v]) => h('button', { class: 'chip', type: 'button', onclick: () => { text.value = v; } }, l))),
    field('Message', text));
  modal('Test an incoming message', body, { actions: [{ label: 'Cancel' }, { label: 'Send it in', primary: true, onClick: async () => {
    const res = await post('/messages/simulate/inbound', formData(body));
    const what = { opted_out: 'They’ve been opted out of texts and WhatsApp.', opted_in: 'They’re opted back in.', booking_confirmed: 'Their next booking is marked as confirmed by the customer.', booking_reschedule: 'Their booking is flagged to rearrange and the team has a task.' }[res.handled];
    toast(what || (res.urgent ? '🚨 Flagged as an emergency – urgent task created and the team alerted' : 'Message received – reply task created and the team alerted'));
    announce(res.automations);
    location.hash = `#/messages/${res.contact.id}`;
    reload();
  } }] });
}

function simulateCall(reload) {
  const body = h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, 'Pretend someone rang the business number and nobody picked up (you’re up a ladder, driving or it’s after hours). They’re texted back straight away, a call-back task is made and the team is alerted.'),
    field('Caller’s number', h('input', { name: 'from', value: randomMobile() })),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'voicemail', style: { width: 'auto' } }), 'They left a voicemail'));
  modal('Test a missed call', body, { actions: [{ label: 'Cancel' }, { label: 'Ring and miss it', primary: true, onClick: async () => {
    const res = await post('/messages/simulate/missed-call', formData(body));
    toast(res.call.texted_back ? '📞 Missed call texted back in seconds and a call-back task created' : 'Call logged and a call-back task created (no text – they were texted in the last 30 minutes or opted out)');
    location.hash = '#/messages/calls';
    reload();
  } }] });
}


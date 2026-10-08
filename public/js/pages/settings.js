import { api, del, get, patch, post, put } from '../api.js';
import { refresh, state } from '../app.js';
import { applyBrandColor, avatar, confirmDialog, copyText, field, formData, h, icon, modal, mount, select, showError, titleCase, toast, ukPhone, PLATFORM_LABELS } from '../ui.js';
import { readLogo } from './agency.js';

const TABS = [['business', 'Business & team'], ['branding', 'Branding'], ['phone', 'Phone & WhatsApp'], ['wording', 'Message wording']];

export async function render(el, route) {
  const tab = TABS.some(([k]) => k === route?.parts?.[1]) ? route.parts[1] : 'business';
  const body = h('div');
  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Settings'), h('h1', { style: { marginTop: '6px' } }, 'Your ', h('span', { class: 'blue' }, 'business'), ' setup'),
        h('p', 'Run several businesses from one login – each has its own funnel, content, CRM, bookings, invoices, tasks and automations.')),
      h('div', { class: 'row' },
        state.meta?.require_passwords !== false ? h('button', { class: 'btn', onclick: changePassword }, 'Change my password') : null,
        h('button', { class: 'btn soft', onclick: addBusiness }, icon('plus'), 'Add another business'))),
    h('div', { class: 'tabs' }, TABS.map(([k, l]) => h('a', { href: `#/settings${k === 'business' ? '' : `/${k}`}`, class: tab === k ? 'active' : '' }, l))),
    body);
  if (tab === 'branding') return renderBranding(body);
  if (tab === 'phone') return renderPhone(body);
  if (tab === 'wording') return renderWording(body);
  return renderBusiness(body);
}

async function renderBusiness(el) {
  const [team, channels] = await Promise.all([get('/team'), get('/content/channels')]);
  const { org } = state.me;
  const reload = () => renderBusiness(el);
  const canEdit = state.me.role !== 'member';

  const orgForm = h('div', { class: 'stack' },
    field('Business name', h('input', { name: 'name', value: org.name })),
    field('Niche', select('niche', state.meta.niches.map((n) => [n.key, n.label]), org.niche), { help: 'Drives idea vocabulary, default pillars and audience insights.' }),
    field('Business type', select('business_type', [['service', 'Service'], ['product', 'Product'], ['hybrid', 'Both']], org.business_type)));

  mount(el,
    h('div', { class: 'grid g2', style: { alignItems: 'start' } },
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', 'Business profile'), canEdit ? h('button', { class: 'btn sm primary', onclick: async () => { try { await patch('/org', formData(orgForm)); toast('Saved'); refresh(); } catch (err) { showError(err); } } }, 'Save') : null),
        h('div', { class: 'card-body' }, orgForm)),

      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', 'Team'), canEdit ? h('button', { class: 'btn sm soft', onclick: () => invite(reload) }, icon('plus'), 'Add member') : null),
        h('div', { class: 'card-body' }, team.map((m) => h('div', { class: 'list-item' }, avatar(m.name),
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, m.name), h('div', { class: 'small muted' }, m.email)),
          h('span', { class: 'small muted' }, `${m.open_tasks} open · ${m.done_this_week} done this week`),
          h('span', { class: `badge ${m.role === 'owner' ? 'solid' : 'blue'}` }, titleCase(m.role)),
          canEdit && m.id !== state.me.user.id && (m.role !== 'owner' || state.me.role === 'owner') && state.meta?.require_passwords !== false
            ? h('button', { class: 'btn sm ghost', onclick: () => setPassword(m) }, 'Set password') : null)))),

      h('div', { class: 'card span2' },
        h('div', { class: 'card-head' }, h('h3', 'Publishing ', h('span', { class: 'blue' }, 'channels')), canEdit ? h('button', { class: 'btn sm soft', onclick: () => addChannel(reload) }, icon('plus'), 'Connect channel') : null),
        h('div', { class: 'card-body' },
          h('p', { class: 'small muted', style: { marginBottom: '8px' } }, 'Scheduled posts go out through each channel’s adapter. “Webhook” sends the post to Zapier, Make, n8n, Buffer or your own integration to publish on the real platform. “Simulated” is for demos and training.'),
          h('table', { class: 'table' },
            h('thead', h('tr', ['Platform', 'Handle', 'Adapter', 'Status', ''].map((c) => h('th', c)))),
            h('tbody', channels.map((c) => h('tr', { style: { cursor: 'default' } },
              h('td', h('b', PLATFORM_LABELS[c.platform])), h('td', c.handle),
              h('td', h('span', { class: 'badge blue' }, titleCase(c.adapter)), c.config?.webhook_url ? h('div', { class: 'small muted truncate', style: { maxWidth: '240px' } }, c.config.webhook_url) : null),
              h('td', h('button', { class: `switch ${c.active ? 'on' : ''}`, disabled: !canEdit, onclick: async () => { await patch(`/content/channels/${c.id}`, { active: !c.active }); reload(); } })),
              h('td', canEdit ? h('button', { class: 'btn sm ghost danger', onclick: async () => { if (await confirmDialog('Remove this channel?', 'Remove')) { await del(`/content/channels/${c.id}`); reload(); } } }, 'Remove') : null)))))))));
}

function invite(reload) {
  const body = h('div', { class: 'stack' },
    field('Name', h('input', { name: 'name' }), { required: true }),
    field('Email', h('input', { name: 'email', type: 'email' }), { required: true }),
    state.meta?.require_passwords !== false
      ? field('Temporary password', h('input', { name: 'password', type: 'text', value: Math.random().toString(36).slice(2, 12) }), { help: 'Share this with them – they can sign in straight away.' })
      : h('p', { class: 'small muted' }, 'They can sign in straight away with just their email (passwords are switched off while you test).'),
    field('Role', select('role', [['member', 'Member'], ['admin', 'Admin']])));
  modal('Add a team member', body, { actions: [{ label: 'Cancel' }, { label: 'Add', primary: true, onClick: async () => { await post('/team', formData(body)); toast('Team member added'); reload(); } }] });
}

function addChannel(reload) {
  const url = h('input', { name: 'webhook_url', placeholder: 'https://hooks.zapier.com/…' });
  const urlField = field('Webhook URL', url);
  const adapter = select('adapter', [['simulated', 'Simulated (demo)'], ['webhook', 'Webhook (Zapier / Make / custom)']]);
  urlField.style.display = 'none';
  adapter.addEventListener('change', () => { urlField.style.display = adapter.value === 'webhook' ? '' : 'none'; });
  const body = h('div', { class: 'stack' },
    field('Platform', select('platform', Object.entries(PLATFORM_LABELS))),
    field('Handle / account name', h('input', { name: 'handle', placeholder: '@yourbusiness' }), { required: true }),
    field('Adapter', adapter), urlField);
  modal('Connect a channel', body, { actions: [{ label: 'Cancel' }, { label: 'Connect', primary: true, onClick: async () => { await post('/content/channels', formData(body)); toast('Channel connected'); reload(); } }] });
}

function addBusiness() {
  const body = h('div', { class: 'stack' },
    field('Business name', h('input', { name: 'name' }), { required: true }),
    field('What is it?', select('kind', [['business', 'A business'], ['agency', 'My agency – I set up and run systems for client businesses']])),
    field('Niche', select('niche', state.meta.niches.map((n) => [n.key, n.label]))),
    field('Business type', select('business_type', [['service', 'Service'], ['product', 'Product'], ['hybrid', 'Both']])),
    h('div', { class: 'why small' }, 'We’ll set up content pillars, audience insights, channels and all recommended automations for the niche.'));
  modal('Add another business', body, { actions: [{ label: 'Cancel' }, { label: 'Create business', primary: true, onClick: async () => {
    const org = await post('/orgs', formData(body));
    await post('/auth/switch', { org_id: org.id });
    toast(`Switched to ${org.name}`);
    location.hash = '#/';
    refresh();
  } }] });
}

function changePassword() {
  const body = h('div', { class: 'stack' },
    field('Current password', h('input', { name: 'current_password', type: 'password', autocomplete: 'current-password' })),
    field('New password', h('input', { name: 'new_password', type: 'password', minLength: 8, autocomplete: 'new-password' }), { help: 'At least 8 characters' }));
  modal('Change my password', body, { actions: [{ label: 'Cancel' }, { label: 'Save password', primary: true, onClick: async () => { await post('/me/password', formData(body)); toast('Password changed'); } }] });
}

function setPassword(member) {
  const body = h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, `Set a new password for ${member.name}, then share it with them. They can change it in Settings.`),
    field('New password', h('input', { name: 'password', type: 'text', value: Math.random().toString(36).slice(2, 12) }), { help: 'At least 8 characters' }));
  modal(`Set password for ${member.name}`, body, { actions: [{ label: 'Cancel' }, { label: 'Set password', primary: true, onClick: async () => { await post(`/team/${member.id}/password`, formData(body)); toast(`Password set for ${member.name}`); } }] });
}

// ───────────────────────── Branding ─────────────────────────

function renderBranding(el) {
  const { org } = state.me;
  const brand = org.brand || {};
  const canEdit = state.me.role !== 'member';
  let logo = brand.logo || '';
  const preview = h('div', { class: 'logo-preview' }, logo ? h('img', { src: logo, alt: '' }) : h('span', { class: 'small muted' }, 'No logo'));
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml,image/webp', disabled: !canEdit });
  file.onchange = () => readLogo(file.files[0], (data) => { logo = data; mount(preview, h('img', { src: data, alt: '' })); });
  const color = h('input', { name: 'color', type: 'color', value: brand.color || '#1e6a9e', disabled: !canEdit, oninput: () => applyBrandColor(color.value) });
  const form = h('div', { class: 'card card-pad stack', style: { maxWidth: '720px' } },
    h('h3', 'Your ', h('span', { class: 'blue' }, 'brand')),
    h('p', { class: 'small muted' }, 'Your name, logo and colour appear in this system for your team, and on everything customers see: the booking page, quotes, invoices, forms and reports.'),
    field('Business name shown to customers', h('input', { name: 'display_name', value: brand.display_name || org.name, disabled: !canEdit })),
    h('div', { class: 'row', style: { alignItems: 'flex-end' } }, preview, h('div', { class: 'grow' }, field('Logo (PNG, JPG, SVG or WebP)', file)), logo && canEdit ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { logo = ''; mount(preview, h('span', { class: 'small muted' }, 'No logo')); } }, 'Remove') : null),
    h('div', { class: 'row' }, field('Main colour', color), h('div', { class: 'swatches' }, ['#1e6a9e', '#0f766e', '#7c3aed', '#be123c', '#c2410c', '#15803d', '#1f2937'].map((c) => h('button', { type: 'button', class: 'swatch', style: { background: c }, title: c, disabled: !canEdit, onclick: () => { color.value = c; applyBrandColor(c); } }))),
      h('button', { class: 'btn sm ghost', type: 'button', disabled: !canEdit, onclick: () => { color.value = '#1e6a9e'; applyBrandColor(null); } }, 'Reset to default')),
    state.me.agency ? h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'hide_powered_by', checked: Boolean(brand.hide_powered_by), disabled: !canEdit, style: { width: 'auto' } }), `Hide “Powered by ${state.me.agency.name}”`) : null,
    canEdit ? h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn primary', onclick: async () => {
      const f = formData(form);
      try {
        await api('/org/brand', { method: 'PATCH', body: { display_name: f.display_name, color: f.color === '#1e6a9e' ? '' : f.color, logo, hide_powered_by: f.hide_powered_by } });
        toast('Branding saved');
        refresh();
      } catch (err) { showError(err); }
    } }, 'Save branding')) : h('p', { class: 'small muted' }, 'Only owners and admins can change the branding.'));
  mount(el, form);
}

// ───────────────────────── Phone & WhatsApp ─────────────────────────

async function renderPhone(el) {
  const info = await get('/messages/settings');
  const s = info.settings;
  const canEdit = state.me.role !== 'member';
  const check = (name, checked, label) => h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name, checked, disabled: !canEdit, style: { width: 'auto' } }), label);
  const input = (name, value, attrs = {}) => h('input', { name, value: value || '', disabled: !canEdit, ...attrs });
  const statusBadge = (ok, label) => h('span', { class: `badge ${ok ? 'green' : ''}` }, `${ok ? '✓' : '○'} ${label}`);
  const form = h('div', { class: 'grid g2', style: { alignItems: 'start' } },
    h('div', { class: 'card card-pad stack span2' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', 'Never miss a ', h('span', { class: 'blue' }, 'call or message')),
        h('div', { class: 'row', style: { gap: '6px' } }, statusBadge(info.status.twilio, 'Texts, WhatsApp & calls (Twilio)'), statusBadge(info.status.email, 'Email'), statusBadge(info.status.stripe, 'Card payments'))),
      h('p', { class: 'small muted' }, 'Built for trades like plumbers and electricians who are on the tools all day. Calls to your business number ring your mobile; if you can’t answer, the caller is texted straight back with your booking link, you get an alert, and a call-back task is made. WhatsApp and text messages land in Messages and on the customer’s record. Words like “leak” or “no power” flag an emergency.'),
      info.status.mode === 'demo' ? h('div', { class: 'why small' }, h('b', 'Demo mode: '), 'everything works and is saved, but texts, WhatsApp messages and emails aren’t actually sent until Twilio and an email service are connected on the server (see the set-up steps below). Use the Test buttons in Messages to try it.') : null),
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Your ', h('span', { class: 'blue' }, 'numbers')),
      field('Business phone number (customers call and text this)', input('business_number', ukPhone(s.business_number), { placeholder: 'e.g. 0117 496 0000' }), { help: 'A Twilio number. Put it on your van, website and Google profile.' }),
      field('WhatsApp Business number', input('whatsapp_number', ukPhone(s.whatsapp_number), { placeholder: 'Often the same as above' })),
      field('Ring this mobile when someone calls', input('forward_to', ukPhone(s.forward_to), { placeholder: 'e.g. 07700 900123' })),
      h('div', { class: 'grid g2' }, field('Ring for (seconds)', input('ring_seconds', s.ring_seconds, { type: 'number', min: 5, max: 60 })), h('div', { style: { paddingTop: '26px' } }, check('voicemail', s.voicemail, 'Offer voicemail'))),
      check('missed_call_text_back', s.missed_call_text_back, 'Text missed callers straight back (with your booking link)')),
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Alerts to ', h('span', { class: 'blue' }, 'your phone')),
      field('Send alerts to', input('alert_number', ukPhone(s.alert_number), { placeholder: 'Leave blank to use the mobile above' })),
      field('Send them by', select('alert_channel', [['whatsapp', 'WhatsApp'], ['sms', 'Text message'], ['none', 'Don’t – in the app only']], s.alert_channel)),
      h('p', { class: 'small muted' }, 'You’ll get: new customer messages (🚨 for emergencies), missed calls, new bookings, customers asking to rearrange, unpaid invoices that need a call, and the morning job sheet.'),
      field('Emergency words', h('textarea', { name: 'emergency_keywords', value: s.emergency_keywords, disabled: !canEdit, style: { minHeight: '70px' } }), { help: 'Separated by commas. Messages containing any of these are flagged 🚨 and alert everyone.' })),
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Sending ', h('span', { class: 'blue' }, 'rules')),
      check('whatsapp_enabled', s.whatsapp_enabled, 'WhatsApp'), check('sms_enabled', s.sms_enabled, 'Text messages'), check('email_enabled', s.email_enabled, 'Email'),
      check('quiet_enabled', s.quiet_hours.enabled, 'Quiet hours – hold automatic texts and WhatsApps to customers overnight'),
      h('div', { class: 'grid g2' }, field('From', h('input', { type: 'time', name: 'quiet_start', value: s.quiet_hours.start, disabled: !canEdit })), field('Until', h('input', { type: 'time', name: 'quiet_end', value: s.quiet_hours.end, disabled: !canEdit }))),
      h('p', { class: 'small muted' }, 'Replies to customers and missed-call texts always go straight away. Anyone who replies STOP is never texted again (START opts them back in).'),
      h('div', { class: 'grid g2' }, field('Emails come from (name)', input('email_from_name', s.email_from_name, { placeholder: state.me.org.name })), field('Replies go to (email)', input('email_reply_to', s.email_reply_to, { type: 'email' })))),
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Links'),
      field('Google review link', input('review_link', s.review_link, { placeholder: 'https://g.page/r/…' }), { help: 'Sent to customers after each completed job.' }),
      field('Zapier / Make webhook (optional)', input('webhook_url', s.webhook_url, { placeholder: 'https://hooks.zapier.com/…' }), { help: 'If set and Twilio isn’t, messages are handed to this webhook to send.' }),
      info.setup.whatsapp_link ? h('div', { class: 'stack', style: { gap: '6px' } }, h('b', { class: 'small' }, '“Message us on WhatsApp” link for your website'), h('div', { class: 'copy-row' }, h('input', { value: info.setup.whatsapp_link, readOnly: true }), h('button', { class: 'btn sm', onclick: () => copyText(info.setup.whatsapp_link) }, icon('copy'), 'Copy'))) : null),
    h('div', { class: 'card card-pad stack span2' },
      h('h3', 'Going ', h('span', { class: 'blue' }, 'live'), ' (one-off set-up)'),
      h('ol', { class: 'small', style: { margin: 0, paddingLeft: '18px', display: 'grid', gap: '6px' } },
        h('li', 'Create a Twilio account, buy a UK number and put your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in the server’s .env file.'),
        h('li', 'In Twilio, set the number’s “A call comes in” webhook to:', setupLine(info.setup.voice_url)),
        h('li', 'Set “A message comes in” (and the WhatsApp sender’s incoming webhook) to:', setupLine(info.setup.messaging_url)),
        h('li', 'For WhatsApp, register your number as a WhatsApp sender in Twilio (Meta approval takes a few days). To send reminders more than 24 hours after a customer last messaged, approve templates in Twilio with the same wording as Message wording.'),
        h('li', 'For email, add RESEND_API_KEY and EMAIL_FROM (on a domain verified with Resend).'),
        h('li', 'For card payments, add STRIPE_SECRET_KEY and a webhook in Stripe pointing to:', setupLine(info.setup.stripe_webhook_url), ' (event: checkout.session.completed), then STRIPE_WEBHOOK_SECRET.'),
        h('li', 'Optional – forward emails or other apps’ messages into Messages by posting { from, name, text } to:', setupLine(info.setup.inbound_url)))));
  mount(el, form, canEdit ? h('div', { class: 'row', style: { marginTop: '16px', justifyContent: 'flex-end' } }, h('button', { class: 'btn primary', onclick: async () => {
    const f = formData(form);
    const payload = { ...f, ring_seconds: Number(f.ring_seconds), quiet_hours: { enabled: f.quiet_enabled, start: f.quiet_start, end: f.quiet_end } };
    delete payload.quiet_enabled; delete payload.quiet_start; delete payload.quiet_end;
    try { await put('/messages/settings', payload); toast('Saved'); renderPhone(el); } catch (err) { showError(err); }
  } }, 'Save')) : null);
}

const setupLine = (url) => h('div', { class: 'copy-row', style: { marginTop: '4px' } }, h('input', { value: url, readOnly: true }), h('button', { class: 'btn sm', onclick: () => copyText(url) }, icon('copy'), 'Copy'));

// ───────────────────────── Message wording ─────────────────────────

async function renderWording(el) {
  const templates = await get('/messages/templates');
  const canEdit = state.me.role !== 'member';
  const groups = [...new Set(templates.map((t) => t.group))];
  mount(el,
    h('div', { class: 'why small', style: { marginBottom: '14px' } }, 'This is the wording of every message the system sends on its own. Edit any of them to sound like you. Words in {{double brackets}} are filled in automatically – e.g. {{first_name_spaced}} becomes “ Sam” (or nothing if we don’t know their name), {{booking_link}} is your booking page.'),
    groups.map((g) => h('div', { class: 'card', style: { marginBottom: '14px' } },
      h('div', { class: 'card-head' }, h('h3', g)),
      h('div', { class: 'card-body' }, templates.filter((t) => t.group === g).map((t) => h('div', { class: 'list-item', style: { alignItems: 'flex-start' } },
        h('div', { class: 'grow' }, h('b', t.label), t.customised ? h('span', { class: 'badge blue', style: { marginLeft: '6px' } }, 'Edited') : null, h('div', { class: 'small muted', style: { whiteSpace: 'pre-wrap', marginTop: '4px' } }, t.body)),
        canEdit ? h('button', { class: 'btn sm ghost', onclick: () => editTemplate(t, () => renderWording(el)) }, icon('edit'), 'Edit') : null))))));
}

function editTemplate(t, done) {
  const body = h('div', { class: 'stack' },
    t.subject !== undefined && t.subject !== null ? field('Email subject', h('input', { name: 'subject', value: t.subject })) : null,
    field('Message', h('textarea', { name: 'body', value: t.body, style: { minHeight: '140px' } }), { help: 'Keep texts under about 300 characters so they arrive as one message.' }));
  const actions = [{ label: 'Cancel' }];
  if (t.customised) actions.push({ label: 'Reset to default', onClick: async () => { await del(`/messages/templates/${t.key}`); toast('Back to the default wording'); done(); } });
  actions.push({ label: 'Save', primary: true, onClick: async () => { await put(`/messages/templates/${t.key}`, formData(body)); toast('Saved'); done(); } });
  modal(t.label, body, { wide: true, actions });
}

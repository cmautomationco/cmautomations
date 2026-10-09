import { api, del, get, patch, post, put } from '../api.js';
import { refresh, state } from '../app.js';
import { applyBrandColor, avatar, confirmDialog, copyText, field, formData, h, icon, modal, mount, select, showError, titleCase, toast, ukPhone, PLATFORM_LABELS } from '../ui.js';
import { readLogo } from './agency.js';

const TABS = [['business', 'Business & team'], ['branding', 'Branding'], ['phone', 'Phone & alerts'], ['whatsapp', 'WhatsApp'], ['connections', 'Connections'], ['wording', 'Message wording']];

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
  if (tab === 'whatsapp') return renderWhatsapp(body);
  if (tab === 'connections') return renderConnections(body);
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
      info.status.mode === 'demo' ? h('div', { class: 'why small' }, h('b', 'Not connected yet: '), 'everything works and is saved, but texts, WhatsApp messages and emails aren’t actually sent until your Twilio and email accounts are connected – ', h('a', { href: '#/settings/connections' }, 'Settings → Connections'), '. Until then, use the Test buttons in Messages to try it.') : null),
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
      check('auto_reply', s.auto_reply, 'Reply straight away to new messages (“we’re on a job – reply BOOK to book”), once every 12 hours per customer'),
      check('emergency_auto_reply', s.emergency_auto_reply, 'Reply straight away to emergencies (“we’ve flagged this as urgent”)'),
      h('div', { class: 'grid g2' }, field('Emails come from (name)', input('email_from_name', s.email_from_name, { placeholder: state.me.org.name })), field('Replies go to (email)', input('email_reply_to', s.email_reply_to, { type: 'email' })))),
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Links'),
      field('Google review link', input('review_link', s.review_link, { placeholder: 'https://g.page/r/…' }), { help: 'Sent to customers after each completed job.' }),
      field('Zapier / Make webhook (optional)', input('webhook_url', s.webhook_url, { placeholder: 'https://hooks.zapier.com/…' }), { help: 'If set and Twilio isn’t, messages are handed to this webhook to send.' }),
      info.setup.whatsapp_link ? h('div', { class: 'stack', style: { gap: '6px' } }, h('b', { class: 'small' }, '“Message us on WhatsApp” link for your website'), h('div', { class: 'copy-row' }, h('input', { value: info.setup.whatsapp_link, readOnly: true }), h('button', { class: 'btn sm', onclick: () => copyText(info.setup.whatsapp_link) }, icon('copy'), 'Copy'))) : null),
    h('div', { class: 'card card-pad stack span2' },
      h('h3', 'Going ', h('span', { class: 'blue' }, 'live')),
      h('p', { class: 'small' }, 'Connect your Twilio (phone & WhatsApp), Stripe (card payments) and email accounts in ', h('a', { href: '#/settings/connections' }, 'Settings → Connections'), ' – each one has a Test button, and one click points your number at this system. WhatsApp set-up and approved message templates are in ', h('a', { href: '#/settings/whatsapp' }, 'Settings → WhatsApp'), '.'),
      h('p', { class: 'small muted' }, 'Optional – forward emails or other apps’ messages into Messages by posting { from, name, text } to:'), setupLine(info.setup.inbound_url)));
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

// ───────────────────────── Connections (Twilio, Stripe, email) ─────────────────────────

async function renderConnections(el) {
  const info = await get('/integrations');
  const st = info.status;
  const canEdit = state.me.role !== 'member';
  const reload = () => renderConnections(el);
  const result = (box, r) => mount(box, h('div', { class: `conn-result ${r.ok ? 'ok' : 'bad'}` },
    h('b', r.ok ? '✓ Working' : '✗ Not working yet'), r.account ? ` – ${r.account}` : '', r.message ? h('div', r.message) : null, r.warning ? h('div', { class: 'small', style: { color: 'var(--amber)' } }, r.warning) : null,
    r.numbers?.length ? h('ul', { class: 'small' }, r.numbers.map((n) => h('li', `${ukPhone(n.number)}: ${n.found ? (n.voice && n.sms ? 'calls and texts come here ✓' : 'found – press “Point my numbers here”') : (n.message || 'not in this Twilio account')}`))) : null));
  const run = async (btn, box, fn) => { btn.disabled = true; mount(box, h('div', { class: 'small muted' }, 'Checking…')); try { result(box, await fn()); } catch (err) { result(box, { ok: false, message: err.message }); } finally { btn.disabled = false; } };
  const badge = (c) => (c.connected ? h('span', { class: 'badge green' }, c.source === 'server' ? '✓ Connected (server account)' : '✓ Connected') : h('span', { class: 'badge' }, 'Not connected'));
  const disabled = !canEdit || info.demo;

  const card = (title, sub, c, fields, extra, kind) => {
    const box = h('div');
    const form = h('div', { class: 'stack' }, fields);
    const checkBtn = h('button', { class: 'btn sm', disabled: disabled || !c.connected, onclick: (e) => run(e.currentTarget, box, () => post(`/integrations/${kind}/check`)) }, 'Test connection');
    return h('div', { class: 'card card-pad stack' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', title), badge(c)),
      h('p', { class: 'small muted' }, sub),
      c.broken ? h('div', { class: 'small', style: { color: 'var(--red)' } }, 'The saved keys can’t be read (the server’s APP_SECRET changed) – please enter them again.') : null,
      form,
      h('div', { class: 'row' },
        h('button', { class: 'btn sm primary', disabled, onclick: async () => {
          try { await put(`/integrations/${kind}`, formData(form)); toast('Saved – keys are stored encrypted'); reload(); } catch (err) { showError(err); }
        } }, c.connected && c.source === 'business' ? 'Update' : 'Connect'),
        checkBtn, ...(extra ? extra(box) : []),
        c.connected && c.source === 'business' ? h('button', { class: 'btn sm ghost danger', disabled, onclick: async () => { if (await confirmDialog('Disconnect this account? Messages or payments that use it will stop.', 'Disconnect')) { await del(`/integrations/${kind}`); reload(); } } }, 'Disconnect') : null),
      box);
  };
  const secret = (name, label, placeholder, help) => field(label, h('input', { name, type: 'password', autocomplete: 'off', placeholder, disabled }), { help });

  mount(el,
    info.demo ? h('div', { class: 'why small', style: { marginBottom: '14px' } }, h('b', 'This is the test build. '), 'It runs entirely in your browser, so it can’t hold real keys or reach Twilio, Stripe or email. On your live server this page connects your real accounts – see the go-live guide (docs/GO-LIVE.md).') : null,
    !info.setup.https && !info.demo ? h('div', { class: 'why small', style: { marginBottom: '14px', borderColor: 'var(--amber)' } }, h('b', 'PUBLIC_URL isn’t an https address yet. '), `Twilio and Stripe need to reach this system at a public https address (currently ${info.setup.public_url}). Set PUBLIC_URL on the server.`) : null,
    h('div', { class: 'grid g2', style: { alignItems: 'start' } },
      card('Twilio – phone, texts & WhatsApp',
        'Your business number: calls ring your mobile, missed callers are texted back, and texts and WhatsApp messages come in and go out. Find these in the Twilio console under Account info.',
        st.twilio, [
          field('Account SID', h('input', { name: 'accountSid', placeholder: st.twilio.connected ? st.twilio.account : 'AC…', autocomplete: 'off', disabled })),
          secret('authToken', 'Auth Token', st.twilio.connected ? 'Saved – leave blank to keep' : '32 letters and numbers'),
        ],
        (box) => [h('button', { class: 'btn sm soft', disabled: disabled || !st.twilio.connected, onclick: (e) => run(e.currentTarget, box, () => post('/integrations/twilio/connect-numbers')) }, 'Point my numbers here')], 'twilio'),
      card('Stripe – card payments',
        `Customers pay invoices and deposits by card. The money goes straight into ${info.is_client ? 'this business’s' : 'your'} own Stripe account. Find the secret key in Stripe → Developers → API keys.`,
        st.stripe, [
          secret('secretKey', 'Secret key', st.stripe.connected ? `Saved (${st.stripe.key}) – leave blank to keep` : 'sk_live_…'),
          st.stripe.connected && st.stripe.source === 'business' ? h('div', { class: 'small' }, st.stripe.webhook ? '✓ Payment notifications are set up' : 'Payment notifications aren’t set up yet – press “Set up payment notifications”.') : null,
        ],
        (box) => [h('button', { class: 'btn sm soft', disabled: disabled || st.stripe.source !== 'business', onclick: (e) => run(e.currentTarget, box, () => post('/integrations/stripe/webhook')) }, 'Set up payment notifications')], 'stripe'),
      card('Email – Resend',
        'Booking confirmations, quotes, invoices and reports by email, from your own address. Add your domain in Resend first (it gives you DNS records to add), then paste an API key here.',
        st.email, [
          secret('apiKey', 'API key', st.email.connected ? `Saved (${st.email.key}) – leave blank to keep` : 're_…'),
          field('Send emails from', h('input', { name: 'from', type: 'email', value: st.email.from || '', placeholder: 'bookings@yourbusiness.co.uk', disabled }), { help: 'Must be on a domain verified in Resend.' }),
        ], null, 'email'),
      h('div', { class: 'card card-pad stack' },
        h('h3', 'Send a ', h('span', { class: 'blue' }, 'real test message')),
        h('p', { class: 'small muted' }, 'Sends a real message to your own phone or inbox through the connected account, and shows exactly what came back.'),
        (() => {
          const box = h('div');
          const form = h('div', { class: 'grid g2' }, field('By', select('channel', [['whatsapp', 'WhatsApp'], ['sms', 'Text message'], ['email', 'Email']])), field('To', h('input', { name: 'to', placeholder: '07700 900123 or you@example.com', disabled })));
          return h('div', { class: 'stack' }, form, h('button', { class: 'btn sm primary', disabled, onclick: async (e) => {
            e.currentTarget.disabled = true;
            try {
              const r = await post('/integrations/test-message', formData(form));
              result(box, { ok: r.status === 'sent', account: r.status === 'sent' ? `sent (${r.provider_id || r.provider})` : '', message: r.error });
            } catch (err) { showError(err); } finally { e.currentTarget.disabled = disabled; }
          } }, icon('send'), 'Send test'), box,
          h('p', { class: 'small muted' }, 'WhatsApp tip: a business can only send free-text WhatsApp messages to someone who has messaged it in the last 24 hours. Send your business’s WhatsApp number a “hi” first, then test.'));
        })())),
    h('div', { class: 'card card-pad stack', style: { marginTop: '16px' } },
      h('h3', 'Where Twilio and Stripe send things'),
      h('p', { class: 'small muted' }, '“Point my numbers here” and “Set up payment notifications” fill these in for you. For a WhatsApp sender, paste the messages address into Twilio → Messaging → Senders → WhatsApp senders → your number.'),
      field('Calls (“A call comes in”)', setupLine(info.setup.voice_url)),
      field('Texts and WhatsApp (“A message comes in”)', setupLine(info.setup.messaging_url)),
      field('Delivery receipts', setupLine(info.setup.status_url)),
      field('Stripe payment notifications', setupLine(info.setup.stripe_webhook_url))));
}

// ───────────────────────── WhatsApp ─────────────────────────

async function renderWhatsapp(el) {
  const [info, booking, templates] = await Promise.all([get('/messages/settings'), get('/bookings/settings'), get('/messages/templates')]);
  const canEdit = state.me.role !== 'member';
  const s = info.settings;
  const needed = templates.filter((t) => t.whatsapp?.needed);
  const done = needed.filter((t) => t.whatsapp.content_sid).length;
  const toggle = (checked, label, onChange) => {
    const box = h('input', { type: 'checkbox', checked, disabled: !canEdit, style: { width: 'auto' } });
    box.onchange = () => onChange(box.checked).catch(showError);
    return h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, box, label);
  };
  mount(el,
    h('div', { class: 'grid g2', style: { alignItems: 'start' } },
      h('div', { class: 'card card-pad stack' },
        h('h3', 'Book, move and cancel ', h('span', { class: 'blue' }, 'on WhatsApp')),
        h('p', { class: 'small' }, 'Customers message BOOK and pick a service, a day and a time by replying with numbers. The assistant asks for their name and address if needed, books it, sends the confirmation and tells your team. Reminders say “reply C to confirm or R to rearrange” – R offers new times right there, and CANCEL cancels (inside your notice period it asks the team to call instead).'),
        toggle(booking.settings.chat_booking, 'Customers can book, move and cancel by WhatsApp or text', async (on) => { await put('/bookings/settings', { chat_booking: on }); toast(on ? 'The booking assistant is on' : 'The booking assistant is off – BOOK and R messages go to the team'); }),
        toggle(s.auto_reply, 'Reply straight away to new messages, inviting them to book', async (on) => { await put('/messages/settings', { auto_reply: on }); toast('Saved'); }),
        info.setup.whatsapp_book_link ? h('div', { class: 'stack', style: { gap: '6px' } },
          h('b', { class: 'small' }, '“Book on WhatsApp” link – for your website, Google profile, Facebook and van'),
          h('div', { class: 'copy-row' }, h('input', { value: info.setup.whatsapp_book_link, readOnly: true }), h('button', { class: 'btn sm', onclick: () => copyText(info.setup.whatsapp_book_link) }, icon('copy'), 'Copy')),
          h('div', { class: 'copy-row' }, h('input', { value: `<a href="${info.setup.whatsapp_book_link}">Book on WhatsApp</a>`, readOnly: true }), h('button', { class: 'btn sm', onclick: () => copyText(`<a href="${info.setup.whatsapp_book_link}" style="background:#25D366;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Book on WhatsApp</a>`, 'Website button copied') }, icon('copy'), 'Website button')))
          : h('p', { class: 'small', style: { color: 'var(--amber)' } }, 'Add your WhatsApp number in Settings → Phone & alerts to get your “Book on WhatsApp” link.'),
        h('a', { class: 'btn sm soft', href: '#/messages' }, icon('whatsapp'), 'Try it: Messages → Test an incoming WhatsApp → “BOOK”')),
      h('div', { class: 'card card-pad stack' },
        h('h3', 'Setting up ', h('span', { class: 'blue' }, 'WhatsApp')),
        h('ol', { class: 'small', style: { margin: 0, paddingLeft: '18px', display: 'grid', gap: '6px' } },
          h('li', 'Connect Twilio in ', h('a', { href: '#/settings/connections' }, 'Settings → Connections'), '.'),
          h('li', 'In Twilio, go to Messaging → Senders → WhatsApp senders and register your business number. You’ll link it to your Meta (Facebook) Business account; approval usually takes a few days. To test before that, Twilio’s WhatsApp Sandbox works with the same settings.'),
          h('li', 'Set the sender’s “Webhook URL for incoming messages” to the messages address shown in Settings → Connections.'),
          h('li', 'Put the number in Settings → Phone & alerts as your WhatsApp number.'),
          h('li', 'Approve the message templates below, so reminders and invoices can reach customers who haven’t messaged you in the last 24 hours. Until a template is approved, that message goes as a normal text instead – nothing is lost.')),
        h('div', { class: 'small' }, h('b', `${done} of ${needed.length}`), ' message templates approved.'))),
    h('div', { class: 'card', style: { marginTop: '16px' } },
      h('div', { class: 'card-head' }, h('h3', 'WhatsApp message ', h('span', { class: 'blue' }, 'templates'))),
      h('div', { class: 'card-body stack' },
        h('p', { class: 'small muted' }, 'WhatsApp only delivers business-started messages that Meta has approved. For each message: open Twilio → Messaging → Content Template Builder → Create new, choose WhatsApp (Utility), paste the text exactly as shown (with {{1}}, {{2}}…), submit it, and when approved paste its Content SID (HX…) here. The system fills in the numbers when sending.'),
        needed.map((t) => {
          const sidInput = h('input', { value: t.whatsapp.content_sid, placeholder: 'HX… (after approval)', disabled: !canEdit });
          return h('div', { class: 'wa-template' },
            h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', t.label), t.whatsapp.content_sid ? h('span', { class: 'badge green' }, '✓ Approved') : h('span', { class: 'badge' }, 'Goes as a text until approved')),
            h('div', { class: 'pre small' }, t.whatsapp.text),
            h('div', { class: 'small muted' }, `Template name suggestion: ${t.key} · Placeholders: ${t.whatsapp.variables.map((v, i) => `{{${i + 1}}} = ${v.replace(/_/g, ' ')}`).join(', ')}`),
            h('div', { class: 'copy-row' },
              h('button', { class: 'btn sm', onclick: () => copyText(t.whatsapp.text, 'Template text copied') }, icon('copy'), 'Copy text'),
              sidInput,
              canEdit ? h('button', { class: 'btn sm soft', onclick: async () => { try { await put(`/messages/templates/${t.key}/whatsapp`, { content_sid: sidInput.value }); toast(sidInput.value ? 'Saved – this message now goes on WhatsApp' : 'Removed'); renderWhatsapp(el); } catch (err) { showError(err); } } }, 'Save') : null));
        }))));
}

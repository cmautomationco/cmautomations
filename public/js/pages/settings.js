import { del, get, patch, post } from '../api.js';
import { refresh, state } from '../app.js';
import { avatar, confirmDialog, field, formData, h, icon, modal, mount, select, showError, titleCase, toast, PLATFORM_LABELS } from '../ui.js';

export async function render(el) {
  const [team, channels] = await Promise.all([get('/team'), get('/content/channels')]);
  const { org } = state.me;
  const reload = () => render(el);
  const canEdit = state.me.role !== 'member';

  const orgForm = h('div', { class: 'stack' },
    field('Business name', h('input', { name: 'name', value: org.name })),
    field('Niche', select('niche', state.meta.niches.map((n) => [n.key, n.label]), org.niche), { help: 'Drives idea vocabulary, default pillars and audience insights.' }),
    field('Business type', select('business_type', [['service', 'Service'], ['product', 'Product'], ['hybrid', 'Both']], org.business_type)));

  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Settings'), h('h1', { style: { marginTop: '6px' } }, 'Your ', h('span', { class: 'blue' }, 'business'), ' setup'),
        h('p', 'Run several businesses from one login – each has its own funnel, content, CRM, tasks and automations.')),
      h('button', { class: 'btn soft', onclick: addBusiness }, icon('plus'), 'Add another business')),
    h('div', { class: 'grid g2', style: { alignItems: 'start' } },
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', 'Business profile'), canEdit ? h('button', { class: 'btn sm primary', onclick: async () => { try { await patch('/org', formData(orgForm)); toast('Saved'); refresh(); } catch (err) { showError(err); } } }, 'Save') : null),
        h('div', { class: 'card-body' }, orgForm)),

      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', 'Team'), canEdit ? h('button', { class: 'btn sm soft', onclick: () => invite(reload) }, icon('plus'), 'Add member') : null),
        h('div', { class: 'card-body' }, team.map((m) => h('div', { class: 'list-item' }, avatar(m.name),
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, m.name), h('div', { class: 'small muted' }, m.email)),
          h('span', { class: 'small muted' }, `${m.open_tasks} open · ${m.done_this_week} done this week`),
          h('span', { class: `badge ${m.role === 'owner' ? 'solid' : 'blue'}` }, titleCase(m.role)))))),

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
    field('Temporary password', h('input', { name: 'password', type: 'text', value: Math.random().toString(36).slice(2, 12) }), { help: 'Share this with them – they can sign in straight away.' }),
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

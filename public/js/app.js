import { auth, get, post } from './api.js';
import { ago, applyBrandColor, avatar, field, formData, h, icon, mount, select, showError, toast } from './ui.js';
import * as dashboard from './pages/dashboard.js';
import * as funnel from './pages/funnel.js';
import * as content from './pages/content.js';
import * as crm from './pages/crm.js';
import * as tasks from './pages/tasks.js';
import * as automations from './pages/automations.js';
import * as settings from './pages/settings.js';
import * as helpdesk from './pages/helpdesk.js';
import * as messages from './pages/messages.js';
import * as bookings from './pages/bookings.js';
import * as invoices from './pages/invoices.js';
import * as agency from './pages/agency.js';
import { PUBLIC_PAGES, renderPublic } from './public.js';
import { setAssistantVisible } from './assistant.js';

const root = document.getElementById('app');
export const state = { me: null, meta: null };

const NAV = [
  { section: 'Overview' },
  { path: '/', label: 'Dashboard', icon: 'home', page: dashboard },
  { path: '/agency', label: 'Agency', icon: 'briefcase', page: agency, when: (me) => me.agency_access },
  { section: 'Build' },
  { path: '/funnel', label: 'Build Funnel', icon: 'rocket', page: funnel },
  { path: '/content', label: 'Content Studio', icon: 'sparkles', page: content },
  { section: 'Run' },
  { path: '/messages', label: 'Messages', icon: 'inbox', page: messages, badge: 'messages' },
  { path: '/bookings', label: 'Bookings', icon: 'calendar', page: bookings },
  { path: '/crm', label: 'CRM', icon: 'users', page: crm },
  { path: '/invoices', label: 'Quotes & invoices', icon: 'receipt', page: invoices },
  { path: '/tasks', label: 'Tasks', icon: 'check', page: tasks },
  { path: '/automations', label: 'Automations', icon: 'zap', page: automations },
  { path: '/helpdesk', label: 'Help Desk', icon: 'lifebuoy', page: helpdesk },
  { section: 'Account' },
  { path: '/settings', label: 'Settings', icon: 'cog', page: settings },
];
const visibleNav = (me) => NAV.filter((n) => !n.when || n.when(me));

function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  return { path, parts, query: Object.fromEntries(new URLSearchParams(query)) };
}

async function loadMe() {
  state.me = await get('/me');
  if (!state.meta) state.meta = await get('/meta');
}

async function router() {
  const route = parseRoute();
  document.querySelectorAll('.drawer, .modal-back').forEach((el) => el.remove());
  // Customer-facing pages (booking, quotes, invoices, forms…) never need a sign-in.
  if (PUBLIC_PAGES.includes(route.parts[0])) {
    setAssistantVisible(false);
    return renderPublic(root, route);
  }
  document.body.classList.remove('public');
  if (!auth.token) {
    applyBrandColor(null);
    setAssistantVisible(false);
    if (route.parts[0] === 'register') return renderRegister();
    return renderLogin();
  }
  try {
    await loadMe();
  } catch {
    setAssistantVisible(false);
    return renderLogin();
  }
  setAssistantVisible(true);
  applyBrandColor(state.me.org.brand?.color);
  const top = `/${route.parts[0] || ''}`;
  const item = visibleNav(state.me).find((n) => n.path === top) || NAV[1];
  const view = h('div', { class: 'content' });
  mount(root, layout(item, view));
  try {
    await item.page.render(view, route);
  } catch (err) {
    showError(err);
    mount(view, h('div', { class: 'card card-pad empty' }, 'Something went wrong loading this page.'));
  }
}

function layout(active, view) {
  const { me } = state;
  const minutes = h('div', { class: 'big' }, '–');
  get('/automations/impact').then((r) => { minutes.textContent = `${(r.total_minutes / 60).toFixed(1)} hrs`; }).catch(() => {});

  // White-label: a client's own logo and name; otherwise the CM Automations mark.
  const brand = me.org.brand || {};
  const brandBlock = brand.logo || brand.display_name
    ? h('div', { class: 'brand' }, brand.logo ? h('img', { src: brand.logo, alt: '', class: 'brand-logo' }) : h('div', { class: 'brand-mark' }, (brand.display_name || me.org.name).slice(0, 2).toUpperCase()), h('div', { class: 'brand-name' }, brand.display_name || me.org.name))
    : h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, 'CM'), h('div', { class: 'brand-name' }, 'CM ', h('span', 'Automations')));
  const badges = {};
  const sidebar = h('aside', { class: 'sidebar' },
    brandBlock,
    h('nav', { class: 'nav' }, visibleNav(me).map((n) => {
      if (n.section) return h('div', { class: 'nav-label' }, n.section);
      const count = n.badge ? (badges[n.badge] = h('span', { class: 'count', hidden: true })) : null;
      return h('a', { href: `#${n.path}`, class: n === active ? 'active' : '' }, icon(n.icon), n.label, count);
    })),
    h('div', { class: 'sidebar-foot' },
      h('div', { class: 'eyebrow' }, 'Time saved · 30 days'),
      minutes,
      h('div', { class: 'small muted' }, 'by automations doing the admin for you'),
      me.agency && !brand.hide_powered_by ? h('div', { class: 'small muted', style: { marginTop: '8px' } }, `Powered by ${me.agency.name}`) : null),
  );
  // Unread messages + missed calls not yet called back.
  get('/messages/summary').then((s) => {
    const n = s.unread + s.missed_calls;
    if (badges.messages && n) { badges.messages.textContent = n; badges.messages.hidden = false; }
  }).catch(() => {});

  const notifWrap = h('div', { style: { position: 'relative' } });
  const bell = h('button', { class: 'icon-btn', title: 'Notifications', onclick: () => toggleNotifications(notifWrap) }, icon('bell'), me.unread ? h('span', { class: 'dot' }) : null);
  notifWrap.append(bell);

  const orgSelect = select('org', me.orgs.map((o) => [o.id, o.kind === 'agency' ? `${o.name} (agency)` : o.name]), me.org.id);
  orgSelect.addEventListener('change', async () => {
    try { await post('/auth/switch', { org_id: orgSelect.value }); location.hash = '#/'; router(); toast('Switched business'); } catch (err) { showError(err); }
  });

  const search = h('input', { placeholder: 'Search contacts…', onkeydown: (e) => { if (e.key === 'Enter') location.hash = `#/crm/contacts?q=${encodeURIComponent(e.target.value)}`; } });

  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'search' }, icon('search'), search),
    h('div', { class: 'spacer' }),
    h('span', { class: 'badge blue' }, me.niche.label),
    h('div', { class: 'org-switch' }, orgSelect),
    notifWrap,
    h('div', { class: 'row', style: { gap: '8px' } }, avatar(me.user.name), h('div', h('div', { style: { fontWeight: 700, fontSize: '13px' } }, me.user.name), h('div', { class: 'small muted' }, me.role))),
    h('button', { class: 'icon-btn', title: 'Sign out', onclick: async () => { await post('/auth/logout').catch(() => {}); auth.token = null; location.hash = '#/login'; router(); } }, icon('logout')),
  );

  return h('div', { class: 'shell' }, sidebar, h('div', { class: 'main' }, topbar, view));
}

async function toggleNotifications(wrap) {
  const open = wrap.querySelector('.notif-panel');
  if (open) return open.remove();
  const items = await get('/notifications');
  const panel = h('div', { class: 'card notif-panel' },
    h('div', { class: 'card-head' }, h('h3', 'Notifications'), h('button', { class: 'btn sm ghost', onclick: async () => { await post('/notifications/read'); wrap.querySelector('.dot')?.remove(); panel.remove(); } }, 'Mark all read')),
    h('div', { class: 'card-body' }, items.length ? items.map((n) => h('a', { href: n.link || '#/', class: 'list-item', style: { color: 'inherit', textDecoration: 'none' }, onclick: () => panel.remove() },
      h('div', { class: 'grow' }, h('div', { style: { fontWeight: n.read ? 500 : 700 } }, n.title), n.body ? h('div', { class: 'small muted' }, n.body) : null),
      h('span', { class: 'small muted' }, ago(n.created_at)))) : h('div', { class: 'empty' }, 'All caught up ✨')));
  wrap.append(panel);
}

function authShell(form) {
  return h('div', { class: 'auth' },
    h('div', { class: 'auth-hero' },
      h('div', { class: 'row' }, h('div', { class: 'brand-mark', style: { background: '#fff', color: 'var(--blue-600)' } }, 'CM'), h('b', 'CM Automations')),
      h('div',
        h('h1', 'Build it. Grow it. Automate the rest.'),
        h('ul', { style: { paddingLeft: '18px', fontSize: '16px' } },
          h('li', 'Build Funnel – idea to fully built product or service, step by step'),
          h('li', 'Content Studio – strategy, ideas and briefs; you finalise, we schedule'),
          h('li', 'CRM & Tasks – the daily admin handled by automations'))),
      h('div', { style: { opacity: 0.85 } }, 'One system for every business you run.')),
    h('div', { class: 'auth-form' }, form));
}

async function renderLogin() {
  if (!state.meta) state.meta = await get('/meta').catch(() => null);
  const passwords = state.meta?.require_passwords !== false;
  const form = h('form', { class: 'card card-pad stack', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const { token } = await post('/auth/login', formData(form));
      auth.token = token;
      location.hash = '#/';
      router();
    } catch (err) { showError(err); }
  } },
  h('div', h('div', { class: 'eyebrow' }, 'Welcome back'), h('h1', { style: { marginTop: '6px' } }, 'Sign in to ', h('span', { class: 'blue' }, 'CM Automations'))),
  field('Email', h('input', { name: 'email', type: 'email', value: 'demo@cmautomations.com', required: true })),
  passwords ? field('Password', h('input', { name: 'password', type: 'password', value: 'demo1234', required: true })) : null,
  h('button', { class: 'btn primary', type: 'submit' }, 'Sign in'),
  h('p', { class: 'small muted' }, 'New business? ', h('a', { href: '#/register' }, 'Create an account')),
  h('p', { class: 'small muted' }, passwords ? 'Demo login is pre-filled.' : 'Demo login is pre-filled. Passwords are switched off while you test.'));
  mount(root, authShell(form));
}

async function renderRegister() {
  const meta = await get('/meta');
  const form = h('form', { class: 'card card-pad stack', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const { token } = await post('/auth/register', formData(form));
      auth.token = token;
      location.hash = '#/';
      toast('Your business is set up – pillars, channels and automations are ready.');
      router();
    } catch (err) { showError(err); }
  } },
  h('div', h('div', { class: 'eyebrow' }, 'Get started'), h('h1', { style: { marginTop: '6px' } }, 'Set up your ', h('span', { class: 'blue' }, 'business'))),
  field('Your name', h('input', { name: 'name', required: true })),
  field('Email', h('input', { name: 'email', type: 'email', required: true })),
  meta.require_passwords !== false ? field('Password', h('input', { name: 'password', type: 'password', minLength: 8, required: true }), { help: 'At least 8 characters' }) : null,
  field('Business name', h('input', { name: 'business_name', required: true })),
  field('Niche', select('niche', meta.niches.map((n) => [n.key, n.label])), { help: 'We pre-load content pillars, audience insights and automations for your niche.' }),
  field('Business type', select('business_type', [['service', 'Service'], ['product', 'Product'], ['hybrid', 'Both']])),
  h('button', { class: 'btn primary', type: 'submit' }, 'Create my system'),
  h('p', { class: 'small muted' }, 'Already have an account? ', h('a', { href: '#/login' }, 'Sign in')));
  mount(root, authShell(form));
}

export const navigate = (hash) => { location.hash = hash; };
export const refresh = () => router();

window.addEventListener('hashchange', router);
router();

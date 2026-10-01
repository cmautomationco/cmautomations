// Minimal DOM toolkit: h() builds elements, plus toasts, modals and formatters.

export function h(tag, props = {}, ...children) {
  if (props === null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    children.unshift(props);
    props = {};
  }
  const el = tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'rect' || tag === 'polyline' || tag === 'line'
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && !(el instanceof SVGElement)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const mount = (el, ...children) => { el.replaceChildren(); append(el, children); return el; };

// ── Icons (24×24 stroke icons) ──
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  rocket: 'M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2m-1-4 4 4m-4-4c1-4 4-9 11-10 -1 7-6 10-10 11m2-7a1 1 0 1 0 2 0 1 1 0 0 0-2 0',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7m10 9v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  check: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  tick: 'M5 12l5 5L20 7',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9m4.3 13a1.9 1.9 0 0 0 3.4 0',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  pound: 'M18 7a4 4 0 0 0-7-2.5C10 6 10 8 10 10v5c0 2-1 4-3 5h11M7 13h8',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  flag: 'M4 22V4s1-1 4-1 5 2 8 2 4-1 4-1v11s-1 1-4 1-5-2-8-2-4 1-4 1',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
  x: 'M18 6 6 18M6 6l12 12',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
  trend: 'M22 7 13.5 15.5l-5-5L2 17M16 7h6v6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};

export function icon(name, cls = '') {
  const svg = h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: cls });
  svg.append(h('path', { d: ICONS[name] || ICONS.sparkles }));
  return svg;
}

// ── Feedback ──
export function toast(message, type = '') {
  const el = h('div', { class: `toast ${type}` }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), type === 'auto' ? 5200 : 3200);
}

/** Shows "⚡ automation" toasts for any automations the API reports it ran. */
export function announce(automations = []) {
  for (const a of automations) if (a.status === 'success') toast(`⚡ ${a.automation}: ${a.detail.join(' · ')}`, 'auto');
}

export function showError(err) {
  const details = Array.isArray(err.details) ? ` – ${err.details.join(', ')}` : '';
  toast(`${err.message}${details}`, 'error');
}

export function modal(title, body, { wide = false, actions = [] } = {}) {
  const close = () => back.remove();
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}` },
      h('div', { class: 'modal-head' }, h('h2', title), h('button', { class: 'icon-btn', onclick: close }, icon('x'))),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => h('button', {
        class: `btn ${a.primary ? 'primary' : ''}`,
        onclick: async (e) => {
          e.target.disabled = true;
          try { if ((await a.onClick?.()) !== false) close(); } catch (err) { showError(err); } finally { e.target.disabled = false; }
        },
      }, a.label))) : null));
  document.body.append(back);
  return { close, el: back };
}

/** In-page yes/no confirmation. Resolves true only when the action button is pressed. */
export function confirmDialog(message, actionLabel = 'Delete') {
  return new Promise((resolve) => {
    modal('Are you sure?', h('p', message), { actions: [
      { label: 'Cancel', onClick: () => resolve(false) },
      { label: actionLabel, primary: true, onClick: () => resolve(true) },
    ] });
  });
}

/** Reads a form's named inputs into an object. */
export function formData(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach((el) => {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.multiple) out[el.name] = [...el.selectedOptions].map((o) => o.value);
    else out[el.name] = el.value;
  });
  return out;
}

export const field = (label, input, { required, help } = {}) =>
  h('label', { class: 'field' }, h('span', label, required ? h('span', { class: 'req' }, ' *') : null), input, help ? h('span', { class: 'help' }, help) : null);

export function select(name, options, value) {
  return h('select', { name }, options.map((o) => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return h('option', { value: v, selected: v === value }, l);
  }));
}

// ── Formatting ──
export const money = (n) => `£${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
export const initials = (name = '') => name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
export const avatar = (name, sm) => h('span', { class: `avatar ${sm ? 'sm' : ''}`, title: name || 'Unassigned' }, name ? initials(name) : '–');
export const titleCase = (s = '') => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function date(iso, opts = { day: 'numeric', month: 'short' }) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', opts);
}
export function dateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function relative(iso) {
  if (!iso) return '';
  const diff = (new Date(iso).getTime() - Date.now()) / 86400_000;
  const days = Math.round(diff);
  if (Math.abs(diff) < 1 && new Date(iso).toDateString() === new Date().toDateString()) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 7) return `In ${days} days`;
  if (days < -1 && days > -7) return `${-days} days ago`;
  return date(iso);
}
export const isOverdue = (iso) => iso && new Date(iso).getTime() < Date.now();
export function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export const PLATFORM_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', facebook: 'Facebook', x: 'X', google_business: 'Google Business', newsletter: 'Newsletter' };

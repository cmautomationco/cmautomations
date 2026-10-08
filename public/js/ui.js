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
  screen: 'M3 4h18v12H3zM8 20h8M12 16v4',
  chat: 'M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.9A8 8 0 1 1 21 12zM8.5 12h.01M12 12h.01M15.5 12h.01',
  lifebuoy: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.9 4.9l4.3 4.3M14.8 14.8l4.3 4.3M14.8 9.2l4.3-4.3M4.9 19.1l4.3-4.3',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  phoneMissed: 'M23 1l-6 6M17 1l6 6M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z',
  whatsapp: 'M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4zM9 9.5c0 3 2.5 5.5 5.5 5.5l1.5-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2L9 9.5',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  receipt: 'M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2zM8 7h8M8 11h8M8 15h5',
  briefcase: 'M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20',
  clipboard: 'M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M8 11h8M8 15h6',
  pin: 'M12 22s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01M17 11.5h.01',
  chart: 'M3 3v18h18M8 17V11M13 17V7M18 17v-4',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  car: 'M5 17h14M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M3 17v-5l2-5h10l4 5h2v5M5 12h16',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
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
/** Pence → "£1,234.50" (always two decimals for money on quotes and invoices). */
export const pounds = (pence) => `${Number(pence) < 0 ? '-' : ''}£${(Math.abs(Number(pence) || 0) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "12.50" typed in a box → 1250 pence. */
export const toPence = (value) => Math.round((Number(String(value).replace(/[£,\s]/g, '')) || 0) * 100);
export const CHANNEL_LABELS = { whatsapp: 'WhatsApp', sms: 'Text', email: 'Email' };
export const channelIcon = (channel) => icon(channel === 'whatsapp' ? 'whatsapp' : channel === 'email' ? 'mail' : 'chat');
/** "9am", "12:30pm" – how people say times. */
export function time(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hr = d.getHours();
  const min = d.getMinutes();
  return `${hr % 12 || 12}${min ? `:${String(min).padStart(2, '0')}` : ''}${hr < 12 ? 'am' : 'pm'}`;
}
/** +447700900123 → "07700 900123" (UK numbers), anything else unchanged. */
export function ukPhone(e164) {
  if (!e164) return '';
  if (/^\+44\d{10}$/.test(e164)) {
    const local = `0${e164.slice(3)}`;
    return local.startsWith('02') ? `${local.slice(0, 3)} ${local.slice(3, 7)} ${local.slice(7)}` : local.startsWith('01') || local.startsWith('03') || local.startsWith('08') ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : `${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return e164;
}
/** Contacts made from a call or message have a placeholder name until we learn it. */
export const PLACEHOLDER_NAME = /^(new contact|caller|whatsapp enquiry|text enquiry|website enquiry)$/i;
export function contactName(c) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
  if (PLACEHOLDER_NAME.test(c.first_name || '') && !c.last_name) return `${ukPhone(c.phone_e164) || c.email || 'Unknown'} (new)`;
  return name || 'Unknown';
}

/** 0.2 → "1 week", 3.4 → "3.4 months" – how long a client takes to earn back what they paid. */
export function paybackLabel(months) {
  if (!months) return '–';
  if (months < 1) { const weeks = Math.max(1, Math.round(months * 4.33)); return `${weeks} week${weeks === 1 ? '' : 's'}`; }
  return `${months} month${months === 1 ? '' : 's'}`;
}

/** Copies text, with a fallback for browsers that block the clipboard. */
export async function copyText(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(label); } catch {
    const box = h('textarea', { value: text, style: { position: 'fixed', top: '-200px' } });
    document.body.append(box); box.select();
    try { document.execCommand('copy'); toast(label); } catch { modal('Copy this', h('textarea', { value: text, readOnly: true, style: { minHeight: '120px' } })); }
    box.remove();
  }
}

/** A colour scale (like the default blues) from one brand colour. */
export function paletteFrom(hex) {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const tint = (w) => out(rgb.map((c) => c + (255 - c) * w));
  const shade = (w) => out(rgb.map((c) => c * (1 - w)));
  return { 50: tint(0.94), 100: tint(0.87), 200: tint(0.72), 300: tint(0.5), 400: tint(0.25), 500: hex, 600: shade(0.15), 700: shade(0.29), 800: shade(0.43) };
}

/** Applies a business's brand colour across the app (or restores the default blues). */
export function applyBrandColor(hex) {
  const root = document.documentElement.style;
  const keys = [50, 100, 200, 300, 400, 500, 600, 700, 800];
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) { keys.forEach((k) => root.removeProperty(`--blue-${k}`)); return; }
  const p = paletteFrom(hex);
  keys.forEach((k) => root.setProperty(`--blue-${k}`, p[k]));
}

/** Shows a status label for a sent message. */
export function messageStatus(m) {
  if (m.direction === 'in') return '';
  if (m.status === 'queued') return m.send_after ? `Scheduled ${new Date(m.send_after).toLocaleString('en-GB', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Sending…';
  if (m.status === 'demo') return 'Demo – not actually sent';
  if (m.status === 'blocked') return `Not sent: ${m.error}`;
  if (m.status === 'failed') return `Failed: ${m.error || 'unknown error'}`;
  return m.status === 'delivered' ? 'Delivered' : 'Sent';
}

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
  return `${new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time(iso)}`;
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

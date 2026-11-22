// Tiny DOM helpers for HQ. All text goes in as text nodes (never raw HTML).

const SVG_TAGS = new Set(['svg', 'path', 'circle', 'g', 'title', 'line', 'rect', 'text']);

export function h(tag, attrs, ...kids) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked') el.checked = Boolean(v);
    else if (k === 'vars') for (const [vk, vv] of Object.entries(v)) el.style.setProperty(vk, vv);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export function mount(el, ...kids) { el.replaceChildren(); append(el, kids); }

const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  play: 'M7 4l13 8-13 8z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6L6 18',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  back: 'M19 12H5M11 18l-6-6 6-6',
};
export function icon(name, size = 16) {
  const svg = h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'ic', 'aria-hidden': 'true' });
  svg.appendChild(h('path', { d: ICONS[name] || ICONS.plus }));
  return svg;
}

export function toast(msg, kind = 'ok') {
  let wrap = document.getElementById('toasts');
  if (!wrap) { wrap = h('div', { id: 'toasts', class: 'toasts' }); document.body.appendChild(wrap); }
  const t = h('div', { class: `toast ${kind}` }, msg);
  wrap.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

export function modal(title, body, { actions = [], wide = false, onClose } = {}) {
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); onClose?.(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h3', title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x'))),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => a && h('button', { class: `btn ${a.kind || ''}`, onclick: () => a.onClick(close) }, a.icon ? icon(a.icon) : null, a.label))) : null));
  document.addEventListener('keydown', esc);
  document.body.appendChild(back);
  back.querySelector('input, textarea, select')?.focus();
  return close;
}

/** An in-page "are you sure?" (browser confirm() pop-ups are blocked in some viewers). */
export function confirmBox(message, onYes, { yes = 'Yes, do it', danger = true } = {}) {
  return modal('Are you sure?', h('p', message), {
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: (close) => close() },
      { label: yes, kind: danger ? 'danger primary' : 'primary', onClick: (close) => { close(); onYes(); } },
    ],
  });
}

/**
 * A form for any record. fields: [{key, label, type, options, hint, full}].
 * Types: text, textarea, number, date, select, color, checkbox.
 */
export function openForm({ title, fields, values = {}, onSave, onDelete, saveLabel = 'Save' }) {
  const inputs = {};
  const body = h('div', { class: 'form-grid' }, fields.map((f) => {
    let input;
    const v = values[f.key] ?? f.default ?? '';
    if (f.type === 'textarea') input = h('textarea', { rows: f.rows || 4, value: v });
    else if (f.type === 'select') input = h('select', f.options.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return h('option', { value: val, selected: String(val) === String(v) }, lab); }));
    else if (f.type === 'checkbox') input = h('input', { type: 'checkbox', checked: Boolean(v) });
    else input = h('input', { type: f.type || 'text', value: f.type === 'date' ? String(v).slice(0, 10) : v, step: f.type === 'number' ? 'any' : null, placeholder: f.placeholder || '' });
    inputs[f.key] = input;
    return h('label', { class: `field ${f.full || f.type === 'textarea' ? 'full' : ''} ${f.type === 'checkbox' ? 'check' : ''}` },
      h('span', f.label), input, f.hint ? h('small', f.hint) : null);
  }));
  const read = () => Object.fromEntries(fields.map((f) => {
    const el = inputs[f.key];
    if (f.type === 'checkbox') return [f.key, el.checked];
    if (f.type === 'number') return [f.key, el.value === '' ? null : Number(el.value)];
    return [f.key, el.value.trim()];
  }));
  return modal(title, body, {
    actions: [
      onDelete ? { label: 'Delete', kind: 'danger ghost', icon: 'trash', onClick: (close) => confirmBox('Delete this for good?', () => { close(); onDelete(); }, { yes: 'Delete' }) } : null,
      { label: 'Cancel', kind: 'ghost', onClick: (close) => close() },
      { label: saveLabel, kind: 'primary', icon: 'check', onClick: (close) => { if (onSave(read()) !== false) close(); } },
    ],
  });
}

export function chip(text, tone = '') { return h('span', { class: `chip ${tone}` }, text); }
export function dot(color) { return h('span', { class: 'dot', style: { background: color } }); }

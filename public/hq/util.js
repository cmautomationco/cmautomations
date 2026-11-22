// Small shared helpers for HQ: ids, dates, money and text templates.

export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const DAY = 86400000;
export const nowIso = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export const addDaysIso = (days, from = Date.now()) => new Date(+new Date(from) + days * DAY).toISOString().slice(0, 10);

/** Whole days from `iso` until today (positive = in the past). */
export function daysSince(iso) {
  if (!iso) return Infinity;
  const a = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  const b = new Date(today() + 'T00:00:00');
  return Math.round((b - a) / DAY);
}
export const daysUntil = (iso) => -daysSince(iso);

export function money(v, cur = '£', { decimals = false } = {}) {
  const n = Number(v) || 0;
  return `${n < 0 ? '-' : ''}${cur}${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 })}`;
}

export function shortDate(iso) {
  if (!iso) return '–';
  return new Date(String(iso).length <= 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function longDate(date = new Date()) {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
export function timeOf(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
export function ago(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const dd = Math.floor(s / 86400);
  return dd === 1 ? 'yesterday' : `${dd}d ago`;
}
export function relDay(iso) {
  const n = daysUntil(iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export const firstName = (name = '') => String(name).trim().split(/\s+/)[0] || 'there';
export const ordinal = (n) => ['first', 'second', 'third', 'fourth', 'fifth'][n - 1] || `${n}th`;

/** Fills {placeholders} in a template. Unknown ones are left blank. */
export function fill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

export const sum = (arr, fn = (x) => x) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);
export const clone = (v) => JSON.parse(JSON.stringify(v));

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

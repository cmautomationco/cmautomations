import crypto from 'node:crypto';

export const id = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
export const now = () => new Date().toISOString();

export function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function addHours(date, hours) {
  return new Date(new Date(date).getTime() + hours * 3600_000).toISOString();
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);

/**
 * Tiny schema validator: { field: { type, required, enum, max } }.
 * Returns only known fields so request bodies can't write arbitrary columns.
 */
export function pick(body = {}, schema, { partial = false } = {}) {
  const out = {};
  const errors = [];
  for (const [key, rule] of Object.entries(schema)) {
    const value = body[key];
    if (value === undefined || value === null || value === '') {
      if (rule.required && !partial) errors.push(`${key} is required`);
      if (value === null || value === '') out[key] = null;
      continue;
    }
    if (rule.type === 'number') {
      const n = Number(value);
      if (Number.isNaN(n)) errors.push(`${key} must be a number`);
      else out[key] = n;
    } else if (rule.type === 'array') {
      if (!Array.isArray(value)) errors.push(`${key} must be a list`);
      else out[key] = value;
    } else if (rule.type === 'object') {
      if (typeof value !== 'object' || Array.isArray(value)) errors.push(`${key} must be an object`);
      else out[key] = value;
    } else if (rule.type === 'boolean') {
      out[key] = Boolean(value);
    } else {
      const s = String(value).trim();
      if (rule.enum && !rule.enum.includes(s)) errors.push(`${key} must be one of: ${rule.enum.join(', ')}`);
      else if (rule.max && s.length > rule.max) errors.push(`${key} is too long`);
      else out[key] = s;
    }
  }
  if (errors.length) throw badRequest('Validation failed', errors);
  // Required fields that came through as null are still missing.
  if (!partial) {
    for (const [key, rule] of Object.entries(schema)) {
      if (rule.required && out[key] === null && !errors.includes(`${key} is required`)) {
        throw badRequest('Validation failed', [`${key} is required`]);
      }
    }
  }
  return out;
}

/** Replaces {{path.to.value}} placeholders using a context object. */
export function render(template, context) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), context);
    return value == null ? '' : String(value);
  });
}

/** Deterministic PRNG (mulberry32) so idea generation is reproducible in tests. */
export function seededRandom(seed) {
  let a = typeof seed === 'number' ? seed : [...String(seed)].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 7);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

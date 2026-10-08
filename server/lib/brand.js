import { badRequest } from './util.js';

/** White-label branding stored on each business (JSON). */
export function parseBrand(org) {
  if (!org) return {};
  if (typeof org.brand === 'object' && org.brand) return org.brand;
  try { return JSON.parse(org.brand || '{}') || {}; } catch { return {}; }
}

/** Branding: display name, logo (small image), main colour, and whether to show "Powered by". */
export function cleanBrand(input = {}, current = {}) {
  const out = { ...current };
  if (input.display_name !== undefined) out.display_name = String(input.display_name || '').trim().slice(0, 80);
  if (input.color !== undefined) {
    const c = String(input.color || '').trim();
    if (c && !/^#[0-9a-f]{6}$/i.test(c)) throw badRequest('Colour must look like #1e6a9e');
    out.color = c.toLowerCase();
  }
  if (input.logo !== undefined) {
    const logo = String(input.logo || '');
    if (logo && !/^data:image\/(png|jpeg|jpg|svg\+xml|webp|gif);base64,[a-z0-9+/=]+$/i.test(logo)) throw badRequest('Logo must be a PNG, JPG, SVG, WebP or GIF image');
    if (logo.length > 400_000) throw badRequest('Logo is too large – please use an image under 300KB');
    out.logo = logo;
  }
  if (input.hide_powered_by !== undefined) out.hide_powered_by = Boolean(input.hide_powered_by);
  return out;
}


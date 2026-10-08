/**
 * Phone numbers in E.164 form (+447700900123) so calls, texts and WhatsApp
 * messages from the same person always match the same contact. Defaults to UK.
 */
export function toE164(raw, defaultCountry = '44') {
  if (!raw) return null;
  let s = String(raw).trim().replace(/^whatsapp:/i, '');
  const plus = s.startsWith('+');
  s = s.replace(/[^\d]/g, '');
  if (!s) return null;
  if (plus) return s.length >= 8 ? `+${s}` : null;
  if (s.startsWith('00')) return `+${s.slice(2)}`;
  if (s.startsWith(defaultCountry) && s.length > 10) return `+${s}`;
  if (s.startsWith('0')) s = s.slice(1);
  if (s.length < 9 || s.length > 11) return null;
  return `+${defaultCountry}${s}`;
}

/** +447700900123 → 07700 900123 (UK numbers), otherwise unchanged. */
export function displayPhone(e164) {
  if (!e164) return '';
  if (e164.startsWith('+44') && e164.length === 13) {
    const local = `0${e164.slice(3)}`;
    if (local.startsWith('02')) return `${local.slice(0, 3)} ${local.slice(3, 7)} ${local.slice(7)}`;
    if (/^0[138]/.test(local)) return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
    return `${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return e164;
}

export const isMobile = (e164) => Boolean(e164 && /^\+447\d{9}$/.test(e164));

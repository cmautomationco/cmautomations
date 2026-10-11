import crypto from 'node:crypto';

/** Constant-time comparison of two strings. */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Stripe signs each event: HMAC-SHA256 of "timestamp.body". Events older than 5 minutes are refused. */
export function verifyStripe(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v]));
  const signatures = String(header || '').split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  if (!parts.t || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`, 'utf8').digest('hex');
  return signatures.some((s) => safeEqual(s, expected));
}

/** Shopify signs each webhook: base64 HMAC-SHA256 of the raw body, in X-Shopify-Hmac-Sha256. */
export function verifyShopify(rawBody, header, secret) {
  if (!header) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody || '', 'utf8').digest('base64');
  return safeEqual(expected, header);
}

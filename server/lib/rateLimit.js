/** Small in-memory rate limiter for public endpoints (forms, bookings). */
const hits = new Map();

export function rateLimit(key, { max = 5, windowMs = 60_000 } = {}) {
  const t = Date.now();
  const list = (hits.get(key) || []).filter((ts) => t - ts < windowMs);
  list.push(t);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((ts) => t - ts < windowMs)) hits.delete(k);
  return list.length <= max;
}

/** Per-business settings stored as JSON in org_meta, merged over defaults. */
export function getSetting(db, orgId, key, defaults = {}) {
  const row = db.get('SELECT value FROM org_meta WHERE org_id = ? AND key = ?', orgId, `setting:${key}`);
  let stored = {};
  if (row?.value) { try { stored = JSON.parse(row.value); } catch { /* corrupt: ignore */ } }
  return deepMerge(structuredCloneSafe(defaults), stored);
}

export function setSetting(db, orgId, key, value) {
  db.run(`INSERT INTO org_meta (org_id, key, value) VALUES (?, ?, ?) ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value`, orgId, `setting:${key}`, JSON.stringify(value));
  return value;
}

const structuredCloneSafe = (v) => JSON.parse(JSON.stringify(v));

function deepMerge(base, extra) {
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
}

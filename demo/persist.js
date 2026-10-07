// Keeps the test system's data in this browser (IndexedDB) between visits.
const DB_NAME = 'cm-automations-test';
const STORE = 'snapshots';
const KEY = 'main';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

/** Saved data, or null. Gives up after a few seconds if the browser's storage doesn't answer. */
export async function loadSnapshot() {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 4000));
  try { return (await Promise.race([run('readonly', (s) => s.get(KEY)), timeout])) || null; } catch { return null; }
}

export async function saveSnapshot(bytes) {
  try { await run('readwrite', (s) => s.put(bytes, KEY)); return true; } catch { return false; }
}

export async function clearSnapshot() {
  try { await run('readwrite', (s) => s.delete(KEY)); } catch { /* storage unavailable */ }
}

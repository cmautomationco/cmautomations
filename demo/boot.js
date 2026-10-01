// Boots the full system inside the browser: SQLite (sql.js) + the real server
// modules + the unchanged front end. Built into one page by scripts/build-demo.mjs.
import './shims/globals.js';
import { setSqlDatabase, getSqlDatabase } from './shims/sqlite.js';
import { openDatabase } from '../server/db/index.js';
import { seedDemo } from '../server/db/seed.js';
import { createScheduler } from '../server/automation/scheduler.js';
import { createBackend } from './backend.js';
import { clearSnapshot, loadSnapshot, saveSnapshot } from './persist.js';

const status = document.getElementById('boot-status');

async function start() {
  const SQL = await globalThis.initSqlJs();
  const saved = await loadSnapshot();
  let sqlDb;
  try {
    sqlDb = saved ? new SQL.Database(saved) : new SQL.Database();
  } catch {
    sqlDb = new SQL.Database(); // unreadable snapshot: start fresh
  }
  setSqlDatabase(sqlDb);

  const db = openDatabase(':memory:');
  if (!db.get('SELECT 1 FROM organizations LIMIT 1')) seedDemo(db);

  // Save to this browser shortly after every change.
  let timer = null;
  let dirty = false;
  const save = async () => {
    timer = null;
    if (!dirty) return;
    dirty = false;
    const bytes = getSqlDatabase().export();
    // export() resets connection settings, so switch foreign keys back on.
    getSqlDatabase().exec('PRAGMA foreign_keys = ON;');
    await saveSnapshot(bytes);
  };
  const markDirty = () => { dirty = true; if (!timer) timer = setTimeout(save, 400); };

  const backend = createBackend(db, { onWrite: markDirty });
  backend.installFetch();

  // The scheduler publishes due posts, flags overdue tasks and turns due follow-ups into tasks.
  const scheduler = createScheduler(backend.ctx, { intervalSeconds: 30 });
  const tick = scheduler.tick;
  scheduler.tick = async (...args) => { const r = await tick(...args); markDirty(); return r; };
  setInterval(() => scheduler.tick().catch((err) => console.error('[scheduler]', err)), 30_000);
  scheduler.tick().catch(() => {});
  addEventListener('pagehide', () => { if (dirty) save(); });

  status?.remove();
  await import('../public/js/app.js');

  const { mountTestBuildBar } = await import('./walkthrough.js');
  mountTestBuildBar({
    onReset: async () => {
      db.exec('DELETE FROM organizations; DELETE FROM users;');
      seedDemo(db);
      await clearSnapshot();
      markDirty();
      const { auth } = await import('../public/js/api.js');
      auth.token = null;
      location.hash = '#/login';
      const { refresh } = await import('../public/js/app.js');
      refresh();
    },
  });
}

start().catch((err) => {
  console.error(err);
  if (status) status.textContent = `The system could not start: ${err.message}`;
});

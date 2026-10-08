// Renders every module with demo data and saves PNGs to docs/screenshots.
// Usage: npm run screenshots   (uses Playwright; installs nothing extra)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'docs', 'screenshots');
fs.mkdirSync(out, { recursive: true });

async function loadPlaywright() {
  try { return await import('playwright'); } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
  }
}

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cm-shots-')), 'demo.db');
process.env.DATABASE_PATH = dbFile;
const { openDatabase } = await import('../server/db/index.js');
const { seedDemo } = await import('../server/db/seed.js');
const { createApp } = await import('../server/app.js');
const db = openDatabase(dbFile);
seedDemo(db);
const { app } = createApp(db);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

const api = async (p, opts = {}) => (await fetch(base + p, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } })).json();
const { token } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo@cmautomations.com', password: 'demo1234' }) });
const auth = { authorization: `Bearer ${token}` };
const projects = await api('/api/funnel/projects', { headers: auth });
const ideas = await api('/api/content/ideas?status=in_creation', { headers: auth });
const queued = (await api('/api/content/calendar', { headers: auth })).find((p) => p.status === 'queued');
const calendarMonth = queued ? queued.publish_at.slice(0, 7) : '';

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

async function shot(name, hash, { full = false, before } = {}) {
  await page.goto(`${base}/${hash}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  if (before) await before();
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: full });
  console.log('saved', name);
}

await shot('00-sign-in', '#/login');
await page.evaluate((t) => localStorage.setItem('cm_token', t), token);
await shot('01-dashboard', '#/', { full: true });
await shot('02-build-funnel-overview', '#/funnel', { full: true });
await shot('03-build-funnel-step', `#/funnel/${projects[0].id}?stage=pricing&step=pricing_model`, { full: true });
await shot('04-build-funnel-worksheet', `#/funnel/${projects[0].id}`, { full: true });
await shot('05-content-idea-lab', '#/content/ideas', { full: true });
await shot('06-content-creation-brief', `#/content/create/${ideas[0].id}`, { full: true });
await shot('07-content-creation-board', '#/content/create');
await shot('08-content-calendar', `#/content/calendar${calendarMonth ? `?month=${calendarMonth}` : ''}`, { full: true });
await shot('09-content-strategy', '#/content/strategy', { full: true });
await shot('10-crm-pipeline', '#/crm/pipeline');
await shot('11-crm-contacts', '#/crm/contacts', { before: async () => { await page.click('.table tbody tr'); await page.waitForTimeout(500); } });
await shot('12-tasks-board', '#/tasks', { full: true });
await shot('13-tasks-my-day', '#/tasks/today', { full: true });
await shot('14-automations', '#/automations', { full: true });
await shot('15-content-academy', '#/content/academy', { full: true });
await shot('16-help-desk', '#/helpdesk', { full: true });
await shot('18-automation-presentation', '#/automations/presentation?s=12');
await shot('17-assistant', '#/', { before: async () => {
  await page.click('.as-fab');
  for (const q of ['What do I need to do today?', 'Report a problem: the booking page won’t take payments']) {
    const count = await page.locator('.as-msg.bot').count();
    await page.fill('#assistant-input', q);
    await page.press('#assistant-input', 'Enter');
    await page.waitForFunction((n) => document.querySelectorAll('.as-msg.bot:not(:has(.as-typing))').length > n, count);
  }
  await page.waitForTimeout(400);
} });

await browser.close();
server.close();
console.log(`Screenshots written to ${out}`);

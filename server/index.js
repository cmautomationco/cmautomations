import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { createApp } from './app.js';
import { createScheduler } from './automation/scheduler.js';
import { seedDemo } from './db/seed.js';
import { installMissingRecipes } from './automation/recipes.js';
import { liveWarnings } from './lib/live-check.js';

const db = openDatabase(config.databasePath);
if (!db.get('SELECT 1 FROM organizations LIMIT 1') && config.seedDemo) {
  await seedDemo(db);
  console.log('Seeded demo businesses – sign in with demo@cmautomations.com / demo1234');
}

// Businesses created before a release get that release's new automations.
installMissingRecipes(db);

const { app, ctx } = createApp(db);
const scheduler = createScheduler(ctx, { intervalSeconds: config.schedulerIntervalSeconds });
scheduler.start();

app.listen(config.port, () => {
  console.log(`CM Automations running on http://localhost:${config.port}`);
  for (const warning of liveWarnings()) console.warn(`⚠️  ${warning}`);
});

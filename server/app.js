import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createEngine } from './automation/engine.js';
import { automationRoutes } from './automation/routes.js';
import { coreRoutes } from './modules/core/routes.js';
import { contentRoutes } from './modules/content/routes.js';
import { crmRoutes } from './modules/crm/routes.js';
import { funnelRoutes } from './modules/funnel/routes.js';
import { taskRoutes } from './modules/tasks/routes.js';
import { helpdeskRoutes } from './modules/helpdesk/routes.js';
import { assistantRoutes } from './modules/assistant/routes.js';
import { messagingRoutes } from './modules/messaging/routes.js';
import { formRoutes } from './modules/forms/routes.js';
import { bookingRoutes } from './modules/bookings/routes.js';
import { billingRoutes } from './modules/billing/routes.js';
import { agencyRoutes } from './modules/agency/routes.js';
import { publicRoutes } from './modules/public/routes.js';
import { hookRoutes } from './modules/hooks/routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Builds the Express app. Kept separate from index.js so tests can mount it. */
export function createApp(db) {
  const engine = createEngine(db);
  const ctx = { db, engine };
  const app = express();

  app.disable('x-powered-by');
  // Behind a proxy (Render, Fly, Railway…) so rate limits see the real visitor address.
  app.set('trust proxy', 1);
  // Keep the raw body: Stripe and Twilio sign their webhooks over it.
  const keepRaw = (req, _res, buf) => { req.rawBody = buf.toString('utf8'); };
  app.use(express.json({ limit: '1mb', verify: keepRaw }));
  app.use(express.urlencoded({ extended: false, limit: '1mb', verify: keepRaw }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', coreRoutes(ctx));
  app.use('/api/funnel', funnelRoutes(ctx));
  app.use('/api/content', contentRoutes(ctx));
  app.use('/api/crm', crmRoutes(ctx));
  app.use('/api/tasks', taskRoutes(ctx));
  app.use('/api/automations', automationRoutes(ctx));
  app.use('/api/helpdesk', helpdeskRoutes(ctx));
  app.use('/api/assistant', assistantRoutes(ctx));
  app.use('/api/messages', messagingRoutes(ctx));
  app.use('/api/forms', formRoutes(ctx));
  app.use('/api/bookings', bookingRoutes(ctx));
  app.use('/api/invoices', billingRoutes(ctx));
  app.use('/api/agency', agencyRoutes(ctx));
  app.use('/api/public', publicRoutes(ctx));
  app.use('/api/hooks', hookRoutes(ctx));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use(express.static(path.join(here, '..', 'public')));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(here, '..', 'public', 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message, details: err.details });
  });

  return { app, ctx };
}

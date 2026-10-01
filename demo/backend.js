// The in-browser API server: the same route modules as server/app.js, mounted
// on a fetch() interceptor so the front end talks to it exactly as it would
// talk to the Node server.
import { handle } from './shims/express.js';
import { createEngine } from '../server/automation/engine.js';
import { automationRoutes } from '../server/automation/routes.js';
import { coreRoutes } from '../server/modules/core/routes.js';
import { contentRoutes } from '../server/modules/content/routes.js';
import { crmRoutes } from '../server/modules/crm/routes.js';
import { funnelRoutes } from '../server/modules/funnel/routes.js';
import { taskRoutes } from '../server/modules/tasks/routes.js';

export function createBackend(db, { onWrite = () => {} } = {}) {
  const engine = createEngine(db);
  const ctx = { db, engine };
  // Same order as server/app.js.
  const mounts = [
    ['/api', coreRoutes(ctx)],
    ['/api/funnel', funnelRoutes(ctx)],
    ['/api/content', contentRoutes(ctx)],
    ['/api/crm', crmRoutes(ctx)],
    ['/api/tasks', taskRoutes(ctx)],
    ['/api/automations', automationRoutes(ctx)],
  ];

  async function request(method, url, headers = {}, rawBody) {
    const parsed = new URL(url, 'http://local');
    const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const req = {
      method,
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams),
      params: {},
      body: rawBody ? JSON.parse(rawBody) : {},
      get: (name) => lowerHeaders[name.toLowerCase()],
    };
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; },
    };
    try {
      if (req.path === '/api/health') return { status: 200, body: { ok: true } };
      let handled = false;
      for (const [prefix, router] of mounts) {
        if (req.path !== prefix && !req.path.startsWith(`${prefix}/`)) continue;
        handled = await handle(router, req, res, req.path.slice(prefix.length) || '/');
        if (handled) break;
      }
      if (!handled) return { status: 404, body: { error: 'Not found' } };
      if (method !== 'GET') onWrite();
      return { status: res.statusCode, body: res.body };
    } catch (err) {
      // Same error shape as the Node server's error handler.
      const status = err.status || (err instanceof SyntaxError ? 400 : 500);
      if (status >= 500) console.error(err);
      if (method !== 'GET') onWrite();
      return { status, body: { error: status >= 500 ? 'Something went wrong' : err.message, details: err.details } };
    }
  }

  /** Routes the front end's fetch('/api/...') calls to the in-browser server. */
  function installFetch() {
    const realFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.startsWith('/api')) return realFetch(input, init);
      const { status, body } = await request((init.method || 'GET').toUpperCase(), url, init.headers || {}, init.body);
      return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    };
  }

  return { ctx, request, installFetch };
}

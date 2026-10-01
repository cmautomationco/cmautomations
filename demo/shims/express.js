// Browser stand-in for Express's Router: enough of the API for the server's route modules.
export function Router() {
  const stack = [];
  const router = {
    stack,
    use(...args) {
      const [path, ...handlers] = typeof args[0] === 'string' ? args : ['/', ...args];
      stack.push({ method: null, path, handlers });
      return router;
    },
  };
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
    router[m] = (path, ...handlers) => { stack.push({ method: m.toUpperCase(), path, handlers }); return router; };
  }
  return router;
}

function matchPath(pattern, path) {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

/** Runs handlers in order; returns true if the last one passed control on with next(). */
async function runHandlers(handlers, req, res) {
  for (const fn of handlers) {
    let passed = false;
    let error = null;
    await fn(req, res, (err) => { passed = true; error = err || null; });
    if (error) throw error;
    if (!passed) return false;
  }
  return true;
}

/** Dispatches a request through one router. Returns true when a route handled it. */
export async function handle(router, req, res, subPath) {
  for (const layer of router.stack) {
    if (layer.method === null) {
      if (!(subPath === layer.path || subPath.startsWith(layer.path === '/' ? '/' : `${layer.path}/`))) continue;
      const passed = await runHandlers(layer.handlers, req, res);
      if (!passed) return true;
      continue;
    }
    if (layer.method !== req.method) continue;
    const params = matchPath(layer.path, subPath);
    if (!params) continue;
    req.params = params;
    await runHandlers(layer.handlers, req, res);
    return true;
  }
  return false;
}

export default { Router };

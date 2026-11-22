// Where HQ keeps its data.
//  • Opened from your CM Automations server while signed in → saved to the
//    server (your business's HQ document), so it's the same on every device.
//  • Opened anywhere else (a file, a preview, signed out) → saved in this browser.
import { DEFAULT_AGENTS, seedState } from './seed.js';

const LOCAL_KEY = 'cm_hq_state';
const TOKEN_KEY = 'cm_token';

const readToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };

export const store = {
  mode: 'browser', // 'server' | 'browser'
  ai: false,
  signedOut: false,
  user: null,
  savedAt: null,
  saving: false,
  error: null,
};

async function api(path, opts = {}) {
  const token = readToken();
  const res = await fetch(`/api/hq${path}`, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data;
}

/** Fills in anything newer versions of HQ expect, so old saves keep working. */
export function upgrade(state) {
  const base = seedState();
  const s = { ...base, ...state };
  s.profile = { ...base.profile, ...(state.profile || {}) };
  s.settings = {
    autoReply: { ...base.settings.autoReply, ...(state.settings?.autoReply || {}) },
    deals: { ...base.settings.deals, ...(state.settings?.deals || {}) },
    chase: { ...base.settings.chase, ...(state.settings?.chase || {}) },
  };
  for (const k of ['results', 'leads', 'deals', 'projects', 'scripts', 'invoices', 'clients', 'events', 'approvals', 'activity', 'rateCard', 'agents']) if (!Array.isArray(s[k])) s[k] = base[k];
  if (!s.agents.length) s.agents = DEFAULT_AGENTS.map((a) => ({ ...a }));
  s.updates = s.updates || {};
  s.meta = { ...base.meta, ...(state.meta || {}) };
  return s;
}

export async function loadState() {
  if (location.protocol.startsWith('http')) {
    try {
      const data = await api('');
      store.mode = 'server';
      store.ai = Boolean(data.ai);
      store.user = data.user;
      if (data.state) return upgrade(data.state);
      // First time on the server: bring over anything made in this browser.
      const local = readLocal();
      const s = local ? upgrade(local) : seedState();
      if (data.user?.name && !local) s.profile.owner = data.user.name.split(' ')[0];
      return s;
    } catch (err) {
      // 401 = this is your server but you're not signed in; anything else = no server here.
      store.signedOut = err.status === 401;
      store.mode = 'browser';
    }
  }
  const local = readLocal();
  return local ? upgrade(local) : seedState();
}

function readLocal() {
  try { const raw = localStorage.getItem(LOCAL_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

let timer = null;
let pending = null;
export function saveState(state, onStatus) {
  pending = state;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const snapshot = pending;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot)); } catch { /* storage blocked */ }
    if (store.mode === 'server') {
      store.saving = true; onStatus?.();
      try { await api('', { method: 'PUT', body: { state: snapshot } }); store.error = null; }
      catch (err) { store.error = err.message; }
      store.saving = false;
    }
    store.savedAt = new Date();
    onStatus?.();
  }, 400);
}

export function clearLocal() { try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ } }

export async function aiDraft(payload) { return (await api('/ai/draft', { method: 'POST', body: payload })).text; }
export async function aiAgent(agent, snapshot) { return api('/ai/agent', { method: 'POST', body: { agent, snapshot } }); }
export async function liveData() { return api('/live'); }

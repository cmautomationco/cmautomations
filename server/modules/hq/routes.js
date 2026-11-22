import { Router } from 'express';
import { requireAuth } from '../../lib/auth.js';
import { badRequest } from '../../lib/util.js';
import { aiEnabled, draftWithClaude, runCustomAgent } from './ai.js';

/**
 * HQ – the AI team command centre (public/hq). The whole HQ (agents, leads,
 * deals, projects, scripts, invoices, settings…) is one JSON document per
 * business, so every part of it stays editable from the HQ itself. The agents'
 * checks run in the browser (public/hq/engine.js); the server stores the
 * document, shares live data from the rest of CM Automations, and lets the
 * agents write with Claude when ANTHROPIC_API_KEY is set.
 */
const KEY = 'hq:state';
const MAX_BYTES = 900_000;

export function hqRoutes({ db }) {
  const r = Router();
  r.use(requireAuth(db));

  const load = (orgId) => {
    const row = db.get('SELECT value FROM org_meta WHERE org_id = ? AND key = ?', orgId, KEY);
    if (!row?.value) return null;
    try { return JSON.parse(row.value); } catch { return null; }
  };

  r.get('/', (req, res) => {
    res.json({ state: load(req.org.id), ai: aiEnabled(), user: { name: req.user.name }, org: { name: req.org.name } });
  });

  r.put('/', (req, res) => {
    const state = req.body?.state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw badRequest('state must be an object');
    const json = JSON.stringify(state);
    if (json.length > MAX_BYTES) throw badRequest('HQ is too large to save – export it and clear old items');
    db.run(`INSERT INTO org_meta (org_id, key, value) VALUES (?, ?, ?) ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value`, req.org.id, KEY, json);
    res.json({ ok: true, saved_at: new Date().toISOString() });
  });

  r.delete('/', (req, res) => {
    db.run('DELETE FROM org_meta WHERE org_id = ? AND key = ?', req.org.id, KEY);
    res.json({ ok: true });
  });

  // Live data from the rest of the system, so the agents see real leads,
  // deals, invoices and unread messages alongside what lives in HQ.
  r.get('/live', (req, res) => {
    const o = req.org.id;
    const since = new Date(Date.now() - 45 * 86400_000).toISOString();
    const leads = db.all(`SELECT id, first_name, last_name, email, phone, company, source, created_at, last_contacted_at
      FROM contacts WHERE org_id = ? AND lifecycle IN ('lead','prospect') AND created_at >= ? ORDER BY created_at DESC LIMIT 60`, o, since);
    const deals = db.all(`SELECT d.id, d.title, d.value, d.stage, d.updated_at, c.first_name, c.last_name, c.company, c.email
      FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id WHERE d.org_id = ? AND d.stage NOT IN ('lost') ORDER BY d.updated_at DESC LIMIT 60`, o);
    const invoices = db.all(`SELECT i.id, i.number, i.status, i.title, i.issue_date, i.due_date, i.total_pence, i.paid_pence, c.first_name, c.last_name, c.company
      FROM invoices i LEFT JOIN contacts c ON c.id = i.contact_id
      WHERE i.org_id = ? AND i.kind = 'invoice' AND i.status NOT IN ('draft','void') ORDER BY i.issue_date DESC LIMIT 80`, o);
    const unread = db.get(`SELECT COUNT(*) AS n FROM messages WHERE org_id = ? AND direction = 'in' AND read = 0`, o).n;
    res.json({ leads, deals, invoices, unread_messages: unread });
  });

  r.post('/ai/draft', async (req, res) => {
    if (!aiEnabled()) return res.status(503).json({ error: 'Claude is not connected – add ANTHROPIC_API_KEY to .env' });
    const { agent, context, draft, instruction } = req.body || {};
    if (!instruction && !context) throw badRequest('instruction or context is required');
    const text = await draftWithClaude({ agent, context, draft, instruction, owner: req.user.name, business: req.org.name });
    res.json({ text });
  });

  r.post('/ai/agent', async (req, res) => {
    if (!aiEnabled()) return res.status(503).json({ error: 'Claude is not connected – add ANTHROPIC_API_KEY to .env' });
    const { agent, snapshot } = req.body || {};
    if (!agent?.name) throw badRequest('agent is required');
    res.json(await runCustomAgent({ agent, snapshot, owner: req.user.name, business: req.org.name }));
  });

  return r;
}

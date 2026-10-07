import { Router } from 'express';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { badRequest, id, now } from '../../lib/util.js';
import { aiAssistantEnabled, answerWithAI } from './ai.js';
import { answer } from './engine.js';
import { STARTER_PROMPTS, TOPICS } from './knowledge.js';

export function assistantRoutes({ db, engine }) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/meta', (_req, res) => res.json({ ai_enabled: aiAssistantEnabled(), starters: STARTER_PROMPTS }));

  r.post('/chat', async (req, res) => {
    const message = String(req.body?.message ?? '').slice(0, 4000);
    const page = String(req.body?.page || '#/').slice(0, 200);
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (message.length > 3999) throw badRequest('That message is too long');
    const ctx = { db, engine, org: req.org, user: req.user, role: req.role };
    let result;
    let engineName = 'built-in';
    if (aiAssistantEnabled() && message.trim()) {
      try {
        result = await answerWithAI(ctx, { message, page, history });
        engineName = 'ai';
      } catch (err) {
        console.error('[assistant] AI unavailable, using built-in:', err.message);
      }
    }
    result ||= answer(ctx, { message, page });
    if (message.trim()) {
      db.insert('assistant_logs', {
        id: id('asl'), org_id: req.org.id, user_id: req.user.id, message: message.slice(0, 1000),
        intent: result.intent || null, engine: engineName, resolved: result.resolved === false ? 0 : 1, created_at: now(),
      });
    }
    res.json({ ...result, engine: engineName });
  });

  /** What people ask most, and what the assistant couldn't answer – shows where the business needs help. */
  r.get('/insights', requireRole('owner', 'admin'), (req, res) => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const titles = Object.fromEntries(TOPICS.map((t) => [t.key, t.title]));
    const top = db.all(`SELECT intent, COUNT(*) AS n FROM assistant_logs WHERE org_id = ? AND created_at >= ? AND intent NOT IN ('greeting','thanks','help','unknown') GROUP BY intent ORDER BY n DESC LIMIT 6`, req.org.id, since)
      .map((row) => ({ ...row, title: titles[row.intent] || row.intent.replace(/^go:/, 'Open ').replace(/_/g, ' ') }));
    const unanswered = db.all(`SELECT message, created_at FROM assistant_logs WHERE org_id = ? AND resolved = 0 AND created_at >= ? ORDER BY created_at DESC LIMIT 8`, req.org.id, since);
    const total = db.get('SELECT COUNT(*) AS n FROM assistant_logs WHERE org_id = ? AND created_at >= ?', req.org.id, since).n;
    res.json({ total, top, unanswered });
  });

  return r;
}

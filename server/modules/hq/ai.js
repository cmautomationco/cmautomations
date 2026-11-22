import { config } from '../../config.js';
import { HttpError } from '../../lib/util.js';

/**
 * Claude for the HQ agents: redrafting replies, follow-ups, chasers and scripts,
 * and running agents you add yourself from their written instructions.
 * Only used when ANTHROPIC_API_KEY is set; otherwise HQ uses its built-in templates.
 */
export const MODEL = 'claude-opus-5-5';
export const aiEnabled = () => Boolean(config.anthropicApiKey);

let clientPromise;
const getClient = () => {
  clientPromise ||= import('@anthropic-ai/sdk').then(({ default: Anthropic }) => new Anthropic({ apiKey: config.anthropicApiKey }));
  return clientPromise;
};

async function ask(system, user, maxTokens = 4000) {
  const client = await getClient();
  // Server-side fallback: if a request is declined, the API retries it on a
  // fallback model inside the same call.
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'Claude could not write that one – try different wording');
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

const clip = (v, n) => String(v ?? '').slice(0, n);

export async function draftWithClaude({ agent, context, draft, instruction, owner, business }) {
  const system = `You are ${clip(agent?.name, 60) || 'an assistant'}, an AI team member at ${clip(business, 120)}, working for ${clip(owner, 80)} (the boss).
Your role: ${clip(agent?.role, 200)}.
Standing instructions from the boss: ${clip(agent?.instructions, 2000) || 'none'}
Write in British English, in the boss's voice, warm and direct, no fluff. Never invent prices, dates or facts that are not in the context.
Return only the finished text of the message – no preamble, no notes, no subject line unless asked.`;
  const user = [
    context ? `Context:\n${clip(context, 6000)}` : '',
    draft ? `Current draft:\n${clip(draft, 6000)}` : '',
    instruction ? `What the boss wants changed or written:\n${clip(instruction, 1000)}` : 'Write the message.',
  ].filter(Boolean).join('\n\n');
  return ask(system, user);
}

export async function runCustomAgent({ agent, snapshot, owner, business }) {
  const system = `You are ${clip(agent.name, 60)}, an autonomous AI team member at ${clip(business, 120)}, working for ${clip(owner, 80)}.
Your role: ${clip(agent.role, 200)}.
Your instructions: ${clip(agent.instructions, 3000)}
You are doing your morning check. Look at the business snapshot and report back.
Reply with JSON only, exactly this shape:
{"summary": "one line of what you checked", "needs": ["things only the boss can decide"], "fixed": ["things you checked and sorted"], "messages": [{"to": "agent name", "text": "note to a teammate"}]}
Keep each item under 120 characters. Use at most 4 items per list. Only mention things the snapshot supports.`;
  const text = await ask(system, `Business snapshot (JSON):\n${clip(JSON.stringify(snapshot ?? {}), 20000)}`);
  const match = text.match(/\{[\s\S]*\}/);
  let out = {};
  try { out = match ? JSON.parse(match[0]) : {}; } catch { out = {}; }
  const list = (v) => (Array.isArray(v) ? v.slice(0, 4).map((x) => clip(typeof x === 'string' ? x : x?.text, 160)).filter(Boolean) : []);
  return {
    summary: clip(out.summary, 200) || 'Checked in.',
    needs: list(out.needs),
    fixed: list(out.fixed),
    messages: Array.isArray(out.messages) ? out.messages.slice(0, 3).map((m) => ({ to: clip(m?.to, 60), text: clip(m?.text, 200) })).filter((m) => m.text) : [],
  };
}

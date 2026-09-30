import { config } from '../../config.js';
import { FORMAT_LABELS, PLATFORMS, getNiche } from '../core/niches.js';
import { FRAMEWORKS } from './ideaEngine.js';

/**
 * Optional AI idea generation using Claude. Enabled when ANTHROPIC_API_KEY is
 * set; otherwise the rule-based engine is used. Returns ideas in the same shape
 * as the rule-based engine so the rest of the system doesn't care which ran.
 */
export const MODEL = 'claude-opus-5-5';

export const aiEnabled = () => Boolean(config.anthropicApiKey);

let clientPromise;
async function getClient() {
  if (!clientPromise) {
    clientPromise = import('@anthropic-ai/sdk').then(({ default: Anthropic }) => new Anthropic({ apiKey: config.anthropicApiKey }));
  }
  return clientPromise;
}

const ideaSchema = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          hook: { type: 'string' },
          angle: { type: 'string' },
          framework: { type: 'string', enum: FRAMEWORKS.map((f) => f.key) },
          format: { type: 'string', enum: Object.keys(FORMAT_LABELS) },
          platform: { type: 'string', enum: Object.keys(PLATFORMS) },
          funnel_stage: { type: 'string', enum: ['awareness', 'consideration', 'conversion', 'retention'] },
          pillar_name: { type: 'string' },
        },
        required: ['title', 'hook', 'angle', 'framework', 'format', 'platform', 'funnel_stage', 'pillar_name'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
};

export async function generateIdeasWithAI(ctx, options = {}) {
  const { org, profile, pillars, existing = [] } = ctx;
  const niche = getNiche(org.niche);
  const count = Math.min(Math.max(Number(options.count) || 8, 1), 20);
  const platforms = options.platform ? [options.platform] : (profile.platforms?.length ? profile.platforms : niche.platforms);

  const brief = {
    business: org.name,
    niche: niche.label,
    audience: profile.audience || niche.audience,
    pains: profile.pains?.length ? profile.pains : niche.pains,
    desires: profile.desires?.length ? profile.desires : niche.desires,
    offers: profile.offers?.length ? profile.offers : niche.offers,
    tone: profile.tone || 'friendly and clear',
    pillars: (options.pillarId ? pillars.filter((p) => p.id === options.pillarId) : pillars).map((p) => ({ name: p.name, description: p.description })),
    platforms,
    funnel_stage: options.funnelStage || 'a healthy mix (about 40% awareness, 30% consideration, 20% conversion, 10% retention)',
    avoid_repeating: existing.slice(0, 40).map((i) => i.title),
    frameworks: FRAMEWORKS.map((f) => ({ key: f.key, label: f.label, stage: f.stage })),
  };

  const client = await getClient();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ideaSchema } },
    system: 'You are a senior social media strategist. You generate specific, practical content ideas a small business owner can film or design themselves. Ideas must be concrete to the business, avoid generic advice, and each hook must work as the first line of a post.',
    messages: [{
      role: 'user',
      content: `Generate ${count} content ideas for this business. Use only the listed platforms, pillars and frameworks.\n\n${JSON.stringify(brief, null, 2)}`,
    }],
  });

  if (response.stop_reason === 'refusal') throw new Error('The AI declined this request');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = JSON.parse(text);
  return parsed.ideas.slice(0, count).map((idea) => {
    const pillar = pillars.find((p) => p.name.toLowerCase() === String(idea.pillar_name).toLowerCase());
    return { ...idea, pillar_id: pillar?.id || null, pillar_name: pillar?.name || null, score: 75, source: 'ai' };
  });
}

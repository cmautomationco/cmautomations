import { FORMAT_LABELS, PLATFORMS, getNiche } from '../core/niches.js';
import { render, seededRandom } from '../../lib/util.js';
import { lessonForFormat } from './academy.js';

/**
 * Rule-based content idea engine.
 *
 * Ideas are built from proven content frameworks crossed with the business's
 * pillars, audience pains, desires and topics. Each idea is scored so the best
 * ones rise to the top, with a bias toward funnel stages the content plan is
 * currently missing. Works with no external services; the optional AI mode
 * (ai.js) produces ideas in exactly the same shape.
 */

export const FRAMEWORKS = [
  {
    key: 'mistakes', label: 'Common mistakes', stage: 'awareness', formats: ['carousel', 'reel', 'short_video', 'text_post'],
    title: '{{n}} mistakes {{audience_short}} make with {{topic}}',
    hook: 'Stop doing this if you want {{desire}}.',
    angle: 'Call out the mistakes behind “{{pain}}” and show the fix for each one.',
    outline: ['Hook: name the frustration ({{pain}})', 'Mistake 1 + quick fix', 'Mistake 2 + quick fix', 'Mistake 3 + quick fix', 'Recap: what doing it right gets you ({{desire}})', 'CTA'],
    cta: 'Save this so you don’t make these mistakes.',
  },
  {
    key: 'myth', label: 'Myth vs fact', stage: 'awareness', formats: ['reel', 'short_video', 'carousel'],
    title: 'The biggest myth about {{topic}}',
    hook: 'Everyone says this about {{topic}}… it’s wrong.',
    angle: 'Challenge a common belief that keeps people stuck with “{{pain}}”.',
    outline: ['Hook: state the myth', 'Why people believe it', 'The truth (with proof or example)', 'What to do instead', 'CTA'],
    cta: 'Follow for more straight-talking {{topic}} advice.',
  },
  {
    key: 'how_to', label: 'How-to (quick win)', stage: 'awareness', formats: ['carousel', 'reel', 'short_video', 'long_video', 'article'],
    title: 'How to get {{desire}} in 3 simple steps',
    hook: 'Here’s how to get {{desire}} – in 3 simple steps.',
    angle: 'Give a genuinely useful quick win that proves you know your stuff.',
    outline: ['Hook: promise the outcome', 'Step 1', 'Step 2', 'Step 3', 'Result they can expect', 'CTA'],
    cta: 'Try step 1 today and tell me how it goes.',
  },
  {
    key: 'listicle', label: 'Top tips list', stage: 'awareness', formats: ['carousel', 'text_post', 'thread', 'article'],
    title: '{{n}} {{topic}} tips I wish I knew sooner',
    hook: 'Tip #3 changed everything for my clients.',
    angle: 'Stack quick, practical tips your audience can use today.',
    outline: ['Hook', 'Tip 1', 'Tip 2', 'Tip 3 (the best one)', 'Tip 4', 'Tip 5', 'CTA'],
    cta: 'Share this with someone who needs it.',
  },
  {
    key: 'behind_scenes', label: 'Behind the scenes', stage: 'consideration', formats: ['reel', 'short_video', 'story'],
    title: 'Behind the scenes: how we {{process_verb}}',
    hook: 'Ever wondered what actually happens when you {{process_verb_you}}?',
    angle: 'Show the care, process and people behind {{offer}} to build trust.',
    outline: ['Hook: the question', 'Scene 1: preparation', 'Scene 2: the work in action', 'Scene 3: the finished result', 'Why we do it this way', 'CTA'],
    cta: 'Want this for yourself? Message us.',
  },
  {
    key: 'transformation', label: 'Before & after', stage: 'consideration', formats: ['reel', 'carousel', 'static', 'short_video'],
    title: 'Before & after: the road to {{desire}}',
    hook: 'This is what {{desire}} really looks like.',
    angle: 'Show a real transformation and the key steps that made it happen.',
    outline: ['Hook: the “after”', 'The “before” situation', 'What we changed (3 key steps)', 'The result + how they feel', 'CTA'],
    cta: 'Want results like this? Link in bio.',
  },
  {
    key: 'case_study', label: 'Client case study', stage: 'consideration', formats: ['carousel', 'long_video', 'text_post', 'article'],
    title: 'Case study: how one client got {{desire}}',
    hook: 'They came to us dealing with {{pain}}. Here’s what happened next.',
    angle: 'Tell a client story with the problem, the plan and the measurable result.',
    outline: ['Hook: the result', 'Who they are & the problem', 'What we did', 'The result (numbers if possible)', 'What you can learn from it', 'CTA'],
    cta: 'Book a call to see if we can do the same for you.',
  },
  {
    key: 'faq', label: 'FAQ answered', stage: 'consideration', formats: ['short_video', 'reel', 'text_post', 'story'],
    title: '“{{faq}}” – answered honestly',
    hook: 'The question I get asked every week…',
    angle: 'Answer the questions buyers ask right before they decide.',
    outline: ['Hook: read the question', 'Short answer', 'Why (with an example)', 'What this means for you', 'CTA'],
    cta: 'Got a question? Drop it in the comments.',
  },
  {
    key: 'story', label: 'Personal story', stage: 'consideration', formats: ['reel', 'text_post', 'long_video'],
    title: 'Why I started {{business}}',
    hook: 'I never planned to do this. Then…',
    angle: 'Share the moment that led you here and what you believe.',
    outline: ['Hook: the turning point', 'Where you were', 'What changed', 'What you believe now', 'How that shapes how you help people', 'CTA'],
    cta: 'Follow along – there’s more to this story.',
  },
  {
    key: 'hot_take', label: 'Hot take / opinion', stage: 'awareness', formats: ['text_post', 'short_video', 'thread'],
    title: 'Unpopular opinion: {{topic}} is overcomplicated',
    hook: 'Unpopular opinion about {{topic}}…',
    angle: 'Take a clear stance that your ideal customer agrees with privately.',
    outline: ['Hook: the opinion', 'Why most people get it wrong', 'Your simpler approach', 'Invite discussion'],
    cta: 'Agree or disagree? Tell me below.',
  },
  {
    key: 'comparison', label: 'Comparison', stage: 'conversion', formats: ['carousel', 'short_video', 'article'],
    title: '{{offer}} vs doing it yourself – honest comparison',
    hook: 'Should you DIY or get help? Here’s the honest answer.',
    angle: 'Compare options fairly so buyers can see when you are the right choice.',
    outline: ['Hook', 'Option A: DIY – pros/cons', 'Option B: typical alternative – pros/cons', 'Option C: {{offer}} – pros/cons', 'Who each is best for', 'CTA'],
    cta: 'Not sure which is right? Send us a message.',
  },
  {
    key: 'offer_spotlight', label: 'Offer spotlight', stage: 'conversion', formats: ['carousel', 'reel', 'static', 'story'],
    title: 'Everything included in {{offer}}',
    hook: 'If you want {{desire}}, this is for you.',
    angle: 'Walk through the offer, who it’s for and exactly how to start.',
    outline: ['Hook: who this is for', 'The problem it solves', 'What’s included', 'Proof / testimonial', 'How to get started', 'CTA with urgency'],
    cta: 'Spaces are limited – book now.',
  },
  {
    key: 'objection', label: 'Objection buster', stage: 'conversion', formats: ['short_video', 'reel', 'text_post'],
    title: '“It’s too expensive” – the real cost of {{pain}}',
    hook: 'Think you can’t afford it? Let’s do the maths.',
    angle: 'Handle the biggest objection by comparing it to the cost of the problem.',
    outline: ['Hook: name the objection', 'The real cost of staying stuck', 'What the investment gets you', 'Proof', 'CTA'],
    cta: 'Let’s chat about what fits your budget.',
  },
  {
    key: 'customer_love', label: 'Customer appreciation', stage: 'retention', formats: ['story', 'static', 'reel'],
    title: 'Customer spotlight: celebrating our community',
    hook: 'This made our whole week…',
    angle: 'Celebrate customers publicly – it builds loyalty and referrals.',
    outline: ['Hook: the moment', 'Who they are', 'What they achieved', 'Thank you', 'CTA'],
    cta: 'Tag someone who deserves a shout-out.',
  },
  {
    key: 'how_to_use', label: 'Get more from it', stage: 'retention', formats: ['short_video', 'carousel', 'article'],
    title: '{{n}} ways to get even more from {{offer}}',
    hook: 'Already a customer? You’re probably missing this.',
    angle: 'Help existing customers succeed so they stay and refer others.',
    outline: ['Hook', 'Tip 1', 'Tip 2', 'Tip 3', 'Where to get help', 'CTA'],
    cta: 'Save this for later.',
  },
];

export const STAGE_TARGETS = { awareness: 0.4, consideration: 0.3, conversion: 0.2, retention: 0.1 };

const PROCESS_VERBS = {
  product: ['make every order', 'pack your order', 'test every product'],
  service: ['prepare for every client', 'deliver results', 'plan every project'],
  hybrid: ['get ready for service', 'create our menu', 'look after every guest'],
};

const FAQS = [
  'How much does {offer} cost?',
  'How long does {offer} take to work?',
  'Is {offer} really worth it?',
  'Who is {offer} right for?',
  'What happens after I sign up for {offer}?',
];

const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);

function similar(a, b) {
  const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((w) => w.length > 3));
  const wa = words(a); const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size);
}

/**
 * @param ctx { org, profile, pillars, existing: [{title, funnel_stage}] }
 * @param options { count, pillarId, platform, funnelStage, seed }
 */
export function generateIdeas(ctx, options = {}) {
  const { org, profile, pillars, existing = [] } = ctx;
  const niche = getNiche(org.niche);
  const rand = seededRandom(options.seed ?? `${org.id}:${existing.length}:${Date.now()}`);
  const pickOne = (arr) => arr[Math.floor(rand() * arr.length)];
  const count = Math.min(Math.max(Number(options.count) || 8, 1), 30);

  const pains = profile.pains?.length ? profile.pains : niche.pains;
  const desires = profile.desires?.length ? profile.desires : niche.desires;
  const offers = profile.offers?.length ? profile.offers : niche.offers;
  const platforms = options.platform ? [options.platform] : (profile.platforms?.length ? profile.platforms : niche.platforms);
  const usePillars = options.pillarId ? pillars.filter((p) => p.id === options.pillarId) : pillars;

  // Which funnel stages are under-represented in the current plan?
  const total = existing.length || 1;
  const gap = {};
  for (const [stage, target] of Object.entries(STAGE_TARGETS)) {
    const share = existing.filter((i) => i.funnel_stage === stage).length / total;
    gap[stage] = existing.length ? target - share : 0;
  }

  const frameworks = options.funnelStage ? FRAMEWORKS.filter((f) => f.stage === options.funnelStage) : FRAMEWORKS;
  const candidates = [];
  const seen = new Set();

  for (let attempt = 0; attempt < count * 12 && candidates.length < count * 4; attempt++) {
    const fw = pickOne(frameworks);
    const pillar = usePillars.length ? pickOne(usePillars) : null;
    const platform = pickOne(platforms);
    const platformFormats = PLATFORMS[platform]?.formats || ['static'];
    const native = fw.formats.filter((f) => platformFormats.includes(f));
    const format = native.length ? pickOne(native) : pickOne(platformFormats);
    const pain = pickOne(pains);
    const vars = {
      n: pickOne([3, 5, 7]),
      audience_short: niche.audience.split(' who ')[0].toLowerCase(),
      topic: pickOne(niche.topics),
      pain,
      desire: pickOne(desires),
      offer: pickOne(offers),
      business: org.name,
      faq: pickOne(FAQS).replace('{offer}', pickOne(offers)),
      process_verb: pickOne(PROCESS_VERBS[org.business_type] || PROCESS_VERBS.service),
    };
    vars.process_verb_you = org.business_type === 'product' ? 'order from us' : 'work with us';
    const title = cap(render(fw.title, vars));
    if (seen.has(title)) continue;
    seen.add(title);

    let score = 55;
    score += Math.round((gap[fw.stage] || 0) * 60);
    score += native.length ? 10 : -5;
    score += (pillar?.weight || 1) * 3;
    score += Math.round(rand() * 10);
    const dup = existing.some((e) => similar(e.title, title) >= 0.8);
    if (dup) score -= 35;

    candidates.push({
      title,
      hook: render(fw.hook, vars),
      angle: render(fw.angle, vars),
      framework: fw.key,
      format,
      platform,
      funnel_stage: fw.stage,
      pillar_id: pillar?.id || null,
      pillar_name: pillar?.name || null,
      score: Math.max(1, Math.min(99, score)),
      source: 'engine',
      _vars: vars,
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ _vars, ...idea }) => ({ ...idea, brief: buildBrief(idea, ctx, _vars) }));
}

/**
 * The creation brief: everything the client needs to make the piece themselves.
 * The system does the thinking; the client adds their voice and finalises it.
 */
export function buildBrief(idea, ctx, vars = {}) {
  const niche = getNiche(ctx.org.niche);
  const fw = FRAMEWORKS.find((f) => f.key === idea.framework);
  const v = {
    pain: vars.pain || ctx.profile.pains?.[0] || niche.pains[0],
    desire: vars.desire || ctx.profile.desires?.[0] || niche.desires[0],
    offer: vars.offer || ctx.profile.offers?.[0] || niche.offers[0],
    topic: vars.topic || niche.topics[0],
    ...vars,
  };
  const outline = (fw?.outline || ['Hook', 'Main point', 'Example', 'CTA']).map((beat) => render(beat, v));
  const hooks = [
    idea.hook,
    `Dealing with ${v.pain}? Watch this.`,
    `Nobody talks about this when it comes to ${v.topic}…`,
  ].filter(Boolean);
  const tags = [...new Set([
    ...niche.topics.slice(0, 3),
    v.topic,
    ctx.org.name,
  ].map((t) => `#${String(t).replace(/[^a-z0-9]/gi, '').toLowerCase()}`))].slice(0, 6);
  const lesson = lessonForFormat(idea.format);

  return {
    objective: `${cap(idea.funnel_stage)} content – ${stageGoal(idea.funnel_stage)}`,
    audience: ctx.profile.audience || niche.audience,
    tone: ctx.profile.tone || 'Friendly, clear and confident',
    hooks,
    outline,
    caption_template: [
      hooks[0],
      '',
      `[1–2 lines expanding on the problem: ${v.pain}]`,
      '[Your key point or story in your own words]',
      '',
      render(fw?.cta || 'Follow for more.', v),
    ].join('\n'),
    cta: render(fw?.cta || 'Follow for more.', v),
    hashtags: tags,
    format_label: FORMAT_LABELS[idea.format] || idea.format,
    creation_steps: lesson?.steps || [],
    checklist: [
      'Hook is in the first line / first 2 seconds',
      'One clear message only',
      'Written in your own words and voice',
      'Call to action included',
      'Captions/alt text added for accessibility',
      'Spell-checked and brand colours used',
    ],
    lesson_key: lesson?.key || null,
  };
}

function stageGoal(stage) {
  return {
    awareness: 'reach new people and show you understand their problem.',
    consideration: 'build trust by showing how you work and the results you get.',
    conversion: 'turn warm followers into customers with a clear next step.',
    retention: 'delight existing customers so they stay and refer others.',
  }[stage];
}

/** Suggests the next free posting slots based on a posts-per-week target. */
export function suggestSlots(postsPerWeek = 4, taken = [], from = new Date()) {
  const days = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] }[Math.min(Math.max(postsPerWeek, 1), 7)];
  const takenDays = new Set(taken.map((t) => t.slice(0, 10)));
  const slots = [];
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  for (let i = 1; slots.length < 6 && i < 60; i++) {
    const day = new Date(d.getTime() + i * 86400_000);
    if (!days.includes(day.getUTCDay())) continue;
    const iso = day.toISOString().slice(0, 10);
    if (takenDays.has(iso)) continue;
    slots.push(`${iso}T${day.getUTCDay() % 2 ? '12:00' : '18:00'}:00.000Z`);
  }
  return slots;
}

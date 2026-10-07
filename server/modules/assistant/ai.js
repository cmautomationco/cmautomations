import { config } from '../../config.js';
import { getNiche } from '../core/niches.js';
import { CATEGORIES, PRIORITIES } from '../helpdesk/service.js';
import { addTask, dataAnswer, parseDue, raiseIssue, searchContacts } from './engine.js';
import { PAGE_HELP, PLACES, TOPICS } from './knowledge.js';

/**
 * Claude-powered assistant, used when ANTHROPIC_API_KEY is set. It has the same
 * abilities as the built-in assistant (navigate, read the business's data,
 * search contacts, create tasks, raise issues) exposed as tools, and returns
 * the same reply shape. Any failure falls back to the built-in assistant.
 */
export const MODEL = 'claude-opus-5-5';
export const aiAssistantEnabled = () => Boolean(config.anthropicApiKey);

let clientPromise;
const getClient = () => {
  clientPromise ||= import('@anthropic-ai/sdk').then(({ default: Anthropic }) => new Anthropic({ apiKey: config.anthropicApiKey }));
  return clientPromise;
};

const DATA_TOPICS = ['today', 'overdue', 'summary', 'time_saved', 'workload', 'funnel', 'posts', 'failed_posts', 'follow_ups', 'pipeline', 'issues', 'ideas', 'creation'];

const TOOLS = [
  {
    name: 'navigate',
    description: 'Open a section of the system for the user. Use this whenever the user needs to go somewhere to solve their problem. Optionally point at a button by its exact on-screen text.',
    input_schema: {
      type: 'object',
      properties: {
        destination: { type: 'string', enum: Object.keys(PLACES), description: 'The section to open.' },
        highlight: { type: 'string', description: 'Exact text of a button to point at, e.g. "Add lead", "New build", "Generate ideas", "New task", "New issue".' },
      },
      required: ['destination'],
    },
  },
  {
    name: 'get_business_data',
    description: 'Read live information about the user’s business. Use it before answering questions about tasks, leads, deals, content, issues, builds or time saved.',
    input_schema: { type: 'object', properties: { topic: { type: 'string', enum: DATA_TOPICS } }, required: ['topic'] },
  },
  {
    name: 'search_contacts',
    description: 'Find contacts in the CRM by name, company or email.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'create_task',
    description: 'Create a task for the user. Only when they ask for a task or reminder.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short task title, starting with a verb.' },
        due: { type: 'string', description: 'When it is due in plain words, e.g. "today", "tomorrow", "on Friday", "in 3 days". Omit if not given.' },
        priority: { type: 'string', enum: PRIORITIES },
      },
      required: ['title'],
    },
  },
  {
    name: 'raise_issue',
    description: 'Log a problem in the Help Desk so a person handles it. Use when something is broken, a customer has a complaint, the user needs an admin, or you cannot solve the problem yourself.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string', enum: CATEGORIES },
        priority: { type: 'string', enum: PRIORITIES },
      },
      required: ['title', 'description'],
    },
  },
];

function systemPrompt(ctx, page) {
  const niche = getNiche(ctx.org.niche);
  const knowledge = TOPICS.map((t) => `- ${t.title}${t.admin ? ' [owners/admins only]' : ''}: ${t.answer || '(answer from live data)'}${t.go ? ` → ${PLACES[t.go.place]?.label}${t.go.highlight ? `, button “${t.go.highlight}”` : ''}` : ''}`).join('\n');
  const places = Object.entries(PLACES).map(([k, p]) => `- ${k}: ${p.label}`).join('\n');
  return `You are the built-in assistant inside CM Automations, an all-in-one system for running a business: Build Funnel (idea to fully built product or service), Content Studio (strategy, ideas, briefs, scheduling), CRM, Tasks, Automations, Help Desk and Settings.

You are talking to ${ctx.user.name}, who is ${ctx.role === 'member' ? 'a team member (not an admin)' : `an ${ctx.role}`} at ${ctx.org.name} (${niche.label}). They are currently on ${page}.

How to help:
- Work out the real problem, then solve it: answer in a few short sentences of plain English (British spelling), and use the navigate tool to take them to the screen that fixes it, pointing at the right button when there is one.
- Use get_business_data before answering anything about their tasks, leads, deals, content, issues, builds or time saved. Never guess numbers.
- Only describe features listed below. If something isn’t built yet, say so plainly and offer to raise it as an issue.
- Team members cannot change owner/admin-only settings. Explain that and offer to raise it with an admin using raise_issue.
- If you cannot solve something, use raise_issue so a person picks it up, and tell them who will respond.
- Don’t use markdown headings or tables. Bullet points with “•” are fine.

Sections you can open:
${places}

What each section is for:
${Object.entries(PAGE_HELP).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Known problems and how they are solved:
${knowledge}`;
}

async function runTool(ctx, name, input, out, page) {
  switch (name) {
    case 'navigate': {
      const place = PLACES[input.destination];
      if (!place) return 'Unknown destination.';
      out.navigate = { hash: place.hash, label: place.label, highlight: input.highlight || undefined };
      return `Opened ${place.label}.`;
    }
    case 'get_business_data': {
      const result = dataAnswer(input.topic, ctx);
      if (result.navigate && !out.navigate) out.navigate = result.navigate;
      return result.text || 'Nothing to report.';
    }
    case 'search_contacts': {
      const found = searchContacts(ctx, input.query);
      if (found.length && !out.navigate) out.navigate = { hash: `#/crm/contacts?q=${encodeURIComponent(input.query)}`, label: 'Contacts' };
      return found.length ? JSON.stringify(found) : 'No contacts found.';
    }
    case 'create_task': {
      const due = input.due ? parseDue(input.due) : null;
      const task = addTask(ctx, { title: input.title, due: due?.due, priority: input.priority });
      out.actions.push({ label: 'Open My day', hash: '#/tasks/today' });
      out.created = { type: 'task', id: task.id };
      return `Task created: “${task.title}”${due ? `, due ${due.label}` : ''}.`;
    }
    case 'raise_issue': {
      const issue = raiseIssue(ctx, { ...input, page });
      out.actions.push({ label: 'View the issue', hash: `#/helpdesk/${issue.id}` });
      out.created = { type: 'issue', id: issue.id };
      return `Issue logged (${issue.priority}, ${issue.category}), assigned to ${issue.assignee_name || 'the team'}.`;
    }
    default:
      return 'Unknown tool.';
  }
}

export async function answerWithAI(ctx, { message, page = '#/', history = [] }, client = null) {
  client ||= await getClient();
  // Prior turns as plain text, starting with a user turn and alternating.
  const messages = [];
  for (const turn of history.slice(-8)) {
    const role = turn.role === 'assistant' ? 'assistant' : 'user';
    if (!turn.text || (messages.length === 0 && role !== 'user') || messages[messages.length - 1]?.role === role) continue;
    messages.push({ role, content: String(turn.text).slice(0, 2000) });
  }
  if (messages[messages.length - 1]?.role === 'user') messages.pop();
  messages.push({ role: 'user', content: String(message).slice(0, 4000) });

  const out = { actions: [], navigate: null, created: null };
  for (let i = 0; i < 5; i++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: systemPrompt(ctx, page),
      tools: TOOLS,
      messages,
    });
    if (response.stop_reason === 'refusal') throw new Error('The AI declined this request');
    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { reply: text || 'Done.', navigate: out.navigate || undefined, actions: out.actions, created: out.created || undefined, intent: 'ai', resolved: true };
    }
    messages.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const block of toolUses) {
      let content;
      try { content = await runTool(ctx, block.name, block.input || {}, out, page); } catch (err) { content = `Error: ${err.message}`; }
      results.push({ type: 'tool_result', tool_use_id: block.id, content });
    }
    messages.push({ role: 'user', content: results });
  }
  throw new Error('The AI assistant took too many steps');
}

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { createScheduler } from '../server/automation/scheduler.js';
import { RECIPES, installMissingRecipes } from '../server/automation/recipes.js';
import { parseDue, rankTopics } from '../server/modules/assistant/engine.js';

let server;
let base;
let ctx;
let scheduler;

before(() => {
  const db = openDatabase(':memory:');
  const app = createApp(db);
  ctx = app.ctx;
  scheduler = createScheduler(ctx);
  server = app.app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

let n = 0;
async function business() {
  n++;
  const res = await call('POST', '/auth/register', { body: { name: 'Owner Person', email: `hd${n}@test.com`, password: 'password123', business_name: `HD ${n}`, niche: 'agency' } });
  const { token } = res.body;
  const member = await call('POST', '/team', { token, body: { name: 'Mo Member', email: `member${n}@test.com`, password: 'password123', role: 'member' } });
  const login = await call('POST', '/auth/login', { body: { email: `member${n}@test.com`, password: 'password123' } });
  return { token, memberToken: login.body.token, memberId: member.body.id, org: res.body.org, ownerId: res.body.user.id };
}

const chat = (token, message, page = '#/') => call('POST', '/assistant/chat', { token, body: { message, page } });

describe('Help Desk', () => {
  test('new issues are auto-assigned with a response target and urgent ones alert admins', async () => {
    const b = await business();
    const res = await call('POST', '/helpdesk/issues', { token: b.memberToken, body: { title: 'Checkout page is down', priority: 'urgent', category: 'technical' } });
    assert.equal(res.status, 201);
    const issue = res.body.issue;
    assert.equal(issue.assignee_id, b.ownerId);
    const hours = (new Date(issue.due_at) - new Date(issue.created_at)) / 3600_000;
    assert.equal(Math.round(hours), 4);
    assert.ok(res.body.automations.some((a) => a.automation.startsWith('Urgent issue')));
    const notes = await call('GET', '/notifications', { token: b.token });
    assert.ok(notes.body.some((x) => x.title.includes('urgent issue: Checkout page is down')));
  });

  test('updates move an issue on, and resolving needs a note and tells the reporter', async () => {
    const b = await business();
    const { body: { issue } } = await call('POST', '/helpdesk/issues', { token: b.memberToken, body: { title: 'Wrong price on invoice', category: 'billing' } });
    await call('POST', `/helpdesk/issues/${issue.id}/comments`, { token: b.token, body: { body: 'Looking into it' } });
    const detail = await call('GET', `/helpdesk/issues/${issue.id}`, { token: b.token });
    assert.equal(detail.body.status, 'in_progress');
    assert.equal(detail.body.comments.length, 1);

    const noNote = await call('PATCH', `/helpdesk/issues/${issue.id}`, { token: b.token, body: { status: 'resolved' } });
    assert.equal(noNote.status, 400);
    const done = await call('PATCH', `/helpdesk/issues/${issue.id}`, { token: b.token, body: { status: 'resolved', resolution: 'Re-issued the invoice.' } });
    assert.equal(done.body.issue.status, 'resolved');
    assert.ok(done.body.issue.resolved_at);
    const memberNotes = await call('GET', '/notifications', { token: b.memberToken });
    assert.ok(memberNotes.body.some((x) => x.title === '✅ Sorted: Wrong price on invoice' && x.body === 'Re-issued the invoice.'));
    const stats = await call('GET', '/helpdesk/stats', { token: b.token });
    assert.equal(stats.body.resolved_week, 1);
  });

  test('issues past their response target are escalated once', async () => {
    const b = await business();
    const { body: { issue } } = await call('POST', '/helpdesk/issues', { token: b.token, body: { title: 'Supplier late', priority: 'low' } });
    const later = new Date(Date.now() + 8 * 86400_000);
    await scheduler.tick(later);
    await scheduler.tick(later);
    const notes = (await call('GET', '/notifications', { token: b.token })).body.filter((x) => x.title === 'Escalated: Supplier late');
    assert.equal(notes.length, 1);
    const overdue = await call('GET', `/helpdesk/issues/${issue.id}`, { token: b.token });
    assert.equal(overdue.body.overdue_notified, 1);
  });

  test('another business cannot see the issue', async () => {
    const a = await business();
    const other = await business();
    const { body: { issue } } = await call('POST', '/helpdesk/issues', { token: a.token, body: { title: 'Private problem' } });
    assert.equal((await call('GET', `/helpdesk/issues/${issue.id}`, { token: other.token })).status, 404);
  });
});

describe('Assistant', () => {
  test('takes people to the screen that solves the problem and points at the button', async () => {
    const b = await business();
    const lead = await chat(b.token, 'How do I add a new lead?');
    assert.equal(lead.body.navigate.hash, '#/crm/contacts?new=1');
    const ideas = await chat(b.token, 'I don’t know what to post this week');
    assert.equal(ideas.body.navigate.hash, '#/content/ideas');
    assert.equal(ideas.body.navigate.highlight, 'Generate ideas');
    const place = await chat(b.token, 'take me to the pipeline');
    assert.equal(place.body.navigate.hash, '#/crm/pipeline');
  });

  test('answers from the business’s own data', async () => {
    const b = await business();
    await call('POST', '/tasks', { token: b.token, body: { title: 'Send the report', due_at: new Date(Date.now() - 86400_000).toISOString() } });
    const res = await chat(b.token, 'what’s overdue?');
    assert.match(res.body.reply, /Send the report/);
    const summary = await chat(b.token, 'How is the business doing?');
    assert.match(summary.body.reply, /Pipeline:/);
  });

  test('creates tasks with a due date from plain English', async () => {
    const b = await business();
    const res = await chat(b.token, 'Remind me to call Emma tomorrow');
    assert.equal(res.body.created.type, 'task');
    assert.match(res.body.reply, /“Call Emma”.*tomorrow/);
    const tasks = (await call('GET', '/tasks', { token: b.token })).body;
    const task = tasks.find((t) => t.id === res.body.created.id);
    assert.equal(task.title, 'Call Emma');
    assert.equal(task.due_at.slice(0, 10), new Date(Date.now() + 86400_000).toISOString().slice(0, 10));
  });

  test('logs problems in the Help Desk with a sensible category and priority', async () => {
    const b = await business();
    const res = await chat(b.memberToken, 'Report a problem: customers can’t pay on the booking page', '#/crm/pipeline');
    assert.equal(res.body.created.type, 'issue');
    const issue = (await call('GET', `/helpdesk/issues/${res.body.created.id}`, { token: b.token })).body;
    assert.equal(issue.source, 'assistant');
    assert.equal(issue.category, 'billing');
    assert.equal(issue.priority, 'urgent');
    assert.match(issue.description, /#\/crm\/pipeline/);
  });

  test('respects permissions: team members are offered an admin instead', async () => {
    const b = await business();
    const res = await chat(b.memberToken, 'I want to create a new automation');
    assert.equal(res.body.navigate, undefined);
    assert.ok(res.body.actions.some((a) => a.label === 'Ask an admin'));
    const owner = await chat(b.token, 'I want to create a new automation');
    assert.equal(owner.body.navigate.hash, '#/automations');
  });

  test('admits when it doesn’t know, offers a person, and records it for insights', async () => {
    const b = await business();
    const res = await chat(b.token, 'zxqv plorb');
    assert.equal(res.body.resolved, false);
    assert.ok(res.body.actions.some((a) => a.say?.startsWith('Report a problem:')));
    const insights = await call('GET', '/assistant/insights', { token: b.token });
    assert.equal(insights.body.unanswered[0].message, 'zxqv plorb');
    assert.equal((await call('GET', '/assistant/insights', { token: b.memberToken })).status, 403);
  });

  test('finds contacts by name', async () => {
    const b = await business();
    await call('POST', '/crm/contacts', { token: b.token, body: { first_name: 'Priyanka', last_name: 'Rao', company: 'Acme' } });
    const res = await chat(b.token, 'find Priyanka');
    assert.match(res.body.reply, /Priyanka Rao – Acme/);
    assert.equal(res.body.navigate.hash, '#/crm/contacts?q=Priyanka');
  });

  test('understands everyday dates', () => {
    const monday = new Date('2030-01-07T09:00:00Z');
    assert.equal(parseDue('call them on Friday', monday).due.slice(0, 10), '2030-01-11');
    assert.equal(parseDue('next week', monday).due.slice(0, 10), '2030-01-14');
    assert.equal(parseDue('in 3 days', monday).due.slice(0, 10), '2030-01-10');
    assert.equal(parseDue('no date here', monday), null);
  });

  test('specific phrases outrank generic words', () => {
    assert.equal(rankTopics('my issues')[0].topic.key, 'issue_status');
    assert.equal(rankTopics('how do I connect instagram')[0].topic.key, 'content_channels');
  });
});

test('new automation recipes reach existing businesses once, and deleted ones stay deleted', async () => {
  const b = await business();
  const before = (await call('GET', '/automations', { token: b.token })).body;
  assert.equal(before.length, RECIPES.length);
  const victim = before.find((a) => a.recipe === 'issue_assigned');
  await call('DELETE', `/automations/${victim.id}`, { token: b.token });
  assert.equal(installMissingRecipes(ctx.db), 0);
  const afterRun = (await call('GET', '/automations', { token: b.token })).body;
  assert.ok(!afterRun.some((a) => a.recipe === 'issue_assigned'));
});

test('AI assistant runs its tools and returns the same reply shape', async () => {
  const { answerWithAI } = await import('../server/modules/assistant/ai.js');
  const b = await business();
  const org = ctx.db.get('SELECT * FROM organizations WHERE id = ?', b.org.id);
  const requests = [];
  const replies = [
    { stop_reason: 'tool_use', content: [
      { type: 'tool_use', id: 't1', name: 'navigate', input: { destination: 'tasks', highlight: 'New task' } },
      { type: 'tool_use', id: 't2', name: 'create_task', input: { title: 'Call the supplier', due: 'tomorrow' } },
    ] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done – I’ve added it and opened your tasks.' }] },
  ];
  const fakeClient = { beta: { messages: { create: async (req) => { requests.push(structuredClone(req)); return replies.shift(); } } } };
  const res = await answerWithAI({ db: ctx.db, engine: ctx.engine, org, user: { id: b.ownerId, name: 'Owner Person' }, role: 'owner' },
    { message: 'Remind me to call the supplier tomorrow', page: '#/', history: [{ role: 'assistant', text: 'Hi' }, { role: 'user', text: 'hello' }, { role: 'assistant', text: 'How can I help?' }] }, fakeClient);
  assert.equal(res.reply, 'Done – I’ve added it and opened your tasks.');
  assert.deepEqual(res.navigate, { hash: '#/tasks', label: 'Task board', highlight: 'New task' });
  assert.equal(res.created.type, 'task');
  // History starts with a user turn and alternates; tool results go back in one user message.
  assert.equal(requests[0].messages[0].role, 'user');
  assert.deepEqual(requests[1].messages.at(-1).content.map((c) => c.tool_use_id), ['t1', 't2']);
  assert.equal(requests[0].model, 'claude-opus-5-5');
});

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { createScheduler } from '../server/automation/scheduler.js';
import { STAGES, stepsFor } from '../server/modules/funnel/blueprint.js';
import { RECIPES } from '../server/automation/recipes.js';

let server;
let base;
let ctx;
let scheduler;

before(async () => {
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

let counter = 0;
async function newBusiness(overrides = {}) {
  counter++;
  const res = await call('POST', '/auth/register', {
    body: { name: 'Owner', email: `owner${counter}@test.com`, password: 'password123', business_name: `Biz ${counter}`, niche: 'fitness', ...overrides },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

describe('accounts & multi-business', () => {
  test('registering provisions a ready-to-use business from its niche', async () => {
    const { token, org } = await newBusiness({ niche: 'local_services' });
    assert.equal(org.niche, 'local_services');
    const pillars = await call('GET', '/content/pillars', { token });
    assert.equal(pillars.body.length, 4);
    const channels = await call('GET', '/content/channels', { token });
    assert.ok(channels.body.some((c) => c.platform === 'google_business'));
    const rules = await call('GET', '/automations', { token });
    assert.equal(rules.body.length, RECIPES.length);
  });

  test('requests without a session are rejected', async () => {
    const res = await call('GET', '/dashboard');
    assert.equal(res.status, 401);
  });

  test('businesses cannot see each other’s data', async () => {
    const a = await newBusiness();
    const b = await newBusiness();
    const created = await call('POST', '/crm/contacts', { token: a.token, body: { first_name: 'Secret' } });
    const peek = await call('GET', `/crm/contacts/${created.body.contact.id}`, { token: b.token });
    assert.equal(peek.status, 404);
    const list = await call('GET', '/crm/contacts', { token: b.token });
    assert.equal(list.body.length, 0);
  });

  test('one login can run several businesses and switch between them', async () => {
    const { token } = await newBusiness();
    const second = await call('POST', '/orgs', { token, body: { name: 'Second Biz', niche: 'saas' } });
    assert.equal(second.status, 201);
    await call('POST', '/auth/switch', { token, body: { org_id: second.body.id } });
    const me = await call('GET', '/me', { token });
    assert.equal(me.body.org.name, 'Second Biz');
    assert.equal(me.body.orgs.length, 2);
  });
});

describe('Build Funnel', () => {
  test('creates every blueprint step and pre-fills the idea', async () => {
    const { token } = await newBusiness();
    const res = await call('POST', '/funnel/projects', { token, body: { name: 'Glow Kit', kind: 'product', idea: 'A skincare starter kit' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.steps_total, stepsFor('product').length);
    assert.equal(res.body.stages.length, STAGES.length);
    assert.equal(res.body.stages[0].status, 'active');
    assert.equal(res.body.stages[1].status, 'locked');
    assert.equal(res.body.stages[0].steps[0].answers.statement, 'A skincare starter kit');
    // Service-only steps are not included for products.
    assert.ok(!res.body.stages.flatMap((s) => s.steps).some((s) => s.key === 'delivery_map'));
  });

  test('enforces required answers and stage order, then fires stage automations', async () => {
    const { token } = await newBusiness();
    const { body: project } = await call('POST', '/funnel/projects', { token, body: { name: 'Coaching Offer', kind: 'service' } });
    const url = (step) => `/funnel/projects/${project.id}/steps/${step}`;

    const missing = await call('PATCH', url('ideal_customer'), { token, body: { status: 'done' } });
    assert.equal(missing.status, 400);
    assert.ok(missing.body.details.length > 0);

    const locked = await call('PATCH', url('competitor_scan'), { token, body: { status: 'skipped' } });
    assert.equal(locked.status, 400);

    const answers = {
      idea_statement: { statement: 'I help X get Y' },
      ideal_customer: { description: 'Busy founders' },
      problem_pain: { pains: ['no time'] },
      transformation: { before: 'stuck', after: 'free' },
      unfair_advantage: { lead_advantage: '10 years experience' },
    };
    let last;
    for (const [step, a] of Object.entries(answers)) {
      last = await call('PATCH', url(step), { token, body: { answers: a, status: 'done' } });
      assert.equal(last.status, 200, JSON.stringify(last.body));
    }
    assert.equal(last.body.project.stages[0].status, 'done');
    assert.equal(last.body.project.stages[1].status, 'active');
    assert.equal(last.body.project.current_stage, 'validation');
    assert.ok(last.body.automations.some((a) => a.automation.includes('Funnel stage complete')));

    const tasks = await call('GET', '/tasks', { token });
    assert.ok(tasks.body.some((t) => t.title.includes('Kick off “Market Validation”')));
  });

  test('calculates unit economics and pushes steps into the Task Manager', async () => {
    const { token } = await newBusiness();
    const { body: project } = await call('POST', '/funnel/projects', { token, body: { name: 'Offer', kind: 'service' } });
    await call('PATCH', `/funnel/projects/${project.id}/steps/cost_to_deliver`, { token, body: { answers: { unit_cost: 200 } } });
    await call('PATCH', `/funnel/projects/${project.id}/steps/pricing_model`, { token, body: { answers: { model: 'one_off', price: 1000 } } });
    const res = await call('PATCH', `/funnel/projects/${project.id}/steps/unit_economics`, { token, body: { answers: { fixed_costs: 800, income_goal: 3200 } } });
    const e = res.body.project.economics;
    assert.equal(e.profitPerSale, 800);
    assert.equal(e.margin, 80);
    assert.equal(e.breakEvenSales, 1);
    assert.equal(e.salesForGoal, 5);

    const sent = await call('POST', `/funnel/projects/${project.id}/steps/customer_conversations/tasks`, { token });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.length, 2);
    assert.equal(sent.body[0].source, 'funnel');
    assert.ok(sent.body[0].checklist.length > 0);
  });
});

describe('Content Studio', () => {
  test('idea engine generates scored, briefed ideas for the business', async () => {
    const { token } = await newBusiness();
    const res = await call('POST', '/content/ideas/generate', { token, body: { count: 6, seed: 'test' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.mode, 'engine');
    assert.equal(res.body.ideas.length, 6);
    for (const idea of res.body.ideas) {
      assert.ok(idea.title && idea.hook && idea.format && idea.platform);
      assert.ok(idea.brief.outline.length >= 3);
      assert.ok(idea.brief.creation_steps.length > 0, `no lesson for ${idea.format}`);
      assert.ok(idea.score >= 1 && idea.score <= 99);
    }
    const scores = res.body.ideas.map((i) => i.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  });

  test('client finalises content, it is scheduled, then auto-published', async () => {
    const { token } = await newBusiness();
    const { body: gen } = await call('POST', '/content/ideas/generate', { token, body: { count: 1, seed: 'x' } });
    const idea = gen.ideas[0];

    const early = await call('POST', `/content/ideas/${idea.id}/schedule`, { token, body: { channel_ids: ['x'], publish_at: new Date().toISOString() } });
    assert.equal(early.status, 400);

    const empty = await call('POST', `/content/ideas/${idea.id}/finalise`, { token, body: { draft: '' } });
    assert.equal(empty.status, 400);

    const fin = await call('POST', `/content/ideas/${idea.id}/finalise`, { token, body: { draft: 'My final caption in my own words.' } });
    assert.equal(fin.body.idea.status, 'finalised');
    assert.ok(fin.body.automations.some((a) => a.automation.includes('ready to schedule')));

    const channels = (await call('GET', '/content/channels', { token })).body;
    const soon = new Date(Date.now() + 60_000).toISOString();
    const sched = await call('POST', `/content/ideas/${idea.id}/schedule`, { token, body: { channel_ids: [channels[0].id], publish_at: soon } });
    assert.equal(sched.status, 201);

    await scheduler.tick(new Date(Date.now() + 5 * 60_000));
    const after = await call('GET', `/content/ideas/${idea.id}`, { token });
    assert.equal(after.body.status, 'published');
    assert.equal(after.body.posts[0].status, 'published');
  });

  test('failing channels retry and then raise a fix task', async () => {
    const { token } = await newBusiness();
    const { body: gen } = await call('POST', '/content/ideas/generate', { token, body: { count: 1, seed: 'y' } });
    const idea = gen.ideas[0];
    await call('POST', `/content/ideas/${idea.id}/finalise`, { token, body: { draft: 'Final version of the caption.' } });
    const channels = (await call('GET', '/content/channels', { token })).body;
    await call('PATCH', `/content/channels/${channels[0].id}`, { token, body: { active: false } });
    await call('POST', `/content/ideas/${idea.id}/schedule`, { token, body: { channel_ids: [channels[0].id], publish_at: new Date().toISOString() } });
    let t = Date.now();
    for (let i = 0; i < 3; i++) { t += 10 * 60_000; await scheduler.tick(new Date(t)); }
    const cal = await call('GET', `/content/calendar?from=2000-01-01&to=2100-01-01`, { token });
    assert.equal(cal.body[0].status, 'failed');
    const tasks = await call('GET', '/tasks', { token });
    assert.ok(tasks.body.some((x) => x.title.startsWith('Fix failed post') && x.priority === 'urgent'));
  });
});

describe('CRM automations', () => {
  test('new lead creates a welcome task, follow-up and timeline entry', async () => {
    const { token } = await newBusiness();
    const res = await call('POST', '/crm/contacts', { token, body: { first_name: 'Ava', last_name: 'Stone', source: 'Instagram' } });
    assert.equal(res.status, 201);
    assert.ok(res.body.contact.next_follow_up_at);
    const detail = await call('GET', `/crm/contacts/${res.body.contact.id}`, { token });
    assert.equal(detail.body.tasks[0].title, 'Call Ava Stone – welcome & qualify');
    assert.ok(detail.body.activities.some((a) => a.type === 'system'));
  });

  test('moving deals through the pipeline drives follow-ups and onboarding', async () => {
    const { token } = await newBusiness();
    const { body: c } = await call('POST', '/crm/contacts', { token, body: { first_name: 'Ben' } });
    const { body: deal } = await call('POST', '/crm/deals', { token, body: { title: 'Ben – PT package', value: 900, contact_id: c.contact.id } });

    const proposal = await call('PATCH', `/crm/deals/${deal.id}`, { token, body: { stage: 'proposal' } });
    assert.ok(proposal.body.automations.some((a) => a.automation.startsWith('Proposal sent')));

    const won = await call('PATCH', `/crm/deals/${deal.id}`, { token, body: { stage: 'won' } });
    assert.ok(won.body.deal.closed_at);
    const contact = await call('GET', `/crm/contacts/${c.contact.id}`, { token });
    assert.equal(contact.body.lifecycle, 'customer');
    assert.ok(contact.body.tags.includes('customer'));
    const tasks = await call('GET', '/tasks', { token });
    const onboarding = tasks.body.find((t) => t.title.startsWith('Onboard Ben'));
    assert.equal(onboarding.checklist.length, 5);
    const notes = await call('GET', '/notifications', { token });
    assert.ok(notes.body.some((n) => n.title.includes('Deal won')));
  });

  test('due follow-ups become tasks via the scheduler', async () => {
    const { token } = await newBusiness();
    await call('POST', '/crm/contacts', { token, body: { first_name: 'Cara', lifecycle: 'prospect', next_follow_up_at: new Date(Date.now() - 1000).toISOString() } });
    await scheduler.tick(new Date());
    const tasks = await call('GET', '/tasks', { token });
    assert.ok(tasks.body.some((t) => t.title === 'Follow up with Cara'));
  });
});

describe('Task Manager', () => {
  test('completing a recurring task schedules the next one', async () => {
    const { token } = await newBusiness();
    const due = new Date('2030-01-06T17:00:00Z').toISOString();
    const { body: task } = await call('POST', '/tasks', { token, body: { title: 'Weekly review', recurrence: 'weekly', due_at: due, checklist: ['Check pipeline'] } });
    await call('PATCH', `/tasks/${task.id}`, { token, body: { status: 'done', checklist: [{ text: 'Check pipeline', done: true }] } });
    const open = (await call('GET', '/tasks?status=todo', { token })).body.filter((t) => t.title === 'Weekly review');
    assert.equal(open.length, 1);
    assert.equal(open[0].due_at.slice(0, 10), '2030-01-13');
    assert.equal(open[0].checklist[0].done, false);
  });

  test('overdue tasks remind the assignee exactly once', async () => {
    const { token } = await newBusiness();
    await call('POST', '/tasks', { token, body: { title: 'Send invoice', due_at: new Date(Date.now() - 3600_000).toISOString() } });
    await scheduler.tick(new Date());
    await scheduler.tick(new Date());
    const notes = (await call('GET', '/notifications', { token })).body.filter((n) => n.title === 'Overdue: Send invoice');
    assert.equal(notes.length, 1);
  });

  test('validates input', async () => {
    const { token } = await newBusiness();
    const res = await call('POST', '/tasks', { token, body: { title: '', priority: 'whenever' } });
    assert.equal(res.status, 400);
  });
});

describe('custom automations', () => {
  test('conditions decide whether a rule runs', async () => {
    const { token } = await newBusiness();
    const rule = await call('POST', '/automations', { token, body: {
      name: 'Big deal alert', trigger: 'deal.stage_changed',
      conditions: [{ field: 'deal.value', op: 'gte', value: 5000 }],
      actions: [{ type: 'create_task', title: 'Prep exec review for {{deal.title}}', due_in_days: 1 }],
    } });
    assert.equal(rule.status, 201);
    const small = (await call('POST', '/crm/deals', { token, body: { title: 'Small', value: 100 } })).body;
    const big = (await call('POST', '/crm/deals', { token, body: { title: 'Big', value: 9000 } })).body;
    await call('PATCH', `/crm/deals/${small.id}`, { token, body: { stage: 'qualified' } });
    await call('PATCH', `/crm/deals/${big.id}`, { token, body: { stage: 'qualified' } });
    const titles = (await call('GET', '/tasks', { token })).body.map((t) => t.title);
    assert.ok(titles.includes('Prep exec review for Big'));
    assert.ok(!titles.includes('Prep exec review for Small'));
    const impact = await call('GET', '/automations/impact', { token });
    assert.ok(impact.body.total_minutes > 0);
  });

  test('rejects unknown triggers and actions', async () => {
    const { token } = await newBusiness();
    const res = await call('POST', '/automations', { token, body: { name: 'x', trigger: 'nope', actions: [{ type: 'create_task' }] } });
    assert.equal(res.status, 400);
  });
});

describe('dashboard', () => {
  test('summarises the whole business', async () => {
    const { token } = await newBusiness();
    await call('POST', '/crm/contacts', { token, body: { first_name: 'Dan' } });
    const res = await call('GET', '/dashboard', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.kpis.new_leads_week, 1);
    assert.ok(res.body.my_tasks.length >= 1);
    assert.ok(res.body.kpis.minutes_saved_week > 0);
  });
});

test('demo seed produces a complete, consistent business', async () => {
  const { seedDemo } = await import('../server/db/seed.js');
  const db = openDatabase(':memory:');
  const { org } = seedDemo(db);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM funnel_projects WHERE org_id = ?', org.id).n, 2);
  assert.ok(db.get('SELECT COUNT(*) AS n FROM content_ideas WHERE org_id = ?', org.id).n >= 15);
  assert.ok(db.get(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE org_id = ? AND status = 'queued'`, org.id).n >= 3);
  assert.ok(db.get('SELECT COUNT(*) AS n FROM deals WHERE org_id = ?', org.id).n >= 8);
  assert.ok(db.get('SELECT COUNT(*) AS n FROM tasks WHERE org_id = ?', org.id).n >= 10);
});

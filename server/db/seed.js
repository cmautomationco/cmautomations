import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { createEngine } from '../automation/engine.js';
import { hashPassword } from '../lib/auth.js';
import { addDays, addHours, id, now } from '../lib/util.js';
import { provisionOrganization } from '../modules/core/routes.js';
import { buildBrief, generateIdeas } from '../modules/content/ideaEngine.js';
import { stepsFor } from '../modules/funnel/blueprint.js';
import { createTask } from '../modules/tasks/service.js';
import { openDatabase, parseJson } from './index.js';

/**
 * Seeds a realistic demo business so every screen has something to show.
 * Runs automatically the first time the server starts with an empty database.
 */
export function seedDemo(db) {
  const engine = createEngine(db);
  const ts = now();
  const user = (name, email) => {
    const u = { id: id('usr'), email, name, password_hash: hashPassword('demo1234'), created_at: ts };
    db.insert('users', u);
    return u;
  };

  const owner = user('Alex Morgan', 'demo@cmautomations.com');
  const priya = user('Priya Shah', 'priya@cmautomations.com');
  const jordan = user('Jordan Lee', 'jordan@cmautomations.com');
  const sam = user('Sam Taylor', 'sam@cmautomations.com');

  const org = provisionOrganization(db, { name: 'Bright Path Coaching', niche: 'coaching', business_type: 'service', ownerId: owner.id });
  db.insert('memberships', { org_id: org.id, user_id: priya.id, role: 'admin' });
  db.insert('memberships', { org_id: org.id, user_id: jordan.id, role: 'member' });
  db.insert('memberships', { org_id: org.id, user_id: sam.id, role: 'member' });
  db.update('brand_profiles', org.id, {
    audience: 'Mid-career professionals (30–45) who feel stuck and want a confident next career move',
    tone: 'Warm, direct and encouraging – like a friend who happens to be an expert',
    offers: ['Confidence Accelerator (12-week 1:1)', 'Career Clarity Intensive', 'Momentum group coaching'],
  }, 'org_id');

  // A second business under the same login shows multi-business switching.
  provisionOrganization(db, { name: 'Glow Studio', niche: 'beauty', business_type: 'service', ownerId: owner.id });

  seedFunnel(db, org, owner);
  seedContent(db, org, owner, [priya, jordan]);
  seedCrm(db, engine, org, [owner, priya, jordan, sam]);
  seedTasks(db, org, [owner, priya, jordan, sam]);
  seedHistory(db, org, [owner, priya, jordan, sam]);
  return { org, owner };
}

function seedFunnel(db, org, owner) {
  const answers = {
    idea_statement: { statement: 'I help mid-career professionals land a role they love in 12 weeks through 1:1 confidence and career coaching.', working_name: 'Confidence Accelerator' },
    ideal_customer: { persona_name: 'Stuck Sarah', description: '34, project manager in a large company. Good at her job but bored, underpaid and scared to make a move.', hangouts: ['LinkedIn', 'Instagram', 'Career podcasts'], current_solution: 'Scrolling job boards at night and reading self-help books.' },
    problem_pain: { pains: ['Feels invisible at work and overlooked for promotion', 'No idea what she actually wants to do next', 'Freezes in interviews and undersells herself'], cost_of_pain: 'Thousands in lost salary each year and constant Sunday-night dread.' },
    transformation: { before: 'Stuck, anxious and applying for jobs she doesn’t want.', after: 'Clear on her direction, confident in interviews and in a role that pays what she’s worth.', timeframe: '12 weeks' },
    unfair_advantage: { advantages: ['10 years as a hiring manager', 'Changed careers myself at 33'], lead_advantage: 'I know exactly what hiring managers look for' },
    competitor_scan: { competitors: ['CareerShifters – £1,800 – career change programme', 'Generic life coaches – £80/hr – mindset', 'LinkedIn Learning – £30/mo – courses'], complaints: 'Too generic, no accountability, nothing on interviews.', gap: 'Hands-on coaching that combines clarity, confidence AND interview prep.' },
    customer_conversations: { conversations: 12, quotes: ['“I know I’m capable, I just can’t show it in interviews.”', '“I don’t even know what job to search for.”'], would_buy: 5 },
    demand_signals: { keywords: ['career change at 35 – 2,400/mo', 'interview confidence – 1,900/mo'], communities: ['r/careerguidance', 'LinkedIn career change groups'], waitlist: 48 },
    validation_verdict: { verdict: 'go', reasoning: '5 of 12 said they would buy, 48 waitlist sign-ups and a clear gap.' },
    core_offer: { deliverables: ['12 weekly 1:1 coaching calls', 'Career clarity workbook', 'CV & LinkedIn rewrite', '2 mock interviews', 'WhatsApp support'], format: 'Zoom calls + shared workspace' },
    value_stack: { bonuses: ['Salary negotiation script – £150', 'Interview answer bank – £97'] },
  };
  const project = { id: id('fnl'), org_id: org.id, name: 'Confidence Accelerator', kind: 'service', idea: answers.idea_statement.statement, status: 'active', current_stage: 'offer', created_by: owner.id, created_at: addDays(now(), -21), updated_at: now() };
  db.insert('funnel_projects', project);
  for (const step of stepsFor('service')) {
    const a = answers[step.key];
    const done = Boolean(a) && step.key !== 'value_stack';
    db.insert('funnel_steps', {
      id: id('fst'), project_id: project.id, stage_key: step.stage_key, step_key: step.key, position: step.position,
      status: done ? 'done' : a ? 'in_progress' : 'todo', answers: a || {}, completed_at: done ? addDays(now(), -20 + step.position * 2) : null, completed_by: done ? owner.id : null,
    });
  }

  const p2 = { id: id('fnl'), org_id: org.id, name: 'Career Clarity Journal', kind: 'product', idea: 'A guided 30-day journal that helps professionals discover their next career move.', status: 'active', current_stage: 'idea', created_by: owner.id, created_at: addDays(now(), -3), updated_at: addDays(now(), -1) };
  db.insert('funnel_projects', p2);
  for (const step of stepsFor('product')) {
    const a = step.key === 'idea_statement' ? { statement: p2.idea, working_name: p2.name } : step.key === 'ideal_customer' ? { persona_name: 'Curious Chris', description: 'Early-career professional who wants direction but isn’t ready for coaching.' } : {};
    const done = step.key === 'idea_statement';
    db.insert('funnel_steps', { id: id('fst'), project_id: p2.id, stage_key: step.stage_key, step_key: step.key, position: step.position, status: done ? 'done' : Object.keys(a).length ? 'in_progress' : 'todo', answers: a, completed_at: done ? addDays(now(), -2) : null, completed_by: done ? owner.id : null });
  }
}

function seedContent(db, org, owner, team) {
  const profile = parseJson(db.get('SELECT * FROM brand_profiles WHERE org_id = ?', org.id), 'pains', 'desires', 'offers', 'platforms');
  const pillars = db.all('SELECT * FROM content_pillars WHERE org_id = ?', org.id);
  const ctx = { org, profile, pillars, existing: [] };
  const ideas = generateIdeas(ctx, { count: 18, seed: 'bright-path-demo' });
  const channels = db.all('SELECT * FROM channels WHERE org_id = ?', org.id);
  const statuses = ['published', 'published', 'scheduled', 'scheduled', 'scheduled', 'scheduled', 'finalised', 'in_creation', 'in_creation', 'briefed', 'briefed', 'shortlisted', 'shortlisted', 'idea', 'idea', 'idea', 'idea', 'idea'];
  ideas.forEach((idea, i) => {
    const status = statuses[i] || 'idea';
    const hasDraft = ['published', 'scheduled', 'finalised', 'in_creation'].includes(status);
    const row = {
      id: id('ida'), org_id: org.id, pillar_id: idea.pillar_id, title: idea.title, hook: idea.hook, angle: idea.angle, framework: idea.framework,
      format: idea.format, platform: idea.platform, funnel_stage: idea.funnel_stage, score: idea.score, status, source: 'engine',
      brief: idea.brief || buildBrief(idea, ctx), draft: hasDraft ? `${idea.hook}\n\nMost people think the answer is working harder. It isn’t.\n\nHere’s what actually moved the needle for my clients this year…\n\n${idea.brief?.cta || ''}` : null,
      media_url: null, assignee_id: [owner, ...team][i % 3].id, created_at: addDays(now(), -14 + (i % 10)), updated_at: now(),
    };
    db.insert('content_ideas', row);
    if (status === 'scheduled' || status === 'published') {
      const channel = channels.find((c) => c.platform === idea.platform) || channels[0];
      const when = new Date(status === 'published' ? addDays(now(), -(i + 1) * 2) : addDays(now(), (i - 1) * 2));
      when.setUTCHours(i % 2 ? 12 : 18, 0, 0, 0);
      db.insert('scheduled_posts', {
        id: id('pst'), org_id: org.id, idea_id: row.id, channel_id: channel.id, caption: row.draft, media_url: null, publish_at: when.toISOString(),
        status: status === 'published' ? 'published' : 'queued', attempts: status === 'published' ? 1 : 0,
        external_id: status === 'published' ? 'sim_demo' : null, published_at: status === 'published' ? when.toISOString() : null, created_at: addDays(now(), -10),
      });
    }
  });
}

function seedCrm(db, engine, org, [owner, priya, jordan, sam]) {
  const people = [
    ['Emma', 'Clarke', 'Deloitte', 'Instagram', 'customer', owner, [['Confidence Accelerator – Emma', 2400, 'won', -6]]],
    ['Liam', 'Walsh', 'NHS', 'Referral', 'prospect', priya, [['Career Clarity Intensive – Liam', 650, 'proposal', 0]]],
    ['Aisha', 'Khan', 'Barclays', 'LinkedIn', 'prospect', owner, [['Confidence Accelerator – Aisha', 2400, 'negotiation', 0]]],
    ['Tom', 'Bennett', 'Freelance', 'Lead magnet', 'lead', jordan, [['Momentum group – Tom', 450, 'qualified', 0]]],
    ['Sophie', 'Turner', 'Unilever', 'Webinar', 'lead', priya, [['Confidence Accelerator – Sophie', 2400, 'new', 0]]],
    ['Daniel', 'Price', 'BT', 'Instagram', 'customer', owner, [['Career Clarity Intensive – Daniel', 650, 'won', 0]]],
    ['Grace', 'Okafor', 'Accenture', 'Podcast', 'lead', jordan, [['Momentum group – Grace', 450, 'new', 0]]],
    ['Ryan', 'Murphy', 'Local council', 'Google', 'prospect', sam, [['Confidence Accelerator – Ryan', 2400, 'proposal', 0]]],
    ['Chloe', 'Evans', 'Self-employed', 'Referral', 'lead', sam, [['Career Clarity Intensive – Chloe', 650, 'qualified', 0]]],
    ['Marcus', 'Hill', 'HSBC', 'LinkedIn', 'churned', priya, [['Momentum group – Marcus', 450, 'lost', -9]]],
    ['Olivia', 'Grant', 'Google', 'Lead magnet', 'lead', owner, []],
    ['Noah', 'Fisher', 'Amazon', 'Instagram', 'lead', jordan, []],
  ];
  people.forEach(([first, last, company, source, lifecycle, ownerUser, deals], i) => {
    const created = addDays(now(), -(12 - i));
    const contact = {
      id: id('con'), org_id: org.id, first_name: first, last_name: last, email: `${first}.${last}@example.com`.toLowerCase(), phone: `07700 900${String(100 + i)}`,
      company, source, lifecycle, owner_id: ownerUser.id, tags: lifecycle === 'customer' ? ['customer'] : [], last_contacted_at: addDays(now(), -(i % 5)),
      next_follow_up_at: i % 4 === 0 ? addDays(now(), 1 + (i % 3)) : null, created_at: created, updated_at: created,
    };
    db.insert('contacts', contact);
    db.insert('activities', { id: id('act'), org_id: org.id, contact_id: contact.id, deal_id: null, type: i % 2 ? 'call' : 'email', body: i % 2 ? 'Discovery call – keen, wants to start next month.' : 'Sent the career clarity guide and booking link.', created_by: ownerUser.id, created_at: addDays(created, 1) });
    for (const [title, value, stage, closedOffset] of deals) {
      db.insert('deals', {
        id: id('del'), org_id: org.id, contact_id: contact.id, title, value, stage, owner_id: ownerUser.id,
        expected_close: addDays(now(), 7 + i).slice(0, 10), closed_at: ['won', 'lost'].includes(stage) ? addDays(now(), closedOffset) : null, created_at: created, updated_at: now(),
      });
    }
  });
  // Fire the new-lead automation for the two newest leads so the audit trail is real.
  for (const c of parseJson(db.all(`SELECT * FROM contacts WHERE org_id = ? AND first_name IN ('Olivia','Noah')`, org.id), 'tags')) {
    engine.emit(org.id, 'contact.created', { contact: c }, { actorId: owner.id });
  }
}

function seedTasks(db, org, [owner, priya, jordan, sam]) {
  const t = (title, assignee, status, priority, dueDays, extra = {}) => createTask({ db }, org.id, {
    title, assignee_id: assignee.id, status, priority, due_at: dueDays == null ? null : addDays(now(), dueDays), ...extra,
  }, { actorId: owner.id });
  t('Record 3 Reels for next week', owner, 'in_progress', 'high', 1, { source: 'content', checklist: [{ text: 'Write scripts', done: true }, { text: 'Film', done: false }, { text: 'Edit & caption', done: false }] });
  t('Send proposal to Liam Walsh', priya, 'review', 'high', 0, { source: 'crm' });
  t('Update client onboarding form', jordan, 'todo', 'medium', 3);
  t('Weekly pipeline review', owner, 'todo', 'medium', 2, { recurrence: 'weekly' });
  t('Invoice Emma Clarke – month 2', sam, 'todo', 'urgent', -1);
  t('Prepare workshop slides', priya, 'in_progress', 'medium', 4);
  t('Reply to podcast guest invite', jordan, 'todo', 'low', 5);
  t('Monthly content performance report', sam, 'todo', 'medium', 6, { recurrence: 'monthly' });
  const done = [
    ['Onboard Daniel Price', owner], ['Publish lead magnet landing page', priya], ['Clean up CRM duplicates', jordan], ['Film testimonial with Emma', sam],
  ];
  done.forEach(([title, who], i) => {
    const task = t(title, who, 'done', 'medium', -i);
    db.update('tasks', task.id, { completed_at: addDays(now(), -i) });
  });
}

function seedHistory(db, org, [owner, priya, jordan, sam]) {
  const runs = [
    ['New lead → welcome call task', 'contact.created', 'Created task · Follow-up set · Logged activity', 7],
    ['Deal won → onboard the new customer', 'deal.won', 'Updated contact · Created task · Notified 4 people', 5],
    ['Proposal sent → chase in 3 days', 'deal.stage_changed', 'Created task · Updated contact', 4],
    ['Task overdue → remind the assignee', 'task.overdue', 'Notified 1 person', 1],
    ['Auto-publisher', 'post.published', 'Published to instagram', 5],
    ['Daily digest', 'schedule.daily', 'Sent everyone their plan for the day', 10],
    ['Follow-up date reached → reminder task', 'contact.follow_up_due', 'Created task', 3],
    ['Idea generator', 'content.generate', 'Generated 8 ideas (engine)', 40],
  ];
  for (let day = 13; day >= 1; day--) {
    const count = 3 + (day % 4);
    for (let i = 0; i < count; i++) {
      const [name, event, detail, minutes] = runs[(day + i) % runs.length];
      db.insert('automation_runs', { id: id('run'), org_id: org.id, automation_id: null, name, event, status: 'success', detail, minutes_saved: minutes, created_at: addHours(addDays(now(), -day), i * 2) });
    }
  }
  // Link the history back to the matching automations so their run counts are realistic.
  db.run(`UPDATE automation_runs SET automation_id = (SELECT a.id FROM automations a WHERE a.org_id = automation_runs.org_id AND a.name = automation_runs.name) WHERE org_id = ? AND automation_id IS NULL`, org.id);
  db.run(`UPDATE automations SET run_count = (SELECT COUNT(*) FROM automation_runs r WHERE r.automation_id = automations.id),
    last_run_at = (SELECT MAX(created_at) FROM automation_runs r WHERE r.automation_id = automations.id) WHERE org_id = ?`, org.id);
  db.insert('kudos', { id: id('kdo'), org_id: org.id, from_user: owner.id, to_user: priya.id, message: 'Brilliant job on the webinar – 14 new leads! 🙌', created_at: addDays(now(), -1) });
  db.insert('kudos', { id: id('kdo'), org_id: org.id, from_user: jordan.id, to_user: sam.id, message: 'Thanks for covering the client calls on Friday.', created_at: addDays(now(), -2) });
  for (const [title, body, link] of [
    ['🎉 Deal won: Career Clarity Intensive – Daniel', 'Alex closed a new deal worth £650.', '#/crm'],
    ['Ready to schedule: new Reel', 'Finalised by Priya. Pick a time slot in the calendar.', '#/content/calendar'],
    ['☀️ Your plan for today', '3 tasks due · 2 follow-ups · 1 post going out today', '#/tasks'],
  ]) {
    db.insert('notifications', { id: id('ntf'), org_id: org.id, user_id: owner.id, title, body, link, read: 0, created_at: now() });
  }
}

// `npm run seed` resets the database file with fresh demo data.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fs = await import('node:fs');
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.databasePath + suffix, { force: true });
  const db = openDatabase(config.databasePath);
  seedDemo(db);
  console.log(`Seeded ${config.databasePath}. Sign in with demo@cmautomations.com / demo1234`);
}

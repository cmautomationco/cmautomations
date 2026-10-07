import { id, now } from '../lib/util.js';

/**
 * Ready-made automations installed for every new business. They cover the
 * mundane admin that normally eats into the day: follow-ups, onboarding,
 * reminders and hand-offs between the funnel, content, CRM and task modules.
 * Clients can switch any of them off or duplicate and edit them.
 */
export const RECIPES = [
  {
    recipe: 'new_lead_follow_up',
    name: 'New lead → welcome call task',
    description: 'When a lead is added, create a call task for the owner due tomorrow and set a follow-up in 3 days.',
    trigger: 'contact.created',
    conditions: [{ field: 'contact.lifecycle', op: 'eq', value: 'lead' }],
    actions: [
      { type: 'create_task', title: 'Call {{contact.first_name}} {{contact.last_name}} – welcome & qualify', description: 'New lead from {{contact.source}}. Introduce yourself, understand their needs and book a discovery call.', priority: 'high', due_in_days: 1, assign_to: 'owner' },
      { type: 'set_follow_up', days: 3 },
      { type: 'log_activity', body: 'Lead captured – welcome call task created automatically.' },
    ],
  },
  {
    recipe: 'follow_up_due',
    name: 'Follow-up date reached → reminder task',
    description: 'When a contact’s follow-up date arrives, create a follow-up task so no lead goes cold.',
    trigger: 'contact.follow_up_due',
    conditions: [],
    actions: [
      { type: 'create_task', title: 'Follow up with {{contact.first_name}} {{contact.last_name}}', description: 'Scheduled follow-up. Check the CRM notes before reaching out.', priority: 'medium', due_in_days: 0, assign_to: 'owner' },
    ],
  },
  {
    recipe: 'proposal_chaser',
    name: 'Proposal sent → chase in 3 days',
    description: 'When a deal moves to Proposal, create a chase-up task for 3 days later.',
    trigger: 'deal.stage_changed',
    conditions: [{ field: 'deal.stage', op: 'eq', value: 'proposal' }],
    actions: [
      { type: 'create_task', title: 'Chase proposal: {{deal.title}}', description: 'Check if {{contact.first_name}} has any questions about the proposal.', priority: 'high', due_in_days: 3, assign_to: 'owner' },
      { type: 'update_contact', lifecycle: 'prospect' },
    ],
  },
  {
    recipe: 'deal_won_onboarding',
    name: 'Deal won → onboard the new customer',
    description: 'Mark the contact as a customer, create an onboarding checklist and tell the team.',
    trigger: 'deal.won',
    conditions: [],
    actions: [
      { type: 'update_contact', lifecycle: 'customer', add_tag: 'customer' },
      { type: 'create_task', title: 'Onboard {{contact.first_name}} ({{deal.title}})', description: 'Welcome the new customer and kick off delivery.', priority: 'high', due_in_days: 1, assign_to: 'owner', checklist: ['Send welcome message', 'Send onboarding form', 'Book kick-off call', 'Create shared folder', 'Add to delivery schedule'] },
      { type: 'notify', to: 'all', title: '🎉 Deal won: {{deal.title}}', body: '{{actor.name}} closed a new deal worth £{{deal.value}}.', link: '#/crm' },
    ],
  },
  {
    recipe: 'deal_lost_feedback',
    name: 'Deal lost → ask for feedback',
    description: 'When a deal is lost, create a task to ask why and set a 90-day check-in.',
    trigger: 'deal.lost',
    conditions: [],
    actions: [
      { type: 'create_task', title: 'Ask {{contact.first_name}} for feedback on lost deal', priority: 'low', due_in_days: 2, assign_to: 'owner' },
      { type: 'set_follow_up', days: 90 },
    ],
  },
  {
    recipe: 'overdue_reminder',
    name: 'Task overdue → remind the assignee',
    description: 'Send a friendly reminder when a task passes its due date.',
    trigger: 'task.overdue',
    conditions: [],
    actions: [
      { type: 'notify', to: 'assignee', title: 'Overdue: {{task.title}}', body: 'This task passed its due date. Update the date or mark it done.', link: '#/tasks' },
    ],
  },
  {
    recipe: 'funnel_stage_complete',
    name: 'Funnel stage complete → celebrate & plan next stage',
    description: 'When a Build Funnel stage is completed, tell the team and create a kick-off task for the next stage.',
    trigger: 'funnel.stage_completed',
    conditions: [],
    actions: [
      { type: 'notify', to: 'all', title: '✅ {{project.name}}: “{{stage.title}}” complete', body: 'Next up: {{next_stage.title}}.', link: '#/funnel/{{project.id}}' },
      { type: 'create_task', title: 'Kick off “{{next_stage.title}}” for {{project.name}}', description: '{{next_stage.goal}}', priority: 'medium', due_in_days: 2, assign_to: 'owner' },
    ],
  },
  {
    recipe: 'content_ready_to_schedule',
    name: 'Content finalised → ready to schedule',
    description: 'When the client finalises a piece of content, notify admins so it gets scheduled.',
    trigger: 'content.finalised',
    conditions: [],
    actions: [
      { type: 'notify', to: 'admins', title: 'Ready to schedule: {{idea.title}}', body: 'Finalised by {{actor.name}}. Pick a time slot in the calendar.', link: '#/content/calendar' },
    ],
  },
  {
    recipe: 'post_failed_fix',
    name: 'Post failed → create a fix task',
    description: 'If a scheduled post fails to publish, create an urgent task with the error.',
    trigger: 'post.failed',
    conditions: [],
    actions: [
      { type: 'create_task', title: 'Fix failed post on {{channel.platform}}', description: 'Error: {{post.last_error}}', priority: 'urgent', due_in_days: 0, assign_to: 'admins' },
    ],
  },
  {
    recipe: 'urgent_issue_alert',
    name: 'Urgent issue → alert the team',
    description: 'When a high or urgent Help Desk issue is raised, alert owners and admins straight away.',
    trigger: 'issue.created',
    conditions: [{ field: 'issue.priority', op: 'in', value: 'high,urgent' }],
    actions: [
      { type: 'notify', to: 'admins', title: '🚨 {{issue.priority}} issue: {{issue.title}}', body: 'Raised by {{actor.name}}. Respond by the target time.', link: '#/helpdesk/{{issue.id}}' },
    ],
  },
  {
    recipe: 'issue_assigned',
    name: 'Issue raised → tell the assignee',
    description: 'Let the person an issue is assigned to know it is theirs.',
    trigger: 'issue.created',
    conditions: [{ field: 'issue.assignee_id', op: 'exists' }],
    actions: [
      { type: 'notify', to: 'assignee', title: 'New issue for you: {{issue.title}}', body: 'Priority: {{issue.priority}}.', link: '#/helpdesk/{{issue.id}}' },
    ],
  },
  {
    recipe: 'issue_overdue_escalate',
    name: 'Issue overdue → escalate',
    description: 'When an issue passes its response target, remind the assignee and alert admins.',
    trigger: 'issue.overdue',
    conditions: [],
    actions: [
      { type: 'notify', to: 'assignee', title: 'Overdue issue: {{issue.title}}', body: 'This issue has passed its response target.', link: '#/helpdesk/{{issue.id}}' },
      { type: 'notify', to: 'admins', title: 'Escalated: {{issue.title}}', body: 'Past its response target and still not resolved.', link: '#/helpdesk/{{issue.id}}' },
    ],
  },
  {
    recipe: 'issue_resolved_update',
    name: 'Issue resolved → update the reporter',
    description: 'Tell whoever raised an issue that it has been sorted, with the resolution.',
    trigger: 'issue.resolved',
    conditions: [],
    actions: [
      { type: 'notify', to: 'reporter', title: '✅ Sorted: {{issue.title}}', body: '{{issue.resolution}}', link: '#/helpdesk/{{issue.id}}' },
    ],
  },
];

/**
 * Installs any recipes a business doesn't have yet (e.g. recipes added in a
 * later release). Remembers what it installed, so a recipe the business
 * deleted on purpose is not brought back.
 */
export function installMissingRecipes(db, orgId) {
  const orgs = orgId ? [{ id: orgId }] : db.all('SELECT id FROM organizations');
  let added = 0;
  for (const org of orgs) {
    const meta = db.get(`SELECT value FROM org_meta WHERE org_id = ? AND key = 'recipes_installed'`, org.id);
    const installed = new Set(meta ? JSON.parse(meta.value) : db.all('SELECT recipe FROM automations WHERE org_id = ? AND recipe IS NOT NULL', org.id).map((r) => r.recipe));
    for (const r of RECIPES) {
      if (installed.has(r.recipe)) continue;
      db.insert('automations', {
        id: id('aut'), org_id: org.id, name: r.name, description: r.description, trigger: r.trigger,
        conditions: r.conditions, actions: r.actions, enabled: 1, recipe: r.recipe, run_count: 0, created_at: now(),
      });
      installed.add(r.recipe);
      added++;
    }
    db.run(`INSERT INTO org_meta (org_id, key, value) VALUES (?, 'recipes_installed', ?) ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value`, org.id, JSON.stringify([...installed]));
  }
  return added;
}

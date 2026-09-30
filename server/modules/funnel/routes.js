import { Router } from 'express';
import { parseJson } from '../../db/index.js';
import { requireAuth } from '../../lib/auth.js';
import { addDays, badRequest, id, notFound, now, pick } from '../../lib/util.js';
import { createTask } from '../tasks/service.js';
import { STAGES, computeEconomics, findStep, missingRequired, salesPageDraft, stepsFor } from './blueprint.js';

function loadProject(db, orgId, projectId) {
  const project = db.get('SELECT * FROM funnel_projects WHERE id = ? AND org_id = ?', projectId, orgId);
  if (!project) throw notFound('Project');
  return project;
}

/** Joins the blueprint with saved progress and works out stage locking. */
export function projectView(db, project) {
  const rows = parseJson(db.all('SELECT * FROM funnel_steps WHERE project_id = ? ORDER BY position', project.id), 'answers');
  const byKey = Object.fromEntries(rows.map((r) => [r.step_key, r]));
  const answers = Object.fromEntries(rows.map((r) => [r.step_key, r.answers]));
  let foundActive = false;
  const stages = STAGES.map((stage) => {
    const steps = stage.steps
      .filter((s) => byKey[s.key])
      .map((s) => {
        const row = byKey[s.key];
        return { ...s, status: row.status, answers: row.answers, notes: row.notes, task_id: row.task_id, completed_at: row.completed_at, missing: missingRequired(s, row.answers) };
      });
    const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
    let status = 'locked';
    if (done === steps.length) status = 'done';
    else if (!foundActive) { status = 'active'; foundActive = true; }
    return { key: stage.key, title: stage.title, goal: stage.goal, status, progress: steps.length ? Math.round((done / steps.length) * 100) : 100, steps };
  });
  const total = rows.length;
  const complete = rows.filter((r) => r.status === 'done' || r.status === 'skipped').length;
  return {
    ...project,
    progress: total ? Math.round((complete / total) * 100) : 0,
    steps_done: complete,
    steps_total: total,
    stages,
    economics: computeEconomics(answers),
    sales_page_draft: salesPageDraft(answers),
  };
}

export function funnelRoutes({ db, engine }) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/blueprint', (req, res) => {
    const kind = req.query.kind === 'product' ? 'product' : 'service';
    const steps = stepsFor(kind);
    res.json(STAGES.map((s) => ({ key: s.key, title: s.title, goal: s.goal, steps: steps.filter((x) => x.stage_key === s.key).map(({ key, title, why, minutes }) => ({ key, title, why, minutes })) })));
  });

  r.get('/projects', (req, res) => {
    const projects = db.all('SELECT * FROM funnel_projects WHERE org_id = ? ORDER BY updated_at DESC', req.org.id);
    res.json(projects.map((p) => {
      const v = projectView(db, p);
      return { ...p, progress: v.progress, steps_done: v.steps_done, steps_total: v.steps_total, stage_title: STAGES.find((s) => s.key === p.current_stage)?.title };
    }));
  });

  r.post('/projects', (req, res) => {
    const body = pick(req.body, { name: { required: true, max: 120 }, kind: { required: true, enum: ['product', 'service'] }, idea: { max: 2000 } });
    const ts = now();
    const project = { id: id('fnl'), org_id: req.org.id, name: body.name, kind: body.kind, idea: body.idea || null, status: 'active', current_stage: STAGES[0].key, created_by: req.user.id, created_at: ts, updated_at: ts };
    db.tx(() => {
      db.insert('funnel_projects', project);
      for (const step of stepsFor(body.kind)) {
        const answers = step.key === 'idea_statement' && body.idea ? { statement: body.idea, working_name: body.name } : {};
        db.insert('funnel_steps', { id: id('fst'), project_id: project.id, stage_key: step.stage_key, step_key: step.key, position: step.position, status: 'todo', answers });
      }
    });
    res.status(201).json(projectView(db, project));
  });

  r.get('/projects/:id', (req, res) => {
    res.json(projectView(db, loadProject(db, req.org.id, req.params.id)));
  });

  r.patch('/projects/:id', (req, res) => {
    loadProject(db, req.org.id, req.params.id);
    const patch = pick(req.body, { name: { max: 120 }, idea: { max: 2000 }, status: { enum: ['active', 'launched', 'paused', 'archived'] } }, { partial: true });
    db.update('funnel_projects', req.params.id, { ...patch, updated_at: now() });
    res.json(projectView(db, loadProject(db, req.org.id, req.params.id)));
  });

  r.delete('/projects/:id', (req, res) => {
    loadProject(db, req.org.id, req.params.id);
    db.run('DELETE FROM funnel_projects WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });

  /**
   * Save a step's worksheet and/or change its status. Completing a step checks
   * required answers and that its stage is unlocked, then fires automations.
   */
  r.patch('/projects/:id/steps/:stepKey', (req, res) => {
    const project = loadProject(db, req.org.id, req.params.id);
    const found = findStep(req.params.stepKey);
    const row = parseJson(db.get('SELECT * FROM funnel_steps WHERE project_id = ? AND step_key = ?', project.id, req.params.stepKey), 'answers');
    if (!found || !row) throw notFound('Step');
    const body = pick(req.body, { answers: { type: 'object' }, notes: { max: 5000 }, status: { enum: ['todo', 'in_progress', 'done', 'skipped'] } }, { partial: true });

    const answers = body.answers ? { ...row.answers, ...body.answers } : row.answers;
    const patch = { answers };
    if (body.notes !== undefined) patch.notes = body.notes;

    const before = projectView(db, project);
    const stageBefore = before.stages.find((s) => s.key === row.stage_key);

    if (body.status) {
      if (['done', 'skipped'].includes(body.status) && stageBefore.status === 'locked') {
        throw badRequest(`Finish “${before.stages.find((s) => s.status === 'active')?.title}” first – stages unlock in order.`);
      }
      if (body.status === 'done') {
        const missing = missingRequired(found.step, answers);
        if (missing.length) throw badRequest('Please fill in the required fields first', missing);
      }
      patch.status = body.status;
      if (['done', 'skipped'].includes(body.status) && !['done', 'skipped'].includes(row.status)) {
        patch.completed_at = now();
        patch.completed_by = req.user.id;
      } else if (!['done', 'skipped'].includes(body.status)) {
        patch.completed_at = null;
      }
    } else if (row.status === 'todo' && body.answers) {
      patch.status = 'in_progress';
    }
    db.update('funnel_steps', row.id, patch);

    const after = projectView(db, project);
    const active = after.stages.find((s) => s.status === 'active');
    const allDone = after.stages.every((s) => s.status === 'done');
    db.update('funnel_projects', project.id, {
      current_stage: active?.key || STAGES[STAGES.length - 1].key,
      status: allDone && project.status === 'active' ? 'launched' : project.status,
      updated_at: now(),
    });

    let automations = [];
    if (patch.status === 'done' && row.status !== 'done') {
      automations = automations.concat(engine.emit(req.org.id, 'funnel.step_completed', { project, step: { key: found.step.key, title: found.step.title }, stage: { key: found.stage.key, title: found.stage.title } }, { actorId: req.user.id }));
    }
    const stageAfter = after.stages.find((s) => s.key === row.stage_key);
    if (stageBefore.status !== 'done' && stageAfter.status === 'done') {
      const idx = STAGES.findIndex((s) => s.key === row.stage_key);
      const next = STAGES[idx + 1];
      automations = automations.concat(engine.emit(req.org.id, 'funnel.stage_completed', {
        project, stage: { key: found.stage.key, title: found.stage.title },
        next_stage: next ? { key: next.key, title: next.title, goal: next.goal } : { title: 'Launch complete 🚀', goal: 'Keep growing.' },
      }, { actorId: req.user.id }));
    }
    res.json({ project: projectView(db, loadProject(db, req.org.id, project.id)), automations });
  });

  /** Push a step's follow-up actions into the Task Manager. */
  r.post('/projects/:id/steps/:stepKey/tasks', (req, res) => {
    const project = loadProject(db, req.org.id, req.params.id);
    const found = findStep(req.params.stepKey);
    const row = db.get('SELECT * FROM funnel_steps WHERE project_id = ? AND step_key = ?', project.id, req.params.stepKey);
    if (!found || !row) throw notFound('Step');
    const templates = found.step.tasks?.length ? found.step.tasks : [{ title: found.step.title, priority: 'medium', days: 3 }];
    const assignee = req.body?.assignee_id || req.user.id;
    const created = db.tx(() => templates.map((t) => createTask({ db }, req.org.id, {
      title: `${project.name}: ${t.title}`,
      description: `${found.step.why}\n\nHow:\n${found.step.how.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\nDone when: ${found.step.doneWhen}`,
      priority: t.priority,
      due_at: addDays(now(), t.days ?? 3),
      assignee_id: assignee,
      checklist: found.step.how.map((text) => ({ text, done: false })),
      source: 'funnel',
      source_ref: `${project.id}:${found.step.key}`,
    }, { actorId: req.user.id })));
    db.update('funnel_steps', row.id, { task_id: created[0].id, status: row.status === 'todo' ? 'in_progress' : row.status });
    res.status(201).json(created);
  });

  return r;
}

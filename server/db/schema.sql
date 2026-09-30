-- CM Automations schema. Every business-owned row carries org_id so one
-- deployment can serve many businesses (multi-tenant).

CREATE TABLE IF NOT EXISTS organizations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  niche         TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'service' CHECK (business_type IN ('product','service','hybrid')),
  timezone      TEXT NOT NULL DEFAULT 'Europe/London',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  org_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Small key/value store per org (scheduler bookkeeping, e.g. last digest date).
CREATE TABLE IF NOT EXISTS org_meta (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key    TEXT NOT NULL,
  value  TEXT,
  PRIMARY KEY (org_id, key)
);

-- ───────────────────────── Build Funnel ─────────────────────────
CREATE TABLE IF NOT EXISTS funnel_projects (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('product','service')),
  idea          TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','launched','paused','archived')),
  current_stage TEXT NOT NULL,
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS funnel_steps (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES funnel_projects(id) ON DELETE CASCADE,
  stage_key    TEXT NOT NULL,
  step_key     TEXT NOT NULL,
  position     INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','skipped')),
  answers      TEXT NOT NULL DEFAULT '{}',
  notes        TEXT,
  task_id      TEXT,
  completed_at TEXT,
  completed_by TEXT REFERENCES users(id),
  UNIQUE (project_id, step_key)
);

-- ───────────────────────── Content Studio ─────────────────────────
CREATE TABLE IF NOT EXISTS brand_profiles (
  org_id     TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  audience   TEXT,
  pains      TEXT NOT NULL DEFAULT '[]',
  desires    TEXT NOT NULL DEFAULT '[]',
  offers     TEXT NOT NULL DEFAULT '[]',
  tone       TEXT,
  platforms  TEXT NOT NULL DEFAULT '[]',
  posts_per_week INTEGER NOT NULL DEFAULT 4,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_pillars (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  weight      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_ideas (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pillar_id    TEXT REFERENCES content_pillars(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  hook         TEXT,
  angle        TEXT,
  framework    TEXT,
  format       TEXT NOT NULL,
  platform     TEXT NOT NULL,
  funnel_stage TEXT NOT NULL DEFAULT 'awareness' CHECK (funnel_stage IN ('awareness','consideration','conversion','retention')),
  score        INTEGER NOT NULL DEFAULT 50,
  status       TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','shortlisted','briefed','in_creation','finalised','scheduled','published','archived')),
  source       TEXT NOT NULL DEFAULT 'engine' CHECK (source IN ('engine','ai','manual')),
  brief        TEXT,
  draft        TEXT,
  media_url    TEXT,
  assignee_id  TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id        TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform  TEXT NOT NULL,
  handle    TEXT NOT NULL,
  adapter   TEXT NOT NULL DEFAULT 'simulated' CHECK (adapter IN ('simulated','webhook')),
  config    TEXT NOT NULL DEFAULT '{}',
  active    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  idea_id      TEXT REFERENCES content_ideas(id) ON DELETE SET NULL,
  channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  caption      TEXT NOT NULL,
  media_url    TEXT,
  publish_at   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','publishing','published','failed','cancelled')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  external_id  TEXT,
  published_at TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_due ON scheduled_posts(status, publish_at);

-- ───────────────────────── CRM ─────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name        TEXT NOT NULL,
  last_name         TEXT,
  email             TEXT,
  phone             TEXT,
  company           TEXT,
  source            TEXT,
  lifecycle         TEXT NOT NULL DEFAULT 'lead' CHECK (lifecycle IN ('lead','prospect','customer','churned')),
  owner_id          TEXT REFERENCES users(id),
  tags              TEXT NOT NULL DEFAULT '[]',
  last_contacted_at TEXT,
  next_follow_up_at TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id     TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  value          REAL NOT NULL DEFAULT 0,
  stage          TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','qualified','proposal','negotiation','won','lost')),
  owner_id       TEXT REFERENCES users(id),
  expected_close TEXT,
  closed_at      TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id    TEXT REFERENCES deals(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('note','call','email','meeting','system')),
  body       TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- ───────────────────────── Tasks ─────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','review','done')),
  priority         TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assignee_id      TEXT REFERENCES users(id),
  due_at           TEXT,
  source           TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','automation','funnel','crm','content')),
  source_ref       TEXT,
  recurrence       TEXT CHECK (recurrence IN ('daily','weekly','monthly')),
  checklist        TEXT NOT NULL DEFAULT '[]',
  overdue_notified INTEGER NOT NULL DEFAULT 0,
  completed_at     TEXT,
  created_by       TEXT REFERENCES users(id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_org_status ON tasks(org_id, status);

-- ───────────────────────── Automation ─────────────────────────
CREATE TABLE IF NOT EXISTS automations (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  trigger     TEXT NOT NULL,
  conditions  TEXT NOT NULL DEFAULT '[]',
  actions     TEXT NOT NULL DEFAULT '[]',
  enabled     INTEGER NOT NULL DEFAULT 1,
  recipe      TEXT,
  run_count   INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id  TEXT REFERENCES automations(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  event          TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('success','skipped','error')),
  detail         TEXT,
  minutes_saved  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_org ON automation_runs(org_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Team kudos: a quick way to recognise good work and keep morale high.
CREATE TABLE IF NOT EXISTS kudos (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_user  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

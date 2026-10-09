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

-- ───────────────────────── Help Desk ─────────────────────────
-- Problems raised by the team, by clients, or by the assistant when it
-- can't solve something itself. Each priority has a response-time target (SLA).
CREATE TABLE IF NOT EXISTS issues (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  category         TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('technical','customer','billing','operations','content','other')),
  priority         TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','resolved')),
  source           TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','assistant','customer')),
  contact_id       TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  assignee_id      TEXT REFERENCES users(id),
  due_at           TEXT,
  overdue_notified INTEGER NOT NULL DEFAULT 0,
  resolution       TEXT,
  resolved_at      TEXT,
  created_by       TEXT REFERENCES users(id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_issues_org_status ON issues(org_id, status);

CREATE TABLE IF NOT EXISTS issue_comments (
  id         TEXT PRIMARY KEY,
  issue_id   TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- ───────────────────────── Assistant ─────────────────────────
-- Every question asked, so the business can see what people get stuck on.
CREATE TABLE IF NOT EXISTS assistant_logs (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  message    TEXT NOT NULL,
  intent     TEXT,
  engine     TEXT NOT NULL,
  resolved   INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- ───────────────────────── Messages (email, SMS, WhatsApp) ─────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id    TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  direction     TEXT NOT NULL CHECK (direction IN ('out','in')),
  to_addr       TEXT,
  from_addr     TEXT,
  subject       TEXT,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued','sent','delivered','failed','demo','blocked','received')),
  provider      TEXT,
  provider_id   TEXT,
  error         TEXT,
  template_key  TEXT,
  related_type  TEXT,
  related_id    TEXT,
  send_after    TEXT,
  read          INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL,
  sent_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_org ON messages(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id, created_at);

CREATE TABLE IF NOT EXISTS message_templates (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  subject    TEXT,
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, key)
);

-- Calls to the business number (forwarded to a mobile; missed ones get a text back).
CREATE TABLE IF NOT EXISTS calls (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id       TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  from_number      TEXT NOT NULL,
  to_number        TEXT,
  status           TEXT NOT NULL CHECK (status IN ('missed','answered','voicemail')),
  duration_seconds INTEGER,
  recording_url    TEXT,
  provider_id      TEXT,
  texted_back      INTEGER NOT NULL DEFAULT 0,
  handled          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

-- ───────────────────────── Lead capture forms ─────────────────────────
CREATE TABLE IF NOT EXISTS forms (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  title          TEXT NOT NULL,
  intro          TEXT,
  fields         TEXT NOT NULL DEFAULT '[]',
  button_label   TEXT NOT NULL DEFAULT 'Send',
  thank_you      TEXT NOT NULL,
  send_thank_you INTEGER NOT NULL DEFAULT 1,
  tags           TEXT NOT NULL DEFAULT '[]',
  active         INTEGER NOT NULL DEFAULT 1,
  submissions    INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id         TEXT PRIMARY KEY,
  form_id    TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- ───────────────────────── Bookings ─────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  kind          TEXT NOT NULL DEFAULT 'appointment' CHECK (kind IN ('appointment','callout','quote_visit','job')),
  duration_min  INTEGER NOT NULL DEFAULT 60,
  buffer_min    INTEGER NOT NULL DEFAULT 0,
  price_pence   INTEGER NOT NULL DEFAULT 0,
  deposit_pence INTEGER NOT NULL DEFAULT 0,
  online        INTEGER NOT NULL DEFAULT 1,
  active        INTEGER NOT NULL DEFAULT 1,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id                    TEXT PRIMARY KEY,
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_id            TEXT REFERENCES services(id) ON DELETE SET NULL,
  contact_id            TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  staff_id              TEXT REFERENCES users(id) ON DELETE SET NULL,
  starts_at             TEXT NOT NULL,
  ends_at               TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('requested','confirmed','on_the_way','completed','cancelled','no_show')),
  urgency               TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal','emergency')),
  source                TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('online','phone','whatsapp','manual')),
  address               TEXT,
  postcode              TEXT,
  notes                 TEXT,
  customer_confirmed_at TEXT,
  reschedule_requested  INTEGER NOT NULL DEFAULT 0,
  reminder_24h_at       TEXT,
  reminder_2h_at        TEXT,
  on_the_way_at         TEXT,
  completed_at          TEXT,
  cancelled_at          TEXT,
  cancel_reason         TEXT,
  deposit_pence         INTEGER NOT NULL DEFAULT 0,
  price_pence           INTEGER NOT NULL DEFAULT 0,
  invoice_id            TEXT,
  check_notified        INTEGER NOT NULL DEFAULT 0,
  public_token          TEXT NOT NULL,
  created_by            TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_org_time ON bookings(org_id, starts_at);

CREATE TABLE IF NOT EXISTS time_off (
  id        TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_id  TEXT REFERENCES users(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at   TEXT NOT NULL,
  reason    TEXT
);

-- ───────────────────────── Quotes, invoices & payments ─────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                   TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind                 TEXT NOT NULL CHECK (kind IN ('quote','invoice')),
  purpose              TEXT NOT NULL DEFAULT 'standard' CHECK (purpose IN ('standard','deposit')),
  number               TEXT NOT NULL,
  contact_id           TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id              TEXT REFERENCES deals(id) ON DELETE SET NULL,
  booking_id           TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  status               TEXT NOT NULL CHECK (status IN ('draft','sent','accepted','declined','converted','part_paid','paid','overdue','void')),
  title                TEXT,
  issue_date           TEXT NOT NULL,
  due_date             TEXT,
  line_items           TEXT NOT NULL DEFAULT '[]',
  subtotal_pence       INTEGER NOT NULL DEFAULT 0,
  vat_pence            INTEGER NOT NULL DEFAULT 0,
  total_pence          INTEGER NOT NULL DEFAULT 0,
  paid_pence           INTEGER NOT NULL DEFAULT 0,
  notes                TEXT,
  public_token         TEXT NOT NULL,
  checkout_session     TEXT,
  sent_at              TEXT,
  accepted_at          TEXT,
  accepted_by          TEXT,
  declined_at          TEXT,
  decline_reason       TEXT,
  paid_at              TEXT,
  from_quote_id        TEXT,
  converted_invoice_id TEXT,
  chase                INTEGER NOT NULL DEFAULT 1,
  reminders_sent       INTEGER NOT NULL DEFAULT 0,
  last_reminder_at     TEXT,
  followed_up          INTEGER NOT NULL DEFAULT 0,
  created_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id, kind, status);

CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id   TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_pence INTEGER NOT NULL,
  method       TEXT NOT NULL CHECK (method IN ('card','bank_transfer','cash','other')),
  reference    TEXT,
  provider_id  TEXT,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);

-- ───────────────────────── Agency: audits, proposals & monthly reports ─────────────────────────
CREATE TABLE IF NOT EXISTS audits (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_name       TEXT NOT NULL,
  contact_name      TEXT,
  contact_email     TEXT,
  contact_phone     TEXT,
  niche             TEXT NOT NULL DEFAULT 'coaching',
  team_size         INTEGER NOT NULL DEFAULT 1,
  hourly_cost_pence INTEGER NOT NULL DEFAULT 2500,
  setup_fee_pence   INTEGER NOT NULL DEFAULT 0,
  monthly_fee_pence INTEGER NOT NULL DEFAULT 0,
  discovery         TEXT NOT NULL DEFAULT '{}',
  tasks             TEXT NOT NULL DEFAULT '[]',
  analysis          TEXT NOT NULL DEFAULT '{}',
  proposal          TEXT NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','proposal_sent','accepted','declined')),
  public_token      TEXT NOT NULL,
  client_org_id     TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  sent_at           TEXT,
  accepted_at       TEXT,
  accepted_by       TEXT,
  declined_at       TEXT,
  decline_reason    TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agency_id    TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  period       TEXT NOT NULL,
  data         TEXT NOT NULL,
  summary      TEXT,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  public_token TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  sent_at      TEXT,
  UNIQUE (org_id, period)
);

-- WhatsApp / text booking assistant: where each customer is in a booking conversation.
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL,
  flow       TEXT NOT NULL CHECK (flow IN ('book','reschedule','cancel')),
  step       TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',
  misses     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, contact_id)
);

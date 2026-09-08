-- ElevenLabs Activation Tracker — local SQLite schema.
-- Telemetry events are append-only and immutable; everything else in the
-- product (funnel stage, TTFV, risk status) is derived from them at read time.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'synthetic',
  tier          TEXT NOT NULL,
  region        TEXT NOT NULL,
  use_case      TEXT NOT NULL,
  owner         TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  cohort_week   TEXT NOT NULL,
  credit_quota  INTEGER NOT NULL,
  seats         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_cohort ON workspaces(cohort_week);
CREATE INDEX IF NOT EXISTS idx_workspaces_source ON workspaces(source);

CREATE TABLE IF NOT EXISTS agents (
  id                     TEXT PRIMARY KEY,
  workspace_id           TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  voice_id               TEXT NOT NULL,
  voice_name             TEXT NOT NULL,
  llm_model              TEXT NOT NULL,
  latency_preset         TEXT NOT NULL,
  deployment_surface     TEXT NOT NULL,
  created_at             TEXT NOT NULL,
  live_conversations     INTEGER NOT NULL DEFAULT 0,
  distinct_active_days   INTEGER NOT NULL DEFAULT 0,
  credit_consumption_pct REAL NOT NULL DEFAULT 0,
  median_latency_ms      INTEGER,
  is_draft               INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);

-- Immutable telemetry log. Never updated, never deleted outside a full reset.
CREATE TABLE IF NOT EXISTS telemetry_events (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id     TEXT,
  milestone    TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  status       TEXT NOT NULL,
  metadata     TEXT NOT NULL DEFAULT '{}',
  timestamp    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_workspace ON telemetry_events(workspace_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_agent ON telemetry_events(agent_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON telemetry_events(timestamp);

-- Rule catalogue, seeded from the engine definitions so the detector config is
-- inspectable and auditable from the database itself.
CREATE TABLE IF NOT EXISTS stalled_rules (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  definition      TEXT NOT NULL,
  severity        TEXT NOT NULL,
  status          TEXT NOT NULL,
  intervention_id TEXT NOT NULL
);

-- Audit log of dispatched remediation playbooks.
CREATE TABLE IF NOT EXISTS interventions (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  workspace_name  TEXT NOT NULL,
  intervention_id TEXT NOT NULL,
  channel         TEXT NOT NULL,
  status          TEXT NOT NULL,
  target          TEXT NOT NULL,
  note            TEXT NOT NULL,
  actor           TEXT NOT NULL,
  dispatched_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interventions_dispatched ON interventions(dispatched_at);
CREATE INDEX IF NOT EXISTS idx_interventions_workspace ON interventions(workspace_id);

// Server-only module: typed data-access layer over the SQLite tables.
import { randomUUID } from 'node:crypto';
import { getDb } from './client';
import { STALLED_RULES } from '../engine/rules';
import type {
  Agent,
  DeploymentSurface,
  EventMetadata,
  EventStatus,
  EventType,
  InterventionRecord,
  LatencyPreset,
  LlmModel,
  Milestone,
  Region,
  StalledRule,
  TelemetryEvent,
  TelemetryEventInput,
  Tier,
  Workspace,
} from '../types';

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                  */
/* -------------------------------------------------------------------------- */

interface WorkspaceRow {
  id: string;
  name: string;
  tier: string;
  region: string;
  use_case: string;
  owner: string;
  created_at: string;
  cohort_week: string;
  credit_quota: number;
  seats: number;
}

interface AgentRow {
  id: string;
  workspace_id: string;
  name: string;
  voice_id: string;
  voice_name: string;
  llm_model: string;
  latency_preset: string;
  deployment_surface: string;
  created_at: string;
  live_conversations: number;
  distinct_active_days: number;
  credit_consumption_pct: number;
  median_latency_ms: number | null;
  is_draft: number;
}

interface EventRow {
  id: string;
  workspace_id: string;
  agent_id: string | null;
  milestone: string;
  event_type: string;
  status: string;
  metadata: string;
  timestamp: string;
}

interface InterventionRow {
  id: string;
  workspace_id: string;
  workspace_name: string;
  intervention_id: string;
  channel: string;
  status: string;
  target: string;
  note: string;
  actor: string;
  dispatched_at: string;
}

/* -------------------------------------------------------------------------- */
/* Mappers                                                                     */
/* -------------------------------------------------------------------------- */

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier as Tier,
    region: row.region as Region,
    useCase: row.use_case,
    owner: row.owner,
    createdAt: row.created_at,
    cohortWeek: row.cohort_week,
    creditQuota: row.credit_quota,
    seats: row.seats,
  };
}

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    voiceId: row.voice_id,
    voiceName: row.voice_name,
    llmModel: row.llm_model as LlmModel,
    latencyPreset: row.latency_preset as LatencyPreset,
    deploymentSurface: row.deployment_surface as DeploymentSurface,
    createdAt: row.created_at,
    liveConversations: row.live_conversations,
    distinctActiveDays: row.distinct_active_days,
    creditConsumptionPct: row.credit_consumption_pct,
    medianLatencyMs: row.median_latency_ms,
    isDraft: row.is_draft === 1,
  };
}

function toEvent(row: EventRow): TelemetryEvent {
  let metadata: EventMetadata = {};
  try {
    metadata = JSON.parse(row.metadata) as EventMetadata;
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    milestone: row.milestone as Milestone,
    eventType: row.event_type as EventType,
    status: row.status as EventStatus,
    metadata,
    timestamp: row.timestamp,
  };
}

function toIntervention(row: InterventionRow): InterventionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    interventionId: row.intervention_id as InterventionRecord['interventionId'],
    channel: row.channel as InterventionRecord['channel'],
    status: row.status as InterventionRecord['status'],
    target: row.target,
    note: row.note,
    actor: row.actor,
    dispatchedAt: row.dispatched_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export function insertWorkspaces(workspaces: Workspace[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO workspaces
      (id, name, tier, region, use_case, owner, created_at, cohort_week, credit_quota, seats)
    VALUES (@id, @name, @tier, @region, @useCase, @owner, @createdAt, @cohortWeek, @creditQuota, @seats)
  `);
  db.transaction((rows: Workspace[]) => {
    for (const row of rows) stmt.run(row);
  })(workspaces);
}

export function insertAgents(agents: Agent[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO agents
      (id, workspace_id, name, voice_id, voice_name, llm_model, latency_preset,
       deployment_surface, created_at, live_conversations, distinct_active_days,
       credit_consumption_pct, median_latency_ms, is_draft)
    VALUES
      (@id, @workspaceId, @name, @voiceId, @voiceName, @llmModel, @latencyPreset,
       @deploymentSurface, @createdAt, @liveConversations, @distinctActiveDays,
       @creditConsumptionPct, @medianLatencyMs, @isDraft)
  `);
  db.transaction((rows: Agent[]) => {
    for (const row of rows) stmt.run({ ...row, isDraft: row.isDraft ? 1 : 0 });
  })(agents);
}

export function insertEvents(events: TelemetryEventInput[]): TelemetryEvent[] {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO telemetry_events
      (id, workspace_id, agent_id, milestone, event_type, status, metadata, timestamp)
    VALUES (@id, @workspaceId, @agentId, @milestone, @eventType, @status, @metadata, @timestamp)
  `);
  const normalised: TelemetryEvent[] = events.map((event) => ({
    id: event.id ?? randomUUID(),
    workspaceId: event.workspaceId,
    agentId: event.agentId ?? null,
    milestone: event.milestone,
    eventType: event.eventType,
    status: event.status ?? 'success',
    metadata: event.metadata ?? {},
    timestamp: event.timestamp ?? new Date().toISOString(),
  }));
  db.transaction((rows: TelemetryEvent[]) => {
    for (const row of rows) {
      stmt.run({ ...row, metadata: JSON.stringify(row.metadata) });
    }
  })(normalised);
  return normalised;
}

export function syncStalledRules(rules: StalledRule[] = STALLED_RULES): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO stalled_rules (id, name, definition, severity, status, intervention_id)
    VALUES (@id, @name, @definition, @severity, @status, @interventionId)
  `);
  db.transaction((rows: StalledRule[]) => {
    for (const row of rows) stmt.run(row);
  })(rules);
}

export function recordIntervention(
  record: Omit<InterventionRecord, 'id' | 'dispatchedAt'> & { id?: string; dispatchedAt?: string },
): InterventionRecord {
  const full: InterventionRecord = {
    ...record,
    id: record.id ?? randomUUID(),
    dispatchedAt: record.dispatchedAt ?? new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO interventions
         (id, workspace_id, workspace_name, intervention_id, channel, status, target, note, actor, dispatched_at)
       VALUES (@id, @workspaceId, @workspaceName, @interventionId, @channel, @status, @target, @note, @actor, @dispatchedAt)`,
    )
    .run(full);
  return full;
}

/** Applies engine-computed counters back onto the agent row. */
export function updateAgentCounters(
  agentId: string,
  counters: Partial<
    Pick<
      Agent,
      | 'liveConversations'
      | 'distinctActiveDays'
      | 'creditConsumptionPct'
      | 'medianLatencyMs'
      | 'deploymentSurface'
      | 'isDraft'
    >
  >,
): void {
  const db = getDb();
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: agentId };
  const columns: Record<string, string> = {
    liveConversations: 'live_conversations',
    distinctActiveDays: 'distinct_active_days',
    creditConsumptionPct: 'credit_consumption_pct',
    medianLatencyMs: 'median_latency_ms',
    deploymentSurface: 'deployment_surface',
    isDraft: 'is_draft',
  };
  for (const [key, value] of Object.entries(counters)) {
    const column = columns[key];
    if (!column || value === undefined) continue;
    sets.push(`${column} = @${key}`);
    params[key] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  }
  if (sets.length === 0) return;
  db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export function listWorkspaces(): Workspace[] {
  return (getDb().prepare('SELECT * FROM workspaces ORDER BY created_at DESC').all() as WorkspaceRow[]).map(
    toWorkspace,
  );
}

export function getWorkspace(id: string): Workspace | null {
  const row = getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as WorkspaceRow | undefined;
  return row ? toWorkspace(row) : null;
}

export function listAgents(): Agent[] {
  return (getDb().prepare('SELECT * FROM agents ORDER BY created_at ASC').all() as AgentRow[]).map(toAgent);
}

export function listEvents(): TelemetryEvent[] {
  return (
    getDb().prepare('SELECT * FROM telemetry_events ORDER BY timestamp ASC').all() as EventRow[]
  ).map(toEvent);
}

export function listRecentEvents(limit = 60): TelemetryEvent[] {
  return (
    getDb()
      .prepare('SELECT * FROM telemetry_events ORDER BY timestamp DESC LIMIT ?')
      .all(limit) as EventRow[]
  ).map(toEvent);
}

export function listInterventions(limit = 100): InterventionRecord[] {
  return (
    getDb()
      .prepare('SELECT * FROM interventions ORDER BY dispatched_at DESC LIMIT ?')
      .all(limit) as InterventionRow[]
  ).map(toIntervention);
}

export function listStalledRules(): StalledRule[] {
  const rows = getDb().prepare('SELECT * FROM stalled_rules').all() as Array<{
    id: string;
    name: string;
    definition: string;
    severity: string;
    status: string;
    intervention_id: string;
  }>;
  return rows.map((row) => ({
    id: row.id as StalledRule['id'],
    name: row.name,
    definition: row.definition,
    severity: row.severity as StalledRule['severity'],
    status: row.status as StalledRule['status'],
    interventionId: row.intervention_id as StalledRule['interventionId'],
  }));
}

export function countWorkspaces(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM workspaces').get() as { n: number };
  return row.n;
}

export function countEvents(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM telemetry_events').get() as { n: number };
  return row.n;
}

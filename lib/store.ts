// Server-only module: loads the telemetry log and derives dashboard state.
import { cache } from 'react';
import {
  countWorkspaces,
  insertAgents,
  insertEvents,
  insertWorkspaces,
  listAgents,
  listEvents,
  listInterventions,
  listRecentEvents,
  listWorkspaces,
  syncStalledRules,
} from './db/repository';
import { isSeedMarked, markSeeded } from './db/client';
import { evaluateWorkspace } from './engine/health';
import { buildInterventionQueue, buildSuppressionSet } from './engine/interventions';
import { buildCohorts, buildExecutiveMetrics, buildFunnel } from './engine/metrics';
import { generateSeedDataset, type GeneratedDataset } from './sim/generator';
import { SOURCE_SCOPES } from './types';
import type {
  CohortRow,
  ExecutiveMetrics,
  FunnelStage,
  InterventionCandidate,
  InterventionRecord,
  SourceScope,
  TelemetryEvent,
  WorkspaceHealth,
  WorkspaceSource,
} from './types';

/**
 * Seeds the database on first access so `npm run dev` produces a populated
 * control center with no external dependencies and no manual setup step.
 */
export function ensureSeeded(): void {
  if (isSeedMarked()) return;
  syncStalledRules();
  if (countWorkspaces() === 0) {
    persistDataset(generateSeedDataset());
  }
  markSeeded();
}

export function persistDataset(dataset: GeneratedDataset): void {
  insertWorkspaces(dataset.workspaces);
  insertAgents(dataset.agents);
  insertEvents(dataset.events);
}

/** Derived health for every workspace, computed from the immutable event log. */
export const getWorkspaceHealths = cache((): WorkspaceHealth[] => {
  ensureSeeded();
  const now = new Date();
  const workspaces = listWorkspaces();
  const agents = listAgents();
  const events = listEvents();

  const agentsByWorkspace = new Map<string, typeof agents>();
  for (const agent of agents) {
    const bucket = agentsByWorkspace.get(agent.workspaceId) ?? [];
    bucket.push(agent);
    agentsByWorkspace.set(agent.workspaceId, bucket);
  }

  const eventsByWorkspace = new Map<string, TelemetryEvent[]>();
  for (const event of events) {
    const bucket = eventsByWorkspace.get(event.workspaceId) ?? [];
    bucket.push(event);
    eventsByWorkspace.set(event.workspaceId, bucket);
  }

  return workspaces.map((workspace) =>
    evaluateWorkspace(
      workspace,
      agentsByWorkspace.get(workspace.id) ?? [],
      eventsByWorkspace.get(workspace.id) ?? [],
      now,
    ),
  );
});

/** Narrows an unknown query value to a valid scope, defaulting to 'all'. */
export function parseScope(value: unknown): SourceScope {
  return SOURCE_SCOPES.includes(value as SourceScope) ? (value as SourceScope) : 'all';
}

export function filterBySource(
  healths: WorkspaceHealth[],
  scope: SourceScope,
): WorkspaceHealth[] {
  if (scope === 'all') return healths;
  return healths.filter((health) => health.workspace.source === scope);
}

/** How many workspaces each scope would show, for the selector's counts. */
export function sourceCounts(healths: WorkspaceHealth[]): Record<SourceScope, number> {
  const counts = { all: healths.length, synthetic: 0, elevenlabs: 0 };
  for (const health of healths) {
    const source: WorkspaceSource = health.workspace.source ?? 'synthetic';
    counts[source] += 1;
  }
  return counts;
}

export interface DashboardState {
  healths: WorkspaceHealth[];
  metrics: ExecutiveMetrics;
  funnel: FunnelStage[];
  cohorts: CohortRow[];
  scope: SourceScope;
  counts: Record<SourceScope, number>;
}

/**
 * Metrics are computed over the scoped subset only. Blending fabricated and
 * real accounts into one median would make every headline number unreadable.
 */
export const getDashboardState = cache((scope: SourceScope = 'all'): DashboardState => {
  const all = getWorkspaceHealths();
  const healths = filterBySource(all, scope);
  return {
    healths,
    metrics: buildExecutiveMetrics(healths),
    funnel: buildFunnel(healths),
    cohorts: buildCohorts(healths),
    scope,
    counts: sourceCounts(all),
  };
});

export interface InterventionState {
  candidates: InterventionCandidate[];
  auditLog: InterventionRecord[];
  suppressed: Set<string>;
  totalTargets: number;
}

export const getInterventionState = cache((scope: SourceScope = 'all'): InterventionState => {
  const healths = filterBySource(getWorkspaceHealths(), scope);
  const auditLog = listInterventions();
  const candidates = buildInterventionQueue(healths);
  const targets = new Set(candidates.flatMap((c) => c.workspaces.map((w) => w.workspace.id)));
  return {
    candidates,
    auditLog,
    suppressed: buildSuppressionSet(auditLog),
    totalTargets: targets.size,
  };
});

export const getRecentEvents = cache(
  (limit = 40, scope: SourceScope = 'all'): TelemetryEvent[] => {
    ensureSeeded();
    return listRecentEvents(limit, scope === 'all' ? undefined : scope);
  },
);

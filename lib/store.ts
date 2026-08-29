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
import type {
  CohortRow,
  ExecutiveMetrics,
  FunnelStage,
  InterventionCandidate,
  InterventionRecord,
  TelemetryEvent,
  WorkspaceHealth,
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

export interface DashboardState {
  healths: WorkspaceHealth[];
  metrics: ExecutiveMetrics;
  funnel: FunnelStage[];
  cohorts: CohortRow[];
}

export const getDashboardState = cache((): DashboardState => {
  const healths = getWorkspaceHealths();
  return {
    healths,
    metrics: buildExecutiveMetrics(healths),
    funnel: buildFunnel(healths),
    cohorts: buildCohorts(healths),
  };
});

export interface InterventionState {
  candidates: InterventionCandidate[];
  auditLog: InterventionRecord[];
  suppressed: Set<string>;
  totalTargets: number;
}

export const getInterventionState = cache((): InterventionState => {
  const healths = getWorkspaceHealths();
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

export const getRecentEvents = cache((limit = 40): TelemetryEvent[] => {
  ensureSeeded();
  return listRecentEvents(limit);
});

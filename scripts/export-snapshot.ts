/**
 * Exports a full engine snapshot as JSON: `npm run export:snapshot [out.json]`.
 *
 * Generates the deterministic baseline dataset, scores it with the same
 * milestone and rule engine the app runs, and writes the derived metrics,
 * funnel, cohorts, workspace health, intervention queue and recent events to a
 * single file. Used to build the static dashboard preview, and handy for
 * inspecting engine output without booting the server.
 */
import { generateSeedDataset } from '../lib/sim/generator';
import { evaluateWorkspace } from '../lib/engine/health';
import { buildCohorts, buildExecutiveMetrics, buildFunnel, buildTtfvTrend } from '../lib/engine/metrics';
import { buildInterventionQueue } from '../lib/engine/interventions';
import { STALLED_RULES, RULE_THRESHOLDS } from '../lib/engine/rules';
import { MILESTONE_DESCRIPTION, MILESTONES, MILESTONE_LABEL, MILESTONE_SHORT, DEPLOYMENT_LABEL } from '../lib/types';
import type { SourceScope, WorkspaceHealth } from '../lib/types';
import { writeFileSync } from 'node:fs';

const now = new Date();
const ds = generateSeedDataset(20260829, now);

const agentsBy = new Map<string, typeof ds.agents>();
for (const a of ds.agents) {
  const b = agentsBy.get(a.workspaceId) ?? []; b.push(a); agentsBy.set(a.workspaceId, b);
}
const eventsBy = new Map<string, typeof ds.events>();
for (const e of ds.events) {
  const b = eventsBy.get(e.workspaceId) ?? []; b.push(e); eventsBy.set(e.workspaceId, b);
}

const healths: WorkspaceHealth[] = ds.workspaces.map((w) =>
  evaluateWorkspace(w, agentsBy.get(w.id) ?? [], eventsBy.get(w.id) ?? [], now),
);

// Slim projection: only what the preview renders.
const slimHealths = healths.map((h) => ({
  id: h.workspace.id,
  name: h.workspace.name,
  source: h.workspace.source,
  tier: h.workspace.tier,
  region: h.workspace.region,
  owner: h.workspace.owner,
  useCase: h.workspace.useCase,
  seats: h.workspace.seats,
  createdAt: h.workspace.createdAt,
  milestone: h.milestone,
  status: h.status,
  subStatus: h.subStatus,
  ttfvHours: h.ttfvHours,
  hoursSinceLastEvent: h.hoursSinceLastEvent,
  ageHours: h.ageHours,
  lastEventAt: h.lastEventAt,
  totalLiveConversations: h.totalLiveConversations,
  activeAgentCount: h.activeAgentCount,
  draftAgentCount: h.draftAgentCount,
  signals: h.signals.map((s) => ({
    ruleId: s.ruleId, severity: s.severity, diagnostic: s.diagnostic, agentName: s.agentName,
  })),
  agents: h.agents.map((a) => ({
    id: a.agent.id,
    name: a.agent.name,
    milestone: a.milestone,
    isDraft: a.agent.isDraft,
    surface: DEPLOYMENT_LABEL[a.agent.deploymentSurface],
    voiceName: a.agent.voiceName,
    voiceId: a.agent.voiceId,
    llmModel: a.agent.llmModel,
    latencyPreset: a.agent.latencyPreset,
    medianLatencyMs: a.agent.medianLatencyMs,
    liveConversations: a.agent.liveConversations,
    distinctActiveDays: a.agent.distinctActiveDays,
    creditConsumptionPct: a.agent.creditConsumptionPct,
    hoursSinceLastEvent: a.hoursSinceLastEvent,
    consecutiveTestFailures: a.consecutiveTestFailures,
    lastErrorCode: a.lastErrorCode,
    isStalled: a.isStalled,
  })),
}));

const sourceByWorkspace = new Map(ds.workspaces.map((w) => [w.id, w.source]));
const cohorts = buildCohorts(healths);
const queue = buildInterventionQueue(healths);

const recentEvents = [...ds.events]
  .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  .slice(0, 40)
  .map((e) => ({
    id: e.id, type: e.eventType, status: e.status, milestone: e.milestone,
    ref: e.agentId ?? e.workspaceId, ts: e.timestamp, meta: e.metadata,
    source: sourceByWorkspace.get(e.workspaceId) ?? 'synthetic',
  }));

/**
 * Aggregates are precomputed per scope so the static preview can switch
 * sources without reimplementing the engine in browser JavaScript.
 */
function aggregatesFor(scope: SourceScope) {
  const subset =
    scope === 'all' ? healths : healths.filter((h) => h.workspace.source === scope);
  const scopedCohorts = buildCohorts(subset);
  const scopedQueue = buildInterventionQueue(subset);
  return {
    metrics: buildExecutiveMetrics(subset, now),
    funnel: buildFunnel(subset),
    cohorts: scopedCohorts,
    trend: buildTtfvTrend(scopedCohorts),
    interventions: scopedQueue.map((c) => ({
      playbook: c.playbook,
      targets: c.workspaces.map((w) => ({
        id: w.workspace.id, name: w.workspace.name, tier: w.workspace.tier,
        milestone: w.milestone, reason: c.reasons[w.workspace.id],
      })),
    })),
    totals: {
      workspaces: subset.length,
      agents: subset.reduce((n, h) => n + h.agents.length, 0),
      events: ds.events.filter((e) =>
        subset.some((h) => h.workspace.id === e.workspaceId),
      ).length,
    },
  };
}

const payload = {
  generatedAt: now.toISOString(),
  scopes: {
    all: aggregatesFor('all'),
    synthetic: aggregatesFor('synthetic'),
    elevenlabs: aggregatesFor('elevenlabs'),
  },
  counts: {
    all: healths.length,
    synthetic: healths.filter((h) => h.workspace.source === 'synthetic').length,
    elevenlabs: healths.filter((h) => h.workspace.source === 'elevenlabs').length,
  },
  healths: slimHealths,
  recentEvents,
  rules: STALLED_RULES,
  thresholds: RULE_THRESHOLDS,
  milestones: MILESTONES.map((m) => ({
    id: m, short: MILESTONE_SHORT[m], label: MILESTONE_LABEL[m], description: MILESTONE_DESCRIPTION[m],
  })),
  totals: { workspaces: ds.workspaces.length, agents: ds.agents.length, events: ds.events.length },
};

const out = process.argv[2] ?? 'engine-snapshot.json';
writeFileSync(out, JSON.stringify(payload));
console.log('wrote', out, (JSON.stringify(payload).length / 1024).toFixed(0) + 'KB');
console.log('workspaces', ds.workspaces.length, 'agents', ds.agents.length, 'events', ds.events.length);
for (const scope of ['all', 'synthetic', 'elevenlabs'] as const) {
  const s = payload.scopes[scope];
  console.log(
    `  ${scope.padEnd(11)} workspaces=${String(s.totals.workspaces).padStart(3)}`,
    `cohorts=${String(s.cohorts.length).padStart(2)}`,
    `playbooks=${s.interventions.length}`,
  );
}

import { formatDuration, hoursBetween } from '../utils';
import { deriveAgent, resolveWorkspaceMilestone, timeToMilestoneHours, type AgentDerivation } from './milestones';
import { RULE_THRESHOLDS, STALLED_RULES_BY_ID } from './rules';
import {
  DEPLOYMENT_LABEL,
  MILESTONE_LABEL,
  MILESTONE_RANK,
  type Agent,
  type AgentHealth,
  type RiskSignal,
  type RiskStatus,
  type StalledRuleId,
  type TelemetryEvent,
  type Workspace,
  type WorkspaceHealth,
} from '../types';

/**
 * Status precedence, most severe first. A workspace shows the first status
 * whose rule fires against the workspace itself or its lead agent.
 */
const STATUS_PRECEDENCE: RiskStatus[] = ['CHURNED', 'ERROR_BLOCKED', 'SHELFWARE', 'STALLED'];

/** Statuses that count toward the At-Risk KPI (churned is already lost). */
export const AT_RISK_STATUSES: RiskStatus[] = ['STALLED', 'ERROR_BLOCKED', 'SHELFWARE'];

function signalFor(
  ruleId: StalledRuleId,
  diagnostic: string,
  agent: Agent | null,
): RiskSignal {
  const rule = STALLED_RULES_BY_ID[ruleId];
  return {
    ruleId,
    ruleName: rule.name,
    severity: rule.severity,
    status: rule.status,
    diagnostic,
    agentId: agent?.id ?? null,
    agentName: agent?.name ?? null,
    interventionId: rule.interventionId,
  };
}

interface AgentContext {
  agent: Agent;
  derivation: AgentDerivation;
  health: AgentHealth;
}

/**
 * Evaluates the stalled-account rule engine for one workspace and returns its
 * full derived health record: funnel stage, risk status, root-cause signals,
 * TTFV, and per-agent breakdown.
 */
export function evaluateWorkspace(
  workspace: Workspace,
  agents: Agent[],
  events: TelemetryEvent[],
  now: Date = new Date(),
): WorkspaceHealth {
  const nowIso = now.toISOString();
  const eventsByAgent = new Map<string, TelemetryEvent[]>();
  let workspaceLastEventAt: string | null = null;

  for (const event of events) {
    if (workspaceLastEventAt === null || event.timestamp > workspaceLastEventAt) {
      workspaceLastEventAt = event.timestamp;
    }
    if (!event.agentId) continue;
    const bucket = eventsByAgent.get(event.agentId) ?? [];
    bucket.push(event);
    eventsByAgent.set(event.agentId, bucket);
  }

  const contexts: AgentContext[] = agents.map((agent) => {
    const derivation = deriveAgent(agent, workspace, eventsByAgent.get(agent.id) ?? []);
    const hoursSinceLastEvent = derivation.lastEventAt
      ? hoursBetween(derivation.lastEventAt, nowIso)
      : hoursBetween(agent.createdAt, nowIso);
    const health: AgentHealth = {
      agent: {
        ...agent,
        liveConversations: derivation.liveConversations,
        distinctActiveDays: derivation.distinctActiveDays,
        creditConsumptionPct: derivation.creditConsumptionPct,
        medianLatencyMs: derivation.medianLatencyMs,
        isDraft: !derivation.deployed,
      },
      milestone: derivation.milestone,
      lastEventAt: derivation.lastEventAt,
      hoursSinceLastEvent,
      consecutiveTestFailures: derivation.consecutiveTestFailures,
      lastErrorCode: derivation.lastErrorCode,
      milestoneTimestamps: derivation.milestoneTimestamps,
      isStalled: false,
    };
    return { agent, derivation, health };
  });

  const derivations = contexts.map((c) => c.derivation);
  const milestone = resolveWorkspaceMilestone(derivations.map((d) => d.milestone));
  const milestoneRank = MILESTONE_RANK[milestone];

  const ageHours = hoursBetween(workspace.createdAt, nowIso);
  const hoursSinceLastEvent = workspaceLastEventAt
    ? hoursBetween(workspaceLastEventAt, nowIso)
    : ageHours;

  // Lead agent: the one defining the workspace milestone (earliest on a tie).
  const leadAgent =
    contexts
      .filter((c) => c.derivation.milestone === milestone)
      .sort((a, b) => a.agent.createdAt.localeCompare(b.agent.createdAt))[0] ?? null;

  /* ---------------------------------------------------------------------- */
  /* Rule evaluation                                                         */
  /* ---------------------------------------------------------------------- */

  const signals: RiskSignal[] = [];

  // R1 — repeated test call failures (agent-scoped).
  for (const context of contexts) {
    if (context.derivation.consecutiveTestFailures < RULE_THRESHOLDS.consecutiveTestFailures) continue;
    const error = context.derivation.lastErrorCode ?? 'WebSocket Disconnect';
    context.health.isStalled = true;
    signals.push(
      signalFor(
        'CONSECUTIVE_TEST_FAILURES',
        `${context.derivation.consecutiveTestFailures}x test call failures — ${error}`,
        context.agent,
      ),
    );
  }

  // R2 — dormant account (workspace-scoped).
  if (
    milestoneRank < MILESTONE_RANK.M4_CONSUMING &&
    hoursSinceLastEvent > RULE_THRESHOLDS.dormantDays * 24
  ) {
    signals.push(
      signalFor(
        'DORMANT_30D',
        `Dormant ${formatDuration(hoursSinceLastEvent)} — last progress at ${MILESTONE_LABEL[milestone]}`,
        null,
      ),
    );
  }

  // R3 — activated without consumption (workspace-scoped).
  if (milestone === 'M3_ACTIVATED') {
    const activatedAt = derivations
      .map((d) => d.milestoneTimestamps.M3_ACTIVATED)
      .filter((t): t is string => Boolean(t))
      .sort()[0];
    if (activatedAt) {
      const hoursSinceActivation = hoursBetween(activatedAt, nowIso);
      if (hoursSinceActivation > RULE_THRESHOLDS.activatedNotConsumingDays * 24) {
        const totalCalls = derivations.reduce((sum, d) => sum + d.liveConversations, 0);
        const weeks = Math.max(1, hoursSinceActivation / (24 * 7));
        const weeklyCalls = Math.round(totalCalls / weeks);
        signals.push(
          signalFor(
            'ACTIVATED_NOT_CONSUMING_14D',
            `Activated ${formatDuration(hoursSinceActivation)} ago with ${weeklyCalls} weekly calls — below consumption gate`,
            leadAgent?.agent ?? null,
          ),
        );
      }
    }
  }

  // R4 — provisioned without an agent (workspace-scoped).
  if (agents.length === 0 && ageHours > RULE_THRESHOLDS.provisionedNoAgentHours) {
    signals.push(
      signalFor(
        'PROVISIONED_NO_AGENT',
        `Provisioned ${formatDuration(ageHours)} ago — no Conversational Agent created`,
        null,
      ),
    );
  }

  // R5 — no milestone progress for 48h+ while below M3.
  // Above M3 the governing rule is ACTIVATED_NOT_CONSUMING_14D, because the M4
  // gate is a 30-day usage window and would otherwise flag every healthy account.
  if (agents.length > 0 && milestoneRank < MILESTONE_RANK.M3_ACTIVATED) {
    const lastAdvanceAt =
      derivations
        .flatMap((d) => Object.values(d.milestoneTimestamps))
        .sort()
        .pop() ?? workspace.createdAt;
    const hoursSinceAdvance = hoursBetween(lastAdvanceAt, nowIso);
    if (hoursSinceAdvance > RULE_THRESHOLDS.noProgressHours) {
      const blocked = leadAgent;
      let diagnostic: string;
      if (milestone === 'M1_CREATED') {
        diagnostic = `Agent created ${formatDuration(hoursSinceAdvance)} ago without a test call`;
      } else if (milestone === 'M2_TESTED') {
        const surface = blocked ? DEPLOYMENT_LABEL[blocked.agent.deploymentSurface] : 'none';
        diagnostic = `Tested ${formatDuration(hoursSinceAdvance)} ago — never deployed to production (${surface})`;
      } else {
        diagnostic = `No milestone progress for ${formatDuration(hoursSinceAdvance)} at ${MILESTONE_LABEL[milestone]}`;
      }
      if (blocked) blocked.health.isStalled = true;
      signals.push(signalFor('NO_PROGRESS_48H', diagnostic, blocked?.agent ?? null));
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Status resolution — secondary-agent failures never downgrade the account */
  /* ---------------------------------------------------------------------- */

  const leadAgentId = leadAgent?.agent.id ?? null;
  const primarySignals = signals.filter(
    (signal) => signal.agentId === null || signal.agentId === leadAgentId,
  );
  const secondarySignals = signals.filter(
    (signal) => signal.agentId !== null && signal.agentId !== leadAgentId,
  );

  let status: RiskStatus = 'OPTIMAL';
  for (const candidate of STATUS_PRECEDENCE) {
    if (primarySignals.some((signal) => signal.status === candidate)) {
      status = candidate;
      break;
    }
  }

  const stalledAgentCount = contexts.filter((c) => c.health.isStalled).length;
  const secondaryStalled = secondarySignals.length;
  const subStatus =
    status === 'OPTIMAL' && secondaryStalled > 0
      ? `Active (${secondaryStalled} agent${secondaryStalled === 1 ? '' : 's'} stalled)`
      : null;

  const activeAgentCount = contexts.filter((c) => !c.health.agent.isDraft).length;

  return {
    workspace,
    agents: contexts.map((c) => c.health),
    milestone,
    status,
    signals: [...primarySignals, ...secondarySignals],
    subStatus,
    timeToFirstAgentHours: timeToMilestoneHours(workspace, derivations, 'M1_CREATED'),
    ttfvHours: timeToMilestoneHours(workspace, derivations, 'M2_TESTED'),
    timeToActivationHours: timeToMilestoneHours(workspace, derivations, 'M3_ACTIVATED'),
    timeToConsumingHours: timeToMilestoneHours(workspace, derivations, 'M4_CONSUMING'),
    hoursSinceLastEvent,
    lastEventAt: workspaceLastEventAt,
    ageHours,
    totalLiveConversations: derivations.reduce((sum, d) => sum + d.liveConversations, 0),
    stalledAgentCount,
    activeAgentCount,
    draftAgentCount: contexts.length - activeAgentCount,
  };
}

export function isAtRisk(health: WorkspaceHealth): boolean {
  return AT_RISK_STATUSES.includes(health.status);
}

import { INTERVENTION_PLAYBOOKS, PLAYBOOKS_BY_ID } from './rules';
import type {
  InterventionCandidate,
  InterventionId,
  InterventionRecord,
  RiskSignal,
  WorkspaceHealth,
} from '../types';

/** Tiers that additionally page a Forward Deployed Strategist when stalled. */
const HIGH_TOUCH_TIERS = new Set(['Enterprise', 'Scale']);

/** A dispatch inside this window suppresses re-sending the same playbook. */
const SUPPRESSION_HOURS = 168;

function reasonFor(signal: RiskSignal): string {
  return signal.agentName ? `${signal.agentName}: ${signal.diagnostic}` : signal.diagnostic;
}

/**
 * Refines a signal's default playbook using the workspace's funnel stage.
 *
 * NO_PROGRESS_48H fires at both M1 and M2, but the blocker is different: an
 * untested agent needs the simulator nudge, while a tested-but-undeployed agent
 * needs the deployment quickstart.
 */
function routeSignal(health: WorkspaceHealth, signal: RiskSignal): InterventionId {
  if (signal.ruleId === 'NO_PROGRESS_48H' && health.milestone === 'M2_TESTED') {
    return 'PRODUCTION_DEPLOYMENT_GUIDE';
  }
  return signal.interventionId;
}

/**
 * Routes every fired risk signal to its remediation playbook.
 *
 * Enterprise and Scale accounts are additionally escalated to a Solutions
 * Engineer / Forward Deployed Strategist while remaining in the technical
 * playbook that addresses their actual blocker.
 */
export function buildInterventionQueue(healths: WorkspaceHealth[]): InterventionCandidate[] {
  const buckets = new Map<InterventionId, { workspaces: WorkspaceHealth[]; reasons: Record<string, string> }>();

  const push = (id: InterventionId, health: WorkspaceHealth, reason: string) => {
    const bucket = buckets.get(id) ?? { workspaces: [], reasons: {} };
    if (!bucket.reasons[health.workspace.id]) {
      bucket.workspaces.push(health);
      bucket.reasons[health.workspace.id] = reason;
    }
    buckets.set(id, bucket);
  };

  for (const health of healths) {
    if (health.signals.length === 0) continue;

    for (const signal of health.signals) {
      push(routeSignal(health, signal), health, reasonFor(signal));
    }

    if (health.workspace.tier !== null && HIGH_TOUCH_TIERS.has(health.workspace.tier)) {
      const lead = health.signals[0];
      push(
        'ENTERPRISE_SE_ESCALATION',
        health,
        `${health.workspace.tier} account blocked — ${reasonFor(lead)}`,
      );
    }
  }

  return INTERVENTION_PLAYBOOKS.map((playbook) => {
    const bucket = buckets.get(playbook.id) ?? { workspaces: [], reasons: {} };
    const severityWeight = { critical: 0, high: 1, medium: 2 };
    return {
      playbook,
      workspaces: [...bucket.workspaces].sort((a, b) => {
        const bySeverity =
          severityWeight[a.signals[0]?.severity ?? 'medium'] -
          severityWeight[b.signals[0]?.severity ?? 'medium'];
        if (bySeverity !== 0) return bySeverity;
        return b.hoursSinceLastEvent - a.hoursSinceLastEvent;
      }),
      reasons: bucket.reasons,
    };
  })
    .filter((candidate) => candidate.workspaces.length > 0)
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2 };
      const bySeverity = order[a.playbook.severity] - order[b.playbook.severity];
      return bySeverity !== 0 ? bySeverity : b.workspaces.length - a.workspaces.length;
    });
}

/**
 * Set of `${interventionId}:${workspaceId}` keys dispatched recently enough to
 * suppress a duplicate send.
 */
export function buildSuppressionSet(
  records: InterventionRecord[],
  now: Date = new Date(),
): Set<string> {
  const cutoff = now.getTime() - SUPPRESSION_HOURS * 3_600_000;
  const keys = new Set<string>();
  for (const record of records) {
    if (record.status !== 'dispatched') continue;
    if (Date.parse(record.dispatchedAt) < cutoff) continue;
    keys.add(`${record.interventionId}:${record.workspaceId}`);
  }
  return keys;
}

export function suppressionKey(interventionId: InterventionId, workspaceId: string): string {
  return `${interventionId}:${workspaceId}`;
}

/** Mock delivery target used by the one-click action simulator. */
export function dispatchTarget(interventionId: InterventionId, workspaceId: string): string {
  const playbook = PLAYBOOKS_BY_ID[interventionId];
  switch (playbook?.channel) {
    case 'webhook':
      return `POST https://hooks.internal.elevenlabs.io/adoption/${interventionId.toLowerCase()}?workspace=${workspaceId}`;
    case 'slack':
      return `slack://#adoption-escalations?workspace=${workspaceId}`;
    case 'in_app':
      return `in-app://workspace/${workspaceId}/notifications`;
    case 'email':
    default:
      return `mailto:owner+${workspaceId}@customer.elevenlabs.dev`;
  }
}

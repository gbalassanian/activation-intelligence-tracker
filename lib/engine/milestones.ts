import { DAY_MS, hoursBetween, startOfIsoWeek } from '../utils';
import { RULE_THRESHOLDS } from './rules';
import {
  MILESTONE_RANK,
  MILESTONES,
  type Agent,
  type ErrorCode,
  type Milestone,
  type TelemetryEvent,
  type Workspace,
} from '../types';

export function rankToMilestone(rank: number): Milestone {
  const clamped = Math.max(0, Math.min(MILESTONES.length - 1, Math.round(rank)));
  return MILESTONES[clamped];
}

export function maxMilestone(a: Milestone, b: Milestone): Milestone {
  return MILESTONE_RANK[a] >= MILESTONE_RANK[b] ? a : b;
}

export interface AgentDerivation {
  milestone: Milestone;
  milestoneTimestamps: Partial<Record<Milestone, string>>;
  lastEventAt: string | null;
  consecutiveTestFailures: number;
  lastErrorCode: ErrorCode | null;
  liveConversations: number;
  /** Best distinct-active-days count observed in any single ISO week. */
  distinctActiveDays: number;
  creditConsumptionPct: number;
  medianLatencyMs: number | null;
  deployed: boolean;
  testAttempts: number;
}

/**
 * Replays an agent's immutable event stream in chronological order and derives
 * its milestone, the timestamp at which each milestone gate first closed, and
 * the counters the risk rules operate on.
 *
 * Gates (linear, monotonic — an agent never regresses):
 *   M1 agent created
 *   M2 successful test conversation lasting >= 10s with no synthesis/WS error
 *   M3 deployed to a production surface AND >= 5 live conversations
 *   M4 >= 50 live conversations across >= 3 distinct active days in a week,
 *      inside any trailing 30-day window, OR > 40% of tier voice credits
 *      consumed
 */
export function deriveAgent(
  agent: Agent,
  workspace: Workspace,
  events: TelemetryEvent[],
): AgentDerivation {
  const ordered = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const milestoneTimestamps: Partial<Record<Milestone, string>> = {};
  let rank = 0;
  let lastEventAt: string | null = null;
  let consecutiveTestFailures = 0;
  let lastErrorCode: ErrorCode | null = null;
  let liveConversations = 0;
  let creditConsumptionPct = 0;
  let deployed = false;
  let testAttempts = 0;
  const latencies: number[] = [];
  /**
   * Successful production conversations in arrival order. The M4 gate reads a
   * trailing window off this log instead of a window pinned to the signup
   * date, so an account that ramps in month three is measured on the same
   * terms as one that ramps in week two.
   */
  const conversationLog: Array<{ at: number; count: number; day: string; week: string }> = [];
  const consumingWindowMs = RULE_THRESHOLDS.consumingWindowDays * DAY_MS;

  const advance = (target: Milestone, at: string) => {
    const targetRank = MILESTONE_RANK[target];
    if (targetRank <= rank) return;
    // Backfill any skipped gate with the same timestamp so the funnel stays linear.
    for (let r = rank + 1; r <= targetRank; r += 1) {
      const milestone = MILESTONES[r];
      if (!milestoneTimestamps[milestone]) milestoneTimestamps[milestone] = at;
    }
    rank = targetRank;
  };

  /**
   * Conversation volume and weekly spread over the window ending at `at`.
   * Walks backwards from the newest entry and stops at the window edge, so the
   * cost is proportional to the window rather than to the whole history.
   */
  const rollingUsage = (at: number) => {
    const from = at - consumingWindowMs;
    let conversations = 0;
    const daysByWeek = new Map<string, Set<string>>();
    for (let i = conversationLog.length - 1; i >= 0; i -= 1) {
      const entry = conversationLog[i];
      if (entry.at < from) break;
      conversations += entry.count;
      const days = daysByWeek.get(entry.week) ?? new Set<string>();
      days.add(entry.day);
      daysByWeek.set(entry.week, days);
    }
    let bestActiveDays = 0;
    for (const days of daysByWeek.values()) bestActiveDays = Math.max(bestActiveDays, days.size);
    return { conversations, bestActiveDays };
  };

  /** Usage over the window ending at the most recent conversation. */
  const latestUsage = () =>
    conversationLog.length === 0
      ? { conversations: 0, bestActiveDays: 0 }
      : rollingUsage(conversationLog[conversationLog.length - 1].at);

  const checkUsageGates = (at: string) => {
    if (deployed && liveConversations >= RULE_THRESHOLDS.activationConversations) {
      advance('M3_ACTIVATED', at);
    }
    if (rank < MILESTONE_RANK.M3_ACTIVATED) return;
    const usage = rollingUsage(Date.parse(at));
    const volumeGate =
      usage.conversations >= RULE_THRESHOLDS.consumingConversations &&
      usage.bestActiveDays >= RULE_THRESHOLDS.consumingActiveDays;
    const creditGate = creditConsumptionPct > RULE_THRESHOLDS.consumingCreditPct;
    if (volumeGate || creditGate) {
      advance('M4_CONSUMING', at);
    }
  };

  for (const event of ordered) {
    lastEventAt = event.timestamp;
    const meta = event.metadata ?? {};
    if (typeof meta.latencyMs === 'number') latencies.push(meta.latencyMs);

    switch (event.eventType) {
      case 'agent_created':
      case 'voice_assigned':
      case 'prompt_configured': {
        advance('M1_CREATED', event.timestamp);
        break;
      }
      case 'test_conversation':
      case 'simulator_session': {
        testAttempts += 1;
        const duration = typeof meta.durationSeconds === 'number' ? meta.durationSeconds : 0;
        if (event.status === 'success' && duration >= RULE_THRESHOLDS.testDurationSeconds) {
          consecutiveTestFailures = 0;
          advance('M2_TESTED', event.timestamp);
        } else if (event.status === 'error') {
          consecutiveTestFailures += 1;
          lastErrorCode = (meta.errorDetails as ErrorCode | undefined) ?? lastErrorCode;
        }
        break;
      }
      case 'deployment': {
        if (event.status === 'success') {
          deployed = true;
          checkUsageGates(event.timestamp);
        } else {
          lastErrorCode = (meta.errorDetails as ErrorCode | undefined) ?? lastErrorCode;
        }
        break;
      }
      case 'live_conversation': {
        const count = typeof meta.conversationCount === 'number' ? meta.conversationCount : 1;
        if (event.status === 'success') {
          liveConversations += count;
          conversationLog.push({
            at: Date.parse(event.timestamp),
            count,
            day: event.timestamp.slice(0, 10),
            week: startOfIsoWeek(event.timestamp),
          });
          checkUsageGates(event.timestamp);
        } else {
          lastErrorCode = (meta.errorDetails as ErrorCode | undefined) ?? lastErrorCode;
        }
        break;
      }
      case 'credit_consumption': {
        const quota = workspace.creditQuota || 1;
        const pct =
          typeof meta.creditsUsed === 'number'
            ? meta.creditsUsed / quota
            : creditConsumptionPct;
        creditConsumptionPct = Math.max(creditConsumptionPct, pct);
        checkUsageGates(event.timestamp);
        break;
      }
      case 'webhook_delivery': {
        if (event.status === 'error') {
          lastErrorCode = (meta.errorDetails as ErrorCode | undefined) ?? lastErrorCode;
        }
        break;
      }
      default:
        break;
    }
  }

  latencies.sort((a, b) => a - b);
  const medianLatencyMs =
    latencies.length > 0 ? Math.round(latencies[Math.floor(latencies.length / 2)]) : null;

  return {
    milestone: rankToMilestone(rank),
    milestoneTimestamps,
    lastEventAt,
    consecutiveTestFailures,
    lastErrorCode,
    liveConversations,
    distinctActiveDays: latestUsage().bestActiveDays,
    creditConsumptionPct,
    medianLatencyMs,
    deployed,
    testAttempts,
  };
}

/**
 * Workspace funnel stage = MAX(agent_milestone). A workspace with one agent at
 * M4 and a second at M1 stays M4 in every macro metric.
 */
export function resolveWorkspaceMilestone(agentMilestones: Milestone[]): Milestone {
  let best: Milestone = 'M0_PROVISIONED';
  for (const milestone of agentMilestones) best = maxMilestone(best, milestone);
  return best;
}

/**
 * First timestamp at which ANY agent in the workspace reached `milestone`.
 * This is the basis for TTFV (workspace creation → first agent at M2 Tested).
 */
export function firstMilestoneTimestamp(
  derivations: AgentDerivation[],
  milestone: Milestone,
): string | null {
  let earliest: string | null = null;
  for (const derivation of derivations) {
    const at = derivation.milestoneTimestamps[milestone];
    if (!at) continue;
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest;
}

export function timeToMilestoneHours(
  workspace: Workspace,
  derivations: AgentDerivation[],
  milestone: Milestone,
): number | null {
  const at = firstMilestoneTimestamp(derivations, milestone);
  if (!at) return null;
  return Math.max(0, hoursBetween(workspace.createdAt, at));
}

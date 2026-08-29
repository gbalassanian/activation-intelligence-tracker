import { median, percentile, safeRate, startOfIsoWeek } from '../utils';
import { AT_RISK_STATUSES } from './health';
import {
  MILESTONES,
  MILESTONE_DESCRIPTION,
  MILESTONE_LABEL,
  MILESTONE_RANK,
  MILESTONE_SHORT,
  RISK_STATUSES,
  TIERS,
  type CohortRow,
  type ExecutiveMetrics,
  type FunnelStage,
  type Milestone,
  type RiskStatus,
  type Tier,
  type WorkspaceHealth,
} from '../types';

const HOURS_TO_MILESTONE: Partial<Record<Milestone, (h: WorkspaceHealth) => number | null>> = {
  M1_CREATED: (h) => h.timeToFirstAgentHours,
  M2_TESTED: (h) => h.ttfvHours,
  M3_ACTIVATED: (h) => h.timeToActivationHours,
  M4_CONSUMING: (h) => h.timeToConsumingHours,
};

/**
 * Linear 5-step funnel computed on the highest-milestone rule: a workspace
 * counts as "reached" every stage at or below its MAX(agent_milestone).
 */
export function buildFunnel(healths: WorkspaceHealth[]): FunnelStage[] {
  const total = healths.length;
  let previousReached = total;

  return MILESTONES.map((milestone, index) => {
    const rank = MILESTONE_RANK[milestone];
    const reachedSet = healths.filter((h) => MILESTONE_RANK[h.milestone] >= rank);
    const restingSet = healths.filter((h) => h.milestone === milestone);
    const reached = reachedSet.length;

    const timeFn = HOURS_TO_MILESTONE[milestone];
    const times = timeFn
      ? reachedSet.map(timeFn).filter((v): v is number => v !== null)
      : [];

    const conversionFromPrevious = index === 0 ? 1 : safeRate(reached, previousReached);
    const dropOffCount = index === 0 ? 0 : Math.max(0, previousReached - reached);

    // Dominant blocker among the workspaces resting at this stage.
    const blockerCounts = new Map<string, number>();
    for (const health of restingSet) {
      // Only count workspaces the rule engine actually flagged; a healthy
      // account resting at a stage has no blocker to attribute.
      if (health.status === 'OPTIMAL') continue;
      const signal = health.signals[0];
      if (!signal) continue;
      blockerCounts.set(signal.ruleName, (blockerCounts.get(signal.ruleName) ?? 0) + 1);
    }
    const topBlocker =
      [...blockerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const stage: FunnelStage = {
      milestone,
      label: MILESTONE_LABEL[milestone],
      short: MILESTONE_SHORT[milestone],
      description: MILESTONE_DESCRIPTION[milestone],
      reached,
      restingHere: restingSet.length,
      conversionFromStart: safeRate(reached, total),
      conversionFromPrevious,
      dropOffRate: index === 0 ? 0 : 1 - conversionFromPrevious,
      dropOffCount,
      medianHoursFromStart: index === 0 ? 0 : median(times),
      topBlocker,
    };

    previousReached = reached;
    return stage;
  });
}

/** Weekly signup cohorts with activation velocity and friction deltas. */
export function buildCohorts(healths: WorkspaceHealth[], limit = 10): CohortRow[] {
  const buckets = new Map<string, WorkspaceHealth[]>();
  for (const health of healths) {
    const week = health.workspace.cohortWeek || startOfIsoWeek(health.workspace.createdAt);
    const bucket = buckets.get(week) ?? [];
    bucket.push(health);
    buckets.set(week, bucket);
  }

  const weeks = [...buckets.keys()].sort();
  const rows: CohortRow[] = weeks.map((week) => {
    const members = buckets.get(week) ?? [];
    const ttfvs = members.map((m) => m.ttfvHours).filter((v): v is number => v !== null);
    const activationTimes = members
      .map((m) => m.timeToActivationHours)
      .filter((v): v is number => v !== null);
    const consumingTimes = members
      .map((m) => m.timeToConsumingHours)
      .filter((v): v is number => v !== null);
    const tested = members.filter((m) => MILESTONE_RANK[m.milestone] >= MILESTONE_RANK.M2_TESTED).length;
    const activated = members.filter(
      (m) => MILESTONE_RANK[m.milestone] >= MILESTONE_RANK.M3_ACTIVATED,
    ).length;
    const consuming = members.filter((m) => m.milestone === 'M4_CONSUMING').length;

    return {
      week,
      label: new Date(`${week}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
      workspaces: members.length,
      medianTtfvHours: median(ttfvs),
      p90TtfvHours: percentile(ttfvs, 0.9),
      medianTimeToActivationHours: median(activationTimes),
      medianTimeToConsumingHours: median(consumingTimes),
      testedRate: safeRate(tested, members.length),
      activationRate: safeRate(activated, members.length),
      consumingRate: safeRate(consuming, members.length),
      atRisk: members.filter((m) => AT_RISK_STATUSES.includes(m.status)).length,
      ttfvDeltaHours: null,
    };
  });

  for (let i = 1; i < rows.length; i += 1) {
    const current = rows[i].medianTtfvHours;
    const previous = rows[i - 1].medianTtfvHours;
    rows[i].ttfvDeltaHours = current !== null && previous !== null ? current - previous : null;
  }

  return rows.slice(-limit);
}

export function buildExecutiveMetrics(
  healths: WorkspaceHealth[],
  now: Date = new Date(),
): ExecutiveMetrics {
  const total = healths.length;
  const ttfvs = healths.map((h) => h.ttfvHours).filter((v): v is number => v !== null);
  const activationTimes = healths
    .map((h) => h.timeToActivationHours)
    .filter((v): v is number => v !== null);

  const activated = healths.filter(
    (h) => MILESTONE_RANK[h.milestone] >= MILESTONE_RANK.M3_ACTIVATED,
  ).length;
  const consuming = healths.filter((h) => h.milestone === 'M4_CONSUMING').length;

  const statusCounts = Object.fromEntries(
    RISK_STATUSES.map((status) => [status, 0]),
  ) as Record<RiskStatus, number>;
  for (const health of healths) statusCounts[health.status] += 1;

  const atRiskCount = AT_RISK_STATUSES.reduce((sum, status) => sum + statusCounts[status], 0);

  const weekStart = startOfIsoWeek(now);
  const newlyActivatedThisWeek = healths.filter((h) => {
    if (h.ttfvHours === null) return false;
    const reachedAt = new Date(Date.parse(h.workspace.createdAt) + h.ttfvHours * 3_600_000);
    return startOfIsoWeek(reachedAt) === weekStart;
  }).length;

  const tierBreakdown = TIERS.map((tier: Tier) => {
    const members = healths.filter((h) => h.workspace.tier === tier);
    const tierActivated = members.filter(
      (h) => MILESTONE_RANK[h.milestone] >= MILESTONE_RANK.M3_ACTIVATED,
    ).length;
    return {
      tier,
      workspaces: members.length,
      activationRate: safeRate(tierActivated, members.length),
      atRisk: members.filter((h) => AT_RISK_STATUSES.includes(h.status)).length,
    };
  }).filter((row) => row.workspaces > 0);

  return {
    totalWorkspaces: total,
    medianTtfvHours: median(ttfvs),
    p90TtfvHours: percentile(ttfvs, 0.9),
    medianTimeToActivationHours: median(activationTimes),
    fullActivationRate: safeRate(activated, total),
    consumingGraduationRate: safeRate(consuming, total),
    atRiskCount,
    atRiskRate: safeRate(atRiskCount, total),
    totalAgents: healths.reduce((sum, h) => sum + h.agents.length, 0),
    stalledAgents: healths.reduce((sum, h) => sum + h.stalledAgentCount, 0),
    newlyActivatedThisWeek,
    statusCounts,
    tierBreakdown,
  };
}

/** Weekly TTFV trend series for the cohort chart. */
export function buildTtfvTrend(cohorts: CohortRow[]) {
  return cohorts.map((row) => ({
    label: row.label,
    median: row.medianTtfvHours,
    p90: row.p90TtfvHours,
    activationRate: Math.round(row.activationRate * 100),
  }));
}

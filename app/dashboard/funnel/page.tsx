import { AlertTriangle, Gauge, PlugZap, Rocket, Timer, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { FunnelStrip } from '@/components/dashboard/funnel-strip';
import { CohortMatrix } from '@/components/dashboard/cohort-matrix';
import { TtfvChart } from '@/components/dashboard/ttfv-chart';
import { getDashboardState } from '@/lib/store';
import { buildTtfvTrend } from '@/lib/engine/metrics';
import { RISK_LABEL, RISK_STATUSES, type RiskStatus } from '@/lib/types';
import { cn, formatDuration, formatNumber, formatPercent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_BAR: Record<RiskStatus, string> = {
  OPTIMAL: 'bg-emerald-600',
  STALLED: 'bg-amber-500',
  ERROR_BLOCKED: 'bg-rose-600',
  SHELFWARE: 'bg-amber-600/70',
  CHURNED: 'bg-zinc-400',
};

export default function FunnelPage() {
  const { metrics, funnel, cohorts } = getDashboardState();
  const trend = buildTtfvTrend(cohorts);
  const latest = cohorts[cohorts.length - 1];
  const previous = cohorts[cohorts.length - 2];

  const ttfvDelta =
    latest?.medianTtfvHours != null && previous?.medianTtfvHours != null
      ? latest.medianTtfvHours - previous.medianTtfvHours
      : null;

  // Distance between "it worked for them" (M2) and "it is live" (M3).
  const productionGap =
    metrics.medianTimeToActivationHours != null && metrics.medianTtfvHours != null
      ? metrics.medianTimeToActivationHours - metrics.medianTtfvHours
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Executive & Cohorts"
        title="Activation funnel"
        description="Time-to-First-Value and 30-day funnel health across every ElevenLabs customer workspace. Workspace stage is resolved as the highest milestone achieved by any of its Conversational Agents."
        actions={
          <Badge variant="outline" mono>
            {formatNumber(metrics.totalWorkspaces)} workspaces · {formatNumber(metrics.totalAgents)}{' '}
            agents
          </Badge>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Median TTFV"
          value={
            metrics.medianTtfvHours === null ? '—' : metrics.medianTtfvHours.toFixed(1)
          }
          unit={metrics.medianTtfvHours === null ? undefined : 'h'}
          caption="P50 signup → first successful test conversation"
          tone="neutral"
          Icon={Timer}
          tooltip="Time-to-First-Value: hours from workspace creation (M0) to the first agent in the workspace reaching M2 Tested — a test conversation over 10 seconds with zero synthesis or WebSocket errors."
          footnote={
            ttfvDelta === null ? null : (
              <span className="font-mono">
                latest cohort{' '}
                <span className={ttfvDelta < 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {ttfvDelta < 0 ? '' : '+'}
                  {ttfvDelta.toFixed(1)}h
                </span>{' '}
                vs prior week
              </span>
            )
          }
        />
        <KpiCard
          label="P90 TTFV"
          value={metrics.p90TtfvHours === null ? '—' : metrics.p90TtfvHours.toFixed(1)}
          unit={metrics.p90TtfvHours === null ? undefined : 'h'}
          caption="Tail latency of the aha moment"
          tone={
            metrics.p90TtfvHours !== null && metrics.p90TtfvHours > 72 ? 'amber' : 'neutral'
          }
          Icon={Gauge}
          tooltip="The slowest decile of workspaces. A widening gap between P50 and P90 means a subset of customers is hitting friction the median never sees — usually voice latency or webhook auth."
          footnote={
            <span className="font-mono">
              spread P50→P90{' '}
              {metrics.p90TtfvHours !== null && metrics.medianTtfvHours !== null
                ? `${(metrics.p90TtfvHours - metrics.medianTtfvHours).toFixed(1)}h`
                : '—'}
            </span>
          }
        />
        <KpiCard
          label="Time to production"
          value={
            metrics.medianTimeToActivationHours === null
              ? '—'
              : (metrics.medianTimeToActivationHours / 24).toFixed(1)
          }
          unit={metrics.medianTimeToActivationHours === null ? undefined : 'd'}
          caption="P50 signup → first agent live in production (M3)"
          tone="neutral"
          Icon={PlugZap}
          tooltip="Median hours from workspace creation to the first agent reaching M3 Activated. Tracked separately from TTFV because the two measure different things: TTFV is friction inside the product — signup, agent config, the simulator — which ElevenLabs controls, while time-to-production also carries the customer's own deploy timeline (sprint planning, number provisioning, security review)."
          footnote={
            productionGap === null ? null : (
              <span className="font-mono">
                gap M2→M3 {formatDuration(productionGap)}
              </span>
            )
          }
        />
        <KpiCard
          label="Full activation rate"
          value={formatPercent(metrics.fullActivationRate, 1).replace('%', '')}
          unit="%"
          caption="M0 → M3 Activated (deployed, ≥5 live calls)"
          tone="neutral"
          Icon={Rocket}
          tooltip="Share of all workspaces with at least one agent deployed to production via Web Widget, React SDK, or SIP/Twilio telephony that has held 5 or more live conversations."
          footnote={
            <span className="font-mono">
              {formatNumber(funnel[3].reached)} of {formatNumber(metrics.totalWorkspaces)}{' '}
              workspaces live in production
            </span>
          }
        />
        <KpiCard
          label="Consuming graduation"
          value={formatPercent(metrics.consumingGraduationRate, 1).replace('%', '')}
          unit="%"
          caption="M0 → M4 Consuming (sustained habit)"
          tone="emerald"
          Icon={TrendingUp}
          tooltip="Share of workspaces reaching sustained Day 7–30 usage: 50+ live conversations across 3+ distinct active days in a week, or more than 40% of tier voice credits consumed."
          footnote={
            <span className="font-mono">
              {formatNumber(metrics.newlyActivatedThisWeek)} newly activated this week
            </span>
          }
        />
        <KpiCard
          label="At-risk accounts"
          value={formatNumber(metrics.atRiskCount)}
          caption={`${formatPercent(metrics.atRiskRate, 0)} of the book — stalled, error blocked, or shelfware`}
          tone={metrics.atRiskCount > 0 ? 'rose' : 'emerald'}
          Icon={AlertTriangle}
          tooltip="Workspaces with at least one fired rule: no milestone progress for 48h, three or more consecutive test-call failures, or activated 14+ days ago without reaching sustained consumption. Churned accounts are tracked separately."
          footnote={
            <span className="font-mono">
              {formatNumber(metrics.statusCounts.CHURNED)} churned ·{' '}
              {formatNumber(metrics.stalledAgents)} agents stalled
            </span>
          }
        />
      </section>

      <FunnelStrip stages={funnel} total={metrics.totalWorkspaces} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>TTFV velocity by cohort</CardTitle>
            <CardDescription>
              Median (solid) and P90 (dashed) hours from signup to first successful test
              conversation, by signup week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TtfvChart data={trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Portfolio health</CardTitle>
            <CardDescription>Current status distribution across all workspaces.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              {RISK_STATUSES.map((status) => {
                const count = metrics.statusCounts[status];
                if (count === 0) return null;
                return (
                  <div
                    key={status}
                    className={cn('h-full', STATUS_BAR[status])}
                    style={{ width: `${(count / metrics.totalWorkspaces) * 100}%` }}
                  />
                );
              })}
            </div>

            <ul className="flex flex-col gap-2">
              {RISK_STATUSES.map((status) => (
                <li key={status} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', STATUS_BAR[status])} />
                    <span className="text-[12px] text-zinc-600">{RISK_LABEL[status]}</span>
                  </span>
                  <span data-metric className="font-mono text-[11px] text-zinc-500">
                    {formatNumber(metrics.statusCounts[status])} ·{' '}
                    {formatPercent(metrics.statusCounts[status] / metrics.totalWorkspaces, 0)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-1 border-t border-zinc-200/80 pt-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Activation by tier
              </p>
              <ul className="flex flex-col gap-1.5">
                {metrics.tierBreakdown.map((row) => (
                  <li key={row.tier} className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-zinc-600">{row.tier}</span>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-100">
                        <span
                          className="block h-full rounded-full bg-zinc-900"
                          style={{ width: `${row.activationRate * 100}%` }}
                        />
                      </span>
                      <span data-metric className="w-16 text-right font-mono text-[11px] text-zinc-500">
                        {formatPercent(row.activationRate, 0)} · {row.workspaces}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      <CohortMatrix cohorts={cohorts} />

      <Card>
        <CardHeader>
          <CardTitle>Stage timing</CardTitle>
          <CardDescription>
            Median elapsed time from workspace creation to each milestone, and where the funnel
            leaks hardest.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {funnel.slice(1).map((stage) => (
            <div
              key={stage.milestone}
              className="flex flex-col gap-1.5 rounded-lg border border-zinc-200/80 p-3"
            >
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-zinc-400">{stage.short}</span>
                <span className="text-[12px] font-medium tracking-tight text-zinc-900">
                  {stage.label}
                </span>
              </span>
              <span data-metric className="font-mono text-lg font-semibold text-zinc-900">
                {formatDuration(stage.medianHoursFromStart)}
              </span>
              <span className="font-mono text-[10.5px] text-zinc-400">
                median from M0 ·{' '}
                <span className={stage.dropOffRate > 0.25 ? 'text-rose-600' : 'text-zinc-500'}>
                  −{formatPercent(stage.dropOffRate, 1)} at this step
                </span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

import { ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { cn, formatDuration, formatNumber, formatPercent } from '@/lib/utils';
import type { FunnelStage } from '@/lib/types';

const STAGE_FILL = [
  'bg-zinc-300',
  'bg-zinc-400',
  'bg-zinc-600',
  'bg-zinc-900',
  'bg-emerald-600',
];

function StageTooltip({ stage, total }: { stage: FunnelStage; total: number }) {
  return (
    <span className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-zinc-400">{stage.short}</span>
        <span className="text-[12px] font-semibold tracking-tight text-zinc-900">{stage.label}</span>
      </span>
      <span className="text-[11px] leading-relaxed text-zinc-500">{stage.description}</span>
      <span className="flex flex-col gap-1 border-t border-zinc-200/80 pt-2 font-mono text-[10.5px] text-zinc-600">
        <span className="flex justify-between gap-4">
          <span className="text-zinc-400">reached</span>
          <span>
            {formatNumber(stage.reached)} / {formatNumber(total)} ({formatPercent(stage.conversionFromStart, 0)})
          </span>
        </span>
        <span className="flex justify-between gap-4">
          <span className="text-zinc-400">resting here</span>
          <span>{formatNumber(stage.restingHere)}</span>
        </span>
        <span className="flex justify-between gap-4">
          <span className="text-zinc-400">drop-off</span>
          <span className={stage.dropOffRate > 0.25 ? 'text-rose-600' : ''}>
            {formatPercent(stage.dropOffRate, 1)} ({formatNumber(stage.dropOffCount)})
          </span>
        </span>
        <span className="flex justify-between gap-4">
          <span className="text-zinc-400">median from M0</span>
          <span>{formatDuration(stage.medianHoursFromStart)}</span>
        </span>
      </span>
      {stage.topBlocker ? (
        <span className="border-t border-zinc-200/80 pt-2 text-[11px] text-zinc-500">
          Dominant blocker here:{' '}
          <span className="font-medium text-rose-600">{stage.topBlocker}</span>
        </span>
      ) : null}
    </span>
  );
}

export function FunnelStrip({ stages, total }: { stages: FunnelStage[]; total: number }) {
  const max = Math.max(1, ...stages.map((s) => s.reached));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linear onboarding funnel</CardTitle>
        <CardDescription>
          Day 1 to Day 30 progression across {formatNumber(total)} workspaces. A workspace counts as
          having reached a stage when any of its agents has — the highest-milestone rule.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
          {stages.map((stage, index) => (
            <div key={stage.milestone} className="flex min-w-0 flex-1 items-stretch gap-2">
              <Tooltip
                className="min-w-0 flex-1"
                content={<StageTooltip stage={stage} total={total} />}
                side="bottom"
                align={index >= stages.length - 2 ? 'end' : 'start'}
                width="w-80"
              >
                <div className="flex w-full min-w-0 cursor-default flex-col gap-2.5 rounded-lg border border-zinc-200/80 bg-white p-3 transition-colors hover:border-zinc-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-zinc-400">{stage.short}</span>
                      <span className="truncate text-[12px] font-medium tracking-tight text-zinc-900">
                        {stage.label}
                      </span>
                    </span>
                    <span
                      data-metric
                      className="font-mono text-[13px] font-semibold text-zinc-900"
                    >
                      {formatNumber(stage.reached)}
                    </span>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={cn('h-full rounded-full', STAGE_FILL[index])}
                      style={{ width: `${(stage.reached / max) * 100}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 font-mono text-[10.5px]">
                    <span className="text-zinc-400">
                      {formatPercent(stage.conversionFromStart, 0)} of M0
                    </span>
                    {index === 0 ? (
                      <span className="text-zinc-300">—</span>
                    ) : (
                      <span
                        className={cn(
                          stage.dropOffRate > 0.25 ? 'text-rose-600' : 'text-zinc-500',
                        )}
                      >
                        −{formatPercent(stage.dropOffRate, 0)}
                      </span>
                    )}
                  </div>
                </div>
              </Tooltip>

              {index < stages.length - 1 ? (
                <div className="hidden shrink-0 items-center lg:flex">
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-300" strokeWidth={2.5} />
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-zinc-200/80 pt-3 font-mono text-[10.5px] text-zinc-500">
          {stages.slice(1).map((stage) => (
            <span key={stage.milestone}>
              {stage.short} drop-off{' '}
              <span className={cn(stage.dropOffRate > 0.25 ? 'text-rose-600' : 'text-zinc-700')}>
                {formatPercent(stage.dropOffRate, 1)}
              </span>{' '}
              <span className="text-zinc-400">({formatNumber(stage.dropOffCount)} lost)</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

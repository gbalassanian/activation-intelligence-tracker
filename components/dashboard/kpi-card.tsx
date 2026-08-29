import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type KpiTone = 'neutral' | 'emerald' | 'rose' | 'amber';

const TONE_VALUE: Record<KpiTone, string> = {
  neutral: 'text-zinc-900',
  emerald: 'text-emerald-600',
  rose: 'text-rose-600',
  amber: 'text-amber-600',
};

const TONE_ICON: Record<KpiTone, string> = {
  neutral: 'bg-zinc-100 text-zinc-500',
  emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
};

export function KpiCard({
  label,
  value,
  unit,
  caption,
  footnote,
  tone = 'neutral',
  Icon,
  tooltip,
}: {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  footnote?: React.ReactNode;
  tone?: KpiTone;
  Icon?: LucideIcon;
  tooltip?: React.ReactNode;
}) {
  const header = (
    <div className="flex items-start gap-1.5">
      <span className="text-[11px] font-medium uppercase leading-4 tracking-wide text-zinc-500">
        {label}
      </span>
      {tooltip ? (
        <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-[9px] font-semibold text-zinc-400">
          ?
        </span>
      ) : null}
    </div>
  );

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex min-h-[2.25rem] items-start justify-between gap-3">
        {tooltip ? (
          <Tooltip
            content={<span className="text-[11px] leading-relaxed text-zinc-600">{tooltip}</span>}
            side="bottom"
            align="start"
          >
            {header}
          </Tooltip>
        ) : (
          header
        )}
        {Icon ? (
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', TONE_ICON[tone])}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
        ) : null}
      </div>

      <div className="flex h-7 items-baseline gap-1">
        <span
          data-metric
          className={cn(
            'font-mono text-[28px] font-semibold leading-none tracking-tight',
            TONE_VALUE[tone],
          )}
        >
          {value}
        </span>
        {unit ? <span className="font-mono text-sm font-medium text-zinc-400">{unit}</span> : null}
      </div>

      {caption ? (
        <p className="min-h-[2.25rem] text-[11px] leading-relaxed text-zinc-500">{caption}</p>
      ) : null}

      {footnote ? (
        <div className="mt-auto border-t border-zinc-200/80 pt-2 text-[11px] text-zinc-400">
          {footnote}
        </div>
      ) : null}
    </Card>
  );
}

import { cn } from '@/lib/utils';

export function Progress({
  value,
  className,
  barClassName,
}: {
  /** 0–1. */
  value: number;
  className?: string;
  barClassName?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-zinc-100', className)}
    >
      <div
        className={cn('h-full rounded-full bg-zinc-900 transition-all', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

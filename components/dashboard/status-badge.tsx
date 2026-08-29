import { AlertTriangle, CheckCircle2, CircleSlash, Clock, PackageX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  MILESTONE_LABEL,
  MILESTONE_SHORT,
  RISK_LABEL,
  type Milestone,
  type RiskStatus,
} from '@/lib/types';

const STATUS_STYLE: Record<
  RiskStatus,
  { variant: 'emerald' | 'rose' | 'amber' | 'zinc' | 'neutral'; Icon: typeof CheckCircle2 }
> = {
  OPTIMAL: { variant: 'emerald', Icon: CheckCircle2 },
  STALLED: { variant: 'amber', Icon: Clock },
  ERROR_BLOCKED: { variant: 'rose', Icon: AlertTriangle },
  SHELFWARE: { variant: 'amber', Icon: PackageX },
  CHURNED: { variant: 'zinc', Icon: CircleSlash },
};

export function StatusBadge({
  status,
  subStatus,
  className,
}: {
  status: RiskStatus;
  subStatus?: string | null;
  className?: string;
}) {
  const { variant, Icon } = STATUS_STYLE[status];
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <Badge variant={variant}>
        <Icon className="h-3 w-3" strokeWidth={2.25} />
        {RISK_LABEL[status]}
      </Badge>
      {subStatus ? (
        <Badge variant="amber" className="font-normal">
          {subStatus}
        </Badge>
      ) : null}
    </span>
  );
}

const MILESTONE_TONE: Record<Milestone, string> = {
  M0_PROVISIONED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  M1_CREATED: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  M2_TESTED: 'bg-zinc-800 text-white border-transparent',
  M3_ACTIVATED: 'bg-black text-white border-transparent',
  M4_CONSUMING: 'bg-emerald-600 text-white border-transparent',
};

export function MilestoneBadge({
  milestone,
  showLabel = true,
  className,
}: {
  milestone: Milestone;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4 tracking-tight',
        MILESTONE_TONE[milestone],
        className,
      )}
    >
      <span className="font-mono text-[10.5px]">{MILESTONE_SHORT[milestone]}</span>
      {showLabel ? MILESTONE_LABEL[milestone] : null}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: 'critical' | 'high' | 'medium' }) {
  const tone =
    severity === 'critical' ? 'bg-rose-500' : severity === 'high' ? 'bg-amber-500' : 'bg-zinc-400';
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-60', tone)} />
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', tone)} />
    </span>
  );
}

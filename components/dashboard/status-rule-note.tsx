import { Tooltip } from '@/components/ui/tooltip';
import { STALLED_RULES } from '@/lib/engine/rules';
import { RISK_LABEL, RISK_STATUSES, type RiskStatus } from '@/lib/types';

/**
 * Rules grouped by the status they assign, derived from the rule catalogue so
 * the explanation can never drift from what the engine actually evaluates.
 */
const RULES_BY_STATUS = RISK_STATUSES.reduce<Record<RiskStatus, typeof STALLED_RULES>>(
  (acc, status) => {
    acc[status] = STALLED_RULES.filter((rule) => rule.status === status);
    return acc;
  },
  {} as Record<RiskStatus, typeof STALLED_RULES>,
);

/** Most severe first — when several rules fire, the first of these wins. */
const PRECEDENCE: RiskStatus[] = ['CHURNED', 'ERROR_BLOCKED', 'SHELFWARE', 'STALLED'];

function RuleBody({ status }: { status: RiskStatus }) {
  const rules = RULES_BY_STATUS[status];

  if (rules.length === 0) {
    return (
      <span className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold tracking-tight text-zinc-900">
          {RISK_LABEL[status]}
        </span>
        <span className="text-[11px] leading-relaxed text-zinc-500">
          No detector rule has fired. That means nothing has tripped a threshold
          <em className="not-italic text-zinc-700"> yet</em> — a workspace created hours ago looks
          the same as one that has cleared every window.
        </span>
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-2">
      <span className="text-[12px] font-semibold tracking-tight text-zinc-900">
        {RISK_LABEL[status]}
      </span>
      {rules.map((rule) => (
        <span key={rule.id} className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] text-zinc-400">{rule.id}</span>
          <span className="text-[11px] leading-relaxed text-zinc-500">{rule.definition}</span>
        </span>
      ))}
    </span>
  );
}

/** Wraps a status row so hovering it reveals the rule that assigns it. */
export function StatusRuleNote({
  status,
  children,
}: {
  status: RiskStatus;
  children: React.ReactNode;
}) {
  return (
    <Tooltip
      content={<RuleBody status={status} />}
      side="top"
      align="end"
      width="w-80"
      className="w-full"
    >
      {children}
    </Tooltip>
  );
}

/** Explains the whole status model, for the "?" beside the card title. */
export function PortfolioHealthHelp() {
  return (
    <span className="flex flex-col gap-2.5">
      <span className="text-[11px] leading-relaxed text-zinc-500">
        Every workspace carries exactly one status, assigned by the detector rules. Hover a row to
        see the rule behind it.
      </span>
      <span className="flex flex-col gap-1.5 border-t border-zinc-200/80 pt-2">
        {PRECEDENCE.map((status, index) => (
          <span key={status} className="flex items-baseline justify-between gap-3">
            <span className="shrink-0 text-[11px] text-zinc-600">
              <span className="font-mono text-[10px] text-zinc-400">{index + 1}. </span>
              {RISK_LABEL[status]}
            </span>
            {/* Every rule that assigns this status — Stalled has more than one. */}
            <span className="text-right font-mono text-[10px] leading-relaxed text-zinc-400">
              {RULES_BY_STATUS[status].map((rule) => rule.id).join(' · ')}
            </span>
          </span>
        ))}
      </span>
      <span className="border-t border-zinc-200/80 pt-2 text-[11px] leading-relaxed text-zinc-500">
        When several rules fire, the most severe wins — that is the order above. A workspace with
        none of them is <span className="text-zinc-700">Optimal</span>.
      </span>
      <span className="text-[11px] leading-relaxed text-zinc-500">
        Status reflects the workspace and its lead agent only, so a failing secondary agent never
        downgrades an otherwise healthy account; it shows as an
        <span className="text-zinc-700"> agent stalled</span> sub-badge instead.
      </span>
    </span>
  );
}

'use client';

import * as React from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mail,
  MessageSquare,
  MonitorSmartphone,
  Send,
  Webhook,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MilestoneBadge, SeverityDot } from '@/components/dashboard/status-badge';
import { dispatchInterventionAction, dispatchPlaybookBatchAction } from '@/app/actions';
import { cn, formatPercent } from '@/lib/utils';
import type { InterventionCandidate, InterventionChannel } from '@/lib/types';

const CHANNEL_ICON: Record<InterventionChannel, typeof Mail> = {
  email: Mail,
  webhook: Webhook,
  in_app: MonitorSmartphone,
  slack: MessageSquare,
};

export interface SerializedCandidate {
  playbook: InterventionCandidate['playbook'];
  targets: Array<{
    workspaceId: string;
    workspaceName: string;
    tier: string;
    milestone: InterventionCandidate['workspaces'][number]['milestone'];
    reason: string;
    suppressed: boolean;
  }>;
}

export function InterventionCard({ candidate }: { candidate: SerializedCandidate }) {
  const { playbook, targets } = candidate;
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [busyWorkspace, setBusyWorkspace] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<Set<string>>(new Set());
  const [toast, setToast] = React.useState<string | null>(null);

  const ChannelIcon = CHANNEL_ICON[playbook.channel];
  const pendingTargets = targets.filter((t) => !t.suppressed && !sent.has(t.workspaceId));

  const dispatchOne = (workspaceId: string, reason: string) => {
    setBusyWorkspace(workspaceId);
    startTransition(async () => {
      const result = await dispatchInterventionAction(playbook.id, workspaceId, reason);
      setBusyWorkspace(null);
      setToast(result.message);
      if (result.ok) setSent((previous) => new Set(previous).add(workspaceId));
    });
  };

  const dispatchAll = () => {
    const entries = pendingTargets.map((t) => ({ workspaceId: t.workspaceId, reason: t.reason }));
    if (entries.length === 0) return;
    startTransition(async () => {
      const result = await dispatchPlaybookBatchAction(playbook.id, entries);
      setToast(result.message);
      if (result.ok) {
        setSent((previous) => {
          const next = new Set(previous);
          for (const entry of entries) next.add(entry.workspaceId);
          return next;
        });
      }
    });
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <SeverityDot severity={playbook.severity} />
              <Badge variant="neutral" mono>
                {playbook.trigger}
              </Badge>
              <Badge variant="outline">
                <ChannelIcon className="h-3 w-3" />
                {playbook.channel}
              </Badge>
            </div>
            <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-zinc-900">
              {playbook.title}
            </h3>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span data-metric className="font-mono text-2xl font-semibold leading-none text-zinc-900">
              {targets.length}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-zinc-400">accounts</span>
          </div>
        </div>

        <p className="text-[12px] leading-relaxed text-zinc-500">{playbook.description}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-zinc-400">
          <span>
            <span className="text-zinc-400">asset</span>{' '}
            <span className="text-zinc-600">{playbook.asset}</span>
          </span>
          <span>
            <span className="text-zinc-400">owner</span>{' '}
            <span className="text-zinc-600">{playbook.ownerRole}</span>
          </span>
          <span>
            <span className="text-zinc-400">expected lift</span>{' '}
            <span className="text-emerald-600">+{formatPercent(playbook.expectedLiftPct, 0)}</span>
          </span>
        </div>
      </CardHeader>

      <CardContent className="mt-auto flex flex-col gap-2.5 border-t border-zinc-200/80 pt-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-900"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {open ? 'Hide' : 'Show'} routed accounts
          </button>

          <Button onClick={dispatchAll} disabled={pending || pendingTargets.length === 0} size="sm">
            {pending && busyWorkspace === null ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Dispatch all ({pendingTargets.length})
          </Button>
        </div>

        {toast ? (
          <p className="rounded-lg border border-zinc-200/80 bg-zinc-50 px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed text-zinc-600">
            {toast}
          </p>
        ) : null}

        {open ? (
          <ul className="scrollbar-thin flex max-h-72 flex-col divide-y divide-zinc-200/70 overflow-y-auto rounded-lg border border-zinc-200/80">
            {targets.map((target) => {
              const done = target.suppressed || sent.has(target.workspaceId);
              return (
                <li
                  key={target.workspaceId}
                  className="flex items-start justify-between gap-3 px-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12px] font-medium tracking-tight text-zinc-900">
                        {target.workspaceName}
                      </span>
                      <Badge variant="neutral">{target.tier}</Badge>
                      <MilestoneBadge milestone={target.milestone} showLabel={false} />
                    </div>
                    <span className="font-mono text-[10px] leading-relaxed text-zinc-500">
                      {target.reason}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant={done ? 'secondary' : 'primary'}
                    disabled={done || pending}
                    onClick={() => dispatchOne(target.workspaceId, target.reason)}
                    className="shrink-0"
                  >
                    {busyWorkspace === target.workspaceId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : done ? (
                      <Check className={cn('h-3.5 w-3.5 text-emerald-600')} />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {done ? 'Sent' : 'Trigger'}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

'use client';

import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Search, Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { MilestoneBadge, StatusBadge } from '@/components/dashboard/status-badge';
import {
  DEPLOYMENT_LABEL,
  RISK_LABEL,
  RISK_STATUSES,
  type RiskStatus,
  type WorkspaceHealth,
} from '@/lib/types';
import { cn, formatDuration, formatNumber, formatPercent, formatRelative } from '@/lib/utils';

type SortKey = 'risk' | 'ttfv' | 'idle' | 'name';

const PAGE_SIZE = 20;

const RISK_ORDER: Record<RiskStatus, number> = {
  ERROR_BLOCKED: 0,
  STALLED: 1,
  SHELFWARE: 2,
  CHURNED: 3,
  OPTIMAL: 4,
};

export function WorkspaceTable({ healths }: { healths: WorkspaceHealth[] }) {
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<RiskStatus | 'ALL'>('ALL');
  const [sort, setSort] = React.useState<SortKey>('risk');
  const [page, setPage] = React.useState(0);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const counts = React.useMemo(() => {
    const map = Object.fromEntries(RISK_STATUSES.map((s) => [s, 0])) as Record<RiskStatus, number>;
    for (const health of healths) map[health.status] += 1;
    return map;
  }, [healths]);

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = healths.filter((health) => {
      if (status !== 'ALL' && health.status !== status) return false;
      if (!needle) return true;
      return (
        health.workspace.name.toLowerCase().includes(needle) ||
        health.workspace.id.toLowerCase().includes(needle) ||
        health.workspace.owner.toLowerCase().includes(needle) ||
        health.workspace.useCase.toLowerCase().includes(needle) ||
        health.agents.some((agent) => agent.agent.name.toLowerCase().includes(needle)) ||
        health.signals.some((signal) => signal.diagnostic.toLowerCase().includes(needle))
      );
    });

    return filtered.sort((a, b) => {
      switch (sort) {
        case 'ttfv':
          return (a.ttfvHours ?? Number.POSITIVE_INFINITY) - (b.ttfvHours ?? Number.POSITIVE_INFINITY);
        case 'idle':
          return b.hoursSinceLastEvent - a.hoursSinceLastEvent;
        case 'name':
          return a.workspace.name.localeCompare(b.workspace.name);
        case 'risk':
        default: {
          const byRisk = RISK_ORDER[a.status] - RISK_ORDER[b.status];
          if (byRisk !== 0) return byRisk;
          return b.hoursSinceLastEvent - a.hoursSinceLastEvent;
        }
      }
    });
  }, [healths, query, status, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  // Any change to the filters returns the reader to the first page.
  React.useEffect(() => {
    setPage(0);
  }, [query, status, sort]);

  const toggle = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            active={status === 'ALL'}
            onClick={() => setStatus('ALL')}
            label="All"
            count={healths.length}
          />
          {RISK_STATUSES.map((value) => (
            <FilterChip
              key={value}
              active={status === value}
              onClick={() => setStatus(value)}
              label={RISK_LABEL[value]}
              count={counts[value]}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search workspace, agent, owner, diagnostic…"
              className="h-8 w-full rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 lg:w-80"
            />
          </label>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/5"
            aria-label="Sort workspaces"
          >
            <option value="risk">Sort: risk</option>
            <option value="idle">Sort: idle time</option>
            <option value="ttfv">Sort: TTFV</option>
            <option value="name">Sort: name</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-xs">
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8 pl-4 pr-0" />
                <TableHead>Workspace</TableHead>
                <TableHead>Milestone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Agents</TableHead>
                <TableHead className="text-right">TTFV</TableHead>
                <TableHead className="text-right">Idle</TableHead>
                <TableHead className="pr-5">Root-cause diagnostic</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((health) => {
                const open = expanded.has(health.workspace.id);
                const diagnostic = health.signals[0]?.diagnostic ?? null;
                return (
                  <React.Fragment key={health.workspace.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => toggle(health.workspace.id)}
                    >
                      <TableCell className="pl-4 pr-0 align-middle">
                        {open ? (
                          <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
                        )}
                      </TableCell>
                      <TableCell className="align-middle">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[13px] font-medium tracking-tight text-zinc-900">
                            {health.workspace.name}
                          </span>
                          <span className="whitespace-nowrap font-mono text-[10.5px] text-zinc-400">
                            {health.workspace.id} · {health.workspace.tier ?? '—'} ·{' '}
                            {health.workspace.region ?? '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="align-middle">
                        <MilestoneBadge milestone={health.milestone} />
                      </TableCell>
                      <TableCell className="align-middle">
                        <StatusBadge status={health.status} subStatus={health.subStatus} />
                      </TableCell>
                      <TableCell className="align-middle">
                        <span className="font-mono text-[11px] text-zinc-600">
                          {health.activeAgentCount} live
                          <span className="text-zinc-300"> / </span>
                          {health.draftAgentCount} draft
                        </span>
                      </TableCell>
                      <TableCell className="text-right align-middle">
                        <span data-metric className="font-mono text-[11px] text-zinc-700">
                          {formatDuration(health.ttfvHours)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right align-middle">
                        <span
                          data-metric
                          className={cn(
                            'font-mono text-[11px]',
                            health.hoursSinceLastEvent > 48 ? 'text-rose-600' : 'text-zinc-500',
                          )}
                        >
                          {formatDuration(health.hoursSinceLastEvent)}
                        </span>
                      </TableCell>
                      <TableCell className="pr-5 align-middle">
                        {diagnostic ? (
                          <span className="flex items-start gap-1.5">
                            <Terminal className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                            <span className="font-mono text-[10.5px] leading-relaxed text-rose-700">
                              {diagnostic}
                            </span>
                          </span>
                        ) : (
                          <span className="font-mono text-[10.5px] text-emerald-600">
                            No blockers detected
                          </span>
                        )}
                      </TableCell>
                    </TableRow>

                    {open ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="bg-zinc-50/60 px-5 py-4">
                          <AgentBreakdown health={health} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })}

              {visible.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="px-5 py-10 text-center text-xs text-zinc-400">
                    No workspaces match this filter.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableWrapper>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-[10.5px] text-zinc-400">
          {rows.length === 0
            ? 'no matches'
            : `${formatNumber(currentPage * PAGE_SIZE + 1)}–${formatNumber(
                currentPage * PAGE_SIZE + visible.length,
              )} of ${formatNumber(rows.length)}`}{' '}
          workspaces · click a row to expand its agent roster
        </p>

        {pageCount > 1 ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              disabled={currentPage === 0}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <span className="font-mono text-[10.5px] text-zinc-400">
              page {currentPage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              disabled={currentPage >= pageCount - 1}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium tracking-tight transition-colors',
        active
          ? 'border-transparent bg-black text-white shadow-xs'
          : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50',
      )}
    >
      {label}
      <span
        className={cn(
          'font-mono text-[10px]',
          active ? 'text-zinc-300' : 'text-zinc-400',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function AgentBreakdown({ health }: { health: WorkspaceHealth }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10.5px] text-zinc-500">
        <span>
          <span className="text-zinc-400">owner</span> {health.workspace.owner}
        </span>
        <span>
          <span className="text-zinc-400">use case</span> {health.workspace.useCase}
        </span>
        <span>
          <span className="text-zinc-400">seats</span> {health.workspace.seats ?? '—'}
        </span>
        <span>
          <span className="text-zinc-400">signup</span> {health.workspace.createdAt.slice(0, 10)}
        </span>
        <span>
          <span className="text-zinc-400">age</span> {formatDuration(health.ageHours)}
        </span>
        <span>
          <span className="text-zinc-400">live conversations</span>{' '}
          {formatNumber(health.totalLiveConversations)}
        </span>
        <span>
          <span className="text-zinc-400">last event</span>{' '}
          {health.lastEventAt ? formatRelative(health.lastEventAt) : 'never'}
        </span>
      </div>

      {health.agents.length === 0 ? (
        <p className="font-mono text-[11px] text-amber-700">
          No Conversational Agent has ever been created in this workspace.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          {health.agents.map((agent) => (
            <div
              key={agent.agent.id}
              className={cn(
                'flex flex-col gap-2 rounded-lg border bg-white p-3',
                agent.isStalled ? 'border-rose-200/80' : 'border-zinc-200/80',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-medium tracking-tight text-zinc-900">
                    {agent.agent.name}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400">{agent.agent.id}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <MilestoneBadge milestone={agent.milestone} showLabel={false} />
                  <Badge variant={agent.agent.isDraft ? 'neutral' : 'emerald'}>
                    {agent.agent.isDraft ? 'Draft' : DEPLOYMENT_LABEL[agent.agent.deploymentSurface]}
                  </Badge>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10.5px] text-zinc-600 sm:grid-cols-3">
                <Field label="voice" value={agent.agent.voiceName ?? '—'} />
                <Field label="voice_id" value={agent.agent.voiceId.slice(0, 12)} />
                <Field label="llm" value={agent.agent.llmModel ?? '—'} />
                <Field label="preset" value={agent.agent.latencyPreset ?? '—'} />
                <Field
                  label="latency_p50"
                  value={agent.agent.medianLatencyMs ? `${agent.agent.medianLatencyMs}ms` : '—'}
                  tone={
                    agent.agent.medianLatencyMs && agent.agent.medianLatencyMs > 900
                      ? 'warn'
                      : undefined
                  }
                />
                <Field label="live_calls" value={formatNumber(agent.agent.liveConversations)} />
                <Field label="active_days" value={String(agent.agent.distinctActiveDays)} />
                <Field
                  label="credits"
                  value={formatPercent(agent.agent.creditConsumptionPct, 0)}
                />
                <Field label="idle" value={formatDuration(agent.hoursSinceLastEvent)} />
              </dl>

              {agent.consecutiveTestFailures > 0 || agent.lastErrorCode ? (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-200/80 pt-2">
                  {agent.consecutiveTestFailures > 0 ? (
                    <Badge variant="rose" mono>
                      {agent.consecutiveTestFailures}x consecutive test failures
                    </Badge>
                  ) : null}
                  {agent.lastErrorCode ? (
                    <Badge variant="zinc" mono>
                      {agent.lastErrorCode}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {health.signals.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-200/80 bg-white p-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Fired rules
          </span>
          <ul className="flex flex-col gap-1">
            {health.signals.map((signal, index) => (
              <li key={`${signal.ruleId}-${index}`} className="flex items-start gap-2">
                <Badge
                  variant={
                    signal.severity === 'critical'
                      ? 'rose'
                      : signal.severity === 'high'
                        ? 'amber'
                        : 'neutral'
                  }
                  mono
                >
                  {signal.ruleId}
                </Badge>
                <span className="font-mono text-[10.5px] leading-relaxed text-zinc-600">
                  {signal.agentName ? (
                    <span className="text-zinc-400">{signal.agentName} · </span>
                  ) : null}
                  {signal.diagnostic}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[9.5px] uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className={cn('truncate', tone === 'warn' ? 'text-amber-600' : 'text-zinc-700')}>
        {value}
      </dd>
    </div>
  );
}

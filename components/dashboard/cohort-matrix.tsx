import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { cn, formatDuration, formatPercent } from '@/lib/utils';
import type { CohortRow } from '@/lib/types';

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="font-mono text-[11px] text-zinc-300">—</span>;
  }
  if (Math.abs(delta) < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400">
        <Minus className="h-3 w-3" /> flat
      </span>
    );
  }
  const faster = delta < 0;
  const Icon = faster ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-[11px]',
        faster ? 'text-emerald-600' : 'text-rose-600',
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {faster ? '' : '+'}
      {delta.toFixed(1)}h
    </span>
  );
}

/** Heat intensity for the conversion columns — monochrome, no rainbow. */
function RateCell({ rate, accent = false }: { rate: number; accent?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-100">
        <span
          className={cn('block h-full rounded-full', accent ? 'bg-emerald-600' : 'bg-zinc-900')}
          style={{ width: `${Math.round(rate * 100)}%` }}
        />
      </span>
      <span data-metric className="font-mono text-[11px] text-zinc-700">
        {formatPercent(rate, 0)}
      </span>
    </span>
  );
}

export function CohortMatrix({ cohorts }: { cohorts: CohortRow[] }) {
  const rows = [...cohorts].reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cohort TTFV matrix</CardTitle>
        <CardDescription>
          Weekly signup cohorts compared on activation velocity. A negative TTFV delta means the
          cohort reached its aha moment faster than the week before — a positive delta is a friction
          surge worth diagnosing.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Cohort week</TableHead>
                <TableHead className="text-right">Workspaces</TableHead>
                <TableHead className="text-right">P50 TTFV</TableHead>
                <TableHead className="text-right">P90 TTFV</TableHead>
                <TableHead>Δ vs prev</TableHead>
                <TableHead>Tested</TableHead>
                <TableHead>Activated</TableHead>
                <TableHead>Consuming</TableHead>
                <TableHead className="text-right">Time to M3</TableHead>
                <TableHead className="text-right">Time to M4</TableHead>
                <TableHead className="pr-5 text-right">At risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.week}>
                  <TableCell className="pl-5 align-middle">
                    <span className="font-mono text-[11px] text-zinc-900">{row.week}</span>
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <span data-metric className="font-mono text-[11px] text-zinc-700">
                      {row.workspaces}
                    </span>
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <span data-metric className="font-mono text-[11px] font-medium text-zinc-900">
                      {formatDuration(row.medianTtfvHours)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <span data-metric className="font-mono text-[11px] text-zinc-500">
                      {formatDuration(row.p90TtfvHours)}
                    </span>
                  </TableCell>
                  <TableCell className="align-middle">
                    <DeltaCell delta={row.ttfvDeltaHours} />
                  </TableCell>
                  <TableCell className="align-middle">
                    <RateCell rate={row.testedRate} />
                  </TableCell>
                  <TableCell className="align-middle">
                    <RateCell rate={row.activationRate} />
                  </TableCell>
                  <TableCell className="align-middle">
                    <RateCell rate={row.consumingRate} accent />
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <span data-metric className="font-mono text-[11px] text-zinc-500">
                      {formatDuration(row.medianTimeToActivationHours)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <span data-metric className="font-mono text-[11px] text-zinc-500">
                      {formatDuration(row.medianTimeToConsumingHours)}
                    </span>
                  </TableCell>
                  <TableCell className="pr-5 text-right align-middle">
                    <span
                      data-metric
                      className={cn(
                        'font-mono text-[11px]',
                        row.atRisk > 0 ? 'text-rose-600' : 'text-zinc-400',
                      )}
                    >
                      {row.atRisk}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      </CardContent>
    </Card>
  );
}

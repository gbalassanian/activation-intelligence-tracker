'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Boxes,
  Check,
  Layers,
  Loader2,
  PackageX,
  RotateCcw,
  Rocket,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { resetDatasetAction, runScenarioAction } from '@/app/actions';
import { cn } from '@/lib/utils';
import type { ScenarioId } from '@/lib/types';

interface ScenarioButton {
  id: ScenarioId;
  label: string;
  detail: string;
  expectation: string;
  Icon: typeof Rocket;
}

const SCENARIO_BUTTONS: ScenarioButton[] = [
  {
    id: 'HAPPY_PATH',
    label: 'Simulate happy path',
    detail: 'M0 → M4 in 5 days',
    expectation:
      'Provisioned, agent created, tested, deployed, and graduated to Consuming through the >40% credit-consumption gate.',
    Icon: Rocket,
  },
  {
    id: 'MULTI_AGENT',
    label: 'Simulate multi-agent workspace',
    detail: '1 Consuming + 1 stalled draft',
    expectation:
      'Workspace stays at M4 Consuming on the highest-milestone rule and shows the "Active (1 agent stalled)" sub-badge.',
    Icon: Layers,
  },
  {
    id: 'SHELFWARE',
    label: 'Simulate shelfware account',
    detail: 'Activated, ~0 consumption',
    expectation:
      'Deployed weeks ago but never scaled — flagged Shelfware and routed to the telephony scaling playbook.',
    Icon: PackageX,
  },
  {
    id: 'ERROR_BLOCKED',
    label: 'Simulate error-blocked agent',
    detail: '3+ consecutive test failures',
    expectation:
      'Every test conversation fails — flagged Error Blocked with the ElevenLabs error code in the diagnostic.',
    Icon: AlertTriangle,
  },
  {
    id: 'BATCH_100',
    label: 'Batch generate 100 workspaces',
    detail: 'Full archetype mix, 10 cohorts',
    expectation:
      'One hundred realistic customer workspaces and multi-agent configurations spread across the last ten signup weeks.',
    Icon: Boxes,
  },
];

interface LogEntry {
  id: number;
  scenario: string;
  message: string;
  ok: boolean;
  at: string;
}

export function SimulatorPanel() {
  const [pending, startTransition] = React.useTransition();
  const [running, setRunning] = React.useState<string | null>(null);
  const [log, setLog] = React.useState<LogEntry[]>([]);
  const counter = React.useRef(0);

  const append = (scenario: string, message: string, ok: boolean) => {
    counter.current += 1;
    setLog((previous) =>
      [
        {
          id: counter.current,
          scenario,
          message,
          ok,
          at: new Date().toISOString().slice(11, 19),
        },
        ...previous,
      ].slice(0, 12),
    );
  };

  const run = (scenario: ScenarioId, label: string) => {
    setRunning(scenario);
    startTransition(async () => {
      const result = await runScenarioAction(scenario);
      setRunning(null);
      append(label, result.message, result.ok);
    });
  };

  const reset = () => {
    setRunning('RESET');
    startTransition(async () => {
      const result = await resetDatasetAction();
      setRunning(null);
      append('Reset dataset', result.message, result.ok);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-3">
        {SCENARIO_BUTTONS.map(({ id, label, detail, expectation, Icon }) => (
          <Card key={id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium tracking-tight text-zinc-900">
                  {label}
                </span>
                <Badge variant="neutral" mono>
                  {detail}
                </Badge>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">{expectation}</p>
            </div>
            <Button
              onClick={() => run(id, label)}
              disabled={pending}
              className="shrink-0 self-start sm:self-auto"
            >
              {running === id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              Generate
            </Button>
          </Card>
        ))}

        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <RotateCcw className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-medium tracking-tight text-zinc-900">
              Reset dataset
            </span>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Drops every workspace, agent, telemetry event, and audit entry, then regenerates the
              120-workspace baseline from the deterministic seed.
            </p>
          </div>
          <Button
            variant="danger"
            onClick={reset}
            disabled={pending}
            className="shrink-0 self-start sm:self-auto"
          >
            {running === 'RESET' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Reset
          </Button>
        </Card>
      </div>

      <Card className="flex h-full flex-col">
        <CardHeader>
          <CardTitle>Generation log</CardTitle>
          <CardDescription>
            Results of scenarios run in this session. Dashboards revalidate immediately after each
            run.
          </CardDescription>
        </CardHeader>
        <CardContent className="scrollbar-thin flex-1 overflow-y-auto px-0 pb-0">
          {log.length === 0 ? (
            <p className="px-5 pb-6 text-xs leading-relaxed text-zinc-400">
              No scenarios run yet. Generate one and the funnel, live feed, and intervention queue
              update on the next navigation.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200/70">
              {log.map((entry) => (
                <li key={entry.id} className="flex gap-2.5 px-5 py-3">
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                      entry.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
                    )}
                  >
                    {entry.ok ? (
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    ) : (
                      <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[12px] font-medium tracking-tight text-zinc-900">
                        {entry.scenario}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400">{entry.at}</span>
                    </span>
                    <span className="font-mono text-[10px] leading-relaxed text-zinc-500">
                      {entry.message}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

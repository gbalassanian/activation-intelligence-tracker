import Link from 'next/link';
import { Database } from 'lucide-react';
import { MobileNav, Sidebar } from '@/components/layout/sidebar';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SimulatorPanel } from '@/components/dashboard/simulator-panel';
import { getDashboardState, getRecentEvents } from '@/lib/store';
import { countEvents } from '@/lib/db/repository';
import { MILESTONE_DESCRIPTION, MILESTONES, MILESTONE_LABEL, MILESTONE_SHORT } from '@/lib/types';
import { formatNumber, formatRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default function SimulatorPage() {
  const { metrics } = getDashboardState();
  const recent = getRecentEvents(1);
  const eventCount = countEvents();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6">
            <PageHeader
              eyebrow="Interactive Telemetry Simulator"
              title="Synthetic event generator"
              description="Developer panel for producing realistic ElevenLabs onboarding telemetry. Every scenario writes immutable events into the local SQLite log; milestones, TTFV, risk status, and intervention routing are then recomputed from that log on the next read."
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" mono>
                    <Database className="h-3 w-3" />
                    {formatNumber(metrics.totalWorkspaces)} workspaces ·{' '}
                    {formatNumber(metrics.totalAgents)} agents ·{' '}
                    {formatNumber(eventCount)} events
                  </Badge>
                  {recent[0] ? (
                    <Badge variant="neutral" mono>
                      last event {formatRelative(recent[0].timestamp)}
                    </Badge>
                  ) : null}
                </div>
              }
            />

            <SimulatorPanel />

            <Card>
              <CardHeader>
                <CardTitle>Milestone definitions</CardTitle>
                <CardDescription>
                  The gates each generated agent must clear. A workspace&apos;s funnel stage is the
                  highest milestone reached by any of its agents.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                {MILESTONES.map((milestone) => (
                  <div
                    key={milestone}
                    className="flex flex-col gap-1.5 rounded-lg border border-zinc-200/80 p-3"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-zinc-400">
                        {MILESTONE_SHORT[milestone]}
                      </span>
                      <span className="text-[12px] font-medium tracking-tight text-zinc-900">
                        {MILESTONE_LABEL[milestone]}
                      </span>
                    </span>
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      {MILESTONE_DESCRIPTION[milestone]}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <p className="text-[11px] text-zinc-400">
              After generating, review the results in the{' '}
              <Link href="/dashboard/funnel" className="text-zinc-600 underline underline-offset-2">
                funnel view
              </Link>
              ,{' '}
              <Link
                href="/dashboard/live-feed"
                className="text-zinc-600 underline underline-offset-2"
              >
                live feed
              </Link>
              , or{' '}
              <Link
                href="/dashboard/interventions"
                className="text-zinc-600 underline underline-offset-2"
              >
                intervention center
              </Link>
              .
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

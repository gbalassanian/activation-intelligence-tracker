import { AlertTriangle, Clock, PackageX, Radio } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WorkspaceTable } from '@/components/dashboard/workspace-table';
import { EventStream } from '@/components/dashboard/event-stream';
import { getRecentEvents, getWorkspaceHealths } from '@/lib/store';
import { STALLED_RULES, RULE_THRESHOLDS } from '@/lib/engine/rules';
import { formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default function LiveFeedPage() {
  const healths = getWorkspaceHealths();
  const events = getRecentEvents(50);

  const errorBlocked = healths.filter((h) => h.status === 'ERROR_BLOCKED').length;
  const stalled = healths.filter((h) => h.status === 'STALLED').length;
  const shelfware = healths.filter((h) => h.status === 'SHELFWARE').length;
  const agentsStalled = healths.reduce((sum, h) => sum + h.stalledAgentCount, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Live At-Risk & Agent Feed"
        title="Workspace operations"
        description="Every customer workspace with its agent roster, resolved milestone, and machine-generated root-cause diagnostic. Secondary agent failures never downgrade an otherwise healthy workspace — they surface as a sub-status badge instead."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="rose" mono>
              <AlertTriangle className="h-3 w-3" /> {errorBlocked} error blocked
            </Badge>
            <Badge variant="amber" mono>
              <Clock className="h-3 w-3" /> {stalled} stalled
            </Badge>
            <Badge variant="amber" mono>
              <PackageX className="h-3 w-3" /> {shelfware} shelfware
            </Badge>
            <Badge variant="neutral" mono>
              <Radio className="h-3 w-3" /> {formatNumber(agentsStalled)} agents stalled
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <WorkspaceTable healths={healths} />
        </div>
        <div className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          <EventStream events={events} />

          <Card>
            <CardHeader>
              <CardTitle>Detector rules</CardTitle>
              <CardDescription>
                Thresholds the stalled-account engine evaluates on every read.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {STALLED_RULES.map((rule) => (
                <div key={rule.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={
                        rule.severity === 'critical'
                          ? 'rose'
                          : rule.severity === 'high'
                            ? 'amber'
                            : 'neutral'
                      }
                      mono
                    >
                      {rule.id}
                    </Badge>
                  </div>
                  <p className="text-[11px] leading-relaxed text-zinc-500">{rule.definition}</p>
                </div>
              ))}
              <p className="border-t border-zinc-200/80 pt-2.5 font-mono text-[10px] leading-relaxed text-zinc-400">
                gates · M2 test &gt;{RULE_THRESHOLDS.testDurationSeconds}s ·{' '}
                M3 ≥{RULE_THRESHOLDS.activationConversations} live calls ·{' '}
                M4 ≥{RULE_THRESHOLDS.consumingConversations} calls /{' '}
                ≥{RULE_THRESHOLDS.consumingActiveDays} active days or &gt;
                {Math.round(RULE_THRESHOLDS.consumingCreditPct * 100)}% credits
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

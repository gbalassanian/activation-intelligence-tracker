import { History, Target, Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  InterventionCard,
  type SerializedCandidate,
} from '@/components/dashboard/intervention-card';
import { getInterventionState } from '@/lib/store';
import { suppressionKey } from '@/lib/engine/interventions';
import { formatNumber, formatTimestamp } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default function InterventionsPage() {
  const { candidates, auditLog, suppressed, totalTargets } = getInterventionState();

  const serialized: SerializedCandidate[] = candidates.map((candidate) => ({
    playbook: candidate.playbook,
    targets: candidate.workspaces.map((health) => ({
      workspaceId: health.workspace.id,
      workspaceName: health.workspace.name,
      tier: health.workspace.tier,
      milestone: health.milestone,
      reason: candidate.reasons[health.workspace.id] ?? candidate.playbook.trigger,
      suppressed: suppressed.has(suppressionKey(candidate.playbook.id, health.workspace.id)),
    })),
  }));

  const queuedDispatches = serialized.reduce(
    (sum, candidate) => sum + candidate.targets.filter((t) => !t.suppressed).length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Proactive Intervention Center"
        title="Remediation playbooks"
        description="Every fired rule is routed to the ElevenLabs playbook that addresses its blocker. Triggering a playbook dispatches a mock webhook, email, or Slack event and appends it to the audit log; accounts contacted in the last 7 days are suppressed automatically."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" mono>
              <Target className="h-3 w-3" /> {formatNumber(totalTargets)} accounts routed
            </Badge>
            <Badge variant="solid" mono>
              <Zap className="h-3 w-3" /> {formatNumber(queuedDispatches)} dispatches queued
            </Badge>
          </div>
        }
      />

      {serialized.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium tracking-tight text-zinc-900">
              No interventions required.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Every workspace is progressing without a fired rule.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {serialized.map((candidate) => (
            <InterventionCard key={candidate.playbook.id} candidate={candidate} />
          ))}
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-zinc-400" />
            Dispatch audit log
          </CardTitle>
          <CardDescription>
            Append-only record of every remediation action taken from this console.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {auditLog.length === 0 ? (
            <p className="px-5 pb-6 text-xs text-zinc-400">
              No interventions dispatched yet. Trigger a playbook above to write the first audit
              entry.
            </p>
          ) : (
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Dispatched</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Playbook</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="pr-5">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="whitespace-nowrap pl-5 align-middle">
                        <span className="font-mono text-[10.5px] text-zinc-500">
                          {formatTimestamp(record.dispatchedAt)}
                        </span>
                      </TableCell>
                      <TableCell className="align-middle">
                        <div className="flex flex-col">
                          <span className="text-[12px] font-medium tracking-tight text-zinc-900">
                            {record.workspaceName}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-400">
                            {record.workspaceId}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="align-middle">
                        <Badge variant="neutral" mono>
                          {record.interventionId}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-middle">
                        <span className="font-mono text-[10.5px] text-zinc-600">
                          {record.channel}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[280px] align-middle">
                        <span className="block truncate font-mono text-[10px] text-zinc-500">
                          {record.target}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[320px] pr-5 align-middle">
                        <span className="block truncate font-mono text-[10px] text-zinc-500">
                          {record.note}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

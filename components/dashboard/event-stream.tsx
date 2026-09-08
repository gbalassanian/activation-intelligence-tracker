import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatRelative } from '@/lib/utils';
import { MILESTONE_SHORT, type EventStatus, type TelemetryEvent } from '@/lib/types';

const STATUS_TONE: Record<EventStatus, string> = {
  success: 'text-emerald-600',
  error: 'text-rose-600',
  warning: 'text-amber-600',
};

const STATUS_MARK: Record<EventStatus, string> = {
  success: 'bg-emerald-500',
  error: 'bg-rose-500',
  warning: 'bg-amber-500',
};

function detailFor(event: TelemetryEvent): string {
  const meta = event.metadata ?? {};
  if (meta.errorDetails) return String(meta.errorDetails);
  if (typeof meta.conversationCount === 'number') return `${meta.conversationCount} calls`;
  if (typeof meta.durationSeconds === 'number') return `${meta.durationSeconds}s`;
  if (typeof meta.creditsUsed === 'number') return `${meta.creditsUsed.toLocaleString()} credits`;
  if (meta.deploymentSurface) return String(meta.deploymentSurface);
  if (meta.llmModel) return String(meta.llmModel);
  if (meta.voiceName) return String(meta.voiceName);
  return '';
}

export function EventStream({
  events,
  scopeLabel,
}: {
  events: TelemetryEvent[];
  scopeLabel?: string;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-500" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live telemetry stream
        </CardTitle>
        <CardDescription>
          Most recent immutable events ingested across {scopeLabel ?? 'all workspaces'}.
        </CardDescription>
      </CardHeader>
      <CardContent className="scrollbar-thin max-h-[560px] overflow-y-auto px-0 pb-0">
        <ul className="divide-y divide-zinc-200/70">
          {events.map((event) => {
            const detail = detailFor(event);
            return (
              <li key={event.id} className="flex items-start gap-2.5 px-5 py-2.5">
                <span
                  className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', STATUS_MARK[event.status])}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        'truncate font-mono text-[10.5px] font-medium',
                        STATUS_TONE[event.status],
                      )}
                    >
                      {event.eventType}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                      {formatRelative(event.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
                    <span className="text-zinc-500">{MILESTONE_SHORT[event.milestone]}</span>
                    <span className="truncate">{event.agentId ?? event.workspaceId}</span>
                  </div>
                  {detail ? (
                    <span
                      className={cn(
                        'truncate font-mono text-[10px]',
                        event.status === 'error' ? 'text-rose-500' : 'text-zinc-500',
                      )}
                    >
                      {detail}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
          {events.length === 0 ? (
            <li className="px-5 py-8 text-center text-xs text-zinc-400">No telemetry yet.</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

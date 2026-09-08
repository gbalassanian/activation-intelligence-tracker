import Link from 'next/link';
import { Database, Layers, Sparkles } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { SOURCE_SCOPES, type SourceScope } from '@/lib/types';

const SCOPE_META: Record<SourceScope, { label: string; Icon: typeof Layers; hint: string }> = {
  all: {
    label: 'All',
    Icon: Layers,
    hint: 'Synthetic and connected accounts combined — aggregate metrics blend both.',
  },
  synthetic: {
    label: 'Synthetic',
    Icon: Sparkles,
    hint: 'Generated telemetry only. Proves the engine works; says nothing about real customers.',
  },
  elevenlabs: {
    label: 'Real',
    Icon: Database,
    hint: 'Workspaces ingested from a connected ElevenLabs account.',
  },
};

/**
 * Scopes every view to one telemetry source. Rendered server-side and driven by
 * the `source` query param so the choice survives navigation between views.
 */
export function SourceFilter({
  scope,
  counts,
}: {
  scope: SourceScope;
  counts: Record<SourceScope, number>;
}) {
  const blended = scope === 'all' && counts.synthetic > 0 && counts.elevenlabs > 0;

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5 shadow-xs">
        {SOURCE_SCOPES.map((value) => {
          const { label, Icon, hint } = SCOPE_META[value];
          const active = value === scope;
          return (
            <Link
              key={value}
              href={`?source=${value}`}
              scroll={false}
              title={hint}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium tracking-tight transition-colors',
                active
                  ? 'bg-black text-white shadow-xs'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              {label}
              <span
                className={cn('font-mono text-[10px]', active ? 'text-zinc-300' : 'text-zinc-400')}
              >
                {formatNumber(counts[value])}
              </span>
            </Link>
          );
        })}
      </div>

      {blended ? (
        <p className="font-mono text-[10px] text-amber-600">
          metrics blend {formatNumber(counts.synthetic)} synthetic + {formatNumber(counts.elevenlabs)} real
        </p>
      ) : null}
    </div>
  );
}

/** Shown when a scope has no workspaces yet. */
export function EmptyScope({ scope }: { scope: SourceScope }) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white px-6 py-12 text-center shadow-xs">
      <p className="text-sm font-medium tracking-tight text-zinc-900">
        {scope === 'elevenlabs'
          ? 'No ElevenLabs workspace connected yet'
          : 'No workspaces in this view'}
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-zinc-500">
        {scope === 'elevenlabs'
          ? 'Connect an ElevenLabs account to ingest its agents and conversations as telemetry events. Until then, this view stays empty rather than showing synthetic numbers under a real label.'
          : 'Generate a scenario from the telemetry simulator to populate this view.'}
      </p>
    </div>
  );
}

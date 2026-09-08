'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Activity, AudioLines, GitBranch, Radio, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  {
    href: '/dashboard/funnel',
    label: 'Executive & Cohorts',
    description: 'TTFV, funnel, weekly velocity',
    Icon: GitBranch,
  },
  {
    href: '/dashboard/live-feed',
    label: 'Live At-Risk Feed',
    description: 'Workspaces, agents, diagnostics',
    Icon: Radio,
  },
  {
    href: '/dashboard/interventions',
    label: 'Intervention Center',
    description: 'Playbooks and dispatch log',
    Icon: Zap,
  },
  {
    href: '/simulator',
    label: 'Telemetry Simulator',
    description: 'Generate synthetic events',
    Icon: Activity,
  },
];

/** Keeps the active source scope on every nav link so it survives navigation. */
function useScopeSuffix(): string {
  const source = useSearchParams().get('source');
  return source && source !== 'all' ? `?source=${source}` : '';
}

export function Sidebar() {
  const pathname = usePathname();
  const suffix = useScopeSuffix();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-200/80 bg-white lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
          <AudioLines className="h-4 w-4 text-white" strokeWidth={2.25} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold tracking-tight text-zinc-900">
            Activation Tracker
          </span>
          <span className="text-[11px] text-zinc-500">ElevenLabs Adoption Ops</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map(({ href, label, description, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={`${href}${suffix}`}
              className={cn(
                'group flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                active ? 'bg-zinc-100' : 'hover:bg-zinc-50',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  active ? 'text-zinc-900' : 'text-zinc-400 group-hover:text-zinc-600',
                )}
                strokeWidth={2}
              />
              <span className="flex flex-col leading-tight">
                <span
                  className={cn(
                    'text-[13px] font-medium tracking-tight',
                    active ? 'text-zinc-900' : 'text-zinc-600 group-hover:text-zinc-900',
                  )}
                >
                  {label}
                </span>
                <span className="text-[11px] text-zinc-400">{description}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200/80 px-5 py-4">
        <p className="text-[11px] leading-relaxed text-zinc-400">
          Milestones{' '}
          <span className="font-mono text-zinc-500">M0 → M4</span> resolved on the highest-milestone
          rule across every agent in a workspace.
        </p>
      </div>
    </aside>
  );
}

/** Compact horizontal nav shown below the lg breakpoint. */
export function MobileNav() {
  const pathname = usePathname();
  const suffix = useScopeSuffix();
  return (
    <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-zinc-200/80 bg-white px-4 py-2 lg:hidden">
      {NAV.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={`${href}${suffix}`}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium tracking-tight transition-colors',
              active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-50',
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  width?: string;
}

/**
 * CSS-only hover/focus tooltip. Avoids pulling in a popover runtime for what
 * is, throughout this app, a static diagnostic panel.
 */
export function Tooltip({
  content,
  children,
  className,
  side = 'top',
  align = 'center',
  width = 'w-72',
}: TooltipProps) {
  return (
    <span className={cn('group/tt relative inline-flex', className)} tabIndex={0}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-40 hidden rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-lg group-hover/tt:block group-focus/tt:block',
          width,
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          align === 'start' && 'left-0',
          align === 'center' && 'left-1/2 -translate-x-1/2',
          align === 'end' && 'right-0',
        )}
      >
        {content}
      </span>
    </span>
  );
}

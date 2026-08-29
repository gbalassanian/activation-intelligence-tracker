import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4 tracking-tight whitespace-nowrap transition-colors',
  {
    variants: {
      variant: {
        solid: 'border-transparent bg-black text-white',
        neutral: 'border-zinc-200 bg-zinc-50 text-zinc-600',
        outline: 'border-zinc-200 bg-white text-zinc-700',
        emerald: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
        rose: 'border-rose-200/70 bg-rose-50 text-rose-700',
        amber: 'border-amber-200/70 bg-amber-50 text-amber-700',
        zinc: 'border-zinc-300 bg-zinc-100 text-zinc-700',
      },
      mono: {
        true: 'font-mono text-[10.5px]',
        false: '',
      },
    },
    defaultVariants: { variant: 'neutral', mono: false },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, mono, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, mono }), className)} {...props} />;
}

export { badgeVariants };

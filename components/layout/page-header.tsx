import { cn } from '@/lib/utils';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 border-b border-zinc-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        {eyebrow ? (
          <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {description ? (
          <p className="max-w-3xl text-[13px] leading-relaxed text-zinc-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

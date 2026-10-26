import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: I,
  title,
  text,
  action,
  className,
}: {
  icon?: Icon;
  title: string;
  text?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-surface/50 px-6 py-14 text-center',
        className,
      )}
    >
      {I ? (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-gold-600">
          <I size={24} weight="light" />
        </div>
      ) : null}
      <div className="font-serif text-lg font-semibold text-heading">{title}</div>
      {text ? <p className="mt-1 max-w-sm text-sm text-muted">{text}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} />;
}

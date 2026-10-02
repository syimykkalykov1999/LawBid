'use client';

import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Segmented tabs with a sliding pill (motion layoutId). */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
  size = 'default',
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: React.ReactNode; count?: number | null }[];
  className?: string;
  size?: 'default' | 'sm';
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      className={cn('inline-flex flex-wrap items-center gap-1 rounded-[14px] border border-line bg-surface-2 p-1', className)}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'relative rounded-[10px] font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              active ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {active ? (
              <motion.span
                layoutId={`tab-${id}`}
                className="absolute inset-0 rounded-[10px] border border-line bg-surface shadow-card"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            ) : null}
            <span className="relative z-10 flex items-center gap-1.5">
              {it.label}
              {it.count != null && it.count > 0 ? (
                <span className="rounded-full bg-accent-soft px-1.5 text-[10px] font-semibold text-gold-600">{it.count}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

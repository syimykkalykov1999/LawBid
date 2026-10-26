'use client';

import type { Icon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { cn } from '@/lib/utils';

/** Compact KPI chip for the inbox header. `text` replaces the number (e.g. "12 мин"). */
export function KpiChip({
  icon: I,
  label,
  value,
  text,
  i,
  accent,
  onClick,
}: {
  icon: Icon;
  label: string;
  value?: number;
  text?: string;
  i: number;
  accent?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3 text-left shadow-card transition-colors',
          onClick && 'hover:border-gold/50',
        )}
      >
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
            accent ? 'bg-accent-soft text-gold-600' : 'bg-surface-2 text-faint',
          )}
        >
          <I size={18} weight="light" />
        </span>
        <span className="min-w-0">
          <span className="block text-xl leading-tight font-semibold tracking-tight text-heading tabular-nums">
            {text ?? <AnimatedNumber value={value ?? 0} />}
          </span>
          <span className="block truncate text-xs text-muted">{label}</span>
        </span>
      </Tag>
    </motion.div>
  );
}

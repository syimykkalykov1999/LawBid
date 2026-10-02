'use client';

import type { Icon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { fadeUp } from './shared';

/** KPI card (same look as the dashboard). */
export function Kpi({
  icon: I,
  title,
  value,
  hint,
  gold,
  warn,
  i,
  format,
}: {
  icon: Icon;
  title: string;
  value: number;
  hint?: string;
  gold?: boolean;
  warn?: boolean;
  i: number;
  format?: (n: number) => string;
}) {
  return (
    <motion.div {...fadeUp(i)}>
      <Card spotlight className="h-full overflow-hidden p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-muted">{title}</span>
          <span className={cn('grid h-8 w-8 place-items-center rounded-xl', gold ? 'bg-gold/15 text-gold-600' : 'bg-surface-2 text-faint')}>
            <I size={17} weight="light" />
          </span>
        </div>
        <div
          className={cn(
            'mt-2 text-[26px] leading-tight font-semibold tracking-tight tabular-nums',
            gold ? 'text-gold-gradient' : warn && value > 0 ? 'text-warning' : 'text-heading',
          )}
        >
          <AnimatedNumber value={value} format={format} />
        </div>
        {hint ? <div className="mt-1 text-xs text-faint">{hint}</div> : null}
      </Card>
    </motion.div>
  );
}

export function KpiSkeletons({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-[118px] rounded-[var(--radius-lg)]" />
      ))}
    </>
  );
}

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Surface card. `spotlight` adds the site's pointer-following gold glow. */
export function Card({
  className,
  spotlight,
  onPointerMove,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { spotlight?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-line bg-surface shadow-card',
        spotlight && 'spotlight',
        className,
      )}
      onPointerMove={
        spotlight
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`);
              e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`);
              onPointerMove?.(e);
            }
          : onPointerMove
      }
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-3 px-5 pt-5 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[13px] font-medium tracking-wide text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

export type Tone = 'neutral' | 'success' | 'danger' | 'gold' | 'warning' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-line',
  success: 'bg-success-soft text-success border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  gold: 'bg-accent-soft text-gold-600 border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  info: 'bg-info-soft text-info border-transparent',
};

export function Badge({
  className,
  tone = 'neutral',
  dot,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

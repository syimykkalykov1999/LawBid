'use client';

import { m } from 'motion/react';

/** Subtle entrance: fade + 10px rise, small stagger by index. */
export function FadeIn({
  children,
  i = 0,
  className,
}: {
  children: React.ReactNode;
  i?: number;
  className?: string;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(i, 10) * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </m.div>
  );
}

/** Row for list tables: fades in with a small stagger. */
export function MotionRow({
  children,
  i = 0,
  className,
  onClick,
  ref,
  animateIn = true,
  'data-index': dataIndex,
}: {
  children: React.ReactNode;
  i?: number;
  className?: string;
  onClick?: () => void;
  /** Virtual lists (lib/virtual-rows.tsx) measure the row through it. */
  ref?: React.Ref<HTMLTableRowElement>;
  /** False for a row that was on screen before and only comes back into
   * view (a virtual list): it appears as it was, without the entrance. */
  animateIn?: boolean;
  'data-index'?: number;
}) {
  return (
    <m.tr
      ref={ref}
      data-index={dataIndex}
      initial={animateIn ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      onClick={onClick}
    >
      {children}
    </m.tr>
  );
}

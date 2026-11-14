'use client';

import * as m from 'motion/react-m';
import { cn } from '@/lib/utils';

/**
 * Card wrapper. Owner row 88 (2026-11-13): no entrance on navigation, the
 * content is simply there (Telegram / Instagram / Linear swap a page in place).
 */
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
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(i, 10) * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </m.div>
  );
}

/**
 * Row for list tables. Owner row 88: no entrance, so rows that VirtualRows
 * mounts while scrolling no longer fade in again (the scroll flicker).
 */
export function MotionRow({
  children,
  i = 0,
  className,
  onClick,
  ref,
  'data-index': dataIndex,
}: {
  children: React.ReactNode;
  i?: number;
  className?: string;
  onClick?: () => void;
  /** Set by VirtualRows (measured row heights). */
  ref?: React.Ref<HTMLTableRowElement>;
  'data-index'?: number;
}) {
  return (
    <m.tr
      ref={ref}
      data-index={dataIndex}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.03, ease: [0.16, 1, 0.3, 1] }}
      // Owner row 88 (2026-11-13): a row that opens something dims while a
      // finger is on it (touch screens only), so the tap is answered at once.
      className={onClick ? cn(className, 'pointer-coarse:active:opacity-70') : className}
      onClick={onClick}
    >
      {children}
    </m.tr>
  );
}

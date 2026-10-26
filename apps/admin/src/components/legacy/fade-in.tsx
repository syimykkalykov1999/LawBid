'use client';

import { motion } from 'motion/react';

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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(i, 10) * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Row for list tables: fades in with a small stagger. */
export function MotionRow({
  children,
  i = 0,
  className,
  onClick,
}: {
  children: React.ReactNode;
  i?: number;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      onClick={onClick}
    >
      {children}
    </motion.tr>
  );
}

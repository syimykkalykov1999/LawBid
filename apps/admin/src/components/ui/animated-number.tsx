'use client';

import { animate, useInView, useMotionValue, useTransform, motion } from 'motion/react';
import { useEffect, useRef } from 'react';

/** Counts up to `value` when it scrolls into view (and on change). */
export function AnimatedNumber({
  value,
  format = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n)),
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [inView, value, mv]);
  return <motion.span ref={ref}>{text}</motion.span>;
}

'use client';

import { animate, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect } from 'react';

/**
 * A number that shows its real value at once and tweens only when the value
 * changes afterwards (owner row 88, 2026-11-13: it used to count up from 0 on
 * every visit). With «reduce motion» on it just jumps to the new value: an
 * imperative `animate()` on a number does not follow `MotionConfig
 * reducedMotion`, so `useReducedMotion` is checked here (motion docs).
 */
export function AnimatedNumber({
  value,
  format = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n)),
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (mv.get() === value) return;
    if (reduce) {
      mv.jump(value);
      return;
    }
    const c = animate(mv, value, { duration: 0.6, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, mv, reduce]);
  return <m.span>{text}</m.span>;
}

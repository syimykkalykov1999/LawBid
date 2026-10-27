'use client';

import { useEffect, useState } from 'react';

/** A clock that ticks once a second while [active] (a local timer, no requests). */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** 83 → «1:23». */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The colour of a deadline: green, yellow from 75 % of the time spent, red when over. */
export function deadlineTone(spentSec: number, totalSec: number): 'success' | 'warning' | 'danger' {
  if (totalSec <= 0) return 'success';
  if (spentSec >= totalSec) return 'danger';
  return spentSec / totalSec >= 0.75 ? 'warning' : 'success';
}

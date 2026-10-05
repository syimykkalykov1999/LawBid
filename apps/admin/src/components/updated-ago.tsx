'use client';

import { useEffect, useState } from 'react';

function ago(seconds: number): string {
  if (seconds < 10) return 'только что';
  if (seconds < 60) return `${Math.floor(seconds / 10) * 10} с назад`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m} мин назад` : `${Math.floor(m / 60)} ч назад`;
}

/**
 * «обновлено N с назад» for a query's dataUpdatedAt. Ticks locally every
 * 10 s; it never calls the API (see lib/live.ts).
 */
export function UpdatedAgo({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(t);
  }, []);
  if (!at) return null;
  return <span className="whitespace-nowrap tabular-nums">обновлено {ago(Math.max(0, (now - at) / 1000))}</span>;
}

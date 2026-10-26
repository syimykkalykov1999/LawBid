'use client';

import { useEffect, useState } from 'react';

/** The value after it stopped changing for `ms` (search inputs: 300 ms). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

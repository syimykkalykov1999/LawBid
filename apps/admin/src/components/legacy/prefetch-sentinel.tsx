'use client';

import { useEffect, useRef } from 'react';

/** How far below the screen the next page is already asked for. */
export const PREFETCH_MARGIN = '800px';

/**
 * Item 38 (owner, Instagram-like lists): the next page of a long table is
 * fetched while the admin is still ~a screen from its end, so «Показать ещё»
 * is rarely needed. The pattern is TanStack Query's infinite-scroll example
 * (an IntersectionObserver on a sentinel → `fetchNextPage`) with the
 * observer's `rootMargin` widened below the viewport.
 *
 * No request on open (owner rule «no needless server requests»): the
 * observer's first report after the page mounts is skipped, so a short
 * table whose button is already on screen waits for a click or a scroll.
 * Zero height and aria-hidden, so the look is unchanged.
 */
export function PrefetchSentinel({ enabled, onNear }: { enabled: boolean | undefined; onNear: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useRef(onNear);
  const opened = useRef(false);
  useEffect(() => {
    near.current = onNear;
  }, [onNear]);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const first = !opened.current;
        opened.current = true;
        if (first) return;
        if (entries.some((e) => e.isIntersecting)) near.current();
      },
      { rootMargin: `0px 0px ${PREFETCH_MARGIN} 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return <div ref={ref} aria-hidden className="h-0 w-full" data-testid="prefetch-sentinel" />;
}

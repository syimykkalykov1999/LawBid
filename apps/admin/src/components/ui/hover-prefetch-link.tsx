'use client';

import Link from 'next/link';
import { type ComponentProps, useState } from 'react';

/**
 * A <Link> that prefetches only once the admin shows intent — the
 * «Hover-triggered prefetch» recipe of the Next.js docs, copied as is
 * (nextjs.org/docs/app/guides/prefetching, updated 2026-10-05, MIT), plus
 * focus and touch as intent for keyboard and touch screens.
 *
 * Why: the shell has a link for every section (sidebar, section tabs,
 * bottom bar). With the (app) `loading.tsx` each of them prefetched its
 * route on entering the viewport — 24–37 RSC requests rendered by the admin
 * server and decoded on the main thread during every page load (Lighthouse
 * 2026-11-09, Total Blocking Time). `prefetch={null}` restores the default
 * prefetch as soon as the pointer, focus or a finger reaches the link.
 */
export function HoverPrefetchLink({
  onMouseEnter,
  onFocus,
  onTouchStart,
  prefetch,
  ...props
}: ComponentProps<typeof Link>) {
  const [active, setActive] = useState(false);
  return (
    <Link
      {...props}
      prefetch={active ? (prefetch ?? null) : false}
      onMouseEnter={(e) => {
        setActive(true);
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        setActive(true);
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        setActive(true);
        onTouchStart?.(e);
      }}
    />
  );
}

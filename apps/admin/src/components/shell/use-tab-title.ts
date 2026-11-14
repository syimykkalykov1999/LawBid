'use client';

import { useEffect } from 'react';
import type { Me } from '@/lib/hooks';
import { sectionFor } from '@/lib/rbac';
import { useNavCounts } from './use-nav-counts';

/** The site name the root layout gives every page (app/layout.tsx metadata). */
export const BASE_TITLE = 'LawBid Admin';

/**
 * Scout 13.11 batch 1 (row 96): the browser tab says how much work waits,
 * as Gmail's «Inbox (12)» and Zendesk do: «(3) Адвокаты — LawBid Admin».
 * The number is the sum of the sidebar badges this admin sees.
 */
export function tabTitle(label: string | undefined, pending: number): string {
  const name = label ? `${label} — ${BASE_TITLE}` : BASE_TITLE;
  return pending > 0 ? `(${pending > 999 ? '999+' : pending}) ${name}` : name;
}

/** Sum of the badges shown (a counter this admin may not see is undefined, so left out). */
export function pendingTotal(counts: Partial<Record<string, number>>): number {
  return Object.values(counts).reduce<number>((a, n) => a + (typeof n === 'number' && n > 0 ? n : 0), 0);
}

/**
 * Sets `document.title` from the counts the sidebar already polls — the
 * same TanStack Query cache entry (GET /admin/counts), so no extra request
 * (owner rule: no needless server requests).
 */
export function useTabTitle(me: Me | undefined, pathname: string): void {
  const counts = useNavCounts(me);
  const total = pendingTotal(counts);
  const label = sectionFor(pathname)?.label;
  useEffect(() => {
    const want = tabTitle(label, total);
    document.title = want;
    // Next.js writes the layout's <title> again after a navigation (streamed
    // metadata): put ours back whenever the head changes it.
    if (typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(() => {
      if (document.title !== want) document.title = want;
    });
    obs.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [label, total]);
}

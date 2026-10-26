import { queryOptions } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';

/**
 * Owner 2026-10-05: the panel hit the API rate limit («Слишком много
 * запросов») by polling every 15–30 s from several places at once. Rules:
 * - live data refreshes at most once a minute (LIVE_MS), and only while
 *   the tab is visible (TanStack's refetchIntervalInBackground: false);
 * - one query key is polled from ONE place: the sidebar badges (shell)
 *   poll /admin/counts only; heavy aggregates (dashboard, trust stats…) are
 *   precomputed on the server and revalidated when the tab regains focus
 *   (owner 2026-10-23: no timers except the live work queues — the support
 *   inbox and thread, the system-health board);
 * - a 429 is never retried (providers.tsx) and backs the timer off to
 *   RATE_LIMITED_BACKOFF_MS until a request succeeds again;
 * - pages show «обновлено N с назад» (UpdatedAgo) instead of refetching.
 */
export const LIVE_MS = 60_000;
export const RATE_LIMITED_BACKOFF_MS = 5 * 60_000;

function isRateLimited(e: unknown): boolean {
  return e instanceof ApiError && e.status === 429;
}

/** Owner 2026-10-22 (client economy plan, package J): a visible tab whose
 * window is not focused (the admin is in another app) polls half as often. */
export const UNFOCUSED_MS = 120_000;

/** A refetchInterval that slows down after a 429 and when the window has
 * no focus. */
export function livePoll(ms: number = LIVE_MS) {
  return <Q extends { state: { error: unknown } }>(query: Q): number => {
    if (isRateLimited(query.state.error)) return Math.max(ms, RATE_LIMITED_BACKOFF_MS);
    if (typeof document !== 'undefined' && !document.hasFocus()) return Math.max(ms, UNFOCUSED_MS);
    return ms;
  };
}

/**
 * Owner 2026-10-22 (client economy plan, package J): the sidebar badges in
 * one light request (five indexed counts, ETag → 304) — polled by the
 * shell only. The heavy dashboard / support / trust aggregates are no
 * longer polled by the shell: each page polls its own while it is open.
 */
export const countsQuery = queryOptions({
  queryKey: ['admin-counts'],
  queryFn: async () => (await api.GET('/admin/counts')).data!.data,
});

/** The dashboard aggregate (server-side precomputed). */
export const dashboardQuery = queryOptions({
  queryKey: ['dashboard'],
  queryFn: async () => (await api.GET('/admin/dashboard')).data!.data,
  // Owner 2026-10-23 (admin economy pass): the server recounts this every
  // two minutes for the whole team; the page revalidates on focus instead
  // of running a timer.
  refetchOnWindowFocus: true,
});

/** Shared by the dashboard and Поддержка; polled while one of them is open. */
export const supportStatsQuery = queryOptions({
  queryKey: ['support-stats'],
  queryFn: async () => (await api.GET('/admin/support/stats')).data!.data,
  refetchInterval: livePoll(),
});

/** Attorney-trust stats (server-side precomputed). */
export const trustStatsQuery = queryOptions({
  queryKey: ['trust-stats'],
  queryFn: async () => (await api.GET('/admin/trust/stats')).data!.data,
  // Owner 2026-10-23: counted by the server every few minutes; no timer.
  refetchOnWindowFocus: true,
});

/**
 * «Борьба с мошенниками → Клиенты» counters. Not polled: the sidebar and the
 * dashboard read the fraud queue size from the dashboard poll.
 */
export const fraudStatsQuery = queryOptions({
  queryKey: ['fraud-stats'],
  queryFn: async () => (await api.GET('/admin/fraud/stats')).data!.data,
});

export const workspaceQuery = queryOptions({
  queryKey: ['workspace'],
  queryFn: async () => (await api.GET('/admin/workspace')).data!.data,
  refetchInterval: livePoll(),
});

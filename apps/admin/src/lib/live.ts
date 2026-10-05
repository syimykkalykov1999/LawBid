import { queryOptions } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';

/**
 * Owner 2026-10-05: the panel hit the API rate limit («Слишком много
 * запросов») by polling every 15–30 s from several places at once. Rules:
 * - live data refreshes at most once a minute (LIVE_MS), and only while
 *   the tab is visible (TanStack's refetchIntervalInBackground: false);
 * - one query key is polled from ONE place: the sidebar badges (shell)
 *   poll dashboard / support stats / trust stats, pages reuse the same
 *   options without their own timer and read the shared cache;
 * - a 429 is never retried (providers.tsx) and backs the timer off to
 *   RATE_LIMITED_BACKOFF_MS until a request succeeds again;
 * - pages show «обновлено N с назад» (UpdatedAgo) instead of refetching.
 */
export const LIVE_MS = 60_000;
export const RATE_LIMITED_BACKOFF_MS = 5 * 60_000;

export function isRateLimited(e: unknown): boolean {
  return e instanceof ApiError && e.status === 429;
}

/** A refetchInterval that slows down after a 429. */
export function livePoll(ms: number = LIVE_MS) {
  return <Q extends { state: { error: unknown } }>(query: Q): number =>
    isRateLimited(query.state.error) ? Math.max(ms, RATE_LIMITED_BACKOFF_MS) : ms;
}

/** Shared by the dashboard and the sidebar badges; polled by the shell. */
export const dashboardQuery = queryOptions({
  queryKey: ['dashboard'],
  queryFn: async () => (await api.GET('/admin/dashboard')).data!.data,
});

/** Shared by the dashboard, Поддержка and the sidebar badge; polled by the shell. */
export const supportStatsQuery = queryOptions({
  queryKey: ['support-stats'],
  queryFn: async () => (await api.GET('/admin/support/stats')).data!.data,
});

/** «Борьба с мошенниками» queue size; polled by the shell. */
export const trustStatsQuery = queryOptions({
  queryKey: ['trust-stats'],
  queryFn: async () => (await api.GET('/admin/trust/stats')).data!.data,
});

export const workspaceQuery = queryOptions({
  queryKey: ['workspace'],
  queryFn: async () => (await api.GET('/admin/workspace')).data!.data,
  refetchInterval: livePoll(),
});

import {
  keepPreviousData,
  MutationCache,
  QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { ApiError } from '@/lib/api/client';
import { countsQuery } from '@/lib/live';
import { queryRetryDelay, shouldRetryQuery } from '@/lib/query-retry';

/**
 * Owner 2026-11-04 (R-385, «даже без изменений шлёт запрос на обновление,
 * какая бы страница ни была»): how long each kind of admin data is trusted
 * before a page that opens again asks the server. TanStack Query's own
 * tools only — `defaultOptions` plus `setQueryDefaults` per key prefix
 * (https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetquerydefaults)
 * and `placeholderData: keepPreviousData` for paged / filtered lists
 * (https://tanstack.com/query/v5/docs/framework/react/guides/paginated-queries).
 *
 * - every query: fresh for a minute, kept 30 minutes after its page closes
 *   (TanStack's default gcTime is 5 minutes: a page opened again after
 *   that started from an empty screen and a full load);
 * - reference / settings (REFERENCE_KEYS): fresh 15 minutes — they change
 *   only when an admin saves them, and every save invalidates its key;
 * - server-precomputed aggregates (AGGREGATE_KEYS): fresh 2 minutes, the
 *   server's own recount period;
 * - lists with filters / pages (LIST_KEYS): the old rows stay on screen
 *   while the next filter or page loads;
 * - live work queues keep their own `refetchInterval: livePoll()`
 *   (lib/live.ts) — an option set by a query itself always wins over
 *   these defaults.
 */
export const DEFAULT_STALE_MS = 60_000;
export const DEFAULT_GC_MS = 30 * 60_000;
/**
 * Speed matrix 2026-11-09 (§3 #4): the reference / aggregate / list classes
 * are also written to IndexedDB (lib/persist.ts) and must outlive the page
 * in memory as long as the stored copy lives — TanStack's persist guide: a
 * query the garbage collector dropped (gcTime) is gone from the next
 * written copy too, so gcTime is kept at the persister's maxAge. A day:
 * the next morning opens from yesterday's lists at once.
 */
export const PERSISTED_GC_MS = 24 * 60 * 60_000;
export const REFERENCE_STALE_MS = 15 * 60_000;
export const AGGREGATE_STALE_MS = 2 * 60_000;

/** Settings and reference data: change only on an admin's own save. */
export const REFERENCE_KEYS = [
  'me',
  'config',
  'flags',
  'countries',
  'languages',
  'admin-practice-areas',
  'plan-prices',
  'legal-documents',
  'email-templates',
  'document-templates',
  'deal-record-texts',
  'state-registries',
  'registry-flags',
  'staff-flags',
  'staff-switches',
  'staff-rates',
  'integrations',
  'integration-versions',
  'admin-deadline-rules',
  'admin-deadline-holidays',
  'admin-presets',
  'admin-templates',
  'outreach-templates',
  'support-macros',
  'admin-gifts',
  'passkeys',
  'staff-watermark',
  'admin-stars-settings',
  'attorney-ads-settings',
  'case-payments-settings',
  'demo-settings',
  'desk-settings',
  'fraud-settings',
  'legal-settings',
  'partners-settings',
  'promotions-settings',
  'referrals-settings',
  'rewards-settings',
  'support-settings',
  'trust-settings',
] as const;

/** Aggregates the server recounts on its own schedule. */
export const AGGREGATE_KEYS = ['dashboard', 'trust-stats', 'fraud-stats', 'economy'] as const;

/** Lists whose key carries filters / a search / a page. */
export const LIST_KEYS = [
  'users',
  'admin-cases',
  'outreach-leads',
  'partners',
  'audit-log',
  'admin-posts',
  'admin-comments',
  'admin-reviews',
  'admin-client-reviews',
  'admin-bids',
  'support-tickets',
  'verification-queue',
  'moderation-queue',
  'trust-attorneys',
  'trust-queue',
  'promo-codes',
  'billing-payments',
  'billing-subscriptions',
  'crashes',
  'group-chats',
  'media-videos',
  'media-channels',
  'media-sticker-packs',
  'disputes',
  'dmca-notices',
  'bans',
  'case-payments',
  'referrals',
  'partner-commissions',
  'search-queries',
  'search-synonyms',
  'fraud-queue',
  'moderation-appeals',
  'review-appeals',
  'staff-appeals',
  'legal-qa',
  'media-moderation',
  'admin-teams',
  'promotions',
  'contact-issues',
  'client-badges',
] as const;

export type QueryClass = 'reference' | 'aggregate' | 'list' | 'default';

/** The data class of a query key (by its first segment). */
export function queryClassOf(key: QueryKey): QueryClass {
  const head = String(key[0]);
  if ((REFERENCE_KEYS as readonly string[]).includes(head)) return 'reference';
  if ((AGGREGATE_KEYS as readonly string[]).includes(head)) return 'aggregate';
  if ((LIST_KEYS as readonly string[]).includes(head)) return 'list';
  return 'default';
}

/** The data-class defaults on [client] (TanStack `setQueryDefaults`). */
export function applyQueryClassDefaults(client: QueryClient): QueryClient {
  for (const k of REFERENCE_KEYS)
    client.setQueryDefaults([k], { staleTime: REFERENCE_STALE_MS, gcTime: PERSISTED_GC_MS });
  for (const k of AGGREGATE_KEYS)
    client.setQueryDefaults([k], { staleTime: AGGREGATE_STALE_MS, gcTime: PERSISTED_GC_MS });
  for (const k of LIST_KEYS)
    client.setQueryDefaults([k], { placeholderData: keepPreviousData, gcTime: PERSISTED_GC_MS });
  return client;
}

type ErrorSink = { current: ((e: unknown) => void) | null };

/** The panel's one QueryClient (providers.tsx). */
export function makeQueryClient(toastSink: ErrorSink = { current: null }): QueryClient {
  const client: QueryClient = applyQueryClassDefaults(
    new QueryClient({
      // S18-11: a mutation that has no onError of its own must still tell
      // the admin it failed (a money / ban button must never just un-spin).
      // A 401 is already handled by the redirect to /login.
      mutationCache: new MutationCache({
        onError: (error, _vars, _ctx, mutation) => {
          if (mutation.options.onError) return;
          if (error instanceof ApiError && error.status === 401) return;
          toastSink.current?.(error);
        },
        // R-403: any action may move an item out of a queue — the sidebar
        // badges re-read at once (one light request, 304 when unchanged).
        onSuccess: () => {
          void client.invalidateQueries({ queryKey: countsQuery.queryKey });
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: DEFAULT_STALE_MS,
          gcTime: DEFAULT_GC_MS,
          refetchOnWindowFocus: false,
          // Backoff with jitter, never a 4xx (lib/query-retry.ts). A failed
          // request does not flip the UI to "offline": the query keeps its
          // previous data and tries again.
          retry: shouldRetryQuery,
          retryDelay: (attempt) => queryRetryDelay(attempt),
          networkMode: 'offlineFirst',
        },
      },
    }),
  );
  return client;
}

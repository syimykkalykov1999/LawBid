import { withTimeout } from '../../resilience/resilience';

/**
 * Batch C items 11 and 16 (2026-10-24): readers for the two outside usage
 * numbers that cost money without a hard limit. Pure functions over an
 * injectable `fetch`, so tests need no network.
 *
 * Cloudflare Realtime: GraphQL Analytics dataset
 * `callsTurnUsageAdaptiveGroups` (fields sum.egressBytes / sum.ingressBytes,
 * filter date_geq / date_leq, needs a token with «Account Analytics: Read»;
 * https://developers.cloudflare.com/realtime/turn/analytics/, checked
 * 2026-10-24). Only egress is billed: first 1000 GB/month free, shared by
 * TURN and SFU. No documented SFU dataset was found (2026-10-24), so SFU
 * traffic is not counted here: the figure is a LOWER bound of the pool.
 *
 * Bunny: Core API `GET https://api.bunny.net/statistics` (AccessKey header
 * = ACCOUNT API key; `TotalBandwidthUsed` bytes for dateFrom..dateTo) and
 * `GET https://api.bunny.net/videolibrary/{id}` (`StorageUsage`,
 * `TrafficUsage`, `VideoCount`).
 */
export type FetchFn = typeof fetch;

/** Decimal gigabytes (what both providers bill in; the larger count makes
 * the alerts a little early rather than late). */
export const GB = 1e9;

const TIMEOUT_MS = 10_000;

export const CLOUDFLARE_GRAPHQL_URL =
  'https://api.cloudflare.com/client/v4/graphql';

/** First and last day (UTC, YYYY-MM-DD) of the month containing [now]. */
export function monthRange(now: Date): { from: string; to: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    from: day(new Date(Date.UTC(y, m, 1))),
    to: day(new Date(Date.UTC(y, m + 1, 0))),
  };
}

export const CLOUDFLARE_TURN_QUERY = `query TurnUsage($accountTag: String!, $from: Date!, $to: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      callsTurnUsageAdaptiveGroups(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        sum { egressBytes ingressBytes }
      }
    }
  }
}`;

interface TurnResponse {
  data?: {
    viewer?: {
      accounts?: {
        callsTurnUsageAdaptiveGroups?: {
          sum?: { egressBytes?: number; ingressBytes?: number };
        }[];
      }[];
    };
  } | null;
  errors?: { message?: string }[] | null;
}

/** Month-to-date TURN egress in bytes. Throws with a short reason. */
export async function fetchTurnEgressBytes(
  accountId: string,
  token: string,
  now: Date,
  fetchFn: FetchFn = fetch,
): Promise<{ egressBytes: number; ingressBytes: number }> {
  const { from, to } = monthRange(now);
  const res = await withTimeout('cloudflare_graphql', TIMEOUT_MS, () =>
    fetchFn(CLOUDFLARE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: CLOUDFLARE_TURN_QUERY,
        variables: { accountTag: accountId, from, to },
      }),
    }),
  );
  if (!res.ok) throw new Error(`Cloudflare GraphQL HTTP ${res.status}`);
  const body = (await res.json()) as TurnResponse;
  if (body.errors?.length) {
    // Messages never hold the token.
    throw new Error(
      `Cloudflare GraphQL: ${body.errors[0]?.message ?? 'error'}`.slice(0, 200),
    );
  }
  const groups =
    body.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups ?? [];
  let egressBytes = 0;
  let ingressBytes = 0;
  for (const g of groups) {
    egressBytes += Number(g.sum?.egressBytes ?? 0);
    ingressBytes += Number(g.sum?.ingressBytes ?? 0);
  }
  return { egressBytes, ingressBytes };
}

export interface BunnyUsage {
  bandwidthBytes: number;
  storageBytes: number | null;
}

/** Bunny month-to-date CDN traffic and (when a library id is given) the
 * library's stored bytes. Throws with a short reason. */
export async function fetchBunnyUsage(
  accountKey: string,
  libraryId: string | undefined,
  now: Date,
  fetchFn: FetchFn = fetch,
): Promise<BunnyUsage> {
  const { from, to } = monthRange(now);
  const get = async (url: string): Promise<unknown> => {
    const res = await withTimeout('bunny_core', TIMEOUT_MS, () =>
      fetchFn(url, {
        headers: { AccessKey: accountKey, accept: 'application/json' },
      }),
    );
    if (!res.ok) throw new Error(`Bunny HTTP ${res.status}`);
    return res.json();
  };
  const stats = (await get(
    `https://api.bunny.net/statistics?dateFrom=${from}&dateTo=${to}&loadBandwidthUsed=true`,
  )) as { TotalBandwidthUsed?: number };
  let storageBytes: number | null = null;
  if (libraryId && /^\d{1,12}$/.test(libraryId)) {
    const lib = (await get(
      `https://api.bunny.net/videolibrary/${libraryId}`,
    )) as { StorageUsage?: number };
    if (typeof lib.StorageUsage === 'number') storageBytes = lib.StorageUsage;
  }
  return {
    bandwidthBytes: Number(stats.TotalBandwidthUsed ?? 0),
    storageBytes,
  };
}

export type UsageLevel = 'ok' | 'warn' | 'crit';

/** [warn]/[crit] in the same unit as [value]; 0 = that level is off. */
export function usageLevel(
  value: number,
  warn: number,
  crit: number,
): UsageLevel {
  if (crit > 0 && value >= crit) return 'crit';
  if (warn > 0 && value >= warn) return 'warn';
  return 'ok';
}

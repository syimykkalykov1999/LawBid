import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient, QueryObserver, type QueryObserverOptions } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
let failWith429 = false;

vi.mock('@/lib/api/client', () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  }
  const GET = vi.fn(async (path: string) => {
    calls.push(path);
    if (failWith429) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests');
    return { data: { data: {} } };
  });
  return { api: { GET }, ApiError };
});

const { LIVE_MS, RATE_LIMITED_BACKOFF_MS, dashboardQuery, livePoll, supportStatsQuery, trustStatsQuery, workspaceQuery } =
  await import('./live');
const { api } = await import('@/lib/api/client');

/** Owner 2026-10-05: requests/minute for one admin (API security.admin_rate_limit_per_minute). */
const ADMIN_LIMIT_PER_MINUTE = 600;
/** The old shared limit, which the panel used to hit. */
const USER_LIMIT_PER_MINUTE = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a mix of differently typed queries
type Opts = QueryObserverOptions<any, any, any, any, any>;
const get = (path: string) => async () => (await (api.GET as (p: string) => Promise<{ data: { data: unknown } }>)(path)).data.data;

/** The queries the shell (sidebar badges, use-nav-counts.ts) keeps on every screen. */
const shell: Opts[] = [
  { ...dashboardQuery, refetchInterval: livePoll() },
  { ...supportStatsQuery, refetchInterval: livePoll() },
  { ...trustStatsQuery, refetchInterval: livePoll() },
];

/** What each polled screen mounts on top of the shell (mirrors the pages). */
const screens: Record<string, Opts[]> = {
  dashboard: [
    dashboardQuery,
    supportStatsQuery,
    { queryKey: ['admin-overview'], queryFn: get('/admin/overview') },
    { queryKey: ['billing-overview'], queryFn: get('/admin/billing/overview') },
  ],
  support: [
    supportStatsQuery,
    {
      queryKey: ['support-tickets', {}],
      // Three loaded pages of the inbox: three requests per refresh.
      queryFn: async () => Promise.all([1, 2, 3].map(() => get('/admin/support/tickets')())),
      refetchInterval: livePoll(),
    },
  ],
  workspace: [workspaceQuery, { queryKey: ['workspace-rewards'], queryFn: get('/admin/workspace/rewards'), staleTime: 5 * 60_000 }],
};

function openTab(screen: Opts[]): () => void {
  // Each browser tab has its own QueryClient (no shared cache), the worst case.
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  const unsubs = [...shell, ...screen].map((o) => new QueryObserver(client, o).subscribe(() => {}));
  return () => {
    unsubs.forEach((u) => u());
    client.clear();
  };
}

describe('admin polling budget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    calls.length = 0;
    failWith429 = false;
  });
  afterEach(() => vi.useRealTimers());

  it('dashboard, support and workspace open together stay under the admin limit for a minute', async () => {
    const close = Object.values(screens).map(openTab);
    await vi.advanceTimersByTimeAsync(60_000);
    close.forEach((c) => c());

    expect(calls.length).toBeLessThan(ADMIN_LIMIT_PER_MINUTE);
    // Well under even the old shared 100/min with three tabs open.
    expect(calls.length).toBeLessThan(USER_LIMIT_PER_MINUTE / 2);
  });

  it('one screen dedupes its queries: the dashboard fetches each key once per minute', async () => {
    const close = openTab(screens.dashboard);
    await vi.advanceTimersByTimeAsync(LIVE_MS - 1);
    close();

    const count = (p: string) => calls.filter((c) => c === p).length;
    expect(count('/admin/dashboard')).toBe(1);
    expect(count('/admin/support/stats')).toBe(1);
  });

  it('backs off to five minutes after a 429 instead of hammering', async () => {
    failWith429 = true;
    const close = openTab(screens.workspace);
    await vi.advanceTimersByTimeAsync(RATE_LIMITED_BACKOFF_MS - 1_000);
    close();

    // One try per key, no retries, no minute polls while rate limited.
    expect(calls.filter((c) => c === '/admin/workspace')).toHaveLength(1);
    expect(calls.filter((c) => c === '/admin/dashboard')).toHaveLength(1);
  });
});

describe('polling policy', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !n.includes('.test.') ? [p] : [];
    });
  }

  it('every refetchInterval in the panel goes through livePoll (a minute, backs off on 429, stops when idle)', () => {
    const root = join(__dirname, '..');
    const bad = files(root).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${f.slice(root.length + 1)}:${i + 1}` }))
        .filter(({ line }) => /refetchInterval:/.test(line) && !/refetchInterval: livePoll\(/.test(line))
        .map(({ at, line }) => `${at} ${line.trim()}`),
    );
    expect(bad).toEqual([]);
  });
});

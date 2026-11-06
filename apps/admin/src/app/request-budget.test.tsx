/// <reference types="vite/client" />
import { QueryClient, QueryClientProvider, QueryObserver, type QueryObserverOptions } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import type { ComponentType, ReactNode } from 'react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GC_MS, makeQueryClient, queryClassOf } from '@/lib/query-client';

/**
 * R-385 (owner 2026-11-04): how many requests each admin page sends when
 * it opens, and again when the admin comes back to it after 45 s and
 * after 10 min. The page is mounted with the panel's real QueryClient
 * (lib/query-client.ts); the server never answers, so every query that
 * fetches is counted once. A return visit is replayed with TanStack's own
 * logic: each captured observer is subscribed again (`QueryObserver`), so
 * staleTime / refetchOnMount / gcTime decide exactly as on a real page.
 * `REQUEST_AUDIT=<file>` writes the table (old defaults vs new) for the PR.
 */
const net = vi.hoisted(() => {
  const n = { calls: 0, call: () => undefined as unknown };
  n.call = () => {
    n.calls += 1;
    return new Promise(() => undefined);
  };
  return n;
});
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
for (const name of ['IntersectionObserver', 'ResizeObserver'])
  vi.stubGlobal(
    name,
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/x',
  useParams: () => ({ id: 'id1', slug: 's', code: 'c' }),
  notFound: () => undefined,
  redirect: () => undefined,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={String(href)}>{children}</a>,
}));
vi.mock('@/lib/api/client', async (orig) => {
  const real = await orig<typeof import('@/lib/api/client')>();
  return { ...real, api: { GET: net.call, POST: net.call, PUT: net.call, PATCH: net.call, DELETE: net.call } };
});

const pages = Object.entries(import.meta.glob('./**/page.tsx')).filter(([path]) => path.startsWith('./(app)/'));

/** The defaults before R-385 (providers.tsx until 2026-11-04). */
function legacyClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false, networkMode: 'offlineFirst' } },
  });
}

type Captured = { key: string; cls: string; live: boolean; opts: QueryObserverOptions[] };

async function openPage(Page: ComponentType<unknown>, qc: QueryClient): Promise<{ first: number; queries: Captured[] }> {
  net.calls = 0;
  render(
    <QueryClientProvider client={qc}>
      <Page {...({ params: Promise.resolve({ id: 'id1' }), searchParams: Promise.resolve({}) } as object)} />
    </QueryClientProvider>,
  );
  await new Promise((res) => setTimeout(res, 20));
  const queries = qc
    .getQueryCache()
    .getAll()
    .filter((q) => q.state.fetchStatus === 'fetching')
    .map((q) => {
      const opts = q.observers.map((o) => o.options as QueryObserverOptions);
      return {
        key: JSON.stringify(q.queryKey),
        cls: queryClassOf(q.queryKey),
        live: opts.some((o) => !!o.refetchInterval),
        opts,
      };
    });
  return { first: net.calls, queries };
}

/** Requests a return visit [afterMs] later sends (live polls excluded). */
async function reopen(qc: QueryClient, queries: Captured[], afterMs: number): Promise<number> {
  cleanup();
  await qc.cancelQueries();
  const at = Date.now();
  for (const q of queries) {
    const key = JSON.parse(q.key) as unknown[];
    qc.setQueryData(key, { stub: true }, { updatedAt: at });
  }
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at + afterMs);
  try {
    for (const q of qc.getQueryCache().getAll()) {
      if (afterMs >= q.gcTime) qc.removeQueries({ queryKey: q.queryKey, exact: true });
    }
    net.calls = 0;
    const subs: (() => void)[] = [];
    for (const q of queries.filter((x) => !x.live))
      for (const o of q.opts) subs.push(new QueryObserver(qc, { ...o, refetchInterval: false }).subscribe(() => undefined));
    const n = net.calls;
    subs.forEach((u) => u());
    return n;
  } finally {
    vi.useRealTimers();
  }
}

type Row = { page: string; first: number; live: number; old45: number; new45: number; old10m: number; new10m: number; shortExplicit: number };
const rows: Row[] = [];

afterEach(cleanup);
afterAll(() => {
  const out = process.env.REQUEST_AUDIT;
  if (!out) return;
  const sum = (k: keyof Row) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const lines = rows.map((r) => `| ${r.page} | ${r.first} | ${r.live} | ${r.old45} → ${r.new45} | ${r.old10m} → ${r.new10m} |`);
  writeFileSync(
    out,
    [
      '| Страница | Открытие (запросов) | из них живые (опрос 60 с) | Возврат через 45 с: до → после | Возврат через 10 мин: до → после |',
      '|---|---|---|---|---|',
      ...lines,
      `| **Итого (${rows.length} стр.)** | ${sum('first')} | ${sum('live')} | ${sum('old45')} → ${sum('new45')} | ${sum('old10m')} → ${sum('new10m')} |`,
    ].join('\n'),
  );
});

describe('R-385: admin page request budget', () => {
  for (const [path, load] of pages) {
    it(`${path}: a return visit within a minute asks the server only for live boards`, async () => {
      const mod = (await load().catch((e: Error) => {
        if (/server-only/.test(e.message)) return null;
        throw e;
      })) as { default: ComponentType<unknown> } | null;
      if (!mod || mod.default.constructor.name === 'AsyncFunction') return;

      const oldQc = legacyClient();
      const old = await openPage(mod.default, oldQc);
      const old45 = await reopen(oldQc, old.queries, 45_000);
      const oldAgain = await openPage(mod.default, (oldQc.clear(), oldQc));
      const old10m = await reopen(oldQc, oldAgain.queries, 10 * 60_000);

      const qc = makeQueryClient();
      const cur = await openPage(mod.default, qc);
      const new45 = await reopen(qc, cur.queries, 45_000);
      const again = await openPage(mod.default, (qc.clear(), qc));
      const new10m = await reopen(qc, again.queries, 10 * 60_000);

      // Queries that set a staleTime under 45 s on purpose (a review queue).
      const shortExplicit = cur.queries.filter(
        (q) => !q.live && q.opts.some((o) => typeof o.staleTime === 'number' && o.staleTime < 45_000),
      ).length;
      rows.push({
        page: path.replace('./(app)/', '/').replace(/\/?page\.tsx$/, '') || '/',
        first: cur.first,
        live: cur.queries.filter((q) => q.live).length,
        old45,
        new45,
        old10m,
        new10m,
        shortExplicit,
      });
      expect(new45).toBeLessThanOrEqual(shortExplicit);
      expect(new45).toBeLessThanOrEqual(old45);
      expect(new10m).toBeLessThanOrEqual(old10m);
      // Reference / settings data is still fresh after 10 minutes.
      const refFetched = again.queries.filter((q) => q.cls === 'reference' && !q.live);
      expect(refFetched.every((q) => q.opts.every((o) => o.staleTime === undefined || (typeof o.staleTime === 'number' && o.staleTime >= 10 * 60_000) || q.opts.length === 0))).toBe(true);
    });
  }
  it('keeps a closed page in memory for 30 minutes', () => {
    expect(DEFAULT_GC_MS).toBe(30 * 60_000);
  });
});

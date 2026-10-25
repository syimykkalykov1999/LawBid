import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request accumulator for sampled requests (WP-G). Module-level on
 * purpose, like `shardContext`: PrismaService's database extension is built
 * before Nest's DI graph exists and still has to add its time here.
 */
export interface HeavyStore {
  dbMs: number;
}

export const heavyContext = new AsyncLocalStorage<HeavyStore>();

/** Called by the Prisma extension for every query (cheap no-op unsampled). */
export function addDbTime(ms: number): void {
  const s = heavyContext.getStore();
  if (s) s.dbMs += ms;
}

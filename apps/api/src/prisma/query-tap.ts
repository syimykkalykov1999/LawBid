import type { Prisma } from '../generated/prisma/client';

/**
 * Opt-in tap on every SQL statement the primary Prisma client sends
 * (2026-11-08, perf guard of the user-facing API:
 * test/perf-user.e2e-spec.ts). Off unless PRISMA_QUERY_TAP=1: then the
 * client is built with Prisma's own `log: [{ emit: 'event', level: 'query' }]`
 * (https://www.prisma.io/docs/orm/prisma-client/observability-and-logging/logging)
 * and every query event is handed to the listeners here. Production never
 * sets the variable, so nothing changes there: no log option, no listener.
 */
export interface TappedQuery {
  query: string;
  params: string;
  durationMs: number;
}

type Listener = (q: TappedQuery) => void;
const listeners = new Set<Listener>();

export const queryTap = {
  enabled(): boolean {
    return process.env.PRISMA_QUERY_TAP === '1';
  },
  /** Adds a listener; returns the function that removes it. */
  on(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  emit(e: Prisma.QueryEvent): void {
    const q = { query: e.query, params: e.params, durationMs: e.duration };
    for (const l of listeners) l(q);
  },
  /** The PrismaClient options that make the client emit query events. */
  clientOptions(): { log: Prisma.LogDefinition[] } | Record<string, never> {
    return this.enabled() ? { log: [{ emit: 'event', level: 'query' }] } : {};
  },
};

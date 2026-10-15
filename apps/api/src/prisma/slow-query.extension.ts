import { Prisma } from '@prisma/client';

export interface SlowQuery {
  /** `Case.findMany`, `$queryRaw`, … (never the values). */
  operation: string;
  ms: number;
}

/**
 * Owner 2026-10-15: a slow-query log. Every database call slower than
 * [thresholdMs] is reported with its operation name and duration (never
 * the arguments: they carry people's data), so what slows the app down is
 * visible in the logs without guessing. 0 switches it off.
 */
export function slowQueryExtension(
  thresholdMs: number,
  report: (q: SlowQuery) => void,
) {
  return Prisma.defineExtension({
    name: 'slow-query-log',
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (thresholdMs <= 0) return (await query(args)) as unknown;
        const started = performance.now();
        try {
          return (await query(args)) as unknown;
        } finally {
          const ms = Math.round(performance.now() - started);
          if (ms >= thresholdMs) {
            report({
              operation: model ? `${model}.${operation}` : operation,
              ms,
            });
          }
        }
      },
    },
  });
}

/** `DB_SLOW_QUERY_MS` (default 300; 0 = off). */
export function slowQueryThresholdMs(env: NodeJS.ProcessEnv = process.env) {
  const raw = Number(env.DB_SLOW_QUERY_MS);
  return Number.isFinite(raw) && env.DB_SLOW_QUERY_MS !== undefined
    ? Math.max(0, raw)
    : 300;
}

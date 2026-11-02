import { Prisma } from '@prisma/client';
import { CircuitBreaker } from '../common/resilience/resilience';
import {
  isTransientInfraError,
  isUnreachableBeforeSend,
  retryTransient,
} from '../common/resilience/transient-errors';

const READS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Stability sweep 2026-11-02. After an RDS failover (30–60 s) every pooled
 * connection is dead: the first query on each fails with "server closed the
 * connection" / ECONNRESET / 57P01 although the database is back. A read is
 * repeated on such an error (up to 3 attempts in about a second — the
 * request is waiting). Raw SQL (`$queryRaw`) is treated as a write, since it
 * may be `INSERT … RETURNING`. A write only when it provably never left this
 * process (P1001/ECONNREFUSED/DNS), because repeating one that may have
 * been committed would double it. A long outage still fails the call fast;
 * jobs ride it out with `outageProof` (queue-hardening.ts), requests answer
 * 5xx and the next ones succeed. 0 attempts = off (`DB_TRANSIENT_RETRIES`).
 */
export function transientRetryExtension(
  attempts: number = transientRetryAttempts(),
  breaker: CircuitBreaker = new CircuitBreaker(`database#${++breakers}`, {
    threshold: 10,
    openMs: 3_000,
  }),
) {
  return Prisma.defineExtension({
    name: 'transient-retry',
    query: {
      async $allOperations({ operation, args, query }) {
        if (attempts <= 1) return (await query(args)) as unknown;
        const isRead = READS.has(operation);
        // Circuit breaker (as at the big services): while the database is
        // away every call used to hold a pool slot for its whole timeout
        // and the API drowned in waiting requests. After 10 transient
        // failures in a row calls fail at once for 3 s (503 with
        // Retry-After via CircuitOpenError), then one trial call probes.
        return (await breaker.run(
          () =>
            retryTransient(() => query(args), {
              maxAttempts: attempts,
              baseDelayMs: 150,
              maxDelayMs: 600,
              windowMs: 2_500,
              retriable: isRead
                ? isTransientInfraError
                : isUnreachableBeforeSend,
            }),
          isTransientInfraError,
        )) as unknown;
      },
    },
  });
}

let breakers = 0;

/** `DB_TRANSIENT_RETRIES` (default 3 attempts; 0 or 1 = off). */
export function transientRetryAttempts(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.DB_TRANSIENT_RETRIES);
  return Number.isFinite(raw) && env.DB_TRANSIENT_RETRIES !== undefined
    ? Math.max(0, Math.min(6, Math.trunc(raw)))
    : 3;
}

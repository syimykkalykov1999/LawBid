import { Prisma } from '@prisma/client';
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
  '$queryRaw',
  '$queryRawUnsafe',
]);

/**
 * Stability sweep 2026-11-02. After an RDS failover (30–60 s) every pooled
 * connection is dead: the first query on each fails with "server closed the
 * connection" / ECONNRESET / 57P01 although the database is back. A read is
 * repeated on such an error (up to 3 attempts in about a second — the
 * request is waiting); a write only when it provably never left this
 * process (P1001/P1002/ECONNREFUSED), because repeating one that may have
 * been committed would double it. A long outage still fails the call fast;
 * jobs ride it out with `outageProof` (queue-hardening.ts), requests answer
 * 5xx and the next ones succeed. 0 attempts = off (`DB_TRANSIENT_RETRIES`).
 */
export function transientRetryExtension(
  attempts: number = transientRetryAttempts(),
) {
  return Prisma.defineExtension({
    name: 'transient-retry',
    query: {
      async $allOperations({ operation, args, query }) {
        if (attempts <= 1) return (await query(args)) as unknown;
        const isRead = READS.has(operation);
        return (await retryTransient(() => query(args), {
          maxAttempts: attempts,
          baseDelayMs: 150,
          maxDelayMs: 600,
          windowMs: 2_500,
          retriable: isRead ? isTransientInfraError : isUnreachableBeforeSend,
        })) as unknown;
      },
    },
  });
}

/** `DB_TRANSIENT_RETRIES` (default 3 attempts; 0 or 1 = off). */
export function transientRetryAttempts(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.DB_TRANSIENT_RETRIES);
  return Number.isFinite(raw) && env.DB_TRANSIENT_RETRIES !== undefined
    ? Math.max(0, Math.min(6, Math.trunc(raw)))
    : 3;
}

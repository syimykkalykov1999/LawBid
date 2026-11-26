import { Prisma } from '../generated/prisma/client';
import { PG_POOL_TIMEOUT } from '../common/resilience/transient-errors';

/**
 * «The database pool is out of room right now» (not a bad query): Prisma
 * P2024 (no pooled connection within the pool timeout) and P2028 when it
 * says an interactive transaction could not START in `maxWait`. In both
 * nothing ran, so the caller may retry; AllExceptionsFilter answers
 * 503 SERVER_BUSY + Retry-After instead of a 500 (the apps retry a 503 with
 * the header, never a 500).
 *
 * The other P2028 (a transaction that timed out or was closed mid-way) is
 * NOT here: a handler may have done something outside the transaction
 * before it expired, and «try again» would repeat it.
 *
 * Load test 2026-11-02 (docs/perf/LOAD_RESILIENCE_2026-11-02.md §2).
 *
 * Prisma 7: the pool is node-pg's; when it has no free connection within
 * `connectionTimeoutMillis` Prisma passes node-pg's own Error through
 * («timeout exceeded when trying to connect») instead of P2024.
 */
export function isDbBusyError(error: unknown): boolean {
  if (
    error instanceof Error &&
    !(error instanceof Prisma.PrismaClientKnownRequestError) &&
    PG_POOL_TIMEOUT.test(error.message)
  ) {
    return true;
  }
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return (
    error.code === 'P2024' ||
    (error.code === 'P2028' &&
      error.message.includes('Unable to start a transaction')) ||
    // DAST 26.11: P2034 (SQLSTATE 40001/40P01, write conflict or deadlock)
    // that reaches here has already used up withTxRetry's attempts. PostgreSQL
    // rolled the whole transaction back, nothing of it was stored, and its
    // documentation prescribes «retry the transaction»: the same answer as a
    // full pool, not a 500 (seen on settings PUTs racing on the audit chain).
    error.code === 'P2034'
  );
}

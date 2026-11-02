import { Prisma } from '@prisma/client';

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
 */
export function isDbBusyError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2024') return true;
  return (
    error.code === 'P2028' &&
    error.message.includes('Unable to start a transaction')
  );
}

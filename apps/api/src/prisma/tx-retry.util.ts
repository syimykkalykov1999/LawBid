import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
} from '@prisma/client/runtime/client';
import { Prisma } from '../generated/prisma/client';
import { sqlStateOf } from '../common/resilience/transient-errors';
import type { PrismaService } from './prisma.service';
import pino from 'pino';

// docs/06 §8 "число повторов транзакций (40001)": one JSON line per retry,
// picked up by the CloudWatch metric filter (infra/modules/monitoring).
const retryLog = pino({
  name: 'tx-retry',
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
});

/**
 * docs/06_PRODUCTION.md §12 (.cursorrules): "Транзакции с несколькими
 * записями только через withTxRetry(); короткие." Every transaction here runs
 * SERIALIZABLE (what the code was written against; PostgreSQL's default is
 * READ COMMITTED) and PostgreSQL can abort one under contention with
 * SQLSTATE 40001 — the client is expected to retry.
 * This wraps prisma.$transaction with bounded retries + jittered backoff
 * for exactly that case. Any other error rethrows immediately.
 *
 * Error classes are imported from '@prisma/client/runtime/client' rather
 * than off the `Prisma` namespace: with an empty schema (no models yet —
 * see prisma/schema.prisma, stage 1.3 adds the auth models) the generated
 * client doesn't re-export them on `Prisma`. Once models exist, `Prisma.*`
 * would also work, but the runtime import stays correct either way.
 */
export interface TxRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Interactive-transaction timeout (Prisma default 5 s) for big jobs. */
  timeoutMs?: number;
  /**
   * Isolation level. Default `serializable` (money, bids, accept flows and
   * everything written against it). `readCommitted` (PostgreSQL's own
   * default) is for transactions that already serialize themselves with an
   * explicit row lock (`SELECT ... FOR UPDATE`, advisory xact lock) or whose
   * writes are idempotent: it avoids SSI predicate-lock overhead and 40001
   * aborts under load (DB-ops hardening S5-7). In that mode a deadlock
   * (40P01) is retried too.
   */
  isolation?: 'serializable' | 'readCommitted';
  /** Call-site name; added to the retry log line (CloudWatch metric tag). */
  op?: string;
}

const SERIALIZATION_FAILURE = '40001';
const DEADLOCK_DETECTED = '40P01';

export async function withTxRetry<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TxRetryOptions = {},
): Promise<T> {
  // docs/02_DATABASE.md §1.1: "до 5 попыток с jitter".
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 25;

  const readCommitted = options.isolation === 'readCommitted';
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: readCommitted
          ? Prisma.TransactionIsolationLevel.ReadCommitted
          : Prisma.TransactionIsolationLevel.Serializable,
        ...(options.timeoutMs
          ? { timeout: options.timeoutMs, maxWait: 10_000 }
          : {}),
      });
    } catch (error) {
      const retriable =
        isSerializationFailure(error) || (readCommitted && isDeadlock(error));
      if (!retriable || attempt >= maxAttempts) {
        throw error;
      }
      const jitter = Math.random() * baseDelayMs;
      const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
      retryLog.info(
        {
          attempt,
          delayMs: Math.round(delay),
          ...(options.op ? { op: options.op } : {}),
          ...(readCommitted ? { isolation: 'readCommitted' } : {}),
        },
        'transaction retried',
      );
      await sleep(delay);
    }
  }
}

// Prisma 7 (driver adapter): a raw query's SQLSTATE is in
// meta.driverAdapterError, and a failed COMMIT comes through as a bare
// DriverAdapterError; sqlStateOf reads all three shapes (measured 13.11).
function isSerializationFailure(error: unknown): boolean {
  if (error instanceof PrismaClientKnownRequestError) {
    return (
      error.code === 'P2034' || sqlStateOf(error) === SERIALIZATION_FAILURE
    );
  }
  if (sqlStateOf(error) === SERIALIZATION_FAILURE) return true;
  if (error instanceof PrismaClientUnknownRequestError) {
    return error.message.includes(SERIALIZATION_FAILURE);
  }
  return false;
}

function isDeadlock(error: unknown): boolean {
  if (sqlStateOf(error) === DEADLOCK_DETECTED) return true;
  if (error instanceof PrismaClientKnownRequestError) return false;
  if (error instanceof PrismaClientUnknownRequestError) {
    return error.message.includes(DEADLOCK_DETECTED);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

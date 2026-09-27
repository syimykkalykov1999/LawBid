import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
} from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';

/**
 * docs/06_PRODUCTION.md §12 (.cursorrules): "Транзакции с несколькими
 * записями только через withTxRetry(); короткие." CockroachDB uses
 * SERIALIZABLE isolation and can abort a transaction under contention with
 * SQLSTATE 40001 ("restart transaction") — the client is expected to retry.
 * This wraps prisma.$transaction with bounded retries + jittered backoff
 * for exactly that case. Any other error rethrows immediately.
 *
 * Error classes are imported from '@prisma/client/runtime/library' rather
 * than off the `Prisma` namespace: with an empty schema (no models yet —
 * see prisma/schema.prisma, stage 1.3 adds the auth models) the generated
 * client doesn't re-export them on `Prisma`. Once models exist, `Prisma.*`
 * would also work, but the runtime import stays correct either way.
 */
export interface TxRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

const COCKROACH_SERIALIZATION_FAILURE = '40001';

export async function withTxRetry<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TxRetryOptions = {},
): Promise<T> {
  // docs/02_DATABASE.md §1.1: "до 5 попыток с jitter".
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 25;

  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return await prisma.$transaction(fn);
    } catch (error) {
      if (!isSerializationFailure(error) || attempt >= maxAttempts) {
        throw error;
      }
      const jitter = Math.random() * baseDelayMs;
      const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
      await sleep(delay);
    }
  }
}

function isSerializationFailure(error: unknown): boolean {
  if (error instanceof PrismaClientKnownRequestError) {
    const meta = error.meta as { code?: string } | undefined;
    return (
      error.code === 'P2034' || meta?.code === COCKROACH_SERIALIZATION_FAILURE
    );
  }
  if (error instanceof PrismaClientUnknownRequestError) {
    return error.message.includes(COCKROACH_SERIALIZATION_FAILURE);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

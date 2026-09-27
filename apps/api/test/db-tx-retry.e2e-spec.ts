import { PrismaClient } from '@prisma/client';
import { withTxRetry } from '../src/prisma/tx-retry.util';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * docs/02_DATABASE.md §8 stage 2.7: withTxRetry against a REAL
 * CockroachDB 40001. crdb_internal.force_retry() makes the server abort
 * the transaction with a genuine serialization failure, so this proves
 * the error Prisma surfaces from Cockroach is recognized and retried (the
 * unit test only covers a hand-built error object). A plain SELECT runs
 * first so its result reaches the client; otherwise CockroachDB retries
 * the first statement server-side and the error never surfaces.
 */
describe('withTxRetry — real 40001 from CockroachDB', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('retries a transaction the server aborted with 40001', async () => {
    let attempts = 0;
    const result = await withTxRetry(
      prisma as unknown as PrismaService,
      async (tx) => {
        attempts += 1;
        await tx.$queryRaw`SELECT 1`;
        if (attempts === 1) {
          await tx.$queryRaw`SELECT crdb_internal.force_retry('1h'::INTERVAL)`;
        }
        return tx.$queryRaw<{ ok: bigint }[]>`SELECT 1 AS ok`;
      },
      { baseDelayMs: 1 },
    );
    expect(attempts).toBe(2);
    expect(result[0].ok).toBe(1n);
  });

  it('gives up after maxAttempts', async () => {
    let attempts = 0;
    await expect(
      withTxRetry(
        prisma as unknown as PrismaService,
        async (tx) => {
          attempts += 1;
          await tx.$queryRaw`SELECT 1`;
          await tx.$queryRaw`SELECT crdb_internal.force_retry('1h'::INTERVAL)`;
        },
        { maxAttempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(3);
  });
});

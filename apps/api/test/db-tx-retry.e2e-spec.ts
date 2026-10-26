import { PrismaClient } from '@prisma/client';
import { withTxRetry } from '../src/prisma/tx-retry.util';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * docs/02_DATABASE.md §8 stage 2.7: withTxRetry against a REAL
 * PostgreSQL 40001. The server itself raises SQLSTATE 40001 inside the
 * transaction, so this proves the error Prisma surfaces is recognized and
 * retried (the unit test only covers a hand-built error object).
 */
const FORCE_40001 = `DO $$ BEGIN RAISE EXCEPTION 'forced serialization failure' USING ERRCODE = '40001'; END $$`;

describe('withTxRetry — real 40001 from PostgreSQL', () => {
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
          await tx.$executeRawUnsafe(FORCE_40001);
        }
        return tx.$queryRaw<{ ok: bigint }[]>`SELECT 1 AS ok`;
      },
      { baseDelayMs: 1 },
    );
    expect(attempts).toBe(2);
    expect(Number(result[0].ok)).toBe(1);
  });

  it('gives up after maxAttempts', async () => {
    let attempts = 0;
    await expect(
      withTxRetry(
        prisma as unknown as PrismaService,
        async (tx) => {
          attempts += 1;
          await tx.$queryRaw`SELECT 1`;
          await tx.$executeRawUnsafe(FORCE_40001);
        },
        { maxAttempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(3);
  });
});

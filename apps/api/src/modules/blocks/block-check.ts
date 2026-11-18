import { ForbiddenException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';

type Db = Prisma.TransactionClient | PrismaClient;

/** The per-pair lock key: the same whichever of the two acts. */
export function blockPairKey(a: string, b: string): string {
  return a < b ? `block-pair:${a}:${b}` : `block-pair:${b}:${a}`;
}

/**
 * Verify batch 7 (BL1, 2026-11-17): a block and a follow of the same two
 * people take this transaction-scoped advisory lock first (the repo's
 * pg_advisory_xact_lock(hashtextextended(key, 0)) pattern, as bids and
 * case invites), so a follow can never be inserted between the block's
 * check and its follow clean-up. Released at commit / rollback.
 */
export async function lockBlockPair(
  tx: Prisma.TransactionClient,
  a: string,
  b: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${blockPairKey(a, b)}, 0))`;
}

/**
 * Owner 2026-10-02 audit: the block check for modules that can't import
 * BlocksModule (cases, bids — kept dependency-light). Same rule and error
 * as BlocksService.assertNotBlocked: a block either way stops contact.
 */
export async function assertNoBlockBetween(
  db: Db,
  a: string,
  b: string,
): Promise<void> {
  if (a === b) return;
  const hit = await db.userBlock.findFirst({
    where: {
      OR: [
        { blocker_id: a, blocked_id: b },
        { blocker_id: b, blocked_id: a },
      ],
    },
    select: { blocker_id: true },
  });
  if (hit) {
    throw new ForbiddenException({
      code: ErrorCode.USER_BLOCKED,
      message: 'This user is not available.',
    });
  }
}

import { ForbiddenException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';

type Db = Prisma.TransactionClient | PrismaClient;

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

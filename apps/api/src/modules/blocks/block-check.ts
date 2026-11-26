import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { readsAreSplit } from '../../sharding/split-reads';
import { shardContext } from '../../sharding/shard-context';
import type { DbTx } from '../../prisma/secret-columns';
import type { SecretOmittingClient } from '../../prisma/secret-columns';

type Db = DbTx | SecretOmittingClient;

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
  tx: DbTx,
  a: string,
  b: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${blockPairKey(a, b)}, 0))`;
}

/**
 * BL1 across databases (KNOWN_ERRORS 215): runs [fn] while this
 * transaction holds the per-pair lock.
 *
 *  - One database (today): exactly as before, one read-committed
 *    transaction; [fn] gets its `tx` and `split = false`.
 *  - Several databases (or SHARD_SPLIT_READS=on): `Follow` lives with the
 *    follower and `UserBlock` with the blocker, so the two people's rows can
 *    sit on different databases and a lock taken on one of them is not seen
 *    by the other. The lock is taken on the PRIMARY database (`global()`),
 *    which every instance and every pair shares, in an outer transaction
 *    held until [fn] ends; [fn] gets the routed client (`prisma`) and
 *    `split = true`, and runs each read and write in the database of the
 *    row's owner (`shardContext.runForUser`). Those writes commit before the
 *    lock is released, so the other side, once it gets the lock, sees them.
 */
export async function withBlockPairLock<T>(
  prisma: PrismaService,
  a: string,
  b: string,
  op: string,
  fn: (db: Db, split: boolean) => Promise<T>,
): Promise<T> {
  const options = { isolation: 'readCommitted', op } as const;
  if (!readsAreSplit(prisma)) {
    return withTxRetry(
      prisma,
      async (tx) => {
        await lockBlockPair(tx, a, b);
        return fn(tx, false);
      },
      options,
    );
  }
  return withTxRetry(
    prisma.global(),
    async (lockTx) => {
      await lockBlockPair(lockTx, a, b);
      return fn(prisma, true);
    },
    options,
  );
}

/**
 * The block check of [assertNoBlockBetween] when the two blockers' rows can
 * be on different databases: each direction is read in its blocker's
 * database (UserBlock is owned by blocker_id), whatever the outer context.
 */
export async function assertNoBlockRouted(
  db: Db,
  a: string,
  b: string,
): Promise<void> {
  if (a === b) return;
  for (const [blocker, blocked] of [
    [a, b],
    [b, a],
  ]) {
    const hit = await shardContext.runForUser(blocker, () =>
      db.userBlock.findFirst({
        where: { blocker_id: blocker, blocked_id: blocked },
        select: { blocker_id: true },
      }),
    );
    if (hit) {
      throw new ForbiddenException({
        code: ErrorCode.USER_BLOCKED,
        message: 'This user is not available.',
      });
    }
  }
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

import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** True when either of the two blocked the other (no DI — usable from
 * modules that can't import BlocksModule without a cycle). */
export async function blockedEitherWay(
  db: Db,
  a: string,
  b: string,
): Promise<boolean> {
  if (a === b) return false;
  const row = await db.userBlock.findFirst({
    where: {
      OR: [
        { blocker_id: a, blocked_id: b },
        { blocker_id: b, blocked_id: a },
      ],
    },
    select: { blocker_id: true },
  });
  return row !== null;
}

/** Audit 2026-10-01: a block stops every interaction — comments, likes,
 * saves, reviews — not only messages and follows. */
export async function assertNoBlock(
  db: Db,
  a: string,
  b: string,
): Promise<void> {
  if (await blockedEitherWay(db, a, b)) {
    throw new ForbiddenException({
      code: ErrorCode.USER_BLOCKED,
      message: 'This user is not available.',
    });
  }
}

/** Case statuses of accepted work that isn't closed yet. */
const CASE_WORK_STATUSES = ['in_progress', 'pending_completion', 'disputed'];

/** The chat of a case whose bid was accepted and which isn't closed: a
 * block doesn't stop its messages or calls (OQ-028 — cases in progress
 * are untouched by blocks). */
export async function caseWorkOngoing(
  db: Db,
  conv: {
    case_id: string | null;
    contacts_unlocked: boolean;
    status: string;
  },
): Promise<boolean> {
  if (!conv.case_id || !conv.contacts_unlocked || conv.status === 'closed') {
    return false;
  }
  const kase = await db.case.findUnique({
    where: { id: conv.case_id },
    select: { status: true },
  });
  return !!kase && CASE_WORK_STATUSES.includes(kase.status);
}

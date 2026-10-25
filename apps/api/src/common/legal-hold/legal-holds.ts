import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Owner 2026-10-28 (legal requests): ONE place that answers "is this
 * person / case / chat / group under a legal hold?" for every automatic
 * deletion or retention job. A hold (table `legal_holds`) is in force while
 * it is not released and not expired. Preservation requests
 * (18 U.S.C. 2703(f)) must freeze data even when the retention window of a
 * job has passed, so EVERY job that destroys user-linked rows calls this.
 *
 * The set of held ids is tiny (a handful of open requests), so a job reads
 * it once per run and excludes it with `= ANY(...)` / `notIn`: no join on
 * the big table.
 */
export type HoldTarget = 'user' | 'case' | 'conversation' | 'group';

type HoldReader = Pick<PrismaService, 'legalHold'>;

/** Ids of one kind that are under an active hold right now. */
export async function activeHeldIds(
  prisma: HoldReader,
  type: HoldTarget,
  now: Date = new Date(),
): Promise<string[]> {
  const rows = await prisma.legalHold.findMany({
    where: {
      target_type: type,
      released_at: null,
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    },
    select: { target_id: true },
    take: 10_000,
  });
  return [...new Set(rows.map((r) => r.target_id))];
}

/** SQL: the column is NOT one of the held ids (NULL stays deletable). */
export function notHeldSql(col: Prisma.Sql, ids: string[]): Prisma.Sql {
  if (ids.length === 0) return Prisma.sql`TRUE`;
  return Prisma.sql`(${col} IS NULL OR NOT (${col} = ANY(${ids}::UUID[])))`;
}

/** Prisma filter for `notIn`; undefined when nothing is held. */
export function notInHeld(ids: string[]): { notIn: string[] } | undefined {
  return ids.length ? { notIn: ids } : undefined;
}

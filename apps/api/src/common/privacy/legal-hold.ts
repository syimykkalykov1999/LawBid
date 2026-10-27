import { Prisma } from '@prisma/client';

/**
 * Owner 2026-10-25 (privacy round 13, S13-6): ONE answer to "is this held?"
 * for every purge job. A legal hold (`legal_holds`, created through an
 * official request) overrides every retention rule: while it is in force
 * (not released, not expired) nothing about its target may be deleted,
 * scrubbed or anonymized.
 *
 * Generic on purpose (a target is `type` + `id`): the legal-requests branch
 * that creates and releases holds only has to use these helpers and may add
 * target types here; it needs no second hold model. Lives in `common/` so
 * the storage, notifications and privacy modules can share it without
 * importing each other (module-boundaries rule).
 */
export const HOLD_TARGET_TYPES = [
  'user',
  'conversation',
  'group',
  'case',
  'file',
] as const;
export type HoldTargetType = (typeof HOLD_TARGET_TYPES)[number];

export interface HoldTarget {
  type: HoldTargetType;
  id: string;
}

/** The only thing a hold check needs from the database client. */
export interface HoldReader {
  legalHold: Pick<Prisma.LegalHoldDelegate, 'findFirst'>;
}

const inForce = (now: Date): Prisma.LegalHoldWhereInput => ({
  released_at: null,
  OR: [{ expires_at: null }, { expires_at: { gt: now } }],
});

/** True while a hold on the target is in force. */
export async function isHeld(
  db: HoldReader,
  type: HoldTargetType,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  return isAnyHeld(db, [{ type, id }], now);
}

/** True while a hold on ANY of the targets is in force (one query). */
export async function isAnyHeld(
  db: HoldReader,
  targets: HoldTarget[],
  now: Date = new Date(),
): Promise<boolean> {
  if (targets.length === 0) return false;
  const hold = await db.legalHold.findFirst({
    where: {
      AND: [
        inForce(now),
        { OR: targets.map((t) => ({ target_type: t.type, target_id: t.id })) },
      ],
    },
    select: { id: true },
  });
  return hold !== null;
}

/**
 * SQL form for set-based purge statements:
 * `AND NOT ${heldSql('user', Prisma.sql`m.sender_id`)}`.
 * [idSql] must be a UUID expression.
 */
export function heldSql(type: HoldTargetType, idSql: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM legal_holds h
    WHERE h.target_type = ${type} AND h.target_id = ${idSql}
      AND h.released_at IS NULL AND (h.expires_at IS NULL OR h.expires_at > now()))`;
}

/** The same for rows that belong to an official request (data_access_log):
 * any hold of that request keeps its access records. */
export function requestHeldSql(requestIdSql: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM legal_holds h
    WHERE h.request_id = ${requestIdSql}
      AND h.released_at IS NULL AND (h.expires_at IS NULL OR h.expires_at > now()))`;
}

/** The subset of [ids] that is held as [type] (one query), e.g. the files
 * of a person a purge is about to release. */
export async function heldIds(
  db: { legalHold: Pick<Prisma.LegalHoldDelegate, 'findMany'> },
  type: HoldTargetType,
  ids: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  const held = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db.legalHold.findMany({
      where: {
        AND: [
          inForce(now),
          { target_type: type, target_id: { in: ids.slice(i, i + 500) } },
        ],
      },
      select: { target_id: true },
    });
    for (const r of rows) held.add(r.target_id);
  }
  return held;
}

/** Every target of [type] under an active hold (holds are few; for jobs
 * that filter in memory or with a `NOT IN` list). */
export async function heldTargets(
  db: { legalHold: Pick<Prisma.LegalHoldDelegate, 'findMany'> },
  type: HoldTargetType,
  now: Date = new Date(),
): Promise<string[]> {
  const rows = await db.legalHold.findMany({
    where: { AND: [inForce(now), { target_type: type }] },
    select: { target_id: true },
    take: 10_000,
  });
  return [...new Set(rows.map((r) => r.target_id))];
}

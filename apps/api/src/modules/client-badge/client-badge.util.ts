import { type ClientVerification, Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { clientsWithEntitlementSql } from '../plans/entitlements.service';

/** Owner 2026-10-02: a client's gold badge shows only while the admin's
 * approval stands AND the $10/month is paid. `comped` = given free by an
 * admin; a cancelled subscription keeps the badge until the paid period
 * ends. Past-due (failed payment) or revoked = no badge. */
export function clientBadgeActive(
  row: Pick<
    ClientVerification,
    'status' | 'sub_status' | 'current_period_end'
  > | null,
  now: Date = new Date(),
): boolean {
  if (!row || row.status !== 'approved') return false;
  if (row.sub_status === 'active' || row.sub_status === 'comped') return true;
  return (
    row.sub_status === 'canceled' &&
    row.current_period_end !== null &&
    row.current_period_end > now
  );
}

/** Which of these users wear the gold badge (one query for a whole page).
 * Owner 2026-10-05 (plan builder): approved documents + either the old
 * badge subscription or a plan whose entitlements include the badge. */
export async function activeClientBadgeIds(
  prisma: Pick<PrismaService, 'clientVerification' | '$queryRaw'>,
  userIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  let rows: {
    user_id: string;
    status: string;
    sub_status: string;
    current_period_end: Date | null;
  }[];
  try {
    rows = await prisma.clientVerification.findMany({
      where: { user_id: { in: ids }, status: 'approved' },
      select: {
        user_id: true,
        status: true,
        sub_status: true,
        current_period_end: true,
      },
    });
  } catch (e) {
    // The badge table is not migrated yet (P2021): a feed must never break
    // over a decoration — nobody wears the badge until it exists.
    if ((e as { code?: string }).code === 'P2021') return new Set();
    throw e;
  }
  const now = new Date();
  const out = new Set(
    rows.filter((r) => clientBadgeActive(r, now)).map((r) => r.user_id),
  );
  const approvedUnpaid = rows
    .filter((r) => !out.has(r.user_id))
    .map((r) => r.user_id);
  if (approvedUnpaid.length) {
    for (const id of await planBadgeHolders(prisma, approvedUnpaid))
      out.add(id);
  }
  return out;
}

/** Approved clients among [userIds] whose live plan includes the badge. */
export async function planBadgeHolders(
  prisma: Pick<PrismaService, '$queryRaw'>,
  userIds: readonly string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      WHERE u.id = ANY(${[...userIds]}::UUID[])
        AND ${clientsWithEntitlementSql('verified_badge', Prisma.sql`u.id`)}`;
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}

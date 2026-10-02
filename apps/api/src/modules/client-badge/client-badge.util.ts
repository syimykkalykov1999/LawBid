import type { ClientVerification } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

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

/** Which of these users wear the gold badge (one query for a whole page). */
export async function activeClientBadgeIds(
  prisma: Pick<PrismaService, 'clientVerification'>,
  userIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  const rows = await prisma.clientVerification.findMany({
    where: { user_id: { in: ids }, status: 'approved' },
    select: {
      user_id: true,
      status: true,
      sub_status: true,
      current_period_end: true,
    },
  });
  const now = new Date();
  return new Set(
    rows.filter((r) => clientBadgeActive(r, now)).map((r) => r.user_id),
  );
}

import type { Prisma } from '@prisma/client';

/**
 * Owner 2026-10-02: free subscriptions under a contract (blogger
 * attorneys). An unrevoked `contract_grants` row with
 * `starts_at <= now < ends_at` counts as an active subscription
 * (SubscriptionAccessService.isActive) and carries its own assistant
 * seats; the effective seat count is max(paid seats, grant seats).
 */
export type GrantDb = Pick<Prisma.TransactionClient, 'contractGrant'>;

export interface ActiveGrant {
  id: string;
  ends_at: Date;
  assistant_seats: number;
}

export function activeGrantWhere(
  userId: string,
  now = new Date(),
): Prisma.ContractGrantWhereInput {
  return {
    user_id: userId,
    revoked_at: null,
    starts_at: { lte: now },
    ends_at: { gt: now },
  };
}

/** Pure rule over one row (shared with the tests and the admin list). */
export function grantIsActive(
  g: { revoked_at: Date | null; starts_at: Date; ends_at: Date },
  now = new Date(),
): boolean {
  return !g.revoked_at && g.starts_at <= now && now < g.ends_at;
}

/**
 * The attorney's active grant: the latest end date and the most seats
 * among overlapping grants. Null when none.
 */
export async function findActiveGrant(
  db: GrantDb,
  userId: string,
  now = new Date(),
): Promise<ActiveGrant | null> {
  const rows = await db.contractGrant.findMany({
    where: activeGrantWhere(userId, now),
    select: { id: true, ends_at: true, assistant_seats: true },
    orderBy: { ends_at: 'desc' },
    take: 10,
  });
  const first = rows[0];
  if (!first) return null;
  return {
    id: first.id,
    ends_at: first.ends_at,
    assistant_seats: Math.max(...rows.map((r) => r.assistant_seats)),
  };
}

/** Seats bought on the Stripe subscription (the yearly plan has 6). */
export function paidSeats(
  sub: { plan: string; assistant_seats: number } | null,
): number {
  if (!sub) return 0;
  return sub.plan === 'yearly' ? 6 : sub.assistant_seats;
}

/** max(paid seats, active grant seats). */
export function effectiveSeats(
  paid: number,
  grantSeats: number | null,
): number {
  return Math.max(paid, grantSeats ?? 0);
}

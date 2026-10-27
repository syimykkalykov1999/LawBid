import { Prisma } from '@prisma/client';
import type {
  StaffNumberKey,
  StaffSwitchKey,
} from '../staff-core/staff-settings.defaults';
import type { WorkLeaseKind } from '../../common/staff-events';

/**
 * Staff package T3: how each work queue plugs into the lease engine.
 * A source answers three questions about its own items and nothing else:
 *  - `candidates`: the oldest still-open items this admin may take, in the
 *    order the queue works today, with the ones other people hold (or that
 *    exclude this admin: «не решено», skipped) already left out;
 *  - `onClaimed`: the queue's own bookkeeping when the claim stuck (support
 *    keeps `assignee_id` in step); false = the item is no longer takeable;
 *  - `onReleased`: undo that bookkeeping when the lease goes back.
 * Reading the tables directly (not through the queue modules) keeps the
 * module boundary clean; the queue modules stay untouched.
 */
export interface LeaseActorContext {
  adminId: string;
  /** Countries the admin is limited to; null = every country. */
  countries?: string[] | null;
}

export interface LeaseCandidate {
  id: string;
}

export interface CandidateQuery extends LeaseActorContext {
  /** Minutes a «not mine» exclusion holds before the person may take it again. */
  excludeMinutes: number;
  limit: number;
}

export interface LeaseQueueSource {
  kind: WorkLeaseKind;
  /** The admin area (route segment) whose right the queue needs. */
  routePath: string;
  /** Per-queue switch (also needs `staff.lease_enabled`). */
  switch: StaffSwitchKey;
  /** Lease length setting, minutes. */
  ttlSetting: StaffNumberKey;
  candidates(
    tx: Prisma.TransactionClient,
    q: CandidateQuery,
  ): Promise<LeaseCandidate[]>;
  onClaimed(
    tx: Prisma.TransactionClient,
    adminId: string,
    itemId: string,
  ): Promise<boolean>;
  onReleased?(
    tx: Prisma.TransactionClient,
    adminId: string,
    itemId: string,
  ): Promise<void>;
  /** Of these held items, the ones that still count against capacity. */
  stillOpen?(
    tx: Prisma.TransactionClient,
    itemIds: string[],
  ): Promise<string[]>;
}

/** `true` while somebody else holds the item or it excludes this admin. */
function blocked(
  kind: WorkLeaseKind,
  item: Prisma.Sql,
  adminId: string,
  excludeMinutes: number,
): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM work_leases wl
    WHERE wl.kind = ${kind} AND wl.item_id = ${item}
      AND ((wl.admin_id IS NOT NULL AND wl.leased_until > now())
        OR (${adminId}::uuid = ANY(COALESCE(wl.excluded_admin_ids, ARRAY[]::uuid[]))
            AND wl.updated_at > now() - make_interval(mins => ${excludeMinutes}::int)))
  )`;
}

/** A re-opened item (priority raised by `reopen`) goes first. */
function priority(kind: WorkLeaseKind, item: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`COALESCE((SELECT wl.priority FROM work_leases wl
    WHERE wl.kind = ${kind} AND wl.item_id = ${item}), 0)`;
}

function inCountries(
  column: Prisma.Sql,
  countries: string[] | null | undefined,
): Prisma.Sql {
  return countries
    ? Prisma.sql`AND ${column}::text = ANY(${countries}::text[])`
    : Prisma.empty;
}

type Row = { id: string };

/** How many of the oldest pending review appeals one «Следующий» looks through. */
const REVIEW_APPEAL_WINDOW = 100;

/** Support tickets: «Следующий» as it works today (mine first, then the
 * most overdue free one), now one item per person. */
const supportSource: LeaseQueueSource = {
  kind: 'support_ticket',
  routePath: '/admin/support/tickets/next',
  switch: 'staff.lease_support_enabled',
  ttlSetting: 'staff.lease.ttl_ticket_min',
  async candidates(tx, q) {
    const item = Prisma.sql`t.id`;
    return tx.$queryRaw<Row[]>`
      SELECT t.id::text AS id
      FROM support_tickets t
      WHERE t.status = 'open'
        AND (t.assignee_id IS NULL OR t.assignee_id = ${q.adminId}::uuid)
        ${inCountries(Prisma.sql`t.country_code`, q.countries)}
        AND NOT ${blocked('support_ticket', item, q.adminId, q.excludeMinutes)}
      ORDER BY ${priority('support_ticket', item)} DESC,
               (t.assignee_id IS NULL) ASC,
               t.sla_due_at ASC NULLS LAST,
               t.last_message_at ASC,
               t.id ASC
      LIMIT ${q.limit}
      FOR UPDATE OF t SKIP LOCKED`;
  },
  async onClaimed(tx, adminId, itemId) {
    const took = await tx.supportTicket.updateMany({
      where: { id: itemId, status: 'open', assignee_id: null },
      data: { assignee_id: adminId, assigned_at: new Date() },
    });
    if (took.count === 1) return true;
    return (
      (await tx.supportTicket.count({
        where: { id: itemId, status: 'open', assignee_id: adminId },
      })) === 1
    );
  },
  async onReleased(tx, adminId, itemId) {
    // Back to the free pool, but only while still open and still mine.
    await tx.supportTicket.updateMany({
      where: { id: itemId, status: 'open', assignee_id: adminId },
      data: { assignee_id: null },
    });
  },
  async stillOpen(tx, ids) {
    // A ticket waiting for the client is held but not «in the hands».
    const rows = await tx.supportTicket.findMany({
      where: { id: { in: ids }, status: 'open' },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },
};

/** Lawyer documents: oldest submitted request first. */
const verificationSource: LeaseQueueSource = {
  kind: 'verification',
  routePath: '/admin/verification/requests/next',
  switch: 'staff.lease_verification_enabled',
  ttlSetting: 'staff.lease.ttl_verification_min',
  async candidates(tx, q) {
    const item = Prisma.sql`t.id`;
    return tx.$queryRaw<Row[]>`
      SELECT t.id::text AS id
      FROM verification_requests t
      JOIN users u ON u.id = t.attorney_id
      WHERE t.status IN ('submitted', 'in_review')
        AND t.submitted_at IS NOT NULL
        ${inCountries(Prisma.sql`u.country_code`, q.countries)}
        AND NOT ${blocked('verification', item, q.adminId, q.excludeMinutes)}
      ORDER BY ${priority('verification', item)} DESC,
               t.submitted_at ASC, t.id ASC
      LIMIT ${q.limit}
      FOR UPDATE OF t SKIP LOCKED`;
  },
  async onClaimed(tx, _adminId, itemId) {
    return (
      (await tx.verificationRequest.count({
        where: { id: itemId, status: { in: ['submitted', 'in_review'] } },
      })) === 1
    );
  },
};

/** Reports: one lease per reported object (the queue groups by object);
 * a priority-review object first, then the oldest. */
const reportSource: LeaseQueueSource = {
  kind: 'report',
  routePath: '/admin/moderation/queue/next',
  switch: 'staff.lease_report_enabled',
  ttlSetting: 'staff.lease.ttl_report_min',
  async candidates(tx, q) {
    const item = Prisma.sql`r.target_id`;
    const scope = q.countries
      ? Prisma.sql`AND r.reporter_id IN (SELECT id FROM users WHERE country_code::text = ANY(${q.countries}::text[]))`
      : Prisma.empty;
    return tx.$queryRaw<Row[]>`
      SELECT r.target_id::text AS id
      FROM reports r
      WHERE r.status = 'open'
        ${scope}
        AND NOT ${blocked('report', item, q.adminId, q.excludeMinutes)}
      GROUP BY r.target_id
      ORDER BY ${priority('report', item)} DESC,
               bool_or(r.priority_review) DESC,
               min(r.created_at) ASC, r.target_id ASC
      LIMIT ${q.limit}`;
  },
  async onClaimed(tx, _adminId, itemId) {
    return (
      (await tx.report.count({
        where: { target_id: itemId, status: 'open' },
      })) > 0
    );
  },
};

/** Appeals of a moderation decision. Independence rule: never to the
 * admin who took the disputed decision. */
const modAppealSource: LeaseQueueSource = {
  kind: 'mod_appeal',
  routePath: '/admin/moderation/appeals/next',
  switch: 'staff.lease_appeal_enabled',
  ttlSetting: 'staff.lease.ttl_appeal_min',
  async candidates(tx, q) {
    const item = Prisma.sql`a.id`;
    return tx.$queryRaw<Row[]>`
      SELECT a.id::text AS id
      FROM moderation_appeals a
      JOIN moderation_actions m ON m.id = a.action_id
      JOIN users u ON u.id = a.appellant_id
      WHERE a.status = 'pending'
        AND m.admin_id <> ${q.adminId}::uuid
        ${inCountries(Prisma.sql`u.country_code`, q.countries)}
        AND NOT ${blocked('mod_appeal', item, q.adminId, q.excludeMinutes)}
      ORDER BY ${priority('mod_appeal', item)} DESC,
               a.created_at ASC, a.id ASC
      LIMIT ${q.limit}
      FOR UPDATE OF a SKIP LOCKED`;
  },
  async onClaimed(tx, _adminId, itemId) {
    return (
      (await tx.moderationAppeal.count({
        where: { id: itemId, status: 'pending' },
      })) === 1
    );
  },
};

/** Appeals of a review removal. `client_review_appeals` belongs to the
 * sharded «case» family, so no SQL joins reach across to users / leases:
 * the oldest pending ones are read first, then filtered in two plain
 * reads (shard-ready, docs/architecture/SHARDING_READY.md). */
const reviewAppealSource: LeaseQueueSource = {
  kind: 'review_appeal',
  routePath: '/admin/review-appeals/next',
  switch: 'staff.lease_appeal_enabled',
  ttlSetting: 'staff.lease.ttl_appeal_min',
  async candidates(tx, q) {
    const rows = await tx.clientReviewAppeal.findMany({
      where: { status: 'pending' },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: REVIEW_APPEAL_WINDOW,
      select: { id: true, appellant_id: true },
    });
    let pool = rows;
    if (q.countries && pool.length > 0) {
      const ok = new Set(
        (
          await tx.user.findMany({
            where: {
              id: { in: pool.map((r) => r.appellant_id) },
              country_code: { in: q.countries },
            },
            select: { id: true },
          })
        ).map((u) => u.id),
      );
      pool = pool.filter((r) => ok.has(r.appellant_id));
    }
    if (pool.length === 0) return [];
    const leases = new Map(
      (
        await tx.workLease.findMany({
          where: {
            kind: 'review_appeal',
            item_id: { in: pool.map((r) => r.id) },
          },
        })
      ).map((l) => [l.item_id, l]),
    );
    const now = Date.now();
    const cutoff = now - q.excludeMinutes * 60_000;
    const free = pool.filter((r) => {
      const l = leases.get(r.id);
      if (!l) return true;
      if (l.admin_id && l.leased_until && l.leased_until.getTime() > now) {
        return false;
      }
      return !(
        l.excluded_admin_ids.includes(q.adminId) &&
        l.updated_at.getTime() > cutoff
      );
    });
    // Re-opened ones first (stable: the DB order is kept inside a priority).
    const prio = (id: string) => leases.get(id)?.priority ?? 0;
    return free
      .map((r, i) => ({ id: r.id, i }))
      .sort((x, y) => prio(y.id) - prio(x.id) || x.i - y.i)
      .slice(0, q.limit)
      .map(({ id }) => ({ id }));
  },
  async onClaimed(tx, _adminId, itemId) {
    return (
      (await tx.clientReviewAppeal.count({
        where: { id: itemId, status: 'pending' },
      })) === 1
    );
  },
};

export const LEASE_QUEUE_SOURCES: readonly LeaseQueueSource[] = [
  supportSource,
  verificationSource,
  reportSource,
  modAppealSource,
  reviewAppealSource,
];

const BY_KIND = new Map<string, LeaseQueueSource>(
  LEASE_QUEUE_SOURCES.map((s) => [s.kind, s]),
);

export function leaseSourceFor(kind: string): LeaseQueueSource | undefined {
  return BY_KIND.get(kind);
}

export const LEASE_QUEUE_KINDS: readonly WorkLeaseKind[] =
  LEASE_QUEUE_SOURCES.map((s) => s.kind);

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import {
  LEASE_EVENT,
  LEASE_REASON,
  STAFF_SERVER_EVENTS,
  type LeaseEventName,
  type LeaseReason,
  type WorkLeaseKind,
} from '../../common/staff-events';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ck } from '../../redis/redis-cluster-safe';
import type {
  LeaseActorRef,
  LeaseNextResult,
  LeasePort,
} from '../staff-core/lease.port';
import type { StaffSettings } from '../staff-core/staff-settings.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { LEASE_GOLDEN, type LeaseGolden } from './lease-golden';
import { leaseSourceFor, type LeaseQueueSource } from './lease-queue-sources';
import {
  StaffPresenceService,
  type PresenceReading,
} from './staff-presence.service';
import { StaffEventsPublisher } from './staff-events.publisher';

const log = new Logger('WorkLease');

/** How many candidates one «Следующий» looks at before saying «empty». */
const CANDIDATES_PER_TRY = 10;
/** An expired lease is renewed on its own at most this many times (then «долго держал»). */
export const MAX_AUTO_RENEWALS = 2;
/** The sweep looks at no more than this many held leases per run. */
const SWEEP_LIMIT = 2000;
/** A free lease row nobody touched for this long is dropped by the sweep. */
const FREE_ROW_DAYS = 30;

export interface LeaseView {
  kind: WorkLeaseKind;
  itemId: string;
  adminId: string;
  takenAt: Date;
  leasedUntil: Date;
  attempt: number;
}

export type NextOutcome =
  | { status: 'leased'; lease: LeaseView }
  | { status: 'busy'; held: LeaseView[] }
  | { status: 'empty' }
  | { status: 'wrap_up'; retryAfterSec: number }
  | { status: 'away' | 'offline' | 'off' };

interface LeaseRow {
  kind: string;
  item_id: string;
  admin_id: string;
  taken_at: Date;
  leased_until: Date;
  last_renew_at: Date | null;
  attempt: number;
}

const toView = (r: LeaseRow): LeaseView => ({
  kind: r.kind as WorkLeaseKind,
  itemId: r.item_id,
  adminId: r.admin_id,
  takenAt: r.taken_at,
  leasedUntil: r.leased_until,
  attempt: r.attempt,
});

const wrapUpKey = (adminId: string) =>
  ck(`staff:${adminId}`, `staff:wrapup:${adminId}`);
const skipsKey = (adminId: string) =>
  ck(`staff:${adminId}`, `staff:skips:${adminId}`);
const timerKey = (kind: string, itemId: string) => `${kind}:${itemId}`;

export type SweepDecision =
  | { action: 'keep' }
  | { action: 'renew' }
  | { action: 'release'; reason: LeaseReason };

export interface SweepSubject {
  takenAt: Date;
  leasedUntil: Date | null;
  lastRenewAt: Date | null;
  ttlMs: number;
}

export interface SweepPolicy {
  now: number;
  presenceOn: boolean;
  graceMs: number;
  idleMs: number;
  activeWindowMs: number;
}

/**
 * Pure decision of the sweep for ONE held lease (unit-tested):
 *  - presence on: no signal for the grace period -> `disconnected`; tab
 *    open but no movement for the idle time -> `idle`;
 *  - past the lease time: the person is online and moving -> renewed on
 *    its own (at most MAX_AUTO_RENEWALS times, then `held_too_long`);
 *    otherwise `expired`;
 *  - presence off: only the clock counts.
 */
export function decideSweep(
  s: SweepSubject,
  p: PresenceReading | null,
  policy: SweepPolicy,
): SweepDecision {
  const { now } = policy;
  const ref = Math.max(s.lastRenewAt?.getTime() ?? 0, s.takenAt.getTime());
  if (policy.presenceOn && p) {
    const lastSignal = Math.max(p.seenMs ?? 0, ref);
    if (now - lastSignal > policy.graceMs) {
      return { action: 'release', reason: LEASE_REASON.disconnected };
    }
    if (p.signalling && now - Math.max(p.activeMs ?? 0, ref) > policy.idleMs) {
      return { action: 'release', reason: LEASE_REASON.idle };
    }
  }
  const expired = s.leasedUntil !== null && s.leasedUntil.getTime() < now;
  if (!expired) return { action: 'keep' };
  const heldMs = now - s.takenAt.getTime();
  const moving =
    policy.presenceOn &&
    p !== null &&
    p.signalling &&
    !p.manualAway &&
    p.activeMs !== null &&
    now - p.activeMs <= policy.activeWindowMs;
  if (moving) {
    return heldMs >= s.ttlMs * (MAX_AUTO_RENEWALS + 1)
      ? { action: 'release', reason: LEASE_REASON.heldTooLong }
      : { action: 'renew' };
  }
  return { action: 'release', reason: LEASE_REASON.expired };
}

/**
 * Staff package T3: the routing engine. One item, one worker — held by the
 * database (`UNIQUE(kind, item_id)` + an atomic upsert), not by code:
 *  - `next` finds the oldest free item the person may take and leases it
 *    in one transaction (candidates are read `FOR UPDATE SKIP LOCKED`, the
 *    claim is `INSERT … ON CONFLICT DO UPDATE … WHERE free or expired`);
 *  - heartbeat/idle/expiry are enforced by the sweep (`staff.lease-sweep`)
 *    and the socket's grace timer; both end in `end()`;
 *  - «не решено» (`reopen`) puts the item back first in line, excluding
 *    the previous worker for `staff.reopen.return_after_min` minutes.
 * Everything is off until `staff.lease_enabled` AND the queue's own switch
 * are on: the queues' old behaviour is untouched and no row is written.
 */
@Injectable()
export class LeaseService implements LeasePort {
  private readonly warnTimers = new Map<string, NodeJS.Timeout>();
  private readonly workspaceOf = new Map<
    string,
    { workspace: string; at: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly staff: StaffSettingsService,
    private readonly presence: StaffPresenceService,
    private readonly events: StaffEventsPublisher,
    // Staff package T4: golden tasks (modules/staff-desk). Absent = none.
    @Optional() @Inject(LEASE_GOLDEN) private readonly golden?: LeaseGolden,
  ) {}

  // --- switches ------------------------------------------------------------

  /** Master switch + the queue's own switch. */
  async servesQueue(kind: string): Promise<boolean> {
    const src = leaseSourceFor(kind);
    if (!src) return false;
    return this.staff.isOn(src.switch);
  }

  // --- «Следующий» ---------------------------------------------------------

  async nextFor(kind: string, actor: LeaseActorRef): Promise<LeaseNextResult> {
    const r = await this.next(kind, actor);
    switch (r.status) {
      case 'leased':
        return { status: 'leased', itemId: r.lease.itemId };
      case 'busy':
        return { status: 'busy', heldItemIds: r.held.map((h) => h.itemId) };
      case 'wrap_up':
        return { status: 'wrap_up', retryAfterSec: r.retryAfterSec };
      default:
        return { status: r.status };
    }
  }

  async next(kind: string, actor: LeaseActorRef): Promise<NextOutcome> {
    const src = leaseSourceFor(kind);
    if (!src || !(await this.servesQueue(kind))) return { status: 'off' };
    const cfg = await this.staff.get();
    if (cfg.switches['staff.presence_enabled']) {
      const st = await this.presence.status(actor.adminId);
      if (st === 'away') return { status: 'away' };
      if (st === 'offline') return { status: 'offline' };
    }
    const wait = await this.wrapUpLeft(actor.adminId);
    if (wait > 0) return { status: 'wrap_up', retryAfterSec: wait };

    const ttlSec = cfg.numbers[src.ttlSetting] * 60;
    const excludeMinutes = cfg.numbers['staff.reopen.return_after_min'];
    // A golden task waiting for this person comes first and looks like any
    // other item (same lease, same timer); the worker is never told.
    const goldenId = await this.pickGolden(actor.adminId, kind);
    const outcome = await withTxRetry(
      this.prisma,
      async (tx): Promise<NextOutcome> => {
        // One «Следующий» at a time per person: capacity cannot be beaten
        // by two fast clicks.
        await this.lockPerson(tx, actor.adminId);
        const held = await this.heldInHands(tx, actor.adminId);
        if (this.atCapacity(kind, held, cfg)) {
          return {
            status: 'busy',
            held: held.filter((h) => h.counts).map((h) => h.view),
          };
        }
        if (goldenId) {
          const g = await this.tryClaim(
            tx,
            src,
            goldenId,
            actor.adminId,
            ttlSec,
            0,
            true,
          );
          if (g) return { status: 'leased', lease: g };
        }
        const cands = await src.candidates(tx, {
          adminId: actor.adminId,
          countries: actor.countries ?? null,
          excludeMinutes,
          limit: CANDIDATES_PER_TRY,
        });
        for (const c of cands) {
          const lease = await this.tryClaim(
            tx,
            src,
            c.id,
            actor.adminId,
            ttlSec,
            excludeMinutes,
            false,
            true,
          );
          if (lease) return { status: 'leased', lease };
        }
        return { status: 'empty' };
      },
      { isolation: 'readCommitted', op: 'lease.next' },
    );
    if (outcome.status === 'leased') {
      this.afterGrant(outcome.lease, ttlSec, cfg);
    }
    return outcome;
  }

  /** A specific item (a list click, a head's assignment). Null = taken / excluded / not takeable. */
  async claim(
    kind: string,
    itemId: string,
    adminId: string,
  ): Promise<LeaseView | null> {
    const src = leaseSourceFor(kind);
    if (!src || !(await this.servesQueue(kind))) return null;
    const cfg = await this.staff.get();
    const ttlSec = cfg.numbers[src.ttlSetting] * 60;
    const lease = await withTxRetry(
      this.prisma,
      async (tx) => {
        await this.lockPerson(tx, adminId);
        const held = await this.heldInHands(tx, adminId);
        if (this.atCapacity(kind, held, cfg)) return null;
        return this.tryClaim(
          tx,
          src,
          itemId,
          adminId,
          ttlSec,
          cfg.numbers['staff.reopen.return_after_min'],
        );
      },
      { isolation: 'readCommitted', op: 'lease.claim' },
    );
    if (lease) this.afterGrant(lease, ttlSec, cfg);
    return lease;
  }

  private async lockPerson(
    tx: Prisma.TransactionClient,
    adminId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lease:${adminId}`}))`;
  }

  /** The atomic claim: free or expired, and not excluding this person. */
  private async tryClaim(
    tx: Prisma.TransactionClient,
    src: LeaseQueueSource,
    itemId: string,
    adminId: string,
    ttlSec: number,
    excludeMinutes: number,
    golden = false,
    skipIfBusy = false,
  ): Promise<LeaseView | null> {
    // Load test round 2 (docs/perf/LOCAL_LOAD_TEST_2026-10-28.md): with
    // hundreds of workers pressing «Следующий» at once they all reach for
    // the same oldest item; each waited on the first one's row lock only to
    // find it taken (63 ms per attempt, 3 attempts per grant at 1 000
    // staff). An item somebody is claiming at this very moment is not free
    // for «Следующий»: skip it at once and try the next candidate. A click
    // on one specific item ([claim]) still waits as before.
    if (skipIfBusy) {
      const [lock] = await tx.$queryRaw<Array<{ ok: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtext(${`lease-item:${src.kind}:${itemId}`})) AS ok`;
      if (!lock?.ok) return null;
    }
    // An expired lease nobody swept yet: remember who loses it.
    const prev = await tx.$queryRaw<
      Array<{ admin_id: string; taken_at: Date }>
    >`
      SELECT admin_id::text AS admin_id, taken_at FROM work_leases
      WHERE kind = ${src.kind} AND item_id = ${itemId}::uuid
        AND admin_id IS NOT NULL AND leased_until < now()
      FOR UPDATE`;
    const rows = await tx.$queryRaw<LeaseRow[]>`
      INSERT INTO work_leases
        (kind, item_id, admin_id, taken_at, leased_until, last_renew_at, attempt, updated_at)
      VALUES
        (${src.kind}, ${itemId}::uuid, ${adminId}::uuid, now(),
         now() + make_interval(secs => ${ttlSec}::double precision), now(), 1, now())
      ON CONFLICT (kind, item_id) DO UPDATE SET
        admin_id = EXCLUDED.admin_id,
        taken_at = now(),
        leased_until = EXCLUDED.leased_until,
        last_renew_at = now(),
        attempt = work_leases.attempt + 1,
        updated_at = now()
      WHERE (work_leases.admin_id IS NULL OR work_leases.leased_until < now())
        AND NOT (EXCLUDED.admin_id = ANY(COALESCE(work_leases.excluded_admin_ids, ARRAY[]::uuid[]))
                 AND work_leases.updated_at > now() - make_interval(mins => ${excludeMinutes}::int))
      RETURNING kind, item_id::text AS item_id, admin_id::text AS admin_id,
                taken_at, leased_until, last_renew_at, attempt`;
    const row = rows[0];
    if (!row) return null;
    const lost = prev[0];
    if (lost) {
      if (!golden) await src.onReleased?.(tx, lost.admin_id, itemId);
      await this.writeEvent(
        tx,
        src.kind,
        itemId,
        lost.admin_id,
        LEASE_EVENT.lost,
        LEASE_REASON.expired,
        Date.now() - lost.taken_at.getTime(),
      );
      this.events.toAdmin(lost.admin_id, STAFF_SERVER_EVENTS.leaseLost, {
        kind: src.kind,
        itemId,
        reason: LEASE_REASON.expired,
      });
    }
    // A golden task is an item already decided by someone else: the queue
    // has nothing to book on it.
    if (!golden && !(await src.onClaimed(tx, adminId, itemId))) {
      // Closed under our hands: give the row back untouched.
      await tx.$executeRaw`
        UPDATE work_leases SET admin_id = NULL, leased_until = NULL, updated_at = now()
        WHERE kind = ${src.kind} AND item_id = ${itemId}::uuid AND admin_id = ${adminId}::uuid`;
      return null;
    }
    await this.writeEvent(
      tx,
      src.kind,
      itemId,
      adminId,
      LEASE_EVENT.taken,
      null,
      null,
    );
    return toView(row);
  }

  // --- capacity -----------------------------------------------------------

  private async heldInHands(
    tx: Prisma.TransactionClient,
    adminId: string,
  ): Promise<Array<{ view: LeaseView; counts: boolean }>> {
    const rows = await tx.$queryRaw<LeaseRow[]>`
      SELECT kind, item_id::text AS item_id, admin_id::text AS admin_id,
             taken_at, leased_until, last_renew_at, attempt
      FROM work_leases
      WHERE admin_id = ${adminId}::uuid AND leased_until > now()
      ORDER BY taken_at ASC`;
    const byKind = new Map<string, LeaseRow[]>();
    for (const r of rows) {
      byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
    }
    const out: Array<{ view: LeaseView; counts: boolean }> = [];
    for (const [kind, list] of byKind) {
      const src = leaseSourceFor(kind);
      const open = src?.stillOpen
        ? new Set(
            await src.stillOpen(
              tx,
              list.map((r) => r.item_id),
            ),
          )
        : null;
      for (const r of list) {
        out.push({
          view: toView(r),
          counts: open ? open.has(r.item_id) : true,
        });
      }
    }
    return out;
  }

  /** Support dialogs: `lease.chat_capacity` at once; everything else `lease.capacity`. */
  private atCapacity(
    kind: string,
    held: Array<{ view: LeaseView; counts: boolean }>,
    cfg: StaffSettings,
  ): boolean {
    const isChat = kind === 'support_ticket';
    const mine = held.filter(
      (h) => h.counts && (h.view.kind === 'support_ticket') === isChat,
    ).length;
    return (
      mine >=
      (isChat
        ? cfg.numbers['staff.lease.chat_capacity']
        : cfg.numbers['staff.lease.capacity'])
    );
  }

  // --- my leases / renewal ---------------------------------------------------

  async mine(adminId: string): Promise<LeaseView[]> {
    const rows = await this.prisma.workLease.findMany({
      where: { admin_id: adminId },
      orderBy: { taken_at: 'asc' },
    });
    return rows.map((r) =>
      toView({
        kind: r.kind,
        item_id: r.item_id,
        admin_id: adminId,
        taken_at: r.taken_at ?? new Date(),
        leased_until: r.leased_until ?? new Date(),
        last_renew_at: r.last_renew_at,
        attempt: r.attempt,
      }),
    );
  }

  /** The holder keeps working: the lease runs again from now. Null = no longer theirs. */
  async renew(
    kind: string,
    itemId: string,
    adminId: string,
  ): Promise<LeaseView | null> {
    const src = leaseSourceFor(kind);
    if (!src) return null;
    const cfg = await this.staff.get();
    const ttlSec = cfg.numbers[src.ttlSetting] * 60;
    const rows = await this.prisma.$queryRaw<LeaseRow[]>`
      UPDATE work_leases SET
        leased_until = now() + make_interval(secs => ${ttlSec}::double precision),
        last_renew_at = now(), updated_at = now()
      WHERE kind = ${kind} AND item_id = ${itemId}::uuid AND admin_id = ${adminId}::uuid
      RETURNING kind, item_id::text AS item_id, admin_id::text AS admin_id,
                taken_at, leased_until, last_renew_at, attempt`;
    const row = rows[0];
    if (!row) return null;
    await this.noteFirstRenewal(kind, itemId, adminId, row.taken_at);
    const view = toView(row);
    this.afterGrant(view, ttlSec, cfg, false);
    return view;
  }

  /** `renewed_first` marks the first renewal of one holding. */
  private async noteFirstRenewal(
    kind: string,
    itemId: string,
    adminId: string,
    takenAt: Date,
  ): Promise<void> {
    const seen = await this.prisma.workLeaseEvent.count({
      where: {
        kind,
        item_id: itemId,
        admin_id: adminId,
        event: LEASE_EVENT.renewedFirst,
        created_at: { gte: takenAt },
      },
    });
    if (seen === 0) {
      await this.writeEvent(
        this.prisma,
        kind,
        itemId,
        adminId,
        LEASE_EVENT.renewedFirst,
        null,
        null,
      );
    }
  }

  // --- ending a lease -------------------------------------------------------

  /** The holder lets go (no penalty); back to the queue. */
  release(kind: string, itemId: string, adminId: string): Promise<boolean> {
    return this.end(kind, itemId, adminId, {
      event: LEASE_EVENT.released,
      reason: LEASE_REASON.released,
    });
  }

  /** «Пропустить»: back to the queue and not to this person (for a while). */
  async skip(
    kind: string,
    itemId: string,
    adminId: string,
    reason: string,
  ): Promise<{ ok: boolean; limited: boolean }> {
    const cfg = await this.staff.get();
    const used = Number((await this.redis.get(skipsKey(adminId))) ?? 0);
    if (used >= cfg.numbers['staff.lease.skips_per_hour']) {
      return { ok: false, limited: true };
    }
    const ok = await this.end(kind, itemId, adminId, {
      event: LEASE_EVENT.skipped,
      reason: reason.slice(0, 40),
      exclude: true,
    });
    if (ok) {
      const n = await this.redis.incr(skipsKey(adminId));
      if (n === 1) await this.redis.expire(skipsKey(adminId), 3600);
    }
    return { ok, limited: false };
  }

  /**
   * The holder closed it. Support gets a short wrap-up before the next one.
   * Resolves with how long they held it (ms), or null when it was not theirs.
   * [outcome] is the decision; a golden task is checked against it.
   */
  async done(
    kind: string,
    itemId: string,
    adminId: string,
    outcome?: string,
  ): Promise<number | null> {
    const ended = await this.endLease(kind, itemId, adminId, {
      event: LEASE_EVENT.done,
      reason: null,
      exclude: true,
    });
    if (!ended) return null;
    const cfg = await this.staff.get();
    const wrap = cfg.numbers['staff.lease.wrapup_support_sec'];
    if (kind === 'support_ticket' && wrap > 0) {
      await this.redis.set(wrapUpKey(adminId), '1', 'EX', wrap);
    }
    if (this.golden && outcome) {
      try {
        await this.golden.resolve(adminId, kind, itemId, outcome);
      } catch (e) {
        log.warn(`golden resolve ${kind}:${itemId} failed: ${String(e)}`);
      }
    }
    return ended.heldMs ?? 0;
  }

  /** The id of a golden task waiting for this person in [kind], if any. */
  private async pickGolden(
    adminId: string,
    kind: string,
  ): Promise<string | null> {
    if (!this.golden) return null;
    try {
      return await this.golden.pick(adminId, kind);
    } catch (e) {
      log.warn(`golden pick failed: ${String(e)}`);
      return null;
    }
  }

  /** Seconds left of the support wrap-up, 0 = free to ask for the next one. */
  async wrapUpLeft(adminId: string): Promise<number> {
    const ttl = await this.redis.ttl(wrapUpKey(adminId));
    return ttl > 0 ? ttl : 0;
  }

  /** A head / the owner takes the item away. */
  forceRelease(
    kind: string,
    itemId: string,
    fromAdminId: string,
  ): Promise<boolean> {
    return this.end(kind, itemId, fromAdminId, {
      event: LEASE_EVENT.released,
      reason: LEASE_REASON.forced,
    });
  }

  /** Every item [adminId] holds goes back (offboard, pause). */
  async releaseAllFor(adminId: string, reason: string): Promise<number> {
    const held = await this.prisma.workLease.findMany({
      where: { admin_id: adminId },
      select: { kind: true, item_id: true },
    });
    let n = 0;
    for (const h of held) {
      const ok = await this.end(h.kind, h.item_id, adminId, {
        event: LEASE_EVENT.released,
        reason: reason.slice(0, 40),
      });
      if (ok) n++;
    }
    return n;
  }

  /** A head / the owner hands the item to [toAdminId] (rights checked by the caller). */
  async reassign(
    kind: string,
    itemId: string,
    fromAdminId: string,
    toAdminId: string,
  ): Promise<LeaseView | null> {
    const src = leaseSourceFor(kind);
    if (!src) return null;
    const cfg = await this.staff.get();
    const ttlSec = cfg.numbers[src.ttlSetting] * 60;
    const lease = await withTxRetry(
      this.prisma,
      async (tx) => {
        const rows = await tx.$queryRaw<LeaseRow[]>`
          UPDATE work_leases SET
            admin_id = ${toAdminId}::uuid, taken_at = now(),
            leased_until = now() + make_interval(secs => ${ttlSec}::double precision),
            last_renew_at = now(), attempt = attempt + 1, updated_at = now()
          WHERE kind = ${kind} AND item_id = ${itemId}::uuid AND admin_id = ${fromAdminId}::uuid
            AND NOT (${toAdminId}::uuid = ANY(COALESCE(excluded_admin_ids, ARRAY[]::uuid[])))
          RETURNING kind, item_id::text AS item_id, admin_id::text AS admin_id,
                    taken_at, leased_until, last_renew_at, attempt`;
        if (!rows[0]) return null;
        await src.onReleased?.(tx, fromAdminId, itemId);
        if (!(await src.onClaimed(tx, toAdminId, itemId))) {
          throw new NotTakeableError();
        }
        await this.writeEvent(
          tx,
          kind,
          itemId,
          fromAdminId,
          LEASE_EVENT.handed,
          LEASE_REASON.reassigned,
          null,
        );
        await this.writeEvent(
          tx,
          kind,
          itemId,
          toAdminId,
          LEASE_EVENT.taken,
          LEASE_REASON.reassigned,
          null,
        );
        return toView(rows[0]);
      },
      { isolation: 'readCommitted', op: 'lease.reassign' },
    ).catch((e: unknown) => {
      if (e instanceof NotTakeableError) return null;
      throw e;
    });
    if (!lease) return null;
    this.events.toAdmin(fromAdminId, STAFF_SERVER_EVENTS.leaseLost, {
      kind,
      itemId,
      reason: LEASE_REASON.reassigned,
    });
    this.afterGrant(lease, ttlSec, cfg);
    void this.publishTile(fromAdminId);
    return lease;
  }

  /**
   * «Не решено» (the client wrote again after a close, or filed again):
   * the item is back in the queue FIRST IN LINE and the previous worker is
   * left out for `staff.reopen.return_after_min` minutes (after that, if
   * nobody else took it, they may). Safe to call for an item that never had
   * a lease. Does nothing while the master switch is off.
   */
  async reopen(kind: string, itemId: string): Promise<void> {
    if (!(await this.staff.isOn('staff.lease_enabled'))) return;
    if (!leaseSourceFor(kind)) return;
    await withTxRetry(
      this.prisma,
      async (tx) => {
        const last = await tx.workLeaseEvent.findFirst({
          where: { kind, item_id: itemId, event: LEASE_EVENT.done },
          orderBy: { created_at: 'desc' },
          select: { admin_id: true },
        });
        const prior = last?.admin_id ?? null;
        const initial = prior
          ? Prisma.sql`ARRAY[${prior}::uuid]`
          : Prisma.sql`ARRAY[]::uuid[]`;
        await tx.$executeRaw`
          INSERT INTO work_leases (kind, item_id, excluded_admin_ids, priority, updated_at)
          VALUES (${kind}, ${itemId}::uuid, ${initial}, 1, now())
          ON CONFLICT (kind, item_id) DO UPDATE SET
            excluded_admin_ids = CASE
              WHEN ${prior}::uuid IS NULL
                OR ${prior}::uuid = ANY(COALESCE(work_leases.excluded_admin_ids, ARRAY[]::uuid[]))
              THEN work_leases.excluded_admin_ids
              ELSE array_append(COALESCE(work_leases.excluded_admin_ids, ARRAY[]::uuid[]), ${prior}::uuid) END,
            priority = work_leases.priority + 1,
            updated_at = now()`;
        await this.writeEvent(
          tx,
          kind,
          itemId,
          prior,
          LEASE_EVENT.reopened,
          LEASE_REASON.notResolved,
          null,
        );
      },
      { isolation: 'readCommitted', op: 'lease.reopen' },
    );
  }

  /** Frees [adminId]'s lease on an item; false when they do not hold it. */
  private async end(
    kind: string,
    itemId: string,
    adminId: string,
    o: { event: LeaseEventName; reason: string | null; exclude?: boolean },
  ): Promise<boolean> {
    return (await this.endLease(kind, itemId, adminId, o)) !== null;
  }

  /** Same as `end`, with how long the person held it (null = not theirs). */
  private async endLease(
    kind: string,
    itemId: string,
    adminId: string,
    o: { event: LeaseEventName; reason: string | null; exclude?: boolean },
  ): Promise<{ heldMs: number | null } | null> {
    const src = leaseSourceFor(kind);
    const exclude = o.exclude === true;
    const held = await withTxRetry(
      this.prisma,
      async (tx): Promise<{ heldMs: number | null } | null> => {
        const rows = await tx.$queryRaw<Array<{ taken_at: Date | null }>>`
          UPDATE work_leases SET
            admin_id = NULL, leased_until = NULL,
            excluded_admin_ids = CASE
              WHEN ${exclude}::boolean
                   AND NOT (${adminId}::uuid = ANY(COALESCE(excluded_admin_ids, ARRAY[]::uuid[])))
              THEN array_append(COALESCE(excluded_admin_ids, ARRAY[]::uuid[]), ${adminId}::uuid)
              ELSE excluded_admin_ids END,
            updated_at = now()
          WHERE kind = ${kind} AND item_id = ${itemId}::uuid AND admin_id = ${adminId}::uuid
          RETURNING taken_at`;
        if (!rows[0]) return null;
        // `done` closes the item itself: the queue owns that state.
        if (o.event !== LEASE_EVENT.done) {
          await src?.onReleased?.(tx, adminId, itemId);
        }
        const heldMs = rows[0].taken_at
          ? Date.now() - rows[0].taken_at.getTime()
          : null;
        await this.writeEvent(
          tx,
          kind,
          itemId,
          adminId,
          o.event,
          o.reason,
          heldMs,
        );
        return { heldMs };
      },
      { isolation: 'readCommitted', op: 'lease.end' },
    );
    if (!held) return null;
    this.clearWarn(kind, itemId);
    if (o.event !== LEASE_EVENT.done) {
      this.events.toAdmin(adminId, STAFF_SERVER_EVENTS.leaseLost, {
        kind,
        itemId,
        reason: o.reason,
      });
    }
    void this.publishTile(adminId);
    return held;
  }

  // --- the sweep (`staff.lease-sweep`, every minute) ---------------------------

  async sweep(now = Date.now()): Promise<Record<string, number | string>> {
    const cfg = await this.staff.get();
    if (!cfg.switches['staff.lease_enabled']) return { skipped: 'off' };
    const presenceOn = cfg.switches['staff.presence_enabled'];
    const rows = await this.prisma.workLease.findMany({
      where: presenceOn
        ? { admin_id: { not: null } }
        : { admin_id: { not: null }, leased_until: { lt: new Date(now) } },
      take: SWEEP_LIMIT,
      orderBy: { leased_until: 'asc' },
    });
    const readings = presenceOn
      ? await this.presence.readMany([
          ...new Set(rows.map((r) => r.admin_id as string)),
        ])
      : new Map<string, PresenceReading>();
    const policy: SweepPolicy = {
      now,
      presenceOn,
      graceMs: cfg.numbers['staff.presence.grace_sec'] * 1000,
      idleMs: cfg.numbers['staff.lease.idle_release_sec'] * 1000,
      activeWindowMs: cfg.numbers['staff.presence.active_window_sec'] * 1000,
    };
    const out = { checked: rows.length, released: 0, renewed: 0, kept: 0 };
    const lost: Array<{
      admin_id: string;
      item_kind: string;
      item_id: string;
      kind: string;
    }> = [];
    for (const r of rows) {
      const adminId = r.admin_id as string;
      const src = leaseSourceFor(r.kind);
      const d = decideSweep(
        {
          takenAt: r.taken_at ?? new Date(now),
          leasedUntil: r.leased_until,
          lastRenewAt: r.last_renew_at,
          ttlMs: (src ? cfg.numbers[src.ttlSetting] : 10) * 60_000,
        },
        presenceOn ? (readings.get(adminId) ?? null) : null,
        policy,
      );
      if (d.action === 'keep') {
        out.kept++;
      } else if (d.action === 'renew') {
        if (await this.renew(r.kind, r.item_id, adminId)) out.renewed++;
      } else if (
        await this.end(r.kind, r.item_id, adminId, {
          event: LEASE_EVENT.lost,
          reason: d.reason,
        })
      ) {
        out.released++;
        if (d.reason !== LEASE_REASON.disconnected) {
          lost.push({
            admin_id: adminId,
            item_kind: r.kind,
            item_id: r.item_id,
            kind: 'lease_lost',
          });
        }
      }
    }
    if (lost.length > 0 && cfg.switches['staff.rating_enabled']) {
      await this.prisma.staffQualitySignal
        .createMany({ data: lost.map((s) => ({ ...s, value: 1 })) })
        .catch((e: unknown) => log.warn(`lease_lost signals: ${String(e)}`));
    }
    if (new Date(now).getUTCMinutes() === 7) await this.dropOldFreeRows(now);
    return out;
  }

  private async dropOldFreeRows(now: number): Promise<void> {
    const before = new Date(now - FREE_ROW_DAYS * 86_400_000);
    await this.prisma.workLease.deleteMany({
      where: { admin_id: null, updated_at: { lt: before } },
    });
  }

  // --- journal, events, timers ------------------------------------------------

  private async writeEvent(
    db: Prisma.TransactionClient | PrismaService,
    kind: string,
    itemId: string,
    adminId: string | null,
    event: LeaseEventName,
    reason: string | null,
    heldMs: number | null,
  ): Promise<void> {
    await db.workLeaseEvent.create({
      data: {
        kind,
        item_id: itemId,
        admin_id: adminId,
        event,
        reason,
        held_ms: heldMs === null ? null : Math.min(heldMs, 2_000_000_000),
      },
    });
  }

  private afterGrant(
    lease: LeaseView,
    ttlSec: number,
    cfg: StaffSettings,
    announce = true,
  ): void {
    if (announce) {
      this.events.toAdmin(lease.adminId, STAFF_SERVER_EVENTS.leaseGranted, {
        kind: lease.kind,
        itemId: lease.itemId,
        until: lease.leasedUntil.toISOString(),
      });
    }
    this.armWarn(lease, ttlSec, cfg.numbers['staff.lease.warn_before_sec']);
    void this.publishTile(lease.adminId);
  }

  /** `lease:warn` 30 s before the end (best effort, this process only). */
  private armWarn(lease: LeaseView, ttlSec: number, warnSec: number): void {
    this.clearWarn(lease.kind, lease.itemId);
    const delay = (ttlSec - warnSec) * 1000;
    if (delay <= 0) return;
    const k = timerKey(lease.kind, lease.itemId);
    const t = setTimeout(() => {
      this.warnTimers.delete(k);
      this.events.toAdmin(lease.adminId, STAFF_SERVER_EVENTS.leaseWarn, {
        kind: lease.kind,
        itemId: lease.itemId,
        in: warnSec,
      });
    }, delay);
    t.unref();
    this.warnTimers.set(k, t);
  }

  private clearWarn(kind: string, itemId: string): void {
    const k = timerKey(kind, itemId);
    const t = this.warnTimers.get(k);
    if (t) clearTimeout(t);
    this.warnTimers.delete(k);
  }

  /** Tells the head room that this person's tile changed (best effort). */
  private async publishTile(adminId: string): Promise<void> {
    try {
      const ws = await this.workspaceFor(adminId);
      const held = await this.prisma.workLease.findMany({
        where: { admin_id: adminId },
        select: { kind: true, item_id: true, leased_until: true },
      });
      this.events.tile(ws, {
        adminId,
        items: held.map((h) => ({
          kind: h.kind,
          itemId: h.item_id,
          leasedUntil: h.leased_until?.toISOString() ?? null,
        })),
      });
    } catch {
      // tiles are a courtesy
    }
  }

  private async workspaceFor(adminId: string): Promise<string> {
    const hit = this.workspaceOf.get(adminId);
    if (hit && Date.now() - hit.at < 300_000) return hit.workspace;
    const p = await this.prisma.adminProfile.findUnique({
      where: { user_id: adminId },
      select: { workspace: true, admin_role: true },
    });
    const workspace =
      p?.admin_role === 'super_admin' ? 'owner' : (p?.workspace ?? 'mass');
    this.workspaceOf.set(adminId, { workspace, at: Date.now() });
    return workspace;
  }
}

class NotTakeableError extends Error {
  constructor() {
    super('item is not takeable');
  }
}

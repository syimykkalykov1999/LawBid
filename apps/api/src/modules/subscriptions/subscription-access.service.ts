import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CACHE_CLIENT } from '../../redis/redis.constants';
import { cached } from '../../common/cache/cached';
import { EntitlementsService } from '../plans/entitlements.service';
import { subscriptionRowIsActive } from './subscription-rules';
import {
  type ActiveGrant,
  findActiveGrant,
  type GrantDb,
} from './contract-grant.util';

type Db = Pick<Prisma.TransactionClient, 'subscription' | 'contractGrant'>;

const CACHE_TTL_SECONDS = 60;
const key = (userId: string) => `sub:active:${userId}`;

/**
 * docs/06 §1.2 — the single gate for "active subscription or trial"
 * (.cursorrules: "Доступ по подписке только через
 * SubscriptionAccessService.isActive()"). True when `status IN
 * ('trialing','active')`, or `past_due` inside the grace period
 * (`grace_ends_at`, set from `subscription.past_due_grace_days` when the
 * payment failed), or an unrevoked contract grant with starts_at <= now <
 * ends_at (owner 2026-10-02). Cached in Redis for 60 s; the webhook handler and the
 * admin actions call `invalidate`. A transaction client (`db`) bypasses
 * the cache — the bid-accept path re-checks inside its own transaction.
 */
@Injectable()
export class SubscriptionAccessService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CACHE_CLIENT) private readonly redis: Redis,
    // Owner 2026-10-05: the plan's terms are cached per user as well.
    @Optional() private readonly entitlements?: EntitlementsService,
  ) {}

  async isActive(attorneyId: string, db?: Db): Promise<boolean> {
    if (db) return this.compute(attorneyId, db);
    // Caching round 2 (S2-6): the shared helper, same '1' / '0' values.
    return cached<boolean>(
      this.redis,
      key(attorneyId),
      {
        ttlSec: CACHE_TTL_SECONDS,
        serialize: (v) => (v ? '1' : '0'),
        parse: (raw) => {
          if (raw === '1') return true;
          if (raw === '0') return false;
          throw new Error('unexpected value');
        },
      },
      () => this.compute(attorneyId, this.prisma),
    );
  }

  /**
   * 13.11 (owner list row 76, 1B load test): the same rule as [isActive]
   * for many attorneys in two set-based reads (subscription rows, then
   * active contract grants of those still without access). The hourly
   * lapse sweep asked [isActive] once per attorney — ~900 000 Redis + SQL
   * round trips, ~21 minutes on the 10M stand, holding the `cron` lane.
   * Reads the database directly (no 60 s cache), like the `db` path.
   * Returns the ids that are active.
   */
  async activeAmong(
    attorneyIds: readonly string[],
    now = new Date(),
  ): Promise<Set<string>> {
    const active = new Set<string>();
    if (attorneyIds.length === 0) return active;
    const ids = [...new Set(attorneyIds)];
    const rows = await this.prisma.subscription.findMany({
      where: { user_id: { in: ids } },
      select: { user_id: true, status: true, grace_ends_at: true },
    });
    for (const row of rows) {
      if (SubscriptionAccessService.rowIsActive(row, now)) {
        active.add(row.user_id);
      }
    }
    const rest = ids.filter((id) => !active.has(id));
    if (rest.length === 0) return active;
    // Owner 2026-10-02: a free subscription under a contract
    // (activeGrantWhere, for many users at once).
    const grants = await this.prisma.contractGrant.findMany({
      where: {
        user_id: { in: rest },
        revoked_at: null,
        starts_at: { lte: now },
        ends_at: { gt: now },
      },
      select: { user_id: true },
    });
    for (const g of grants) active.add(g.user_id);
    return active;
  }

  async invalidate(attorneyId: string): Promise<void> {
    await this.redis.del(key(attorneyId)).catch(() => undefined);
    await this.entitlements?.invalidateUser(attorneyId);
  }

  /** Pure rule over a row — shared with the sync service's transition check. */
  static rowIsActive(
    row: { status: string; grace_ends_at: Date | null } | null,
    now = new Date(),
  ): boolean {
    return subscriptionRowIsActive(row, now);
  }

  /** Owner 2026-10-02: the attorney's active contract grant (uncached). */
  activeGrant(attorneyId: string, db?: GrantDb): Promise<ActiveGrant | null> {
    return findActiveGrant(db ?? this.prisma, attorneyId);
  }

  private async compute(attorneyId: string, db: Db): Promise<boolean> {
    const row = await db.subscription.findUnique({
      where: { user_id: attorneyId },
      select: { status: true, grace_ends_at: true },
    });
    if (SubscriptionAccessService.rowIsActive(row)) return true;
    // Owner 2026-10-02: a free subscription under a contract.
    return (await findActiveGrant(db, attorneyId)) !== null;
  }
}

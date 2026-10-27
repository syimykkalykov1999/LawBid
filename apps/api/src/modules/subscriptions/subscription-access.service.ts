import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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

import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
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
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async isActive(attorneyId: string, db?: Db): Promise<boolean> {
    if (db) return this.compute(attorneyId, db);
    const cached = await this.redis.get(key(attorneyId)).catch(() => null);
    if (cached === '1') return true;
    if (cached === '0') return false;
    const active = await this.compute(attorneyId, this.prisma);
    await this.redis
      .set(key(attorneyId), active ? '1' : '0', 'EX', CACHE_TTL_SECONDS)
      .catch(() => undefined);
    return active;
  }

  async invalidate(attorneyId: string): Promise<void> {
    await this.redis.del(key(attorneyId)).catch(() => undefined);
  }

  /** Pure rule over a row — shared with the sync service's transition check. */
  static rowIsActive(
    row: { status: string; grace_ends_at: Date | null } | null,
    now = new Date(),
  ): boolean {
    if (!row) return false;
    if (row.status === 'trialing' || row.status === 'active') return true;
    return (
      row.status === 'past_due' &&
      !!row.grace_ends_at &&
      row.grace_ends_at > now
    );
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

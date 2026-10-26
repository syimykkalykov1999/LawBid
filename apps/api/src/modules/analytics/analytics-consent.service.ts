import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';

const CACHE_TTL_SEC = 300;
const key = (userId: string) => `consent:analytics:${userId}`;
const doNotSellKey = (userId: string) => `consent:dns:${userId}`;

/**
 * Owner 2026-10-22 (audit #4 §5, EDPB Guidelines 05/2020): the person's
 * answer to the onboarding «analytics» question, enforced on the server —
 * events of someone whose latest `analytics` consent is `false` are
 * dropped, and GET /users/me returns the answer so the app can stop
 * sending before it starts. `user_consents` is append-only; the latest row
 * wins. Cached 5 minutes in Redis, dropped at once when the person answers
 * again (ConsentsService).
 */
@Injectable()
export class AnalyticsConsentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** true / false = the latest answer; null = never asked. */
  async latest(userId: string): Promise<boolean | null> {
    try {
      const hit = await this.redis.get(key(userId));
      if (hit === '1') return true;
      if (hit === '0') return false;
      if (hit === 'n') return null;
    } catch {
      // Redis down: read the database.
    }
    const row = await this.prisma.userConsent.findFirst({
      where: { user_id: userId, consent_type: 'analytics' },
      orderBy: { created_at: 'desc' },
      select: { granted: true },
    });
    const value = row ? row.granted : null;
    try {
      await this.redis.set(
        key(userId),
        value === null ? 'n' : value ? '1' : '0',
        'EX',
        CACHE_TTL_SEC,
      );
    } catch {
      // best effort
    }
    return value;
  }

  /** Owner 2026-10-22 (CCPA/CPRA): the latest «Do not sell or share»
   * answer; true = opted out. Cached like the analytics answer. */
  async doNotSell(userId: string): Promise<boolean> {
    try {
      const hit = await this.redis.get(doNotSellKey(userId));
      if (hit === '1') return true;
      if (hit === '0') return false;
    } catch {
      // Redis down: read the database.
    }
    const row = await this.prisma.userConsent.findFirst({
      where: { user_id: userId, consent_type: 'do_not_sell' },
      orderBy: { created_at: 'desc' },
      select: { granted: true },
    });
    const value = row?.granted ?? false;
    try {
      await this.redis.set(
        doNotSellKey(userId),
        value ? '1' : '0',
        'EX',
        CACHE_TTL_SEC,
      );
    } catch {
      // best effort
    }
    return value;
  }

  /** Events of this person may be counted. Never asked = allowed: the
   * events are anonymous daily counts (no id is stored), and the app asks
   * at onboarding. An opted-out («Do not sell or share») person is never
   * counted, whatever the analytics answer. */
  async allowed(userId: string): Promise<boolean> {
    if (await this.doNotSell(userId)) return false;
    return (await this.latest(userId)) !== false;
  }

  async invalidate(userId: string): Promise<void> {
    try {
      await this.redis.del(key(userId), doNotSellKey(userId));
    } catch {
      // The 5-minute TTL ends it anyway.
    }
  }
}

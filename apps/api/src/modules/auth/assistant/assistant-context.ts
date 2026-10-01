import { Inject, Injectable, SetMetadata } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { SubscriptionAccessService } from '../../subscriptions/subscription-access.service';

/** OQ-048: who is really acting when an assistant uses the attorney's
 * account (set by JwtAuthGuard on `req.user.assistant`). */
export interface ActingAssistant {
  userId: string;
  membershipId: string;
  name: string;
  duties: string[];
}

/** Routes an assistant may never use (bids, billing, team, account). */
export const ATTORNEY_ONLY = 'lawbid:attorneyOnly';
export const AttorneyOnly = () => SetMetadata(ATTORNEY_ONLY, true);

/** Routes that need one of the assistant's duties. */
export const REQUIRES_DUTY = 'lawbid:requiresDuty';
export const RequiresDuty = (duty: string) => SetMetadata(REQUIRES_DUTY, duty);

/** Routes an assistant uses as themself (joining a team, own session):
 * the guard does not swap in the attorney. */
export const ASSISTANT_SELF = 'lawbid:assistantSelf';
export const AssistantSelf = () => SetMetadata(ASSISTANT_SELF, true);

const TTL_SEC = 30;

interface Cached {
  attorneyId: string;
  membershipId: string;
  name: string;
  duties: string[];
}

/**
 * Resolves an assistant's live membership (Redis-cached for 30 s; the team
 * screen drops the cache on every change). Null when the assistant has no
 * active membership or the attorney's subscription no longer covers it.
 */
@Injectable()
export class AssistantContextService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly access: SubscriptionAccessService,
  ) {}

  private key(userId: string) {
    return `assistant:ctx:${userId}`;
  }

  async resolve(assistantUserId: string): Promise<Cached | null> {
    try {
      const hit = await this.redis.get(this.key(assistantUserId));
      if (hit === 'none') return null;
      if (hit) return JSON.parse(hit) as Cached;
    } catch {
      // Redis down: fall through to the DB.
    }
    const m = await this.prisma.assistantMembership.findFirst({
      where: { assistant_user_id: assistantUserId, status: 'active' },
      select: {
        id: true,
        attorney_id: true,
        display_name: true,
        duties: true,
        assistant_user: { select: { first_name: true, last_name: true } },
      },
    });
    let value: Cached | null = null;
    if (m && (await this.access.isActive(m.attorney_id))) {
      const name =
        m.display_name ??
        ([m.assistant_user?.first_name, m.assistant_user?.last_name]
          .filter(Boolean)
          .join(' ') ||
          'Assistant');
      value = {
        attorneyId: m.attorney_id,
        membershipId: m.id,
        name,
        duties: m.duties,
      };
    }
    try {
      await this.redis.set(
        this.key(assistantUserId),
        value ? JSON.stringify(value) : 'none',
        'EX',
        TTL_SEC,
      );
    } catch {
      // Best effort.
    }
    return value;
  }

  async invalidate(assistantUserId: string | null | undefined): Promise<void> {
    if (!assistantUserId) return;
    try {
      await this.redis.del(this.key(assistantUserId));
    } catch {
      // Best effort.
    }
  }
}

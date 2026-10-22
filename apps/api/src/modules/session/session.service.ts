import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { weakEtag } from '../../common/sync/cheap-etag';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { CALL_SILENT_MS } from '../calls/calls.service';
import {
  BootstrapService,
  readConfigVersion,
} from '../feature-flags/feature-flags.public';
import { BadgesService, type Badges } from '../notifications/badges.service';
import { OnboardingService, type MeView } from '../users/users.public';

/** The session ETag rotates at least this often — the safety net for
 * inputs that no stamp below covers (a legal acceptance, an avatar scan). */
export const SESSION_ETAG_BUCKET_MS = 120_000;

export interface SessionView {
  me: MeView;
  badges: Badges;
  bootstrapVersion: string;
  flags: Record<string, boolean>;
  unreadSupport: number;
  hasOngoingCalls: boolean;
}

/**
 * Owner 2026-10-22 (client economy plan, package G): GET /me/session —
 * the cold start's six requests as one. [etag] is computed from indexed
 * stamps only (users / profile updated_at, the Redis badge counters, the
 * config version, support unread, running group calls); a match is a
 * 304 before anything heavy runs.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onboarding: OnboardingService,
    private readonly badges: BadgesService,
    private readonly bootstrap: BootstrapService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private async badgesOf(user: RequestUser): Promise<Badges> {
    const me = user.assistant?.userId ?? user.sub;
    return this.badges.withIcon(
      me,
      user.assistant
        ? await this.badges.forAssistant(user.sub, user.assistant.userId)
        : await this.badges.get(user.sub),
    );
  }

  private async unreadSupport(userId: string): Promise<number> {
    return this.prisma.supportTicket.count({
      where: { user_id: userId, unread_by_user: true },
    });
  }

  /** Same question as GET /calls/ongoing, answered yes / no (calls.group_id
   * is a bare pointer, hence the two reads). */
  private async hasOngoingCalls(userId: string): Promise<boolean> {
    const mine = await this.prisma.chatGroupMember.findMany({
      where: { user_id: userId, left_at: null },
      select: { group_id: true },
    });
    if (mine.length === 0) return false;
    const call = await this.prisma.call.findFirst({
      where: {
        status: 'active',
        group_id: { in: mine.map((m) => m.group_id) },
        updated_at: { gt: new Date(Date.now() - CALL_SILENT_MS) },
      },
      select: { id: true },
    });
    return call !== null;
  }

  async etag(user: RequestUser, now: number = Date.now()): Promise<string> {
    const [stamps, badges, version, support, calls] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.sub },
        select: {
          updated_at: true,
          attorney_profile: { select: { updated_at: true } },
          client_profile: { select: { updated_at: true } },
        },
      }),
      this.badgesOf(user),
      readConfigVersion(this.redis),
      this.unreadSupport(user.assistant?.userId ?? user.sub),
      this.hasOngoingCalls(user.sub),
    ]);
    return weakEtag(
      'sess',
      stamps?.updated_at,
      stamps?.attorney_profile?.updated_at,
      stamps?.client_profile?.updated_at,
      badges.chatsUnread,
      badges.notificationsUnread,
      badges.iconBadge === false ? 0 : 1,
      version,
      support,
      calls ? 1 : 0,
      Math.floor(now / SESSION_ETAG_BUCKET_MS),
    );
  }

  async build(user: RequestUser): Promise<SessionView> {
    const [me, badges, boot, version, unreadSupport, hasOngoingCalls] =
      await Promise.all([
        this.onboarding.getMe(user.sub),
        this.badgesOf(user),
        this.bootstrap.build(),
        readConfigVersion(this.redis),
        this.unreadSupport(user.assistant?.userId ?? user.sub),
        this.hasOngoingCalls(user.sub),
      ]);
    return {
      me,
      badges,
      bootstrapVersion: version,
      flags: boot.flags,
      unreadSupport,
      hasOngoingCalls,
    };
  }
}

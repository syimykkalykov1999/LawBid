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

export interface SessionInputs {
  stamps: {
    updated_at: Date;
    attorney_profile: { updated_at: Date } | null;
    client_profile: { updated_at: Date } | null;
  } | null;
  badges: Badges;
  version: string;
  support: number;
  calls: boolean;
}

export interface SessionView {
  me: MeView;
  badges: Badges;
  bootstrapVersion: string;
  flags: Record<string, boolean>;
  unreadSupport: number;
  hasOngoingCalls: boolean;
  client: { timings: Record<string, number> };
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

  /** Load test 2026-10-28 (#3): the three updated_at stamps in ONE
   * statement. The Prisma relation select it replaces sent three (users,
   * attorney_profiles, client_profiles) on every app start; /me/session is
   * bound by the API's CPU, and each statement costs it. Same rows: the
   * user unless soft-deleted, each profile when present. */
  private async stampsOf(userId: string): Promise<SessionInputs['stamps']> {
    const rows = await this.prisma.$queryRaw<
      { updated_at: Date; a: Date | null; c: Date | null }[]
    >`
      SELECT u.updated_at, ap.updated_at AS a, cp.updated_at AS c
      FROM users u
      LEFT JOIN attorney_profiles ap ON ap.user_id = u.id
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      WHERE u.id = ${userId}::UUID AND u.deleted_at IS NULL`;
    const row = rows[0];
    if (!row) return null;
    return {
      updated_at: row.updated_at,
      attorney_profile: row.a ? { updated_at: row.a } : null,
      client_profile: row.c ? { updated_at: row.c } : null,
    };
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

  /**
   * The cheap reads the ETag is made of. Load audit 6: `build` reuses them
   * instead of asking the same five questions again (a changed session cost
   * 15 database round trips, 5 of them repeats).
   */
  async inputs(user: RequestUser): Promise<SessionInputs> {
    const [stamps, badges, version, support, calls] = await Promise.all([
      this.stampsOf(user.sub),
      this.badgesOf(user),
      readConfigVersion(this.redis),
      this.unreadSupport(user.assistant?.userId ?? user.sub),
      this.hasOngoingCalls(user.sub),
    ]);
    return { stamps, badges, version, support, calls };
  }

  etagOf(i: SessionInputs, now: number = Date.now()): string {
    return weakEtag(
      'sess',
      i.stamps?.updated_at,
      i.stamps?.attorney_profile?.updated_at,
      i.stamps?.client_profile?.updated_at,
      i.badges.chatsUnread,
      i.badges.notificationsUnread,
      i.badges.iconBadge === false ? 0 : 1,
      i.version,
      i.support,
      i.calls ? 1 : 0,
      Math.floor(now / SESSION_ETAG_BUCKET_MS),
    );
  }

  async etag(user: RequestUser, now: number = Date.now()): Promise<string> {
    return this.etagOf(await this.inputs(user), now);
  }

  async build(user: RequestUser, known?: SessionInputs): Promise<SessionView> {
    const [me, boot, i] = await Promise.all([
      this.onboarding.getMe(user.sub),
      this.bootstrap.build(),
      known ?? this.inputs(user),
    ]);
    return {
      me,
      badges: i.badges,
      bootstrapVersion: i.version,
      flags: boot.flags,
      unreadSupport: i.support,
      hasOngoingCalls: i.calls,
      client: boot.client,
    };
  }
}

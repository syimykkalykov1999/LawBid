import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  CounterAggregator,
  profileEntity,
} from '../counters/counter-aggregator.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BlocksService } from '../blocks/blocks.service';
import { ClientProfilesService } from '../profiles/services/client-profiles.service';
import type {
  AttorneyListItemDto,
  AttorneyListPage,
  PeoplePage,
  PersonItemDto,
} from './follows.dto';

const PAGE = 20;
/** Suggestions pool per client state, rebuilt at most every 10 minutes. */
const SUGGEST_POOL = 300;
const SUGGEST_TTL_SEC = 10 * 60;
/** §7.3 "первые практики" on a list row. */
const LIST_PRACTICES = 3;

/** A followable attorney: active, not suspended (docs/03 §6.1). */
const LISTABLE_ATTORNEY = {
  role: 'attorney' as const,
  status: 'active' as const,
  deleted_at: null,
  attorney_profile: { verification_status: { not: 'suspended' as const } },
};

/**
 * docs/05 §6 (stage 5.5): follows go to attorneys only; clients may follow
 * but are never listed by name (only counted); "Подписки" of a client are
 * visible to that client alone.
 */
@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: UsageLimitsService,
    private readonly counters: CounterAggregator,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    private readonly clients: ClientProfilesService,
    private readonly blocks: BlocksService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async follow(user: RequestUser, attorneyId: string): Promise<void> {
    if (attorneyId === user.sub) throw notAllowed();
    const target = await this.prisma.user.findFirst({
      where: { id: attorneyId, deleted_at: null },
      select: {
        role: true,
        status: true,
        attorney_profile: { select: { verification_status: true } },
      },
    });
    if (!target) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Attorney not found.',
      });
    }
    // OQ-038: clients can be followed too.
    if (
      (target.role !== 'attorney' && target.role !== 'client') ||
      target.status !== 'active' ||
      target.attorney_profile?.verification_status === 'suspended'
    ) {
      throw notAllowed();
    }
    // OQ-028: no follows across a block.
    await this.blocks.assertNotBlocked(user.sub, attorneyId);
    await this.limits.consume('follow', user.sub);
    const { count } = await this.prisma.follow.createMany({
      data: [{ follower_id: user.sub, followee_id: attorneyId }],
      skipDuplicates: true,
    });
    if (count === 0) return;
    await this.counters.bump(
      profileEntity(target.role),
      attorneyId,
      'followers_count',
      1,
    );
    await this.counters.bump(
      profileEntity(user.role),
      user.sub,
      'following_count',
      1,
    );
    await this.notifications.emit({
      type: 'new_follower',
      recipientId: attorneyId,
      // A client follower has no public profile: only the attorney's id is
      // a navigation target (docs/05 §9.2).
      payload:
        user.role === 'attorney'
          ? { actorId: user.sub }
          : { actorKind: 'client' },
    });
  }

  async unfollow(user: RequestUser, attorneyId: string): Promise<void> {
    const { count } = await this.prisma.follow.deleteMany({
      where: { follower_id: user.sub, followee_id: attorneyId },
    });
    if (count === 0) return;
    const target = await this.prisma.user.findUnique({
      where: { id: attorneyId },
      select: { role: true },
    });
    await this.counters.bump(
      profileEntity(target?.role),
      attorneyId,
      'followers_count',
      -1,
    );
    await this.counters.bump(
      profileEntity(user.role),
      user.sub,
      'following_count',
      -1,
    );
  }

  /** GET /attorneys/:id/followers — attorney followers only (§6.2). */
  /** Owner 2026-09-29 (OQ-026): followers of an attorney are listed with
   * both roles — attorneys as before, clients as mini rows (they now have
   * usernames and a public mini-profile). */
  followers(
    viewerId: string,
    attorneyId: string,
    cursor?: string,
  ): Promise<PeoplePage> {
    return this.people(viewerId, attorneyId, 'followers', cursor);
  }

  /** OQ-038: followers / following of any public profile (attorney or
   * client), both roles listed. */
  async people(
    viewerId: string,
    userId: string,
    side: 'followers' | 'following',
    cursor?: string,
  ): Promise<PeoplePage> {
    await this.assertPublicAttorney(userId);
    const c = cursor ? decodeCursor(cursor) : undefined;
    const followers = side === 'followers';
    const other = followers ? 'follower_id' : 'followee_id';
    const rows = await this.prisma.follow.findMany({
      where: {
        ...(followers ? { followee_id: userId } : { follower_id: userId }),
        [followers ? 'follower' : 'followee']: {
          status: 'active',
          deleted_at: null,
          OR: [
            { role: 'client' },
            {
              role: 'attorney',
              attorney_profile: {
                verification_status: { not: 'suspended' },
              },
            },
          ],
        },
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, [other]: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { [other]: 'desc' }],
      take: PAGE + 1,
      select: {
        follower_id: true,
        followee_id: true,
        created_at: true,
        follower: { select: { role: true } },
        followee: { select: { role: true } },
      },
    });
    const all = rows.map((r) => ({
      id: followers ? r.follower_id : r.followee_id,
      role: (followers ? r.follower : r.followee).role,
      created_at: r.created_at,
    }));
    const page = all.slice(0, PAGE);
    const attorneyIds = page
      .filter((r) => r.role === 'attorney')
      .map((r) => r.id);
    const clientIds = page.filter((r) => r.role === 'client').map((r) => r.id);
    const [attorneys, clients] = await Promise.all([
      this.present(attorneyIds, viewerId),
      this.clients.presentMany(clientIds),
    ]);
    const byAttorney = new Map(attorneys.map((a) => [a.id, a]));
    const byClient = new Map(clients.map((x) => [x.id, x]));
    const items: PersonItemDto[] = [];
    for (const r of page) {
      const a = byAttorney.get(r.id);
      const x = byClient.get(r.id);
      if (a) items.push({ role: 'attorney', attorney: a, client: null });
      else if (x) items.push({ role: 'client', attorney: null, client: x });
    }
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** GET /attorneys/:id/following — public list of attorneys. */
  following(
    viewerId: string,
    attorneyId: string,
    cursor?: string,
  ): Promise<PeoplePage> {
    return this.people(viewerId, attorneyId, 'following', cursor);
  }

  /** The public lists exist for attorneys only: a client's follows are
   * visible to that client alone (§6.2), so any other id is a 404. */
  private async assertPublicAttorney(attorneyId: string): Promise<void> {
    const found = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: attorneyId, ...LISTABLE_ATTORNEY },
          // OQ-038: client profiles have public follow lists too.
          {
            id: attorneyId,
            role: 'client',
            status: 'active',
            deleted_at: null,
          },
        ],
      },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Attorney not found.',
      });
    }
  }

  /** GET /users/me/following — the caller's own follows. */
  mine(viewerId: string, cursor?: string): Promise<AttorneyListPage> {
    return this.pageOf(viewerId, cursor, 'follower', viewerId);
  }

  /**
   * GET /suggestions/attorneys (§6.3): verified attorneys the user does not
   * follow, by rating and activity (posts in 30 days), a client's own state
   * first. The ranked pool is cached per state for 10 minutes; the cursor is
   * a position in it.
   */
  async suggestions(
    user: RequestUser,
    cursor?: string,
  ): Promise<AttorneyListPage> {
    const state =
      user.role === 'client'
        ? ((
            await this.prisma.clientProfile.findUnique({
              where: { user_id: user.sub },
              select: { state_code: true },
            })
          )?.state_code ?? null)
        : null;
    const pool = await this.suggestionPool(state);
    const followed = new Set(
      (
        await this.prisma.follow.findMany({
          where: { follower_id: user.sub, followee_id: { in: pool } },
          select: { followee_id: true },
        })
      ).map((f) => f.followee_id),
    );
    const start = cursor
      ? Math.max(
          0,
          Number.parseInt(Buffer.from(cursor, 'base64url').toString(), 10) || 0,
        )
      : 0;
    const picked: string[] = [];
    let i = start;
    for (; i < pool.length && picked.length < PAGE; i++) {
      if (pool[i] !== user.sub && !followed.has(pool[i])) picked.push(pool[i]);
    }
    return {
      items: await this.present(picked, user.sub),
      nextCursor:
        i < pool.length ? Buffer.from(String(i)).toString('base64url') : null,
    };
  }

  private async suggestionPool(state: string | null): Promise<string[]> {
    const key = `suggest:attorneys:${state ?? 'all'}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as string[];
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT a.user_id::STRING AS id
      FROM attorney_profiles AS a
      JOIN users AS u ON u.id = a.user_id AND u.status = 'active' AND u.deleted_at IS NULL
      WHERE a.verification_status = 'verified'
      ORDER BY
        (${state}::STRING IS NOT NULL AND EXISTS (
          SELECT 1 FROM attorney_licenses l
          WHERE l.attorney_id = a.user_id AND l.state_code = ${state}::STRING
            AND l.license_status = 'verified')) DESC,
        a.rating_avg DESC,
        (SELECT count(*) FROM posts p
         WHERE p.author_id = a.user_id AND p.status = 'published'
           AND p.deleted_at IS NULL AND p.created_at > ${since}) DESC,
        a.rating_count DESC,
        a.user_id
      LIMIT ${SUGGEST_POOL}`;
    const ids = rows.map((r) => r.id);
    await this.redis.set(key, JSON.stringify(ids), 'EX', SUGGEST_TTL_SEC);
    return ids;
  }

  /** Keyset over follows(created_at, other id), attorneys only. */
  private async pageOf(
    viewerId: string,
    cursor: string | undefined,
    side: 'followee' | 'follower',
    attorneyId: string,
  ): Promise<AttorneyListPage> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const other = side === 'followee' ? 'follower_id' : 'followee_id';
    const rows = await this.prisma.follow.findMany({
      where: {
        ...(side === 'followee'
          ? { followee_id: attorneyId }
          : { follower_id: attorneyId }),
        // Clients are counted, never listed (§6.2).
        [side === 'followee' ? 'follower' : 'followee']: LISTABLE_ATTORNEY,
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, [other]: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { [other]: 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const ids = page.map((r) =>
      side === 'followee' ? r.follower_id : r.followee_id,
    );
    const last = page[page.length - 1];
    return {
      items: await this.present(ids, viewerId),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({
              createdAt: last.created_at,
              id: side === 'followee' ? last.follower_id : last.followee_id,
            })
          : null,
    };
  }

  /** Attorney rows for any list (follows, suggestions, search), in [ids]
   * order; suspended/inactive ids drop out. */
  async present(
    ids: string[],
    viewerId: string,
  ): Promise<AttorneyListItemDto[]> {
    if (ids.length === 0) return [];
    const [users, mine] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids }, ...LISTABLE_ATTORNEY },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          avatar_file_id: true,
          attorney_profile: {
            select: {
              username: true,
              verification_status: true,
              name_mismatch: true,
              rating_avg: true,
              rating_count: true,
              licenses: {
                where: { license_status: 'verified' },
                select: { state_code: true },
                orderBy: { state_code: 'asc' },
              },
              practice_areas: {
                select: { practice_area: { select: { i18n_key: true } } },
                orderBy: { practice_area: { sort: 'asc' } },
                take: LIST_PRACTICES,
              },
            },
          },
        },
      }),
      this.prisma.follow.findMany({
        where: { follower_id: viewerId, followee_id: { in: ids } },
        select: { followee_id: true },
      }),
    ]);
    const following = new Set(mine.map((m) => m.followee_id));
    const byId = new Map(users.map((u) => [u.id, u]));
    const avatars = await this.files.avatarUrlsMany(
      users.map((u) => u.avatar_file_id),
    );
    const out: AttorneyListItemDto[] = [];
    for (const id of ids) {
      const u = byId.get(id);
      const p = u?.attorney_profile;
      if (!u || !p) continue;
      out.push({
        id,
        username: p.username,
        firstName: u.first_name,
        lastName: u.last_name,
        avatarUrl: u.avatar_file_id
          ? (avatars.get(u.avatar_file_id)?.url256 ?? null)
          : null,
        verifiedBadge:
          p.verification_status === 'verified' &&
          !p.name_mismatch &&
          p.licenses.length > 0,
        rating: { avg: Number(p.rating_avg), count: p.rating_count },
        states: p.licenses.map((l) => l.state_code),
        practiceI18nKeys: p.practice_areas.map((x) => x.practice_area.i18n_key),
        isFollowing: following.has(id),
      });
    }
    return out;
  }
}

function notAllowed(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: ErrorCode.FOLLOW_NOT_ALLOWED,
    message: 'You can follow attorneys only, and not yourself.',
  });
}

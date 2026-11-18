import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from '../../redis/redis.constants';
import { bumpFeedVersion } from '../../common/cache/feed-version';
import {
  CounterAggregator,
  profileEntity,
} from '../counters/counter-aggregator.service';
import { FilesService } from '../files/files.service';
import { cachedBlockSet, dropBlockSets } from './block-set.cache';
import { withBlockPairLock } from './block-check';
import { shardContext } from '../../sharding/shard-context';
import { dropPresencePerms } from '../presence/presence-perm';
import type { BlockedUserDto } from './blocks.dto';
import { userDirectory } from '../../sharding/user-directory';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Owner decision 2026-09-29 (OQ-028): any signed-in user can block any
 * other user (attorney or client) and unblock later. A block is one-way
 * in storage and symmetric in effect: neither side can message, follow
 * or find the other in People search while it exists; profiles carry
 * `isBlocked` / `hasBlockedMe`. Existing follows between the two are
 * removed at block time. Cases and bids already in progress are not
 * touched (business records, docs/04).
 */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly counters: CounterAggregator,
    // Caching round 2 (S2-2): the block set is a per-user cache.
    @Inject(REDIS_CACHE_CLIENT) private readonly redis: Redis,
    // Verify batch 7 (BL2): the presence permission cache lives here.
    @Optional() @Inject(REDIS_CLIENT) private readonly main?: Redis,
  ) {}

  async block(userId: string, targetId: string): Promise<void> {
    if (userId === targetId) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'You cannot block yourself.',
      });
    }
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, deleted_at: null },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found.',
      });
    }
    const between = {
      OR: [
        { follower_id: userId, followee_id: targetId },
        { follower_id: targetId, followee_id: userId },
      ],
    };
    // Verify batch 7 (BL1): the same per-pair lock FollowsService.follow
    // takes, so no follow is inserted between this block and its clean-up.
    // Read committed: every statement after the lock sees a follow that a
    // racing transaction committed while this one waited (a serializable
    // snapshot, taken before the wait, would miss it). Several databases
    // (KNOWN_ERRORS 215): the lock is on the primary, the block is written
    // in the blocker's database and each follow is removed in its
    // follower's database (withBlockPairLock).
    const removed = await withBlockPairLock(
      this.prisma,
      userId,
      targetId,
      'blocks.block',
      async (db, split) => {
        if (split) {
          await shardContext.runForUser(userId, () =>
            db.userBlock.createMany({
              data: [{ blocker_id: userId, blocked_id: targetId }],
              skipDuplicates: true,
            }),
          );
          const gone: { follower_id: string; followee_id: string }[] = [];
          for (const [follower, followee] of [
            [userId, targetId],
            [targetId, userId],
          ]) {
            const { count } = await shardContext.runForUser(follower, () =>
              db.follow.deleteMany({
                where: { follower_id: follower, followee_id: followee },
              }),
            );
            if (count > 0) {
              gone.push({ follower_id: follower, followee_id: followee });
            }
          }
          return gone;
        }
        await db.userBlock.createMany({
          data: [{ blocker_id: userId, blocked_id: targetId }],
          skipDuplicates: true,
        });
        // No follows either way while blocked.
        const rows = await db.follow.findMany({
          where: between,
          select: { follower_id: true, followee_id: true },
        });
        await db.follow.deleteMany({ where: between });
        return rows;
      },
    );
    // Shard-ready step 6: roles come from the user directory, not a join.
    const roles = await userDirectory(this.prisma).select(
      removed.flatMap((f) => [f.follower_id, f.followee_id]),
      { role: true },
    );
    // Owner 2026-10-18 (speed): both users' cached block sets are stale now.
    await dropBlockSets(this.redis, userId, targetId);
    // BL2: a watcher who opened the chat before the block is dropped on the
    // next presence announcement (PresenceService.mayWatch asks again).
    if (this.main) await dropPresencePerms(this.main, userId, targetId);
    // S2-3: both feeds change (blocked authors, removed follows).
    await bumpFeedVersion(this.redis, userId, targetId);
    // Audit 2026-10-01: the removed follows leave both profiles' counters
    // (followers / following) — as an unfollow does.
    for (const f of removed) {
      await this.counters.bump(
        profileEntity(roles.get(f.followee_id)?.role ?? null),
        f.followee_id,
        'followers_count',
        -1,
      );
      await this.counters.bump(
        profileEntity(roles.get(f.follower_id)?.role ?? null),
        f.follower_id,
        'following_count',
        -1,
      );
    }
  }

  async unblock(userId: string, targetId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({
      where: { blocker_id: userId, blocked_id: targetId },
    });
    await dropBlockSets(this.redis, userId, targetId);
    if (this.main) await dropPresencePerms(this.main, userId, targetId);
    await bumpFeedVersion(this.redis, userId, targetId);
  }

  /** `{ isBlocked, hasBlockedMe }` between a viewer and a target. */
  async relation(
    viewerId: string,
    targetId: string,
    db: Db = this.prisma,
  ): Promise<{ isBlocked: boolean; hasBlockedMe: boolean }> {
    if (viewerId === targetId) return { isBlocked: false, hasBlockedMe: false };
    const rows = await db.userBlock.findMany({
      where: {
        OR: [
          { blocker_id: viewerId, blocked_id: targetId },
          { blocker_id: targetId, blocked_id: viewerId },
        ],
      },
      select: { blocker_id: true },
    });
    return {
      isBlocked: rows.some((r) => r.blocker_id === viewerId),
      hasBlockedMe: rows.some((r) => r.blocker_id === targetId),
    };
  }

  /** True when either of the two blocked the other. */
  async isBlockedEitherWay(
    a: string,
    b: string,
    db: Db = this.prisma,
  ): Promise<boolean> {
    const r = await this.relation(a, b, db);
    return r.isBlocked || r.hasBlockedMe;
  }

  /** Every user id the viewer must not see / be seen by (both directions),
   * for filtering lists. Bounded by the viewer's own block activity. */
  async hiddenIds(viewerId: string): Promise<Set<string>> {
    return new Set(await cachedBlockSet(this.prisma, this.redis, viewerId));
  }

  /** 403 USER_BLOCKED when the two users may not interact. */
  async assertNotBlocked(a: string, b: string, db: Db = this.prisma) {
    if (await this.isBlockedEitherWay(a, b, db)) {
      throw new ForbiddenException({
        code: ErrorCode.USER_BLOCKED,
        message: 'This user is not available.',
      });
    }
  }

  /** `GET /users/me/blocks`: who the viewer blocked, newest first. */
  async list(userId: string): Promise<BlockedUserDto[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blocker_id: userId },
      orderBy: { created_at: 'desc' },
      take: 500,
      select: { created_at: true, blocked_id: true },
    });
    const blockedUsers = await userDirectory(this.prisma).select(
      rows.map((r) => r.blocked_id),
      {
        id: true,
        role: true,
        first_name: true,
        last_name: true,
        avatar_file_id: true,
        attorney_profile: { select: { username: true } },
        client_profile: { select: { username: true } },
      },
    );
    const avatars = await this.files.avatarUrlsMany(
      rows.map((r) => blockedUsers.get(r.blocked_id)?.avatar_file_id ?? null),
    );
    return rows.flatMap((r) => {
      const u = blockedUsers.get(r.blocked_id);
      if (!u) return [];
      if (u.role !== 'attorney' && u.role !== 'client') return [];
      return [
        {
          id: u.id,
          role: u.role,
          username:
            u.attorney_profile?.username ?? u.client_profile?.username ?? null,
          firstName: u.first_name,
          lastName: u.last_name,
          avatarUrl: u.avatar_file_id
            ? (avatars.get(u.avatar_file_id)?.url256 ?? null)
            : null,
          blockedAt: r.created_at.toISOString(),
        },
      ];
    });
  }
}

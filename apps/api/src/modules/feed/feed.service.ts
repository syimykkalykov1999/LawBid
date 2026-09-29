import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Post } from '@prisma/client';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { PostPage } from '../posts/dto/posts.dto';
import {
  PostPresenter,
  VISIBLE_POST_WHERE,
} from '../posts/post-presenter.service';
import {
  decodeFeedCursor,
  encodeFeedCursor,
  mixPage,
  recoSlotsFor,
  type FeedCursor,
} from './feed-mixer';
import type { FeedProvider } from './feed.provider';

export const RECO_CURRENT_KEY = 'feed:reco:current';
export const recoKey = (version: string) => `feed:reco:${version}`;
const seenKey = (uid: string) => `feed:seen:${uid}`;
const firstPageKey = (uid: string, limit: number) =>
  `feed:first:${uid}:${limit}`;
/** §2.2.4: last 500 shown recommendations, kept 3 days. */
const SEEN_MAX = 500;
const SEEN_TTL_SEC = 3 * 24 * 3600;
/** §2.2.6: first page cached for 60 s. */
const FIRST_PAGE_TTL_SEC = 60;
/** How far into the snapshot one page may scan for unseen candidates. */
const RECO_SCAN = 200;

function badCursor(): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Invalid cursor.',
    details: { field: 'cursor' },
  });
}

/**
 * docs/05 §2.2 (stage 5.3) feed: posts of followed attorneys (+ own posts
 * for an attorney), newest first, with every 4th slot from the
 * recommendation snapshot (a Redis ZSET rebuilt every 10 minutes by
 * FeedRecoJob). Recommendations exclude followed/own authors and the
 * viewer's recently shown recommendations; followed posts are never
 * hidden by "seen" (the feed must still open on them next time).
 */
@Injectable()
export class FeedService implements FeedProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: PostPresenter,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async page(
    viewer: RequestUser,
    rawCursor: string | undefined,
    limit: number,
  ): Promise<PostPage> {
    const first = !rawCursor;
    let cursor: FeedCursor = { f: null, r: 0, v: null };
    if (rawCursor) {
      const decoded = decodeFeedCursor(rawCursor);
      if (!decoded) throw badCursor();
      cursor = decoded;
    }
    if (first) {
      const cached = await this.redis.get(firstPageKey(viewer.sub, limit));
      if (cached) {
        return this.fromIds(
          viewer,
          JSON.parse(cached) as { ids: string[]; next: string | null },
        );
      }
    }

    const followees = await this.prisma.follow.findMany({
      where: { follower_id: viewer.sub },
      select: { followee_id: true },
    });
    const hasFollows = followees.length > 0;
    const authorIds = followees.map((f) => f.followee_id);
    if (viewer.role === 'attorney') authorIds.push(viewer.sub);

    // Followed stream (+ own posts): from the top on the first page, after
    // cursor.f later; cursor.f === null on a later page = exhausted.
    const streamOpen = authorIds.length > 0 && (first || cursor.f !== null);
    const after = first ? null : cursor.f;
    const following = streamOpen
      ? await this.prisma.post.findMany({
          where: {
            ...VISIBLE_POST_WHERE,
            author_id: { in: authorIds },
            ...(after
              ? {
                  OR: [
                    { created_at: { lt: new Date(after.t) } },
                    { created_at: new Date(after.t), id: { lt: after.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        })
      : [];

    // Enough candidates for the reco slots, or for the whole page once
    // the followed stream can't fill it.
    const recoNeed =
      following.length > limit ? recoSlotsFor(limit, hasFollows) : limit;
    const reco = await this.recommendations(
      viewer,
      authorIds,
      first ? 0 : cursor.r,
      first ? null : cursor.v,
      recoNeed,
    );

    const page = mixPage(
      following.slice(0, limit),
      reco.posts,
      limit,
      hasFollows,
    );
    const followingIds = new Set(following.map((p) => p.id));
    const usedFollowing = page.filter((p) => followingIds.has(p.id));
    const usedReco = page.filter((p) => !followingIds.has(p.id));
    const lastF = usedFollowing[usedFollowing.length - 1];
    const next: FeedCursor = {
      // More followed posts exist only if some fetched ones were not used.
      f:
        lastF && following.length > usedFollowing.length
          ? { t: lastF.created_at.toISOString(), id: lastF.id }
          : null,
      r: reco.next(usedReco.length),
      v: reco.version,
    };
    const nextCursor = page.length < limit ? null : encodeFeedCursor(next);

    await this.markSeen(
      viewer.sub,
      usedReco.map((p) => p.id),
    );
    if (first) {
      await this.redis.set(
        firstPageKey(viewer.sub, limit),
        JSON.stringify({ ids: page.map((p) => p.id), next: nextCursor }),
        'EX',
        FIRST_PAGE_TTL_SEC,
      );
    }
    return {
      items: await this.presenter.present(page, viewer.sub),
      nextCursor,
    };
  }

  /** Walks the pinned snapshot from [offset], skipping followed/own
   * authors, seen and non-visible posts. Returns candidates and a function
   * mapping "used n of them" → the next snapshot offset. */
  private async recommendations(
    viewer: RequestUser,
    excludeAuthors: string[],
    offset: number,
    pinned: string | null,
    need: number,
  ): Promise<{
    posts: Post[];
    next: (used: number) => number;
    version: string | null;
  }> {
    const current = await this.redis.get(RECO_CURRENT_KEY);
    let version = pinned;
    if (!version || !(await this.redis.exists(recoKey(version)))) {
      version = current;
      offset = pinned && pinned !== current ? 0 : offset;
    }
    if (!version || need <= 0)
      return { posts: [], next: () => offset, version };
    const ids = await this.redis.zrevrange(
      recoKey(version),
      offset,
      offset + RECO_SCAN - 1,
    );
    if (ids.length === 0) return { posts: [], next: () => offset, version };
    const seen = new Set(
      await this.redis.zrange(seenKey(viewer.sub), '0', '-1'),
    );
    const exclude = new Set(excludeAuthors);
    const rows = await this.prisma.post.findMany({
      where: {
        ...VISIBLE_POST_WHERE,
        id: { in: ids.filter((id) => !seen.has(id)) },
      },
    });
    const byId = new Map(rows.map((p) => [p.id, p]));
    const picked: Post[] = [];
    const pickedIdx: number[] = [];
    ids.forEach((id, i) => {
      const p = byId.get(id);
      if (p && !exclude.has(p.author_id) && picked.length < need) {
        picked.push(p);
        pickedIdx.push(i);
      }
    });
    return {
      posts: picked,
      version,
      next: (used) =>
        used === 0
          ? offset + (picked.length === 0 ? ids.length : (pickedIdx[0] ?? 0))
          : offset + pickedIdx[used - 1] + 1,
    };
  }

  private async markSeen(uid: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const now = Date.now();
    const tx = this.redis.multi();
    ids.forEach((id) => tx.zadd(seenKey(uid), now, id));
    tx.zremrangebyrank(seenKey(uid), 0, -(SEEN_MAX + 1));
    tx.expire(seenKey(uid), SEEN_TTL_SEC);
    await tx.exec();
  }

  private async fromIds(
    viewer: RequestUser,
    cached: { ids: string[]; next: string | null },
  ): Promise<PostPage> {
    const rows = await this.prisma.post.findMany({
      where: { ...VISIBLE_POST_WHERE, id: { in: cached.ids } },
    });
    const byId = new Map(rows.map((p) => [p.id, p]));
    const ordered = cached.ids.flatMap((id) =>
      byId.has(id) ? [byId.get(id)!] : [],
    );
    return {
      items: await this.presenter.present(ordered, viewer.sub),
      nextCursor: cached.next,
    };
  }
}

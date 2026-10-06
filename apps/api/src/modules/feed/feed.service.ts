import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { Post, Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { PostPage } from '../posts/dto/posts.dto';
import {
  ContentFilterService,
  contentModeWhere,
  type FeedContentMode,
} from '../posts/content-filter.service';
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
import { PromotionDeliveryService } from '../promotions/promotion-delivery.service';

export const RECO_CURRENT_KEY = 'feed:reco:current';
export const recoKey = (version: string) => `feed:reco:${version}`;
const seenKey = (uid: string) => `feed:seen:${uid}`;
const firstPageKey = (uid: string, limit: number, mode: FeedContentMode) =>
  `feed:first:${uid}:${limit}:${mode}`;
/** §2.2.4: last 500 shown recommendations, kept 3 days. */
const SEEN_MAX = 500;
const SEEN_TTL_SEC = 3 * 24 * 3600;
/** §2.2.6: first page cached for 60 s. */
const FIRST_PAGE_TTL_SEC = 60;
/** How far into the snapshot one page may scan for unseen candidates. */
const RECO_SCAN = 200;
/** Followed authors considered for the stream. */
const FOLLOWEES_MAX = 2000;

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
    private readonly contentFilter: ContentFilterService,
    @Optional() private readonly promoDelivery?: PromotionDeliveryService,
  ) {}

  /** The organic page plus paid promoted posts (owner 2026-10-05):
   * one after every N-th post, marked with their promotionId. */
  async page(
    viewer: RequestUser,
    rawCursor: string | undefined,
    limit: number,
  ): Promise<PostPage> {
    const organic = await this.organicPage(viewer, rawCursor, limit);
    return this.withPromoted(viewer, organic);
  }

  private async withPromoted(
    viewer: RequestUser,
    page: PostPage,
  ): Promise<PostPage> {
    const delivery = this.promoDelivery;
    if (!delivery || page.items.length === 0) return page;
    try {
      const settings = await delivery.settings();
      if (!settings.postsEnabled) return page;
      const every = settings.feedEveryN;
      const slots = Math.floor(page.items.length / (every - 1));
      if (slots < 1) return page;
      const candidates = await delivery.eligible('post', viewer.sub, {
        excludeUserIds: await this.blockedAuthors(viewer),
      });
      const onPage = new Set(page.items.map((p) => p.id));
      const wanted = candidates
        .filter((c) => c.postId && !onPage.has(c.postId))
        .slice(0, slots * 2);
      if (wanted.length === 0) return page;
      // A "Legal only" viewer gets no promoted general posts either.
      const only = contentModeWhere(
        await this.contentFilter.modeOf(viewer.sub),
      );
      const rows = await this.prisma.post.findMany({
        where: {
          ...VISIBLE_POST_WHERE,
          ...only,
          id: { in: wanted.map((c) => c.postId!) },
        },
      });
      const byId = new Map(rows.map((p) => [p.id, p]));
      const picked = wanted.filter((c) => byId.has(c.postId!)).slice(0, slots);
      if (picked.length === 0) return page;
      const presented = await this.presenter.present(
        picked.map((c) => byId.get(c.postId!)!),
        viewer.sub,
      );
      const ads = presented.map((dto, i) => ({
        ...dto,
        promotionId: picked[i].id,
      }));
      const items = [...page.items];
      ads.forEach((ad, i) => {
        items.splice(Math.min(items.length, (i + 1) * every - 1), 0, ad);
      });
      delivery.recordImpressions(
        viewer.sub,
        picked.map((c) => c.id),
      );
      return { ...page, items };
    } catch {
      return page;
    }
  }

  private async organicPage(
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
    // Owner 2026-10-05: "Legal only" hides general (personal) posts.
    const mode = await this.contentFilter.modeOf(viewer.sub);
    const only = contentModeWhere(mode);
    if (first) {
      const cached = await this.redis.get(
        firstPageKey(viewer.sub, limit, mode),
      );
      if (cached) {
        return this.fromIds(
          viewer,
          JSON.parse(cached) as { ids: string[]; next: string | null },
          only,
        );
      }
    }

    // Bounded: the most recent follows feed the "followed" stream (load
    // review — an account following 50k attorneys can't make an unbounded
    // IN list).
    const followees = await this.prisma.follow.findMany({
      where: { follower_id: viewer.sub },
      select: { followee_id: true },
      orderBy: { created_at: 'desc' },
      take: FOLLOWEES_MAX,
    });
    const hasFollows = followees.length > 0;
    const authorIds = followees.map((f) => f.followee_id);
    if (viewer.role === 'attorney') authorIds.push(viewer.sub);

    // Once the "everything else" tail has started, the followed stream and
    // the recommendations were already exhausted: keep paging the tail.
    if (!first && cursor.l) {
      const tail = await this.latestTail(
        viewer,
        authorIds,
        cursor.v,
        cursor.l,
        [],
        limit,
        only,
      );
      const last = tail[tail.length - 1];
      return {
        items: await this.presenter.present(tail, viewer.sub),
        nextCursor:
          tail.length < limit || !last
            ? null
            : encodeFeedCursor({
                f: null,
                r: cursor.r,
                v: cursor.v,
                l: { t: last.created_at.toISOString(), id: last.id },
              }),
      };
    }

    // Followed stream (+ own posts): from the top on the first page, after
    // cursor.f later; cursor.f === null on a later page = exhausted.
    const streamOpen = authorIds.length > 0 && (first || cursor.f !== null);
    const after = first ? null : cursor.f;
    const following = streamOpen
      ? await this.prisma.post.findMany({
          where: {
            ...VISIBLE_POST_WHERE,
            ...only,
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
    let reco = await this.recommendations(
      viewer,
      authorIds,
      first ? 0 : cursor.r,
      first ? null : cursor.v,
      recoNeed,
      only,
    );
    // Owner 2026-10-02: a viewer who has already been shown every
    // recommendation (a small catalog, or someone who follows nobody) must
    // not open on "Your feed is empty" — start the rotation over.
    // An attorney's own posts count as "followed" here, so test `hasFollows`
    // as well: with no follows the own posts must not stop the rotation.
    if (
      first &&
      reco.posts.length === 0 &&
      (following.length === 0 || !hasFollows)
    ) {
      await this.redis.del(seenKey(viewer.sub));
      reco = await this.recommendations(
        viewer,
        authorIds,
        0,
        null,
        recoNeed,
        only,
      );
    }

    const page = mixPage(
      following.slice(0, limit),
      reco.posts,
      limit,
      hasFollows,
    );
    const followingIds = new Set(following.map((p) => p.id));
    const usedFollowing = page.filter((p) => followingIds.has(p.id));
    const usedReco = page.filter((p) => !followingIds.has(p.id));
    // Owner 2026-10-05: "All" must show every post, also to a brand-new
    // account that follows nobody. Recommendations only cover the last 14
    // days and only exist once FeedRecoJob has run, so when followed posts
    // and recommendations can't fill the page, every other visible post
    // follows, newest first (the same posts the topic filters list).
    const tail =
      page.length < limit
        ? await this.latestTail(
            viewer,
            authorIds,
            reco.version,
            null,
            page.map((p) => p.id),
            limit - page.length,
            only,
          )
        : [];
    page.push(...tail);
    const lastL = tail[tail.length - 1];
    const lastF = usedFollowing[usedFollowing.length - 1];
    const next: FeedCursor = {
      // More followed posts exist only if some fetched ones were not used.
      f:
        lastF && following.length > usedFollowing.length
          ? { t: lastF.created_at.toISOString(), id: lastF.id }
          : null,
      r: reco.next(usedReco.length),
      v: reco.version,
      l: lastL ? { t: lastL.created_at.toISOString(), id: lastL.id } : null,
    };
    const nextCursor = page.length < limit ? null : encodeFeedCursor(next);

    await this.markSeen(
      viewer.sub,
      usedReco.map((p) => p.id),
    );
    if (first) {
      await this.redis.set(
        firstPageKey(viewer.sub, limit, mode),
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
    only: Prisma.PostWhereInput = {},
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
    // Only the candidates are checked, not the whole seen set.
    const scores = await this.redis.zmscore(seenKey(viewer.sub), ...ids);
    const seen = new Set(ids.filter((_, i) => scores[i] !== null));
    const exclude = new Set(excludeAuthors);
    // Audit 2026-10-01: no recommended posts of people blocked either way.
    for (const id of await this.blockedAuthors(viewer)) exclude.add(id);
    const rows = await this.prisma.post.findMany({
      where: {
        ...VISIBLE_POST_WHERE,
        ...only,
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

  /** Every other visible post, newest first, after [after]: not by a
   * followed/own author (their stream already ran out), not in the
   * recommendation snapshot (served there), not on this page and not by
   * anyone blocked either way. */
  private async latestTail(
    viewer: RequestUser,
    excludeAuthors: string[],
    version: string | null,
    after: { t: string; id: string } | null,
    excludeIds: string[],
    take: number,
    only: Prisma.PostWhereInput = {},
  ): Promise<Post[]> {
    if (take <= 0) return [];
    const authors = new Set(excludeAuthors);
    for (const id of await this.blockedAuthors(viewer)) authors.add(id);
    const ids = new Set(excludeIds);
    if (version) {
      const snapshot = await this.redis.zrevrange(recoKey(version), 0, -1);
      for (const id of snapshot) ids.add(id);
    }
    return this.prisma.post.findMany({
      where: {
        AND: [
          VISIBLE_POST_WHERE,
          only,
          ...(authors.size > 0 ? [{ author_id: { notIn: [...authors] } }] : []),
          ...(ids.size > 0 ? [{ id: { notIn: [...ids] } }] : []),
          ...(after
            ? [
                {
                  OR: [
                    { created_at: { lt: new Date(after.t) } },
                    { created_at: new Date(after.t), id: { lt: after.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  private async blockedAuthors(viewer: RequestUser): Promise<string[]> {
    const blocks = await this.prisma.userBlock.findMany({
      where: { OR: [{ blocker_id: viewer.sub }, { blocked_id: viewer.sub }] },
      select: { blocker_id: true, blocked_id: true },
      take: 5000,
    });
    return blocks.map((b) =>
      b.blocker_id === viewer.sub ? b.blocked_id : b.blocker_id,
    );
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
    only: Prisma.PostWhereInput,
  ): Promise<PostPage> {
    const rows = await this.prisma.post.findMany({
      where: { ...VISIBLE_POST_WHERE, ...only, id: { in: cached.ids } },
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

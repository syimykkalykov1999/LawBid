import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import type { Post, Prisma } from '../../generated/prisma/client';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor as decodeKeyset,
  encodeCursor as encodeKeyset,
  createdBefore,
} from '../../common/pagination/cursor.util';
import { GUEST_USER_ID } from '../../common/viewer/guest';
import { PrismaReadService } from '../../prisma/prisma-read.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from '../../redis/redis.constants';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { cachedBlockSet } from '../blocks/block-set.cache';
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
import type { PostReposterDto } from '../posts/dto/posts.dto';
import {
  decodeFeedCursor,
  encodeFeedCursor,
  mixPage,
  recoSlotsFor,
  type FeedCursor,
} from './feed-mixer';
import type { FeedProvider } from './feed.provider';
import { PromotionDeliveryService } from '../promotions/promotion-delivery.service';
import { feedVersion } from '../../common/cache/feed-version';
import { ck } from '../../redis/redis-cluster-safe';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import {
  FeedTimelineService,
  followToken,
  selfToken,
} from './feed-timeline.service';
import { createHash } from 'node:crypto';
import {
  HOME_FEED_RANKER,
  type HomeFeedArm,
  type HomeFeedRanker,
  RANKED_PIN_TTL_SEC,
} from '../../common/feed-ranking/home-feed-ranker';

export const recoCurrentKey = () => ck('reco', 'feed:reco:current');
export const recoKey = (version: string) => ck('reco', `feed:reco:${version}`);
/** Row 64 (10M load test 2026-11-12): post id → author id of one snapshot,
 * written next to it by FeedRecoJob. A timeline entry that carries its
 * author (Twitter "Timelines at Scale": tweet id + user id per entry) lets
 * the feed drop followed / own / blocked authors without reading posts. */
export const recoAuthorsKey = (version: string) =>
  ck('reco', `feed:reco:${version}:authors`);
const seenKey = (uid: string) => `feed:seen:${uid}`;
const firstPageKey = (
  uid: string,
  limit: number,
  mode: FeedContentMode,
  version: string,
) => `feed:first:${uid}:${limit}:${mode}:${version}`;
/** §2.2.4: last 500 shown recommendations, kept 3 days. */
const SEEN_MAX = 500;
const SEEN_TTL_SEC = 3 * 24 * 3600;
/** §2.2.6: first page cached for 60 s. */
const FIRST_PAGE_TTL_SEC = 60;
/** One chunk of the snapshot read at a time while looking for unseen
 * candidates; a page walks up to `feed.reco_scan_max` ids (CONTENT H-3). */
const RECO_SCAN = 200;
/** Followed authors considered for the stream. */
const FOLLOWEES_MAX = 2000;

/** VISIBLE_POST_WHERE split in its post half and its author half (derived,
 * so the two can never drift from the shared rule). */
const { author: AUTHOR_VISIBLE, ...POST_VISIBLE_WHERE } = VISIBLE_POST_WHERE;
const AUTHOR_VISIBLE_WHERE = AUTHOR_VISIBLE as Prisma.UserWhereInput;

/** Owner 25.11: the model arm's ranked window of one scroll (FeedCursor.k). */
const rankedKey = (uid: string, pin: string) => `feed:rank:${uid}:${pin}`;

interface RankedWindow {
  ids: string[];
  rep: Record<string, PostReposterDto>;
}

/** One page of the feed before it is presented. */
interface StreamPage {
  page: Post[];
  reposters: Map<string, PostReposterDto>;
  /** The chronological read after this page (null = the feed ended). */
  next: FeedCursor | null;
  nextCursor: string | null;
  /** Recommendations served on it (marked seen). */
  usedReco: string[];
  /** The posts model's rows the page was ranked with (model arm). */
  rows?: ReadonlyMap<string, Record<string, number>>;
}

const emptyPage = (): PostPage => ({ items: [], nextCursor: null });

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
/** Row 126 (#1084): the keyset condition of the feed. It moved to
 * common/pagination (createdBefore) so every (created_at DESC, id DESC)
 * list reads the index the same way; the name stays for the feed. */
export const postsBefore = createdBefore;

@Injectable()
export class FeedService implements FeedProvider {
  private readonly log = new Logger(FeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: PostPresenter,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly contentFilter: ContentFilterService,
    @Optional() private readonly promoDelivery?: PromotionDeliveryService,
    // Caching round 2 (S2-2): the per-viewer caches (first page, seen,
    // block set) live on the evictable cache Redis; the recommendation
    // snapshot stays on the main client (written by FeedRecoJob).
    @Optional() @Inject(REDIS_CACHE_CLIENT) cache?: Redis,
    // DB-ops S5-6: the guest feed (no viewer, no writes) reads the replica.
    @Optional() private readonly read?: PrismaReadService,
    // Algo audit 2026-10-27: scan depth / repost cap (built-in defaults
    // when absent).
    @Optional() private readonly settings?: AppSettingsService,
    // Item 23 (F1): the precomputed timeline (fan-out on write); absent =
    // the read below, as before.
    @Optional() private readonly timeline?: FeedTimelineService,
    // Owner 25.11: the posts model orders the model arm's window; absent =
    // the feed as before (and no impressions log).
    @Optional()
    @Inject(HOME_FEED_RANKER)
    private readonly reco?: HomeFeedRanker,
  ) {
    this.cache = cache ?? redis;
  }

  private readonly cache: Redis;

  /** The organic page plus paid promoted posts (owner 2026-10-05):
   * one after every N-th post, marked with their promotionId. */
  async page(
    viewer: RequestUser,
    rawCursor: string | undefined,
    limit: number,
  ): Promise<PostPage> {
    if (viewer.guest) return this.guestPage(rawCursor, limit);
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
          // Videos have their own counter in the reels.
          video_asset_id: null,
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
        promotionCta: picked[i].ctaType
          ? { type: picked[i].ctaType, value: picked[i].ctaValue }
          : null,
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
    } catch (e) {
      // Promoted posts are best effort; say why one did not come.
      this.log.warn({ err: String(e) }, 'promoted posts skipped');
      return page;
    }
  }

  /**
   * Owner 2026-10-22 (guest browsing): what someone without an account
   * sees on the feed's public tab: the newest posts of active attorneys, no
   * follows, no "seen" memory, no paid slots. Same PostDto as the signed-in
   * feed; every viewer field (liked, saved, following) comes out false.
   */
  private async guestPage(
    rawCursor: string | undefined,
    limit: number,
  ): Promise<PostPage> {
    let c: { createdAt: Date; id: string } | undefined;
    if (rawCursor) {
      try {
        c = decodeKeyset(rawCursor);
      } catch {
        throw badCursor();
      }
    }
    const rows = await (this.read?.db ?? this.prisma).post.findMany({
      where: {
        AND: [
          VISIBLE_POST_WHERE,
          { author: { role: 'attorney' } },
          c ? createdBefore({ t: c.createdAt, id: c.id }) : {},
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await this.presenter.present(page, GUEST_USER_ID),
      nextCursor:
        rows.length > limit && last
          ? encodeKeyset({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  private async organicPage(
    viewer: RequestUser,
    rawCursor: string | undefined,
    limit: number,
  ): Promise<PostPage> {
    const first = !rawCursor;
    // 18.11: when this scroll started (see FeedCursor.s); an older cursor
    // without it keeps the old rule (no seen recommendation in the tail).
    const startedAt = Date.now();
    let cursor: FeedCursor = { f: null, r: 0, v: null };
    if (rawCursor) {
      const decoded = decodeFeedCursor(rawCursor);
      if (!decoded) throw badCursor();
      cursor = decoded;
    }
    // Owner 2026-10-05: "Legal only" hides general (personal) posts.
    const mode = await this.contentFilter.modeOf(viewer.sub);
    const only = contentModeWhere(mode);
    // Owner 25.11 (Instagram home feed): a scroll that started on a ranked
    // window keeps paging that same window (FeedCursor.k).
    if (cursor.k) return this.rankedNext(viewer, cursor, limit, only);
    const arm = (await this.reco?.homeFeedArm(viewer.sub)) ?? null;
    const ranked = !!this.reco?.isHomeModelArm(arm);
    const ver = first ? await feedVersion(this.cache, viewer.sub) : '0';
    // The model arm's first page is another list: its own cache entry.
    const firstKey = `${firstPageKey(viewer.sub, limit, mode, ver)}${ranked ? ':ranked' : ''}`;
    if (first) {
      const cached = await this.cache.get(firstKey);
      if (cached) {
        return this.fromIds(
          viewer,
          JSON.parse(cached) as {
            ids: string[];
            next: string | null;
            rep?: Record<string, PostReposterDto>;
          },
          only,
        );
      }
    }
    const out =
      (first && ranked
        ? await this.rankedFirst(viewer, limit, only, startedAt, arm)
        : null) ??
      (await this.streamPage(viewer, cursor, first, limit, only, startedAt));
    await this.markSeen(viewer.sub, out.usedReco);
    if (first) {
      await this.cache.set(
        firstKey,
        JSON.stringify({
          ids: out.page.map((p) => p.id),
          next: out.nextCursor,
          rep: Object.fromEntries(out.reposters),
        }),
        'EX',
        FIRST_PAGE_TTL_SEC,
      );
    }
    // Owner 25.11: every served page is training data for the posts model
    // (sampled people only; never waited for).
    void this.reco?.logHomeServed(
      viewer.sub,
      out.page.map((p) => p.id),
      first ? 0 : (cursor.n ?? 0),
      arm,
      out.rows,
    );
    return {
      items: await this.presenter.present(out.page, viewer.sub, out.reposters),
      nextCursor: out.nextCursor,
    };
  }

  /**
   * Owner 25.11 (Instagram home feed, "Journey to 1000 models" 2025:
   * candidates first, then the model orders them, served from a fixed
   * window): the model arm's first page. The candidate window is the feed
   * exactly as today (fan-out timeline + celebrity pull, recommendation
   * slots, reposts, the tail) read `reco.ranker.feed_window` posts deep;
   * the posts model orders it once, the order is pinned for the scroll
   * (POST_PIN_TTL_SEC, like Search «Для вас») and paged by FeedCursor.k;
   * after the window the feed goes on exactly where the window's
   * chronological read stopped. The viewer's own posts of the window's
   * first page stay on top (a post just published is seen at once). Null
   * = no model / scoring failed: the caller serves today's page.
   */
  private async rankedFirst(
    viewer: RequestUser,
    limit: number,
    only: Prisma.PostWhereInput,
    startedAt: number,
    arm: HomeFeedArm,
  ): Promise<StreamPage | null> {
    const reco = this.reco;
    if (!reco) return null;
    const window = Math.max(
      limit,
      await this.num('reco.ranker.feed_window', 20, 400),
    );
    const win = await this.streamPage(
      viewer,
      { f: null, r: 0, v: null },
      true,
      window,
      only,
      startedAt,
    );
    if (win.page.length === 0) return null;
    const lead = new Set(
      win.page
        .slice(0, limit)
        .filter((p) => p.author_id === viewer.sub)
        .map((p) => p.id),
    );
    const ranked = await reco.rankHomeWindow(
      viewer.sub,
      win.page.map((p) => p.id),
      lead,
      arm,
    );
    if (!ranked || ranked.ids.length === 0) return null;
    const byId = new Map(win.page.map((p) => [p.id, p]));
    const rep = Object.fromEntries(
      [...win.reposters].filter(([id]) => ranked.ids.includes(id)),
    );
    const pin = createHash('sha256')
      .update(JSON.stringify(ranked.ids))
      .digest('base64url')
      .slice(0, 12);
    try {
      await this.cache.set(
        rankedKey(viewer.sub, pin),
        JSON.stringify({ ids: ranked.ids, rep } satisfies RankedWindow),
        'EX',
        RANKED_PIN_TTL_SEC,
      );
    } catch {
      // Cache down: the window is not kept; serve today's page instead
      // (a scroll that cannot be paged stably is not served ranked).
      return null;
    }
    const pageIds = ranked.ids.slice(0, limit);
    // The chronological read after the window (null: the feed ended in it).
    const after = win.next;
    const nextCursor =
      ranked.ids.length > limit
        ? encodeFeedCursor({
            ...(after ?? { f: null, r: 0, v: null }),
            k: { p: pin, o: limit, ...(after ? {} : { e: true }) },
          })
        : after
          ? encodeFeedCursor({ ...after, n: ranked.ids.length })
          : null;
    return {
      page: pageIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
      reposters: new Map(
        Object.entries(rep).filter(([id]) => pageIds.includes(id)),
      ),
      nextCursor,
      next: null,
      usedReco: win.usedReco,
      rows: ranked.rows,
    };
  }

  /**
   * A later page of a ranked window (FeedCursor.k): the next ids of the
   * pinned order, re-read with the visibility rule, the content mode and
   * the block set (a post deleted, hidden or blocked since is never shown).
   * The window lost (cache eviction) = the feed goes on chronologically
   * from where the window's read stopped.
   */
  private async rankedNext(
    viewer: RequestUser,
    cursor: FeedCursor,
    limit: number,
    only: Prisma.PostWhereInput,
  ): Promise<PostPage> {
    const k = cursor.k!;
    const rest: FeedCursor = { ...cursor, k: undefined };
    // A dead cache node reads as a lost window.
    const raw = await this.cache
      .get(rankedKey(viewer.sub, k.p))
      .catch(() => null);
    const after = (n: number): string | null =>
      k.e ? null : encodeFeedCursor({ ...rest, n });
    if (!raw) {
      const lost = after(cursor.n ?? k.o);
      return lost ? this.organicPage(viewer, lost, limit) : emptyPage();
    }
    const win = JSON.parse(raw) as RankedWindow;
    const arm = (await this.reco?.homeFeedArm(viewer.sub)) ?? null;
    let o = k.o;
    for (;;) {
      const ids = win.ids.slice(o, o + limit);
      const end = o + limit >= win.ids.length;
      const nextCursor = end
        ? after(win.ids.length)
        : encodeFeedCursor({ ...cursor, k: { ...k, o: o + limit } });
      const page = await this.fromIds(
        viewer,
        { ids, next: nextCursor, rep: win.rep },
        only,
      );
      // Everything of this slice was deleted / hidden / blocked since:
      // the next slice, so a page never comes back empty mid-feed.
      if (page.items.length === 0 && !end) {
        o += limit;
        continue;
      }
      void this.reco?.logHomeServed(
        viewer.sub,
        page.items.map((p) => p.id),
        o,
        arm,
      );
      return page;
    }
  }

  /**
   * The feed page as it was before ranking (and still is for everyone
   * outside the model arm): followed + own posts newest first, every 4th
   * slot a recommendation, reposts by people followed, then every other
   * post newest first. [usedReco] are marked seen by the caller.
   */
  private async streamPage(
    viewer: RequestUser,
    cursor: FeedCursor,
    first: boolean,
    limit: number,
    only: Prisma.PostWhereInput,
    startedAt: number,
  ): Promise<StreamPage> {
    const served = first ? 0 : (cursor.n ?? 0);
    // Bounded: the most recent follows feed the "followed" stream (load
    // review — an account following 50k attorneys can't make an unbounded
    // IN list).
    const followees = await this.prisma.follow.findMany({
      where: { follower_id: viewer.sub },
      select: { followee_id: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: FOLLOWEES_MAX,
    });
    const hasFollows = followees.length > 0;
    const authorIds = followees.map((f) => f.followee_id);
    // 18.11 (Instagram): everyone's own posts are in their feed, newest
    // first with the followed ones. Clients post too (photos, briefs,
    // reels); their own post used to be missing from the server's page 1,
    // so a pull to refresh dropped the post they had just published (or
    // left it to a recommendation slot / the tail at the bottom).
    authorIds.push(viewer.sub);

    // Once the "everything else" tail has started, the followed stream and
    // the recommendations were already exhausted: keep paging the tail.
    const since = first ? startedAt : (cursor.s ?? 0);
    if (!first && cursor.l) {
      const tail = await this.latestTail(
        viewer,
        authorIds,
        cursor.v,
        cursor.l,
        [],
        limit,
        only,
        since,
      );
      const last = tail[tail.length - 1];
      const next: FeedCursor | null =
        tail.length < limit || !last
          ? null
          : {
              f: null,
              r: cursor.r,
              v: cursor.v,
              l: { t: last.created_at.toISOString(), id: last.id },
              ...(since ? { s: since } : {}),
              n: served + tail.length,
            };
      return {
        page: tail,
        reposters: new Map(),
        next,
        nextCursor: next ? encodeFeedCursor(next) : null,
        usedReco: [],
      };
    }

    // Followed stream (+ own posts): from the top on the first page, after
    // cursor.f later; cursor.f === null on a later page = exhausted.
    const streamOpen = authorIds.length > 0 && (first || cursor.f !== null);
    const after = first ? null : cursor.f;
    // Row 64 (10M spike 2026-11-12): VISIBLE_POST_WHERE joined users and
    // attorney_profiles for EVERY post of every followed author before the
    // top-N sort (15 follows: 450 posts, 4 110 buffers, 3.5 ms; grows with
    // follows × posts). The author half of the rule depends only on the
    // author, so it is checked once per followed author and the posts are
    // read with the post half only (630 buffers, 1.1 ms): the same rows.
    const shownAuthors = streamOpen ? await this.shownAuthors(authorIds) : [];
    // Item 23 (F1, Twitter "Timelines at Scale"): the same rows from the
    // viewer's precomputed timeline when it provably has them; null = the
    // read below (cold timeline, new follow, older page, cache error).
    const fromTimeline =
      shownAuthors.length && this.timeline
        ? await this.timeline.followed({
            viewerId: viewer.sub,
            tokens: new Map([
              ...followees.map(
                (f) => [f.followee_id, followToken(f.created_at)] as const,
              ),
              [viewer.sub, selfToken()] as const,
            ]),
            shown: shownAuthors,
            where: { ...POST_VISIBLE_WHERE, ...only },
            after,
            take: limit + 1,
          })
        : null;
    const following = fromTimeline
      ? fromTimeline
      : shownAuthors.length
        ? await this.prisma.post.findMany({
            // R2 review: postsBefore() is an `AND`; as its own array item it
            // can never overwrite an `AND` of the visibility rule or the
            // content mode (a spread would), like the other call site.
            where: {
              AND: [
                {
                  ...POST_VISIBLE_WHERE,
                  ...only,
                  author_id: { in: shownAuthors },
                },
                ...(after ? [postsBefore(after)] : []),
              ],
            },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: limit + 1,
          })
        : [];

    // Enough candidates for the reco slots, or for the whole page once
    // the followed stream can't fill it.
    const recoNeed =
      following.length > limit ? recoSlotsFor(limit, hasFollows) : limit;
    // Owner 2026-10-02: a viewer who has already been shown every
    // recommendation must not open on "Your feed is empty". 18.11: the
    // tail below now shows the recommendations seen on earlier visits
    // (newest first, under the fresh posts), so nothing has to be reset —
    // the reset used to bring the old ranked posts back ON TOP of posts
    // published since (owner: «старое сверху, новое внизу»).
    const reco = await this.recommendations(
      viewer,
      authorIds,
      first ? 0 : cursor.r,
      first ? null : cursor.v,
      recoNeed,
      only,
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
            since,
          )
        : [];
    page.push(...tail);
    const lastL = tail[tail.length - 1];
    const lastF = usedFollowing[usedFollowing.length - 1];
    const moreFollowed = !!lastF && following.length > usedFollowing.length;
    const next: FeedCursor = {
      // More followed posts exist only if some fetched ones were not used.
      f:
        lastF && following.length > usedFollowing.length
          ? { t: lastF.created_at.toISOString(), id: lastF.id }
          : null,
      r: reco.next(usedReco.length),
      v: reco.version,
      l: lastL ? { t: lastL.created_at.toISOString(), id: lastL.id } : null,
      ...(since ? { s: since } : {}),
    };
    const ended = page.length < limit;

    // Owner 2026-10-12 (Threads): what the people I follow reposted, in the
    // time window this page covers — "reposted by @name" over the card.
    const reposters = new Map<string, PostReposterDto>();
    if (streamOpen) {
      const reposts = await this.repostsInWindow(
        viewer,
        authorIds,
        after ? new Date(after.t) : null,
        moreFollowed && lastF ? lastF.created_at : null,
        only,
        new Set(page.map((p) => p.id)),
      );
      const names = await this.presenter.reposterNames(
        reposts.map((r) => r.userId),
      );
      for (const r of reposts) {
        let i = page.findIndex(
          (p) => followingIds.has(p.id) && p.created_at < r.at,
        );
        if (i < 0) i = page.length;
        page.splice(i, 0, r.post);
        const who = names.get(r.userId);
        if (who) reposters.set(r.post.id, who);
      }
      // Owner 2026-10-18: a post that is already on the page is shown once,
      // with the header of the most recent reposter the viewer follows.
      const heads = await this.reposterHeaders(
        viewer,
        authorIds,
        page.map((p) => p.id).filter((id) => !reposters.has(id)),
      );
      for (const [postId, who] of heads) reposters.set(postId, who);
    }

    const counted: FeedCursor | null = ended
      ? null
      : { ...next, n: served + page.length };
    return {
      page,
      reposters,
      next: counted,
      nextCursor: counted ? encodeFeedCursor(counted) : null,
      usedReco: usedReco.map((p) => p.id),
    };
  }

  /** postId → the most recent repost by someone the viewer follows, for
   * posts already on the page (no new items are added). */
  private async reposterHeaders(
    viewer: RequestUser,
    authorIds: string[],
    postIds: string[],
  ): Promise<Map<string, PostReposterDto>> {
    const out = new Map<string, PostReposterDto>();
    const followed = authorIds.filter((id) => id !== viewer.sub);
    if (postIds.length === 0 || followed.length === 0) return out;
    const blocked = await this.blockedAuthors(viewer);
    const rows = await this.prisma.postRepost.findMany({
      where: {
        post_id: { in: postIds },
        user_id: {
          in: followed.filter((id) => !blocked.includes(id)),
        },
      },
      select: { post_id: true, user_id: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    const names = await this.presenter.reposterNames(
      rows.map((r) => r.user_id),
    );
    for (const r of rows) {
      const who = names.get(r.user_id);
      if (who && !out.has(r.post_id)) out.set(r.post_id, who);
    }
    return out;
  }

  /** Reposts by [authorIds] made inside (lower, upper): newest first, at
   * most a handful per page; not of blocked people, not already on the
   * page, one per post. */
  private async repostsInWindow(
    viewer: RequestUser,
    authorIds: string[],
    upper: Date | null,
    lower: Date | null,
    only: Prisma.PostWhereInput,
    onPage: Set<string>,
  ): Promise<{ post: Post; userId: string; at: Date }[]> {
    const reposters = authorIds.filter((id) => id !== viewer.sub);
    if (reposters.length === 0) return [];
    const window = {
      user_id: { in: reposters },
      created_at: {
        ...(upper ? { lt: upper } : {}),
        ...(lower ? { gt: lower } : {}),
      },
    };
    // Row 64 (10M spike 2026-11-12): the read below joins posts, users and
    // attorney_profiles; the database plans it on every call (force_custom_
    // plan), 0.9 ms of planning for 0.01 ms of execution, and it nearly
    // always finds nothing. One look at post_reposts (user_id, created_at)
    // first: no repost in the window, nothing to read.
    const any = await this.prisma.postRepost.findFirst({
      where: window,
      select: { id: true },
    });
    if (!any) return [];
    const blocked = await this.blockedAuthors(viewer);
    const rows = await this.prisma.postRepost.findMany({
      where: {
        ...window,
        post: {
          AND: [
            VISIBLE_POST_WHERE,
            only,
            ...(blocked.length > 0 ? [{ author_id: { notIn: blocked } }] : []),
          ],
        },
      },
      include: { post: true },
      orderBy: { created_at: 'desc' },
      // Algo audit 2026-10-27 (CONTENT M-4): was a fixed 10 (extra reposts
      // in a busy window were lost for good).
      take: await this.num('feed.reposts_per_page', 1, 100),
    });
    const seen = new Set(onPage);
    const out: { post: Post; userId: string; at: Date }[] = [];
    for (const r of rows) {
      if (seen.has(r.post_id) || blocked.includes(r.user_id)) continue;
      seen.add(r.post_id);
      out.push({ post: r.post, userId: r.user_id, at: r.created_at });
    }
    return out;
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
    const current = await this.redis.get(recoCurrentKey());
    let version = pinned;
    if (!version || !(await this.redis.exists(recoKey(version)))) {
      version = current;
      offset = pinned && pinned !== current ? 0 : offset;
    }
    if (!version || need <= 0)
      return { posts: [], next: () => offset, version };
    const exclude = new Set(excludeAuthors);
    // Audit 2026-10-01: no recommended posts of people blocked either way.
    for (const id of await this.blockedAuthors(viewer)) exclude.add(id);
    // Algo audit 2026-10-27 (CONTENT H-3): walk the snapshot chunk by chunk
    // (up to `feed.reco_scan_max` ids a page) instead of its first 200 only:
    // a "Legal only" viewer or a heavy reader used to run out after 200 and
    // fall to the tail, which excludes the whole snapshot, so ranks 200-999
    // were never shown to them.
    const depth = await this.num('feed.reco_scan_max', RECO_SCAN, 5000);
    const ids: string[] = [];
    const picked: Post[] = [];
    const pickedIdx: number[] = [];
    while (picked.length < need && ids.length < depth) {
      const from = offset + ids.length;
      const chunk = await this.redis.zrevrange(
        recoKey(version),
        from,
        from + Math.min(RECO_SCAN, depth - ids.length) - 1,
      );
      if (chunk.length === 0) break;
      const base = ids.length;
      ids.push(...chunk);
      // Only the candidates are checked, not the whole seen set.
      // The seen set is a cache: a dead cache node means "nothing seen yet".
      const scores = await this.cache
        .zmscore(seenKey(viewer.sub), ...chunk)
        .catch(() => chunk.map(() => null));
      const fresh = chunk.flatMap((id, i) =>
        scores?.[i] == null ? [{ id, i }] : [],
      );
      if (fresh.length === 0) continue;
      // Row 64 (10M spike 2026-11-12): the chunk filter read id + author of
      // every fresh id of the chunk (~200, joined with users and
      // attorney_profiles for the visibility rule) to keep ≤ `need` of them
      // — the top feed query by database time. The snapshot now carries
      // each post's author, so excluded authors drop out here and only the
      // next ≤ `need` candidates are read, full rows with the visibility
      // rule in one query, in snapshot order, until `need` are found: the
      // same posts, ranks and offsets as before.
      const authors = await this.snapshotAuthors(
        version,
        fresh.map((f) => f.id),
      );
      const candidates = fresh.filter((f) => {
        const a = authors.get(f.id);
        return a !== undefined && !exclude.has(a);
      });
      for (let c = 0; picked.length < need && c < candidates.length;) {
        const batch = candidates.slice(c, c + need - picked.length);
        c += batch.length;
        const rows = await this.prisma.post.findMany({
          where: {
            ...VISIBLE_POST_WHERE,
            ...only,
            id: { in: batch.map((b) => b.id) },
          },
        });
        const byId = new Map(rows.map((p) => [p.id, p]));
        for (const b of batch) {
          const p = byId.get(b.id);
          if (p && !exclude.has(p.author_id)) {
            picked.push(p);
            pickedIdx.push(base + b.i);
          }
        }
      }
    }
    if (ids.length === 0) return { posts: [], next: () => offset, version };
    return {
      posts: picked,
      version,
      next: (used) =>
        used === 0
          ? offset + (picked.length === 0 ? ids.length : (pickedIdx[0] ?? 0))
          : offset + pickedIdx[used - 1] + 1,
    };
  }

  /** [authorIds] whose posts may be shown: the author half of
   * VISIBLE_POST_WHERE (active; a client, or an attorney not suspended). */
  private async shownAuthors(authorIds: string[]): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { ...AUTHOR_VISIBLE_WHERE, id: { in: authorIds } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** post id → author id for [postIds] of snapshot [version]: from the
   * snapshot's author hash; ids it lacks (a snapshot written before the
   * hash existed, or a Redis error) are read from posts (primary key, no
   * joins). A post that no longer exists has no entry. */
  private async snapshotAuthors(
    version: string,
    postIds: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const hint = await this.redis
      .hmget(recoAuthorsKey(version), ...postIds)
      .catch(() => postIds.map(() => null));
    const missing: string[] = [];
    postIds.forEach((id, i) => {
      const a = hint?.[i];
      if (a) out.set(id, a);
      else missing.push(id);
    });
    if (missing.length > 0) {
      const rows = await this.prisma.post.findMany({
        where: { id: { in: missing } },
        select: { id: true, author_id: true },
      });
      for (const r of rows) out.set(r.id, r.author_id);
    }
    return out;
  }

  /** Every other visible post, newest first, after [after]: not by a
   * followed/own author (their stream already ran out), not on this page
   * and not by anyone blocked either way. Of the recommendation snapshot
   * only what the viewer saw before [seenBefore] (an earlier visit, ms):
   * the rest is the recommendations' to serve. 18.11: a recommendation,
   * once seen, used to be left out of the whole feed for 3 days (owner:
   * posts vanished on pull to refresh). [seenBefore] 0 = none of it. */
  private async latestTail(
    viewer: RequestUser,
    excludeAuthors: string[],
    version: string | null,
    after: { t: string; id: string } | null,
    excludeIds: string[],
    take: number,
    only: Prisma.PostWhereInput = {},
    seenBefore = 0,
  ): Promise<Post[]> {
    if (take <= 0) return [];
    const authors = new Set(excludeAuthors);
    for (const id of await this.blockedAuthors(viewer)) authors.add(id);
    const ids = new Set(excludeIds);
    if (version) {
      const snapshot = await this.redis.zrevrange(recoKey(version), 0, -1);
      // When each was seen (null = not yet); a dead cache node = none seen.
      const seenAt =
        seenBefore > 0 && snapshot.length > 0
          ? await this.cache
              .zmscore(seenKey(viewer.sub), ...snapshot)
              .catch(() => snapshot.map(() => null))
          : null;
      snapshot.forEach((id, i) => {
        const at = seenAt?.[i];
        if (at == null || Number(at) >= seenBefore) ids.add(id);
      });
    }
    return this.prisma.post.findMany({
      where: {
        AND: [
          VISIBLE_POST_WHERE,
          only,
          ...(authors.size > 0 ? [{ author_id: { notIn: [...authors] } }] : []),
          ...(ids.size > 0 ? [{ id: { notIn: [...ids] } }] : []),
          ...(after ? [postsBefore(after)] : []),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  /** An admin number clamped to [min, max] (the default without settings). */
  private async num(
    key:
      | 'feed.reco_scan_max'
      | 'feed.reposts_per_page'
      | 'reco.ranker.feed_window',
    min: number,
    max: number,
  ): Promise<number> {
    let v: number = APP_SETTINGS[key];
    try {
      if (this.settings) v = await this.settings.number(key);
    } catch {
      // settings unreadable: the built-in default
    }
    return Math.min(max, Math.max(min, Math.floor(v)));
  }

  private async blockedAuthors(viewer: RequestUser): Promise<string[]> {
    // Owner 2026-10-18 (speed): one cached block set per viewer (see
    // block-set.cache.ts), not a query up to three times per page.
    return cachedBlockSet(this.prisma, this.cache, viewer.sub);
  }

  private async markSeen(uid: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const now = Date.now();
    try {
      const tx = this.cache.multi();
      ids.forEach((id) => tx.zadd(seenKey(uid), now, id));
      tx.zremrangebyrank(seenKey(uid), 0, -(SEEN_MAX + 1));
      tx.expire(seenKey(uid), SEEN_TTL_SEC);
      await tx.exec();
    } catch {
      // Cache node down: the recommendations may repeat, nothing breaks.
    }
  }

  private async fromIds(
    viewer: RequestUser,
    cached: {
      ids: string[];
      next: string | null;
      rep?: Record<string, PostReposterDto>;
    },
    only: Prisma.PostWhereInput,
  ): Promise<PostPage> {
    // Algo audit 2026-10-27 (CONTENT M-3): the cached page is re-checked
    // against the (cached) block set too — a block made within the 60 s
    // never shows the blocked person's posts, even if the version bump that
    // drops this entry was lost.
    const blocked = await this.blockedAuthors(viewer);
    const rows = await this.prisma.post.findMany({
      where: {
        ...VISIBLE_POST_WHERE,
        ...only,
        id: { in: cached.ids },
        ...(blocked.length > 0 ? { author_id: { notIn: blocked } } : {}),
      },
    });
    const byId = new Map(rows.map((p) => [p.id, p]));
    const ordered = cached.ids.flatMap((id) =>
      byId.has(id) ? [byId.get(id)!] : [],
    );
    return {
      items: await this.presenter.present(
        ordered,
        viewer.sub,
        new Map(Object.entries(cached.rep ?? {})),
      ),
      nextCursor: cached.next,
    };
  }
}

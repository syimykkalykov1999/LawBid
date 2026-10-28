import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { legacyTopicTags, postPracticeWhere } from '../posts/hidden-tags';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { loadUrgencyThresholds } from '../cases/domain/case-urgency';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from '../../redis/redis.constants';
import { jitterTtl, singleFlight } from '../../common/cache/single-flight';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { CaseFeedPage } from '../cases/dto/cases-feed.dto';
import { CaseAccessPolicy } from '../cases/policies/case-access.policy';
import { CasesFeedService } from '../cases/services/cases-feed.service';
import type { AttorneyListPage } from '../follows/follows.dto';
import { FollowsService } from '../follows/follows.service';
import {
  ContentFilterService,
  contentModeWhere,
  type PostContentClass,
} from '../posts/content-filter.service';
import type { PostDto, PostPage } from '../posts/dto/posts.dto';
import {
  PostPresenter,
  VISIBLE_POST_WHERE,
} from '../posts/post-presenter.service';
import { BlocksService } from '../blocks/blocks.service';
import { ClientProfilesService } from '../profiles/services/client-profiles.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { reorderWithinTiers } from '../recommendations/ranking.math';
import type {
  PeoplePage,
  PersonItemDto,
  SearchAttorneysQueryDto,
  SearchCasesQueryDto,
  SearchPeopleQueryDto,
  SearchPeriod,
  TagDto,
  TagSort,
  SearchPostsQueryDto,
} from './search.dto';
import {
  SEARCH_PROVIDER,
  TRENDING_TAGS_KEY,
  type SearchProvider,
} from './search.provider';
import { SearchLogService } from './search-log.service';
import { SYNONYMS_VERSION_KEY } from './search-synonyms.service';
import { tagCategories } from './tag-category';

const PAGE = 20;
/** Ranked results kept per query: 10 pages. */
const RANKED_MAX = 200;
/** Ranked id lists are shared by everyone asking the same thing. Batch C
 * item 14: the default is one minute (setting `search.ranked_cache_ttl_sec`):
 * a hot query is computed once a minute per key (single-flight), a new post
 * shows within a minute. */
const RANKED_TTL_SEC = 60;
const TAG_TOP_MAX = 500;
// Owner 2026-10-15: a new post shows in "Top" within a minute ("New" is live).
const TAG_TOP_TTL_SEC = 45;
/** Tag "Топ" ranks the newest tagged posts only (bounded cost). */
const TAG_TOP_CANDIDATES = 5000;

const PERIOD_MS: Record<SearchPeriod, number | null> = {
  '24h': 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000,
  '30d': 30 * 24 * 3600 * 1000,
  all: null,
};

/** Lowercase, single spaces, no leading '@'/'#'. */
export function normalizeQuery(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[@#]+/, '')
    .trim();
}

function invalid(field: string, message: string): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    details: { field },
  });
}

function textQuery(raw: string): string {
  const q = normalizeQuery(raw);
  if (q.length < 2) {
    throw new BadRequestException({
      code: ErrorCode.SEARCH_QUERY_TOO_SHORT,
      message: 'At least 2 characters.',
      details: { field: 'q', min: 2 },
    });
  }
  return q;
}

function encodeIndex(i: number): string {
  return Buffer.from(JSON.stringify({ i })).toString('base64url');
}

function decodeIndex(raw: string | undefined): number {
  if (!raw) return 0;
  try {
    const { i } = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as { i?: unknown };
    if (typeof i === 'number' && Number.isInteger(i) && i >= 0) return i;
  } catch {
    // fall through
  }
  throw invalid('cursor', 'Invalid cursor.');
}

/**
 * docs/05 §7 (stage 5.6). Ranked results (attorneys, posts, tag "Топ") are
 * computed once per query into a short-lived shared id list and paged by
 * position, so the next pages cost one Redis read. Cache keys hash the
 * query and never contain the user id (§7.6). Cases are searched per
 * attorney and always filtered by CaseAccessPolicy.
 */
@Injectable()
export class SearchService {
  constructor(
    @Inject(SEARCH_PROVIDER) private readonly provider: SearchProvider,
    private readonly prisma: PrismaService,
    private readonly limits: UsageLimitsService,
    private readonly follows: FollowsService,
    private readonly posts: PostPresenter,
    private readonly casesFeed: CasesFeedService,
    private readonly access: CaseAccessPolicy,
    private readonly clients: ClientProfilesService,
    private readonly blocks: BlocksService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly contentFilter?: ContentFilterService,
    // Owner 2026-10-13: personal ranking (tie-break in People, "for you").
    @Optional() private readonly recommendations?: RecommendationsService,
    // Owner 2026-10-15: what people search for (admin's "no results").
    @Optional() private readonly queryLog?: SearchLogService,
    // Batch C item 9: result lists are pure caches → the cache Redis
    // (allkeys-lru); the synonym version number stays on the main one.
    @Optional()
    @Inject(REDIS_CACHE_CLIENT)
    private readonly cacheRedis?: Redis,
  ) {}

  private get cache(): Redis {
    return this.cacheRedis ?? this.redis;
  }

  /** Owner 2026-10-05: a "Legal only" viewer never sees general posts. */
  private async viewerOnly(
    viewerId: string,
  ): Promise<PostContentClass | undefined> {
    const mode = await this.contentFilter?.modeOf(viewerId);
    return mode === 'legal_only' ? 'legal' : undefined;
  }

  /** The per-person search budget. A guest has none of their own: the
   * per-IP guest budget of JwtAuthGuard stands in for it. */
  private async consumeSearch(
    user: RequestUser,
    action: 'search' | 'search_suggest' = 'search',
  ): Promise<void> {
    if (user.guest) return;
    await this.limits.consume(action, user.sub);
  }

  /**
   * GET /search/people (OQ-026): attorneys and clients by @username and
   * name in one ranked list. The shared ranked cache stores "role:id"
   * tokens; each page is presented per role and re-merged in rank order.
   */
  async people(
    user: RequestUser,
    dto: SearchPeopleQueryDto,
  ): Promise<PeoplePage> {
    await this.consumeSearch(user);
    const q = textQuery(dto.q);
    const filters = {
      practiceAreaId: dto.practiceAreaId,
      state: dto.state?.toUpperCase(),
      minRating: dto.minRating,
      language: dto.language?.toLowerCase(),
      role: dto.role,
      verifiedOnly: dto.verifiedOnly,
    };
    const shared = await this.ranked('pp', { q, ...filters }, async () =>
      (await this.provider.searchPeople(q, filters, RANKED_MAX)).map(
        (r) => `${r.role}:${r.id}:${r.tier}`,
      ),
    );
    // Owner 2026-10-13: text relevance stays first; inside one tier of
    // matches the viewer's affinity orders close neighbours. Kept per
    // viewer for the same few minutes as the shared list.
    const tokens = await this.ranked(
      'pp-me',
      { q, ...filters, viewer: user.sub },
      () => this.personalPeople(user.sub, shared),
    );
    const { slice: rawSlice, next } = this.pageOf(tokens, dto.cursor);
    // OQ-028: the shared ranked list is viewer-agnostic; blocks (either
    // direction) are applied per viewer when presenting.
    const hidden = await this.blocks.hiddenIds(user.sub);
    const slice = rawSlice.filter((t) => !hidden.has(t.split(':')[1]));
    const attorneyIds = slice
      .filter((t) => t.startsWith('attorney:'))
      .map((t) => t.split(':')[1]);
    const clientIds = slice
      .filter((t) => t.startsWith('client:'))
      .map((t) => t.split(':')[1]);
    const [attorneys, clients] = await Promise.all([
      this.follows.present(attorneyIds, user.sub),
      this.clients.presentMany(clientIds, user.sub),
    ]);
    const byAttorney = new Map(attorneys.map((a) => [a.id, a]));
    const byClient = new Map(clients.map((c) => [c.id, c]));
    const items: PersonItemDto[] = [];
    for (const token of slice) {
      const [role, id] = token.split(':') as ['attorney' | 'client', string];
      if (role === 'attorney') {
        const a = byAttorney.get(id);
        if (a) items.push({ role, attorney: a, client: null });
      } else {
        const c = byClient.get(id);
        if (c) items.push({ role, attorney: null, client: c });
      }
    }
    if (!dto.cursor)
      this.queryLog?.logQuery(user.sub, 'people', q, items.length);
    return { items, nextCursor: next };
  }

  /** Shared "role:id:tier" tokens reordered by the viewer's affinity. */
  private async personalPeople(
    viewerId: string,
    shared: string[],
  ): Promise<string[]> {
    if (!this.recommendations || shared.length < 2) return shared;
    try {
      const attorneyIds = shared
        .filter((t) => t.startsWith('attorney:'))
        .map((t) => t.split(':')[1]);
      const affinity = await this.recommendations.peopleAffinity(
        viewerId,
        attorneyIds,
      );
      return reorderWithinTiers(
        shared,
        (t) => Number(t.split(':')[2]),
        (t) => affinity.get(t.split(':')[1]) ?? 0,
      );
    } catch {
      // Ranking is a bonus: text order is always a valid answer.
      return shared;
    }
  }

  async attorneys(
    user: RequestUser,
    dto: SearchAttorneysQueryDto,
  ): Promise<AttorneyListPage> {
    await this.consumeSearch(user);
    const q = textQuery(dto.q);
    const filters = {
      practiceAreaId: dto.practiceAreaId,
      state: dto.state?.toUpperCase(),
      minRating: dto.minRating,
      language: dto.language?.toLowerCase(),
    };
    const ids = await this.ranked('a', { q, ...filters }, () =>
      this.provider.searchAttorneys(q, filters, RANKED_MAX),
    );
    const { slice, next } = this.pageOf(ids, dto.cursor);
    if (!dto.cursor && !user.guest)
      this.queryLog?.logQuery(user.sub, 'people', q, slice.length);
    return {
      items: await this.follows.present(slice, user.sub),
      nextCursor: next,
    };
  }

  async cases(
    user: RequestUser,
    dto: SearchCasesQueryDto,
  ): Promise<CaseFeedPage> {
    if (user.role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only attorneys search cases.',
      });
    }
    await this.consumeSearch(user);
    const q = textQuery(dto.q);
    if (!(await this.casesFeed.isVerifiedAttorney(user.sub))) {
      return { items: [], nextCursor: null };
    }
    const span = PERIOD_MS[dto.period ?? 'all'];
    const params = {
      attorneyId: user.sub,
      practiceAreaId: dto.practiceAreaId,
      state: dto.state?.toUpperCase(),
      since: span ? new Date(Date.now() - span) : undefined,
      practiceCategory: dto.practiceCategory,
      budgetMinCents:
        dto.budgetMin === undefined ? undefined : dto.budgetMin * 100,
      budgetMaxCents:
        dto.budgetMax === undefined ? undefined : dto.budgetMax * 100,
      budgetUnknown: dto.budgetUnknown,
      budgetPercent: dto.budgetPercent,
      percentMax: dto.percentMax,
      noBids: dto.noBids,
      minUrgency: dto.minUrgency,
      hasDeadline: dto.hasDeadline,
      urgencyThresholds: dto.minUrgency
        ? await loadUrgencyThresholds(this.settings)
        : undefined,
    };
    // Owner 2026-10-15: by relevance (a word in the title outranks one in
    // the text), the ranked ids of this attorney's query kept for a few
    // minutes and paged by position; filters are part of the key.
    const ids = await this.ranked(
      'cs',
      {
        q,
        ...params,
        since: dto.period ?? 'all',
        urgencyThresholds: undefined,
        thresholds: params.urgencyThresholds,
      },
      () => this.provider.searchCasesRanked(q, params, RANKED_MAX),
    );
    const { slice, next } = this.pageOf(ids, dto.cursor);
    // §7.6: the provider's rows still pass the single access check.
    const visible = await this.access.visibleCaseIds(
      user.sub,
      slice,
      undefined,
      { hidePaused: true },
    );
    if (!dto.cursor) {
      this.queryLog?.logQuery(user.sub, 'cases', q, visible.size);
    }
    return {
      items: await this.casesFeed.hydrate(
        slice.filter((id) => visible.has(id)),
        user.sub,
      ),
      nextCursor: next,
    };
  }

  /** GET /search/practices: the topic picker's any-language search. */
  async practices(
    user: RequestUser,
    rawQ: string,
  ): Promise<{ code: string; nameEn: string; hit: string | null }[]> {
    await this.consumeSearch(user, 'search_suggest');
    const q = normalizeQuery(rawQ);
    if (q.length < 2) return [];
    return this.provider.practiceMatches(q, 25);
  }

  /** GET /search/suggest: type-ahead for the search field. */
  async suggest(
    user: RequestUser,
    rawQ: string,
  ): Promise<{ kind: 'tag' | 'person' | 'practice'; text: string }[]> {
    await this.consumeSearch(user, 'search_suggest');
    const q = normalizeQuery(rawQ);
    if (q.length < 1) return [];
    const hash = createHash('sha256').update(q).digest('base64url');
    const hit = await this.cache.get(`search:suggest:${hash}`);
    if (hit)
      return JSON.parse(hit) as {
        kind: 'tag' | 'person' | 'practice';
        text: string;
      }[];
    return singleFlight(`search:suggest:${hash}`, async () => {
      const items = await this.provider.suggest(q, 4);
      await this.cache.set(
        `search:suggest:${hash}`,
        JSON.stringify(items),
        'EX',
        jitterTtl(60),
      );
      return items;
    });
  }

  async postsByText(
    user: RequestUser,
    rawQ: string,
    cursor?: string,
    dto?: SearchPostsQueryDto,
  ): Promise<PostPage> {
    await this.consumeSearch(user);
    const q = textQuery(rawQ);
    const span = PERIOD_MS[dto?.period ?? 'all'];
    const filters = {
      tag: dto?.tag?.toLowerCase(),
      practice: dto?.practice?.trim().toLowerCase(),
      state: dto?.state?.toUpperCase(),
      since: span ? new Date(Date.now() - span) : undefined,
      withPhotos: dto?.withPhotos,
      briefsOnly: dto?.briefsOnly,
      sort: dto?.sort,
      contentClass: await this.viewerOnly(user.sub),
    };
    const ids = await this.ranked(
      'p',
      { q, ...filters, since: dto?.period ?? 'all' },
      () => this.provider.searchPosts(q, RANKED_MAX, filters),
    );
    const { slice, next } = this.pageOf(ids, cursor);
    if (!cursor && !user.guest)
      this.queryLog?.logQuery(user.sub, 'posts', q, slice.length);
    return {
      items: await this.presentPosts(slice, user.sub),
      nextCursor: next,
    };
  }

  async tags(user: RequestUser, rawQ: string): Promise<TagDto[]> {
    await this.consumeSearch(user, 'search_suggest');
    const prefix = normalizeQuery(rawQ);
    if (prefix.length < 1) throw invalid('q', 'Empty tag.');
    // Type-ahead, same for everyone: a short shared cache (like suggest).
    const key = `search:tags:${createHash('sha256').update(prefix).digest('base64url')}`;
    const hit = await this.cache.get(key);
    if (hit) return JSON.parse(hit) as TagDto[];
    return singleFlight(key, async () => {
      const out = await this.tagsUncached(prefix);
      await this.cache.set(key, JSON.stringify(out), 'EX', jitterTtl(60));
      return out;
    });
  }

  private async tagsUncached(prefix: string): Promise<TagDto[]> {
    const tags = await this.provider.searchTags(prefix, PAGE);
    if (tags.length === 0) return [];
    // Audit 2026-10-01: how many published posts carry each tag; the most
    // used first (alphabetical sorting stays an option in the app).
    const counts = await this.prisma.$queryRaw<{ tag: string; n: bigint }[]>`
      SELECT t.tag_lower AS tag, count(p.id) AS n
      FROM tags t
      LEFT JOIN post_tags pt ON pt.tag_id = t.id
      LEFT JOIN posts p ON p.id = pt.post_id
        AND p.status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
        -- Only posts anyone can see (active, not deleted authors).
        AND EXISTS (SELECT 1 FROM users u WHERE u.id = p.author_id
                    AND u.status = 'active' AND u.deleted_at IS NULL)
      WHERE t.tag_lower = ANY(${tags}::TEXT[])
      GROUP BY t.tag_lower`;
    const byTag = new Map(counts.map((c) => [c.tag, Number(c.n)]));
    const categories = await tagCategories(this.prisma, tags);
    return tags
      .map((tag) => ({
        tag,
        postsCount: byTag.get(tag) ?? 0,
        categoryCode: categories.get(tag) ?? null,
      }))
      .sort(
        (a, b) => b.postsCount - a.postsCount || a.tag.localeCompare(b.tag),
      );
  }

  /** §7.2 "Популярные темы": written by TrendingTagsJob. */
  async trending(): Promise<TagDto[]> {
    const raw = await this.redis.get(TRENDING_TAGS_KEY);
    return raw ? (JSON.parse(raw) as TagDto[]) : [];
  }

  /** GET /tags/:tag/posts — "Топ" by the §2.2.2 score, "Новые" by date. */
  /** Owner 2026-09-30 (OQ-034): newest posts of attorneys licensed in a
   * state — the feed's "All" topic with a state chosen. */
  async latestPosts(
    user: RequestUser,
    state: string | undefined,
    cursor?: string,
    filter: {
      states?: string[];
      practices?: string[];
      practice?: string;
      tag?: string;
      kind?: 'post' | 'news';
      period?: SearchPeriod;
      withPhotos?: boolean;
      briefsOnly?: boolean;
      sort?: 'newest' | 'popular' | 'for_you';
      contentClass?: PostContentClass;
    } = {},
  ): Promise<PostPage> {
    const contentClass =
      filter.contentClass ?? (await this.viewerOnly(user.sub));
    const popular = filter.sort === 'popular';
    // Owner 2026-10-13: for_you = ranked for this viewer (same candidates
    // and filters, paged by position like popular).
    const forYou =
      filter.sort === 'for_you' && !!this.recommendations && !user.guest;
    // Popular and for_you page by offset; newest keeps the keyset cursor.
    // Owner 2026-10-14: popular pages by a keyset cursor too (a numeric one
    // from an older app still means an offset).
    const popKey =
      popular && !forYou && cursor && !/^\d+$/.test(cursor)
        ? decodePopularCursor(cursor)
        : undefined;
    const offset = (popular && !popKey) || forYou ? Number(cursor) || 0 : 0;
    const c = !popular && !forYou && cursor ? decodeCursor(cursor) : undefined;
    const span = PERIOD_MS[filter.period ?? 'all'];
    const practice = filter.practice?.trim().toLowerCase();
    const tag = filter.tag ? normalizeQuery(filter.tag) : '';
    const base: Prisma.PostWhereInput[] = [
      // Audit 2026-10-01: every condition AND-composed — the state filter
      // used to overwrite VISIBLE_POST_WHERE's `author` (active, not
      // suspended) and the practice clause shared the `AND` key.
      VISIBLE_POST_WHERE,
      authorStateWhere([...(state ? [state] : []), ...(filter.states ?? [])]),
      // Owner 2026-10-06: «Только мои темы» — any of the picked
      // qualifications, each with its subcategories.
      ...(filter.practices?.length
        ? [
            postPracticeWhere(
              filter.practices,
              filter.practices.flatMap((p) => legacyTopicTags(p)),
            ),
          ]
        : []),
      // Audit 2026-10-01: nothing of people blocked either way.
      {
        author_id: { notIn: [...(await this.blocks.hiddenIds(user.sub))] },
      },
      ...(filter.kind ? [{ kind: filter.kind }] : []),
      ...(contentClass ? [{ content_class: contentClass }] : []),
      ...(span ? [{ created_at: { gte: new Date(Date.now() - span) } }] : []),
      ...(filter.withPhotos ? [{ media: { some: {} } }] : []),
      // Owner 2026-10-13: Briefs = text-only posts.
      ...(filter.briefsOnly ? [contentModeWhere('briefs_only')] : []),
      // One tag algorithm (hidden-tags.ts): the qualification and every
      // subcategory under it are one hidden tag; older posts (no
      // qualification) by their topic hashtag.
      ...(practice
        ? [
            postPracticeWhere(
              [practice],
              [...(tag ? [tag] : []), ...legacyTopicTags(practice)],
            ),
          ]
        : []),
    ];
    if (forYou && this.recommendations) {
      // Algo audit 2026-10-27 (CONTENT M-6): pages through a pinned copy.
      const ids = await this.recommendations.postsForPage(
        user.sub,
        { AND: base },
        { state, filter: { ...filter, contentClass } },
        offset,
      );
      const slice = ids.slice(offset, offset + PAGE);
      return {
        items: await this.presentPosts(slice, user.sub, contentClass),
        nextCursor: offset + PAGE < ids.length ? String(offset + PAGE) : null,
      };
    }
    const rows = await this.prisma.post.findMany({
      where: {
        AND: [
          // Every filter (visibility, blocks, state, qualification, tag, kind,
          // period...) — the refactor of e4b29dba dropped `base` here, so the
          // newest / popular lists ignored all of them.
          ...base,
          ...(popKey
            ? [
                {
                  OR: [
                    { like_count: { lt: popKey.likes } },
                    {
                      like_count: popKey.likes,
                      comment_count: { lt: popKey.comments },
                    },
                    {
                      like_count: popKey.likes,
                      comment_count: popKey.comments,
                      created_at: { lt: popKey.createdAt },
                    },
                    {
                      like_count: popKey.likes,
                      comment_count: popKey.comments,
                      created_at: popKey.createdAt,
                      id: { lt: popKey.id },
                    },
                  ],
                },
              ]
            : []),
          ...(c
            ? [
                {
                  OR: [
                    { created_at: { lt: c.createdAt } },
                    { created_at: c.createdAt, id: { lt: c.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: popular
        ? [
            { like_count: 'desc' },
            { comment_count: 'desc' },
            { created_at: 'desc' },
            { id: 'desc' },
          ]
        : [{ created_at: 'desc' }, { id: 'desc' }],
      ...(popular && !popKey && offset > 0 ? { skip: offset } : {}),
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    if (popular) {
      return {
        items: await this.posts.present(page, user.sub),
        nextCursor:
          rows.length > PAGE && last
            ? encodePopularCursor({
                likes: last.like_count,
                comments: last.comment_count,
                createdAt: last.created_at,
                id: last.id,
              })
            : null,
      };
    }
    return {
      items: await this.posts.present(page, user.sub),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async tagPosts(
    user: RequestUser,
    rawTag: string,
    sort: TagSort,
    cursor?: string,
    state?: string,
    videoOnly?: boolean,
  ): Promise<PostPage> {
    const tagLower = normalizeQuery(rawTag);
    const tag = tagLower
      ? await this.prisma.tag.findUnique({
          where: { tag_lower: tagLower },
          select: { id: true },
        })
      : null;
    if (!tag) return { items: [], nextCursor: null };
    const contentClass = await this.viewerOnly(user.sub);
    // Owner 2026-09-30 (OQ-034): a state filter always lists newest first.
    if (sort === 'new' || state || videoOnly) {
      const c = cursor ? decodeCursor(cursor) : undefined;
      const rows = await this.prisma.post.findMany({
        where: {
          // Audit 2026-10-01: AND so the state filter keeps the author checks.
          AND: [
            VISIBLE_POST_WHERE,
            authorStateWhere(state ? [state] : []),
            {
              author_id: {
                notIn: [...(await this.blocks.hiddenIds(user.sub))],
              },
            },
          ],
          tags: { some: { tag_id: tag.id } },
          ...(contentClass ? { content_class: contentClass } : {}),
          ...(videoOnly ? { video_asset_id: { not: null } } : {}),
          ...(c
            ? {
                OR: [
                  { created_at: { lt: c.createdAt } },
                  { created_at: c.createdAt, id: { lt: c.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: PAGE + 1,
      });
      const page = rows.slice(0, PAGE);
      const last = page[page.length - 1];
      return {
        items: await this.posts.present(page, user.sub),
        nextCursor:
          rows.length > PAGE && last
            ? encodeCursor({ createdAt: last.created_at, id: last.id })
            : null,
      };
    }
    const ids = await this.cached(`tag:top:${tag.id}`, TAG_TOP_TTL_SEC, () =>
      this.topOfTag(tag.id),
    );
    const { slice, next } = this.pageOf(ids, cursor);
    return {
      items: await this.presentPosts(slice, user.sub, contentClass),
      nextCursor: next,
    };
  }

  private async topOfTag(tagId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH recent AS (
        SELECT p.id FROM post_tags pt
        JOIN posts p ON p.id = pt.post_id
        WHERE pt.tag_id = ${tagId}::UUID
          AND p.status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
        ORDER BY p.created_at DESC
        LIMIT ${TAG_TOP_CANDIDATES}
      )
      SELECT p.id::TEXT AS id FROM recent
      JOIN posts p ON p.id = recent.id
      JOIN users u ON u.id = p.author_id AND u.status = 'active'
        -- OQ-038: clients post too; suspended attorneys never show.
        AND NOT EXISTS (SELECT 1 FROM attorney_profiles sa
          WHERE sa.user_id = p.author_id AND sa.verification_status = 'suspended')
      ORDER BY
        (p.like_count + 2 * p.comment_count + 2 * p.save_count)::FLOAT8
          / power(GREATEST(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600, 0) + 2, 1.5)
          DESC,
        p.created_at DESC, p.id DESC
      LIMIT ${TAG_TOP_MAX}`;
    return rows.map((r) => r.id);
  }

  private async ranked(
    kind: string,
    params: Record<string, unknown>,
    load: () => Promise<string[]>,
  ): Promise<string[]> {
    // The dictionary's version: an admin's edit starts a fresh result list.
    const syn = (await this.redis.get(SYNONYMS_VERSION_KEY)) ?? '0';
    const hash = createHash('sha256')
      .update(JSON.stringify({ ...params, syn }))
      .digest('base64url');
    const ttl = this.settings
      ? await this.settings
          .number('search.ranked_cache_ttl_sec')
          .catch(() => RANKED_TTL_SEC)
      : RANKED_TTL_SEC;
    return this.cached(`search:${kind}:${hash}`, ttl, load);
  }

  private async cached(
    key: string,
    ttlSec: number,
    load: () => Promise<string[]>,
  ): Promise<string[]> {
    const hit = await this.cache.get(key);
    if (hit) return JSON.parse(hit) as string[];
    // Load audit 6: one refill per pod, expiry spread (cache stampede).
    return singleFlight(key, async () => {
      const ids = await load();
      await this.cache.set(key, JSON.stringify(ids), 'EX', jitterTtl(ttlSec));
      return ids;
    });
  }

  private pageOf(
    ids: string[],
    cursor: string | undefined,
  ): { slice: string[]; next: string | null } {
    const start = decodeIndex(cursor);
    const end = start + PAGE;
    return {
      slice: ids.slice(start, end),
      next: end < ids.length ? encodeIndex(end) : null,
    };
  }

  /** Rows in [ids] order; hidden/deleted since caching drop out. */
  private async presentPosts(
    ids: string[],
    viewerId: string,
    contentClass?: PostContentClass,
  ): Promise<PostDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.post.findMany({
      where: {
        ...VISIBLE_POST_WHERE,
        ...(contentClass ? { content_class: contentClass } : {}),
        id: { in: ids },
      },
    });
    const hidden = await this.blocks.hiddenIds(viewerId);
    const byId = new Map(
      rows.filter((p) => !hidden.has(p.author_id)).map((p) => [p.id, p]),
    );
    return this.posts.present(
      ids.flatMap((id) => {
        const p = byId.get(id);
        return p ? [p] : [];
      }),
      viewerId,
    );
  }
}

/** Posts whose author holds a verified license in [state] (none = any). */
/** Posts of attorneys with a verified licence in any of [states]
 * (owner 2026-10-06: several states at once); none = no state filter. */
function authorStateWhere(states: string[]): Prisma.PostWhereInput {
  const codes = [...new Set(states.map((s) => s.toUpperCase()))];
  if (codes.length === 0) return {};
  return {
    author: {
      attorney_profile: {
        licenses: {
          some: { state_code: { in: codes }, license_status: 'verified' },
        },
      },
    },
  };
}

interface PopularKey {
  likes: number;
  comments: number;
  createdAt: Date;
  id: string;
}

export function encodePopularCursor(k: PopularKey): string {
  return Buffer.from(
    JSON.stringify([k.likes, k.comments, k.createdAt.toISOString(), k.id]),
  ).toString('base64url');
}

export function decodePopularCursor(raw: string): PopularKey | undefined {
  try {
    const [likes, comments, at, id] = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as [number, number, string, string];
    const createdAt = new Date(at);
    if (
      !Number.isInteger(likes) ||
      !Number.isInteger(comments) ||
      Number.isNaN(createdAt.getTime()) ||
      typeof id !== 'string'
    ) {
      return undefined;
    }
    return { likes, comments, createdAt, id };
  } catch {
    return undefined;
  }
}

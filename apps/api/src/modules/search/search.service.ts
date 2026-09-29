import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
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
import type { CaseFeedPage } from '../cases/dto/cases-feed.dto';
import { CaseAccessPolicy } from '../cases/policies/case-access.policy';
import { CasesFeedService } from '../cases/services/cases-feed.service';
import type { AttorneyListPage } from '../follows/follows.dto';
import { FollowsService } from '../follows/follows.service';
import type { PostDto, PostPage } from '../posts/dto/posts.dto';
import {
  PostPresenter,
  VISIBLE_POST_WHERE,
} from '../posts/post-presenter.service';
import type {
  SearchAttorneysQueryDto,
  SearchCasesQueryDto,
  SearchPeriod,
  TagDto,
  TagSort,
} from './search.dto';
import {
  SEARCH_PROVIDER,
  TRENDING_TAGS_KEY,
  type SearchProvider,
} from './search.provider';

const PAGE = 20;
/** Ranked results kept per query: 10 pages. */
const RANKED_MAX = 200;
/** Ranked id lists are shared by everyone asking the same thing. */
const RANKED_TTL_SEC = 5 * 60;
const TAG_TOP_MAX = 500;
const TAG_TOP_TTL_SEC = 10 * 60;
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
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async attorneys(
    user: RequestUser,
    dto: SearchAttorneysQueryDto,
  ): Promise<AttorneyListPage> {
    await this.limits.consume('search', user.sub);
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
    await this.limits.consume('search', user.sub);
    const q = textQuery(dto.q);
    if (!(await this.casesFeed.isVerifiedAttorney(user.sub))) {
      return { items: [], nextCursor: null };
    }
    const span = PERIOD_MS[dto.period ?? 'all'];
    const rows = await this.provider.searchCases(q, {
      attorneyId: user.sub,
      practiceAreaId: dto.practiceAreaId,
      state: dto.state?.toUpperCase(),
      since: span ? new Date(Date.now() - span) : undefined,
      cursor: dto.cursor ? decodeCursor(dto.cursor) : undefined,
      limit: PAGE,
    });
    const page = rows.slice(0, PAGE);
    // §7.6: the provider's rows still pass the single access check.
    const visible = await this.access.visibleCaseIds(
      user.sub,
      page.map((r) => r.id),
    );
    const last = page[page.length - 1];
    return {
      items: await this.casesFeed.hydrate(
        page.map((r) => r.id).filter((id) => visible.has(id)),
        user.sub,
      ),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async postsByText(
    user: RequestUser,
    rawQ: string,
    cursor?: string,
  ): Promise<PostPage> {
    await this.limits.consume('search', user.sub);
    const q = textQuery(rawQ);
    const ids = await this.ranked('p', { q }, () =>
      this.provider.searchPosts(q, RANKED_MAX),
    );
    const { slice, next } = this.pageOf(ids, cursor);
    return {
      items: await this.presentPosts(slice, user.sub),
      nextCursor: next,
    };
  }

  async tags(user: RequestUser, rawQ: string): Promise<TagDto[]> {
    await this.limits.consume('search', user.sub);
    const prefix = normalizeQuery(rawQ);
    if (prefix.length < 1) throw invalid('q', 'Empty tag.');
    const tags = await this.provider.searchTags(prefix, PAGE);
    return tags.map((tag) => ({ tag, postsCount: null }));
  }

  /** §7.2 "Популярные темы": written by TrendingTagsJob. */
  async trending(): Promise<TagDto[]> {
    const raw = await this.redis.get(TRENDING_TAGS_KEY);
    return raw ? (JSON.parse(raw) as TagDto[]) : [];
  }

  /** GET /tags/:tag/posts — "Топ" by the §2.2.2 score, "Новые" by date. */
  async tagPosts(
    user: RequestUser,
    rawTag: string,
    sort: TagSort,
    cursor?: string,
  ): Promise<PostPage> {
    const tagLower = normalizeQuery(rawTag);
    const tag = tagLower
      ? await this.prisma.tag.findUnique({
          where: { tag_lower: tagLower },
          select: { id: true },
        })
      : null;
    if (!tag) return { items: [], nextCursor: null };
    if (sort === 'new') {
      const c = cursor ? decodeCursor(cursor) : undefined;
      const rows = await this.prisma.post.findMany({
        where: {
          ...VISIBLE_POST_WHERE,
          tags: { some: { tag_id: tag.id } },
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
      items: await this.presentPosts(slice, user.sub),
      nextCursor: next,
    };
  }

  private async topOfTag(tagId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH recent AS (
        SELECT p.id FROM post_tags pt
        JOIN posts p ON p.id = pt.post_id
        WHERE pt.tag_id = ${tagId}::UUID
          AND p.status = 'published' AND p.deleted_at IS NULL
        ORDER BY p.created_at DESC
        LIMIT ${TAG_TOP_CANDIDATES}
      )
      SELECT p.id::STRING AS id FROM recent
      JOIN posts p ON p.id = recent.id
      JOIN users u ON u.id = p.author_id AND u.status = 'active'
      JOIN attorney_profiles a ON a.user_id = p.author_id
        AND a.verification_status <> 'suspended'
      ORDER BY
        (p.like_count + 2 * p.comment_count + 2 * p.save_count)::FLOAT8
          / power(GREATEST(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600, 0) + 2, 1.5)
          DESC,
        p.created_at DESC, p.id DESC
      LIMIT ${TAG_TOP_MAX}`;
    return rows.map((r) => r.id);
  }

  private ranked(
    kind: string,
    params: Record<string, unknown>,
    load: () => Promise<string[]>,
  ): Promise<string[]> {
    const hash = createHash('sha256')
      .update(JSON.stringify(params))
      .digest('base64url');
    return this.cached(`search:${kind}:${hash}`, RANKED_TTL_SEC, load);
  }

  private async cached(
    key: string,
    ttlSec: number,
    load: () => Promise<string[]>,
  ): Promise<string[]> {
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as string[];
    const ids = await load();
    await this.redis.set(key, JSON.stringify(ids), 'EX', ttlSec);
    return ids;
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
  ): Promise<PostDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.post.findMany({
      where: { ...VISIBLE_POST_WHERE, id: { in: ids } },
    });
    const byId = new Map(rows.map((p) => [p.id, p]));
    return this.posts.present(
      ids.flatMap((id) => {
        const p = byId.get(id);
        return p ? [p] : [];
      }),
      viewerId,
    );
  }
}

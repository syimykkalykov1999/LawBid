import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { AppSettingKey } from '../../common/app-settings/app-settings.defaults';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  type CaseCandidate,
  type CaseViewer,
  CASE_WEIGHTS,
  caseScore,
} from './cases.scoring';
import {
  type PeopleViewer,
  PEOPLE_WEIGHTS,
  type PersonCandidate,
  personScore,
} from './people.scoring';
import {
  type PostAuthor,
  type PostCandidate,
  type PostKind,
  POST_WEIGHTS,
  type PostViewer,
  hotRaw,
  postScore,
} from './posts.scoring';
import {
  type CommunityCandidate,
  type CommunityViewer,
  communityScore,
  feedOrder,
} from './communities.scoring';
import { diversify, type Scored } from './ranking.math';

/** Ranked lists are rebuilt at most this often per viewer. */
export const PEOPLE_TTL_SEC = 10 * 60;
export const LISTING_TTL_SEC = 3 * 60;
/** The recommended groups / channels snapshot is rebuilt this often. */
export const COMMUNITY_TTL_SEC = 30 * 60;
export const COMMUNITY_POOL = 100;
/** Popular candidates read per snapshot, and the newest ones appended after. */
const COMMUNITY_SCAN = 500;
const COMMUNITY_NEWEST = 300;
/** How many people / posts / cases a ranked list keeps. */
export const PEOPLE_POOL = 300;
export const POST_CANDIDATES = 400;
export const POST_POOL = 300;
export const CASE_POOL = 300;
const PEOPLE_SCAN = 600;

/**
 * Interest signals, one row per (viewer, practice category): where the
 * weight comes from (own practices 3, own cases 2, saves 2, comments 2,
 * offers 2, likes 1, followed attorneys 1, views 0.5). Bounded per branch.
 */
const INTEREST_WEIGHTS = {
  ownPractice: 3,
  ownCase: 2,
  saved: 2,
  commented: 2,
  bid: 2,
  liked: 1,
  followed: 1,
  viewed: 0.5,
} as const;

/** Row weights → category id → 0..1 (strongest category = 1). */
export function normalizeInterests(
  rows: { category: string; weight: number }[],
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const r of rows) {
    sums.set(r.category, (sums.get(r.category) ?? 0) + Number(r.weight));
  }
  const max = Math.max(0, ...sums.values());
  const out = new Map<string, number>();
  if (max <= 0) return out;
  for (const [k, v] of sums) out.set(k, v / max);
  return out;
}

interface CommunityRow {
  id: string;
  members: number;
  last_at: Date | null;
  owner_id: string;
  joins7d: number;
  mutual: number;
}

interface PersonRow {
  id: string;
  rating_avg: number;
  rating_count: number;
  followers_count: number;
  trust_level: number;
  trust_badge: boolean;
  posts_30d: number;
  last_post_at: Date | null;
  states: string[];
  categories: string[];
  mutual: number;
  follows_viewer: boolean;
  engaged: number;
  contact: number;
}

const toPerson = (r: PersonRow): PersonCandidate => ({
  id: r.id,
  ratingAvg: Number(r.rating_avg),
  ratingCount: Number(r.rating_count),
  followersCount: Number(r.followers_count),
  trustLevel: Number(r.trust_level),
  trustBadge: !!r.trust_badge,
  posts30d: Number(r.posts_30d),
  lastPostAt: r.last_post_at ? new Date(r.last_post_at) : null,
  states: r.states ?? [],
  categories: r.categories ?? [],
  mutual: Number(r.mutual),
  followsViewer: !!r.follows_viewer,
  engaged: Number(r.engaged),
  contact: Number(r.contact),
});

/**
 * Owner 2026-10-13: the recommendation algorithms of Search — people,
 * posts, cases — "like Instagram, but ours". One service, one weighted
 * formula per kind (people.scoring.ts, posts.scoring.ts,
 * cases.scoring.ts), ranked lists cached per viewer. Used for empty-query
 * blocks (Recommended, the Posts grid, the attorney's Cases) and as a
 * secondary tie-break inside text search; text relevance stays first.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  /** The admin's weights for [kind] (the built-in ones when unset). */
  private async weights<T extends Record<string, number>>(
    kind: 'case' | 'people' | 'post',
    base: T,
  ): Promise<T> {
    const s = this.settings;
    if (!s) return base;
    const out: Record<string, number> = {};
    for (const k of Object.keys(base)) {
      out[k] = await s.number(`reco.${kind}.${k}` as AppSettingKey);
    }
    return out as T;
  }

  // --- viewer signals ----------------------------------------------------

  /** Role, UI language and the states the viewer is tied to. */
  async viewerBase(
    userId: string,
  ): Promise<{ language: string | null; states: string[] }> {
    const rows = await this.prisma.$queryRaw<
      {
        ui_language: string | null;
        lic: string[] | null;
        cstate: string | null;
      }[]
    >`
      SELECT u.ui_language,
        (SELECT array_agg(DISTINCT l.state_code::TEXT) FROM attorney_licenses l
          WHERE l.attorney_id = u.id AND l.license_status = 'verified') AS lic,
        (SELECT c.state_code::TEXT FROM client_profiles c
          WHERE c.user_id = u.id) AS cstate
      FROM users u WHERE u.id = ${userId}::UUID`;
    const r = rows[0];
    return {
      language: r?.ui_language ?? null,
      states: [...(r?.lic ?? []), ...(r?.cstate ? [r.cstate] : [])],
    };
  }

  /** Practice category → interest 0..1 from everything the viewer did. */
  async interests(userId: string): Promise<Map<string, number>> {
    const w = INTEREST_WEIGHTS;
    const rows = await this.prisma.$queryRaw<
      { category: string; weight: number }[]
    >`
      SELECT category, sum(weight)::FLOAT8 AS weight FROM (
        SELECT COALESCE(pa.parent_id, pa.id)::TEXT AS category, ${w.ownPractice}::FLOAT8 AS weight
          FROM attorney_practice_areas ap
          JOIN practice_areas pa ON pa.id = ap.practice_area_id
          WHERE ap.attorney_id = ${userId}::UUID
        UNION ALL
        (SELECT COALESCE(pa.parent_id, pa.id)::TEXT, ${w.ownCase}::FLOAT8
          FROM cases c JOIN practice_areas pa ON pa.id = c.practice_area_id
          WHERE c.client_id = ${userId}::UUID AND c.deleted_at IS NULL
          ORDER BY c.created_at DESC LIMIT 20)
        UNION ALL
        (SELECT COALESCE(pa.parent_id, pa.id)::TEXT, ${w.bid}::FLOAT8
          FROM bids b JOIN cases c ON c.id = b.case_id
          JOIN practice_areas pa ON pa.id = c.practice_area_id
          WHERE b.attorney_id = ${userId}::UUID
          ORDER BY b.created_at DESC LIMIT 30)
        UNION ALL
        (SELECT COALESCE(pa.parent_id, pa.id)::TEXT, ${w.saved}::FLOAT8
          FROM saved_items s JOIN posts p ON p.id = s.item_id AND s.item_type = 'post'
          JOIN practice_areas pa ON pa.id = p.practice_area_id
          WHERE s.user_id = ${userId}::UUID
          ORDER BY s.created_at DESC LIMIT 50)
        UNION ALL
        (SELECT COALESCE(pa.parent_id, pa.id)::TEXT, ${w.saved}::FLOAT8
          FROM saved_items s JOIN cases c ON c.id = s.item_id AND s.item_type = 'case'
          JOIN practice_areas pa ON pa.id = c.practice_area_id
          WHERE s.user_id = ${userId}::UUID
          ORDER BY s.created_at DESC LIMIT 50)
        UNION ALL
        (SELECT COALESCE(pa.parent_id, pa.id)::TEXT, ${w.commented}::FLOAT8
          FROM comments cm JOIN posts p ON p.id = cm.post_id
          JOIN practice_areas pa ON pa.id = p.practice_area_id
          WHERE cm.author_id = ${userId}::UUID AND cm.created_at > now() - INTERVAL '60 days'
          ORDER BY cm.created_at DESC LIMIT 50)
        UNION ALL
        (SELECT COALESCE(pa.parent_id, pa.id)::TEXT, ${w.liked}::FLOAT8
          FROM post_likes l JOIN posts p ON p.id = l.post_id
          JOIN practice_areas pa ON pa.id = p.practice_area_id
          WHERE l.user_id = ${userId}::UUID AND l.created_at > now() - INTERVAL '60 days'
          ORDER BY l.created_at DESC LIMIT 100)
        UNION ALL
        (SELECT COALESCE(pa.parent_id, pa.id)::TEXT, ${w.viewed}::FLOAT8
          FROM post_views v JOIN posts p ON p.id = v.post_id
          JOIN practice_areas pa ON pa.id = p.practice_area_id
          WHERE v.user_id = ${userId}::UUID AND v.created_at > now() - INTERVAL '60 days'
          ORDER BY v.created_at DESC LIMIT 100)
        UNION ALL
        (SELECT COALESCE(pa.parent_id, pa.id)::TEXT, ${w.followed}::FLOAT8
          FROM follows f
          JOIN attorney_practice_areas ap ON ap.attorney_id = f.followee_id
          JOIN practice_areas pa ON pa.id = ap.practice_area_id
          WHERE f.follower_id = ${userId}::UUID
          LIMIT 200)
      ) t GROUP BY category`;
    return normalizeInterests(rows);
  }

  // --- people ------------------------------------------------------------

  /**
   * Attorneys to suggest to [viewerId], best first: not self, not already
   * followed, not blocked either way. Cached per viewer; a follow made
   * after the build is filtered out by the caller.
   */
  peopleFor(viewerId: string): Promise<string[]> {
    return this.cached(`reco:people:${viewerId}`, PEOPLE_TTL_SEC, async () => {
      const [viewer, candidates] = await Promise.all([
        this.peopleViewer(viewerId),
        this.peopleCandidates(viewerId, { suggest: true }),
      ]);
      const now = Date.now();
      const w = await this.weights('people', PEOPLE_WEIGHTS);
      const scored: Scored<PersonCandidate>[] = candidates.map((c) => ({
        item: c,
        score: personScore(c, viewer, now, w),
      }));
      return diversify(scored, {
        key: (c) => c.categories[0] ?? c.id,
        window: 4,
        keyPenalty: 0.04,
      })
        .slice(0, PEOPLE_POOL)
        .map((c) => c.id);
    });
  }

  /**
   * Personal affinity 0..1 of given people (text search tie-break):
   * the same formula, over exactly [ids]. Missing ids score 0.
   */
  async peopleAffinity(
    viewerId: string,
    ids: string[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (ids.length === 0) return out;
    const [viewer, candidates] = await Promise.all([
      this.peopleViewer(viewerId),
      this.peopleCandidates(viewerId, { ids }),
    ]);
    const now = Date.now();
    const w = await this.weights('people', PEOPLE_WEIGHTS);
    for (const c of candidates) out.set(c.id, personScore(c, viewer, now, w));
    return out;
  }

  private async peopleViewer(viewerId: string): Promise<PeopleViewer> {
    const [base, interests] = await Promise.all([
      this.viewerBase(viewerId),
      this.interests(viewerId),
    ]);
    return { id: viewerId, states: base.states, interests };
  }

  private async peopleCandidates(
    viewerId: string,
    mode: { suggest: true } | { ids: string[] },
  ): Promise<PersonCandidate[]> {
    const filter =
      'ids' in mode
        ? Prisma.sql`AND a.verification_status <> 'suspended'
            AND a.user_id = ANY(${mode.ids}::UUID[])`
        : Prisma.sql`AND a.verification_status = 'verified'
            AND NOT EXISTS (SELECT 1 FROM follows fx
              WHERE fx.follower_id = ${viewerId}::UUID AND fx.followee_id = a.user_id)`;
    const limit = 'ids' in mode ? mode.ids.length : PEOPLE_SCAN;
    const rows = await this.prisma.$queryRaw<PersonRow[]>`
      SELECT a.user_id::TEXT AS id,
        a.rating_avg::FLOAT8 AS rating_avg, a.rating_count::INT AS rating_count,
        a.followers_count::INT AS followers_count,
        a.trust_level::INT AS trust_level, a.trust_badge,
        (SELECT count(*) FROM posts p WHERE p.author_id = a.user_id
           AND p.status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
           AND p.created_at > now() - INTERVAL '30 days')::INT AS posts_30d,
        (SELECT max(p.created_at) FROM posts p WHERE p.author_id = a.user_id
           AND p.status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL) AS last_post_at,
        COALESCE((SELECT array_agg(DISTINCT l.state_code::TEXT) FROM attorney_licenses l
           WHERE l.attorney_id = a.user_id AND l.license_status = 'verified'),
           ARRAY[]::TEXT[]) AS states,
        COALESCE((SELECT array_agg(DISTINCT COALESCE(pa.parent_id, pa.id)::TEXT)
           FROM attorney_practice_areas ap
           JOIN practice_areas pa ON pa.id = ap.practice_area_id
           WHERE ap.attorney_id = a.user_id), ARRAY[]::TEXT[]) AS categories,
        (SELECT count(*) FROM follows f WHERE f.followee_id = a.user_id
           AND f.follower_id IN (SELECT followee_id FROM follows
                                 WHERE follower_id = ${viewerId}::UUID))::INT AS mutual,
        EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = a.user_id
           AND f.followee_id = ${viewerId}::UUID) AS follows_viewer,
        ((SELECT count(*) FROM post_likes l JOIN posts p ON p.id = l.post_id
            WHERE l.user_id = ${viewerId}::UUID AND p.author_id = a.user_id
              AND l.created_at > now() - INTERVAL '60 days')
         + 2 * (SELECT count(*) FROM comments cm JOIN posts p ON p.id = cm.post_id
            WHERE cm.author_id = ${viewerId}::UUID AND p.author_id = a.user_id
              AND cm.created_at > now() - INTERVAL '60 days')
         + 0.5 * (SELECT count(*) FROM post_views pv JOIN posts p ON p.id = pv.post_id
            WHERE pv.user_id = ${viewerId}::UUID AND p.author_id = a.user_id
              AND pv.created_at > now() - INTERVAL '60 days'))::FLOAT8 AS engaged,
        -- Owner 2026-10-13: address-book match, either direction.
        (CASE
           WHEN EXISTS (SELECT 1 FROM contact_matches m
                WHERE m.owner_id = ${viewerId}::UUID AND m.matched_id = a.user_id) THEN 1.0
           WHEN EXISTS (SELECT 1 FROM contact_matches m
                WHERE m.owner_id = a.user_id AND m.matched_id = ${viewerId}::UUID) THEN 0.6
           ELSE 0.0 END)::FLOAT8 AS contact
      FROM attorney_profiles a
      JOIN users u ON u.id = a.user_id AND u.status = 'active' AND u.deleted_at IS NULL
      WHERE a.user_id <> ${viewerId}::UUID
        ${filter}
        AND NOT EXISTS (SELECT 1 FROM user_blocks ub
          WHERE (ub.blocker_id = ${viewerId}::UUID AND ub.blocked_id = a.user_id)
             OR (ub.blocker_id = a.user_id AND ub.blocked_id = ${viewerId}::UUID))
      ORDER BY a.rating_avg DESC, a.followers_count DESC, a.user_id
      LIMIT ${limit}`;
    return rows.map(toPerson);
  }

  // --- posts -------------------------------------------------------------

  /**
   * Post ids for the Search grid, best first, among the newest
   * [POST_CANDIDATES] posts matching [where] (the caller's filters, blocks
   * and visibility). Cached per viewer and filter set.
   */
  postsFor(
    viewerId: string,
    where: Prisma.PostWhereInput,
    filterKey: unknown,
  ): Promise<string[]> {
    return this.cached(
      `reco:posts:${viewerId}:${hashOf(filterKey)}`,
      LISTING_TTL_SEC,
      async () => {
        const rows = await this.prisma.post.findMany({
          where,
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: POST_CANDIDATES,
          select: {
            id: true,
            author_id: true,
            created_at: true,
            like_count: true,
            comment_count: true,
            save_count: true,
            share_count: true,
            view_count: true,
            language: true,
            video_asset_id: true,
            practice_area: { select: { id: true, parent_id: true } },
            _count: { select: { media: true } },
          },
        });
        if (rows.length === 0) return [];
        const candidates: PostCandidate[] = rows.map((r) => ({
          id: r.id,
          authorId: r.author_id,
          createdAt: r.created_at,
          likes: r.like_count,
          comments: r.comment_count,
          saves: r.save_count,
          shares: r.share_count,
          views: r.view_count,
          category: r.practice_area
            ? (r.practice_area.parent_id ?? r.practice_area.id)
            : null,
          language: r.language,
          kind: postKind(r.video_asset_id, r._count.media),
        }));
        const authorIds = [...new Set(candidates.map((c) => c.authorId))];
        const [base, interests, following, seen, authors] = await Promise.all([
          this.viewerBase(viewerId),
          this.interests(viewerId),
          this.followingSet(viewerId),
          this.seenPosts(
            viewerId,
            candidates.map((c) => c.id),
          ),
          this.postAuthors(viewerId, authorIds),
        ]);
        const viewer: PostViewer = {
          id: viewerId,
          language: base.language,
          states: base.states,
          interests,
          following,
          seen,
        };
        const now = Date.now();
        const w = await this.weights('post', POST_WEIGHTS);
        const hotMax = Math.max(0, ...candidates.map((c) => hotRaw(c, now)));
        const scored: Scored<PostCandidate>[] = candidates
          // Own posts are not "discovery".
          .filter((c) => c.authorId !== viewerId)
          .map((c) => ({
            item: c,
            score: postScore(
              c,
              authors.get(c.authorId),
              viewer,
              hotMax,
              now,
              w,
            ),
          }));
        return diversify(scored, {
          key: (c) => c.authorId,
          kind: (c) => c.kind,
          window: 6,
        })
          .slice(0, POST_POOL)
          .map((c) => c.id);
      },
    );
  }

  private async followingSet(viewerId: string): Promise<Set<string>> {
    const rows = await this.prisma.follow.findMany({
      where: { follower_id: viewerId },
      select: { followee_id: true },
      take: 5000,
    });
    return new Set(rows.map((r) => r.followee_id));
  }

  /** Posts among [ids] the viewer already opened or liked. */
  private async seenPosts(
    viewerId: string,
    ids: string[],
  ): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT post_id::TEXT AS id FROM post_views
        WHERE user_id = ${viewerId}::UUID AND post_id = ANY(${ids}::UUID[])
      UNION
      SELECT post_id::TEXT FROM post_likes
        WHERE user_id = ${viewerId}::UUID AND post_id = ANY(${ids}::UUID[])`;
    return new Set(rows.map((r) => r.id));
  }

  private async postAuthors(
    viewerId: string,
    authorIds: string[],
  ): Promise<Map<string, PostAuthor>> {
    const people = await this.peopleCandidates(viewerId, { ids: authorIds });
    return new Map(
      people.map((p) => [
        p.id,
        {
          ratingAvg: p.ratingAvg,
          ratingCount: p.ratingCount,
          trustLevel: p.trustLevel,
          trustBadge: p.trustBadge,
          states: p.states,
          mutual: p.mutual,
          engaged: p.engaged,
        },
      ]),
    );
  }

  // --- cases -------------------------------------------------------------

  /**
   * [candidates] (case ids the attorney may see, already filtered by the
   * caller) in the order an attorney is most likely to want them.
   * Cached per attorney and filter set.
   */
  casesFor(
    attorneyId: string,
    candidates: string[],
    filterKey: unknown,
  ): Promise<string[]> {
    if (candidates.length === 0) return Promise.resolve([]);
    return this.cached(
      `reco:cases:${attorneyId}:${hashOf(filterKey)}`,
      LISTING_TTL_SEC,
      async () => {
        const [rows, viewer] = await Promise.all([
          this.prisma.case.findMany({
            where: { id: { in: candidates } },
            select: {
              id: true,
              client_id: true,
              created_at: true,
              practice_area_id: true,
              practice_area: { select: { id: true, parent_id: true } },
              primary_state_code: true,
              states: { select: { state_code: true } },
              budget_cents: true,
              bids_count: true,
              view_count: true,
              comment_count: true,
              urgency: true,
              deadline_at: true,
              client_active_at: true,
            },
          }),
          this.caseViewer(attorneyId, candidates),
        ]);
        const clients = await this.prisma.clientProfile.findMany({
          where: {
            user_id: { in: [...new Set(rows.map((r) => r.client_id))] },
          },
          select: { user_id: true, rating_avg: true, rating_count: true },
        });
        const byClient = new Map(clients.map((c) => [c.user_id, c]));
        const now = Date.now();
        const w = await this.weights('case', CASE_WEIGHTS);
        const scored: Scored<CaseCandidate & { category: string }>[] = rows.map(
          (r) => {
            const client = byClient.get(r.client_id);
            const c: CaseCandidate & { category: string } = {
              id: r.id,
              createdAt: r.created_at,
              practiceId: r.practice_area_id,
              categoryId: r.practice_area.parent_id ?? r.practice_area.id,
              category: r.practice_area.parent_id ?? r.practice_area.id,
              states: [
                ...new Set([
                  r.primary_state_code,
                  ...r.states.map((s) => s.state_code),
                ]),
              ],
              budgetCents: r.budget_cents,
              bidsCount: r.bids_count,
              viewCount: r.view_count,
              commentCount: r.comment_count,
              urgency: r.urgency,
              deadlineAt: r.deadline_at,
              clientActiveAt: r.client_active_at,
              clientRatingAvg: Number(client?.rating_avg ?? 0),
              clientRatingCount: client?.rating_count ?? 0,
            };
            return { item: c, score: caseScore(c, viewer, now, w) };
          },
        );
        return diversify(scored, {
          key: (c) => c.category,
          window: 2,
          keyPenalty: 0.04,
        })
          .slice(0, CASE_POOL)
          .map((c) => c.id);
      },
    );
  }

  private async caseViewer(
    attorneyId: string,
    caseIds: string[],
  ): Promise<CaseViewer> {
    const [own, base, interests, bids] = await Promise.all([
      this.prisma.attorneyPracticeArea.findMany({
        where: { attorney_id: attorneyId },
        select: { practice_area_id: true },
      }),
      this.viewerBase(attorneyId),
      this.interests(attorneyId),
      this.prisma.bid.findMany({
        where: { attorney_id: attorneyId, case_id: { in: caseIds } },
        select: { case_id: true },
      }),
    ]);
    return {
      id: attorneyId,
      practiceIds: new Set(own.map((o) => o.practice_area_id)),
      interests,
      states: new Set(base.states),
      bidOn: new Set(bids.map((b) => b.case_id)),
    };
  }

  // --- groups and channels -------------------------------------------------

  /**
   * Public groups or active channels to suggest to [viewerId], best first,
   * with how many of the viewer's circle (people they follow, members of
   * their own groups and channels) are in each. A snapshot per viewer, so
   * the cost is paid once per [COMMUNITY_TTL_SEC], not per request. Never
   * holds the viewer's own communities, ones they were removed from, or
   * ones owned across a block; the callers filter what changed since.
   */
  async communities(
    viewerId: string,
    kind: 'group' | 'channel',
  ): Promise<{ id: string; mutual: number }[]> {
    const key = `reco:communities:${kind}:${viewerId}`;
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as { id: string; mutual: number }[];
    const out = await this.buildCommunities(viewerId, kind);
    await this.redis.set(key, JSON.stringify(out), 'EX', COMMUNITY_TTL_SEC);
    return out;
  }

  private async buildCommunities(
    viewerId: string,
    kind: 'group' | 'channel',
  ): Promise<{ id: string; mutual: number }[]> {
    const [base, interests, circle] = await Promise.all([
      this.viewerBase(viewerId),
      this.interests(viewerId),
      this.circle(viewerId),
    ]);
    const load = (newest: boolean) =>
      kind === 'group'
        ? this.groupRows(viewerId, circle, newest)
        : this.channelRows(viewerId, circle, newest);
    const [popularRows, newestRows] = await Promise.all([
      load(false),
      load(true),
    ]);
    const rows = [
      ...new Map(
        [...popularRows, ...newestRows].map((r) => [r.id, r]),
      ).values(),
    ];
    if (rows.length === 0) return [];
    const owners = [...new Set(rows.map((r) => r.owner_id))];
    const [cats, states] = await Promise.all([
      this.prisma.$queryRaw<{ uid: string; v: string[] }[]>`
        SELECT ap.attorney_id::TEXT AS uid,
               array_agg(DISTINCT COALESCE(pa.parent_id, pa.id)::TEXT) AS v
        FROM attorney_practice_areas ap
        JOIN practice_areas pa ON pa.id = ap.practice_area_id
        WHERE ap.attorney_id = ANY(${owners}::UUID[]) GROUP BY 1`,
      this.prisma.$queryRaw<{ uid: string; v: string[] }[]>`
        SELECT l.attorney_id::TEXT AS uid,
               array_agg(DISTINCT l.state_code::TEXT) AS v
        FROM attorney_licenses l
        WHERE l.license_status = 'verified'
          AND l.attorney_id = ANY(${owners}::UUID[]) GROUP BY 1`,
    ]);
    const catOf = new Map(cats.map((r) => [r.uid, r.v]));
    const stateOf = new Map(states.map((r) => [r.uid, r.v]));
    const viewer: CommunityViewer = {
      id: viewerId,
      states: base.states,
      interests,
    };
    const now = Date.now();
    const scored = rows.map((r) => {
      const cand: CommunityCandidate = {
        id: r.id,
        members: Number(r.members),
        lastActivityAt: r.last_at ? new Date(r.last_at) : null,
        joins7d: Number(r.joins7d),
        categories: catOf.get(r.owner_id) ?? [],
        states: stateOf.get(r.owner_id) ?? [],
        mutual: Number(r.mutual),
      };
      return {
        id: r.id,
        mutual: cand.mutual,
        score: communityScore(cand, viewer, now),
      };
    });
    return feedOrder(
      scored,
      popularRows.map((r) => r.id),
      newestRows.map((r) => r.id),
      COMMUNITY_POOL,
    ).map(({ id, mutual }) => ({ id, mutual }));
  }

  /** People the viewer knows: followed, and fellow members of own groups / channels. */
  private async circle(viewerId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ uid: string }[]>`
      SELECT DISTINCT uid::TEXT AS uid FROM (
        (SELECT followee_id AS uid FROM follows
          WHERE follower_id = ${viewerId}::UUID LIMIT 300)
        UNION ALL
        (SELECT m.user_id FROM chat_group_members m
          WHERE m.left_at IS NULL AND m.user_id <> ${viewerId}::UUID
            AND m.group_id IN (SELECT group_id FROM chat_group_members
              WHERE user_id = ${viewerId}::UUID AND left_at IS NULL LIMIT 20)
          LIMIT 500)
        UNION ALL
        (SELECT s.user_id FROM channel_subscriptions s
          WHERE s.user_id <> ${viewerId}::UUID
            AND s.channel_id IN (SELECT channel_id FROM channel_subscriptions
              WHERE user_id = ${viewerId}::UUID LIMIT 20)
          LIMIT 500)
      ) t`;
    return rows.map((r) => r.uid);
  }

  private groupRows(viewerId: string, circle: string[], newest: boolean) {
    return this.prisma.$queryRaw<CommunityRow[]>`
      SELECT g.id::TEXT AS id, g.member_count AS members,
             g.last_message_at AS last_at, own.user_id::TEXT AS owner_id,
             (SELECT count(*)::INT FROM chat_group_members j
               WHERE j.group_id = g.id AND j.left_at IS NULL
                 AND j.joined_at > now() - INTERVAL '7 days') AS joins7d,
             (SELECT count(*)::INT FROM chat_group_members j
               WHERE j.group_id = g.id AND j.left_at IS NULL
                 AND j.user_id = ANY(${circle}::UUID[])) AS mutual
      FROM chat_groups g
      JOIN chat_group_members own
        ON own.group_id = g.id AND own.role = 'owner' AND own.left_at IS NULL
      WHERE g.group_type = 'public' AND g.deleted_at IS NULL
        AND g.member_count > 0
        AND NOT EXISTS (SELECT 1 FROM chat_group_members me
          WHERE me.group_id = g.id AND me.user_id = ${viewerId}::UUID
            AND (me.left_at IS NULL OR me.left_reason = 'removed'))
        AND NOT EXISTS (SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = ${viewerId}::UUID AND b.blocked_id = own.user_id)
             OR (b.blocker_id = own.user_id AND b.blocked_id = ${viewerId}::UUID))
      ORDER BY ${newest ? Prisma.sql`g.created_at DESC` : Prisma.sql`g.member_count DESC, g.created_at DESC`}
      LIMIT ${newest ? COMMUNITY_NEWEST : COMMUNITY_SCAN}`;
  }

  private channelRows(viewerId: string, circle: string[], newest: boolean) {
    return this.prisma.$queryRaw<CommunityRow[]>`
      SELECT c.id::TEXT AS id, c.subscriber_count AS members,
             c.last_post_at AS last_at, c.owner_id::TEXT AS owner_id,
             (SELECT count(*)::INT FROM channel_subscriptions j
               WHERE j.channel_id = c.id
                 AND j.created_at > now() - INTERVAL '7 days') AS joins7d,
             (SELECT count(*)::INT FROM channel_subscriptions j
               WHERE j.channel_id = c.id
                 AND j.user_id = ANY(${circle}::UUID[])) AS mutual
      FROM channels c
      WHERE c.status = 'active' AND c.deleted_at IS NULL AND c.post_count > 0
        AND NOT EXISTS (SELECT 1 FROM channel_subscriptions s
          WHERE s.channel_id = c.id AND s.user_id = ${viewerId}::UUID)
        AND NOT EXISTS (SELECT 1 FROM channel_admins a
          WHERE a.channel_id = c.id AND a.user_id = ${viewerId}::UUID)
        AND NOT EXISTS (SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = ${viewerId}::UUID AND b.blocked_id = c.owner_id)
             OR (b.blocker_id = c.owner_id AND b.blocked_id = ${viewerId}::UUID))
      ORDER BY ${newest ? Prisma.sql`c.created_at DESC` : Prisma.sql`c.subscriber_count DESC, c.created_at DESC`}
      LIMIT ${newest ? COMMUNITY_NEWEST : COMMUNITY_SCAN}`;
  }

  // --- cache -------------------------------------------------------------

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
}

export function postKind(videoAssetId: string | null, media: number): PostKind {
  if (videoAssetId) return 'reel';
  return media > 0 ? 'photo' : 'brief';
}

/** Short stable key of a filter object (cache keys never hold raw text). */
export function hashOf(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value ?? null))
    .digest('base64url')
    .slice(0, 22);
}

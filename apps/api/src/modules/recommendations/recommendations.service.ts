import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  APP_SETTINGS,
  type AppSettingKey,
} from '../../common/app-settings/app-settings.defaults';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CACHE_CLIENT } from '../../redis/redis.constants';
import {
  type HomeFeedRanker,
  RANKED_PIN_TTL_SEC,
} from '../../common/feed-ranking/home-feed-ranker';
import { cached } from '../../common/cache/cached';
import { feedVersion } from '../../common/cache/feed-version';
import {
  type Assignment,
  ExperimentsService,
} from '../experiments/experiments.service';
import { RankingEventsService } from '../experiments/ranking-events.service';
import {
  type CaseCandidate,
  type CaseViewer,
  CASE_WEIGHTS,
  caseFeatures,
  caseScore,
} from './cases.scoring';
import {
  type PeopleViewer,
  PEOPLE_WEIGHTS,
  type PersonCandidate,
  personFeatures,
  personScore,
} from './people.scoring';
import {
  type PostAuthor,
  type PostCandidate,
  type PostKind,
  POST_WEIGHTS,
  postFeatures,
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
import {
  QA_CASE_BOOST,
  QA_PEOPLE_BOOST,
  type QaAttorneyEntry,
  qaCaseBoost,
  qaPeopleBoost,
} from './qa-ranking';
import { QaSnapshotService } from './qa-snapshot.service';
import { shardContext } from '../../sharding/shard-context';
import {
  PostRankerService,
  RANKER_EXPERIMENT_KEY,
} from './ranker/post-ranker.service';
import {
  CASES_RANKER_FEED,
  CaseRankerService,
  REELS_RANKER_FEED,
  ReelRankerService,
} from './ranker/feed-rankers.service';
import { isModelArmOf, type LearnedRanker } from './ranker/learned-ranker';
import { caseRankerRow } from './ranker/cases-features';
import { reelRankerRow } from './ranker/reels-features';
import { rankerRow } from './ranker/ranker-features';
import { byFormula, withModelOrder } from './ranker/rerank';

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
/** CONTENT M-6: a For-You grid list a viewer started paging stays this long. */
export const POST_PIN_TTL_SEC = RANKED_PIN_TTL_SEC;

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

export type RecoKind = 'case' | 'people' | 'post' | 'reel';

/**
 * Where a ranked list's impressions are logged (ranking_events.surface).
 * Owner 25.11: the reels feed is its own surface (its own learned model,
 * its own training data); it still runs the posts formula and the posts
 * surface's A/B tests (EXPERIMENT_SURFACE).
 */
export const RECO_SURFACE: Record<RecoKind, string> = {
  case: 'case_feed',
  people: 'people',
  post: 'posts',
  reel: 'reels',
};

/** The experiment surface (admin «Эксперименты» → «где») of each formula. */
export const EXPERIMENT_SURFACE: Record<RecoKind, string> = {
  ...RECO_SURFACE,
  reel: 'posts',
};

/** Put on logged impressions: which formula ranked the list. */
export const RECO_FORMULA: Record<RecoKind, string> = {
  case: 'cases-2026-10',
  people: 'people-2026-10',
  post: 'posts-2026-10',
  reel: 'reels-2026-11',
};

/** Cache key part of a variant: a variant's list is never served to control. */
export const variantSuffix = (a: Assignment | null | undefined): string =>
  a ? `:x:${a.experimentKey}:${a.variant}` : '';

const featuresKey = (kind: RecoKind, viewerId: string) =>
  `reco:f:${kind}:${viewerId}`;

/**
 * Owner 2026-10-13: the recommendation algorithms of Search — people,
 * posts, cases — "like Instagram, but ours". One service, one weighted
 * formula per kind (people.scoring.ts, posts.scoring.ts,
 * cases.scoring.ts), ranked lists cached per viewer. Used for empty-query
 * blocks (Recommended, the Posts grid, the attorney's Cases) and as a
 * secondary tie-break inside text search; text relevance stays first.
 */
@Injectable()
export class RecommendationsService implements HomeFeedRanker {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CACHE_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
    // R-401: the nightly Q&A ranking snapshot (read only here).
    @Optional() private readonly qaSnapshot?: QaSnapshotService,
    // Owner 2026-11-08: A/B tests change the formula's weights per variant.
    @Optional() private readonly experiments?: ExperimentsService,
    @Optional() private readonly rankingEvents?: RankingEventsService,
    // F2: the learned second stage of the posts ranking.
    @Optional() private readonly ranker?: PostRankerService,
    // Owner 25.11: the reels' and the case feed's own learned stage.
    @Optional() private readonly reelRanker?: ReelRankerService,
    @Optional() private readonly caseRanker?: CaseRankerService,
  ) {}

  /** True for the model arm of [kind]'s ranker test. */
  private modelArm(kind: RecoKind, a: Assignment | null | undefined): boolean {
    const key =
      kind === 'post'
        ? RANKER_EXPERIMENT_KEY
        : kind === 'reel'
          ? REELS_RANKER_FEED.experimentKey
          : kind === 'case'
            ? CASES_RANKER_FEED.experimentKey
            : null;
    return key !== null && isModelArmOf(key, a);
  }

  /** The learned second stage of [kind]'s feed (none for people). */
  private rankerOf(kind: RecoKind): LearnedRanker | undefined {
    if (kind === 'post') return this.ranker;
    if (kind === 'reel') return this.reelRanker;
    if (kind === 'case') return this.caseRanker;
    return undefined;
  }

  /**
   * The viewer's variant in the running test of [kind]'s surface (null =
   * not in a test: the admin's weights as they are). Records the exposure.
   */
  async assignmentFor(
    viewerId: string,
    kind: RecoKind,
  ): Promise<Assignment | null> {
    // F2 / owner 25.11: on each feed its own ranker test comes first; its
    // two arms both run the admin's weights as they are (no variant
    // overrides), so the model is compared with the formula alone.
    const learned = this.rankerOf(kind);
    if (learned) {
      const r = await learned.assign(viewerId);
      if (r) return r;
    }
    if (!this.experiments) return null;
    return this.experiments.assignSurface(viewerId, EXPERIMENT_SURFACE[kind]);
  }

  /**
   * A ranked page of [kind] was served to the viewer: logs one impression
   * per item at its place (with the variant and the features), so the
   * nightly experiment report and the replay have data. Never throws; the
   * caller does not wait for it.
   */
  async logServed(
    viewerId: string,
    kind: RecoKind,
    ids: readonly string[],
    offset: number,
  ): Promise<void> {
    try {
      const ev = this.rankingEvents;
      if (!ev || ids.length === 0) return;
      if (!(await ev.keepsImpressionsOf(viewerId))) return;
      const [assignment, features] = await Promise.all([
        this.assignmentFor(viewerId, kind),
        this.featuresFor(viewerId, kind, ids),
      ]);
      const learned = this.rankerOf(kind);
      await ev.logList({
        userId: viewerId,
        surface: RECO_SURFACE[kind],
        itemIds: ids,
        offset,
        assignment,
        formulaVersion:
          (learned && this.modelArm(kind, assignment)
            ? learned.formulaVersion()
            : null) ?? RECO_FORMULA[kind],
        features,
      });
    } catch {
      // the log never hurts the list
    }
  }

  /**
   * The 0..1 features each item of [ids] had when it was ranked for the
   * viewer (kept only while impressions of this viewer are logged), for the
   * offline replay of new weights.
   */
  async featuresFor(
    viewerId: string,
    kind: RecoKind,
    ids: readonly string[],
  ): Promise<Map<string, Record<string, number>>> {
    const out = new Map<string, Record<string, number>>();
    if (ids.length === 0) return out;
    try {
      const raw = await this.redis.hmget(featuresKey(kind, viewerId), ...ids);
      raw.forEach((r, i) => {
        if (r) out.set(ids[i], JSON.parse(r) as Record<string, number>);
      });
    } catch {
      // no features: the impressions are logged without them
    }
    return out;
  }

  private async keepFeatures(
    viewerId: string,
    kind: RecoKind,
    rows: Array<[string, Record<string, number>]>,
    ttlSec: number,
  ): Promise<void> {
    try {
      if (rows.length === 0 || !this.rankingEvents) return;
      if (!(await this.rankingEvents.keepsImpressionsOf(viewerId))) return;
      const key = featuresKey(kind, viewerId);
      const flat = [...roundedFeatures(new Map(rows))].flatMap(([id, f]) => [
        id,
        JSON.stringify(f),
      ]);
      await this.redis
        .multi()
        .del(key)
        .hset(key, ...flat)
        .expire(key, ttlSec)
        .exec();
    } catch {
      // best effort
    }
  }

  /** R-401: how much the Q&A snapshot adds on top of the people score. */
  private async qaPeopleWeights(): Promise<{ qa: number; qaTopic: number }> {
    const s = this.settings;
    if (!s) return QA_PEOPLE_BOOST;
    return {
      qa: await s.number('reco.people.qa'),
      qaTopic: await s.number('reco.people.qaTopic'),
    };
  }

  /**
   * The admin's weights for [kind] (the built-in ones when unset), with the
   * viewer's experiment variant on top (its overrides of known weights).
   */
  private async weights<T extends Record<string, number>>(
    kind: RecoKind,
    base: T,
    variant?: Assignment | null,
  ): Promise<T> {
    const s = this.settings;
    const out: Record<string, number> = { ...base };
    if (s) {
      for (const k of Object.keys(base)) {
        out[k] = await s.number(`reco.${kind}.${k}` as AppSettingKey);
      }
    }
    for (const [k, v] of Object.entries(variant?.weights ?? {})) {
      if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = v;
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
  async peopleFor(viewerId: string): Promise<string[]> {
    const variant = await this.assignmentFor(viewerId, 'people');
    const key = `reco:people:${viewerId}${variantSuffix(variant)}`;
    return this.cached(key, PEOPLE_TTL_SEC, async () => {
      const [viewer, candidates] = await Promise.all([
        this.peopleViewer(viewerId),
        this.peopleCandidates(viewerId, { suggest: true }),
      ]);
      const now = Date.now();
      const w = await this.weights('people', PEOPLE_WEIGHTS, variant);
      await this.keepFeatures(
        viewerId,
        'people',
        candidates.map((c) => [c.id, personFeatures(c, viewer, now)]),
        PEOPLE_TTL_SEC,
      );
      // R-401: answers to clients' questions lift an attorney — read from
      // the nightly snapshot (empty / flag off = nothing added).
      const [qa, qw] = await Promise.all([
        this.qaSnapshot?.attorneyScores(candidates.map((c) => c.id)) ??
          new Map<string, QaAttorneyEntry>(),
        this.qaPeopleWeights(),
      ]);
      const scored: Scored<PersonCandidate>[] = candidates.map((c) => ({
        item: c,
        score:
          personScore(c, viewer, now, w) +
          qaPeopleBoost(qa.get(c.id), viewer.interests, qw),
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
    const w = await this.weights(
      'people',
      PEOPLE_WEIGHTS,
      await this.assignmentFor(viewerId, 'people'),
    );
    const [qa, qw] = await Promise.all([
      this.qaSnapshot?.attorneyScores(ids) ??
        new Map<string, QaAttorneyEntry>(),
      this.qaPeopleWeights(),
    ]);
    for (const c of candidates) {
      out.set(
        c.id,
        personScore(c, viewer, now, w) +
          qaPeopleBoost(qa.get(c.id), viewer.interests, qw),
      );
    }
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
    // Algo audit 2026-10-27 (CONTENT H-4): next to the PEOPLE_SCAN best
    // rated, the newest verified attorneys are candidates too — before, a
    // new attorney (rating 0) was cut by the LIMIT before any scoring and
    // could never be suggested. The scoring then decides.
    const newest = 'ids' in mode ? 0 : await this.peopleNewest();
    const eligible = (x: string) => Prisma.sql`
      SELECT ${Prisma.raw(x)}.user_id FROM attorney_profiles ${Prisma.raw(x)}
      JOIN users ${Prisma.raw(`${x}u`)} ON ${Prisma.raw(`${x}u`)}.id = ${Prisma.raw(x)}.user_id
        AND ${Prisma.raw(`${x}u`)}.status = 'active' AND ${Prisma.raw(`${x}u`)}.deleted_at IS NULL
      WHERE ${Prisma.raw(x)}.verification_status = 'verified'
        AND ${Prisma.raw(x)}.user_id <> ${viewerId}::UUID
        AND NOT EXISTS (SELECT 1 FROM follows fx
          WHERE fx.follower_id = ${viewerId}::UUID AND fx.followee_id = ${Prisma.raw(x)}.user_id)
        AND NOT EXISTS (SELECT 1 FROM user_blocks ub
          WHERE (ub.blocker_id = ${viewerId}::UUID AND ub.blocked_id = ${Prisma.raw(x)}.user_id)
             OR (ub.blocker_id = ${Prisma.raw(x)}.user_id AND ub.blocked_id = ${viewerId}::UUID))`;
    const filter =
      'ids' in mode
        ? Prisma.sql`AND a.verification_status <> 'suspended'
            AND a.user_id = ANY(${mode.ids}::UUID[])`
        : newest > 0
          ? Prisma.sql`AND a.verification_status = 'verified'
            AND NOT EXISTS (SELECT 1 FROM follows fx
              WHERE fx.follower_id = ${viewerId}::UUID AND fx.followee_id = a.user_id)
            AND a.user_id IN (
              (${eligible('t')}
                ORDER BY t.rating_avg DESC, t.followers_count DESC, t.user_id
                LIMIT ${PEOPLE_SCAN})
              UNION
              (${eligible('n')}
                ORDER BY n.verified_at DESC NULLS LAST, n.user_id
                LIMIT ${newest}))`
          : Prisma.sql`AND a.verification_status = 'verified'
            AND NOT EXISTS (SELECT 1 FROM follows fx
              WHERE fx.follower_id = ${viewerId}::UUID AND fx.followee_id = a.user_id)`;
    const limit = 'ids' in mode ? mode.ids.length : PEOPLE_SCAN + newest;
    // Shard-ready: attorney_profiles / users / attorney_licenses are GLOBAL
    // family — the candidates are read on the primary database, not on the
    // viewer's shard (empty tables there once the families are split; the
    // two-DB e2e got 0 candidates). The follows / user_blocks NOT EXISTS
    // are exact with one database; FollowsService.suggestions re-filters
    // followed and blocked people from their own family anyway.
    const rows = await shardContext.runOnPrimary(
      () => this.prisma.$queryRaw<PersonRow[]>`
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
      LIMIT ${limit}`,
    );
    return rows.map(toPerson);
  }

  /** `reco.people_newest`, clamped to 0..1000 (default without settings). */
  private async peopleNewest(): Promise<number> {
    let v: number = APP_SETTINGS['reco.people_newest'];
    try {
      if (this.settings) v = await this.settings.number('reco.people_newest');
    } catch {
      // unreadable: the built-in default
    }
    return Math.min(1000, Math.max(0, Math.floor(v)));
  }

  // --- posts -------------------------------------------------------------

  /**
   * Algo audit 2026-10-27 (CONTENT M-6): the For-You grid pages by offset
   * over a list that is rebuilt every few minutes — a rebuild mid-scroll
   * skipped or repeated posts. The first page (offset 0) pins the list it
   * served for POST_PIN_TTL_SEC; later pages read that copy while it lives
   * (a lost copy = today's behaviour). `reco.pin_paging_enabled` off = no
   * pin. Status and blocks are re-checked when the page is presented.
   *
   * 18.11 (owner: reels / posts skipped or repeated after a refresh): the
   * copy is named by its content ([pin], carried in the caller's cursor).
   * One shared copy per viewer was overwritten by ANY newer first page of
   * the same list — the Reels screen reads a fresh first page every 3
   * minutes while the viewer scrolls (the fresh-reels mix), so the scroll
   * jumped to another ranking mid-way. Now a scroll keeps paging the copy
   * its own first page served; a new first page starts a new copy.
   * [opts.includeOwn]: the viewer's own posts stay in the list (reels).
   * [opts.feed] 'reel' (owner 25.11): the reels feed — its own learned
   * ranker, features and impressions surface; the posts formula still
   * picks the candidates.
   */
  async postsForPage(
    viewerId: string,
    where: Prisma.PostWhereInput,
    filterKey: unknown,
    offset: number,
    opts: {
      pin?: string | null;
      includeOwn?: boolean;
      feed?: 'post' | 'reel';
    } = {},
  ): Promise<{ ids: string[]; pin: string | null }> {
    const feed = opts.feed ?? 'post';
    let pinOn = APP_SETTINGS['reco.pin_paging_enabled'];
    try {
      if (this.settings)
        pinOn = await this.settings.boolean('reco.pin_paging_enabled');
    } catch {
      // unreadable: the built-in default
    }
    const variant = await this.assignmentFor(viewerId, feed);
    const build = () =>
      this.postsFor(viewerId, where, filterKey, variant, {
        includeOwn: opts.includeOwn,
        feed,
      });
    if (!pinOn) return { ids: await build(), pin: null };
    const base = `reco:posts:pin:${viewerId}:${hashOf(filterKey)}${variantSuffix(variant)}`;
    if (offset > 0) {
      try {
        // A cursor from before 18.11 has no pin: the old shared copy.
        const raw = await this.redis.get(
          opts.pin ? `${base}:${opts.pin}` : base,
        );
        if (raw) {
          const ids = JSON.parse(raw) as unknown;
          if (Array.isArray(ids))
            return { ids: ids as string[], pin: opts.pin ?? null };
        }
      } catch {
        // cache down or garbage: rebuild below
      }
    }
    const ids = await build();
    // Pinned on the first page, or re-pinned when the copy was lost. The
    // same list gives the same name (no new key while the ranking holds).
    const pin = hashOf(ids).slice(0, 12);
    await Promise.resolve()
      .then(() =>
        this.redis.set(
          `${base}:${pin}`,
          JSON.stringify(ids),
          'EX',
          POST_PIN_TTL_SEC,
        ),
      )
      .catch(() => undefined);
    return { ids, pin };
  }

  /**
   * Post ids for the Search grid, best first, among the newest
   * [POST_CANDIDATES] posts matching [where] (the caller's filters, blocks
   * and visibility). Cached per viewer and filter set.
   */
  async postsFor(
    viewerId: string,
    where: Prisma.PostWhereInput,
    filterKey: unknown,
    variant: Assignment | null = null,
    opts: { includeOwn?: boolean; feed?: 'post' | 'reel' } = {},
  ): Promise<string[]> {
    const includeOwn = opts.includeOwn === true;
    const feed = opts.feed ?? 'post';
    // 18.11: the viewer's feed version (common/cache/feed-version.ts) is
    // part of the key — an own post going public, a follow or a block
    // starts a fresh list at once instead of after LISTING_TTL_SEC.
    const ver = await feedVersion(this.redis, viewerId);
    return this.cached(
      `reco:posts:${viewerId}:${hashOf(filterKey)}${includeOwn ? ':own' : ''}${feed === 'reel' ? ':reel' : ''}:${ver}${variantSuffix(variant)}`,
      LISTING_TTL_SEC,
      async () => {
        const rows = await this.prisma.post.findMany({
          where,
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: POST_CANDIDATES,
          select: {
            ...POST_CANDIDATE_SELECT,
            // Written here, not in the shared select: the cross-family
            // include guard (sharding/cross-family-include.spec.ts) must
            // see this Post -> PracticeArea read.
            practice_area: { select: { id: true, parent_id: true } },
            // Owner 25.11: the reels model reads the reel's length.
            ...(feed === 'reel'
              ? { video_asset: { select: { duration_sec: true } } }
              : {}),
          },
        });
        if (rows.length === 0) return [];
        const durationOf = new Map(
          rows.map((r) => [
            r.id,
            (r as { video_asset?: { duration_sec: number | null } | null })
              .video_asset?.duration_sec ?? null,
          ]),
        );
        const candidates = rows.map(toPostCandidate);
        const { viewer, authors, seen } = await this.postContext(
          viewerId,
          candidates,
        );
        const now = Date.now();
        const w = await this.weights('post', POST_WEIGHTS, variant);
        const hotMax = Math.max(0, ...candidates.map((c) => hotRaw(c, now)));
        // F2: what the impression log keeps per post is exactly the learned
        // ranker's input (ranker-features.ts): the formula's 0..1 features,
        // seen and the content type. Owner 25.11: the reels feed keeps the
        // reels model's input (reels-features.ts) instead.
        const rankerRows = new Map(
          candidates.map((c) => {
            const formula = postFeatures(
              c,
              authors.get(c.authorId),
              viewer,
              hotMax,
              now,
            );
            return [
              c.id,
              feed === 'reel'
                ? reelRankerRow(
                    formula,
                    {
                      likes: c.likes,
                      saves: c.saves,
                      shares: c.shares,
                      comments: c.comments,
                      views: c.views,
                      durationSec: durationOf.get(c.id) ?? null,
                    },
                    seen.has(c.id),
                    c.authorId === viewerId,
                  )
                : rankerRow(formula, seen.has(c.id), c.kind),
            ];
          }),
        );
        await this.keepFeatures(
          viewerId,
          feed,
          [...rankerRows.entries()],
          LISTING_TTL_SEC,
        );
        // Own posts are not "discovery" (Search). 18.11: the reels keep
        // them (Instagram: your reel is in your Reels) — unwatched own
        // reels lead, newest first; watched ones rank like any other.
        const leaders = includeOwn
          ? candidates
              .filter((c) => c.authorId === viewerId && !seen.has(c.id))
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          : [];
        const led = new Set(leaders.map((c) => c.id));
        const formulaScored: Scored<PostCandidate>[] = candidates
          .filter((c) =>
            includeOwn ? !led.has(c.id) : c.authorId !== viewerId,
          )
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
        // F2 stage 2: for the model arm the feed's learned ranker re-orders
        // the formula's best candidates (keyed in the cache by the variant).
        const learned = this.rankerOf(feed);
        const scored =
          learned && this.modelArm(feed, variant)
            ? await this.rerank(learned, formulaScored, rankerRows)
            : formulaScored;
        const spread = (list: Scored<PostCandidate>[]) =>
          diversify(list, {
            key: (c) => c.authorId,
            kind: (c) => c.kind,
            window: 6,
          });
        // 24.11 (owner: «нормальный алгоритм для каждой ленты»; TikTok
        // newsroom 18.06.2020 "How TikTok recommends videos #ForYou": no
        // video you have already seen while new ones are there): in the
        // reels every reel not watched yet comes before any watched one;
        // the watched ones follow, still ranked, so the stream never ends.
        // Search keeps the softer SEEN_FACTOR alone.
        const ranked = includeOwn
          ? [
              ...spread(scored.filter((s) => !seen.has(s.item.id))),
              ...spread(scored.filter((s) => seen.has(s.item.id))),
            ]
          : spread(scored);
        return [...leaders, ...ranked].slice(0, POST_POOL).map((c) => c.id);
      },
    );
  }

  /**
   * F2 stage 2: [ranker]'s model re-orders the formula's best `top_n`
   * candidates; the rest stay below in the formula's order. No model or a
   * scoring failure = the formula's list unchanged.
   */
  private async rerank<T extends { id: string }>(
    ranker: LearnedRanker,
    scored: Scored<T>[],
    rows: ReadonlyMap<string, Record<string, number>>,
  ): Promise<Scored<T>[]> {
    if (scored.length < 2) return scored;
    const ordered = byFormula(scored);
    const n = Math.min(ordered.length, await ranker.topN());
    const top = ordered.slice(0, n);
    const model = await ranker.score(top.map((s) => rows.get(s.item.id) ?? {}));
    if (!model) return scored;
    return [...withModelOrder(top, model), ...ordered.slice(n)];
  }

  /** What the posts formula and the posts model know about the viewer and
   * the authors of [candidates] (Search «Для вас», reels, the home feed). */
  private async postContext(
    viewerId: string,
    candidates: readonly PostCandidate[],
  ): Promise<{
    viewer: PostViewer;
    authors: Map<string, PostAuthor>;
    seen: Set<string>;
  }> {
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
    return {
      viewer: {
        id: viewerId,
        language: base.language,
        states: base.states,
        interests,
        following,
        seen,
      },
      authors,
      seen,
    };
  }

  // -----------------------------------------------------------------------
  // Owner 25.11 («умную ленту для всех лент»): Feed → «Посты» (GET /feed).

  /**
   * The viewer's arm of the posts ranker test on the home feed — the same
   * test (and so the same arm) as Search «Для вас»: one person, one arm,
   * whichever posts list they open. Null = not in the test (the feed as
   * today: followed + own posts newest first, recommendations mixed in).
   */
  async homeFeedArm(viewerId: string): Promise<Assignment | null> {
    if (!this.ranker) return null;
    return this.ranker.assign(viewerId);
  }

  /** True for the arm of the posts test that the model ranks. */
  isHomeModelArm(a: Assignment | null | undefined): boolean {
    return isModelArmOf(RANKER_EXPERIMENT_KEY, a);
  }

  /**
   * The posts model's input row of each of [ids] for the viewer, plus the
   * formula's score of each (in the order of [ids]; ids no longer readable
   * are left out). The same rows Search «Для вас» logs and scores.
   */
  async homeFeedRows(
    viewerId: string,
    ids: readonly string[],
    variant: Assignment | null = null,
  ): Promise<{
    rows: Map<string, Record<string, number>>;
    scored: Scored<PostCandidate>[];
  }> {
    const rows = new Map<string, Record<string, number>>();
    if (ids.length === 0) return { rows, scored: [] };
    const read = await this.prisma.post.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        ...POST_CANDIDATE_SELECT,
        // Inline for the cross-family include guard (as in postsFor).
        practice_area: { select: { id: true, parent_id: true } },
      },
    });
    const byId = new Map(read.map((r) => [r.id, toPostCandidate(r)]));
    const candidates = ids.flatMap((id) => {
      const c = byId.get(id);
      return c ? [c] : [];
    });
    if (candidates.length === 0) return { rows, scored: [] };
    const { viewer, authors, seen } = await this.postContext(
      viewerId,
      candidates,
    );
    const now = Date.now();
    const w = await this.weights('post', POST_WEIGHTS, variant);
    const hotMax = Math.max(0, ...candidates.map((c) => hotRaw(c, now)));
    const scored = candidates.map((c) => {
      const author = authors.get(c.authorId);
      rows.set(
        c.id,
        rankerRow(
          postFeatures(c, author, viewer, hotMax, now),
          seen.has(c.id),
          c.kind,
        ),
      );
      return { item: c, score: postScore(c, author, viewer, hotMax, now, w) };
    });
    return { rows, scored };
  }

  /**
   * Owner 25.11 (Instagram home feed: candidates first, then the ranking
   * model orders them): the home feed's candidate window — the posts the
   * feed would show anyway (followed + own posts, the recommendation
   * slots, reposts, the "everything else" tail), in the feed's own order —
   * ordered by the posts model for the model arm. [lead]: ids kept on top
   * in their order (the viewer's own newest posts: a post just published
   * is seen at once, like Instagram). Null = no model / scoring failed:
   * the caller keeps the feed exactly as it is.
   */
  async rankHomeWindow(
    viewerId: string,
    ids: readonly string[],
    lead: ReadonlySet<string>,
    variant: Assignment | null,
  ): Promise<{
    ids: string[];
    rows: Map<string, Record<string, number>>;
  } | null> {
    const ranker = this.ranker;
    if (!ranker || ids.length === 0) return null;
    try {
      const { rows, scored } = await this.homeFeedRows(viewerId, ids, variant);
      const leaders = ids.filter((id) => lead.has(id) && rows.has(id));
      const rest = scored.filter((s) => !lead.has(s.item.id));
      if (rest.length === 0) return { ids: leaders, rows };
      // The whole window is ranked by the model (it is no bigger than the
      // admin's `reco.ranker.feed_window`); the formula only lends its
      // score scale to the slots, so diversify below works as in Search.
      const ordered = byFormula(rest);
      const model = await ranker.score(
        ordered.map((s) => rows.get(s.item.id) ?? {}),
      );
      if (!model) return null;
      const spread = diversify(withModelOrder(ordered, model), {
        key: (c) => c.authorId,
        kind: (c) => c.kind,
        window: 6,
      });
      return { ids: [...leaders, ...spread.map((c) => c.id)], rows };
    } catch {
      return null;
    }
  }

  /**
   * A home feed page was served: one impression per post at its place,
   * with the posts model's input row (surface `home_feed`, which train.py
   * --feed posts reads next to Search's `posts`). [rows]: the rows the
   * page was ranked with; missing ones are read now. Never throws; the
   * caller does not wait for it.
   */
  async logHomeServed(
    viewerId: string,
    ids: readonly string[],
    offset: number,
    assignment: Assignment | null,
    rows?: ReadonlyMap<string, Record<string, number>>,
  ): Promise<void> {
    try {
      const ev = this.rankingEvents;
      if (!ev || ids.length === 0) return;
      if (!(await ev.keepsImpressionsOf(viewerId))) return;
      const features = new Map<string, Record<string, number>>();
      const missing: string[] = [];
      for (const id of ids) {
        const r = rows?.get(id);
        if (r) features.set(id, r);
        else missing.push(id);
      }
      if (missing.length > 0) {
        const read = await this.homeFeedRows(viewerId, missing, assignment);
        for (const [id, r] of read.rows) features.set(id, r);
      }
      const model = this.isHomeModelArm(assignment);
      await ev.logList({
        userId: viewerId,
        surface: HOME_FEED_SURFACE,
        itemIds: ids,
        offset,
        assignment,
        formulaVersion:
          (model ? this.ranker?.formulaVersion() : null) ?? HOME_FEED_FORMULA,
        features: roundedFeatures(features),
      });
    } catch {
      // the log never hurts the feed
    }
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
  async casesFor(
    attorneyId: string,
    candidates: string[],
    filterKey: unknown,
  ): Promise<string[]> {
    if (candidates.length === 0) return [];
    const variant = await this.assignmentFor(attorneyId, 'case');
    return this.cached(
      `reco:cases:${attorneyId}:${hashOf(filterKey)}${variantSuffix(variant)}`,
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
        const w = await this.weights('case', CASE_WEIGHTS, variant);
        // R-401: cases of the topics this attorney answers questions in.
        const [mineQa, qaW] = await Promise.all([
          this.qaSnapshot?.attorneyScores([attorneyId]) ??
            new Map<string, QaAttorneyEntry>(),
          this.settings?.number('reco.case.qaTopic') ?? QA_CASE_BOOST,
        ]);
        const myQa = mineQa.get(attorneyId);
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
            return {
              item: c,
              score:
                caseScore(c, viewer, now, w) +
                qaCaseBoost(myQa, c.categoryId, qaW),
            };
          },
        );
        // Owner 25.11: what the impression log keeps per case is exactly the
        // cases model's input (cases-features.ts: the formula's 0..1
        // features and «offer already made»; nothing about who the client
        // is). The candidates were already cut by the hard filters
        // (state, licence, qualification) in SQL; the model only re-orders.
        const rankerRows = new Map(
          scored.map((x) => [
            x.item.id,
            caseRankerRow(
              caseFeatures(x.item, viewer, now),
              viewer.bidOn.has(x.item.id),
            ),
          ]),
        );
        await this.keepFeatures(
          attorneyId,
          'case',
          [...rankerRows.entries()],
          LISTING_TTL_SEC,
        );
        const learned = this.caseRanker;
        const ranked =
          learned && this.modelArm('case', variant)
            ? await this.rerank(learned, scored, rankerRows)
            : scored;
        return diversify(ranked, {
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
      -- Perf guard 2026-11-08: a LATERAL lookup of the owner keeps the
      -- groups in the order of their index (chat_groups_discover_*), so
      -- the LIMIT stops after a page; a plain join hashed every owner row
      -- of every group first (a full scan of chat_group_members at 10M).
      CROSS JOIN LATERAL (SELECT o.user_id FROM chat_group_members o
        WHERE o.group_id = g.id AND o.role = 'owner' AND o.left_at IS NULL
        LIMIT 1) own
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
    // Caching round 2 (S2-6): the shared helper (single-flight, lease, jitter).
    return cached<string[]>(this.redis, key, { ttlSec }, load);
  }
}

export function postKind(videoAssetId: string | null, media: number): PostKind {
  if (videoAssetId) return 'reel';
  return media > 0 ? 'photo' : 'brief';
}

/** What a post candidate of the posts formula is read with. */
const POST_CANDIDATE_SELECT = {
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
  _count: { select: { media: true } },
} satisfies Prisma.PostSelect;
// Each read adds `practice_area: { select: { id, parent_id } }` itself, so
// the cross-family include guard sees it (a spread hides a relation).

type PostCandidateRow = Prisma.PostGetPayload<{
  select: typeof POST_CANDIDATE_SELECT & {
    practice_area: { select: { id: true; parent_id: true } };
  };
}>;

function toPostCandidate(r: PostCandidateRow): PostCandidate {
  return {
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
  };
}

/** The events log's rounding (1e-4), as keepFeatures applies it. */
function roundedFeatures(
  rows: ReadonlyMap<string, Record<string, number>>,
): Map<string, Record<string, number>> {
  return new Map(
    [...rows].map(([id, f]) => [
      id,
      Object.fromEntries(
        Object.entries(f).map(([k, v]) => [k, Math.round(v * 1e4) / 1e4]),
      ),
    ]),
  );
}

/** Owner 25.11: the home feed (Feed → «Посты») in the ranking events log. */
export const HOME_FEED_SURFACE = 'home_feed';
/** Its list as today (followed + own newest first, recommendations mixed in). */
export const HOME_FEED_FORMULA = 'home-2026-11';

/** Short stable key of a filter object (cache keys never hold raw text). */
export function hashOf(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value ?? null))
    .digest('base64url')
    .slice(0, 22);
}

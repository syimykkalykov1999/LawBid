import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  POST_EVENTS_BATCH_MAX,
  type PostEventItemDto,
  type PostInsightsCountsDto,
  type PostInsightsDayDto,
  type PostInsightsDto,
} from './dto/post-insights.dto';
import { PostEventsService } from './post-events.service';
import { VISIBLE_POST_WHERE } from './post-presenter.service';
import { postNotFound } from './posts.service';

/** The series covers this many local days at most (today included). */
export const POST_INSIGHTS_DAYS = 30;

const DAY_MS = 86_400_000;

type Metric = keyof PostInsightsCountsDto;

const zero = (): PostInsightsCountsDto => ({
  impressions: 0,
  reach: 0,
  views: 0,
  likes: 0,
  comments: 0,
  saves: 0,
  reposts: 0,
  shares: 0,
  profileVisits: 0,
});

/** YYYY-MM-DD of a UTC-shifted instant. */
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Owner 2026-10-18 (Instagram Insights): one post's numbers for its author
 * only — an assistant with the "posts" duty acts for the attorney (the
 * guard swaps in the attorney); anyone else gets 404, as if there were no
 * such post. Impressions, reach, video views and profile visits come from
 * post_view_events; likes, comments, saves, reposts and shares from their
 * own tables. Totals are all time; the series is per local day.
 */
@Injectable()
export class PostInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PostEventsService,
  ) {}

  /** POST /posts/events: unknown / hidden posts are skipped silently; an
   * assistant's browsing is not the public's, so it is not recorded. */
  async record(user: RequestUser, items: PostEventItemDto[]): Promise<void> {
    if (user.assistant) return;
    const unique = new Map<string, PostEventItemDto>();
    for (const e of items.slice(0, POST_EVENTS_BATCH_MAX)) {
      unique.set(`${e.postId}:${e.kind}`, e);
    }
    const ids = [...new Set([...unique.values()].map((e) => e.postId))];
    const posts = await this.prisma.post.findMany({
      where: { id: { in: ids }, ...VISIBLE_POST_WHERE },
      select: { id: true, author_id: true },
    });
    const authorOf = new Map(posts.map((p) => [p.id, p.author_id]));
    for (const e of unique.values()) {
      const authorId = authorOf.get(e.postId);
      if (!authorId || authorId === user.sub) continue;
      await this.events.record({
        postId: e.postId,
        authorId,
        viewerId: user.sub,
        kind: e.kind,
      });
    }
  }

  async insights(
    user: RequestUser,
    postId: string,
    tzOffsetMinutes = 0,
  ): Promise<PostInsightsDto> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deleted_at: null },
      select: { id: true, author_id: true, created_at: true },
    });
    if (!post || post.author_id !== user.sub) throw postNotFound();

    const off = tzOffsetMinutes * 60_000;
    const localDay = (ms: number) => Math.floor((ms + off) / DAY_MS) * DAY_MS;
    const today = localDay(Date.now());
    const first = Math.max(
      today - (POST_INSIGHTS_DAYS - 1) * DAY_MS,
      localDay(post.created_at.getTime()),
    );
    // The first local midnight, as a UTC instant.
    const since = new Date(first - off);

    const [totalsRow] = await this.prisma.$queryRaw<
      {
        impressions: number;
        views: number;
        profile_visits: number;
        reach_known: number;
        reach_anon: number;
        reach_followers: number;
        likes: number;
        comments: number;
        saves: number;
        reposts: number;
        shares: number;
      }[]
    >`
      WITH reached AS (
        SELECT DISTINCT viewer_id FROM post_view_events
        WHERE post_id = ${postId}::UUID AND viewer_id IS NOT NULL
          AND kind IN ('impression', 'view')
      )
      SELECT
        (SELECT count(*)::INT FROM post_view_events
          WHERE post_id = ${postId}::UUID AND kind = 'impression') AS impressions,
        (SELECT count(*)::INT FROM post_view_events
          WHERE post_id = ${postId}::UUID AND kind = 'view') AS views,
        (SELECT count(*)::INT FROM post_view_events
          WHERE post_id = ${postId}::UUID AND kind = 'profile_visit') AS profile_visits,
        (SELECT count(*)::INT FROM reached) AS reach_known,
        (SELECT count(*)::INT FROM post_view_events
          WHERE post_id = ${postId}::UUID AND viewer_id IS NULL
            AND kind IN ('impression', 'view')) AS reach_anon,
        (SELECT count(*)::INT FROM reached r
          JOIN follows f ON f.follower_id = r.viewer_id
            AND f.followee_id = ${post.author_id}::UUID) AS reach_followers,
        (SELECT count(*)::INT FROM post_likes
          WHERE post_id = ${postId}::UUID) AS likes,
        (SELECT count(*)::INT FROM comments
          WHERE post_id = ${postId}::UUID AND deleted_at IS NULL
            AND status = 'published') AS comments,
        (SELECT count(*)::INT FROM saved_items
          WHERE item_type = 'post' AND item_id = ${postId}::UUID) AS saves,
        (SELECT count(*)::INT FROM post_reposts
          WHERE post_id = ${postId}::UUID) AS reposts,
        (SELECT count(*)::INT FROM post_shares
          WHERE post_id = ${postId}::UUID) AS shares`;

    const rows = await this.prisma.$queryRaw<
      { src: Metric; d: string; n: number }[]
    >`
      WITH ev AS (
        SELECT to_char((created_at AT TIME ZONE 'UTC')
                 + make_interval(mins => ${tzOffsetMinutes}::INT), 'YYYY-MM-DD') AS d,
               kind, viewer_id
        FROM post_view_events
        WHERE post_id = ${postId}::UUID
          AND kind IN ('impression', 'view', 'profile_visit')
          AND created_at >= ${since}
      ),
      other AS (
        SELECT 'likes' AS src, created_at FROM post_likes
          WHERE post_id = ${postId}::UUID AND created_at >= ${since}
        UNION ALL
        SELECT 'comments', created_at FROM comments
          WHERE post_id = ${postId}::UUID AND created_at >= ${since}
            AND deleted_at IS NULL AND status = 'published'
        UNION ALL
        SELECT 'saves', created_at FROM saved_items
          WHERE item_type = 'post' AND item_id = ${postId}::UUID
            AND created_at >= ${since}
        UNION ALL
        SELECT 'reposts', created_at FROM post_reposts
          WHERE post_id = ${postId}::UUID AND created_at >= ${since}
        UNION ALL
        SELECT 'shares', created_at FROM post_shares
          WHERE post_id = ${postId}::UUID AND created_at >= ${since}
      )
      SELECT CASE kind WHEN 'impression' THEN 'impressions'
                       WHEN 'view' THEN 'views'
                       ELSE 'profileVisits' END AS src,
             d, count(*)::INT AS n
      FROM ev GROUP BY 1, 2
      UNION ALL
      SELECT 'reach', d,
             (count(DISTINCT viewer_id) + count(*) FILTER (WHERE viewer_id IS NULL))::INT
      FROM ev WHERE kind IN ('impression', 'view') GROUP BY 2
      UNION ALL
      SELECT src,
             to_char((created_at AT TIME ZONE 'UTC')
               + make_interval(mins => ${tzOffsetMinutes}::INT), 'YYYY-MM-DD'),
             count(*)::INT
      FROM other GROUP BY 1, 2`;

    const days: PostInsightsDayDto[] = [];
    const byDate = new Map<string, PostInsightsDayDto>();
    for (let t = first; t <= today; t += DAY_MS) {
      const day = { date: ymd(t), ...zero() };
      days.push(day);
      byDate.set(day.date, day);
    }
    for (const r of rows) {
      const day = byDate.get(r.d);
      if (day) day[r.src] = r.n;
    }

    const t = totalsRow;
    const reach = t.reach_known + t.reach_anon;
    const totals: PostInsightsCountsDto = {
      impressions: t.impressions,
      reach,
      views: t.views,
      likes: t.likes,
      comments: t.comments,
      saves: t.saves,
      reposts: t.reposts,
      shares: t.shares,
      profileVisits: t.profile_visits,
    };
    return {
      postId: post.id,
      publishedAt: post.created_at.toISOString(),
      totals,
      interactions: t.likes + t.comments + t.saves + t.reposts + t.shares,
      reachFollowers: t.reach_followers,
      reachNonFollowers: reach - t.reach_followers,
      days,
    };
  }
}

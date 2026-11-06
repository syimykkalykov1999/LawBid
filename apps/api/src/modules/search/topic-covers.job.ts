import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { TOPIC_COVERS_KEY } from './search.provider';

/** Only posts of the last 90 days compete for a topic's cover. */
const WINDOW_DAYS = 90;
/** Outlives several nightly runs, so a missed run never drops the covers. */
const TTL_SEC = 3 * 24 * 3600;

/** Snapshot row: the post whose media is the topic's cover. */
export interface TopicCover {
  postId: string;
}

/** tag_lower → cover post (the whole snapshot is one small JSON in Redis). */
export type TopicCoversSnapshot = Record<string, TopicCover>;

/**
 * Owner 2026-11-04 (R-406): a topic made by people's hashtags has no picture
 * of its own — its cover is the photo (or the video frame) of its most
 * popular post of the last 90 days. "Popular" is likes + comments + views,
 * decayed by age (the same shape as the topic page's "Top", `topOfTag`).
 * Nightly, one query, one Redis JSON: tag → post id. The URL is resolved
 * when the list is served (signed links expire), from a short shared cache.
 */
@Injectable()
export class TopicCoversJob {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TopicCoversJob.name);
  }

  async run(now: Date = new Date()): Promise<{ topics: number }> {
    const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 3600 * 1000);
    const rows = await this.prisma.$queryRaw<{ tag: string; id: string }[]>`
      WITH scored AS (
        SELECT t.tag_lower AS tag, p.id::TEXT AS id,
          (p.like_count + 2 * p.comment_count + 0.1 * p.view_count)::FLOAT8
            / power(GREATEST(EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400, 0) + 2, 1.5)
            AS score,
          p.created_at
        FROM posts p
        JOIN post_tags pt ON pt.post_id = p.id
        JOIN tags t ON t.id = pt.tag_id
        LEFT JOIN video_assets va ON va.id = p.video_asset_id
        WHERE p.status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
          AND p.created_at > ${since}
          AND t.tag_lower NOT LIKE '~%'
          -- A cover is a picture: a photo post or a ready video.
          AND (va.status = 'ready'
               OR EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id))
          -- Only posts anyone can see (active, not deleted authors).
          AND EXISTS (SELECT 1 FROM users u WHERE u.id = p.author_id
                      AND u.status = 'active' AND u.deleted_at IS NULL)
      )
      SELECT DISTINCT ON (tag) tag, id FROM scored
      ORDER BY tag, score DESC, created_at DESC, id DESC`;
    const snapshot: TopicCoversSnapshot = {};
    for (const r of rows) snapshot[r.tag] = { postId: r.id };
    await this.redis.set(
      TOPIC_COVERS_KEY,
      JSON.stringify(snapshot),
      'EX',
      TTL_SEC,
    );
    this.logger.info({ topics: rows.length }, 'topic covers rebuilt');
    return { topics: rows.length };
  }
}

/** What a presented post (PostDto) shows of itself: its photos and video. */
export interface CoverSource {
  media: { previewUrl: string | null; url: string }[];
  video: { thumbnailUrl: string | null } | null;
}

/** The cover picture of a presented post: the video's frame, else the
 * first photo's small variant; null for a text-only post (the app shows
 * the topic's letter tile then). */
export function coverUrlOf(post: CoverSource | undefined): string | null {
  if (!post) return null;
  const first = post.media[0];
  return post.video?.thumbnailUrl ?? first?.previewUrl ?? first?.url ?? null;
}

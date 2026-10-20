import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CounterAggregator } from '../counters/counter-aggregator.service';

/** Owner 2026-10-18: what happened to a post, for its counters and the
 * author's statistics (Instagram Insights, author only). */
export const POST_EVENT_KINDS = [
  'view',
  'impression',
  'profile_visit',
] as const;
export type PostEventKind = (typeof POST_EVENT_KINDS)[number];

/** One event per viewer + post + kind in this window. */
export const POST_EVENT_DEDUPE_HOURS = 24;

/**
 * Owner 2026-10-18: the generic post events log (post_view_events). Any
 * code records an event through [record]; a repeat by the same viewer
 * within [POST_EVENT_DEDUPE_HOURS] adds nothing, the author's own events
 * are never recorded, and an anonymous event (viewerId null) always counts.
 * A recorded 'view' moves posts.view_count (the counter reconcile counts
 * the 'view' rows).
 */
@Injectable()
export class PostEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly counters: CounterAggregator,
  ) {}

  /** Returns true when a new event row was written. */
  async record(input: {
    postId: string;
    authorId: string;
    viewerId: string | null;
    kind: PostEventKind;
  }): Promise<boolean> {
    const { postId, authorId, viewerId, kind } = input;
    if (viewerId !== null && viewerId === authorId) return false;
    let inserted: number;
    if (viewerId === null) {
      await this.prisma.postViewEvent.create({
        data: { post_id: postId, viewer_id: null, kind },
      });
      inserted = 1;
    } else {
      // One writer per viewer + post + kind at a time (a double tap or two
      // devices must not both pass the "none in 24 h" check).
      inserted = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(
          hashtextextended(${`${postId}:${viewerId}:${kind}`}, 0))`;
        return tx.$executeRaw`
          INSERT INTO post_view_events (post_id, viewer_id, kind)
          SELECT ${postId}::UUID, ${viewerId}::UUID, ${kind}
          WHERE NOT EXISTS (
            SELECT 1 FROM post_view_events
            WHERE post_id = ${postId}::UUID AND viewer_id = ${viewerId}::UUID
              AND kind = ${kind}
              AND created_at > now() - make_interval(hours => ${POST_EVENT_DEDUPE_HOURS}::INT)
          )`;
      });
    }
    if (inserted > 0 && kind === 'view') {
      await this.counters.bump('post', postId, 'view_count', 1);
    }
    return inserted > 0;
  }
}

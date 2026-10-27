import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { imageFormatContext } from '../../modules/files/files.public';
import { weakEtag } from './cheap-etag';

/**
 * Owner 2026-10-25 (caching round 2, S2-12): version-stamp ETags.
 *
 * Express tags most JSON answers with a hash of the BODY, so the handler
 * still ran every query before a 304 could be sent: it saved bytes, not
 * database time. Here the tag is built BEFORE the handler from one indexed
 * read of the stamps that move when the answer moves (`updated_at`, the
 * counters, the viewer's own like / save / follow, ...), plus a short time
 * bucket (`cache.cheap_etag_sec`, default 60 s) as the safety net for
 * inputs outside those rows (a signed link, a counter delta not flushed
 * yet, a plan change). A matching `If-None-Match` is a 304 with no further
 * queries; a miss builds the body as before and sets the same tag.
 *
 * Every method returns null (= "no cheap tag, do the normal thing") when
 * the setting is 0, the thing does not exist, or its answer has side
 * effects that must keep running on every call.
 */
@Injectable()
export class VersionEtagService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  /** Bucket length in ms, or 0 when cheap tags are off. */
  private async bucketMs(): Promise<number> {
    const sec = this.settings
      ? await this.settings.number('cache.cheap_etag_sec')
      : 60;
    return sec > 0 ? sec * 1000 : 0;
  }

  private async tag(
    kind: string,
    parts: (string | number | Date | null | undefined)[],
  ): Promise<string | null> {
    const ms = await this.bucketMs();
    if (ms === 0) return null;
    return weakEtag(
      kind,
      ...parts,
      imageFormatContext.wantsAvif() ? 'a' : 'w',
      Math.floor(Date.now() / ms),
    );
  }

  /** GET /posts/:id for [viewerId]. */
  async post(viewerId: string, postId: string): Promise<string | null> {
    if ((await this.bucketMs()) === 0) return null;
    const rows = await this.prisma.$queryRaw<
      {
        updated_at: Date;
        status: string;
        like_count: number;
        comment_count: number;
        save_count: number;
        share_count: number;
        view_count: number;
        repost_count: number;
        author_updated_at: Date;
        liked: boolean;
        reposted: boolean;
        saved: boolean;
        following: boolean;
      }[]
    >`
      SELECT p.updated_at, p.status::TEXT AS status, p.like_count,
             p.comment_count, p.save_count, p.share_count, p.view_count,
             (SELECT COUNT(*)::INT FROM post_reposts rc
               WHERE rc.post_id = p.id) AS repost_count,
             u.updated_at AS author_updated_at,
             EXISTS (SELECT 1 FROM post_likes l
                      WHERE l.post_id = p.id
                        AND l.user_id = ${viewerId}::UUID) AS liked,
             EXISTS (SELECT 1 FROM post_reposts r
                      WHERE r.post_id = p.id
                        AND r.user_id = ${viewerId}::UUID) AS reposted,
             EXISTS (SELECT 1 FROM saved_items s
                      WHERE s.user_id = ${viewerId}::UUID
                        AND s.item_type::TEXT = 'post'
                        AND s.item_id = p.id) AS saved,
             EXISTS (SELECT 1 FROM follows f
                      WHERE f.follower_id = ${viewerId}::UUID
                        AND f.followee_id = p.author_id) AS following
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.id = ${postId}::UUID AND p.deleted_at IS NULL
      LIMIT 1`;
    const r = rows[0];
    // A video still being processed is settled by the author's polling
    // (PostsService.get): that call must really run.
    if (!r || r.status === 'processing') return null;
    return this.tag('post', [
      r.updated_at,
      r.status,
      r.like_count,
      r.comment_count,
      r.save_count,
      r.share_count,
      r.view_count,
      r.repost_count,
      r.author_updated_at,
      r.liked ? 1 : 0,
      r.reposted ? 1 : 0,
      r.saved ? 1 : 0,
      r.following ? 1 : 0,
    ]);
  }

  /** GET /cases/:id (attorney view) and GET /users/me/cases/:id (owner
   * view) — the caller checks access before answering 304. */
  async caseDetail(
    viewerId: string,
    caseId: string,
    view: 'attorney' | 'owner',
  ): Promise<string | null> {
    if ((await this.bucketMs()) === 0) return null;
    const rows = await this.prisma.$queryRaw<
      {
        updated_at: Date;
        status: string;
        bids_count: number;
        comment_count: number;
        share_count: number;
        last_activity_at: Date;
        paused_at: Date | null;
        saved: boolean;
        bid_id: string | null;
        bid_status: string | null;
        bid_updated_at: Date | null;
      }[]
    >`
      SELECT c.updated_at, c.status::TEXT AS status, c.bids_count,
             c.comment_count, c.share_count, c.last_activity_at, c.paused_at,
             EXISTS (SELECT 1 FROM saved_items s
                      WHERE s.user_id = ${viewerId}::UUID
                        AND s.item_type::TEXT = 'case'
                        AND s.item_id = c.id) AS saved,
             b.id AS bid_id, b.status::TEXT AS bid_status,
             b.updated_at AS bid_updated_at
      FROM cases c
      LEFT JOIN bids b ON b.case_id = c.id AND b.attorney_id = ${viewerId}::UUID
      WHERE c.id = ${caseId}::UUID AND c.deleted_at IS NULL
      LIMIT 1`;
    const r = rows[0];
    if (!r) return null;
    return this.tag(`case-${view}`, [
      r.updated_at,
      r.status,
      r.bids_count,
      r.comment_count,
      r.share_count,
      r.last_activity_at,
      r.paused_at,
      r.saved ? 1 : 0,
      r.bid_id,
      r.bid_status,
      r.bid_updated_at,
    ]);
  }

  /** GET /conversations (no text search: that answer depends on message
   * contents). The viewer's own chats only. */
  async conversations(userId: string): Promise<string | null> {
    if ((await this.bucketMs()) === 0) return null;
    const rows = await this.prisma.$queryRaw<
      {
        newest: Date | null;
        chats: number;
        mine_updated: Date | null;
      }[]
    >`
      SELECT (SELECT MAX(c.updated_at) FROM conversations c
               WHERE c.client_id = ${userId}::UUID
                  OR c.attorney_id = ${userId}::UUID) AS newest,
             (SELECT COUNT(*)::INT FROM conversations c2
               WHERE (c2.client_id = ${userId}::UUID
                   OR c2.attorney_id = ${userId}::UUID)
                 AND c2.last_message_at IS NOT NULL) AS chats,
             (SELECT MAX(p.updated_at) FROM conversation_participants p
               WHERE p.user_id = ${userId}::UUID) AS mine_updated`;
    const r = rows[0];
    return this.tag('chats', [r?.newest, r?.chats, r?.mine_updated]);
  }

  /** GET /notifications (the viewer's own). */
  async notifications(userId: string): Promise<string | null> {
    if ((await this.bucketMs()) === 0) return null;
    const rows = await this.prisma.$queryRaw<
      { newest: Date | null; unread: number }[]
    >`
      SELECT MAX(n.updated_at) AS newest,
             COUNT(*) FILTER (WHERE n.read_at IS NULL)::INT AS unread
      FROM notifications n
      WHERE n.user_id = ${userId}::UUID`;
    const r = rows[0];
    return this.tag('notifs', [r?.newest, r?.unread]);
  }
}

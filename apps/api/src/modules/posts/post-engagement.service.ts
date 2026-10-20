import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FollowsService } from '../follows/follows.service';
import type { PeoplePage } from '../follows/follows.dto';
import {
  POSTS_PAGE_DEFAULT,
  type PostPage,
  type SavedPostItemDto,
} from './dto/posts.dto';
import { PostPresenter, VISIBLE_POST_WHERE } from './post-presenter.service';
import { postNotFound } from './posts.service';
import { assertNoBlock } from '../blocks/block-guard';
import { PostEventsService } from './post-events.service';

const REPOSTS_PAGE = 20;

/**
 * docs/05 §4 (stage 5.4): post likes and saves. Idempotent by the primary
 * keys (post_likes(post_id,user_id), saved_items(user,type,item)): a repeat
 * inserts nothing, so the counter and the notification only move when a row
 * really changed.
 */
@Injectable()
export class PostEngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: UsageLimitsService,
    private readonly counters: CounterAggregator,
    private readonly notifications: NotificationsService,
    private readonly presenter: PostPresenter,
    private readonly follows: FollowsService,
    private readonly events: PostEventsService,
  ) {}

  async like(userId: string, postId: string): Promise<void> {
    const post = await this.visible(postId);
    await assertNoBlock(this.prisma, userId, post.author_id);
    await this.limits.consume('like', userId);
    const { count } = await this.prisma.postLike.createMany({
      data: [{ post_id: postId, user_id: userId }],
      skipDuplicates: true,
    });
    if (count === 0) return;
    await this.counters.bump('post', postId, 'like_count', 1);
    if (post.author_id !== userId) {
      await this.notifications.emit({
        type: 'post_like',
        recipientId: post.author_id,
        payload: { postId, actorId: userId },
      });
    }
  }

  /** Owner 2026-10-07: a Threads-style repost. Idempotent by
   * post_reposts(user_id, post_id); the same checks as a like (visible
   * post, no block either way, the like rate limit). Not of one's own
   * post (409 REPOST_OWN_POST). */
  async repost(userId: string, postId: string): Promise<void> {
    const post = await this.visible(postId);
    if (post.author_id === userId) {
      throw new ConflictException({
        code: ErrorCode.REPOST_OWN_POST,
        message: 'You cannot repost your own post.',
      });
    }
    await assertNoBlock(this.prisma, userId, post.author_id);
    await this.limits.consume('like', userId);
    const { count } = await this.prisma.postRepost.createMany({
      data: [{ post_id: postId, user_id: userId }],
      skipDuplicates: true,
    });
    if (count === 0) return;
    await this.notifications.emit({
      type: 'post_repost',
      recipientId: post.author_id,
      payload: { postId, actorId: userId },
    });
  }

  async unrepost(userId: string, postId: string): Promise<void> {
    await this.prisma.postRepost.deleteMany({
      where: { post_id: postId, user_id: userId },
    });
  }

  /** Owner 2026-10-20: GET /posts/:id/likes — who liked a post (newest
   * first, avatar/name/follow state). When the author hid the counter only
   * the author sees the list; blocked people either way are left out. */
  async listLikers(
    viewerId: string,
    postId: string,
    cursor: string | undefined,
  ): Promise<PeoplePage> {
    const post = await this.visible(postId);
    await assertNoBlock(this.prisma, viewerId, post.author_id);
    if (post.hide_likes && post.author_id !== viewerId) {
      return { items: [], nextCursor: null };
    }
    const c = cursor ? decodeCursor(cursor) : undefined;
    const hidden = await this.blockedWith(viewerId);
    const rows = await this.prisma.postLike.findMany({
      where: {
        post_id: postId,
        user: { status: 'active', deleted_at: null },
        ...(hidden.length > 0 ? { user_id: { notIn: hidden } } : {}),
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, user_id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { user_id: 'desc' }],
      take: REPOSTS_PAGE + 1,
    });
    const page = rows.slice(0, REPOSTS_PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.follows.peopleByIds(
        page.map((r) => r.user_id),
        viewerId,
      ),
      nextCursor:
        rows.length > REPOSTS_PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.user_id })
          : null,
    };
  }

  /** Owner 2026-10-18: GET /posts/:id/reposts — who reposted a post
   * (newest first, avatar/name/follow state); blocked people either way
   * are left out. */
  async listReposters(
    viewerId: string,
    postId: string,
    cursor: string | undefined,
  ): Promise<PeoplePage> {
    const post = await this.visible(postId);
    await assertNoBlock(this.prisma, viewerId, post.author_id);
    const c = cursor ? decodeCursor(cursor) : undefined;
    const hidden = await this.blockedWith(viewerId);
    const rows = await this.prisma.postRepost.findMany({
      where: {
        post_id: postId,
        user: { status: 'active', deleted_at: null },
        ...(hidden.length > 0 ? { user_id: { notIn: hidden } } : {}),
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
      take: REPOSTS_PAGE + 1,
    });
    const page = rows.slice(0, REPOSTS_PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.follows.peopleByIds(
        page.map((r) => r.user_id),
        viewerId,
      ),
      nextCursor:
        rows.length > REPOSTS_PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** Owner 2026-10-18: GET /users/:id/reposts — the "Reposts" profile tab
   * of any user, newest repost first; each post carries the owner of the
   * tab as `repostedBy`. Deleted/hidden originals and authors blocked
   * either way never show. */
  async listUserReposts(
    viewerId: string,
    userId: string,
    cursor: string | undefined,
    limit = POSTS_PAGE_DEFAULT,
  ): Promise<PostPage> {
    const owner = await this.prisma.user.findFirst({
      where: { id: userId, status: 'active', deleted_at: null },
      select: { id: true },
    });
    if (!owner) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    if (userId !== viewerId) await assertNoBlock(this.prisma, viewerId, userId);
    const c = cursor ? decodeCursor(cursor) : undefined;
    const hidden = await this.blockedWith(viewerId);
    const rows = await this.prisma.postRepost.findMany({
      where: {
        user_id: userId,
        post: {
          AND: [
            VISIBLE_POST_WHERE,
            ...(hidden.length > 0 ? [{ author_id: { notIn: hidden } }] : []),
          ],
        },
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      include: { post: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const names = await this.presenter.reposterNames(
      page.length ? [userId] : [],
    );
    const who = names.get(userId);
    const reposters = new Map(
      who
        ? page.map(
            (r) =>
              [
                r.post_id,
                { ...who, repostedAt: r.created_at.toISOString() },
              ] as const,
          )
        : [],
    );
    return {
      items: await this.presenter.present(
        page.map((r) => r.post),
        viewerId,
        reposters,
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  private async blockedWith(userId: string): Promise<string[]> {
    const blocks = await this.prisma.userBlock.findMany({
      where: { OR: [{ blocker_id: userId }, { blocked_id: userId }] },
      select: { blocker_id: true, blocked_id: true },
    });
    return blocks.map((b) =>
      b.blocker_id === userId ? b.blocked_id : b.blocker_id,
    );
  }

  /** OQ-037: the share sheet was completed — counts every share. */
  async share(userId: string, postId: string): Promise<void> {
    await this.visible(postId);
    await this.limits.consume('like', userId);
    // Owner 2026-10-20: one share per user and post per 24 h counts.
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const already = await this.prisma.postShare.findFirst({
      where: { post_id: postId, user_id: userId, created_at: { gt: since } },
      select: { post_id: true },
    });
    if (already) return;
    await this.prisma.postShare.create({
      data: { post_id: postId, user_id: userId },
    });
    await this.counters.bump('post', postId, 'share_count', 1);
  }

  /** Owner 2026-10-12: a video post / reel was watched (a few seconds or a
   * tap); never the author's own. Owner 2026-10-18: counted once per viewer
   * per 24 h (post_view_events, PostEventsService); post_views keeps "who
   * has seen it" for the recommendations. */
  async view(userId: string, postId: string): Promise<void> {
    const post = await this.visible(postId);
    if (post.author_id === userId) return;
    await this.prisma.postView.createMany({
      data: [{ post_id: postId, user_id: userId }],
      skipDuplicates: true,
    });
    await this.events.record({
      postId,
      authorId: post.author_id,
      viewerId: userId,
      kind: 'view',
    });
  }

  async unlike(userId: string, postId: string): Promise<void> {
    const { count } = await this.prisma.postLike.deleteMany({
      where: { post_id: postId, user_id: userId },
    });
    if (count > 0) await this.counters.bump('post', postId, 'like_count', -1);
  }

  /** §4 "Сохранение поста" via /saved-items (item_type = post). */
  async save(userId: string, postId: string): Promise<void> {
    const post = await this.visible(postId);
    await assertNoBlock(this.prisma, userId, post.author_id);
    const { count } = await this.prisma.savedItem.createMany({
      data: [{ user_id: userId, item_type: 'post', item_id: postId }],
      skipDuplicates: true,
    });
    if (count > 0) await this.counters.bump('post', postId, 'save_count', 1);
  }

  async unsave(userId: string, postId: string): Promise<void> {
    const { count } = await this.prisma.savedItem.deleteMany({
      where: { user_id: userId, item_type: 'post', item_id: postId },
    });
    if (count > 0) await this.counters.bump('post', postId, 'save_count', -1);
  }

  /** GET /saved-items/posts — deleted/hidden posts come back as
   * "Пост недоступен" (available = false). */
  async listSaved(
    userId: string,
    cursor: string | undefined,
    limit = POSTS_PAGE_DEFAULT,
  ): Promise<{ items: SavedPostItemDto[]; nextCursor: string | null }> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.savedItem.findMany({
      where: {
        user_id: userId,
        item_type: 'post',
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, item_id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { item_id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const posts = await this.prisma.post.findMany({
      where: { ...VISIBLE_POST_WHERE, id: { in: page.map((r) => r.item_id) } },
    });
    const dtos = new Map(
      (await this.presenter.present(posts, userId)).map((p) => [p.id, p]),
    );
    const last = page[page.length - 1];
    return {
      items: page.map((r) => {
        const post = dtos.get(r.item_id) ?? null;
        return {
          postId: r.item_id,
          savedAt: r.created_at.toISOString(),
          available: post !== null,
          post,
        };
      }),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.item_id })
          : null,
    };
  }

  private async visible(postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { ...VISIBLE_POST_WHERE, id: postId },
      select: { id: true, author_id: true, hide_likes: true },
    });
    if (!post) throw postNotFound();
    return post;
  }
}

import { Injectable } from '@nestjs/common';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { NotificationsService } from '../notifications/notifications.service';
import { POSTS_PAGE_DEFAULT, type SavedPostItemDto } from './dto/posts.dto';
import { PostPresenter, VISIBLE_POST_WHERE } from './post-presenter.service';
import { postNotFound } from './posts.service';
import { assertNoBlock } from '../blocks/block-guard';

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

  /** OQ-037: the share sheet was completed — counts every share. */
  async share(userId: string, postId: string): Promise<void> {
    await this.visible(postId);
    await this.limits.consume('like', userId);
    await this.prisma.postShare.create({
      data: { post_id: postId, user_id: userId },
    });
    await this.counters.bump('post', postId, 'share_count', 1);
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
      select: { id: true, author_id: true },
    });
    if (!post) throw postNotFound();
    return post;
  }
}

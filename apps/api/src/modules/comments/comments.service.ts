import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Comment } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { MentionsService } from '../mentions/mentions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { FilesService } from '../files/files.service';
import {
  CONTENT_MODERATION_HOOK,
  type ContentModerationHook,
} from '../moderation/content-moderation.hook';
import { NotificationsService } from '../notifications/notifications.service';
import { VISIBLE_POST_WHERE } from '../posts/post-presenter.service';
import { postNotFound } from '../posts/posts.service';
import {
  COMMENTS_PAGE,
  type CommentDto,
  type CommentPage,
} from './comments.dto';
import { assertNoBlock } from '../blocks/block-guard';

function commentNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.COMMENT_NOT_FOUND,
    message: 'Comment not found.',
  });
}

/** §5.2 "Anna K." — first name + initial of the last name. */
export function clientDisplayName(
  first: string | null,
  last: string | null,
): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (!f && !l) return 'Client';
  return l ? `${f} ${l[0].toUpperCase()}.`.trim() : f;
}

const LIVE = { deleted_at: null, status: 'published' as const };

/**
 * docs/05 §5 (stage 5.4): comments and one level of replies, comment
 * likes, deletion by the author or by the post's author.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: UsageLimitsService,
    private readonly counters: CounterAggregator,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    @Inject(CONTENT_MODERATION_HOOK)
    private readonly moderation: ContentModerationHook,
    private readonly mentions: MentionsService,
  ) {}

  async create(
    userId: string,
    postId: string,
    body: string,
    parentCommentId?: string,
  ): Promise<CommentDto> {
    const post = await this.prisma.post.findFirst({
      where: { ...VISIBLE_POST_WHERE, id: postId },
      select: { id: true, author_id: true },
    });
    if (!post) throw postNotFound();
    await assertNoBlock(this.prisma, userId, post.author_id);
    await this.limits.consume('comment', userId);
    const verdict = await this.moderation.check(body, {
      kind: 'comment',
      authorId: userId,
    });
    if (verdict === 'block') {
      throw new UnprocessableEntityException({
        code: ErrorCode.CONTENT_BLOCKED,
        message: 'This content cannot be published.',
      });
    }

    // §5.1: one level — a reply to a reply attaches to the top-level parent,
    // with "@username" of the person answered put in front of the text.
    let parent: Comment | null = null;
    let text = body;
    let replyTo: Comment | null = null;
    if (parentCommentId) {
      replyTo = await this.prisma.comment.findFirst({
        where: { id: parentCommentId, post_id: postId, ...LIVE },
      });
      if (!replyTo) throw commentNotFound();
      await assertNoBlock(this.prisma, userId, replyTo.author_id);
      parent = replyTo.parent_comment_id
        ? await this.prisma.comment.findFirst({
            where: { id: replyTo.parent_comment_id, ...LIVE },
          })
        : replyTo;
      if (!parent) throw commentNotFound();
      if (replyTo.id !== parent.id) {
        const handle = await this.handleOf(replyTo.author_id);
        if (handle && !text.startsWith(`@${handle}`))
          text = `@${handle} ${text}`;
      }
    }

    const created = await this.prisma.comment.create({
      data: {
        post_id: postId,
        author_id: userId,
        parent_comment_id: parent?.id ?? null,
        body: text.slice(0, 1000),
        status: verdict === 'hold' ? 'hidden' : 'published',
      },
    });
    if (created.status === 'published') {
      await this.counters.bump('post', postId, 'comment_count', 1);
      if (parent)
        await this.counters.bump('comment', parent.id, 'reply_count', 1);
      // OQ-042: people @mentioned in the comment (the post author already
      // gets post_comment; a replied-to person gets comment_reply).
      await this.mentions.notify({
        actorId: userId,
        text: created.body,
        postId,
        commentId: created.id,
        skip: [post.author_id, ...(replyTo ? [replyTo.author_id] : [])],
      });
      if (post.author_id !== userId) {
        await this.notifications.emit({
          type: 'post_comment',
          recipientId: post.author_id,
          payload: { postId, commentId: created.id, actorId: userId },
        });
      }
      if (replyTo && replyTo.author_id !== userId) {
        await this.notifications.emit({
          type: 'comment_reply',
          recipientId: replyTo.author_id,
          payload: { postId, commentId: created.id, actorId: userId },
        });
      }
    }
    return (await this.present([created], userId, post.author_id))[0];
  }

  /** GET /posts/:id/comments — top level, newest first. */
  async list(
    userId: string,
    postId: string,
    cursor?: string,
  ): Promise<CommentPage> {
    const post = await this.prisma.post.findFirst({
      where: { ...VISIBLE_POST_WHERE, id: postId },
      select: { author_id: true },
    });
    if (!post) throw postNotFound();
    return this.page(
      userId,
      post.author_id,
      { post_id: postId, parent_comment_id: null },
      cursor,
    );
  }

  /** GET /comments/:id/replies. */
  async replies(
    userId: string,
    commentId: string,
    cursor?: string,
  ): Promise<CommentPage> {
    const parent = await this.prisma.comment.findFirst({
      where: { id: commentId, ...LIVE, post: VISIBLE_POST_WHERE },
      select: { id: true, post: { select: { author_id: true } } },
    });
    if (!parent) throw commentNotFound();
    return this.page(
      userId,
      parent.post.author_id,
      { parent_comment_id: commentId },
      cursor,
    );
  }

  /** DELETE /comments/:id — the author, or the author of the post. A
   * top-level comment takes its replies with it (§5.1). */
  async remove(userId: string, commentId: string): Promise<{ deleted: true }> {
    const c = await this.prisma.comment.findFirst({
      where: { id: commentId, deleted_at: null },
      select: {
        id: true,
        author_id: true,
        post_id: true,
        parent_comment_id: true,
        status: true,
        post: { select: { author_id: true } },
      },
    });
    if (!c || (c.author_id !== userId && c.post.author_id !== userId)) {
      throw commentNotFound();
    }
    const now = new Date();
    const removedReplies = await withTxRetry(this.prisma, async (tx) => {
      await tx.comment.update({
        where: { id: c.id },
        data: { deleted_at: now },
      });
      if (c.parent_comment_id) return 0;
      // Audit 2026-10-01: every reply goes with its comment — held ones
      // too (a later "publish" would count an orphan); only the published
      // ones were in the counter.
      const counted = await tx.comment.count({
        where: { parent_comment_id: c.id, ...LIVE },
      });
      await tx.comment.updateMany({
        where: { parent_comment_id: c.id, deleted_at: null },
        data: { deleted_at: now },
      });
      return counted;
    });
    const gone = (c.status === 'published' ? 1 : 0) + removedReplies;
    if (gone > 0) {
      await this.counters.bump('post', c.post_id, 'comment_count', -gone);
    }
    if (c.status === 'published') {
      if (c.parent_comment_id) {
        await this.counters.bump(
          'comment',
          c.parent_comment_id,
          'reply_count',
          -1,
        );
      }
    }
    return { deleted: true };
  }

  async like(userId: string, commentId: string): Promise<void> {
    const c = await this.prisma.comment.findFirst({
      where: { id: commentId, ...LIVE, post: VISIBLE_POST_WHERE },
      select: { id: true, author_id: true, post_id: true },
    });
    if (!c) throw commentNotFound();
    await assertNoBlock(this.prisma, userId, c.author_id);
    await this.limits.consume('like', userId);
    const { count } = await this.prisma.commentLike.createMany({
      data: [{ comment_id: commentId, user_id: userId }],
      skipDuplicates: true,
    });
    if (count === 0) return;
    await this.counters.bump('comment', commentId, 'like_count', 1);
    if (c.author_id !== userId) {
      await this.notifications.emit({
        type: 'comment_like',
        recipientId: c.author_id,
        payload: { postId: c.post_id, commentId, actorId: userId },
      });
    }
  }

  async unlike(userId: string, commentId: string): Promise<void> {
    const { count } = await this.prisma.commentLike.deleteMany({
      where: { comment_id: commentId, user_id: userId },
    });
    if (count > 0)
      await this.counters.bump('comment', commentId, 'like_count', -1);
  }

  private async page(
    userId: string,
    postAuthorId: string,
    where: { post_id?: string; parent_comment_id: string | null },
    cursor?: string,
  ): Promise<CommentPage> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    // Audit 2026-10-01: comments of deleted / suspended accounts and of
    // people blocked either way are not shown.
    const blocks = await this.prisma.userBlock.findMany({
      where: { OR: [{ blocker_id: userId }, { blocked_id: userId }] },
      select: { blocker_id: true, blocked_id: true },
      take: 5000,
    });
    const hidden = [
      ...new Set(
        blocks.map((b) =>
          b.blocker_id === userId ? b.blocked_id : b.blocker_id,
        ),
      ),
    ];
    const rows = await this.prisma.comment.findMany({
      where: {
        ...where,
        ...LIVE,
        author: { status: 'active' },
        ...(hidden.length ? { author_id: { notIn: hidden } } : {}),
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
      take: COMMENTS_PAGE + 1,
    });
    const page = rows.slice(0, COMMENTS_PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.present(page, userId, postAuthorId),
      nextCursor:
        rows.length > COMMENTS_PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  private async present(
    rows: Comment[],
    viewerId: string,
    postAuthorId: string,
  ): Promise<CommentDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [authors, likes, pLikes, pReplies] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.author_id))] } },
        select: {
          id: true,
          role: true,
          first_name: true,
          last_name: true,
          avatar_file_id: true,
          attorney_profile: {
            select: {
              username: true,
              verification_status: true,
              name_mismatch: true,
              licenses: {
                where: { license_status: 'verified' },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.commentLike.findMany({
        where: { comment_id: { in: ids }, user_id: viewerId },
        select: { comment_id: true },
      }),
      this.counters.pending('comment', 'like_count', ids),
      this.counters.pending('comment', 'reply_count', ids),
    ]);
    const byId = new Map(authors.map((a) => [a.id, a]));
    const attorneys = authors.filter((a) => a.role === 'attorney');
    const files = await this.files.avatarUrlsMany(
      attorneys.map((a) => a.avatar_file_id),
    );
    const avatar = new Map<string, string | null>(
      attorneys.map((a) => [
        a.id,
        a.avatar_file_id ? (files.get(a.avatar_file_id)?.url256 ?? null) : null,
      ]),
    );
    const liked = new Set(likes.map((l) => l.comment_id));
    const mentioned = await this.mentions.resolve(rows.map((r) => r.body));
    return rows.map((r) => {
      const a = byId.get(r.author_id);
      const attorney = a?.role === 'attorney' && a.attorney_profile;
      const prof = a?.attorney_profile;
      return {
        id: r.id,
        postId: r.post_id,
        parentCommentId: r.parent_comment_id,
        author: attorney
          ? {
              kind: 'attorney' as const,
              attorneyId: r.author_id,
              username: prof?.username ?? null,
              displayName:
                [a.first_name, a.last_name].filter(Boolean).join(' ') ||
                `@${prof?.username ?? ''}`,
              avatarUrl: avatar.get(r.author_id) ?? null,
              verifiedBadge:
                prof?.verification_status === 'verified' &&
                !prof.name_mismatch &&
                (prof.licenses.length ?? 0) > 0,
            }
          : {
              kind: 'client' as const,
              attorneyId: null,
              username: null,
              displayName: clientDisplayName(
                a?.first_name ?? null,
                a?.last_name ?? null,
              ),
              avatarUrl: null,
              verifiedBadge: false,
            },
        body: r.body,
        mentions: this.mentions.pick(r.body, mentioned),
        likeCount: Math.max(0, r.like_count + (pLikes.get(r.id) ?? 0)),
        replyCount: Math.max(0, r.reply_count + (pReplies.get(r.id) ?? 0)),
        likedByMe: liked.has(r.id),
        canDelete: r.author_id === viewerId || postAuthorId === viewerId,
        isMine: r.author_id === viewerId,
        createdAt: r.created_at.toISOString(),
      };
    });
  }

  private async handleOf(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        first_name: true,
        last_name: true,
        attorney_profile: { select: { username: true } },
      },
    });
    if (!u) return null;
    return (
      u.attorney_profile?.username ??
      clientDisplayName(u.first_name, u.last_name).replace(/\s+/g, '')
    );
  }
}

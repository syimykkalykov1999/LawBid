import { assertNoBlockBetween } from '../blocks/block-check';
import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { CaseComment } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { assertNoContactInfo } from '../cases/domain/contact-detector';
import { CaseAccessPolicy } from '../cases/policies/case-access.policy';
import { COMMENTS_PAGE } from '../comments/comments.dto';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { FilesService } from '../files/files.service';
import {
  CONTENT_MODERATION_HOOK,
  type ContentModerationHook,
} from '../moderation/content-moderation.hook';
import { NotificationsService } from '../notifications/notifications.service';
import type { CaseCommentDto, CaseCommentPage } from './case-comments.dto';

function commentNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.COMMENT_NOT_FOUND,
    message: 'Comment not found.',
  });
}

const LIVE = { deleted_at: null, status: 'published' as const };

/**
 * Owner 2026-09-30 (OQ-034): comments under a case, built like post
 * comments (docs/05 §5): one reply level, comment likes, deletion by the
 * author or the case owner, moderation, reports, notifications. Only the
 * case owner and attorneys CaseAccessPolicy lets see the case read or
 * write them; contact details are refused (the platform shares contacts
 * only after a bid is accepted, docs/04 §7).
 */
@Injectable()
export class CaseCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CaseAccessPolicy,
    private readonly limits: UsageLimitsService,
    private readonly counters: CounterAggregator,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    @Inject(CONTENT_MODERATION_HOOK)
    private readonly moderation: ContentModerationHook,
  ) {}

  /** Access check; returns the case owner's id. */
  private async caseOwner(user: RequestUser, caseId: string): Promise<string> {
    await this.access.assertCanView(
      { userId: user.sub, role: user.role ?? null },
      caseId,
    );
    const c = await this.prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { client_id: true },
    });
    return c.client_id;
  }

  async create(
    user: RequestUser,
    caseId: string,
    body: string,
    parentCommentId?: string,
  ): Promise<CaseCommentDto> {
    const userId = user.sub;
    const ownerId = await this.caseOwner(user, caseId);
    // Owner 2026-10-02: no comments across a block with the case owner.
    await assertNoBlockBetween(this.prisma, userId, ownerId);
    assertNoContactInfo({ body });
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

    let parent: CaseComment | null = null;
    let replyTo: CaseComment | null = null;
    if (parentCommentId) {
      replyTo = await this.prisma.caseComment.findFirst({
        where: { id: parentCommentId, case_id: caseId, ...LIVE },
      });
      if (!replyTo) throw commentNotFound();
      parent = replyTo.parent_comment_id
        ? await this.prisma.caseComment.findFirst({
            where: { id: replyTo.parent_comment_id, ...LIVE },
          })
        : replyTo;
      if (!parent) throw commentNotFound();
    }

    const created = await this.prisma.caseComment.create({
      data: {
        case_id: caseId,
        author_id: userId,
        parent_comment_id: parent?.id ?? null,
        body: body.slice(0, 1000),
        status: verdict === 'hold' ? 'hidden' : 'published',
      },
    });
    if (created.status === 'published') {
      await this.counters.bump('case', caseId, 'comment_count', 1);
      if (parent) {
        await this.counters.bump('case_comment', parent.id, 'reply_count', 1);
      }
      if (ownerId !== userId) {
        await this.notifications.emit({
          type: 'case_comment',
          recipientId: ownerId,
          payload: { caseId, commentId: created.id, actorId: userId },
        });
      }
      if (
        replyTo &&
        replyTo.author_id !== userId &&
        replyTo.author_id !== ownerId
      ) {
        await this.notifications.emit({
          type: 'comment_reply',
          recipientId: replyTo.author_id,
          payload: { caseId, commentId: created.id, actorId: userId },
        });
      }
    }
    return (await this.present([created], userId, ownerId))[0];
  }

  /** GET /cases/:id/comments — top level, newest first. */
  async list(
    user: RequestUser,
    caseId: string,
    cursor?: string,
  ): Promise<CaseCommentPage> {
    const ownerId = await this.caseOwner(user, caseId);
    return this.page(
      user.sub,
      ownerId,
      { case_id: caseId, parent_comment_id: null },
      cursor,
    );
  }

  /** GET /case-comments/:id/replies. */
  async replies(
    user: RequestUser,
    commentId: string,
    cursor?: string,
  ): Promise<CaseCommentPage> {
    const parent = await this.prisma.caseComment.findFirst({
      where: { id: commentId, ...LIVE },
      select: { case_id: true },
    });
    if (!parent) throw commentNotFound();
    const ownerId = await this.caseOwner(user, parent.case_id);
    return this.page(
      user.sub,
      ownerId,
      { parent_comment_id: commentId },
      cursor,
    );
  }

  /** DELETE /case-comments/:id — the author or the case owner; a
   * top-level comment takes its replies with it. */
  async remove(
    user: RequestUser,
    commentId: string,
  ): Promise<{ deleted: true }> {
    const c = await this.prisma.caseComment.findFirst({
      where: { id: commentId, deleted_at: null },
      select: {
        id: true,
        author_id: true,
        case_id: true,
        parent_comment_id: true,
        status: true,
        case: { select: { client_id: true } },
      },
    });
    if (!c || (c.author_id !== user.sub && c.case.client_id !== user.sub)) {
      throw commentNotFound();
    }
    const now = new Date();
    const removedReplies = await withTxRetry(this.prisma, async (tx) => {
      await tx.caseComment.update({
        where: { id: c.id },
        data: { deleted_at: now },
      });
      if (c.parent_comment_id) return 0;
      const r = await tx.caseComment.updateMany({
        where: { parent_comment_id: c.id, ...LIVE },
        data: { deleted_at: now },
      });
      return r.count;
    });
    if (c.status === 'published') {
      await this.counters.bump(
        'case',
        c.case_id,
        'comment_count',
        -(1 + removedReplies),
      );
      if (c.parent_comment_id) {
        await this.counters.bump(
          'case_comment',
          c.parent_comment_id,
          'reply_count',
          -1,
        );
      }
    }
    return { deleted: true };
  }

  async like(user: RequestUser, commentId: string): Promise<void> {
    const c = await this.prisma.caseComment.findFirst({
      where: { id: commentId, ...LIVE },
      select: { id: true, author_id: true, case_id: true },
    });
    if (!c) throw commentNotFound();
    await this.caseOwner(user, c.case_id);
    await this.limits.consume('like', user.sub);
    const { count } = await this.prisma.caseCommentLike.createMany({
      data: [{ comment_id: commentId, user_id: user.sub }],
      skipDuplicates: true,
    });
    if (count === 0) return;
    await this.counters.bump('case_comment', commentId, 'like_count', 1);
    if (c.author_id !== user.sub) {
      await this.notifications.emit({
        type: 'comment_like',
        recipientId: c.author_id,
        payload: { caseId: c.case_id, commentId, actorId: user.sub },
      });
    }
  }

  /** OQ-037: a completed share of the case link (anyone who can see it). */
  async shareCase(user: RequestUser, caseId: string): Promise<void> {
    await this.caseOwner(user, caseId);
    await this.limits.consume('like', user.sub);
    await this.prisma.caseShare.create({
      data: { case_id: caseId, user_id: user.sub },
    });
    await this.counters.bump('case', caseId, 'share_count', 1);
  }

  async unlike(user: RequestUser, commentId: string): Promise<void> {
    const { count } = await this.prisma.caseCommentLike.deleteMany({
      where: { comment_id: commentId, user_id: user.sub },
    });
    if (count > 0) {
      await this.counters.bump('case_comment', commentId, 'like_count', -1);
    }
  }

  private async page(
    viewerId: string,
    ownerId: string,
    where: { case_id?: string; parent_comment_id: string | null },
    cursor?: string,
  ): Promise<CaseCommentPage> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.caseComment.findMany({
      where: {
        ...where,
        ...LIVE,
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
      items: await this.present(page, viewerId, ownerId),
      nextCursor:
        rows.length > COMMENTS_PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  private async present(
    rows: CaseComment[],
    viewerId: string,
    ownerId: string,
  ): Promise<CaseCommentDto[]> {
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
          phone_verified_at: true,
          attorney_profile: { select: { username: true } },
        },
      }),
      this.prisma.caseCommentLike.findMany({
        where: { comment_id: { in: ids }, user_id: viewerId },
        select: { comment_id: true },
      }),
      this.counters.pending('case_comment', 'like_count', ids),
      this.counters.pending('case_comment', 'reply_count', ids),
    ]);
    const byId = new Map(authors.map((a) => [a.id, a]));
    const attorneys = authors.filter((a) => a.role === 'attorney');
    const files = await this.files.avatarUrlsMany(
      attorneys.map((a) => a.avatar_file_id),
    );
    const liked = new Set(likes.map((l) => l.comment_id));
    return rows.map((r) => {
      const a = byId.get(r.author_id);
      const prof = a?.role === 'attorney' ? a.attorney_profile : null;
      return {
        id: r.id,
        caseId: r.case_id,
        parentCommentId: r.parent_comment_id,
        author: prof
          ? {
              kind: 'attorney' as const,
              attorneyId: r.author_id,
              username: prof.username,
              displayName:
                [a?.first_name, a?.last_name].filter(Boolean).join(' ') ||
                `@${prof.username}`,
              avatarUrl: a?.avatar_file_id
                ? (files.get(a.avatar_file_id)?.url256 ?? null)
                : null,
              // OQ-029 final: the badge follows the verified phone.
              verifiedBadge: a?.phone_verified_at != null,
            }
          : {
              // The client is anonymous to attorneys (docs/04 §7).
              kind: 'client' as const,
              attorneyId: null,
              username: null,
              displayName: 'Client',
              avatarUrl: null,
              verifiedBadge: false,
            },
        byCaseOwner: r.author_id === ownerId,
        body: r.body,
        likeCount: Math.max(0, r.like_count + (pLikes.get(r.id) ?? 0)),
        replyCount: Math.max(0, r.reply_count + (pReplies.get(r.id) ?? 0)),
        likedByMe: liked.has(r.id),
        canDelete: r.author_id === viewerId || ownerId === viewerId,
        isMine: r.author_id === viewerId,
        createdAt: r.created_at.toISOString(),
      };
    });
  }
}

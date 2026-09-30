import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, ReportTargetType } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { recalcAttorneyRating } from '../reviews/review-rating';

export type Tx = Prisma.TransactionClient;

/** What a moderator (or the auto-hide rule) sees about a reported object. */
export interface ModerationTarget {
  type: ReportTargetType;
  id: string;
  /** The user held responsible (post/comment/review/message author, the
   * case's client, the user itself). */
  authorId: string | null;
  /** post/comment/review: published|hidden|removed; message: published|
   * removed (deleted_at); case: its status; user: its status. */
  status: string;
  /** Text shown in the queue card (never for `user`). */
  text: string | null;
  /** Where the object lives (post id for a comment, conversation for a
   * message, attorney for a review). */
  context: Record<string, string | null>;
  createdAt: Date | null;
}

export type ContentAction = 'hide' | 'remove' | 'restore';

/**
 * docs/06 §3.2–3.3: the status side of moderation, shared by the admin
 * queue and the auto-hide rule. Posts/comments keep their counters in
 * sync (posts_count, comment_count, reply_count — the same bumps the
 * authors' own delete path does); a review recalculates the attorney's
 * rating (file 03 §7.5); a message is "hidden" by `deleted_at` (OQ-B);
 * a case can't be hidden here (the lifecycle owns its states) and a user
 * is sanctioned by AdminUsersService.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly counters: CounterAggregator,
    private readonly settings: AppSettingsService,
  ) {}

  async resolve(
    type: ReportTargetType,
    id: string,
    db: Tx | PrismaService = this.prisma,
  ): Promise<ModerationTarget | null> {
    switch (type) {
      case 'post': {
        const p = await db.post.findUnique({
          // Soft-deleted rows stay resolvable (the queue shows them as removed).
          where: withDeleted({ id }),
          select: {
            author_id: true,
            body: true,
            status: true,
            deleted_at: true,
            created_at: true,
          },
        });
        return p
          ? {
              type,
              id,
              authorId: p.author_id,
              status: p.deleted_at ? 'removed' : p.status,
              text: p.body,
              context: {},
              createdAt: p.created_at,
            }
          : null;
      }
      case 'comment': {
        const c = await db.comment.findUnique({
          // Soft-deleted rows stay resolvable (the queue shows them as removed).
          where: withDeleted({ id }),
          select: {
            author_id: true,
            body: true,
            status: true,
            deleted_at: true,
            created_at: true,
            post_id: true,
            parent_comment_id: true,
          },
        });
        return c
          ? {
              type,
              id,
              authorId: c.author_id,
              status: c.deleted_at ? 'removed' : c.status,
              text: c.body,
              context: {
                postId: c.post_id,
                parentCommentId: c.parent_comment_id,
              },
              createdAt: c.created_at,
            }
          : null;
      }
      case 'case_comment': {
        const c = await db.caseComment.findUnique({
          // Soft-deleted rows stay resolvable (the queue shows them as removed).
          where: withDeleted({ id }),
          select: {
            author_id: true,
            body: true,
            status: true,
            deleted_at: true,
            created_at: true,
            case_id: true,
            parent_comment_id: true,
          },
        });
        return c
          ? {
              type,
              id,
              authorId: c.author_id,
              status: c.deleted_at ? 'removed' : c.status,
              text: c.body,
              context: {
                caseId: c.case_id,
                parentCommentId: c.parent_comment_id,
              },
              createdAt: c.created_at,
            }
          : null;
      }
      case 'message': {
        const m = await db.message.findUnique({
          // Soft-deleted rows stay resolvable (the queue shows them as removed).
          where: withDeleted({ id }),
          select: {
            sender_id: true,
            body_display: true,
            deleted_at: true,
            created_at: true,
            conversation_id: true,
          },
        });
        return m
          ? {
              type,
              id,
              authorId: m.sender_id,
              status: m.deleted_at ? 'removed' : 'published',
              text: m.body_display,
              context: { conversationId: m.conversation_id },
              createdAt: m.created_at,
            }
          : null;
      }
      case 'review': {
        const r = await db.review.findUnique({
          where: { id },
          select: {
            client_id: true,
            attorney_id: true,
            body: true,
            rating: true,
            status: true,
            created_at: true,
          },
        });
        return r
          ? {
              type,
              id,
              authorId: r.client_id,
              status: r.status,
              text: `★${r.rating}${r.body ? ` — ${r.body}` : ''}`,
              context: { attorneyId: r.attorney_id },
              createdAt: r.created_at,
            }
          : null;
      }
      case 'case': {
        const c = await db.case.findUnique({
          where: { id },
          select: {
            client_id: true,
            title: true,
            description: true,
            status: true,
            created_at: true,
          },
        });
        return c
          ? {
              type,
              id,
              authorId: c.client_id,
              status: c.status,
              text: `${c.title}\n${c.description}`,
              context: {},
              createdAt: c.created_at,
            }
          : null;
      }
      case 'user': {
        const u = await db.user.findUnique({
          // Soft-deleted rows stay resolvable (the queue shows them as removed).
          where: withDeleted({ id }),
          select: { status: true, created_at: true },
        });
        return u
          ? {
              type,
              id,
              authorId: id,
              status: u.status,
              text: null,
              context: {},
              createdAt: u.created_at,
            }
          : null;
      }
      default:
        return null;
    }
  }

  /**
   * Sets a post/comment/review/message status. Returns the previous
   * status, or null when the action doesn't apply (already in that
   * state, deleted, unsupported type). Runs inside [tx]; counter bumps
   * are queued after (they're Redis, not part of the transaction).
   */
  async setContentStatus(
    tx: Tx,
    target: ModerationTarget,
    action: ContentAction,
    after: (() => Promise<void>)[],
  ): Promise<string | null> {
    const next =
      action === 'hide'
        ? 'hidden'
        : action === 'remove'
          ? 'removed'
          : 'published';
    if (target.status === next) return null;
    switch (target.type) {
      case 'post': {
        if (target.status === 'removed' && action !== 'restore') return null;
        await tx.post.update({
          where: { id: target.id },
          data: {
            status: next,
            ...(action === 'restore' ? { deleted_at: null } : {}),
          },
        });
        const delta =
          target.status === 'published' ? -1 : next === 'published' ? 1 : 0;
        if (delta && target.authorId) {
          const authorId = target.authorId;
          after.push(() =>
            this.counters.bump('attorney', authorId, 'posts_count', delta),
          );
        }
        return target.status;
      }
      case 'comment': {
        if (target.status === 'removed' && action !== 'restore') return null;
        await tx.comment.update({
          where: { id: target.id },
          data: {
            status: next,
            ...(action === 'restore' ? { deleted_at: null } : {}),
          },
        });
        const delta =
          target.status === 'published' ? -1 : next === 'published' ? 1 : 0;
        if (delta) {
          const postId = target.context.postId;
          const parentId = target.context.parentCommentId;
          if (postId) {
            after.push(() =>
              this.counters.bump('post', postId, 'comment_count', delta),
            );
          }
          if (parentId) {
            after.push(() =>
              this.counters.bump('comment', parentId, 'reply_count', delta),
            );
          }
        }
        return target.status;
      }
      case 'case_comment': {
        if (target.status === 'removed' && action !== 'restore') return null;
        await tx.caseComment.update({
          where: { id: target.id },
          data: {
            status: next,
            ...(action === 'restore' ? { deleted_at: null } : {}),
          },
        });
        const delta =
          target.status === 'published' ? -1 : next === 'published' ? 1 : 0;
        if (delta) {
          const caseId = target.context.caseId;
          const parentId = target.context.parentCommentId;
          if (caseId) {
            after.push(() =>
              this.counters.bump('case', caseId, 'comment_count', delta),
            );
          }
          if (parentId) {
            after.push(() =>
              this.counters.bump(
                'case_comment',
                parentId,
                'reply_count',
                delta,
              ),
            );
          }
        }
        return target.status;
      }
      case 'review': {
        await tx.review.update({
          where: { id: target.id },
          data: { status: next },
        });
        const attorneyId = target.context.attorneyId;
        if (attorneyId) await recalcAttorneyRating(tx, attorneyId);
        return target.status;
      }
      case 'message': {
        // OQ-B: hide = remove for a message (deleted_at); restore clears it.
        if (action === 'restore') {
          if (target.status !== 'removed') return null;
          await tx.message.update({
            where: { id: target.id },
            data: { deleted_at: null },
          });
          return 'removed';
        }
        if (target.status === 'removed') return null;
        await tx.message.update({
          where: { id: target.id },
          data: { deleted_at: new Date() },
        });
        return 'published';
      }
      default:
        return null;
    }
  }

  /**
   * §3.3 "3 подтверждённых жалобы на один объект автоматически ставят его
   * в hidden до решения модератора" — distinct reporters with an open or
   * actioned report (OQ-C: confirmed = not dismissed). Called after a
   * report is stored; best effort, never fails the report.
   */
  async autoHideIfThreshold(
    type: ReportTargetType,
    id: string,
  ): Promise<boolean> {
    try {
      const threshold = await this.settings.number(
        'moderation.auto_hide_reports',
      );
      if (threshold <= 0) return false;
      const rows = await this.prisma.report.findMany({
        where: {
          target_type: type,
          target_id: id,
          status: { in: ['open', 'actioned'] },
        },
        select: { reporter_id: true },
        distinct: ['reporter_id'],
        take: threshold,
      });
      if (rows.length < threshold) return false;
      const after: (() => Promise<void>)[] = [];
      const hidden = await withTxRetry(this.prisma, async (tx) => {
        after.length = 0;
        const target = await this.resolve(type, id, tx);
        if (!target || target.status !== 'published') return false;
        if (type === 'user' || type === 'case') return false;
        return (
          (await this.setContentStatus(tx, target, 'hide', after)) !== null
        );
      });
      for (const f of after) await f();
      return hidden;
    } catch (e) {
      this.logger.error(`auto-hide failed for ${type}/${id}: ${String(e)}`);
      return false;
    }
  }
}

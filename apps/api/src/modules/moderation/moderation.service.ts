import { Injectable, Logger, Optional } from '@nestjs/common';
import { AUTO_HOLD_NOTE } from './auto-hold.service';
import type { Prisma, ReportTargetType } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { withTxRetry } from '../../prisma/tx-retry.util';
import {
  CounterAggregator,
  profileEntity,
} from '../counters/counter-aggregator.service';
import { recalcAttorneyRating } from '../reviews/review-rating';
import { fileNameAad } from '../../common/secrets/field-aad';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { AutoModerationService } from './auto-moderation.service';
import { ReporterReputationService } from './reporter-reputation.service';

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
  /** Algo audit 2026-10-27 (CONTENT H-6): the author deleted it (not a
   * moderator's remove). A restore never brings such an object back. */
  authorDeleted?: boolean;
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
    private readonly files: FilesService,
    @Optional() private readonly cipher?: MessageBodyCipher,
    // Owner 2026-10-27: reporter weights (absent = the old plain count).
    @Optional() private readonly reputation?: ReporterReputationService,
    @Optional() private readonly auto?: AutoModerationService,
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
              authorDeleted: !!p.deleted_at && p.status !== 'removed',
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
              authorDeleted: !!c.deleted_at && c.status !== 'removed',
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
              authorDeleted: !!c.deleted_at && c.status !== 'removed',
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
        // The report names the message by id only: a probe of every hash
        // partition's primary key (one moderator click).
        const m = await db.message.findFirst({
          // Soft-deleted rows stay resolvable (the queue shows them as removed).
          where: withDeleted({ id }),
          select: {
            sender_id: true,
            body_display: true,
            deleted_at: true,
            created_at: true,
            conversation_id: true,
            type: true,
            file_id: true,
            file_name: true,
            duration_ms: true,
          },
        });
        if (!m) return null;
        const body = this.cipher?.open(m.body_display, id) ?? m.body_display;
        // OQ-040: a reported voice note — the moderator gets a short
        // signed link to listen (outside transactions only).
        const voiceUrl =
          m.type === 'voice' && m.file_id && db === this.prisma
            ? ((await this.files.voiceUrls([m.file_id])).get(m.file_id) ?? null)
            : null;
        // OQ-047: a reported photo or document — a short link to open it.
        const fileUrl =
          m.type === 'attachment' && m.file_id && db === this.prisma
            ? ((await this.files.attachmentUrls([m.file_id])).get(m.file_id)
                ?.url ?? null)
            : null;
        return {
          type,
          id,
          authorId: m.sender_id,
          status: m.deleted_at ? 'removed' : 'published',
          text:
            m.type === 'voice'
              ? `[voice message, ${Math.round((m.duration_ms ?? 0) / 1000)} s]`
              : m.type === 'attachment'
                ? `[file: ${
                    (m.file_name === null
                      ? null
                      : (this.cipher?.openField(m.file_name, fileNameAad(id)) ??
                        m.file_name)) || 'file'
                  }] ${body}`.trim()
                : body,
          context: {
            conversationId: m.conversation_id,
            ...(m.type === 'voice' ? { voiceUrl } : {}),
            ...(m.type === 'attachment' ? { fileUrl } : {}),
          },
          createdAt: m.created_at,
        };
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
      case 'legal_question': {
        const q = await db.legalQuestion.findUnique({
          where: withDeleted({ id }),
          select: {
            author_id: true,
            title: true,
            body: true,
            status: true,
            deleted_at: true,
            created_at: true,
          },
        });
        return q
          ? {
              type,
              id,
              authorId: q.author_id,
              status: q.deleted_at ? 'removed' : q.status,
              // Moderation never sets deleted_at here: only the author does.
              authorDeleted: !!q.deleted_at,
              text: `${q.title}\n${q.body}`,
              context: {},
              createdAt: q.created_at,
            }
          : null;
      }
      case 'legal_answer': {
        const a = await db.legalAnswer.findUnique({
          where: withDeleted({ id }),
          select: {
            attorney_id: true,
            question_id: true,
            body: true,
            status: true,
            deleted_at: true,
            created_at: true,
          },
        });
        return a
          ? {
              type,
              id,
              authorId: a.attorney_id,
              status: a.deleted_at ? 'removed' : a.status,
              authorDeleted: !!a.deleted_at,
              text: a.body,
              context: { questionId: a.question_id },
              createdAt: a.created_at,
            }
          : null;
      }
      case 'sticker_pack': {
        const pk = await db.stickerPack.findUnique({
          where: { id },
          select: {
            owner_user_id: true,
            title: true,
            short_name: true,
            status: true,
            created_at: true,
          },
        });
        return pk && pk.owner_user_id
          ? {
              type,
              id,
              authorId: pk.owner_user_id,
              status: pk.status === 'active' ? 'published' : pk.status,
              text: `${pk.title} (${pk.short_name})`,
              context: {},
              createdAt: pk.created_at,
            }
          : null;
      }
      case 'story': {
        const st = await db.story.findUnique({
          where: withDeleted({ id }),
          select: {
            author_id: true,
            kind: true,
            text: true,
            status: true,
            deleted_at: true,
            created_at: true,
          },
        });
        return st
          ? {
              type,
              id,
              authorId: st.author_id,
              status: st.deleted_at
                ? 'removed'
                : st.status === 'active'
                  ? 'published'
                  : 'removed',
              text: `[${st.kind} story] ${st.text ?? ''}`.trim(),
              context: {},
              createdAt: st.created_at,
            }
          : null;
      }
      case 'channel': {
        const ch = await db.channel.findUnique({
          where: withDeleted({ id }),
          select: {
            owner_id: true,
            title: true,
            username: true,
            description: true,
            status: true,
            deleted_at: true,
            created_at: true,
          },
        });
        return ch
          ? {
              type,
              id,
              authorId: ch.owner_id,
              status: ch.deleted_at
                ? 'removed'
                : ch.status === 'active'
                  ? 'published'
                  : ch.status === 'banned'
                    ? 'removed'
                    : 'hidden',
              text: `${ch.title} (@${ch.username}) ${ch.description ?? ''}`.trim(),
              context: {},
              createdAt: ch.created_at,
            }
          : null;
      }
      case 'channel_post': {
        const cp = await db.channelPost.findUnique({
          where: withDeleted({ id }),
          select: {
            author_id: true,
            body: true,
            status: true,
            deleted_at: true,
            created_at: true,
            channel_id: true,
          },
        });
        return cp
          ? {
              type,
              id,
              authorId: cp.author_id,
              status: cp.deleted_at
                ? 'removed'
                : cp.status === 'active'
                  ? 'published'
                  : cp.status,
              authorDeleted: !!cp.deleted_at && cp.status !== 'removed',
              text: cp.body,
              context: { channelId: cp.channel_id },
              createdAt: cp.created_at,
            }
          : null;
      }
      case 'client_review': {
        const r = await db.clientReview.findUnique({
          where: { id },
          select: {
            attorney_id: true,
            client_id: true,
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
              // The author (the column keeps its original name).
              authorId: r.attorney_id,
              status: r.status,
              text: `★${r.rating}${r.body ? ` — ${r.body}` : ''}`,
              context: { clientId: r.client_id },
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
    // Algo audit 2026-10-27 (CONTENT H-6): a restore (moderator, accepted
    // appeal, approved picture) used to clear `deleted_at` and bring back
    // what its author had deleted. Such an object is not restorable.
    if (
      action === 'restore' &&
      target.authorDeleted &&
      (await this.settings.boolean(
        'moderation.restore_keeps_author_delete_enabled',
      ))
    ) {
      return null;
    }
    switch (target.type) {
      case 'post': {
        if (target.status === 'removed' && action !== 'restore') return null;
        const row = await tx.post.update({
          where: { id: target.id },
          data: {
            status: next,
            ...(action === 'restore' ? { deleted_at: null } : {}),
          },
          select: { archived_at: true },
        });
        // Owner 2026-10-18: an archived post is out of the count already.
        const delta = row.archived_at
          ? 0
          : target.status === 'published'
            ? -1
            : next === 'published'
              ? 1
              : 0;
        if (delta && target.authorId) {
          const authorId = target.authorId;
          after.push(() =>
            // OQ-038: the author may be a client.
            this.prisma.user
              .findUnique({ where: { id: authorId }, select: { role: true } })
              .then((u) =>
                this.counters.bump(
                  profileEntity(u?.role),
                  authorId,
                  'posts_count',
                  delta,
                ),
              ),
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
      case 'legal_question': {
        if (target.status === 'removed' && action !== 'restore') return null;
        await tx.legalQuestion.update({
          where: { id: target.id },
          data: {
            status: next,
            ...(action === 'restore' ? { deleted_at: null } : {}),
          },
        });
        return target.status;
      }
      case 'legal_answer': {
        if (target.status === 'removed' && action !== 'restore') return null;
        const row = await tx.legalAnswer.update({
          where: { id: target.id },
          data: {
            status: next,
            ...(action === 'restore' ? { deleted_at: null } : {}),
          },
          select: { question_id: true, is_best: true },
        });
        const delta =
          target.status === 'published' ? -1 : next === 'published' ? 1 : 0;
        if (delta) {
          await tx.legalQuestion.updateMany({
            where: withDeleted({ id: row.question_id }),
            data: { answer_count: { increment: delta } },
          });
        }
        // A hidden best answer stops being "best".
        if (next !== 'published' && row.is_best) {
          await tx.legalAnswer.update({
            where: { id: target.id },
            data: { is_best: false },
          });
          await tx.legalQuestion.updateMany({
            where: withDeleted({
              id: row.question_id,
              best_answer_id: target.id,
            }),
            data: { best_answer_id: null },
          });
        }
        return target.status;
      }
      case 'sticker_pack': {
        // A hidden pack can't be installed or sent; remove hides it too.
        await tx.stickerPack.update({
          where: { id: target.id },
          data: { status: next === 'published' ? 'active' : 'hidden' },
        });
        return target.status;
      }
      case 'story': {
        // A story has two states: shown or removed (hide = remove).
        await tx.story.update({
          where: { id: target.id },
          data: { status: action === 'restore' ? 'active' : 'removed' },
        });
        return target.status;
      }
      case 'channel': {
        // hide: out of search and lists; remove: closed (banned).
        await tx.channel.update({
          where: { id: target.id },
          data: {
            status:
              action === 'restore'
                ? 'active'
                : action === 'hide'
                  ? 'hidden'
                  : 'banned',
          },
        });
        return target.status;
      }
      case 'channel_post': {
        if (target.status === 'removed' && action !== 'restore') return null;
        const status =
          action === 'restore'
            ? 'active'
            : action === 'hide'
              ? 'hidden'
              : 'removed';
        await tx.channelPost.update({
          where: { id: target.id },
          data: {
            status,
            ...(action === 'restore' ? { deleted_at: null } : {}),
          },
        });
        const delta =
          target.status === 'published' ? -1 : next === 'published' ? 1 : 0;
        if (delta && target.context.channelId) {
          await tx.channel.update({
            where: { id: target.context.channelId },
            data: { post_count: { increment: delta } },
          });
        }
        return target.status;
      }
      case 'client_review': {
        await tx.clientReview.update({
          where: { id: target.id },
          data: { status: next },
        });
        const clientId = target.context.clientId;
        if (clientId) {
          const agg = await tx.clientReview.aggregate({
            where: { client_id: clientId, status: 'published' },
            _avg: { rating: true },
            _count: { _all: true },
          });
          await tx.clientProfile.updateMany({
            where: { user_id: clientId },
            data: {
              rating_avg: agg._avg.rating ?? 0,
              rating_count: agg._count._all,
            },
          });
        }
        return target.status;
      }
      case 'message': {
        // OQ-B: hide = remove for a message (deleted_at); restore clears it.
        if (action === 'restore') {
          if (target.status !== 'removed') return null;
          await tx.message.updateMany({
            where: {
              id: target.id,
              conversation_id: target.context.conversationId ?? undefined,
            },
            data: { deleted_at: null },
          });
          return 'removed';
        }
        if (target.status === 'removed') return null;
        await tx.message.updateMany({
          where: {
            id: target.id,
            conversation_id: target.context.conversationId ?? undefined,
          },
          data: { deleted_at: new Date() },
        });
        return 'published';
      }
      default:
        return null;
    }
  }

  /**
   * §3.3 auto-hide after reports (OQ-C: confirmed = not dismissed). Called
   * after a report is stored; best effort, never fails the report.
   *
   * Owner 2026-10-27: `moderation.auto_hide_mode`
   *  - `count`: the old rule, N distinct reporters;
   *  - `weighted` (default): the reporters' weights (account age, verified
   *    contact, past accuracy, shared device / network, sign-up bursts)
   *    must add up to `moderation.auto_hide_score`. Three fresh sock-puppet
   *    accounts weigh a small fraction of that.
   * Content of a verified attorney is never hidden by reports alone when
   * `moderation.verified_attorney_action` is `review`: the reports get the
   * priority flag and a person decides; with `hide` it needs the higher
   * `moderation.verified_attorney_score`.
   */
  async autoHideIfThreshold(
    type: ReportTargetType,
    id: string,
  ): Promise<boolean> {
    try {
      if (type === 'user' || type === 'case') {
        // Not hidden here, but the reports count towards the account score.
        await this.accountSignal(type, id);
        return false;
      }
      const mode = await this.settings.string('moderation.auto_hide_mode');
      const weighted = mode !== 'count' && !!this.reputation;
      const count = await this.settings.number('moderation.auto_hide_reports');
      if (!weighted && count <= 0) return false;
      // Algo audit 2026-10-27 (CONTENT H-1): a person brought it back —
      // the reports before that decision were weighed; only newer ones count.
      const since = await this.lastRestoreAt(type, id);
      const rows = await this.prisma.report.findMany({
        where: {
          target_type: type,
          target_id: id,
          status: { in: ['open', 'actioned'] },
          ...(since ? { created_at: { gt: since } } : {}),
          // Algo audit 2026-10-27 (C-2): a system «auto_hold» row is a
          // queue ticket, not a complaint (a NULL note is a complaint: SQL
          // `NOT (NULL LIKE …)` is NULL, hence the explicit OR).
          OR: [
            { note: null },
            { NOT: { note: { startsWith: AUTO_HOLD_NOTE } } },
          ],
        },
        select: { reporter_id: true },
        distinct: ['reporter_id'],
        take: weighted ? 50 : count,
      });
      let score = rows.length;
      let limit = count;
      // Assigned inside the transaction callback below.
      let owner = null as string | null;
      if (!weighted) {
        if (rows.length < count) return false;
      } else {
        const target = await this.resolve(type, id);
        if (!target || target.status !== 'published') return false;
        owner = target.authorId;
        await this.stampAndScore(type, id, target.authorId);
        const need = await this.settings.number('moderation.auto_hide_score');
        if (need <= 0) return false;
        const result = await this.reputation.weigh(
          rows.map((r) => r.reporter_id),
          target.authorId,
        );
        score = result.total;
        limit = need;
        if (result.total < need) return false;
        if (await this.isVerifiedAttorney(target.authorId)) {
          const action = await this.settings.string(
            'moderation.verified_attorney_action',
          );
          if (action !== 'hide') {
            await this.prisma.report.updateMany({
              where: { target_type: type, target_id: id, status: 'open' },
              data: { priority_review: true },
            });
            return false;
          }
          const higher = await this.settings.number(
            'moderation.verified_attorney_score',
          );
          if (result.total < Math.max(higher, need)) return false;
          limit = Math.max(higher, need);
        }
      }
      const after: (() => Promise<void>)[] = [];
      const hidden = await withTxRetry(this.prisma, async (tx) => {
        after.length = 0;
        const target = await this.resolve(type, id, tx);
        if (!target || target.status !== 'published') return false;
        owner = target.authorId;
        return (
          (await this.setContentStatus(tx, target, 'hide', after)) !== null
        );
      });
      for (const f of after) await f();
      if (hidden && owner) {
        // Owner 2026-10-27: an appealable automatic decision.
        await this.auto?.recordContentHide({
          userId: owner,
          targetType: type,
          targetId: id,
          score,
          threshold: limit,
        });
      }
      return hidden;
    } catch (e) {
      this.logger.error(`auto-hide failed for ${type}/${id}: ${String(e)}`);
      return false;
    }
  }

  /**
   * When a moderator last restored this object (queue «restore», a dismiss
   * that restored, an accepted appeal) or an automatic hide of it was
   * reversed on appeal. Null when never, or with
   * `moderation.reports_after_restore_only_enabled` off (the old rule: all
   * open + actioned reports count again). Indexed reads only: actions by
   * (target_type, target_id), automatic ones by their owner (user_id).
   */
  async lastRestoreAt(
    type: ReportTargetType,
    id: string,
  ): Promise<Date | null> {
    if (
      !(await this.settings.boolean(
        'moderation.reports_after_restore_only_enabled',
      ))
    ) {
      return null;
    }
    const owner = (await this.resolve(type, id))?.authorId ?? null;
    const [manual, auto] = await Promise.all([
      this.prisma.moderationAction.findFirst({
        where: { target_type: type, target_id: id, action: 'restore' },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
      }),
      owner
        ? this.prisma.moderationAutoAction.findFirst({
            where: {
              user_id: owner,
              target_type: type,
              target_id: id,
              kind: 'content_hide',
              reversed_at: { not: null },
            },
            orderBy: { reversed_at: 'desc' },
            select: { reversed_at: true },
          })
        : Promise.resolve(null),
    ]);
    const times = [manual?.created_at, auto?.reversed_at]
      .filter((d): d is Date => !!d)
      .map((d) => d.getTime());
    return times.length ? new Date(Math.max(...times)) : null;
  }

  /** Remember the owner on the object's reports and re-score the account. */
  private async stampAndScore(
    type: ReportTargetType,
    id: string,
    ownerId: string | null,
  ): Promise<void> {
    if (!ownerId) return;
    await this.prisma.report.updateMany({
      where: { target_type: type, target_id: id, target_author_id: null },
      data: { target_author_id: ownerId },
    });
    await this.auto?.evaluateAccount(ownerId);
  }

  private async accountSignal(
    type: ReportTargetType,
    id: string,
  ): Promise<void> {
    if (!this.auto || !this.reputation) return;
    const target = await this.resolve(type, id);
    await this.stampAndScore(type, id, target?.authorId ?? null);
  }

  /** 403 REPORTING_SUSPENDED while this person's reports are paused. */
  async assertCanReport(userId: string): Promise<void> {
    await this.reputation?.assertCanReport(userId);
  }

  private async isVerifiedAttorney(userId: string | null): Promise<boolean> {
    if (!userId) return false;
    const p = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: userId },
      select: { verification_status: true },
    });
    return p?.verification_status === 'verified';
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { shardContext } from '../../sharding/shard-context';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { ModerationService } from '../moderation/moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertStaffBulkCap } from '../../common/admin-bulk/admin-bulk';
import {
  type BulkFilterMatch,
  idsByFilter,
  type IdPageReader,
  NEWEST_FIRST,
} from '../../common/admin-bulk/bulk-filter';
import {
  type AdminBulkResultDto,
  type AdminContentBulkFilterDto,
  BULK_MAX,
  type BulkContentAction,
  type BulkContentType,
} from './admin-content.dto';
import {
  AdminContentExtrasService,
  clientReviewsWhere,
} from './admin-content-extras.service';
import {
  commentsWhere,
  postsWhere,
  reviewsWhere,
} from './admin-content.service';
import { eachIdInChunks } from './bulk.util';

/** What each bulk action may touch. Reviews are hidden, not removed (the
 * single screens do the same); everything can come back. */
const ALLOWED: Record<BulkContentAction, readonly BulkContentType[]> = {
  remove: ['post', 'comment', 'case_comment'],
  hide: ['post', 'comment', 'case_comment', 'review', 'client_review'],
  restore: ['post', 'comment', 'case_comment', 'review', 'client_review'],
};

/** Key of the moderation notice payload, as the single actions send it. */
const NOTICE_KEY: Record<BulkContentType, string> = {
  post: 'postId',
  comment: 'commentId',
  case_comment: 'commentId',
  review: 'reviewId',
  client_review: 'clientReviewId',
};

/**
 * Owner 2026-10-04 — bulk moderation of posts, comments and reviews: many
 * ids, one reason. Every item goes through the same ModerationService path
 * as the single action (counters and ratings stay in sync), the author of
 * each removed / hidden item gets the usual moderation notice, and the
 * batch leaves one audit row with every id.
 */
@Injectable()
export class AdminContentBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly notifications: NotificationsService,
    private readonly extras: AdminContentExtrasService,
    private readonly audit: AuditLogService,
  ) {}

  async apply(
    admin: AdminActor,
    action: BulkContentAction,
    type: BulkContentType,
    ids: string[],
    reason: string,
    { byFilter = false }: { byFilter?: boolean } = {},
  ): Promise<AdminBulkResultDto> {
    assertBulkAllowed(action, type);
    // Owner 2026-11-12: staff keep BULK_MAX; the owner sends any number,
    // worked through in chunks, one batch audit row per chunk. Ids the
    // server resolved from a filter (row 179 B6) were already capped by
    // `admin.bulk_select_cap`.
    if (!byFilter) assertStaffBulkCap(admin, ids, BULK_MAX);
    return eachIdInChunks(
      ids,
      (id) => this.one(admin, action, type, id, reason),
      (part, chunk) =>
        this.audit.record({
          adminId: admin.id,
          action: `admin.content.bulk_${action}`,
          targetType: type,
          targetId: null,
          after: {
            reason,
            requested: ids.length,
            done: part.done,
            skipped: part.skipped.map((s) => ({ id: s.id, reason: s.reason })),
            ...(chunk.of > 1 ? { chunk } : {}),
          },
          ip: admin.ip,
        }),
    );
  }

  /** Row 179 B6: the ids [filter] matches in the list of [type], with the
   * list's own where (ids only, keyset pages); [cap] null = every match. */
  async idsByFilter(
    type: BulkContentType,
    filter: AdminContentBulkFilterDto,
    cap: number | null,
  ): Promise<BulkFilterMatch> {
    const page = <W>(
      findMany: (a: {
        where: W;
        select: { id: true };
        orderBy: typeof NEWEST_FIRST;
        take: number;
      }) => Promise<{ id: string }[]>,
      where: W,
    ): IdPageReader => {
      return (p) =>
        findMany({ where, select: { id: true }, orderBy: NEWEST_FIRST, ...p });
    };
    const none: BulkFilterMatch = { ids: [], matched: 0, capped: false };
    switch (type) {
      case 'post': {
        const where = await postsWhere(
          this.prisma,
          filter.q,
          filter.kind,
          filter.media === 'video',
          filter,
        );
        if (!where) return none;
        return idsByFilter(
          page((a) => this.prisma.post.findMany(a), where),
          cap,
        );
      }
      case 'comment':
        return idsByFilter(
          page(
            (a) => this.prisma.comment.findMany(a),
            commentsWhere(filter.q, filter),
          ),
          cap,
        );
      case 'case_comment':
        return idsByFilter(
          page(
            (a) => this.prisma.caseComment.findMany(a),
            commentsWhere(filter.q, filter),
          ),
          cap,
        );
      case 'review':
        return idsByFilter(
          page(
            (a) => this.prisma.review.findMany(a),
            reviewsWhere(filter.q, filter),
          ),
          cap,
        );
      case 'client_review':
        return idsByFilter(
          page(
            (a) => this.prisma.clientReview.findMany(a),
            clientReviewsWhere(filter.q, filter.status, filter),
          ),
          cap,
        );
    }
  }

  /** Each item runs in its own shard (its id carries it). */
  private one(
    admin: AdminActor,
    action: BulkContentAction,
    type: BulkContentType,
    id: string,
    reason: string,
  ): Promise<void> {
    return shardContext.runForCase(id, () =>
      this.oneInShard(admin, action, type, id, reason),
    );
  }

  private async oneInShard(
    admin: AdminActor,
    action: BulkContentAction,
    type: BulkContentType,
    id: string,
    reason: string,
  ): Promise<void> {
    // Posts and comments come back through the single restore path: it
    // refuses author-deleted posts and posts whose video was taken down.
    if (
      action === 'restore' &&
      (type === 'post' || type === 'comment' || type === 'case_comment')
    ) {
      await this.extras.restore(admin, type, id, reason, { audit: false });
      return;
    }
    const after: (() => Promise<void>)[] = [];
    const authorId = await withTxRetry(this.prisma, async (tx) => {
      after.length = 0;
      const target = await this.moderation.resolve(type, id, tx);
      if (!target) throw notFound();
      // Something already removed is not hidden (or removed) again.
      if (action !== 'restore' && target.status === 'removed') {
        throw invalidState(target.status);
      }
      const prev = await this.moderation.setContentStatus(
        tx,
        target,
        action,
        after,
      );
      if (prev === null) throw invalidState(target.status);
      if (action === 'remove') {
        const data = { deleted_at: new Date() };
        if (type === 'post') await tx.post.update({ where: { id }, data });
        if (type === 'comment')
          await tx.comment.update({ where: { id }, data });
        if (type === 'case_comment') {
          await tx.caseComment.update({ where: { id }, data });
        }
      }
      return target.authorId;
    });
    for (const f of after) await f();
    if (action !== 'restore' && authorId) {
      await this.notifications.emit({
        type: 'moderation_notice',
        recipientId: authorId,
        payload: { reason, [NOTICE_KEY[type]]: id },
      });
    }
  }
}

/** 400 when [action] does not apply to [type] (checked before anything). */
export function assertBulkAllowed(
  action: BulkContentAction,
  type: BulkContentType,
): void {
  if (!ALLOWED[action].includes(type)) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Action "${action}" does not apply to ${type}.`,
      details: { action, type },
    });
  }
}

function notFound() {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Not found.',
  });
}

function invalidState(status: string) {
  return new ConflictException({
    code: ErrorCode.CONTENT_INVALID_STATE,
    message: 'The item is already in this state.',
    details: { status },
  });
}

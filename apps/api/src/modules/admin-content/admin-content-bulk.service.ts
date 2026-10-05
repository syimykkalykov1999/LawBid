import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { ModerationService } from '../moderation/moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminBulkResultDto,
  BulkContentAction,
  BulkContentType,
} from './admin-content.dto';
import { AdminContentExtrasService } from './admin-content-extras.service';
import { eachId } from './bulk.util';

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
  ): Promise<AdminBulkResultDto> {
    if (!ALLOWED[action].includes(type)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Action "${action}" does not apply to ${type}.`,
        details: { action, type },
      });
    }
    const result = await eachId(ids, (id) =>
      this.one(admin, action, type, id, reason),
    );
    await this.audit.record({
      adminId: admin.id,
      action: `admin.content.bulk_${action}`,
      targetType: type,
      targetId: null,
      after: {
        reason,
        requested: ids.length,
        done: result.done,
        skipped: result.skipped.map((s) => ({ id: s.id, reason: s.reason })),
      },
      ip: admin.ip,
    });
    return result;
  }

  private async one(
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

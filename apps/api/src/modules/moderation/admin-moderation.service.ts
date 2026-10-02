import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ReportTargetType } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminUsersService } from '../admin-users/admin-users.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  ModerationActionName,
  ModerationActionResultDto,
  ModerationAuthorDto,
  ModerationCardDto,
  ModerationHistoryItemDto,
  ModerationQueueItemDto,
  ModerationQueuePage,
  ModerationQueueQueryDto,
} from './admin-moderation.dto';
import { ModerationService, type ModerationTarget } from './moderation.service';

const QUEUE_DEFAULT = 20;
const EXCERPT = 200;

interface QueueRow {
  target_type: ReportTargetType;
  target_id: string;
  reports: number;
  reporters: number;
  reasons: string[];
  first_at: Date;
  last_at: Date;
}

/**
 * docs/06 §3.2: the reports queue grouped by object (oldest first), the
 * card (object + context, reasons, author, author's history) and the
 * actions — each with a reason, audited, the author notified
 * (`moderation_notice`) except for `dismiss`. Content status changes go
 * through ModerationService (counters, rating), user sanctions through
 * AdminUsersService (§3.4), so the effects are identical wherever they
 * are triggered from.
 */
@Injectable()
export class AdminModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly users: AdminUsersService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async queue(q: ModerationQueueQueryDto): Promise<ModerationQueuePage> {
    const limit = q.limit ?? QUEUE_DEFAULT;
    const status = q.status ?? 'open';
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.$queryRaw<QueueRow[]>`
      SELECT target_type, target_id,
             count(*)::INT8 AS reports,
             count(DISTINCT reporter_id)::INT8 AS reporters,
             array_agg(DISTINCT reason::STRING) AS reasons,
             min(created_at) AS first_at,
             max(created_at) AS last_at
      FROM reports
      WHERE status = ${status}::report_status
        ${q.targetType ? Prisma.sql`AND target_type = ${q.targetType}::report_target_type` : Prisma.empty}
      GROUP BY target_type, target_id
      ${
        cursor
          ? Prisma.sql`HAVING (min(created_at), target_id) > (${cursor.createdAt}, ${cursor.id}::UUID)`
          : Prisma.empty
      }
      ORDER BY first_at ASC, target_id ASC
      LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const items: ModerationQueueItemDto[] = [];
    for (const r of page) {
      const target = await this.moderation.resolve(r.target_type, r.target_id);
      items.push({
        targetType: r.target_type,
        targetId: r.target_id,
        reports: Number(r.reports),
        reporters: Number(r.reporters),
        reasons: r.reasons,
        firstReportedAt: r.first_at.toISOString(),
        lastReportedAt: r.last_at.toISOString(),
        targetStatus: target?.status ?? null,
        excerpt: target?.text ? target.text.slice(0, EXCERPT) : null,
        author: target?.authorId ? await this.author(target.authorId) : null,
      });
    }
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.first_at, id: last.target_id })
          : null,
    };
  }

  async card(type: ReportTargetType, id: string): Promise<ModerationCardDto> {
    const target = await this.moderation.resolve(type, id);
    if (!target) throw notFound();
    const [reports, author] = await Promise.all([
      this.prisma.report.findMany({
        where: { target_type: type, target_id: id },
        orderBy: { created_at: 'asc' },
        take: 100,
      }),
      target.authorId ? this.author(target.authorId) : null,
    ]);
    const authorHistory = target.authorId
      ? await this.history(target.authorId)
      : [];
    return {
      targetType: type,
      targetId: id,
      status: target.status,
      text: target.text,
      context: target.context,
      createdAt: target.createdAt?.toISOString() ?? null,
      author,
      reports: reports.map((r) => ({
        id: r.id,
        reporterId: r.reporter_id,
        reason: r.reason,
        note: r.note,
        status: r.status,
        createdAt: r.created_at.toISOString(),
        handledAt: r.handled_at?.toISOString() ?? null,
      })),
      authorHistory,
      availableActions: availableActions(target, author),
    };
  }

  async act(
    admin: AdminActor,
    type: ReportTargetType,
    id: string,
    action: ModerationActionName,
    reason: string,
  ): Promise<ModerationActionResultDto> {
    const target = await this.moderation.resolve(type, id);
    if (!target) throw notFound();
    const author = target.authorId ? await this.author(target.authorId) : null;
    if (!availableActions(target, author).includes(action)) {
      throw new ConflictException({
        code: ErrorCode.MODERATION_ACTION_NOT_APPLICABLE,
        message: `"${action}" does not apply to this ${type} in status ${target.status}.`,
      });
    }

    // User sanctions have their own transactions, audit rows and notices.
    if (action === 'warn') {
      await this.users.warn(admin, target.authorId!, reason);
    } else if (action === 'suspend') {
      await this.users.suspend(admin, target.authorId!, reason);
    } else if (action === 'restore' && type === 'user') {
      await this.users.restore(admin, id);
    }

    const after: (() => Promise<void>)[] = [];
    let status: string | null = target.status;
    const handled = await withTxRetry(this.prisma, async (tx) => {
      after.length = 0;
      let before: string | null = null;
      if (
        action === 'hide' ||
        action === 'remove' ||
        (action === 'restore' && type !== 'user')
      ) {
        const fresh = (await this.moderation.resolve(type, id, tx))!;
        before = await this.moderation.setContentStatus(
          tx,
          fresh,
          action,
          after,
        );
        // Re-read: a message "hide" lands as `removed` (deleted_at, OQ-B).
        status = (await this.moderation.resolve(type, id, tx))?.status ?? null;
      }
      const open = await tx.report.findMany({
        where: { target_type: type, target_id: id, status: 'open' },
        select: { id: true },
        orderBy: { created_at: 'asc' },
      });
      const now = new Date();
      if (open.length) {
        await tx.report.updateMany({
          where: { id: { in: open.map((r) => r.id) } },
          data: {
            status: action === 'dismiss' ? 'dismissed' : 'actioned',
            handled_by: admin.id,
            handled_at: now,
          },
        });
      }
      if (action !== 'dismiss') {
        await tx.moderationAction.create({
          data: {
            report_id: open[0]?.id ?? null,
            admin_id: admin.id,
            target_type: type,
            target_id: id,
            action,
            reason,
          },
        });
      }
      await this.audit.record(
        {
          adminId: admin.id,
          action: `moderation.${action}`,
          targetType: type,
          targetId: id,
          before: { status: before ?? target.status, openReports: open.length },
          after: { status, reason },
          ip: admin.ip,
        },
        tx,
      );
      // §3.2: the author learns about every decision but a dismissal
      // (warn/suspend already notified inside AdminUsersService).
      if (
        target.authorId &&
        (action === 'hide' || action === 'remove' || action === 'restore')
      ) {
        await this.notifications.emit(
          {
            type: 'moderation_notice',
            recipientId: target.authorId,
            // Audit 2026-10-02: the author sees the moderator's reason.
            payload: { action, targetType: type, targetId: id, reason },
          },
          tx,
        );
      }
      return open.length;
    });
    for (const f of after) await f();
    return {
      targetType: type,
      targetId: id,
      action,
      status,
      reportsHandled: handled,
    };
  }

  private async author(userId: string): Promise<ModerationAuthorDto | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        first_name: true,
        last_name: true,
        attorney_profile: { select: { username: true } },
      },
    });
    if (!u) return null;
    const [warnings, suspensions] = await Promise.all([
      this.prisma.moderationAction.count({
        where: { target_type: 'user', target_id: userId, action: 'warn' },
      }),
      this.prisma.moderationAction.count({
        where: { target_type: 'user', target_id: userId, action: 'suspend' },
      }),
    ]);
    return {
      id: u.id,
      role: u.role,
      status: u.status,
      firstName: u.first_name,
      lastName: u.last_name,
      username: u.attorney_profile?.username ?? null,
      warnings,
      suspensions,
    };
  }

  /** Sanctions on the user plus actions on the user's own content. */
  private async history(userId: string): Promise<ModerationHistoryItemDto[]> {
    const [posts, comments, reviews] = await Promise.all([
      this.prisma.post.findMany({
        where: { author_id: userId },
        select: { id: true },
        take: 200,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.comment.findMany({
        where: { author_id: userId },
        select: { id: true },
        take: 200,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.review.findMany({
        where: { client_id: userId },
        select: { id: true },
        take: 50,
      }),
    ]);
    const ids = [...posts, ...comments, ...reviews].map((x) => x.id);
    const rows = await this.prisma.moderationAction.findMany({
      where: {
        OR: [
          { target_type: 'user', target_id: userId },
          ...(ids.length ? [{ target_id: { in: ids } }] : []),
        ],
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      createdAt: r.created_at.toISOString(),
    }));
  }
}

/** §3.2 actions that make sense for the object right now. */
export function availableActions(
  target: ModerationTarget,
  author: ModerationAuthorDto | null,
): ModerationActionName[] {
  const out: ModerationActionName[] = ['dismiss'];
  const authorActive = author?.status === 'active';
  const authorSuspended = author?.status === 'suspended';
  if (target.type === 'user') {
    if (authorActive) out.push('warn', 'suspend');
    if (authorSuspended) out.push('restore');
    return out;
  }
  if (target.type === 'case') {
    if (authorActive) out.push('warn', 'suspend');
    return out;
  }
  if (target.type === 'message') {
    if (target.status === 'published') out.push('hide');
    if (target.status === 'removed') out.push('restore');
  } else {
    if (target.status === 'published') out.push('hide', 'remove');
    if (target.status === 'hidden') out.push('remove', 'restore');
    if (target.status === 'removed') out.push('restore');
  }
  if (authorActive) out.push('warn', 'suspend');
  return out;
}

const notFound = () =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Object not found.',
  });

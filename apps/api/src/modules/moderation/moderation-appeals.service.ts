import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type ReportTargetType } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  STAFF_RECORDER,
  type StaffRecorder,
} from '../staff-core/staff-recorder.port';
import {
  STAFF_SIGNALS,
  type StaffSignals,
} from '../staff-core/staff-signals.port';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminModerationService } from './admin-moderation.service';
import type {
  AppealItemDto,
  AppealQueueQueryDto,
  AppealStatusName,
  JournalItemDto,
  JournalQueryDto,
  ModerationNoticeDto,
  MyReportDto,
} from './moderation-appeals.dto';
import { ModerationService } from './moderation.service';
import { StrikesService } from './strikes.service';

/** An appeal can be filed this long after the decision. */
export const APPEAL_WINDOW_DAYS = 30;
const NOTICE_DAYS = 90;
const DAY_MS = 24 * 3600 * 1000;
const EXCERPT = 200;

const APPEALABLE_ACTIONS = ['hide', 'remove'] as const;
// Not appealable here: users (their own sanction flow), cases, reviews
// (their own appeal), stickers.
const APPEALABLE_TARGETS: ReportTargetType[] = [
  'post',
  'comment',
  'case_comment',
  'message',
];

/**
 * Owner 2026-10-20: the author sees what moderation did to their post,
 * comment or message and why, and may ask for a second look once. The
 * moderators' queue (admin-appeals) accepts (the content is restored
 * through the same audited action) or keeps the decision; either way the
 * author gets a notice with the moderator's words.
 */
@Injectable()
export class ModerationAppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly adminModeration: AdminModerationService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly strikes: StrikesService,
    @Optional()
    @Inject(STAFF_RECORDER)
    private readonly staffRecorder?: StaffRecorder,
    @Optional()
    @Inject(STAFF_SIGNALS)
    private readonly staffSignals?: StaffSignals,
  ) {}

  // ----- the author's side -----

  /** `GET /moderation/notices`: decisions on my content, newest first. */
  async notices(userId: string): Promise<ModerationNoticeDto[]> {
    const since = new Date(Date.now() - NOTICE_DAYS * DAY_MS);
    // Candidate objects: the user's own posts / comments / messages that
    // moderation touched, plus warnings aimed at the user.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT a.id
      FROM moderation_actions a
      WHERE a.created_at >= ${since}
        AND (
          (a.target_type = 'user' AND a.target_id = ${userId}::UUID AND a.action = 'warn')
          OR (a.target_type = 'post' AND a.action IN ('hide','remove','restore')
              AND a.target_id IN (SELECT id FROM posts WHERE author_id = ${userId}::UUID))
          OR (a.target_type = 'comment' AND a.action IN ('hide','remove','restore')
              AND a.target_id IN (SELECT id FROM comments WHERE author_id = ${userId}::UUID))
          OR (a.target_type = 'case_comment' AND a.action IN ('hide','remove','restore')
              AND a.target_id IN (SELECT id FROM case_comments WHERE author_id = ${userId}::UUID))
          OR (a.target_type = 'message' AND a.action IN ('hide','remove','restore')
              AND a.target_id IN (SELECT id FROM messages WHERE sender_id = ${userId}::UUID))
        )
      ORDER BY a.created_at DESC
      LIMIT 50`;
    if (rows.length === 0) return [];
    const full = await this.prisma.moderationAction.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      orderBy: { created_at: 'desc' },
      include: { appeal: true },
    });
    const out: ModerationNoticeDto[] = [];
    for (const a of full) {
      const target =
        a.target_type === 'user'
          ? null
          : await this.moderation.resolve(a.target_type, a.target_id);
      const appealable =
        (APPEALABLE_ACTIONS as readonly string[]).includes(a.action) &&
        APPEALABLE_TARGETS.includes(a.target_type);
      const latest = appealable
        ? await this.isLatestAction(a.id, a.target_type, a.target_id)
        : false;
      const open =
        appealable &&
        latest &&
        !a.appeal &&
        target !== null &&
        target.status !== 'published' &&
        Date.now() - a.created_at.getTime() <= APPEAL_WINDOW_DAYS * DAY_MS &&
        !(await this.removedByDmca(a.target_type, a.target_id));
      out.push({
        actionId: a.id,
        action: a.action,
        targetType: a.target_type,
        targetId: a.target_id,
        reason: a.reason,
        excerpt: target?.text ? target.text.slice(0, EXCERPT) : null,
        createdAt: a.created_at.toISOString(),
        canAppeal: open,
        appealStatus: a.appeal?.status ?? null,
        appealNote: a.appeal?.decision_note ?? null,
      });
    }
    return out;
  }

  /** `POST /moderation/appeals`. */
  async appeal(
    userId: string,
    actionId: string,
    message: string,
  ): Promise<ModerationNoticeDto> {
    const action = await this.prisma.moderationAction.findUnique({
      where: { id: actionId },
      include: { appeal: true },
    });
    if (
      !action ||
      !APPEALABLE_TARGETS.includes(action.target_type) ||
      !(APPEALABLE_ACTIONS as readonly string[]).includes(action.action)
    ) {
      throw this.notFound();
    }
    const target = await this.moderation.resolve(
      action.target_type,
      action.target_id,
    );
    // Only the author of the object may appeal (404 for anybody else: the
    // id must not leak that a decision exists).
    if (!target || target.authorId !== userId) throw this.notFound();
    if (
      action.appeal ||
      target.status === 'published' ||
      Date.now() - action.created_at.getTime() > APPEAL_WINDOW_DAYS * DAY_MS ||
      !(await this.isLatestAction(
        action.id,
        action.target_type,
        action.target_id,
      )) ||
      (await this.removedByDmca(action.target_type, action.target_id))
    ) {
      throw new ConflictException({
        code: ErrorCode.APPEAL_NOT_ALLOWED,
        message: 'This decision cannot be appealed.',
      });
    }
    try {
      await this.prisma.moderationAppeal.create({
        data: {
          appellant_id: userId,
          action_id: action.id,
          target_type: action.target_type,
          target_id: action.target_id,
          message,
        },
      });
    } catch (e) {
      // Double tap: the other request filed it first.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ErrorCode.APPEAL_NOT_ALLOWED,
          message: 'This decision was already appealed.',
        });
      }
      throw e;
    }
    // Staff package T5: an appeal after a close is a quality signal against
    // the moderator who took the action (one cheap call).
    void this.staffSignals?.signal(
      action.admin_id,
      'complaint',
      'report',
      action.target_id,
    );
    const list = await this.notices(userId);
    const mine = list.find((n) => n.actionId === action.id);
    if (!mine) throw this.notFound();
    return mine;
  }

  /** `GET /reports/mine`: what I reported and where it stands. */
  async myReports(userId: string): Promise<MyReportDto[]> {
    const rows = await this.prisma.report.findMany({
      where: { reporter_id: userId },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true,
        target_type: true,
        reason: true,
        status: true,
        created_at: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      targetType: r.target_type,
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at.toISOString(),
    }));
  }

  // ----- the moderators' side -----

  async queue(
    q: AppealQueueQueryDto,
    countries: string[] | null | undefined,
  ): Promise<{ items: AppealItemDto[]; nextCursor: string | null }> {
    const limit = q.limit ?? 20;
    const status = q.status ?? 'pending';
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const pending = status === 'pending';
    const rows = await this.prisma.moderationAppeal.findMany({
      where: {
        status,
        ...(countries
          ? { appellant: { country_code: { in: countries } } }
          : {}),
        ...(cursor
          ? {
              OR: [
                {
                  created_at: pending
                    ? { gt: cursor.createdAt }
                    : { lt: cursor.createdAt },
                },
                {
                  created_at: cursor.createdAt,
                  id: pending ? { gt: cursor.id } : { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      // Waiting appeals oldest first, decided ones newest first.
      orderBy: pending
        ? [{ created_at: 'asc' }, { id: 'asc' }]
        : [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        action: { select: { action: true, reason: true } },
        appellant: { select: { first_name: true, last_name: true } },
      },
    });
    const page = rows.slice(0, limit);
    const items: AppealItemDto[] = [];
    for (const r of page) {
      const target = await this.moderation.resolve(r.target_type, r.target_id);
      items.push({
        id: r.id,
        status: r.status,
        targetType: r.target_type,
        targetId: r.target_id,
        action: r.action.action,
        actionReason: r.action.reason,
        message: r.message,
        excerpt: target?.text ? target.text.slice(0, EXCERPT) : null,
        targetStatus: target?.status ?? null,
        appellantId: r.appellant_id,
        appellantName:
          [r.appellant.first_name, r.appellant.last_name]
            .filter(Boolean)
            .join(' ') || null,
        createdAt: r.created_at.toISOString(),
        decidedAt: r.decided_at?.toISOString() ?? null,
        decisionNote: r.decision_note,
      });
    }
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** Accept (restore the content) or keep the decision; notify the author. */
  async decide(
    admin: AdminActor,
    id: string,
    accept: boolean,
    note: string,
  ): Promise<AppealStatusName> {
    const appeal = await this.prisma.moderationAppeal.findUnique({
      where: { id },
    });
    if (!appeal) throw this.notFound();
    if (appeal.status !== 'pending') {
      throw new ConflictException({
        code: ErrorCode.APPEAL_NOT_ALLOWED,
        message: 'This appeal was already decided.',
      });
    }
    const status: AppealStatusName = accept ? 'accepted' : 'rejected';
    // Claim the appeal first: two moderators at once, the second one finds
    // it decided and never restores (or notifies) twice.
    const claimed = await this.prisma.moderationAppeal.updateMany({
      where: { id, status: 'pending' },
      data: {
        status,
        decided_by: admin.id,
        decided_at: new Date(),
        decision_note: note,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: ErrorCode.APPEAL_NOT_ALLOWED,
        message: 'This appeal was already decided.',
      });
    }
    if (accept) {
      try {
        const target = await this.moderation.resolve(
          appeal.target_type,
          appeal.target_id,
        );
        // Already published again (restored from the queue meanwhile):
        // nothing to restore, the appeal is still accepted.
        if (target && target.status !== 'published') {
          await this.adminModeration.act(
            admin,
            appeal.target_type,
            appeal.target_id,
            'restore',
            `Appeal accepted: ${note}`,
          );
        }
      } catch (e) {
        // The restore failed: the appeal goes back to the queue.
        await this.prisma.moderationAppeal.updateMany({
          where: { id, status },
          data: {
            status: 'pending',
            decided_by: null,
            decided_at: null,
            decision_note: null,
          },
        });
        throw e;
      }
    }
    // Owner 2026-10-27: winning the appeal also lifts the strike (and its limit).
    if (accept) {
      await this.strikes.revokeByAction(
        admin,
        appeal.action_id,
        `Appeal accepted: ${note}`,
      );
    }
    await this.audit.record({
      adminId: admin.id,
      action: `moderation.appeal_${status}`,
      targetType: appeal.target_type,
      targetId: appeal.target_id,
      before: { status: 'pending' },
      after: { status, note },
      ip: admin.ip,
    });
    await this.notifications.emit({
      type: 'moderation_notice',
      recipientId: appeal.appellant_id,
      payload: {
        action: `appeal_${status}`,
        targetType: appeal.target_type,
        targetId: appeal.target_id,
        reason: note,
      },
    });
    // Staff package T5: the appeal decision is a staff decision; an accepted
    // appeal also overturns the first moderator's action (one cheap call each).
    void this.staffRecorder?.record({
      adminId: admin.id,
      itemKind: 'appeal',
      itemId: id,
      outcome: accept ? 'accept' : 'reject',
    });
    if (accept) {
      void this.staffSignals?.signalForModerationAction(
        appeal.action_id,
        'overturned',
        'report',
        appeal.target_id,
      );
    }
    return status;
  }

  /** The moderators' journal: every decision with who took it. */
  async journal(
    q: JournalQueryDto,
  ): Promise<{ items: JournalItemDto[]; nextCursor: string | null }> {
    const limit = q.limit ?? 30;
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.moderationAction.findMany({
      where: cursor
        ? {
            OR: [
              { created_at: { lt: cursor.createdAt } },
              { created_at: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {},
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        appeal: { select: { status: true } },
        admin: { select: { first_name: true, last_name: true } },
      },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        reason: r.reason,
        adminId: r.admin_id,
        adminName:
          [r.admin.first_name, r.admin.last_name].filter(Boolean).join(' ') ||
          null,
        appealStatus: r.appeal?.status ?? null,
        createdAt: r.created_at.toISOString(),
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  // ----- helpers -----

  /** Only the newest hide / remove / restore of an object can be appealed. */
  private async isLatestAction(
    actionId: string,
    type: ReportTargetType,
    id: string,
  ): Promise<boolean> {
    const latest = await this.prisma.moderationAction.findFirst({
      where: {
        target_type: type,
        target_id: id,
        action: { in: ['hide', 'remove', 'restore'] },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    return latest?.id === actionId;
  }

  /** A DMCA removal has its own counter-notice (features/legal). */
  private async removedByDmca(
    type: ReportTargetType,
    id: string,
  ): Promise<boolean> {
    const n = await this.prisma.dmcaNotice.count({
      where: {
        target_type: type,
        target_id: id,
        status: { in: ['removed', 'counter_received'] },
      },
    });
    return n > 0;
  }

  private notFound() {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Decision not found.',
    });
  }
}

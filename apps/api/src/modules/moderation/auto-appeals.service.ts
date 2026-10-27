import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ModerationAutoAction } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { NotificationsService } from '../notifications/notifications.service';
import { AutoModerationService } from './auto-moderation.service';
import { ModerationService } from './moderation.service';
import { ReporterReputationService } from './reporter-reputation.service';
import { StrikesService } from './strikes.service';

const DAY_MS = 24 * 3600 * 1000;
export const AUTO_APPEAL_WINDOW_DAYS = 30;

export interface AutoActionDto {
  id: string;
  kind: string;
  userId: string;
  targetType: string | null;
  targetId: string | null;
  score: number;
  threshold: number;
  borderline: boolean;
  enforced: boolean;
  reason: string | null;
  expiresAt: string | null;
  reversedAt: string | null;
  createdAt: string;
  canAppeal: boolean;
  appealStatus: 'pending' | 'accepted' | 'rejected' | null;
  appealMessage: string | null;
  appealNote: string | null;
  appealAt: string | null;
  autoApproved: boolean;
}

type Row = ModerationAutoAction;

/**
 * Owner 2026-10-27: the only way an automatic decision reaches a person.
 * The owner appeals (once, 30 days); an admin approves (content, account and
 * strikes are restored, the reporters behind a wrong decision are
 * dismissed) or rejects. Appeals that wait past the SLA are approved by
 * themselves if the setting is on and the decision was borderline.
 */
@Injectable()
export class AutoAppealsService {
  private readonly logger = new Logger(AutoAppealsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly moderation: ModerationService,
    private readonly strikes: StrikesService,
    private readonly reporters: ReporterReputationService,
    private readonly auto: AutoModerationService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  // ----- the owner's side -----

  async mine(userId: string): Promise<AutoActionDto[]> {
    const rows = await this.prisma.moderationAutoAction.findMany({
      where: {
        user_id: userId,
        enforced: true,
        kind: { not: 'review_needed' },
        created_at: { gte: new Date(Date.now() - 90 * DAY_MS) },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.dto(r));
  }

  async appeal(
    userId: string,
    id: string,
    message: string,
  ): Promise<AutoActionDto> {
    const row = await this.prisma.moderationAutoAction.findUnique({
      where: { id },
    });
    if (!row || row.user_id !== userId || !row.enforced) throw this.notFound();
    if (!this.appealable(row)) {
      throw new ConflictException({
        code: ErrorCode.APPEAL_NOT_ALLOWED,
        message: 'This decision cannot be appealed.',
      });
    }
    const claimed = await this.prisma.moderationAutoAction.updateMany({
      where: { id, appeal_status: null },
      data: {
        appeal_message: message,
        appeal_status: 'pending',
        appeal_at: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: ErrorCode.APPEAL_NOT_ALLOWED,
        message: 'This decision was already appealed.',
      });
    }
    return this.dto(
      await this.prisma.moderationAutoAction.findUniqueOrThrow({
        where: { id },
      }),
    );
  }

  // ----- the moderators' side -----

  async queue(q: {
    status?: 'pending' | 'accepted' | 'rejected' | 'review';
    limit?: number;
  }): Promise<AutoActionDto[]> {
    const limit = Math.min(q.limit ?? 30, 100);
    const status = q.status ?? 'pending';
    const rows = await this.prisma.moderationAutoAction.findMany({
      where:
        status === 'review'
          ? { kind: 'review_needed', reversed_at: null }
          : { appeal_status: status },
      orderBy:
        status === 'pending' || status === 'review'
          ? { created_at: 'asc' }
          : { appeal_decided_at: 'desc' },
      take: limit,
    });
    return rows.map((r) => this.dto(r));
  }

  /** Closes a priority-review row after a person looked at the account. */
  async closeReview(
    admin: AdminActor,
    id: string,
    note: string,
  ): Promise<void> {
    const row = await this.prisma.moderationAutoAction.findUnique({
      where: { id },
    });
    if (!row || row.kind !== 'review_needed') throw this.notFound();
    await this.prisma.moderationAutoAction.update({
      where: { id },
      data: { reversed_at: new Date(), appeal_note: note },
    });
    await this.audit.record({
      adminId: admin.id,
      action: 'moderation.priority_review_closed',
      targetType: 'user',
      targetId: row.user_id,
      after: { note },
      ip: admin.ip,
    });
  }

  async decide(
    admin: AdminActor,
    id: string,
    accept: boolean,
    note: string,
  ): Promise<'accepted' | 'rejected'> {
    return this.decideAs(admin, id, accept, note, false);
  }

  private async decideAs(
    admin: AdminActor | null,
    id: string,
    accept: boolean,
    note: string,
    automatic: boolean,
  ): Promise<'accepted' | 'rejected'> {
    const row = await this.prisma.moderationAutoAction.findUnique({
      where: { id },
    });
    if (!row) throw this.notFound();
    if (row.appeal_status !== 'pending') {
      throw new ConflictException({
        code: ErrorCode.APPEAL_NOT_ALLOWED,
        message: 'There is no waiting appeal.',
      });
    }
    const status = accept ? 'accepted' : 'rejected';
    const claimed = await this.prisma.moderationAutoAction.updateMany({
      where: { id, appeal_status: 'pending' },
      data: {
        appeal_status: status,
        appeal_decided_by: admin?.id ?? null,
        appeal_decided_at: new Date(),
        appeal_note: note,
        appeal_auto_approved: automatic,
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
        await this.reverse(admin, row, note);
      } catch (e) {
        await this.prisma.moderationAutoAction.updateMany({
          where: { id },
          data: {
            appeal_status: 'pending',
            appeal_decided_by: null,
            appeal_decided_at: null,
            appeal_note: null,
            appeal_auto_approved: false,
          },
        });
        throw e;
      }
    }
    if (admin) {
      await this.audit.record({
        adminId: admin.id,
        action: `moderation.auto_appeal_${status}`,
        targetType: 'user',
        targetId: row.user_id,
        before: { kind: row.kind, score: row.score, threshold: row.threshold },
        after: { status, note },
        ip: admin.ip,
      });
    }
    await this.notifications.emit({
      type: 'moderation_notice',
      recipientId: row.user_id,
      payload: {
        action: `auto_appeal_${status}`,
        autoActionId: row.id,
        reason: note,
      },
    });
    await this.checkAlarm();
    return status;
  }

  /**
   * Hourly: appeals past the SLA. With `sla_auto_approve` on, the ones whose
   * automatic decision was borderline are approved; the rest stay for a
   * person (and show up as overdue in the metrics).
   */
  async sweepOverdue(): Promise<{ approved: number; overdue: number }> {
    const hours = await this.settings.number(
      'moderation.auto.appeal_sla_hours',
    );
    const onSwitch = await this.settings.boolean(
      'moderation.auto.sla_auto_approve',
    );
    const overdue = await this.prisma.moderationAutoAction.findMany({
      where: {
        appeal_status: 'pending',
        appeal_at: { lt: new Date(Date.now() - hours * 3600 * 1000) },
      },
      orderBy: { appeal_at: 'asc' },
      take: 100,
    });
    let approved = 0;
    if (onSwitch) {
      for (const r of overdue) {
        if (!r.borderline) continue;
        try {
          await this.decideAs(
            null,
            r.id,
            true,
            `Approved automatically: no review within ${hours} hours and the automatic decision was borderline.`,
            true,
          );
          approved++;
        } catch (e) {
          this.logger.error(`auto-approve failed for ${r.id}: ${String(e)}`);
        }
      }
    }
    if (overdue.length - approved > 0) {
      this.logger.warn(
        `${overdue.length - approved} moderation appeals are past the ${hours} h SLA`,
      );
    }
    return { approved, overdue: overdue.length - approved };
  }

  // ----- helpers -----

  /** Undo the decision: content, account and strikes. */
  private async reverse(
    admin: AdminActor | null,
    row: Row,
    note: string,
  ): Promise<void> {
    const now = new Date();
    const hidden: Row[] = [];
    if (row.kind === 'content_hide') hidden.push(row);
    else {
      // An account decision also undoes the content hidden automatically
      // in the same period.
      hidden.push(
        ...(await this.prisma.moderationAutoAction.findMany({
          where: {
            user_id: row.user_id,
            kind: 'content_hide',
            reversed_at: null,
            enforced: true,
            created_at: {
              gte: new Date(row.created_at.getTime() - 30 * DAY_MS),
            },
          },
        })),
      );
    }
    const decided: string[] = [];
    for (const h of hidden) {
      if (!h.target_type || !h.target_id) continue;
      const after: (() => Promise<void>)[] = [];
      const reporterIds = await withTxRetry(this.prisma, async (tx) => {
        after.length = 0;
        const target = await this.moderation.resolve(
          h.target_type!,
          h.target_id!,
          tx,
        );
        if (target && target.status !== 'published') {
          await this.moderation.setContentStatus(tx, target, 'restore', after);
        }
        const open = await tx.report.findMany({
          where: {
            target_type: h.target_type!,
            target_id: h.target_id!,
            status: 'open',
          },
          select: { id: true, reporter_id: true },
        });
        if (open.length) {
          // A wrong automatic decision: the reports behind it were unfounded.
          await tx.report.updateMany({
            where: { id: { in: open.map((r) => r.id) } },
            data: {
              status: 'dismissed',
              handled_by: admin?.id ?? null,
              handled_at: now,
              priority_review: false,
            },
          });
        }
        return open.map((r) => r.reporter_id);
      });
      for (const f of after) await f();
      decided.push(...reporterIds);
      await this.prisma.moderationAutoAction.update({
        where: { id: h.id },
        data: { reversed_at: now },
      });
      await this.strikes.revokeForTarget(
        admin,
        row.user_id,
        h.target_type,
        h.target_id,
        note,
      );
    }
    if (row.kind !== 'content_hide') {
      await this.strikes.revokeByAction(admin, row.id, note);
      if (row.kind === 'account_suspend') {
        await this.prisma.user.updateMany({
          where: {
            id: row.user_id,
            status: 'suspended',
            suspended_reason: { startsWith: 'auto:' },
          },
          data: { status: 'active', suspended_reason: null },
        });
      }
      await this.prisma.moderationAutoAction.update({
        where: { id: row.id },
        data: { reversed_at: now },
      });
    }
    if (decided.length) await this.reporters.onReportsDecided(decided);
  }

  private async checkAlarm(): Promise<void> {
    try {
      const m = await this.auto.metrics(14);
      if (m.alarm) {
        this.logger.error(
          `moderation overturn rate ${(m.overturnRate * 100).toFixed(0)}% over ${m.decidedAppeals} appeals (alarm at ${m.alarmPercent}%): raise the thresholds or use shadow mode`,
        );
      }
    } catch {
      // metrics are advisory
    }
  }

  private appealable(r: Row): boolean {
    return (
      r.enforced &&
      r.kind !== 'review_needed' &&
      r.appeal_status === null &&
      !r.reversed_at &&
      Date.now() - r.created_at.getTime() <= AUTO_APPEAL_WINDOW_DAYS * DAY_MS
    );
  }

  private dto(r: Row): AutoActionDto {
    return {
      id: r.id,
      kind: r.kind,
      userId: r.user_id,
      targetType: r.target_type,
      targetId: r.target_id,
      score: r.score,
      threshold: r.threshold,
      borderline: r.borderline,
      enforced: r.enforced,
      reason: r.reason,
      expiresAt: r.expires_at?.toISOString() ?? null,
      reversedAt: r.reversed_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
      canAppeal: this.appealable(r),
      appealStatus: r.appeal_status,
      appealMessage: r.appeal_message,
      appealNote: r.appeal_note,
      appealAt: r.appeal_at?.toISOString() ?? null,
      autoApproved: r.appeal_auto_approved,
    };
  }

  private notFound() {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Decision not found.',
    });
  }
}

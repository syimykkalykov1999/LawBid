import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { buildNotificationEmail } from '../auth/notifications/email-templates';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { EMAIL_PROVIDER } from '../auth/providers/provider.tokens';
import type {
  CustodyEntryDto,
  TransparencyReportDto,
  UserNoticeDto,
} from './legal-export.dto';
import type { UpdateDataRequestIntakeDto } from './admin-data-requests.dto';

export const LEGAL_REQUEST_AUDIT = {
  intake: 'data_request.intake',
  notice: 'data_request.notify_user',
  transparency: 'data_request.transparency',
} as const;

/** True while a gag / non-disclosure order forbids telling the user. */
export function gagInForce(
  r: { do_not_notify: boolean; nondisclosure_until: Date | null },
  now: Date,
): boolean {
  return (
    r.do_not_notify &&
    (r.nondisclosure_until === null || r.nondisclosure_until > now)
  );
}

export function renderNotice(
  template: string,
  vars: { reference: string; agency: string },
): string {
  return template
    .replace(/\{\{\s*reference\s*\}\}/g, vars.reference)
    .replace(/\{\{\s*agency\s*\}\}/g, vars.agency);
}

/**
 * Owner 2026-10-28 (legal requests): intake details of a request, the notice
 * to the person (only when no gag order is in force), the yearly
 * transparency counts and the chain-of-custody trail of a production.
 */
@Injectable()
export class LegalRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
    private readonly settings: AppSettingsService,
    @Optional()
    @Inject(EMAIL_PROVIDER)
    private readonly email?: EmailProvider,
  ) {}

  async updateIntake(
    admin: AdminActor,
    id: string,
    dto: UpdateDataRequestIntakeDto,
  ): Promise<void> {
    await this.auth.assertStepUp(admin.sessionId);
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.dataAccessRequest.findUnique({ where: { id } });
      if (!before) throw notFound('Data request not found.');
      await tx.dataAccessRequest.update({
        where: { id },
        data: {
          ...(dto.legalBasis !== undefined && { legal_basis: dto.legalBasis }),
          ...(dto.dueAt !== undefined && { due_at: new Date(dto.dueAt) }),
          ...(dto.subjectUserId !== undefined && {
            subject_user_id: dto.subjectUserId,
          }),
          ...(dto.doNotNotify !== undefined && {
            do_not_notify: dto.doNotNotify,
          }),
          ...(dto.nondisclosureUntil !== undefined && {
            nondisclosure_until: new Date(dto.nondisclosureUntil),
            // a new date restarts the expiry reminder
            nondisclosure_reminded_at: null,
          }),
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: LEGAL_REQUEST_AUDIT.intake,
          targetType: 'data_access_request',
          targetId: id,
          before: {
            legalBasis: before.legal_basis,
            dueAt: before.due_at,
            doNotNotify: before.do_not_notify,
            nondisclosureUntil: before.nondisclosure_until,
          },
          after: { ...dto },
          ip: admin.ip,
        },
        tx,
      );
    });
  }

  /** What would be sent, and whether it may be sent now. */
  async noticePreview(id: string, now = new Date()): Promise<UserNoticeDto> {
    const r = await this.prisma.dataAccessRequest.findUnique({ where: { id } });
    if (!r) throw notFound('Data request not found.');
    const user = r.subject_user_id
      ? await this.prisma.user.findUnique({
          where: withDeleted({ id: r.subject_user_id }),
          select: { email: true, ui_language: true },
        })
      : null;
    const ru = (user?.ui_language ?? '').startsWith('ru');
    const template = await this.settings.string(
      ru ? 'legal.notice_template_ru' : 'legal.notice_template_en',
    );
    const text = renderNotice(template, {
      reference: r.reference_number,
      agency: r.agency,
    });
    let blockedReason: string | null = null;
    if (gagInForce(r, now)) {
      blockedReason = 'A gag / non-disclosure order is in force.';
    } else if (r.user_notified_at) {
      blockedReason = 'The user was already notified.';
    } else if (!r.subject_user_id) {
      blockedReason = 'The request has no user attached.';
    } else if (!user?.email) {
      blockedReason = 'The user has no e-mail address.';
    }
    return {
      allowed: blockedReason === null,
      blockedReason,
      text,
      language: ru ? 'ru' : 'en',
      userNotifiedAt: r.user_notified_at?.toISOString() ?? null,
    };
  }

  async notifyUser(admin: AdminActor, id: string): Promise<UserNoticeDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const now = new Date();
    const preview = await this.noticePreview(id, now);
    if (!preview.allowed) throw bad(preview.blockedReason ?? 'Not allowed.');
    if (!this.email) throw bad('E-mail sending is not configured.');
    const r = await this.prisma.dataAccessRequest.findUniqueOrThrow({
      where: { id },
    });
    const user = await this.prisma.user.findUnique({
      where: withDeleted({ id: r.subject_user_id as string }),
      select: { email: true, ui_language: true },
    });
    await this.email.sendEmail(
      buildNotificationEmail({
        email: user?.email as string,
        title:
          preview.language === 'ru'
            ? 'Юридический запрос по вашему аккаунту'
            : 'Legal request about your account',
        body: preview.text,
        locale: user?.ui_language ?? undefined,
      }),
    );
    await withTxRetry(this.prisma, async (tx) => {
      await tx.dataAccessRequest.update({
        where: { id },
        data: { user_notified_at: now },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: LEGAL_REQUEST_AUDIT.notice,
          targetType: 'data_access_request',
          targetId: id,
          after: { userId: r.subject_user_id, language: preview.language },
          ip: admin.ip,
        },
        tx,
      );
    });
    return { ...preview, allowed: false, userNotifiedAt: now.toISOString() };
  }

  /** Counts for one calendar year (UTC), by received date. */
  async transparency(
    admin: AdminActor,
    year: number,
  ): Promise<TransparencyReportDto> {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));
    const where = { received_at: { gte: from, lt: to } };
    const [byType, byStatus, byCountry, gag, notified, subjects, holds, exp] =
      await Promise.all([
        this.prisma.dataAccessRequest.groupBy({
          by: ['request_type'],
          where,
          _count: { _all: true },
        }),
        this.prisma.dataAccessRequest.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        this.prisma.dataAccessRequest.groupBy({
          by: ['country'],
          where,
          _count: { _all: true },
        }),
        this.prisma.dataAccessRequest.count({
          where: { ...where, do_not_notify: true },
        }),
        this.prisma.dataAccessRequest.count({
          where: { ...where, user_notified_at: { not: null } },
        }),
        this.prisma.legalExport.findMany({
          where: { request: where },
          select: { subject_user_id: true },
          distinct: ['subject_user_id'],
          take: 100_000,
        }),
        this.prisma.legalHold.count({ where: { request: where } }),
        this.prisma.legalExport.count({
          where: { request: where, status: { in: ['ready', 'expired'] } },
        }),
      ]);
    const total = byType.reduce((n, r) => n + r._count._all, 0);
    await this.audit.record({
      adminId: admin.id,
      action: LEGAL_REQUEST_AUDIT.transparency,
      targetType: 'data_access_request',
      targetId: null,
      after: { year },
      ip: admin.ip,
    });
    return {
      year,
      total,
      byType: Object.fromEntries(
        byType.map((r) => [r.request_type, r._count._all]),
      ),
      byStatus: Object.fromEntries(
        byStatus.map((r) => [r.status, r._count._all]),
      ),
      byCountry: Object.fromEntries(
        byCountry.map((r) => [r.country ?? 'unknown', r._count._all]),
      ),
      accountsAffected: subjects.length,
      withGagOrder: gag,
      usersNotified: notified,
      holdsPlaced: holds,
      productionsMade: exp,
    };
  }

  /** Who did what with a production: build, every download. */
  async custody(exportId: string): Promise<CustodyEntryDto[]> {
    const row = await this.prisma.legalExport.findUnique({
      where: { id: exportId },
      select: { id: true },
    });
    if (!row) throw notFound('Export not found.');
    const rows = await this.prisma.auditLog.findMany({
      where: { target_type: 'legal_export', target_id: exportId },
      orderBy: { created_at: 'asc' },
      take: 500,
    });
    return rows.map((a) => ({
      at: a.created_at.toISOString(),
      adminId: a.admin_id,
      action: a.action,
      ip: a.ip ?? null,
      details: (a.after as Record<string, unknown> | null) ?? null,
    }));
  }
}

const notFound = (message: string) =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message });
const bad = (message: string) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message });

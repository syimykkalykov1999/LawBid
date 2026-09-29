import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ContactIssueReport, Prisma } from '@prisma/client';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { AuditLogService } from '../../admin-access/audit-log.service';
import type { AdminActor } from '../../admin-access/current-admin.decorator';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { NotificationsService } from '../../notifications/notifications.service';
import { SubscriptionAccessService } from '../../subscriptions/subscription-access.service';
import { CaseAccessPolicy } from '../policies/case-access.policy';
import type {
  ClientContactsDto,
  ContactIssueReportDto,
  ContactIssueResolutionDto,
  CreateContactIssueDto,
  ResolveContactIssueDto,
} from './dto/case-contacts.dto';

/** audit_log.action values of this service (admin actions, docs/02 §4.J). */
export const CONTACT_ISSUE_AUDIT = {
  resolve: 'contact_issue.resolve',
  suspendClient: 'client.suspend',
} as const;

/** users.suspended_reason when the §8.4 threshold is reached. */
export const SUSPENDED_REASON_CONTACT_ISSUES = 'contact_issue_reports';

/**
 * docs/04_CASES_BIDS.md §8 (stage 4.5) — the client's contacts after
 * acceptance and "Не могу связаться".
 *
 * The contacts leave the server through exactly one door (.cursorrules
 * "Контакты клиента: только GET /cases/:id/contacts после принятия бида
 * при активной подписке"): the attorney must hold a contact_disclosures
 * row for the case (written by the accept transaction) AND pass
 * SubscriptionAccessService.isActive() now (§8.3). A lapsed subscription
 * hides them; a resumed one shows them again from the same disclosure row
 * — no second row is ever written here.
 */
@Injectable()
export class CaseContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseAccess: CaseAccessPolicy,
    private readonly subscriptions: SubscriptionAccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogService,
    private readonly settings: AppSettingsService,
  ) {}

  /** GET /cases/:id/contacts (§8.1–§8.3). */
  async get(user: RequestUser, caseId: string): Promise<ClientContactsDto> {
    const disclosure = await this.disclosureFor(user, caseId);
    if (!(await this.subscriptions.isActive(user.sub))) {
      throw new ForbiddenException({
        code: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'Renew your subscription to see the client’s contacts.',
      });
    }
    const client = await this.prisma.user.findUniqueOrThrow({
      where: { id: disclosure.client_id },
      select: {
        first_name: true,
        last_name: true,
        phone_e164: true,
        email: true,
        client_profile: {
          select: {
            preferred_contact_method: true,
            preferred_contact_note: true,
          },
        },
      },
    });
    return {
      caseId,
      bidId: disclosure.bid_id,
      firstName: client.first_name,
      lastName: client.last_name,
      phone: client.phone_e164,
      email: client.email,
      contactMethod: client.client_profile?.preferred_contact_method ?? null,
      contactNote: client.client_profile?.preferred_contact_note ?? null,
      disclosedAt: disclosure.disclosed_at.toISOString(),
    };
  }

  /** POST /cases/:id/contact-issues (§8.4): available once the contacts
   * were disclosed; one open report per bid at a time. */
  async report(
    user: RequestUser,
    caseId: string,
    dto: CreateContactIssueDto,
  ): Promise<ContactIssueReportDto> {
    const disclosure = await this.disclosureFor(user, caseId);
    // Check-then-create under the bid row lock: concurrent taps can't open
    // two reports for one bid (security review, file 04).
    const created = await withTxRetry(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM bids WHERE id = ${disclosure.bid_id}::UUID FOR UPDATE`;
      const open = await tx.contactIssueReport.findFirst({
        where: { bid_id: disclosure.bid_id, status: 'open' },
        select: { id: true },
      });
      if (open) {
        throw new ConflictException({
          code: ErrorCode.CONTACT_ISSUE_ALREADY_OPEN,
          message: 'Your previous report on this case is still being reviewed.',
          details: { reportId: open.id },
        });
      }
      return tx.contactIssueReport.create({
        data: {
          case_id: caseId,
          bid_id: disclosure.bid_id,
          attorney_id: user.sub,
          client_id: disclosure.client_id,
          issue_type: dto.issueType,
          note: dto.note ?? null,
          status: 'open',
        },
      });
    });
    return toReportDto(created);
  }

  /** POST /admin/contact-issues/:id/resolve (§8.4): support decides;
   * both sides get `contact_issue_update`; on `confirmed` the client gets
   * a `moderation_notice`, and once their confirmed reports reach
   * contacts.suspend_after_confirmed_reports the account is suspended.
   * Audit rows for the decision and for the suspension. */
  async resolve(
    admin: AdminActor,
    reportId: string,
    dto: ResolveContactIssueDto,
  ): Promise<ContactIssueResolutionDto> {
    const threshold = await this.settings.number(
      'contacts.suspend_after_confirmed_reports',
    );
    return withTxRetry(this.prisma, async (tx) => {
      const report = await tx.contactIssueReport.findUnique({
        where: { id: reportId },
      });
      if (!report) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Report not found.',
        });
      }
      if (report.status !== 'open') {
        throw new ConflictException({
          code: ErrorCode.CONTACT_ISSUE_INVALID_STATE,
          message: 'This report has already been resolved.',
          details: { status: report.status },
        });
      }
      const now = new Date();
      const resolved = await tx.contactIssueReport.update({
        where: { id: reportId },
        data: {
          status: dto.decision,
          resolved_by: admin.id,
          resolved_at: now,
          resolution_note: dto.note,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CONTACT_ISSUE_AUDIT.resolve,
          targetType: 'contact_issue_report',
          targetId: reportId,
          before: { status: 'open' },
          after: { status: dto.decision, note: dto.note },
          ip: admin.ip,
        },
        tx,
      );
      const base = {
        reportId,
        caseId: report.case_id,
        bidId: report.bid_id,
        decision: dto.decision,
      };
      for (const recipientId of [report.attorney_id, report.client_id]) {
        await this.notifications.emit(
          { type: 'contact_issue_update', recipientId, payload: base },
          tx,
        );
      }

      let confirmedReports = 0;
      let clientSuspended = false;
      if (dto.decision === 'confirmed') {
        confirmedReports = await tx.contactIssueReport.count({
          where: { client_id: report.client_id, status: 'confirmed' },
        });
        const client = await tx.user.findUniqueOrThrow({
          where: { id: report.client_id },
          select: { status: true, suspended_reason: true },
        });
        if (confirmedReports >= threshold && client.status === 'active') {
          await tx.user.update({
            where: { id: report.client_id },
            data: {
              status: 'suspended',
              suspended_reason: SUSPENDED_REASON_CONTACT_ISSUES,
            },
          });
          await this.audit.record(
            {
              adminId: admin.id,
              action: CONTACT_ISSUE_AUDIT.suspendClient,
              targetType: 'user',
              targetId: report.client_id,
              before: {
                status: client.status,
                suspendedReason: client.suspended_reason,
              },
              after: {
                status: 'suspended',
                suspendedReason: SUSPENDED_REASON_CONTACT_ISSUES,
                confirmedReports,
                threshold,
                triggerReportId: reportId,
              },
              ip: admin.ip,
            },
            tx,
          );
          clientSuspended = true;
        }
        await this.notifications.emit(
          {
            type: 'moderation_notice',
            recipientId: report.client_id,
            payload: {
              reason: 'contact_issue_confirmed',
              reportId,
              caseId: report.case_id,
              confirmedReports,
              threshold,
              accountSuspended: clientSuspended,
            },
          },
          tx,
        );
      }
      return {
        report: toReportDto(resolved),
        confirmedReports,
        clientSuspended,
      };
    });
  }

  /** The attorney's disclosure on this case, or the right refusal:
   * non-attorneys 403 FORBIDDEN, no access to the case 404
   * (CaseAccessPolicy, deny by default), no accepted bid 403
   * CONTACTS_LOCKED. */
  private async disclosureFor(
    user: RequestUser,
    caseId: string,
  ): Promise<{ bid_id: string; client_id: string; disclosed_at: Date }> {
    if (user.role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the attorney whose bid was accepted can see this.',
      });
    }
    await this.caseAccess.assertCanView(
      { userId: user.sub, role: 'attorney' },
      caseId,
    );
    const disclosure = await this.prisma.contactDisclosure.findFirst({
      where: { case_id: caseId, attorney_id: user.sub },
      orderBy: { disclosed_at: 'desc' },
      select: { bid_id: true, client_id: true, disclosed_at: true },
    });
    if (!disclosure) {
      throw new ForbiddenException({
        code: ErrorCode.CONTACTS_LOCKED,
        message:
          'The client’s contacts are shared only after your bid is accepted.',
      });
    }
    return disclosure;
  }
}

export function toReportDto(r: ContactIssueReport): ContactIssueReportDto {
  return {
    id: r.id,
    caseId: r.case_id,
    bidId: r.bid_id,
    issueType: r.issue_type,
    note: r.note,
    status: r.status,
    resolvedAt: r.resolved_at?.toISOString() ?? null,
    resolutionNote: r.resolution_note,
    createdAt: r.created_at.toISOString(),
  };
}

/** Narrow re-export so controllers don't import Prisma for the type. */
export type ContactIssueTx = Prisma.TransactionClient;

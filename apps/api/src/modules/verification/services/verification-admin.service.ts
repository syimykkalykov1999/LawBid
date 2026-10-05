import { type CountryScope, userInScope } from '../../countries/country-scope';
import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AttorneyLicense,
  Prisma,
  State,
  VerificationStatus,
} from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../../common/pagination/cursor.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { AttorneyTrustService } from '../../attorney-trust/attorney-trust.service';
import {
  BLOCK_SOURCE,
  BarNumberBlocksService,
} from '../../attorney-trust/bar-number-blocks.service';
import { AuditLogService } from '../../admin-access/audit-log.service';
import { BidStateMachine } from '../../bids/domain/bid-state-machine';
import { CaseJournalService } from '../../journal/case-journal.service';
import type { AdminActor } from '../../admin-auth/admin-auth.decorators';
import { RateLimitService } from '../../auth/services/rate-limit.service';
import { FilesService } from '../../files/files.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { notFound } from '../../profiles/services/profile-access';
import {
  QUEUE_PAGE_DEFAULT,
  type AdminLicenseDto,
  type AdminVerificationRequestDto,
  type AttorneyVerificationStatusDto,
  type DocumentUrlDto,
  type LicenseDecisionDto,
  type LicenseRecheckDto,
  type RegistryCheckDto,
  type RegistryFlagItemDto,
  type RejectRequestDto,
  type VerificationQueuePage,
  type VerificationQueueQueryDto,
} from '../dto/admin-verification.dto';
import { VerificationProviderSelector } from '../providers/verification-provider.selector';
import type { CheckOutcome } from '../providers/verification-providers';
import {
  AUDIT_ACTION,
  DOCUMENT_URL_LIMIT_PER_ADMIN_PER_HOUR,
  LICENSE_RECHECK_NOTE_PREFIX,
  OPEN_REQUEST_STATUSES,
  VERIFICATION_NOTIFICATION_KIND as KIND,
  IDENTITY_DOC_TYPES,
} from '../verification.constants';
import { stateBarLookupUrl } from '../state-bar-links';
import {
  httpError,
  invalidStatus,
  isoDay,
  syncProfileStatus,
} from '../verification.helpers';
import { VerificationChecksService } from './verification-checks.service';

type Tx = Prisma.TransactionClient;

const CARD_INCLUDE = {
  documents: {
    include: {
      file: {
        select: { mime: true, size_bytes: true, scan_status: true },
      },
    },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  },
  checks: { orderBy: [{ checked_at: 'asc' }, { id: 'asc' }] },
  attorney: {
    include: {
      user: { select: { first_name: true, last_name: true } },
      licenses: {
        include: { state: true },
        orderBy: [{ state_code: 'asc' }, { created_at: 'asc' }],
      },
    },
  },
} satisfies Prisma.VerificationRequestInclude;

/**
 * Verifier API (docs/03 §2.5, stage 3.4). Access (verifier/super_admin)
 * is enforced by AdminAuthGuard on the controller. Every decision and
 * every document view writes an `audit_log` row in the same transaction
 * as the change; attorney-facing events emit `verification_update`
 * (§2.7) through NotificationsService.
 *
 * Locking (§2.3 "1 верификатор на заявку"): `take` moves `submitted` →
 * `in_review` with reviewed_by = the verifier via a conditional update;
 * only that verifier may then decide.
 */
@Injectable()
export class VerificationAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly checks: VerificationChecksService,
    private readonly selector: VerificationProviderSelector,
    private readonly rateLimit: RateLimitService,
    private readonly bidMachine: BidStateMachine,
    private readonly journal: CaseJournalService,
    private readonly trust: AttorneyTrustService,
    private readonly blocks: BarNumberBlocksService,
  ) {}

  /** §2.5.1: oldest submission first; keyset cursor on (submitted_at, id). */
  async queue(
    query: VerificationQueueQueryDto,
    countries: CountryScope = null,
  ): Promise<VerificationQueuePage> {
    const limit = query.limit ?? QUEUE_PAGE_DEFAULT;
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.verificationRequest.findMany({
      where: {
        // Owner 2026-10-05: a verifier for one country sees only its
        // attorneys.
        ...(countries && {
          AND: [{ attorney: { user: userInScope(countries) } }],
        }),
        status: {
          in: query.status ? [query.status] : ['submitted', 'needs_more_info'],
        },
        submitted_at: { not: null },
        ...(query.stateCode && {
          attorney: {
            licenses: {
              some: { state_code: query.stateCode, license_status: 'pending' },
            },
          },
        }),
        ...(after && {
          OR: [
            { submitted_at: { gt: after.createdAt } },
            { submitted_at: after.createdAt, id: { gt: after.id } },
          ],
        }),
      },
      orderBy: [{ submitted_at: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: {
        attorney: {
          include: {
            user: { select: { first_name: true, last_name: true } },
            licenses: {
              where: { license_status: 'pending' },
              select: { state_code: true },
              orderBy: { state_code: 'asc' },
            },
          },
        },
      },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        status: r.status,
        submittedAt: r.submitted_at?.toISOString() ?? null,
        attorney: {
          id: r.attorney.user_id,
          firstName: r.attorney.user.first_name,
          lastName: r.attorney.user.last_name,
          username: r.attorney.username,
          verificationStatus: r.attorney.verification_status,
        },
        stateCodes: [...new Set(r.attorney.licenses.map((l) => l.state_code))],
        reviewerId: r.reviewed_by,
        adminNote: r.admin_note,
      })),
      nextCursor:
        rows.length > limit && last?.submitted_at
          ? encodeCursor({ createdAt: last.submitted_at, id: last.id })
          : null,
    };
  }

  /** §2.5.2 request card. */
  async card(
    requestId: string,
    countries: CountryScope = null,
  ): Promise<AdminVerificationRequestDto> {
    const row = await this.prisma.verificationRequest.findFirst({
      where: {
        id: requestId,
        ...(countries && { attorney: { user: userInScope(countries) } }),
      },
      include: CARD_INCLUDE,
    });
    if (!row) throw notFound('Verification request not found.');
    const history = await this.prisma.verificationRequest.findMany({
      where: { attorney_id: row.attorney_id, id: { not: row.id } },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return {
      id: row.id,
      status: row.status,
      provider: row.provider,
      submittedAt: row.submitted_at?.toISOString() ?? null,
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      reviewerId: row.reviewed_by,
      attestedAt: row.attested_at?.toISOString() ?? null,
      attestationIp: row.attestation_ip,
      attestationVersion: row.attestation_version,
      applicantComment: row.applicant_comment,
      infoRequestMessage: row.info_request_message,
      rejectionCode: row.rejection_code,
      rejectionReason: row.rejection_reason,
      adminNote: row.admin_note,
      createdAt: row.created_at.toISOString(),
      attorney: {
        id: row.attorney.user_id,
        firstName: row.attorney.user.first_name,
        lastName: row.attorney.user.last_name,
        username: row.attorney.username,
        verificationStatus: row.attorney.verification_status,
      },
      licenses: row.attorney.licenses.map(licenseDto),
      documents: row.documents.map((d) => ({
        id: d.id,
        docType: d.doc_type,
        side: d.side === 'front' || d.side === 'back' ? d.side : null,
        stateCode: d.state_code,
        mime: d.file.mime,
        sizeBytes: Number(d.file.size_bytes),
        scanStatus: d.file.scan_status,
        createdAt: d.created_at.toISOString(),
      })),
      checks: row.checks.map((c) => ({
        id: c.id,
        checkType: c.check_type,
        provider: c.provider,
        result: c.result,
        details: asObject(c.details) ?? {},
        checkedAt: c.checked_at.toISOString(),
      })),
      history: history.map((h) => ({
        id: h.id,
        status: h.status,
        submittedAt: h.submitted_at?.toISOString() ?? null,
        reviewedAt: h.reviewed_at?.toISOString() ?? null,
        rejectionCode: h.rejection_code,
        createdAt: h.created_at.toISOString(),
      })),
    };
  }

  /** §2.2: a 5-minute signed link (verification.signed_url_ttl_sec); the
   * view is written to audit_log before the link is returned. Rate-limited
   * per verifier (DOCUMENT_URL_LIMIT_PER_ADMIN_PER_HOUR). */
  async documentUrl(
    admin: AdminActor,
    documentId: string,
  ): Promise<DocumentUrlDto> {
    const limit = await this.rateLimit.consumeFixedWindow(
      ['verification-document-url', 'admin', admin.id],
      DOCUMENT_URL_LIMIT_PER_ADMIN_PER_HOUR,
      3600,
    );
    if (!limit.allowed) {
      throw httpError(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RATE_LIMITED,
        'Too many document views. Try again later.',
        { retryAfterSeconds: limit.retryAfterSeconds },
      );
    }
    const doc = await this.prisma.verificationDocument.findUnique({
      where: { id: documentId },
      select: { id: true, request_id: true, file_id: true, doc_type: true },
    });
    if (!doc) throw notFound('Document not found.');
    const link = await this.files.verificationFileUrl(doc.file_id);
    await this.audit.record({
      adminId: admin.id,
      action: AUDIT_ACTION.documentView,
      targetType: 'verification_document',
      targetId: doc.id,
      after: {
        requestId: doc.request_id,
        fileId: doc.file_id,
        docType: doc.doc_type,
        expiresAt: link.expiresAt,
      },
      ip: admin.ip,
      // docs/06 §2.1: the reason given in X-Justification.
      justification: admin.justification,
    });
    return link;
  }

  /** "Взять в работу": submitted → in_review, locked to this verifier.
   * Repeating it by the same verifier is a no-op. */
  async take(
    admin: AdminActor,
    requestId: string,
    now = new Date(),
  ): Promise<AdminVerificationRequestDto> {
    await withTxRetry(this.prisma, async (tx) => {
      const req = await this.requestOr404(tx, requestId);
      if (req.status === 'in_review') {
        if (req.reviewed_by === admin.id) return;
        throw locked(req.reviewed_by);
      }
      if (req.status !== 'submitted') throw invalidStatus(req.status);
      const { count } = await tx.verificationRequest.updateMany({
        where: { id: req.id, status: 'submitted' },
        data: { status: 'in_review', reviewed_by: admin.id },
      });
      if (count === 0) throw locked(null);
      await syncProfileStatus(tx, req.attorney_id, 'in_review', now);
      await this.audit.record(
        {
          adminId: admin.id,
          action: AUDIT_ACTION.take,
          targetType: 'verification_request',
          targetId: req.id,
          before: { status: req.status },
          after: { status: 'in_review', reviewedBy: admin.id },
          ip: admin.ip,
        },
        tx,
      );
      await this.notify(tx, req.attorney_id, {
        kind: KIND.inReview,
        requestId: req.id,
      });
    });
    return this.card(requestId);
  }

  /** "Подтвердить / Отклонить лицензию" (§2.3: each license separately).
   * Allowed on the attorney's `pending` licenses, and — to correct a
   * mistake — on those this verifier already decided in this review. */
  async decideLicense(
    admin: AdminActor,
    requestId: string,
    licenseId: string,
    dto: LicenseDecisionDto,
    now = new Date(),
  ): Promise<AdminVerificationRequestDto> {
    await withTxRetry(this.prisma, async (tx) => {
      const req = await this.myReview(tx, admin, requestId);
      const license = await tx.attorneyLicense.findUnique({
        where: { id: licenseId },
      });
      if (!license || license.attorney_id !== req.attorney_id) {
        throw notFound('License not found.');
      }
      const decidedHere =
        license.verified_by === admin.id &&
        (license.license_status === 'verified' ||
          license.license_status === 'rejected') &&
        req.submitted_at !== null &&
        license.updated_at >= req.submitted_at;
      if (license.license_status !== 'pending' && !decidedHere) {
        throw invalidStatus(req.status, {
          licenseStatus: license.license_status,
        });
      }
      const data: Prisma.AttorneyLicenseUpdateInput =
        dto.decision === 'verified'
          ? {
              license_status: 'verified',
              verified_at: now,
              verifier: { connect: { id: admin.id } },
              rejection_code: null,
              rejection_note: dto.note || null,
            }
          : {
              license_status: 'rejected',
              verifier: { connect: { id: admin.id } },
              rejection_code: dto.rejectionCode ?? 'other',
              rejection_note: dto.note || null,
            };
      await tx.attorneyLicense.update({ where: { id: license.id }, data });
      await this.audit.record(
        {
          adminId: admin.id,
          action: AUDIT_ACTION.licenseDecision,
          targetType: 'attorney_license',
          targetId: license.id,
          before: {
            status: license.license_status,
            rejectionCode: license.rejection_code,
          },
          after: {
            requestId: req.id,
            status: dto.decision,
            rejectionCode:
              dto.decision === 'rejected'
                ? (dto.rejectionCode ?? 'other')
                : null,
            note: dto.note || null,
          },
          ip: admin.ip,
        },
        tx,
      );
      await this.trust.recompute(
        req.attorney_id,
        { type: 'admin', id: admin.id },
        tx,
      );
    });
    return this.card(requestId);
  }

  /** "Одобрить заявку" (§2.3): every license of the request decided and at
   * least one verified license. Partial approval is fine. */
  async approve(
    admin: AdminActor,
    requestId: string,
    now = new Date(),
  ): Promise<AdminVerificationRequestDto> {
    await withTxRetry(this.prisma, async (tx) => {
      const req = await this.myReview(tx, admin, requestId);
      const licenses = await tx.attorneyLicense.findMany({
        where: { attorney_id: req.attorney_id },
        select: {
          id: true,
          license_status: true,
          verified_by: true,
          updated_at: true,
        },
      });
      const pending = licenses.filter((l) => l.license_status === 'pending');
      if (pending.length > 0) {
        throw decisionIncomplete({
          pendingLicenseIds: pending.map((l) => l.id),
        });
      }
      if (!licenses.some((l) => l.license_status === 'verified')) {
        throw decisionIncomplete({ reason: 'no_verified_license' });
      }
      const partial = licenses.some(
        (l) =>
          l.license_status === 'rejected' &&
          l.verified_by === admin.id &&
          req.submitted_at !== null &&
          l.updated_at >= req.submitted_at,
      );
      await tx.verificationRequest.update({
        where: { id: req.id },
        data: { status: 'approved', reviewed_at: now },
      });
      await syncProfileStatus(tx, req.attorney_id, 'approved', now);
      await this.audit.record(
        {
          adminId: admin.id,
          action: AUDIT_ACTION.approve,
          targetType: 'verification_request',
          targetId: req.id,
          before: { status: req.status },
          after: { status: 'approved', partial },
          ip: admin.ip,
        },
        tx,
      );
      await this.notify(tx, req.attorney_id, {
        kind: KIND.approved,
        requestId: req.id,
        partial,
      });
      // Owner 2026-10-05 (trust levels): a verifier who approved a request
      // carrying an identity document and a selfie has checked the
      // documents — identity confirmed by staff.
      const docs = await tx.verificationDocument.findMany({
        where: { request_id: req.id },
        select: { doc_type: true },
      });
      const types = new Set<string>(docs.map((d) => d.doc_type));
      const identity = IDENTITY_DOC_TYPES.some((t) => types.has(t));
      const actor = { type: 'admin' as const, id: admin.id, ip: admin.ip };
      if (identity && types.has('selfie')) {
        await this.trust.confirmDocuments(
          req.attorney_id,
          actor,
          `request ${req.id}`,
          tx,
        );
      }
      // Owner 2026-10-05 05:53: a verifier who approved the request by hand
      // has vouched for the attorney — the same «Подтвердить» as in the
      // anti-fraud queue: badge and payments open, no re-checks except
      // complaints, and the decision (who, when, what they saw) is recorded.
      // The attorney already got the `approved` notice.
      await this.trust.clearByStaff(
        req.attorney_id,
        actor,
        `request ${req.id}`,
        { tx, notify: false },
      );
    });
    return this.card(requestId);
  }

  /** "Запросить информацию": in_review → needs_more_info with a message
   * shown to the attorney (info_request_message). */
  async requestInfo(
    admin: AdminActor,
    requestId: string,
    message: string,
    now = new Date(),
  ): Promise<AdminVerificationRequestDto> {
    await withTxRetry(this.prisma, async (tx) => {
      const req = await this.myReview(tx, admin, requestId);
      await tx.verificationRequest.update({
        where: { id: req.id },
        data: { status: 'needs_more_info', info_request_message: message },
      });
      await syncProfileStatus(tx, req.attorney_id, 'needs_more_info', now);
      await this.audit.record(
        {
          adminId: admin.id,
          action: AUDIT_ACTION.requestInfo,
          targetType: 'verification_request',
          targetId: req.id,
          before: {
            status: req.status,
            infoRequestMessage: req.info_request_message,
          },
          after: { status: 'needs_more_info', infoRequestMessage: message },
          ip: admin.ip,
        },
        tx,
      );
      await this.notify(tx, req.attorney_id, {
        kind: KIND.needsMoreInfo,
        requestId: req.id,
        message,
      });
    });
    return this.card(requestId);
  }

  /** "Отклонить" with a reason code + comment. Undecided licenses are
   * rejected with the same code. A verified attorney whose add-state
   * request is rejected stays verified while a verified license remains
   * (§2.6: none left → unverified). */
  async reject(
    admin: AdminActor,
    requestId: string,
    dto: RejectRequestDto,
    now = new Date(),
  ): Promise<AdminVerificationRequestDto> {
    await withTxRetry(this.prisma, async (tx) => {
      const req = await this.myReview(tx, admin, requestId);
      await tx.attorneyLicense.updateMany({
        where: { attorney_id: req.attorney_id, license_status: 'pending' },
        data: {
          license_status: 'rejected',
          verified_by: admin.id,
          rejection_code: dto.rejectionCode,
        },
      });
      await tx.verificationRequest.update({
        where: { id: req.id },
        data: {
          status: 'rejected',
          reviewed_at: now,
          rejection_code: dto.rejectionCode,
          rejection_reason: dto.comment || null,
        },
      });
      await syncProfileStatus(tx, req.attorney_id, 'rejected', now);
      const verifiedLeft = await tx.attorneyLicense.count({
        where: { attorney_id: req.attorney_id, license_status: 'verified' },
      });
      if (verifiedLeft === 0) {
        await tx.attorneyProfile.updateMany({
          where: { user_id: req.attorney_id, verification_status: 'verified' },
          data: { verification_status: 'unverified' },
        });
      }
      await this.trust.recompute(
        req.attorney_id,
        { type: 'admin', id: admin.id },
        tx,
      );
      await this.audit.record(
        {
          adminId: admin.id,
          action: AUDIT_ACTION.reject,
          targetType: 'verification_request',
          targetId: req.id,
          before: { status: req.status },
          after: {
            status: 'rejected',
            rejectionCode: dto.rejectionCode,
            comment: dto.comment || null,
          },
          ip: admin.ip,
        },
        tx,
      );
      await this.notify(tx, req.attorney_id, {
        kind: KIND.rejected,
        requestId: req.id,
        rejectionCode: dto.rejectionCode,
      });
      // Owner 2026-10-05 07:00: the rejected bar numbers stay blocked for
      // re-registration until staff unblock them (`trust.block_on_reject`).
      if (await this.blocks.blockOnReject()) {
        await this.blocks.blockAttorney(
          req.attorney_id,
          { type: 'admin', id: admin.id, ip: admin.ip },
          dto.comment || `Verification rejected: ${dto.rejectionCode}`,
          BLOCK_SOURCE.verificationReject,
          tx,
        );
      }
    });
    return this.card(requestId);
  }

  /**
   * `recheck` (§2.5): runs the bar lookup again with the currently
   * selected provider. A `pass` just refreshes auto_check_result;
   * anything else queues the license for manual review — the license
   * goes to `pending` inside the attorney's open request, or a new
   * `submitted` request (admin_note `license_recheck: …`).
   */
  async recheck(
    admin: AdminActor,
    licenseId: string,
    now = new Date(),
  ): Promise<LicenseRecheckDto> {
    const license = await this.prisma.attorneyLicense.findUnique({
      where: { id: licenseId },
      include: {
        state: true,
        attorney: {
          select: { user: { select: { first_name: true, last_name: true } } },
        },
      },
    });
    if (!license) throw notFound('License not found.');
    if (license.license_status === 'pending') {
      throw httpError(
        HttpStatus.CONFLICT,
        ErrorCode.VERIFICATION_INVALID_STATUS,
        'The license is already under review.',
        { licenseStatus: license.license_status },
      );
    }
    const provider = await this.selector.barLookup();
    const outcome = await this.checks.barLookup(provider, license, null, {
      firstName: license.attorney.user.first_name ?? '',
      lastName: license.attorney.user.last_name ?? '',
    });
    const requestId = await withTxRetry(this.prisma, async (tx) => {
      const queuedIn =
        outcome.result !== 'pass'
          ? await this.queueForReview(tx, license, outcome, provider.name, now)
          : null;
      await this.audit.record(
        {
          adminId: admin.id,
          action: AUDIT_ACTION.recheck,
          targetType: 'attorney_license',
          targetId: license.id,
          before: { status: license.license_status },
          after: {
            status: queuedIn ? 'pending' : license.license_status,
            result: outcome.result,
            lookupProvider: provider.name,
            requestId: queuedIn,
          },
          ip: admin.ip,
        },
        tx,
      );
      return queuedIn;
    });
    const fresh = await this.prisma.attorneyLicense.findUniqueOrThrow({
      where: { id: license.id },
      include: { state: true },
    });
    return { license: licenseDto(fresh), result: outcome.result, requestId };
  }

  /**
   * Owner 2026-10-05: licenses the state registry disagreed with after a
   * self-attested approval (Admin → Проверка → "Сверка с реестром"),
   * newest first. They stay verified until an admin acts.
   */
  async registryFlags(limit = 100): Promise<RegistryFlagItemDto[]> {
    const rows = await this.prisma.attorneyLicense.findMany({
      where: { registry_flag: { not: null } },
      orderBy: [{ registry_flagged_at: 'desc' }, { id: 'asc' }],
      take: limit,
      include: {
        state: true,
        attorney: {
          include: {
            user: { select: { first_name: true, last_name: true } },
            verification_requests: {
              orderBy: { created_at: 'desc' },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });
    return rows.map((l) => ({
      attorney: {
        id: l.attorney.user_id,
        firstName: l.attorney.user.first_name,
        lastName: l.attorney.user.last_name,
        username: l.attorney.username,
        verificationStatus: l.attorney.verification_status,
      },
      license: licenseDto(l),
      latestRequestId: l.attorney.verification_requests[0]?.id ?? null,
    }));
  }

  /**
   * Owner 2026-10-05: "Проверить по реестру" — one lookup now, whatever the
   * license status; the result is stored on the license and, for a
   * verified license, sets or clears its registry flag. Nothing else
   * changes (unlike `recheck`, which queues a non-pass for review).
   */
  async registryCheck(
    admin: AdminActor,
    licenseId: string,
  ): Promise<RegistryCheckDto> {
    const license = await this.prisma.attorneyLicense.findUnique({
      where: { id: licenseId },
      include: {
        attorney: {
          select: { user: { select: { first_name: true, last_name: true } } },
        },
      },
    });
    if (!license) throw notFound('License not found.');
    const provider = await this.selector.barLookup();
    const outcome = await this.checks.barLookup(provider, license, null, {
      firstName: license.attorney.user.first_name ?? '',
      lastName: license.attorney.user.last_name ?? '',
    });
    if (license.license_status === 'verified') {
      await this.checks.applyRegistryFlag(license.id, outcome);
    }
    await this.audit.record({
      adminId: admin.id,
      action: AUDIT_ACTION.registryCheck,
      targetType: 'attorney_license',
      targetId: license.id,
      before: { flag: license.registry_flag },
      after: {
        result: outcome.result,
        reason:
          typeof outcome.details.reason === 'string'
            ? outcome.details.reason
            : null,
      },
      ip: admin.ip,
    });
    const fresh = await this.prisma.attorneyLicense.findUniqueOrThrow({
      where: { id: license.id },
      include: { state: true },
    });
    return {
      license: licenseDto(fresh),
      result: outcome.result,
      details: outcome.details,
    };
  }

  /** Owner 2026-10-05: the admin looked at a registry difference and
   * keeps the license as it is. */
  async clearRegistryFlag(
    admin: AdminActor,
    licenseId: string,
  ): Promise<AdminLicenseDto> {
    const license = await this.prisma.attorneyLicense.findUnique({
      where: { id: licenseId },
    });
    if (!license) throw notFound('License not found.');
    const updated = await this.prisma.attorneyLicense.update({
      where: { id: licenseId },
      data: { registry_flag: null, registry_flagged_at: null },
      include: { state: true },
    });
    await this.audit.record({
      adminId: admin.id,
      action: AUDIT_ACTION.registryFlagClear,
      targetType: 'attorney_license',
      targetId: license.id,
      before: { flag: license.registry_flag },
      after: { flag: null },
      ip: admin.ip,
    });
    await this.trust.recompute(license.attorney_id, {
      type: 'admin',
      id: admin.id,
    });
    return licenseDto(updated);
  }

  /**
   * Owner 2026-10-04: monthly re-check of verified licenses in states with
   * an enabled registry (job `licenses.registry-recheck`). Only a definite
   * `fail` (number gone, status no longer "Currently registered") queues
   * the license for a verifier exactly like the manual re-check; a name
   * difference or a registry error changes nothing. Returns the lookup
   * result, or null when automatic lookups are off.
   */
  async registryRecheck(
    licenseId: string,
    now = new Date(),
  ): Promise<CheckOutcome['result'] | null> {
    const provider = await this.selector.barLookup();
    const license = await this.prisma.attorneyLicense.findUnique({
      where: { id: licenseId },
      include: {
        attorney: {
          select: { user: { select: { first_name: true, last_name: true } } },
        },
      },
    });
    if (!license || license.license_status !== 'verified') return null;
    if (!(await provider.supports(license.state_code))) return null;
    const outcome = await this.checks.barLookup(provider, license, null, {
      firstName: license.attorney.user.first_name ?? '',
      lastName: license.attorney.user.last_name ?? '',
    });
    if (outcome.result === 'fail') {
      await withTxRetry(this.prisma, (tx) =>
        this.queueForReview(tx, license, outcome, provider.name, now),
      );
    }
    return outcome.result;
  }

  /** Puts [license] back to `pending` inside the attorney's open request,
   * or a new `submitted` one (admin_note `license_recheck: …`), with the
   * lookup stored as its `bar_lookup` check. Returns the request id. */
  private async queueForReview(
    tx: Tx,
    license: Pick<AttorneyLicense, 'id' | 'attorney_id' | 'state_code'>,
    outcome: CheckOutcome,
    lookupProvider: string,
    now: Date,
  ): Promise<string> {
    await tx.attorneyLicense.update({
      where: { id: license.id },
      data: { license_status: 'pending' },
    });
    const open = await tx.verificationRequest.findFirst({
      where: {
        attorney_id: license.attorney_id,
        status: { in: [...OPEN_REQUEST_STATUSES] },
      },
      select: { id: true },
    });
    const queuedIn =
      open?.id ??
      (
        await tx.verificationRequest.create({
          data: {
            attorney_id: license.attorney_id,
            status: 'submitted',
            submitted_at: now,
            admin_note: `${LICENSE_RECHECK_NOTE_PREFIX}: ${license.state_code} ${license.id}`,
          },
          select: { id: true },
        })
      ).id;
    await tx.verificationCheck.create({
      data: {
        request_id: queuedIn,
        check_type: 'bar_lookup',
        provider: 'manual',
        result: outcome.result,
        details: {
          ...outcome.details,
          lookupProvider,
          licenseId: license.id,
          stateCode: license.state_code,
          recheck: true,
        },
        checked_at: now,
      },
    });
    return queuedIn;
  }

  /**
   * `suspend` (§2.5, §6.1): verification_status = suspended — the public
   * profile answers 404 and the attorney is out of search/recommendations;
   * active bids → `withdrawn` in the same transaction through the
   * BidStateMachine (`system_withdraw`) with a journal row per bid
   * (docs/04 §14); accepted cases stay.
   */
  async suspend(
    admin: AdminActor,
    attorneyId: string,
    reason: string,
  ): Promise<AttorneyVerificationStatusDto> {
    return withTxRetry(this.prisma, async (tx) => {
      const profile = await this.profileOr404(tx, attorneyId);
      if (profile.verification_status === 'suspended') {
        throw profileInvalid(profile.verification_status);
      }
      return (await this.suspendInTx(tx, admin, attorneyId, reason))!;
    });
  }

  /** docs/04 §14: every bid transition goes through the state machine and
   * leaves a journal row; suspension withdraws the attorney's active bids. */
  private async withdrawActiveBids(
    tx: Tx,
    attorneyId: string,
    reason: string,
  ): Promise<number> {
    const results = await this.bidMachine.applyToActive(
      tx,
      { attorneyId },
      'system_withdraw',
    );
    if (results.length === 0) return 0;
    const cases = await tx.case.findMany({
      where: { id: { in: results.map((r) => r.case_id) } },
      select: { id: true, client_id: true },
    });
    const clientOf = new Map(cases.map((c) => [c.id, c.client_id]));
    for (const r of results) {
      const clientId = clientOf.get(r.case_id);
      if (!clientId) continue;
      await this.journal.append(tx, {
        caseId: r.case_id,
        clientId,
        actor: { userId: null, role: null },
        attorneyId,
        event: r.plan.event,
        payload: { bidId: r.id, reason: 'attorney_suspended', note: reason },
      });
    }
    return results.length;
  }

  /** The §2.5 suspension effects inside the caller's transaction (also
   * used by the docs/06 §3.4 user sanction). Null when already suspended. */
  async suspendInTx(
    tx: Tx,
    admin: AdminActor,
    attorneyId: string,
    reason: string,
  ): Promise<AttorneyVerificationStatusDto | null> {
    {
      const profile = await this.profileOr404(tx, attorneyId);
      if (profile.verification_status === 'suspended') return null;
      await tx.attorneyProfile.update({
        where: { user_id: attorneyId },
        data: { verification_status: 'suspended' },
      });
      const count = await this.withdrawActiveBids(tx, attorneyId, reason);
      await this.audit.record(
        {
          adminId: admin.id,
          action: AUDIT_ACTION.suspend,
          targetType: 'attorney_profile',
          targetId: attorneyId,
          before: { verificationStatus: profile.verification_status },
          after: {
            verificationStatus: 'suspended',
            reason,
            withdrawnBids: count,
          },
          ip: admin.ip,
        },
        tx,
      );
      await this.notify(tx, attorneyId, { kind: KIND.suspended });
      await this.trust.recompute(
        attorneyId,
        { type: 'admin', id: admin.id },
        tx,
      );
      // Owner 2026-10-05 07:00: a blocked account's bar numbers cannot be
      // registered again under a new account (`trust.block_on_reject`).
      if (await this.blocks.blockOnReject()) {
        await this.blocks.blockAttorney(
          attorneyId,
          { type: 'admin', id: admin.id, ip: admin.ip },
          reason,
          BLOCK_SOURCE.suspend,
          tx,
        );
      }
      return {
        attorneyId,
        verificationStatus: 'suspended',
        withdrawnBids: count,
      };
    }
  }

  /** `restore` (§2.5): back to `verified` (the status before suspension,
   * from its audit row; `unverified` if no verified license is left).
   * Withdrawn bids are not reopened. */
  async restore(
    admin: AdminActor,
    attorneyId: string,
  ): Promise<AttorneyVerificationStatusDto> {
    return withTxRetry(this.prisma, async (tx) => {
      const profile = await this.profileOr404(tx, attorneyId);
      if (profile.verification_status !== 'suspended') {
        throw profileInvalid(profile.verification_status);
      }
      return (await this.restoreInTx(tx, admin, attorneyId))!;
    });
  }

  /** Restore inside the caller's transaction; null when not suspended. */
  async restoreInTx(
    tx: Tx,
    admin: AdminActor,
    attorneyId: string,
  ): Promise<AttorneyVerificationStatusDto | null> {
    {
      const profile = await this.profileOr404(tx, attorneyId);
      if (profile.verification_status !== 'suspended') return null;
      const lastSuspend = await tx.auditLog.findFirst({
        where: {
          action: AUDIT_ACTION.suspend,
          target_type: 'attorney_profile',
          target_id: attorneyId,
        },
        orderBy: { created_at: 'desc' },
        select: { before: true },
      });
      const prior = asObject(lastSuspend?.before ?? null)?.verificationStatus;
      const verified = await tx.attorneyLicense.count({
        where: { attorney_id: attorneyId, license_status: 'verified' },
      });
      const restored: VerificationStatus =
        prior === 'pending' || prior === 'rejected' || prior === 'unverified'
          ? prior
          : verified > 0
            ? 'verified'
            : 'unverified';
      await tx.attorneyProfile.update({
        where: { user_id: attorneyId },
        data: { verification_status: restored },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: AUDIT_ACTION.restore,
          targetType: 'attorney_profile',
          targetId: attorneyId,
          before: { verificationStatus: 'suspended' },
          after: { verificationStatus: restored },
          ip: admin.ip,
        },
        tx,
      );
      await this.notify(tx, attorneyId, { kind: KIND.restored });
      await this.trust.recompute(
        attorneyId,
        { type: 'admin', id: admin.id },
        tx,
      );
      return { attorneyId, verificationStatus: restored, withdrawnBids: 0 };
    }
  }

  private async notify(
    tx: Tx,
    attorneyId: string,
    payload: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.notifications.emit(
      { type: 'verification_update', recipientId: attorneyId, payload },
      tx,
    );
  }

  private async requestOr404(tx: Tx, requestId: string) {
    const req = await tx.verificationRequest.findUnique({
      where: { id: requestId },
    });
    if (!req) throw notFound('Verification request not found.');
    return req;
  }

  /** The request must be in review by THIS verifier. */
  private async myReview(tx: Tx, admin: AdminActor, requestId: string) {
    const req = await this.requestOr404(tx, requestId);
    if (req.status !== 'in_review') throw invalidStatus(req.status);
    if (req.reviewed_by !== admin.id) throw locked(req.reviewed_by);
    return req;
  }

  private async profileOr404(tx: Tx, attorneyId: string) {
    const profile = await tx.attorneyProfile.findUnique({
      where: { user_id: attorneyId },
      select: { verification_status: true },
    });
    if (!profile) throw notFound('Attorney not found.');
    return profile;
  }
}

function licenseDto(l: AttorneyLicense & { state: State }): AdminLicenseDto {
  return {
    id: l.id,
    stateCode: l.state_code,
    stateName: l.state.name,
    barNumber: l.bar_number,
    status: l.license_status,
    expiresAt: isoDay(l.expires_at),
    autoCheckResult: asObject(l.auto_check_result),
    lookupUrl: stateBarLookupUrl(l.state_code, l.bar_number),
    rejectionCode: l.rejection_code,
    rejectionNote: l.rejection_note,
    verifiedAt: l.verified_at?.toISOString() ?? null,
    decidedBy: l.verified_by,
    registryFlag: (l.registry_flag as AdminLicenseDto['registryFlag']) ?? null,
    registryFlaggedAt: l.registry_flagged_at?.toISOString() ?? null,
  };
}

function asObject(
  value: Prisma.JsonValue | null,
): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function locked(reviewerId: string | null) {
  return httpError(
    HttpStatus.CONFLICT,
    ErrorCode.VERIFICATION_REQUEST_LOCKED,
    'Another verifier is working on this request.',
    { reviewerId },
  );
}

function decisionIncomplete(details: Record<string, unknown>) {
  return httpError(
    HttpStatus.CONFLICT,
    ErrorCode.VERIFICATION_DECISION_INCOMPLETE,
    'Decide every license and verify at least one before approving.',
    details,
  );
}

function profileInvalid(status: VerificationStatus) {
  return httpError(
    HttpStatus.CONFLICT,
    ErrorCode.VERIFICATION_INVALID_STATUS,
    'The attorney status does not allow this action.',
    { verificationStatus: status },
  );
}

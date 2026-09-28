import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  type VerificationDocType,
  type VerificationRequestStatus,
} from '@prisma/client';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { FilesService } from '../../files/files.service';
import {
  notFound,
  requireOwnAttorney,
  validationError,
} from '../../profiles/services/profile-access';
import type {
  AddLicenseDto,
  AttachDocumentDto,
  SubmitVerificationRequestDto,
} from '../dto/verification-requests.dto';
import type {
  VerificationOverviewDto,
  VerificationRequestDto,
} from '../dto/verification-responses.dto';
import {
  EDITABLE_REQUEST_STATUSES,
  IDENTITY_DOC_TYPES,
  IDENTITY_NEEDS_BACK,
  MAX_FILES_PER_DOCUMENT,
  OPEN_REQUEST_STATUSES,
} from '../verification.constants';
import {
  attorneySubmissionsWhere,
  httpError,
  invalidStatus,
  isoDay,
  SUBMISSION_WINDOW_MS,
  syncProfileStatus,
} from '../verification.helpers';
import { VerificationChecksService } from './verification-checks.service';

type Tx = Prisma.TransactionClient;

const REQUEST_INCLUDE = {
  documents: { orderBy: [{ created_at: 'asc' }, { id: 'asc' }] },
  attorney: {
    select: {
      licenses: {
        include: { state: { select: { code: true, name: true } } },
        orderBy: [{ state_code: 'asc' }, { created_at: 'asc' }],
      },
    },
  },
} satisfies Prisma.VerificationRequestInclude;

type RequestRow = Prisma.VerificationRequestGetPayload<{
  include: typeof REQUEST_INCLUDE;
}>;

/** What is missing for submission (VERIFICATION_INCOMPLETE details). */
export type MissingItem =
  | 'license'
  | 'identity_document'
  | 'identity_document_back'
  | 'selfie'
  | `bar_license:${string}`
  | `file_not_clean:${string}`;

/**
 * The attorney's side of verification (docs/03 §2.1–§2.3, stage 3.3):
 * draft → licenses + documents → submit; answer to `needs_more_info` →
 * resubmit. Licenses live on the attorney (`attorney_licenses`); the
 * licenses in `pending` belong to the open request (only one can be open).
 */
@Injectable()
export class VerificationRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly files: FilesService,
    private readonly checks: VerificationChecksService,
  ) {}

  async overview(
    userId: string,
    now = new Date(),
  ): Promise<VerificationOverviewDto> {
    const { verificationStatus } = await requireOwnAttorney(
      this.prisma,
      userId,
    );
    const [latest, used, max] = await Promise.all([
      this.prisma.verificationRequest.findFirst({
        where: { attorney_id: userId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        include: REQUEST_INCLUDE,
      }),
      this.prisma.verificationRequest.count({
        where: attorneySubmissionsWhere(userId, now),
      }),
      this.settings.number('verification.max_submissions_30d'),
    ]);
    return {
      verificationStatus,
      request: latest ? toDto(latest) : null,
      identityRequired: verificationStatus !== 'verified',
      submissionsLast30Days: used,
      maxSubmissions30Days: max,
    };
  }

  async get(
    userId: string,
    requestId: string,
  ): Promise<VerificationRequestDto> {
    await requireOwnAttorney(this.prisma, userId);
    return toDto(await this.load(this.prisma, userId, requestId));
  }

  /** §2.3: a new draft. 409 VERIFICATION_ALREADY_PENDING while another
   * request is open; 429 VERIFICATION_SUBMISSION_LIMIT when the 30-day
   * budget is already used up (the draft could never be submitted). */
  async create(
    userId: string,
    now = new Date(),
  ): Promise<VerificationRequestDto> {
    await this.requireActiveAttorney(userId);
    const max = await this.settings.number('verification.max_submissions_30d');
    const id = await withTxRetry(this.prisma, async (tx) => {
      const open = await tx.verificationRequest.findFirst({
        where: {
          attorney_id: userId,
          status: { in: [...OPEN_REQUEST_STATUSES] },
        },
        select: { id: true, status: true },
      });
      if (open) {
        throw httpError(
          HttpStatus.CONFLICT,
          ErrorCode.VERIFICATION_ALREADY_PENDING,
          'You already have an open verification request.',
          { requestId: open.id, status: open.status },
        );
      }
      await this.assertSubmissionBudget(tx, userId, max, now);
      const created = await tx.verificationRequest.create({
        data: { attorney_id: userId, status: 'draft' },
        select: { id: true },
      });
      await syncProfileStatus(tx, userId, 'draft', now);
      return created.id;
    });
    return this.get(userId, id);
  }

  async updateComment(
    userId: string,
    requestId: string,
    comment: string,
  ): Promise<VerificationRequestDto> {
    await this.requireActiveAttorney(userId);
    await withTxRetry(this.prisma, async (tx) => {
      const req = await this.load(tx, userId, requestId);
      assertEditable(req.status);
      await tx.verificationRequest.update({
        where: { id: req.id },
        data: { applicant_comment: comment === '' ? null : comment },
      });
    });
    return this.get(userId, requestId);
  }

  /**
   * §2.1 license block. The (state, bar number) pair is unique across all
   * attorneys: someone else's → 409 LICENSE_ALREADY_REGISTERED. One
   * license per state per request (409 LICENSE_ALREADY_ADDED). The
   * attorney's own earlier row with the same number (rejected, expired or
   * a renewal of a verified one, §2.6) is put back to `pending` with the
   * new expiry instead of a duplicate row.
   */
  async addLicense(
    userId: string,
    requestId: string,
    dto: AddLicenseDto,
  ): Promise<VerificationRequestDto> {
    await this.requireActiveAttorney(userId);
    const state = await this.prisma.state.findUnique({
      where: { code: dto.stateCode },
      select: { code: true },
    });
    if (!state) {
      throw validationError('Unknown state.', { field: 'stateCode' });
    }
    const expiresAt = dto.expiresAt
      ? new Date(`${dto.expiresAt}T00:00:00Z`)
      : null;
    try {
      await withTxRetry(this.prisma, async (tx) => {
        const req = await this.load(tx, userId, requestId);
        assertEditable(req.status);
        const holder = await tx.attorneyLicense.findUnique({
          where: {
            state_code_bar_number: {
              state_code: dto.stateCode,
              bar_number: dto.barNumber,
            },
          },
        });
        if (holder && holder.attorney_id !== userId) throw alreadyRegistered();
        const sameState = await tx.attorneyLicense.findFirst({
          where: {
            attorney_id: userId,
            state_code: dto.stateCode,
            license_status: 'pending',
          },
          select: { id: true },
        });
        if (sameState) {
          throw httpError(
            HttpStatus.CONFLICT,
            ErrorCode.LICENSE_ALREADY_ADDED,
            'This request already has a license in this state.',
            { licenseId: sameState.id },
          );
        }
        if (holder) {
          await tx.attorneyLicense.update({
            where: { id: holder.id },
            data: {
              license_status: 'pending',
              expires_at: expiresAt,
              rejection_code: null,
              rejection_note: null,
              auto_check_result: Prisma.DbNull,
            },
          });
        } else {
          await tx.attorneyLicense.create({
            data: {
              attorney_id: userId,
              state_code: dto.stateCode,
              bar_number: dto.barNumber,
              expires_at: expiresAt,
            },
          });
        }
      });
    } catch (error) {
      // Another attorney inserted the same (state, bar number) after our read.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw alreadyRegistered();
      }
      throw error;
    }
    return this.get(userId, requestId);
  }

  /** Removes a license added to this request. A license that was verified
   * before (a renewal under review) can't be withdrawn — a verifier
   * decides on it. The request's bar documents for that state go too. */
  async removeLicense(
    userId: string,
    requestId: string,
    licenseId: string,
  ): Promise<VerificationRequestDto> {
    await this.requireActiveAttorney(userId);
    await withTxRetry(this.prisma, async (tx) => {
      const req = await this.load(tx, userId, requestId);
      assertEditable(req.status);
      const license = await tx.attorneyLicense.findFirst({
        where: {
          id: licenseId,
          attorney_id: userId,
          license_status: 'pending',
        },
      });
      if (!license) throw notFound('License not found.');
      if (license.verified_at !== null) {
        throw invalidStatus(req.status, { reason: 'license_under_renewal' });
      }
      await tx.verificationDocument.deleteMany({
        where: {
          request_id: req.id,
          doc_type: 'bar_license',
          state_code: license.state_code,
        },
      });
      await tx.attorneyLicense.delete({ where: { id: license.id } });
    });
    return this.get(userId, requestId);
  }

  /**
   * §2.1/§2.2: attach an uploaded file. Only the caller's own `clean`
   * file of the right purpose passes (FilesService.assertAttachable →
   * FILE_NOT_ATTACHABLE for pending/infected/failed). Up to 3 files per
   * document. Attaching the same file twice is a no-op.
   */
  async attachDocument(
    userId: string,
    requestId: string,
    dto: AttachDocumentDto,
  ): Promise<VerificationRequestDto> {
    await this.requireActiveAttorney(userId);
    const shape = documentShape(dto);
    await this.files.assertAttachable(
      userId,
      dto.fileId,
      dto.docType === 'selfie'
        ? ['verification_selfie']
        : ['verification_document'],
    );
    await withTxRetry(this.prisma, async (tx) => {
      const req = await this.load(tx, userId, requestId);
      assertEditable(req.status);
      if (req.documents.some((d) => d.file_id === dto.fileId)) return;
      if (dto.docType === 'bar_license') {
        const license = await tx.attorneyLicense.findFirst({
          where: {
            attorney_id: userId,
            state_code: shape.stateCode ?? '',
            license_status: 'pending',
          },
          select: { id: true },
        });
        if (!license) {
          throw validationError('Add the license for this state first.', {
            field: 'stateCode',
          });
        }
      }
      const same = req.documents.filter(
        (d) => d.doc_type === dto.docType && d.state_code === shape.stateCode,
      ).length;
      if (same >= MAX_FILES_PER_DOCUMENT) {
        throw validationError('Too many files for this document.', {
          reason: 'too_many_files',
          max: MAX_FILES_PER_DOCUMENT,
        });
      }
      await tx.verificationDocument.create({
        data: {
          request_id: req.id,
          doc_type: dto.docType,
          file_id: dto.fileId,
          state_code: shape.stateCode,
          side: shape.side,
        },
      });
    });
    return this.get(userId, requestId);
  }

  /** Documents are removed only while drafting; after an info request the
   * attorney adds files (§2.3), what the verifier saw stays. */
  async removeDocument(
    userId: string,
    requestId: string,
    documentId: string,
  ): Promise<VerificationRequestDto> {
    await this.requireActiveAttorney(userId);
    await withTxRetry(this.prisma, async (tx) => {
      const req = await this.load(tx, userId, requestId);
      if (req.status !== 'draft') throw invalidStatus(req.status);
      if (!req.documents.some((d) => d.id === documentId)) {
        throw notFound('Document not found.');
      }
      await tx.verificationDocument.delete({ where: { id: documentId } });
    });
    return this.get(userId, requestId);
  }

  /**
   * draft → submitted after the completeness check (400
   * VERIFICATION_INCOMPLETE with details.missing), and needs_more_info →
   * submitted (the answer; keeps the original submitted_at so the request
   * returns to its place in the queue). The 30-day budget applies to new
   * submissions only. Profile → `pending` (§2.3 sync). Automatic checks
   * (§2.4) run after the first submission.
   */
  async submit(
    userId: string,
    requestId: string,
    dto: SubmitVerificationRequestDto,
    now = new Date(),
  ): Promise<VerificationRequestDto> {
    const { verificationStatus } = await this.requireActiveAttorney(userId);
    const max = await this.settings.number('verification.max_submissions_30d');
    const firstSubmission = await withTxRetry(this.prisma, async (tx) => {
      const req = await this.load(tx, userId, requestId);
      assertEditable(req.status);
      const fromDraft = req.status === 'draft';
      const missing = await this.missingItems(
        tx,
        req,
        fromDraft,
        verificationStatus !== 'verified',
      );
      if (missing.length > 0) {
        throw httpError(
          HttpStatus.BAD_REQUEST,
          ErrorCode.VERIFICATION_INCOMPLETE,
          'The request is not complete.',
          { missing },
        );
      }
      if (fromDraft)
        await this.assertSubmissionBudget(tx, userId, max, now, req.id);
      await tx.verificationRequest.update({
        where: { id: req.id },
        data: {
          status: 'submitted',
          ...(fromDraft && { submitted_at: now }),
          ...(dto.applicantComment !== undefined && {
            applicant_comment: dto.applicantComment || null,
          }),
        },
      });
      await syncProfileStatus(tx, userId, 'submitted', now);
      return fromDraft;
    });
    if (firstSubmission) await this.checks.runOnSubmit(requestId);
    return this.get(userId, requestId);
  }

  /** §2.1 completeness. A new submission needs ≥1 license (each with its
   * bar document), plus — unless the attorney is already verified — an
   * identity document (front, and back for driver license/state ID) and
   * a selfie. Every attached file must still be `clean`. */
  private async missingItems(
    tx: Tx,
    req: RequestRow,
    fromDraft: boolean,
    identityRequired: boolean,
  ): Promise<MissingItem[]> {
    const missing: MissingItem[] = [];
    if (fromDraft) {
      const pending = req.attorney.licenses.filter(
        (l) => l.license_status === 'pending',
      );
      if (pending.length === 0) missing.push('license');
      for (const l of pending) {
        const has = req.documents.some(
          (d) => d.doc_type === 'bar_license' && d.state_code === l.state_code,
        );
        if (!has) missing.push(`bar_license:${l.state_code}`);
      }
      if (identityRequired) {
        const identity = identityCompleteness(req.documents);
        if (identity) missing.push(identity);
        if (!req.documents.some((d) => d.doc_type === 'selfie')) {
          missing.push('selfie');
        }
      }
    }
    if (req.documents.length > 0) {
      const files = await tx.file.findMany({
        where: { id: { in: req.documents.map((d) => d.file_id) } },
        select: { id: true, scan_status: true, deleted_at: true },
      });
      const clean = new Set(
        files
          .filter((f) => f.scan_status === 'clean' && f.deleted_at === null)
          .map((f) => f.id),
      );
      for (const d of req.documents) {
        if (!clean.has(d.file_id)) missing.push(`file_not_clean:${d.id}`);
      }
    }
    return missing;
  }

  private async assertSubmissionBudget(
    tx: Tx,
    userId: string,
    max: number,
    now: Date,
    excludeId?: string,
  ): Promise<void> {
    const recent = await tx.verificationRequest.findMany({
      where: attorneySubmissionsWhere(userId, now, excludeId),
      select: { submitted_at: true },
      orderBy: { submitted_at: 'asc' },
    });
    if (recent.length < max) return;
    const oldest = recent[0]?.submitted_at ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        (oldest.getTime() + SUBMISSION_WINDOW_MS - now.getTime()) / 1000,
      ),
    );
    throw httpError(
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.VERIFICATION_SUBMISSION_LIMIT,
      'Too many verification requests. Try again later.',
      { max, retryAfterSeconds },
    );
  }

  private async requireActiveAttorney(userId: string) {
    const own = await requireOwnAttorney(this.prisma, userId);
    if (own.verificationStatus === 'suspended') {
      throw httpError(
        HttpStatus.FORBIDDEN,
        ErrorCode.ATTORNEY_SUSPENDED,
        'Your profile is suspended.',
      );
    }
    return own;
  }

  /** Own request or 404 (deny by default: someone else's id is unknown). */
  private async load(
    db: Tx | PrismaService,
    userId: string,
    requestId: string,
  ): Promise<RequestRow> {
    const row = await db.verificationRequest.findUnique({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });
    if (!row || row.attorney_id !== userId) {
      throw notFound('Verification request not found.');
    }
    return row;
  }
}

function assertEditable(status: VerificationRequestStatus): void {
  if (!(EDITABLE_REQUEST_STATUSES as readonly string[]).includes(status)) {
    throw invalidStatus(status);
  }
}

function alreadyRegistered() {
  return httpError(
    HttpStatus.CONFLICT,
    ErrorCode.LICENSE_ALREADY_REGISTERED,
    'This license is already registered to another account.',
  );
}

/** Validates side/state per document type; returns the stored values. */
export function documentShape(dto: {
  docType: VerificationDocType;
  side?: 'front' | 'back';
  stateCode?: string;
}): { side: 'front' | 'back' | null; stateCode: string | null } {
  const isIdentity = (IDENTITY_DOC_TYPES as readonly string[]).includes(
    dto.docType,
  );
  if (dto.docType === 'bar_license' && !dto.stateCode) {
    throw validationError('stateCode is required for bar_license.', {
      field: 'stateCode',
    });
  }
  if (
    dto.docType !== 'bar_license' &&
    dto.docType !== 'other' &&
    dto.stateCode
  ) {
    throw validationError('stateCode is only for bar_license.', {
      field: 'stateCode',
    });
  }
  if (!isIdentity && dto.side) {
    throw validationError('side is only for identity documents.', {
      field: 'side',
    });
  }
  if (isIdentity && IDENTITY_NEEDS_BACK.includes(dto.docType) && !dto.side) {
    throw validationError('side is required for this document.', {
      field: 'side',
    });
  }
  if (dto.docType === 'passport' && dto.side === 'back') {
    throw validationError('A passport has no back side.', { field: 'side' });
  }
  return {
    side: isIdentity ? (dto.side ?? 'front') : null,
    stateCode: dto.stateCode ?? null,
  };
}

/** null when some identity document type is complete (front, plus back
 * where needed), else what is missing. */
export function identityCompleteness(
  docs: readonly { doc_type: VerificationDocType; side: string | null }[],
): 'identity_document' | 'identity_document_back' | null {
  let frontOnly = false;
  for (const type of IDENTITY_DOC_TYPES) {
    const ofType = docs.filter((d) => d.doc_type === type);
    const front = ofType.some((d) => d.side === 'front');
    const back = ofType.some((d) => d.side === 'back');
    if (front && (back || !IDENTITY_NEEDS_BACK.includes(type))) return null;
    if (front) frontOnly = true;
  }
  return frontOnly ? 'identity_document_back' : 'identity_document';
}

export function toDto(row: RequestRow): VerificationRequestDto {
  return {
    id: row.id,
    status: row.status,
    applicantComment: row.applicant_comment,
    infoRequestMessage: row.info_request_message,
    rejectionCode: row.rejection_code,
    rejectionReason: row.rejection_reason,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    licenses: row.attorney.licenses.map((l) => ({
      id: l.id,
      state: { code: l.state.code, name: l.state.name },
      barNumber: l.bar_number,
      status: l.license_status,
      expiresAt: isoDay(l.expires_at),
      rejectionCode: l.rejection_code,
      rejectionNote: l.rejection_note,
    })),
    documents: row.documents.map((d) => ({
      id: d.id,
      docType: d.doc_type,
      side: d.side === 'front' || d.side === 'back' ? d.side : null,
      stateCode: d.state_code,
      fileId: d.file_id,
      createdAt: d.created_at.toISOString(),
    })),
  };
}

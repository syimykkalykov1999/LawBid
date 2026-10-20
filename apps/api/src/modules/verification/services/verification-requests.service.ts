import { BarAttemptsService } from './bar-attempts.service';
import {
  barShape,
  checkBarNumber,
  FORMAT_UNUSUAL_FLAG,
  resolveFormats,
} from '../bar-number-format';
import { notAvailable } from '../../countries/countries.service';
import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import {
  Prisma,
  type VerificationDocType,
  type VerificationRequestStatus,
} from '@prisma/client';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { AttorneyTrustService } from '../../attorney-trust/attorney-trust.service';
import { BarNumberBlocksService } from '../../attorney-trust/bar-number-blocks.service';
import { FilesService } from '../../files/files.service';
import { readUploadLimits } from '../../files/upload-limits';
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
  ATTESTATION_VERSION,
  EDITABLE_REQUEST_STATUSES,
  IDENTITY_DOC_TYPES,
  IDENTITY_NEEDS_BACK,
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
  | 'attestation'
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
interface LicenseLike {
  license_status: string;
  state_code: string;
  registry_flag: string | null;
}

@Injectable()
export class VerificationRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly files: FilesService,
    private readonly checks: VerificationChecksService,
    private readonly trust: AttorneyTrustService,
    private readonly blocks: BarNumberBlocksService,
    // Owner 2026-10-14: the number's shape and the stepped cooldown.
    @Optional() private readonly attempts?: BarAttemptsService,
  ) {}

  /**
   * ID + selfie: owner 2026-10-04 ("только номер") — a first verification
   * needs them only when `verification.require_identity` is on (off by
   * default; the verifier can still ask for them with an info request).
   * A verified attorney whose name no longer matches the verified one
   * ("Confirm new name", OQ-029) always needs them. The profile stays
   * verified while such a request is open.
   */
  private async identityRequired(
    userId: string,
    status: string,
    db: Pick<PrismaService, 'attorneyProfile'> = this.prisma,
  ): Promise<boolean> {
    if (status !== 'verified') {
      return this.settings.boolean('verification.require_identity');
    }
    const row = await db.attorneyProfile.findUnique({
      where: { user_id: userId },
      select: { name_mismatch: true },
    });
    return row?.name_mismatch ?? false;
  }

  /** Owner 2026-10-16: the bar card is asked for when the admin switched it
   * on, for a number of an unusual shape, and for every state without an
   * enabled registry (nobody else checks it). No license yet → asked. */
  private async barDocumentNeeded(
    latest: { attorney: { licenses: LicenseLike[] } } | null,
  ): Promise<boolean> {
    if (await this.barDocumentRequired()) return true;
    if (
      !(await this.settings.boolean(
        'verification.bar_document_for_manual_states',
      ))
    ) {
      return false;
    }
    const pending = (latest?.attorney.licenses ?? []).filter(
      (l) => l.license_status === 'pending',
    );
    if (pending.length === 0) return true;
    for (const l of pending) {
      if (
        l.registry_flag === FORMAT_UNUSUAL_FLAG ||
        !(await this.checks.registryEnabled(l.state_code))
      ) {
        return true;
      }
    }
    return false;
  }

  /** Photo of the bar card per license: optional unless switched on. */
  private barDocumentRequired(): Promise<boolean> {
    return this.settings.boolean('verification.require_bar_document');
  }

  async overview(
    userId: string,
    now = new Date(),
    ip?: string,
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
      identityRequired: await this.identityRequired(userId, verificationStatus),
      barDocumentRequired: await this.barDocumentNeeded(latest),
      barAttemptsRetryAfterSeconds: this.attempts
        ? Math.max(0, await this.attempts.remainingSeconds(userId, ip))
        : 0,
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
    ip?: string,
  ): Promise<VerificationRequestDto> {
    await this.requireActiveAttorney(userId);
    // Owner 2026-10-18: «Мой номер верный — отправить на проверку» — the
    // attorney sends a number that does not fit for a person to check with
    // the bar card. It is open while the attempts lock is on.
    const manual = dto.manualReview === true;
    // Owner 2026-10-14: cooling down after wrong numbers, then the state's
    // own shape — a number that does not fit never reaches a reviewer.
    if (this.attempts && !manual) {
      const wait = await this.attempts.remainingSeconds(userId, ip);
      if (wait > 0) {
        throw httpError(
          HttpStatus.TOO_MANY_REQUESTS,
          ErrorCode.BAR_ATTEMPTS_COOLDOWN,
          'Too many wrong bar numbers. Try again later.',
          { retryAfterSeconds: wait },
        );
      }
    }
    const shape = checkBarNumber(
      dto.stateCode,
      dto.barNumber,
      resolveFormats(await this.settings.string('verification.bar_formats')),
    );
    // Owner 2026-10-18: the format is never revealed. Junk (not 3–32 letters
    // / digits with a digit) and a number that does not fit the state's rule
    // are refused with the same generic «not found for this state», no
    // example, and count as a failed attempt (5 → locked for an hour). The
    // shape of a non-fitting number is logged so the admin can widen a rule.
    const junk =
      !/^[A-Z0-9]{3,32}$/.test(shape.normalized) ||
      !/\d/.test(shape.normalized);
    if (junk || (!shape.ok && !manual)) {
      if (!junk) await this.logFormatMiss(dto.stateCode, dto.barNumber);
      const cooldown =
        this.attempts && !manual
          ? await this.attempts.recordFailure(userId, ip)
          : 0;
      throw httpError(
        cooldown > 0 ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_REQUEST,
        cooldown > 0
          ? ErrorCode.BAR_ATTEMPTS_COOLDOWN
          : ErrorCode.BAR_NUMBER_FORMAT_INVALID,
        cooldown > 0
          ? 'Too many wrong bar numbers. Try again later.'
          : 'Bar number not found for this state.',
        cooldown > 0
          ? { retryAfterSeconds: cooldown }
          : { stateCode: dto.stateCode },
      );
    }
    // Only a number the attorney insisted on reaches here without fitting.
    const unusual = !shape.ok;
    dto = { ...dto, barNumber: shape.normalized };
    const state = await this.prisma.state.findUnique({
      where: { code: dto.stateCode },
      select: { code: true, country_code: true, country: true },
    });
    if (!state) {
      throw validationError('Unknown state.', { field: 'stateCode' });
    }
    // Owner 2026-10-05: licenses only in switched-on countries.
    if (state.country && !state.country.is_enabled) {
      throw notAvailable(state.country_code);
    }
    // Owner 2026-10-05 07:00: a rejected / blocked bar number (or the
    // contacts of a blocked account) cannot register again — 403.
    await this.blocks.assertNotBlocked(userId, dto.stateCode, dto.barNumber);
    const expiresAt = dto.expiresAt
      ? new Date(`${dto.expiresAt}T00:00:00Z`)
      : null;
    let duplicateOf: string | null = null;
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
        if (holder && holder.attorney_id !== userId) {
          // Owner 2026-10-05 (trust levels): both sides are recorded and
          // the holder's license goes to the registry queue.
          duplicateOf = holder.attorney_id;
          throw alreadyRegistered();
        }
        // Owner 2026-10-05 (audit): re-adding a state that is already
        // verified would send it back to review; only an explicit renewal
        // may do that.
        if (!dto.renewal) {
          const active = await tx.attorneyLicense.findFirst({
            where: {
              attorney_id: userId,
              state_code: dto.stateCode,
              license_status: 'verified',
              OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
            },
            select: { id: true },
          });
          if (active) {
            throw httpError(
              HttpStatus.CONFLICT,
              ErrorCode.LICENSE_ALREADY_ADDED,
              'This state is already verified.',
              { licenseId: active.id, reason: 'already_verified' },
            );
          }
        }
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
              ...(unusual && {
                registry_flag: FORMAT_UNUSUAL_FLAG,
                registry_flagged_at: new Date(),
              }),
            },
          });
        } else {
          await tx.attorneyLicense.create({
            data: {
              attorney_id: userId,
              state_code: dto.stateCode,
              bar_number: dto.barNumber,
              expires_at: expiresAt,
              ...(unusual && {
                registry_flag: FORMAT_UNUSUAL_FLAG,
                registry_flagged_at: new Date(),
              }),
            },
          });
        }
      });
    } catch (error) {
      if (duplicateOf) {
        await this.trust.onDuplicateClaim(
          duplicateOf,
          userId,
          dto.stateCode,
          dto.barNumber,
        );
      }
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
      // Owner 2026-10-07 (bug 17): files per document — admin «Проверка».
      const maxPerDoc = (await readUploadLimits(this.settings)).verification
        .maxFiles;
      if (same >= maxPerDoc) {
        throw validationError('Too many files for this document.', {
          reason: 'too_many_files',
          max: maxPerDoc,
        });
      }
      await tx.verificationDocument.create({
        data: {
          request_id: req.id,
          doc_type: dto.docType,
          file_id: dto.fileId,
          state_code: shape.stateCode,
          side: shape.side,
          // Owner 2026-10-18: the attorney's note to the reviewer.
          notes: dto.note?.trim() ? dto.note.trim() : null,
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
    ip: string | null = null,
    now = new Date(),
  ): Promise<VerificationRequestDto> {
    const { verificationStatus } = await this.requireActiveAttorney(userId);
    const max = await this.settings.number('verification.max_submissions_30d');
    const barDocRequired = await this.barDocumentRequired();
    let identityRequired = false;
    const firstSubmission = await withTxRetry(this.prisma, async (tx) => {
      const req = await this.load(tx, userId, requestId);
      assertEditable(req.status);
      const fromDraft = req.status === 'draft';
      identityRequired = await this.identityRequired(
        userId,
        verificationStatus,
        tx,
      );
      const missing = await this.missingItems(
        tx,
        req,
        fromDraft,
        identityRequired,
        barDocRequired,
      );
      // Owner 2026-10-04: a new submission carries the sworn statement.
      if (fromDraft && dto.attestation !== true) missing.unshift('attestation');
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
          ...(fromDraft && {
            submitted_at: now,
            attested_at: now,
            attestation_ip: ip,
            attestation_version: ATTESTATION_VERSION,
          }),
          ...(dto.applicantComment !== undefined && {
            applicant_comment: dto.applicantComment || null,
          }),
        },
      });
      await syncProfileStatus(tx, userId, 'submitted', now);
      return fromDraft;
    });
    if (firstSubmission) {
      // Owner 2026-10-04: self-attestation — no registry or bar website is
      // consulted; the attorney answers for the statement and verifiers
      // only act on complaints. Off (or ID + selfie required) = the
      // automatic checks / verifier queue as before.
      const selfAttested =
        !identityRequired &&
        (await this.settings.boolean(
          'verification.self_attestation_auto_approve',
        ));
      if (selfAttested) {
        // Owner 2026-10-05: then the state registries that are switched on
        // check the numbers and flag differences for an admin.
        await this.checks.approveSelfAttested(requestId);
      } else {
        await this.checks.runOnSubmit(requestId);
      }
    }
    return this.get(userId, requestId);
  }

  /** Owner 2026-10-16: counts the SHAPE of a number no rule recognised
   * (never the number) so the admin can widen a rule without a release. */
  private async logFormatMiss(state: string, raw: string): Promise<void> {
    try {
      const shape = barShape(raw);
      await this.prisma.barFormatMiss.upsert({
        where: { state_code_shape: { state_code: state, shape } },
        create: { state_code: state, shape },
        update: { hits: { increment: 1 }, last_seen: new Date() },
      });
    } catch (e) {
      // A log failure must never block the attorney.
      void e;
    }
  }

  /** §2.1 completeness. A new submission needs ≥1 license; its bar
   * document and the identity document (front, and back for driver
   * license/state ID) + selfie only when required (see identityRequired,
   * barDocumentRequired). Every attached file must still be `clean`. */
  private async missingItems(
    tx: Tx,
    req: RequestRow,
    fromDraft: boolean,
    identityRequired: boolean,
    barDocRequired: boolean,
  ): Promise<MissingItem[]> {
    const missing: MissingItem[] = [];
    const manualDoc = await this.settings.boolean(
      'verification.bar_document_for_manual_states',
    );
    if (fromDraft) {
      const pending = req.attorney.licenses.filter(
        (l) => l.license_status === 'pending',
      );
      if (pending.length === 0) missing.push('license');
      for (const l of pending) {
        // Owner 2026-10-16: the bar card is required where nobody checks the
        // number for us (no registry for the state) and for a number whose
        // shape no rule recognised.
        // Owner 2026-10-18: a number the attorney sent for manual review
        // always needs the card, whatever the setting.
        const needsDoc =
          barDocRequired ||
          l.registry_flag === FORMAT_UNUSUAL_FLAG ||
          (manualDoc && !(await this.checks.registryEnabled(l.state_code)));
        if (needsDoc) {
          const has = req.documents.some(
            (d) =>
              d.doc_type === 'bar_license' && d.state_code === l.state_code,
          );
          if (!has) missing.push(`bar_license:${l.state_code}`);
        }
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
      manualReview:
        l.license_status === 'pending' &&
        l.registry_flag === FORMAT_UNUSUAL_FLAG,
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

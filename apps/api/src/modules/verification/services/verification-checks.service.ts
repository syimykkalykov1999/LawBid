import { HttpException, Injectable } from '@nestjs/common';
import type {
  AttorneyLicense,
  Prisma,
  VerificationCheckType,
  VerificationProvider,
} from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { AttorneyTrustService } from '../../attorney-trust/attorney-trust.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  IDENTITY_DOC_TYPES,
  VERIFICATION_NOTIFICATION_KIND as KIND,
} from '../verification.constants';
import { syncProfileStatus } from '../verification.helpers';
import { VerificationProviderSelector } from '../providers/verification-provider.selector';
import type {
  BarLookupProvider,
  CheckOutcome,
} from '../providers/verification-providers';

/**
 * Automatic checks of docs/03 §2.4. Every outcome is stored in
 * `verification_checks` (+ `attorney_licenses.auto_check_result` for bar
 * lookups). Owner 2026-10-04 ("только номер"): when every license of the
 * request passed its state registry lookup (states enabled in the admin,
 * owner 2026-10-05) and any ID
 * check that ran passed too, the request is approved without a verifier;
 * anything else — another state, a name that differs, an error — stays in
 * the manual queue. With the flags off no check runs. Provider errors and
 * an exhausted CostGuard budget are recorded as `manual_review` and never
 * block the attorney.
 */
/** `verification_requests.admin_note` of a request approved by the
 * registry check, without a verifier. */
export const AUTO_APPROVED_NOTE =
  'Одобрено автоматически: номер и имя совпали с реестром штата';

/** `admin_note` of a request approved on the attorney's sworn statement
 * (owner 2026-10-04, self-attestation). */
export const SELF_ATTESTED_NOTE =
  'Самоподтверждение: адвокат под присягой подтвердил лицензию, внешняя проверка не проводилась';

@Injectable()
export class VerificationChecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly selector: VerificationProviderSelector,
    private readonly notifications: NotificationsService,
    private readonly trust: AttorneyTrustService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VerificationChecksService.name);
  }

  /** After a draft is submitted. Best effort: failures are logged. */
  async runOnSubmit(requestId: string): Promise<void> {
    try {
      await this.run(requestId);
    } catch (err) {
      this.logger.error(
        { err, requestId },
        'Automatic verification checks failed — request stays in manual review',
      );
    }
  }

  private async run(requestId: string): Promise<void> {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        attorney_id: true,
        documents: { select: { doc_type: true } },
        attorney: {
          select: {
            user: { select: { first_name: true, last_name: true } },
            licenses: { where: { license_status: 'pending' } },
          },
        },
      },
    });
    if (!request) return;

    const bar = await this.selector.barLookup();
    const barResults: CheckOutcome['result'][] = [];
    const licenses = request.attorney.licenses;
    // Owner 2026-10-05: only states with an enabled registry are looked up;
    // auto-approval needs every license of the request to pass.
    let allSupported = licenses.length > 0;
    for (const license of licenses) {
      if (!(await bar.supports(license.state_code))) {
        allSupported = false;
        continue;
      }
      const outcome = await this.barLookup(bar, license, request.id, {
        firstName: request.attorney.user.first_name ?? '',
        lastName: request.attorney.user.last_name ?? '',
      });
      barResults.push(outcome.result);
    }
    const barPassed =
      allSupported &&
      barResults.length > 0 &&
      barResults.every((r) => r === 'pass');

    const types = new Set(request.documents.map((d) => d.doc_type));
    const hasIdentity =
      IDENTITY_DOC_TYPES.some((t) => types.has(t)) && types.has('selfie');
    const { provider, impl } = await this.selector.idVerification();
    if (!hasIdentity || provider === 'manual') {
      if (barPassed && !hasIdentity) await this.approve(request.id);
      return;
    }

    const input = { requestId: request.id, attorneyId: request.attorney_id };
    const idCheck = await this.safe(() => impl.verify(input), provider);
    await this.record(request.id, 'id_check', provider, idCheck);
    // No provider session when the budget refused the ID check.
    const faceMatch =
      idCheck.details.reason === 'budget_exceeded'
        ? idCheck
        : await this.safe(() => impl.matchFace(input), provider);
    await this.record(request.id, 'face_match', provider, faceMatch);
    await this.prisma.verificationRequest.update({
      where: { id: request.id },
      data: { provider },
    });
    if (barPassed && idCheck.result === 'pass' && faceMatch.result === 'pass') {
      await this.approve(request.id);
    }
  }

  /**
   * Approves a still-`submitted` request whose checks all passed: its
   * pending licenses become verified (no verifier: `verified_by` null),
   * the profile turns verified and the attorney is notified exactly as
   * after a verifier's approval. `admin_note` marks it for the panel.
   * Also used for self-attested submissions (SELF_ATTESTED_NOTE).
   */
  async approve(
    requestId: string,
    note: string = AUTO_APPROVED_NOTE,
    now = new Date(),
  ): Promise<void> {
    await withTxRetry(this.prisma, async (tx) => {
      const req = await tx.verificationRequest.findUnique({
        where: { id: requestId },
        select: { id: true, status: true, attorney_id: true },
      });
      if (!req || req.status !== 'submitted') return;
      await tx.attorneyLicense.updateMany({
        where: { attorney_id: req.attorney_id, license_status: 'pending' },
        data: {
          license_status: 'verified',
          verified_at: now,
          rejection_code: null,
          rejection_note: null,
        },
      });
      await tx.verificationRequest.update({
        where: { id: req.id },
        data: {
          status: 'approved',
          reviewed_at: now,
          admin_note: note,
        },
      });
      await syncProfileStatus(tx, req.attorney_id, 'approved', now);
      await this.notifications.emit(
        {
          type: 'verification_update',
          recipientId: req.attorney_id,
          // Owner 2026-10-07 (phone test): a sworn statement is not a
          // confirmed license — say so, not «Верификация пройдена».
          payload: {
            kind:
              note === SELF_ATTESTED_NOTE ? KIND.selfAttested : KIND.approved,
            requestId: req.id,
            partial: false,
          },
        },
        tx,
      );
    });
    this.logger.info({ requestId, note }, 'Verification request auto-approved');
    await this.trustRecompute(requestId);
  }

  /** Owner 2026-10-05: the trust level follows every verification change. */
  private async trustRecompute(requestId: string): Promise<void> {
    const req = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      select: { attorney_id: true },
    });
    if (req) await this.trust.recompute(req.attorney_id);
  }

  /**
   * Owner 2026-10-04/05: self-attestation approves at once; afterwards
   * every license of the request in a state with an enabled registry is
   * looked up. A match is just recorded; a difference (name, not found,
   * not active) never rejects — the license stays verified and is flagged
   * for an admin (`registry_flag`, Admin → Проверка → "Сверка с
   * реестром"). Registry errors change nothing. Best effort.
   */
  async approveSelfAttested(requestId: string): Promise<void> {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      select: {
        attorney: {
          select: {
            user: { select: { first_name: true, last_name: true } },
            licenses: { where: { license_status: 'pending' } },
          },
        },
      },
    });
    await this.approve(requestId, SELF_ATTESTED_NOTE);
    if (!request) return;
    try {
      const bar = await this.selector.barLookup();
      for (const license of request.attorney.licenses) {
        if (!(await bar.supports(license.state_code))) continue;
        const outcome = await this.barLookup(bar, license, requestId, {
          firstName: request.attorney.user.first_name ?? '',
          lastName: request.attorney.user.last_name ?? '',
        });
        await this.applyRegistryFlag(license.id, outcome);
      }
    } catch (err) {
      this.logger.warn(
        { err, requestId },
        'Registry check after self-attestation failed',
      );
    }
  }

  /**
   * Owner 2026-10-05: the registry's verdict on a verified license. `pass`
   * clears the flag; `fail` (not_found / not_active) and a name mismatch
   * set it; a registry error or a state without a registry leaves it as it
   * is. Returns the flag now on the license.
   */
  async applyRegistryFlag(
    licenseId: string,
    outcome: CheckOutcome,
    now = new Date(),
  ): Promise<string | null | undefined> {
    const flag = registryFlagFor(outcome);
    if (flag === undefined) return undefined;
    const updated = await this.prisma.attorneyLicense.update({
      where: { id: licenseId },
      data: {
        registry_flag: flag,
        registry_flagged_at: flag ? now : null,
      },
      select: { attorney_id: true },
    });
    // Owner 2026-10-05: a registry match / flag moves the trust level.
    await this.trust.recompute(updated.attorney_id);
    return flag;
  }

  /**
   * One bar lookup for [license] with the currently selected provider;
   * stores the result on the license and, when [requestId] is given, as a
   * `bar_lookup` check of that request. Used on submit and by the
   * verifier's `recheck` (§2.5).
   */
  async barLookup(
    provider: BarLookupProvider,
    license: Pick<AttorneyLicense, 'id' | 'state_code' | 'bar_number'>,
    requestId: string | null,
    name: { firstName: string; lastName: string },
  ): Promise<CheckOutcome> {
    const outcome = await this.safe(
      () =>
        provider.lookup({
          stateCode: license.state_code,
          barNumber: license.bar_number,
          firstName: name.firstName,
          lastName: name.lastName,
        }),
      provider.name,
    );
    const checkedAt = new Date();
    await this.prisma.attorneyLicense.update({
      where: { id: license.id },
      data: {
        auto_check_result: {
          result: outcome.result,
          lookupProvider: provider.name,
          checkedAt: checkedAt.toISOString(),
          ...outcome.details,
        },
      },
    });
    if (requestId) {
      // verification_provider has no bar-database values; the adapter
      // name is kept in details.lookupProvider.
      await this.record(requestId, 'bar_lookup', 'manual', {
        result: outcome.result,
        details: {
          ...outcome.details,
          lookupProvider: provider.name,
          licenseId: license.id,
          stateCode: license.state_code,
        },
      });
    }
    return outcome;
  }

  private async record(
    requestId: string,
    checkType: VerificationCheckType,
    provider: VerificationProvider,
    outcome: CheckOutcome,
  ): Promise<void> {
    await this.prisma.verificationCheck.create({
      data: {
        request_id: requestId,
        check_type: checkType,
        provider,
        result: outcome.result,
        details: outcome.details as Prisma.InputJsonObject,
        checked_at: new Date(),
      },
    });
  }

  private async safe(
    call: () => Promise<CheckOutcome>,
    provider: string,
  ): Promise<CheckOutcome> {
    try {
      return await call();
    } catch (err) {
      const budget =
        err instanceof HttpException &&
        (err.getResponse() as { code?: string }).code ===
          ErrorCode.PROVIDER_BUDGET_EXCEEDED;
      if (!budget) {
        this.logger.warn({ err, provider }, 'Verification provider failed');
      }
      return {
        result: 'manual_review',
        details: {
          provider,
          reason: budget ? 'budget_exceeded' : 'provider_error',
        },
      };
    }
  }
}

/** null = clear, a code = flag, undefined = leave as is (no verdict). */
export function registryFlagFor(
  outcome: CheckOutcome,
): string | null | undefined {
  const reason = outcome.details.reason;
  if (outcome.result === 'pass') return null;
  if (outcome.result === 'fail') {
    return reason === 'not_active' ? 'not_active' : 'not_found';
  }
  return reason === 'name_mismatch' ? 'name_mismatch' : undefined;
}

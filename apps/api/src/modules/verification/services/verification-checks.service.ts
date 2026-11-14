import { BarAttemptsService } from './bar-attempts.service';
import { HttpException, Injectable, Optional } from '@nestjs/common';
import type {
  AttorneyLicense,
  Prisma,
  VerificationCheckType,
  VerificationProvider,
} from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { VerificationMediaPurgeService } from './verification-media-purge.service';
import { CostGuardService } from '../../../common/cost-guard/cost-guard.service';
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
import { withTimeout } from '../../../common/resilience/resilience';
import { REGISTRY_CHECK_TIMEOUT_MS } from '../registry-check.queue';
import { stateBarLookupUrl } from '../state-bar-links';
import { VerificationProviderSelector } from '../providers/verification-provider.selector';
import { FACE_MATCH_PROVIDER } from '../providers/rekognition-id-verification.provider';
import type {
  BarLookupProvider,
  CheckOutcome,
} from '../providers/verification-providers';

/** One CompareFaces = two images analysed at AWS Rekognition Image Group 1
 * list price $0.001 per image (first 1 M a month; aws.amazon.com/
 * rekognition/pricing, checked 2026-11-12) = $0.002 = 200 millicents. */
export const FACE_MATCH_MILLICENTS = 200;

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

/** `admin_note` of a request approved by Persona + the state registry
 * (owner 2026-11-08: Persona runs only with its key saved in the admin). */
export const PERSONA_APPROVED_NOTE =
  'Одобрено автоматически: Persona подтвердила документ и лицо, номер совпал с реестром штата';

@Injectable()
export class VerificationChecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly selector: VerificationProviderSelector,
    private readonly notifications: NotificationsService,
    private readonly trust: AttorneyTrustService,
    private readonly logger: PinoLogger,
    // Owner 2026-10-14: a registry miss counts as a wrong number.
    @Optional() private readonly attempts?: BarAttemptsService,
    // 2026-10-24 (abuse batch B, item 13): a paid identity check (Persona /
    // Stripe Identity) counts against the daily `id_check` cap.
    @Optional() private readonly costGuard?: CostGuardService,
    // Owner 2026-11-13 (row 52): the pictures go once it is approved.
    @Optional() private readonly media?: VerificationMediaPurgeService,
  ) {
    this.logger.setContext(VerificationChecksService.name);
  }

  /** Whether the state has an enabled automatic registry (owner
   * 2026-10-16: where it has none, the bar card is required). */
  async registryEnabled(stateCode: string): Promise<boolean> {
    try {
      return await (await this.selector.barLookup()).supports(stateCode);
    } catch {
      return false;
    }
  }

  /** Owner 2026-11-12 (row 60): called after every automatic check run
   * (VerificationAutoDecisionService registers itself; no cycle). */
  private afterChecks: ((requestId: string) => Promise<void>) | null = null;
  onChecksDone(fn: (requestId: string) => Promise<void>): void {
    this.afterChecks = fn;
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
    // Row 60: «Автоматическое решение по адвокатам» (off by default).
    if (this.afterChecks) await this.afterChecks(requestId);
  }

  private async run(requestId: string): Promise<void> {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        attorney_id: true,
        provider: true,
        provider_ref: true,
        biometric_consent_at: true,
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
      // Owner 2026-10-16: a number of an unusual shape waits for a person.
      if (
        license.registry_flag === 'format_unusual' ||
        !(await bar.supports(license.state_code))
      ) {
        allSupported = false;
        continue;
      }
      const outcome = await this.barLookup(
        bar,
        license,
        request.id,
        {
          firstName: request.attorney.user.first_name ?? '',
          lastName: request.attorney.user.last_name ?? '',
        },
        { timeoutMs: REGISTRY_CHECK_TIMEOUT_MS },
      );
      barResults.push(outcome.result);
    }
    const barPassed =
      allSupported &&
      barResults.length > 0 &&
      barResults.every((r) => r === 'pass');

    // Owner 2026-11-08: the ID + selfie went through Persona's hosted flow;
    // its verdict arrives by webhook (before or after this submit).
    if (request.provider === 'persona' && request.provider_ref) {
      if (
        barPassed &&
        (await this.personaPassed(request.id, request.provider_ref))
      ) {
        await this.approve(request.id, PERSONA_APPROVED_NOTE);
      }
      return;
    }

    const types = new Set(request.documents.map((d) => d.doc_type));
    const hasIdentity =
      IDENTITY_DOC_TYPES.some((t) => types.has(t)) && types.has('selfie');
    const { provider, impl } = await this.selector.idVerification();
    if (!hasIdentity || provider === 'manual') {
      // Owner 2026-11-12 (row 52): the selfie ↔ ID photo comparison only
      // informs the verifier; the request stays in the manual queue.
      if (hasIdentity) {
        await this.runFaceMatch(
          request.id,
          request.attorney_id,
          request.biometric_consent_at,
        );
      }
      if (barPassed && !hasIdentity) await this.approve(request.id);
      return;
    }

    const input = { requestId: request.id, attorneyId: request.attorney_id };
    // A refused budget is a PROVIDER_BUDGET_EXCEEDED that `safe` turns into
    // `manual_review` (reason budget_exceeded): no provider session is
    // opened and a person looks at the documents instead.
    const idCheck = await this.safe(async () => {
      await this.costGuard?.consume('id_check');
      return impl.verify(input);
    }, provider);
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
   * Owner 2026-11-12 (row 52): «Сравнение лица (Amazon)». Switch off → no
   * call and no row (a person compares, as before). No biometric consent
   * → no call, a `manual_review` row with reason `no_consent`. Otherwise one
   * Rekognition CompareFaces inside the daily `id_check` cap (a refused
   * budget or any error = `manual_review`), stored as the `face_match`
   * check (similarity / threshold / reason in details, read by the admin
   * card and the AI worker queue). Returns the stored outcome, or null when
   * the switch is off.
   */
  async runFaceMatch(
    requestId: string,
    attorneyId: string,
    consentAt: Date | null,
  ): Promise<CheckOutcome | null> {
    const impl = await this.selector.faceMatch();
    if (!impl) return null;
    const outcome: CheckOutcome = consentAt
      ? await this.safe(async () => {
          await this.costGuard?.consume('id_check', 1, {
            userId: attorneyId,
            millicents: FACE_MATCH_MILLICENTS,
          });
          return impl.matchFace({ requestId, attorneyId });
        }, FACE_MATCH_PROVIDER)
      : {
          result: 'manual_review',
          details: { provider: FACE_MATCH_PROVIDER, reason: 'no_consent' },
        };
    // verification_provider has no Rekognition value: the row says manual
    // and details.provider names the service (as bar lookups do).
    await this.record(requestId, 'face_match', 'manual', {
      result: outcome.result,
      details: { ...outcome.details, provider: FACE_MATCH_PROVIDER },
    });
    return outcome;
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
    // Row 52: approved = final; the selfie and ID pictures are deleted now
    // (no-op when the request was not approved here; never throws).
    await this.media?.afterDecision(requestId, now);
  }

  /**
   * Owner 2026-11-08: Persona approved the identity after the request was
   * submitted. Approves it only when every pending license already passed
   * its state registry lookup for this request (stored checks, nothing is
   * looked up again); otherwise the request stays with staff.
   */
  async approveIfRegistryPassed(
    requestId: string,
    note: string = PERSONA_APPROVED_NOTE,
  ): Promise<boolean> {
    const req = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      select: {
        status: true,
        provider_ref: true,
        attorney: {
          select: { licenses: { where: { license_status: 'pending' } } },
        },
        checks: {
          where: { check_type: 'bar_lookup' },
          orderBy: { checked_at: 'desc' },
          select: { result: true, details: true },
        },
      },
    });
    if (!req || req.status !== 'submitted' || !req.provider_ref) return false;
    if (!(await this.personaPassed(requestId, req.provider_ref))) return false;
    const licenses = req.attorney.licenses;
    if (licenses.length === 0) return false;
    for (const l of licenses) {
      if (l.registry_flag === 'format_unusual') return false;
      const latest = req.checks.find(
        (c) => (c.details as { licenseId?: unknown }).licenseId === l.id,
      );
      if (latest?.result !== 'pass') return false;
    }
    await this.approve(requestId, note);
    return true;
  }

  /** The newest Persona verdict of [inquiryId] on this request is a pass. */
  private async personaPassed(
    requestId: string,
    inquiryId: string,
  ): Promise<boolean> {
    const latest = await this.prisma.verificationCheck.findFirst({
      where: {
        request_id: requestId,
        provider: 'persona',
        check_type: 'id_check',
        details: { path: ['inquiryId'], equals: inquiryId },
      },
      orderBy: { checked_at: 'desc' },
      select: { result: true },
    });
    return latest?.result === 'pass';
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
        const outcome = await this.barLookup(
          bar,
          license,
          requestId,
          {
            firstName: request.attorney.user.first_name ?? '',
            lastName: request.attorney.user.last_name ?? '',
          },
          { timeoutMs: REGISTRY_CHECK_TIMEOUT_MS },
        );
        const flag = await this.applyRegistryFlag(license.id, outcome);
        if (flag) await this.attempts?.recordFailure(license.attorney_id);
        else if (flag === null) await this.attempts?.reset(license.attorney_id);
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
    /** R-394: hard ceiling of the whole lookup (a slow registry = provider_error). */
    opts: { timeoutMs?: number } = {},
  ): Promise<CheckOutcome> {
    const lookup = () =>
      provider.lookup({
        stateCode: license.state_code,
        barNumber: license.bar_number,
        firstName: name.firstName,
        lastName: name.lastName,
      });
    const outcome = await this.safe(
      () =>
        opts.timeoutMs
          ? withTimeout('state-registry', opts.timeoutMs, lookup)
          : lookup(),
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
          // R-394: where the verifier can look the number up by hand.
          sourceUrl: stateBarLookupUrl(license.state_code, license.bar_number),
          ...outcome.details,
        },
      },
    });
    await this.fillRegistryExpiry(license.id, outcome);
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

  /**
   * Owner 2026-10-24: a registry that publishes the next registration /
   * renewal date (NY `next_registration`) fills `expires_at` itself
   * (source 'registry'). It replaces an attorney's date but never an
   * admin's, and only on a license still pending or verified. The badge
   * is recomputed because the date may have moved in either direction.
   */
  private async fillRegistryExpiry(
    licenseId: string,
    outcome: CheckOutcome,
  ): Promise<void> {
    const iso = outcome.details.registryExpiresAt;
    if (outcome.result !== 'pass' || typeof iso !== 'string') return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const { count } = await this.prisma.attorneyLicense.updateMany({
      where: {
        id: licenseId,
        license_status: { in: ['pending', 'verified'] },
        OR: [{ expires_source: null }, { expires_source: { not: 'admin' } }],
      },
      data: {
        expires_at: new Date(`${iso}T00:00:00Z`),
        expires_source: 'registry',
      },
    });
    if (count === 0) return;
    const row = await this.prisma.attorneyLicense.findUnique({
      where: { id: licenseId },
      select: { attorney_id: true },
    });
    if (row) await this.trust.recompute(row.attorney_id);
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

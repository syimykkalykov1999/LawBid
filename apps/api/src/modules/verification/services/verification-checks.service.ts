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
import { IDENTITY_DOC_TYPES } from '../verification.constants';
import { VerificationProviderSelector } from '../providers/verification-provider.selector';
import type {
  BarLookupProvider,
  CheckOutcome,
} from '../providers/verification-providers';

/**
 * Automatic checks of docs/03 §2.4. They only HELP the verifier: every
 * outcome is stored in `verification_checks` (+ `attorney_licenses.
 * auto_check_result` for bar lookups) and nothing here changes a status.
 * With the flags off (default) no check runs and the request goes
 * straight to manual review. Provider errors and an exhausted CostGuard
 * budget are recorded as `manual_review` and never block the attorney.
 */
@Injectable()
export class VerificationChecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly selector: VerificationProviderSelector,
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
    if (bar.name !== 'manual') {
      for (const license of request.attorney.licenses) {
        await this.barLookup(bar, license, request.id, {
          firstName: request.attorney.user.first_name ?? '',
          lastName: request.attorney.user.last_name ?? '',
        });
      }
    }

    const types = new Set(request.documents.map((d) => d.doc_type));
    const hasIdentity =
      IDENTITY_DOC_TYPES.some((t) => types.has(t)) && types.has('selfie');
    const { provider, impl } = await this.selector.idVerification();
    if (!hasIdentity || provider === 'manual') return;

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

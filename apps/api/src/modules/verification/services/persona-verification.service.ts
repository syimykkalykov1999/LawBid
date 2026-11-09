import {
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { CheckResult, Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { CostGuardService } from '../../../common/cost-guard/cost-guard.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  dashboardUrl,
  PersonaClient,
  type PersonaInquiryLink,
} from '../providers/persona.client';
import { httpError } from '../verification.helpers';
import {
  PERSONA_APPROVED_NOTE,
  VerificationChecksService,
} from './verification-checks.service';

/**
 * Persona event → our check result (docs.withpersona.com/docs/events).
 * Only an approval is acted on automatically; a decline or «needs review»
 * is recorded for staff, who decide (approve / reject / ask for more) in
 * Admin → Проверка exactly as with documents uploaded by hand.
 */
const EVENT_RESULT: Record<string, CheckResult> = {
  'inquiry.approved': 'pass',
  'inquiry.declined': 'fail',
  'inquiry.marked-for-review': 'manual_review',
  'inquiry.failed': 'manual_review',
  'inquiry.completed': 'manual_review',
};

export interface PersonaEvent {
  eventId: string;
  name: string;
  inquiryId: string;
  status: string;
  referenceId: string | null;
}

/** The parts of a Persona webhook body we read, or null if it is not one. */
export function parsePersonaEvent(body: unknown): PersonaEvent | null {
  const data = (body as { data?: Record<string, unknown> } | null)?.data;
  const attrs = data?.attributes as Record<string, unknown> | undefined;
  const inquiry = (
    attrs?.payload as { data?: Record<string, unknown> } | undefined
  )?.data;
  const ia = inquiry?.attributes as Record<string, unknown> | undefined;
  const eventId = data?.id;
  const name = attrs?.name;
  const inquiryId = inquiry?.id;
  if (
    typeof eventId !== 'string' ||
    typeof name !== 'string' ||
    typeof inquiryId !== 'string' ||
    inquiry?.type !== 'inquiry'
  ) {
    return null;
  }
  const ref = ia?.['reference-id'];
  return {
    eventId,
    name,
    inquiryId,
    status: typeof ia?.status === 'string' ? ia.status : '',
    referenceId: typeof ref === 'string' ? ref : null,
  };
}

@Injectable()
export class PersonaVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly persona: PersonaClient,
    private readonly checks: VerificationChecksService,
    private readonly logger: PinoLogger,
    @Optional() private readonly costGuard?: CostGuardService,
  ) {
    this.logger.setContext(PersonaVerificationService.name);
  }

  /** True only with a saved, switched-on key + template + webhook secret. */
  async enabled(): Promise<boolean> {
    try {
      return (await this.persona.config()) !== null;
    } catch {
      return false;
    }
  }

  /**
   * The hosted-flow link for an editable request: the open inquiry of this
   * request is resumed, otherwise a new one is created — which spends one
   * `id_check` unit of the daily cap (Admin → Лимиты). No key = 403
   * FEATURE_DISABLED (the app then shows the manual upload as before);
   * an exhausted cap or Persona down = 503 IDENTITY_PROVIDER_UNAVAILABLE.
   */
  async start(
    req: { id: string; attorney_id: string; provider_ref: string | null },
    provider: string,
  ): Promise<PersonaInquiryLink> {
    const cfg = await this.persona.config();
    if (!cfg) {
      throw httpError(
        HttpStatus.FORBIDDEN,
        ErrorCode.FEATURE_DISABLED,
        'Automatic identity check is off: upload the documents instead.',
      );
    }
    try {
      if (provider === 'persona' && req.provider_ref) {
        const resumed = await this.persona.resumeInquiry(cfg, req.provider_ref);
        if (resumed) return resumed;
      }
      await this.costGuard?.consume('id_check', 1, { userId: req.attorney_id });
      const link = await this.persona.createInquiry(cfg, req.id);
      await this.prisma.verificationRequest.update({
        where: { id: req.id },
        data: { provider: 'persona', provider_ref: link.inquiryId },
      });
      this.logger.info(
        { requestId: req.id, inquiryId: link.inquiryId },
        'Persona inquiry created',
      );
      return link;
    } catch (err) {
      const budget =
        err instanceof HttpException &&
        (err.getResponse() as { code?: string }).code ===
          ErrorCode.PROVIDER_BUDGET_EXCEEDED;
      if (!budget) {
        this.logger.warn({ err, requestId: req.id }, 'Persona start failed');
      }
      throw httpError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.IDENTITY_PROVIDER_UNAVAILABLE,
        'The automatic identity check is unavailable: upload the documents instead.',
        { reason: budget ? 'budget_exceeded' : 'provider_error' },
      );
    }
  }

  /**
   * A verified webhook event. The inquiry must be the one stored on the
   * request (and the reference id, when present, that request's id). Each
   * event is recorded once (Persona retries) as the `id_check` +
   * `face_match` checks the admin already shows; an approval approves a
   * submitted request when its state registry lookups passed too —
   * otherwise it waits for staff, who can always override.
   */
  async handle(event: PersonaEvent): Promise<'ignored' | 'recorded'> {
    const request = await this.prisma.verificationRequest.findFirst({
      where: { provider: 'persona', provider_ref: event.inquiryId },
      select: { id: true, status: true },
    });
    if (!request) return 'ignored';
    if (event.referenceId !== null && event.referenceId !== request.id) {
      this.logger.warn(
        { inquiryId: event.inquiryId, requestId: request.id },
        'Persona event reference id does not match the request',
      );
      return 'ignored';
    }
    if (event.name === 'inquiry.expired') {
      // Abandoned before it was finished: the app starts a new one.
      if (request.status === 'draft' || request.status === 'needs_more_info') {
        await this.prisma.verificationRequest.updateMany({
          where: { id: request.id, provider_ref: event.inquiryId },
          data: { provider_ref: null },
        });
      }
      return 'recorded';
    }
    const result = EVENT_RESULT[event.name];
    if (!result) return 'ignored';
    const seen = await this.prisma.verificationCheck.findFirst({
      where: {
        request_id: request.id,
        provider: 'persona',
        details: { path: ['eventId'], equals: event.eventId },
      },
      select: { id: true },
    });
    if (seen) return 'ignored';
    if (
      event.name === 'inquiry.completed' &&
      (await this.decided(request.id))
    ) {
      return 'ignored';
    }
    const details: Prisma.InputJsonObject = {
      provider: 'persona',
      eventId: event.eventId,
      event: event.name,
      inquiryId: event.inquiryId,
      inquiryStatus: event.status,
      dashboardUrl: dashboardUrl(event.inquiryId),
    };
    const checkedAt = new Date();
    await this.prisma.verificationCheck.createMany({
      data: (['id_check', 'face_match'] as const).map((checkType) => ({
        request_id: request.id,
        check_type: checkType,
        provider: 'persona' as const,
        result,
        details,
        checked_at: checkedAt,
      })),
    });
    this.logger.info(
      { requestId: request.id, inquiryId: event.inquiryId, result },
      'Persona result recorded',
    );
    if (result === 'pass' && request.status === 'submitted') {
      await this.checks.approveIfRegistryPassed(
        request.id,
        PERSONA_APPROVED_NOTE,
      );
    }
    return 'recorded';
  }

  /** An approve / decline was already recorded for this request. */
  private async decided(requestId: string): Promise<boolean> {
    const row = await this.prisma.verificationCheck.findFirst({
      where: {
        request_id: requestId,
        provider: 'persona',
        result: { in: ['pass', 'fail'] },
      },
      select: { id: true },
    });
    return row !== null;
  }
}

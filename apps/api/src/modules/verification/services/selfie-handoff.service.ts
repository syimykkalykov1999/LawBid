import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  RateLimitService,
  SMS_PROVIDER,
  type SmsProvider,
} from '../../auth/auth.public';
import { SmsComplianceService } from '../../compliance/sms-compliance.service';
import type { SelfieHandoffDto } from '../dto/verification-responses.dto';
import { EDITABLE_REQUEST_STATUSES } from '../verification.constants';
import { httpError } from '../verification.helpers';

/** In-app route of the wizard (resumes the server draft where it stopped). */
export const SELFIE_HANDOFF_PATH = '/verification/wizard';

/** Texts per attorney per hour. */
const SMS_PER_HOUR = 3;

/**
 * Owner 2026-10-28 (docs/architecture/ID_SELFIE_CAPTURE_2026-10-28.md §8):
 * an attorney on a computer reaches the ID-selfie step → «continue on the
 * phone». The link (also shown as a QR code) opens the app at the wizard,
 * which resumes the same server draft at the selfie step. The text goes
 * only to the attorney's own verified number, only on their request
 * (SmsComplianceService.sendOnDemand: STOP list respected), 3 an hour.
 */
@Injectable()
export class SelfieHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly rateLimit: RateLimitService,
    private readonly sms: SmsComplianceService,
    @Inject(SMS_PROVIDER) private readonly sender: SmsProvider,
  ) {}

  /** https link when the universal-link domain is configured, else the
   * app scheme. */
  link(): string {
    const base = this.config.get<string>('APP_LINK_BASE_URL');
    return base
      ? `${base}${SELFIE_HANDOFF_PATH}`
      : `lawbid:/${SELFIE_HANDOFF_PATH}`;
  }

  async sendLink(userId: string, requestId: string): Promise<SelfieHandoffDto> {
    const req = await this.prisma.verificationRequest.findFirst({
      where: { id: requestId, attorney_id: userId },
      select: { status: true },
    });
    if (!req) {
      throw httpError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Not found.');
    }
    if (
      !(EDITABLE_REQUEST_STATUSES as readonly string[]).includes(req.status)
    ) {
      throw httpError(
        HttpStatus.CONFLICT,
        ErrorCode.VERIFICATION_INVALID_STATUS,
        'The request status does not allow this action.',
        { status: req.status },
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone_e164: true },
    });
    const phone = user?.phone_e164;
    if (!phone) {
      throw httpError(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Add a phone number to your account first.',
        { reason: 'no_phone' },
      );
    }
    const limit = await this.rateLimit.consumeFixedWindow(
      ['verif-handoff-sms', userId],
      SMS_PER_HOUR,
      3_600,
    );
    if (!limit.allowed) {
      throw httpError(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RATE_LIMITED,
        'Too many texts. Try again later.',
        { retryAfterSeconds: limit.retryAfterSeconds },
      );
    }
    const decision = await this.sms.sendOnDemand(this.sender, {
      phone,
      body: `LawBid: continue your verification on this phone (selfie with your ID): ${this.link()}`,
    });
    return {
      sent: decision.allowed,
      phoneLast4: phone.slice(-4),
      reason: decision.allowed ? null : decision.reason,
    };
  }
}

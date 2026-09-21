import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { OtpService } from '../../auth/services/otp.service';
import { IdentityService } from '../../auth/services/identity.service';
import {
  AuthEventService,
  AUTH_EVENT_TYPES,
} from '../../auth/services/auth-event.service';

/**
 * POST /users/me/contacts/request + /verify (docs/01_FOUNDATION_AUTH.md
 * §10.5, §11 Шаг 3A) — adding/changing the phone or email on an existing,
 * already-authenticated account. Reuses OtpService with purpose='contact'
 * (separate Redis keyspace from purpose='login', see OtpService's class
 * doc) so the hashing/attempts/lockout security properties apply
 * uniformly, and reuses IdentityService.linkIdentifier for the
 * uniqueness/collision check rather than duplicating that logic.
 *
 * Uniqueness is checked at VERIFY time, not REQUEST time (docs/
 * CHANGELOG.md, stage 1.4, judgment call): telling an unauthenticated-
 * feeling "already exists" response at request time would let an
 * attacker enumerate which emails/phones are registered on LawBid by
 * trying to add them as a contact on a throwaway account. At verify
 * time the caller has already proven they received the code at that
 * inbox/number, so rejecting a genuinely-already-claimed contact then
 * leaks nothing an attacker couldn't already infer by owning that inbox.
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly identity: IdentityService,
    private readonly authEvents: AuthEventService,
  ) {}

  async requestVerification(
    userId: string,
    type: 'phone' | 'email',
    value: string,
  ): Promise<void> {
    const normalized = this.normalize(type, value);

    if (type === 'email') {
      const domain = normalized.split('@')[1];
      const blocked = domain
        ? await this.prisma.blockedEmailDomain.findUnique({ where: { domain } })
        : null;
      if (blocked) {
        throw new ForbiddenException({
          code: ErrorCode.CONTACT_DOMAIN_BLOCKED,
          message: 'This email domain is not accepted.',
          details: { reason: blocked.reason },
        });
      }
    }

    await this.otp.requestOtp(type, normalized, 'contact');
    await this.authEvents.record({
      userId,
      eventType: AUTH_EVENT_TYPES.OTP_REQUESTED,
      success: true,
      identifier: normalized,
      meta: { purpose: 'contact', type },
    });
  }

  async verify(
    userId: string,
    type: 'phone' | 'email',
    value: string,
    code: string,
  ): Promise<void> {
    const normalized = this.normalize(type, value);
    const result = await this.otp.verifyOtp(type, normalized, code, 'contact');

    if (result !== 'ok') {
      await this.authEvents.record({
        userId,
        eventType: AUTH_EVENT_TYPES.OTP_VERIFY_FAILED,
        success: false,
        identifier: normalized,
        meta: { purpose: 'contact', type, reason: result },
      });
      if (result === 'locked') {
        throw new HttpException(
          {
            code: ErrorCode.AUTH_OTP_LOCKED,
            message: 'Too many incorrect codes.',
          },
          HttpStatus.LOCKED,
        );
      }
      if (result === 'expired') {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_OTP_EXPIRED,
          message: 'Code expired. Request a new one.',
        });
      }
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_OTP_INVALID,
        message: 'Incorrect code.',
      });
    }

    const linkResult = await this.identity.linkIdentifier(
      userId,
      type,
      normalized,
    );
    if (
      !linkResult.linked &&
      linkResult.reason === 'already_linked_elsewhere'
    ) {
      throw new ConflictException({
        code: ErrorCode.CONTACT_ALREADY_EXISTS,
        message: 'This contact is already in use on another account.',
      });
    }

    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data:
        type === 'phone'
          ? { phone_e164: normalized, phone_verified_at: now }
          : { email: normalized, email_verified_at: now },
    });

    await this.authEvents.record({
      userId,
      eventType: AUTH_EVENT_TYPES.CONTACT_VERIFIED,
      success: true,
      identifier: normalized,
      meta: { type },
    });
  }

  private normalize(type: 'phone' | 'email', value: string): string {
    return type === 'email' ? value.trim().toLowerCase() : value.trim();
  }
}

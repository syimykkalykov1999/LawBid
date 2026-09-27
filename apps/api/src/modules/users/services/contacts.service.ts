import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { withDeleted } from '../../../prisma/soft-delete.extension';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { OtpService } from '../../auth/services/otp.service';
import { IdentityService } from '../../auth/services/identity.service';
import { RateLimitService } from '../../auth/services/rate-limit.service';
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
    private readonly rateLimit: RateLimitService,
    private readonly config: ConfigService,
  ) {}

  /** True when the user already has a verified contact of this type —
   * i.e. a new request would be a change, which needs reauth (§11). */
  async hasVerified(userId: string, type: 'phone' | 'email'): Promise<boolean> {
    // withDeleted: this gates the reauth requirement — never let a
    // soft-deleted account look like it has no verified contact.
    const user = await this.prisma.user.findUnique({
      where: withDeleted({ id: userId }),
      select: { phone_verified_at: true, email_verified_at: true },
    });
    return type === 'phone'
      ? user?.phone_verified_at != null
      : user?.email_verified_at != null;
  }

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

    await this.enforceRequestLimits(userId, normalized);
    await this.otp.requestOtp(type, normalized, 'contact');
    await this.authEvents.record({
      userId,
      eventType: AUTH_EVENT_TYPES.OTP_REQUESTED,
      success: true,
      identifier: normalized,
      meta: { purpose: 'contact', type },
    });
  }

  /**
   * Cost protection (owner decision 2026-09-27, docs/OPEN_QUESTIONS.md):
   * each request here sends a paid SMS/email, and before this change the
   * only limit was the global 100 req/min per-IP throttler. Per user:
   * CONTACT_OTP_LIMIT_PER_USER_PER_HOUR (3) and _PER_DAY (10). Plus the
   * SAME per-identifier sliding window /auth/otp/request uses (docs/01
   * §10.2 "5 запросов/час на номер"), shared across login and contact
   * purposes, so many accounts can't jointly flood one number.
   */
  private async enforceRequestLimits(
    userId: string,
    normalized: string,
  ): Promise<void> {
    const perHour = await this.rateLimit.consumeFixedWindow(
      ['contact-otp', 'user', userId, 'h'],
      this.config.getOrThrow<number>('CONTACT_OTP_LIMIT_PER_USER_PER_HOUR'),
      3600,
    );
    const perDay = await this.rateLimit.consumeFixedWindow(
      ['contact-otp', 'user', userId, 'd'],
      this.config.getOrThrow<number>('CONTACT_OTP_LIMIT_PER_USER_PER_DAY'),
      86_400,
    );
    const perIdentifier = await this.rateLimit.consumeSlidingWindow(
      ['otp-req', 'id', this.rateLimit.hashIdentifier(normalized)],
      this.config.getOrThrow<number>('OTP_RATE_LIMIT_PER_IDENTIFIER_PER_HOUR'),
      3600,
    );
    const blocked = [perHour, perDay, perIdentifier].filter((r) => !r.allowed);
    if (blocked.length > 0) {
      throw new HttpException(
        {
          code: ErrorCode.AUTH_OTP_REQUEST_LIMIT,
          message: 'Too many verification code requests. Try again later.',
          details: {
            retryAfterSeconds: Math.max(
              ...blocked.map((r) => r.retryAfterSeconds),
            ),
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
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

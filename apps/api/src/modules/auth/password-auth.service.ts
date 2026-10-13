import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountBansService } from '../account-bans/account-bans.service';
import { AuthService } from './auth.service';
import type { RequestUser } from './decorators/current-user.decorator';
import type { DeviceInfo } from './services/session.service';
import type { RequestMeta } from './services/session.service';
import {
  AUTH_EVENT_TYPES,
  AuthEventService,
} from './services/auth-event.service';
import { LoginMethodPolicy } from './services/login-method-policy.service';
import { OtpService } from './services/otp.service';
import { PasswordService } from './services/password.service';
import { RateLimitService } from './services/rate-limit.service';
import { SessionRevocationService } from './services/session-revocation.service';
import type { AuthTokensResult } from './social/auth-result.types';
import type {
  PasswordLoginDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  SetPasswordDto,
} from './dto/password.dto';

const WINDOW_SECONDS = 3600;
/** Wrong-password guesses per phone / e-mail and per IP, per hour. */
const LOGIN_PER_IDENTIFIER = 10;
const LOGIN_PER_IP = 40;
/** Reset codes sent per account / IP per hour (the SMS is the paid path). */
const RESET_REQUEST_PER_IDENTIFIER = 3;
const RESET_REQUEST_PER_IP = 15;
const RESET_VERIFY_PER_IDENTIFIER = 10;
const RESET_VERIFY_PER_IP = 30;

type Channel = 'phone' | 'email';

export interface PasswordResetSent {
  sent: true;
  /** Where the code went: the verified e-mail when there is one, else SMS. */
  channel: Channel;
}

/**
 * Owner 2026-10-13: sign in with a password like Instagram — one SMS at
 * sign-up, then phone / e-mail + password, so repeated sign-outs and
 * sign-ins cost nothing. The sign-in tail (suspended / deleted checks, the
 * "other phone" question, session, audit) is AuthService.finishLogin, the
 * same one the SMS code uses.
 */
@Injectable()
export class PasswordAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly rateLimit: RateLimitService,
    private readonly otp: OtpService,
    private readonly authEvents: AuthEventService,
    private readonly loginMethods: LoginMethodPolicy,
    private readonly bans: AccountBansService,
    private readonly revocation: SessionRevocationService,
  ) {}

  // POST /auth/password/login
  async login(
    dto: PasswordLoginDto,
    meta: RequestMeta,
  ): Promise<AuthTokensResult> {
    await this.loginMethods.assertEnabled('password');
    await this.loginMethods.assertPlatformAllowed(dto.deviceInfo?.platform);
    const { channel, identifier } = this.parseIdentifier(dto.identifier);
    const deviceInfo: DeviceInfo = dto.deviceInfo ?? {};

    await this.limit(
      ['pwd-login', 'id', this.rateLimit.hashIdentifier(identifier)],
      LOGIN_PER_IDENTIFIER,
    );
    if (meta.ip) {
      await this.limit(['pwd-login', 'ip', meta.ip], LOGIN_PER_IP);
    }

    const user = await this.findUser(channel, identifier);
    // Always verify (against a dummy hash when there is none): the answer
    // and its timing are the same for an unknown account.
    const ok = await this.passwords.verify(
      dto.password,
      user?.password_hash ?? null,
    );
    if (!user || !ok) {
      await this.authEvents.record({
        userId: user?.id,
        eventType: AUTH_EVENT_TYPES.PASSWORD_LOGIN_FAILED,
        success: false,
        identifier,
        deviceId: deviceInfo.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Incorrect phone number, e-mail or password.',
      });
    }

    await this.bans.assertAllowed({
      userId: user.id,
      phone: user.phone_e164,
      email: user.email,
      deviceId: deviceInfo.deviceId,
    });
    return this.signIn(user, `password:${identifier}`, deviceInfo, meta);
  }

  // POST /auth/password (signed in)
  async setPassword(dto: SetPasswordDto, current: RequestUser): Promise<void> {
    await this.loginMethods.assertEnabled('password');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: current.sub },
    });
    if (user.password_hash) {
      await this.limit(['pwd-change', 'user', user.id], LOGIN_PER_IDENTIFIER);
      const ok = await this.passwords.verify(
        dto.currentPassword ?? '',
        user.password_hash,
      );
      if (!ok) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_INVALID_CREDENTIALS,
          message: 'Incorrect password.',
        });
      }
    }
    await this.storePassword(user.id, dto.password);
    await this.authEvents.record({
      userId: user.id,
      eventType: AUTH_EVENT_TYPES.PASSWORD_SET,
      success: true,
      meta: { changed: Boolean(user.password_hash) },
    });
  }

  // POST /auth/password/reset/request
  async requestReset(
    dto: PasswordResetRequestDto,
    meta: RequestMeta,
  ): Promise<PasswordResetSent> {
    await this.loginMethods.assertEnabled('password');
    const { channel, identifier } = this.parseIdentifier(dto.identifier);
    await this.limit(
      ['pwd-reset-req', 'id', this.rateLimit.hashIdentifier(identifier)],
      RESET_REQUEST_PER_IDENTIFIER,
    );
    if (meta.ip) {
      await this.limit(['pwd-reset-req', 'ip', meta.ip], RESET_REQUEST_PER_IP);
    }

    const user = await this.findUser(channel, identifier);
    const target = user ? await this.resetTarget(user) : null;
    if (user && target) {
      await this.bans.assertAllowed({
        userId: user.id,
        phone: user.phone_e164,
        email: user.email,
        deviceId: meta.deviceId,
      });
      await this.otp.requestOtp(target.channel, target.destination, 'reset');
      await this.authEvents.record({
        userId: user.id,
        eventType: AUTH_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
        success: true,
        identifier,
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { channel: target.channel },
      });
    }
    // Same answer for an unknown account: nothing is sent, nothing is paid.
    return { sent: true, channel: target?.channel ?? channel };
  }

  // POST /auth/password/reset/confirm
  async confirmReset(
    dto: PasswordResetConfirmDto,
    meta: RequestMeta,
  ): Promise<AuthTokensResult> {
    await this.loginMethods.assertEnabled('password');
    await this.loginMethods.assertPlatformAllowed(dto.deviceInfo?.platform);
    const { channel, identifier } = this.parseIdentifier(dto.identifier);
    const deviceInfo: DeviceInfo = dto.deviceInfo ?? {};
    await this.limit(
      ['pwd-reset-verify', 'id', this.rateLimit.hashIdentifier(identifier)],
      RESET_VERIFY_PER_IDENTIFIER,
    );
    if (meta.ip) {
      await this.limit(
        ['pwd-reset-verify', 'ip', meta.ip],
        RESET_VERIFY_PER_IP,
      );
    }

    const user = await this.findUser(channel, identifier);
    const target = user ? await this.resetTarget(user) : null;
    // Unknown account: the same "incorrect code" as a wrong code.
    const result = target
      ? await this.otp.verifyOtp(
          target.channel,
          target.destination,
          dto.code,
          'reset',
        )
      : 'invalid';
    if (!user || result !== 'ok') {
      if (result === 'locked') {
        throw new HttpException(
          {
            code: ErrorCode.AUTH_OTP_LOCKED,
            message:
              'Too many incorrect codes. This code is temporarily locked.',
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

    await this.bans.assertAllowed({
      userId: user.id,
      phone: user.phone_e164,
      email: user.email,
      deviceId: deviceInfo.deviceId,
    });
    await this.storePassword(user.id, dto.newPassword);
    // A forgotten password may mean someone else has it: end every session.
    await this.revocation.revokeAllChainsForUser(user.id, 'logout_all');
    await this.authEvents.record({
      userId: user.id,
      eventType: AUTH_EVENT_TYPES.PASSWORD_RESET_DONE,
      success: true,
      identifier,
      deviceId: deviceInfo.deviceId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.signIn(user, `password:${identifier}`, deviceInfo, meta);
  }

  /** Admin «Сбросить пароль»: drops the password and every session; the
   * person signs in with an SMS code once and sets a new one. */
  async clearPasswordByAdmin(userId: string, adminId?: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash: null, password_set_at: null },
    });
    await this.revocation.revokeAllChainsForUser(userId, 'logout_all');
    await this.authEvents.record({
      userId,
      eventType: AUTH_EVENT_TYPES.PASSWORD_RESET_BY_ADMIN,
      success: true,
      meta: { adminId: adminId ?? null },
    });
  }

  private async signIn(
    user: User,
    identifier: string,
    deviceInfo: DeviceInfo,
    meta: RequestMeta,
  ): Promise<AuthTokensResult> {
    let account = user;
    let deletionCancelled = false;
    if (user.status === 'deletion_pending') {
      account = await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'active', deletion_requested_at: null },
      });
      deletionCancelled = true;
    }
    return this.auth.finishLogin(
      account,
      false,
      deletionCancelled,
      identifier,
      deviceInfo,
      meta,
    );
  }

  private async storePassword(userId: string, password: string): Promise<void> {
    const hash = await this.passwords.hash(password);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash: hash, password_set_at: new Date() },
    });
  }

  private async findUser(
    channel: Channel,
    identifier: string,
  ): Promise<User | null> {
    const row = await this.prisma.userIdentifier.findUnique({
      where: {
        provider_provider_uid: { provider: channel, provider_uid: identifier },
      },
      include: { user: true },
    });
    return row?.user ?? null;
  }

  /** The verified e-mail when there is one (free), else the verified phone
   * (SMS — the only paid path). */
  private async resetTarget(
    user: User,
  ): Promise<{ channel: Channel; destination: string } | null> {
    // E-mail only while the admin's e-mail flows are on (SES may not be
    // allowed to write to any address yet); otherwise the SMS.
    if (
      user.email &&
      user.email_verified_at &&
      (await this.loginMethods.isEnabled('email'))
    ) {
      return { channel: 'email', destination: user.email };
    }
    if (user.phone_e164 && user.phone_verified_at) {
      return { channel: 'phone', destination: user.phone_e164 };
    }
    return null;
  }

  private parseIdentifier(raw: string): {
    channel: Channel;
    identifier: string;
  } {
    const value = raw.trim();
    return value.startsWith('+')
      ? { channel: 'phone', identifier: value }
      : { channel: 'email', identifier: value.toLowerCase() };
  }

  private async limit(key: string[], max: number): Promise<void> {
    const r = await this.rateLimit.consumeSlidingWindow(
      key,
      max,
      WINDOW_SECONDS,
    );
    if (r.allowed) return;
    throw new HttpException(
      {
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many attempts. Try again later.',
        details: { retryAfterSeconds: r.retryAfterSeconds },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

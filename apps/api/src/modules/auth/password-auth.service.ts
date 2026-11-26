import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '../../generated/prisma/client';
import type { UserRow } from '../../prisma/secret-columns';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountBansService } from '../account-bans/account-bans.service';
import {
  AuthService,
  assertAccountOpen,
  cancelDeletionOnLogin,
} from './auth.service';
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
  PhoneStatusDto,
  PhoneStatusResultDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  SetPasswordDto,
} from './dto/password.dto';
import { SignInChangeNotifier } from './notifications/sign-in-change-notifier.service';
import { AuthChallengeService } from './services/auth-challenge.service';
import {
  LOGIN_FAILURES_PER_ACCOUNT_HOUR,
  PasswordLoginThrottle,
} from './services/password-login-throttle.service';
import { simulateSend, timedSend } from './uniform-response.util';

const WINDOW_SECONDS = 3600;
/** Wrong-password guesses per phone / e-mail and per IP, per hour. */
const LOGIN_PER_IDENTIFIER = 10;
const LOGIN_PER_IP = 40;
/** Guesses from ONE source (identifier + IP) — someone else's wrong tries
 * from another place must never lock the owner of the number out. */
const LOGIN_PER_IDENTIFIER_AND_IP = 10;
/** Wrong passwords for one account from anywhere (a guessing storm). Only
 * failures count. Once reached, PasswordLoginThrottle refuses devices that
 * never signed in on the account BEFORE the password check (M1, 2026-11-08);
 * the owner's own devices keep signing in. */
const LOGIN_FAILURES_PER_IDENTIFIER = LOGIN_FAILURES_PER_ACCOUNT_HOUR;
/** Reset codes sent per account / IP per hour (the SMS is the paid path). */
const RESET_REQUEST_PER_IDENTIFIER = 3;
const RESET_REQUEST_PER_IP = 15;
const RESET_VERIFY_PER_IDENTIFIER = 10;
const RESET_VERIFY_PER_IP = 30;

type Channel = 'phone' | 'email';

/** Owner 2026-10-22 (security audit #3): how POST /auth/password proves
 * the caller is the account holder — see ReauthVerifier. */
export interface PasswordReauthProof {
  /** An X-Reauth-Token header came with the request. */
  hasReauthToken: boolean;
  /** Consumes that token, or accepts a sign-in made minutes ago; throws
   * REAUTH_REQUIRED / REAUTH_INVALID otherwise. */
  assertReauth: () => Promise<void>;
}

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
    // Owner 2026-10-16: reset-code caps are admin-editable.
    @Optional() private readonly settings?: AppSettingsService,
    // Owner 2026-10-22 (security audit #3): "your password changed".
    @Optional() private readonly signInChange?: SignInChangeNotifier,
    // 2026-10-25 (S14-13): failed-attempt counting / challenge.
    @Optional() private readonly challenge?: AuthChallengeService,
    // 2026-10-25 (S14-2): first guess of a real SMS send's duration.
    @Optional() private readonly config?: ConfigService,
    // Security audit 2026-11-08 (M1): backoff + account cap before scrypt.
    @Optional() private readonly throttle?: PasswordLoginThrottle,
  ) {}

  private readonly log = new Logger(PasswordAuthService.name);

  // POST /auth/password/login
  async login(
    dto: PasswordLoginDto,
    meta: RequestMeta,
  ): Promise<AuthTokensResult> {
    await this.loginMethods.assertEnabled('password');
    await this.loginMethods.assertPlatformAllowed(dto.deviceInfo?.platform);
    const { channel, identifier } = this.parseIdentifier(dto.identifier);
    // AU4 (17.11): sign-in is phone + password; an e-mail identifier works
    // only while the admin's e-mail switch is on (off on prod).
    if (channel === 'email') await this.loginMethods.assertEnabled('email');
    const deviceInfo: DeviceInfo = dto.deviceInfo ?? {};

    const idHash = this.rateLimit.hashIdentifier(identifier);
    const source = meta.ip ?? deviceInfo.deviceId ?? 'x';
    await this.limit(
      ['pwd-login', 'id+src', `${idHash}:${source}`],
      LOGIN_PER_IDENTIFIER_AND_IP,
    );
    if (meta.ip) {
      await this.limit(['pwd-login', 'ip', meta.ip], LOGIN_PER_IP);
    }

    const user = await this.findUser(channel, identifier);
    // Security audit 2026-11-08 (M1): refused here, before the hash.
    await this.throttle?.assertMayTry({
      idHash,
      source,
      userId: user?.id,
      deviceId: deviceInfo.deviceId,
    });
    // Always verify (against a dummy hash when there is none): the answer
    // and its timing are the same for an unknown account.
    const ok = await this.passwords.verify(
      dto.password,
      user?.password_hash ?? null,
    );
    if (!user || !ok) {
      await this.challenge?.recordFailure('password', identifier, meta.ip);
      await this.throttle?.recordFailure(idHash, source);
      await this.limit(
        ['pwd-login-fail', 'id', idHash],
        LOGIN_FAILURES_PER_IDENTIFIER,
      );
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
    await this.assertNotDowngraded(user, identifier, deviceInfo, meta);
    await this.challenge?.clear(identifier);
    await this.throttle?.recordSuccess(idHash, source);
    await this.upgradeHash(user.id, dto.password, user.password_hash);
    return this.signIn(user, `password:${identifier}`, deviceInfo, meta);
  }

  /**
   * Security & legal pass 2026-10-24 (`security.attorney_strong_auth`):
   * an attorney or assistant who registered a passkey must sign in with it —
   * a password alone (phished, leaked, reused) no longer opens client
   * documents. Accounts without a passkey are not affected. Refused with
   * AUTH_PROVIDER_DISABLED (the app already shows «этот способ входа
   * недоступен»), recorded as a failed password sign-in.
   */
  private async assertNotDowngraded(
    user: User,
    identifier: string,
    deviceInfo: DeviceInfo,
    meta: RequestMeta,
  ): Promise<void> {
    if (!this.settings) return;
    if (user.role !== 'attorney' && user.role !== 'assistant') return;
    if (!(await this.settings.boolean('security.attorney_strong_auth'))) return;
    // Feature reality audit 2026-11-08: with the passkey sign-in switched
    // off (flag passkey_login) the passkey cannot be used, so demanding it
    // locked such attorneys out of both ways in. The password is accepted
    // until passkeys are on again.
    if (!(await this.loginMethods.isEnabled('passkey'))) return;
    const passkeys = await this.prisma.webauthnCredential.count({
      where: { user_id: user.id, scope: 'user' },
    });
    if (passkeys === 0) return;
    await this.authEvents.record({
      userId: user.id,
      eventType: AUTH_EVENT_TYPES.PASSWORD_LOGIN_FAILED,
      success: false,
      identifier,
      deviceId: deviceInfo.deviceId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { reason: 'passkey_enrolled' },
    });
    throw new ForbiddenException({
      code: ErrorCode.AUTH_PROVIDER_DISABLED,
      message: 'Sign in with your passkey: the password alone is not accepted.',
      details: { method: 'password', reason: 'passkey_enrolled' },
    });
  }

  // POST /auth/phone/status — "is this number registered?" (rate-limited
  // per number and per IP).
  async phoneStatus(
    dto: PhoneStatusDto,
    meta: RequestMeta,
  ): Promise<PhoneStatusResultDto> {
    const { channel, identifier } = this.parseIdentifier(dto.identifier);
    await this.limit(
      ['phone-status', 'id', this.rateLimit.hashIdentifier(identifier)],
      LOGIN_PER_IDENTIFIER,
    );
    if (meta.ip) {
      await this.limit(['phone-status', 'ip', meta.ip], LOGIN_PER_IP);
    }
    const user = await this.findUser(channel, identifier);
    // AU1 (17.11, like WhatsApp / Telegram): a registered account without a
    // password (the admin's «Сбросить пароль», a sign-up that never set one)
    // gets no sign-up SMS — POST /auth/otp/request answers `sent` and sends
    // nothing to a registered number (S14-1). It is told so here and the
    // app opens «Забыл пароль», whose reset SMS is one of the two allowed
    // cases. A number with a password already says «registered» here, so
    // this tells no more than before.
    const hasPassword = user?.password_hash != null;
    return { registered: user !== null, hasPassword };
  }

  // POST /auth/password (signed in)
  async setPassword(
    dto: SetPasswordDto,
    current: RequestUser,
    reauth: PasswordReauthProof,
  ): Promise<void> {
    await this.loginMethods.assertEnabled('password');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: current.sub },
      // S10 (#17): the current password is checked below.
      omit: { password_hash: false },
      // #11: the usernames are context words for the new password.
      include: {
        client_profile: { select: { username: true } },
        attorney_profile: { select: { username: true } },
      },
    });
    // Owner 2026-10-22 (security audit #3, finding 1): an account that signs
    // in by SMS has no password — before, anyone holding its access token
    // (an assistant, a thief) could set one. Now: a reauth token, or the
    // current password, or (no password yet) a sign-in minutes ago.
    if (reauth.hasReauthToken || !user.password_hash) {
      await reauth.assertReauth();
    } else {
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
    // #11: the person's own name, username, e-mail and phone count as
    // context words too.
    await this.passwords.assertNotCompromised(dto.password, {
      firstName: user.first_name,
      lastName: user.last_name,
      username:
        user.client_profile?.username ?? user.attorney_profile?.username,
      email: user.email,
      phone: user.phone_e164,
    });
    await this.storePassword(user.id, dto.password);
    await this.authEvents.record({
      userId: user.id,
      eventType: AUTH_EVENT_TYPES.PASSWORD_SET,
      success: true,
      meta: { changed: Boolean(user.password_hash) },
    });
    // Owner 2026-10-22 (security audit #3, finding 5): a new password ends
    // every other session (a thief's included); this device stays in.
    await this.revocation.revokeOtherChainsForUser(
      user.id,
      current.sid,
      'credentials_changed',
    );
    await this.signInChange?.notify({
      userId: user.id,
      kind: 'password',
      previousEmail: user.email && user.email_verified_at ? user.email : null,
    });
  }

  // POST /auth/password/reset/request
  async requestReset(
    dto: PasswordResetRequestDto,
    meta: RequestMeta,
  ): Promise<PasswordResetSent> {
    await this.loginMethods.assertEnabled('password');
    const { channel, identifier } = this.parseIdentifier(dto.identifier);
    this.assertResetByPhone(channel);
    const resetHash = this.rateLimit.hashIdentifier(identifier);
    await this.limit(
      ['pwd-reset-req', 'id', resetHash],
      this.settings
        ? await this.settings.number('sms.reset_per_number_per_hour')
        : RESET_REQUEST_PER_IDENTIFIER,
    );
    if (this.settings) {
      await this.limit(
        ['pwd-reset-req-day', 'id', resetHash],
        await this.settings.number('sms.reset_per_number_per_day'),
        86_400,
      );
    }
    if (meta.ip) {
      await this.limit(['pwd-reset-req', 'ip', meta.ip], RESET_REQUEST_PER_IP);
    }
    // Detective R2-A #17 (14.11): one reset SMS per number per the admin's
    // `sms.resend_cooldown_seconds` (the wait the app counts down). A double
    // tap or a retried request inside it is answered with the same `sent`
    // and sends nothing — idempotent, and no 429 that a known number would
    // trigger differently from an unknown one (S14-1/S14-2).
    if (await this.resetResendTooSoon(resetHash)) {
      await simulateSend(this.uniformDelayMs());
      return { sent: true, channel: 'phone' };
    }

    const user =
      channel === 'phone' ? await this.findUser(channel, identifier) : null;
    const target = user ? this.resetTarget(user) : null;
    if (user && target) {
      // S14-2: a failure here (a banned account, a provider outage, an
      // exhausted budget) must not be visible to the caller either — the
      // answer is the same `sent` as for an unknown number.
      try {
        await this.bans.assertAllowed({
          userId: user.id,
          phone: user.phone_e164,
          email: user.email,
          deviceId: meta.deviceId,
        });
        await timedSend(() =>
          this.otp.requestOtp(target.channel, target.destination, 'reset'),
        );
        await this.authEvents.record({
          userId: user.id,
          eventType: AUTH_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
          success: true,
          identifier,
          ip: meta.ip,
          userAgent: meta.userAgent,
          meta: { channel: target.channel },
        });
      } catch (error) {
        this.log.warn(
          { err: error, userId: user.id },
          'password reset code not sent',
        );
      }
    } else {
      // Unknown account: nothing is sent, nothing is paid — and the answer
      // takes as long as a real send lately did (no stopwatch oracle).
      await simulateSend(this.uniformDelayMs());
    }
    return { sent: true, channel: 'phone' };
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
    this.assertResetByPhone(channel);
    // Owner 2026-10-25: a refused password does not spend the sign-in code.
    // #11: only the typed identifier counts as context here (before the
    // code is checked the account must not be looked up for its names: the
    // answer would tell whether the number belongs to someone).
    await this.passwords.assertNotCompromised(dto.newPassword, {
      phone: channel === 'phone' ? identifier : undefined,
      email: channel === 'email' ? identifier : undefined,
    });
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

    const user =
      channel === 'phone' ? await this.findUser(channel, identifier) : null;
    const target = user ? this.resetTarget(user) : null;
    // S14-2: an unknown account runs the SAME verification (against the
    // identifier itself, where no reset code ever exists): its answer, its
    // attempt counting and its lock-out ladder are those of a known account
    // with no outstanding code.
    const result = await this.otp.verifyOtp(
      target?.channel ?? 'phone',
      target?.destination ?? identifier,
      dto.code,
      'reset',
      { source: meta.ip },
    );
    if (!user || !target || result !== 'ok') {
      await this.challenge?.recordFailure('reset_confirm', identifier, meta.ip);
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
      // One answer for "wrong", "expired" and "no such account" alike.
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_OTP_INVALID,
        message: 'Incorrect or expired code.',
      });
    }

    // AU2 (17.11): a suspended or deleted account is refused (the same
    // answer and audit event the sign-in gives) BEFORE anything changes.
    await assertAccountOpen(
      this.authEvents,
      user,
      identifier,
      deviceInfo,
      meta,
    );
    await this.bans.assertAllowed({
      userId: user.id,
      phone: user.phone_e164,
      email: user.email,
      deviceId: deviceInfo.deviceId,
    });
    const updated = await this.storePassword(user.id, dto.newPassword);
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
    // The row as stored now (its new password_set_at goes into a pending
    // «continue on this phone?» sign-in, AU3).
    return this.signIn(
      { ...user, ...updated },
      `password:${identifier}`,
      deviceInfo,
      meta,
    );
  }

  /** Admin «Сбросить пароль»: drops the password and every session. The
   * person's number then shows as registered without a password
   * (phoneStatus), the app opens «Забыл пароль», and the reset SMS sets a
   * new one (AU1, 17.11; no sign-up SMS goes to a registered number). */
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
    let account: UserRow = user;
    let deletionCancelled = false;
    if (
      user.status === 'deletion_pending' &&
      (await this.auth.loginCancelsDeletion())
    ) {
      const back = await cancelDeletionOnLogin(this.prisma, user);
      account = back.user;
      deletionCancelled = back.cancelled;
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

  /** S3-6: a correct password under old scrypt parameters is hashed again
   * with today's (conditional on the stored value, never fatal). */
  private async upgradeHash(
    userId: string,
    password: string,
    stored: string | null,
  ): Promise<void> {
    if (!stored || !this.passwords.needsRehash(stored)) return;
    try {
      await this.prisma.user.updateMany({
        where: { id: userId, password_hash: stored },
        data: { password_hash: await this.passwords.hash(password) },
      });
    } catch {
      // The old hash still verifies; the next sign-in tries again.
    }
  }

  private async storePassword(
    userId: string,
    password: string,
  ): Promise<UserRow> {
    const hash = await this.passwords.hash(password);
    return this.prisma.user.update({
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
      // S10 (#17): sign-in checks the password; status and reset only need
      // to know whether there is one.
      include: { user: { omit: { password_hash: false } } },
    });
    return row?.user ?? null;
  }

  private uniformDelayMs(): number {
    const v = this.config?.get<number>('AUTH_UNIFORM_MIN_DELAY_MS');
    return typeof v === 'number' && v > 0 ? v : 0;
  }

  /** The verified e-mail when there is one (free), else the verified phone
   * (SMS — the only paid path). */
  private resetTarget(
    user: User,
  ): { channel: Channel; destination: string } | null {
    // Owner 2026-10-14: a forgotten password is reset by SMS only (the
    // e-mail is an unverified profile field and nothing is ever sent to it).
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

  /** Reset works by the phone number only (owner 2026-10-14): an e-mail
   * is told so instead of a "code sent" that never comes. */
  private assertResetByPhone(channel: Channel): void {
    if (channel === 'phone') return;
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Password reset works with a phone number only.',
    });
  }

  /** True while the last reset code to this number is younger than
   * `sms.resend_cooldown_seconds` (0 = no wait). */
  private async resetResendTooSoon(resetHash: string): Promise<boolean> {
    if (!this.settings) return false;
    const cooldown = await this.settings.number('sms.resend_cooldown_seconds');
    if (!(cooldown > 0)) return false;
    const once = await this.rateLimit.consumeFixedWindow(
      ['sms-reset-resend', resetHash],
      1,
      cooldown,
    );
    return !once.allowed;
  }

  private async limit(
    key: string[],
    max: number,
    windowSeconds = WINDOW_SECONDS,
  ): Promise<void> {
    const r = await this.rateLimit.consumeSlidingWindow(
      key,
      max,
      windowSeconds,
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

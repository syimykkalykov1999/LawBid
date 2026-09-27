import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { OtpService } from './services/otp.service';
import { RateLimitService } from './services/rate-limit.service';
import { IdentityService } from './services/identity.service';
import {
  SessionService,
  type DeviceInfo,
  type RequestMeta,
} from './services/session.service';
import { SessionRevocationService } from './services/session-revocation.service';
import { TokenService } from './services/token.service';
import {
  AuthEventService,
  AUTH_EVENT_TYPES,
} from './services/auth-event.service';
import { GoogleTokenVerifier } from './social/google-token-verifier.service';
import { AppleTokenVerifier } from './social/apple-token-verifier.service';
import type { OtpRequestDto } from './dto/otp-request.dto';
import type { OtpVerifyDto } from './dto/otp-verify.dto';
import type { OtpVerifyLinkDto } from './dto/otp-verify-link.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import type { ReauthDto } from './dto/reauth.dto';
import type { LinkIdentifierDto } from './dto/link-identifier.dto';
import type { RequestUser } from './decorators/current-user.decorator';
import type { AuthTokensResult } from './social/auth-result.types';
import { LoginMethodPolicy } from './services/login-method-policy.service';
import { NewDeviceNotifier } from './notifications/new-device-notifier.service';

const ENV = {
  otpPerIdentifierPerHour: 'OTP_RATE_LIMIT_PER_IDENTIFIER_PER_HOUR',
  otpPerIpPerHour: 'OTP_RATE_LIMIT_PER_IP_PER_HOUR',
  otpPerDevicePerHour: 'OTP_RATE_LIMIT_PER_DEVICE_PER_HOUR',
  otpVerifyPerHour: 'AUTH_OTP_VERIFY_LIMIT_PER_HOUR',
  refreshPerIpPerHour: 'AUTH_REFRESH_LIMIT_PER_IP_PER_HOUR',
} as const;

export interface SessionListItem {
  sessionId: string; // session_chain_id
  deviceId: string | null;
  deviceName: string | null;
  platform: string | null;
  appVersion: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  isCurrent: boolean;
}

/**
 * Top-level orchestrator for every /auth/* route except /auth/social
 * (see SocialAuthService — independent branch, docs/CHANGELOG.md stage
 * 1.4). Ties together OtpService, SessionService, TokenService,
 * IdentityService, AuthEventService and RateLimitService per endpoint,
 * per .cursorrules ("Логика только в service" — AuthController stays a
 * thin HTTP-shape layer, see auth.controller.ts).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly rateLimit: RateLimitService,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly revocation: SessionRevocationService,
    private readonly tokens: TokenService,
    private readonly authEvents: AuthEventService,
    private readonly google: GoogleTokenVerifier,
    private readonly apple: AppleTokenVerifier,
    private readonly config: ConfigService,
    private readonly loginMethods: LoginMethodPolicy,
    private readonly newDevice: NewDeviceNotifier,
  ) {}

  // ---------------------------------------------------------------------
  // POST /auth/otp/request
  // ---------------------------------------------------------------------
  async requestOtp(dto: OtpRequestDto, meta: RequestMeta): Promise<void> {
    // Before any rate-limit budget or provider spend (feature flag
    // phone_login / email_login).
    await this.loginMethods.assertEnabled(dto.channel);
    const identifier = this.normalize(dto.channel, dto.identifier);

    const perIdentifier = await this.rateLimit.consumeSlidingWindow(
      ['otp-req', 'id', this.rateLimit.hashIdentifier(identifier)],
      this.limit(ENV.otpPerIdentifierPerHour),
      3600,
    );
    const perIp = meta.ip
      ? await this.rateLimit.consumeFixedWindow(
          ['otp-req', 'ip', meta.ip],
          this.limit(ENV.otpPerIpPerHour),
          3600,
        )
      : { allowed: true, retryAfterSeconds: 0, remaining: 0 };
    // docs/01_FOUNDATION_AUTH.md §10.2: "10/час на IP/устройство". The
    // device id is client-supplied, so this only slows a naive script
    // down — the per-IP limit and CostGuardService's global budget are
    // what actually bound spend. Hashed like identifiers (no raw client
    // strings in Redis keys).
    const perDevice = meta.deviceId
      ? await this.rateLimit.consumeFixedWindow(
          ['otp-req', 'dev', this.rateLimit.hashIdentifier(meta.deviceId)],
          this.limit(ENV.otpPerDevicePerHour),
          3600,
        )
      : { allowed: true, retryAfterSeconds: 0, remaining: 0 };

    if (!perIdentifier.allowed || !perIp.allowed || !perDevice.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.AUTH_OTP_REQUEST_LIMIT,
          message: 'Too many OTP requests. Try again later.',
          details: {
            retryAfterSeconds: Math.max(
              perIdentifier.allowed ? 0 : perIdentifier.retryAfterSeconds,
              perIp.allowed ? 0 : perIp.retryAfterSeconds,
              perDevice.allowed ? 0 : perDevice.retryAfterSeconds,
            ),
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // docs/01_FOUNDATION_AUTH.md §10.6: identical response whether or not
    // an account exists for this identifier — OtpService.requestOtp
    // already never looks the account up, so this is naturally true.
    await this.otp.requestOtp(
      dto.channel,
      identifier,
      'login',
      dto.channel === 'email' ? dto.linkChallenge : undefined,
    );
    await this.authEvents.record({
      eventType: AUTH_EVENT_TYPES.OTP_REQUESTED,
      success: true,
      identifier,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  // ---------------------------------------------------------------------
  // POST /auth/otp/verify
  // ---------------------------------------------------------------------
  async verifyOtp(
    dto: OtpVerifyDto,
    meta: RequestMeta,
  ): Promise<AuthTokensResult> {
    // A code requested before the method was switched off must not still
    // mint a session afterwards.
    await this.loginMethods.assertEnabled(dto.channel);
    const identifier = this.normalize(dto.channel, dto.identifier);
    const deviceInfo: DeviceInfo = dto.deviceInfo ?? {};

    const verifyLimit = await this.rateLimit.consumeSlidingWindow(
      ['otp-verify', this.rateLimit.hashIdentifier(identifier)],
      this.limit(ENV.otpVerifyPerHour),
      3600,
    );
    if (!verifyLimit.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many verification attempts. Try again later.',
          details: { retryAfterSeconds: verifyLimit.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const result = await this.otp.verifyOtp(
      dto.channel,
      identifier,
      dto.code,
      'login',
    );

    if (result !== 'ok') {
      await this.authEvents.record({
        eventType:
          result === 'locked'
            ? AUTH_EVENT_TYPES.OTP_LOCKED
            : AUTH_EVENT_TYPES.OTP_VERIFY_FAILED,
        success: false,
        identifier,
        deviceId: deviceInfo.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { reason: result },
      });
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

    return this.completeOtpLogin(dto.channel, identifier, deviceInfo, meta);
  }

  // ---------------------------------------------------------------------
  // POST /auth/otp/verify-link (email magic link, docs/01 §10.2 E)
  // ---------------------------------------------------------------------
  async verifyOtpLink(
    dto: OtpVerifyLinkDto,
    meta: RequestMeta,
  ): Promise<AuthTokensResult> {
    await this.loginMethods.assertEnabled('email');
    const deviceInfo: DeviceInfo = dto.deviceInfo ?? {};
    const perIp = meta.ip
      ? await this.rateLimit.consumeFixedWindow(
          ['otp-link', 'ip', meta.ip],
          this.limit(ENV.otpVerifyPerHour),
          3600,
        )
      : { allowed: true, retryAfterSeconds: 0, remaining: 0 };
    if (!perIp.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many verification attempts. Try again later.',
          details: { retryAfterSeconds: perIp.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const redeemed = await this.otp.consumeLinkToken(dto.token, dto.verifier);
    if (!redeemed) {
      await this.authEvents.record({
        eventType: AUTH_EVENT_TYPES.OTP_VERIFY_FAILED,
        success: false,
        deviceId: deviceInfo.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { reason: 'link_invalid' },
      });
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_OTP_INVALID,
        message: 'This sign-in link is invalid or has expired.',
      });
    }
    return this.completeOtpLogin('email', redeemed.email, deviceInfo, meta);
  }

  /** Shared tail of a successful OTP (typed code or magic link): identity,
   * account-state checks, session, audit and new-device alert. */
  private async completeOtpLogin(
    channel: 'phone' | 'email',
    identifier: string,
    deviceInfo: DeviceInfo,
    meta: RequestMeta,
  ): Promise<AuthTokensResult> {
    // Identity resolution + the suspended/deleted/deletion-pending checks
    // happen in one transaction; session issuance is a separate step (see
    // docs/CHANGELOG.md stage 1.4: the OTP was already single-use-consumed
    // by the Lua verify script above, so a failure here can't be silently
    // retried with the same code either way — a bigger transaction
    // wouldn't change that failure mode, only delay it).
    const { user, isNewUser, deletionCancelled } = await withTxRetry(
      this.prisma,
      async (tx) => {
        const found = await this.identity.findOrCreateForOtp(
          channel,
          identifier,
          tx,
        );
        if (found.user.status === 'deletion_pending') {
          const updated = await tx.user.update({
            where: { id: found.user.id },
            data: { status: 'active', deletion_requested_at: null },
          });
          return {
            user: updated,
            isNewUser: found.isNewUser,
            deletionCancelled: true,
          };
        }
        return {
          user: found.user,
          isNewUser: found.isNewUser,
          deletionCancelled: false,
        };
      },
    );

    if (user.status === 'suspended') {
      await this.authEvents.record({
        userId: user.id,
        eventType: AUTH_EVENT_TYPES.LOGIN_BLOCKED_SUSPENDED,
        success: false,
        identifier,
        deviceId: deviceInfo.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_SUSPENDED,
        message: 'This account has been suspended.',
      });
    }
    if (user.status === 'deleted') {
      await this.authEvents.record({
        userId: user.id,
        eventType: AUTH_EVENT_TYPES.LOGIN_BLOCKED_DELETED,
        success: false,
        identifier,
        deviceId: deviceInfo.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_DELETED,
        message: 'This account has been deleted.',
      });
    }
    if (deletionCancelled) {
      await this.authEvents.record({
        userId: user.id,
        eventType: AUTH_EVENT_TYPES.ACCOUNT_DELETION_CANCELLED,
        success: true,
        identifier,
        deviceId: deviceInfo.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }

    const isNewDevice = await this.sessions.isNewDevice(
      user.id,
      deviceInfo.deviceId,
    );
    const { session, refreshTokenRaw } = await this.sessions.createSession(
      user.id,
      deviceInfo,
      meta,
    );
    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      role: user.role,
      sid: session.session_chain_id,
      verified: false,
      subscriptionStatus: 'none',
    });

    await this.authEvents.record({
      userId: user.id,
      eventType: AUTH_EVENT_TYPES.OTP_VERIFY_SUCCESS,
      success: true,
      identifier,
      deviceId: deviceInfo.deviceId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { isNewUser, isNewDevice },
    });

    // docs/01 §10.6 new-device alert: audit row inline, delivery detached.
    await this.newDevice.onLogin({
      user,
      isNewUser,
      isNewDevice,
      device: deviceInfo,
      meta,
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      accessTokenExpiresIn: this.tokens.accessTtlSecondsValue(),
      isNewUser,
    };
  }

  // ---------------------------------------------------------------------
  // POST /auth/refresh
  // ---------------------------------------------------------------------
  async refresh(
    dto: RefreshTokenDto,
    meta: RequestMeta,
  ): Promise<AuthTokensResult> {
    if (meta.ip) {
      const ipLimit = await this.rateLimit.consumeFixedWindow(
        ['refresh', 'ip', meta.ip],
        this.limit(ENV.refreshPerIpPerHour),
        3600,
      );
      if (!ipLimit.allowed) {
        throw new HttpException(
          {
            code: ErrorCode.RATE_LIMITED,
            message: 'Too many refresh attempts. Try again later.',
            details: { retryAfterSeconds: ipLimit.retryAfterSeconds },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const deviceInfo: DeviceInfo = dto.deviceInfo ?? {};
    const outcome = await this.sessions.rotate(
      dto.refreshToken,
      deviceInfo,
      meta,
    );

    if (outcome.status === 'invalid') {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_REFRESH_INVALID,
        message: 'Refresh token is invalid.',
      });
    }
    if (outcome.status === 'expired') {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_REFRESH_EXPIRED,
        message: 'Refresh token has expired.',
      });
    }
    if (outcome.status === 'reuse_detected') {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_REFRESH_REUSE_DETECTED,
        message:
          'Refresh token reuse detected; all sessions for this device chain were revoked.',
      });
    }
    if (outcome.status === 'blocked') {
      throw new ForbiddenException(
        outcome.reason === 'suspended'
          ? {
              code: ErrorCode.ACCOUNT_SUSPENDED,
              message: 'This account has been suspended.',
            }
          : {
              code: ErrorCode.ACCOUNT_DELETED,
              message: 'This account has been deleted.',
            },
      );
    }
    if (outcome.status === 'rate_limited') {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message:
            'Too many refresh attempts for this session. Try again later.',
          details: { retryAfterSeconds: outcome.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // withDeleted: the session row, not users.deleted_at, decides whether
    // a refresh is valid (account deletion revokes sessions); keep seeing
    // the account here instead of throwing P2025 (docs/02 §1.4 opt-out).
    const user = await this.prisma.user.findUniqueOrThrow({
      where: withDeleted({ id: outcome.session.user_id }),
    });
    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      role: user.role,
      sid: outcome.session.session_chain_id,
      verified: false,
      subscriptionStatus: 'none',
    });

    return {
      accessToken,
      refreshToken: outcome.refreshTokenRaw,
      accessTokenExpiresIn: this.tokens.accessTtlSecondsValue(),
      isNewUser: false,
    };
  }

  // ---------------------------------------------------------------------
  // POST /auth/logout, /auth/logout-all
  // ---------------------------------------------------------------------
  async logout(user: RequestUser): Promise<void> {
    await this.revocation.revokeChain(user.sid, 'logout');
    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.LOGOUT,
      success: true,
    });
  }

  async logoutAll(user: RequestUser): Promise<void> {
    await this.revocation.revokeAllChainsForUser(user.sub, 'logout_all');
    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.LOGOUT_ALL,
      success: true,
    });
  }

  // ---------------------------------------------------------------------
  // GET /auth/sessions, DELETE /auth/sessions/:id
  // ---------------------------------------------------------------------
  async listSessions(user: RequestUser): Promise<SessionListItem[]> {
    const chains = await this.sessions.listActiveChains(user.sub);
    return chains.map((s) => ({
      sessionId: s.session_chain_id,
      deviceId: s.device_id,
      deviceName: s.device_name,
      platform: s.platform,
      appVersion: s.app_version,
      lastUsedAt: s.last_used_at?.toISOString() ?? null,
      createdAt: s.created_at.toISOString(),
      isCurrent: s.session_chain_id === user.sid,
    }));
  }

  async endSession(user: RequestUser, sessionChainId: string): Promise<void> {
    const owns = await this.sessions.belongsToUser(sessionChainId, user.sub);
    if (!owns) {
      // docs/CHANGELOG.md stage 1.4: 404, not 403 — don't confirm to the
      // caller whether a session id exists at all for someone else.
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Session not found.',
      });
    }
    await this.revocation.revokeChain(sessionChainId, 'logout');
    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.SESSION_REVOKED,
      success: true,
      meta: { sessionChainId, wasCurrentSession: user.sid === sessionChainId },
    });
  }

  // ---------------------------------------------------------------------
  // POST /auth/reauth
  // ---------------------------------------------------------------------
  async reauth(
    dto: ReauthDto,
    user: RequestUser,
  ): Promise<{ reauthToken: string }> {
    const account = await this.prisma.user.findUniqueOrThrow({
      where: withDeleted({ id: user.sub }),
    });
    const channel: 'phone' | 'email' | null =
      account.phone_verified_at && account.phone_e164 === dto.identifier
        ? 'phone'
        : account.email_verified_at &&
            account.email?.toLowerCase() === dto.identifier.toLowerCase()
          ? 'email'
          : null;

    if (!channel) {
      // Doesn't distinguish "not yours" from "not verified" — both are
      // just REAUTH_INVALID to the caller, same anti-enumeration spirit
      // as OTP request/verify.
      await this.authEvents.record({
        userId: user.sub,
        eventType: AUTH_EVENT_TYPES.REAUTH_FAILED,
        success: false,
        identifier: dto.identifier,
      });
      throw new UnauthorizedException({
        code: ErrorCode.REAUTH_INVALID,
        message: 'Identifier is not a verified contact on this account.',
      });
    }

    const result = await this.otp.verifyOtp(
      channel,
      dto.identifier,
      dto.code,
      'login',
    );
    if (result !== 'ok') {
      await this.authEvents.record({
        userId: user.sub,
        eventType: AUTH_EVENT_TYPES.REAUTH_FAILED,
        success: false,
        identifier: dto.identifier,
        meta: { reason: result },
      });
      throw new UnauthorizedException({
        code: ErrorCode.REAUTH_INVALID,
        message: 'Incorrect or expired code.',
      });
    }

    const reauthToken = this.tokens.signReauthToken({
      sub: user.sub,
      sid: user.sid,
    });
    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.REAUTH_SUCCESS,
      success: true,
      identifier: dto.identifier,
    });
    return { reauthToken };
  }

  // ---------------------------------------------------------------------
  // POST /auth/identifiers
  // ---------------------------------------------------------------------
  async linkIdentifier(
    dto: LinkIdentifierDto,
    user: RequestUser,
  ): Promise<void> {
    let providerUid: string;

    if (dto.provider === 'phone' || dto.provider === 'email') {
      if (!dto.identifier || !dto.code) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_OTP_INVALID,
          message: 'identifier and code are required for phone/email linking.',
        });
      }
      const identifier = this.normalize(dto.provider, dto.identifier);
      const result = await this.otp.verifyOtp(
        dto.provider,
        identifier,
        dto.code,
        'login',
      );
      if (result !== 'ok') {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_OTP_INVALID,
          message: 'Incorrect or expired code.',
        });
      }
      providerUid = identifier;
    } else {
      if (!dto.idToken || !dto.nonce) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_SOCIAL_TOKEN_INVALID,
          message: 'idToken and nonce are required for apple/google linking.',
        });
      }
      const verifier = dto.provider === 'apple' ? this.apple : this.google;
      const verified = await verifier.verify(dto.idToken, dto.nonce);
      providerUid = verified.providerUid;
    }

    const linkResult = await this.identity.linkIdentifier(
      user.sub,
      dto.provider,
      providerUid,
    );
    if (!linkResult.linked) {
      throw new HttpException(
        {
          code: ErrorCode.IDENTIFIER_ALREADY_LINKED,
          message:
            linkResult.reason === 'already_linked_here'
              ? 'This identifier is already linked to your account.'
              : 'This identifier is already linked to a different account.',
        },
        HttpStatus.CONFLICT,
      );
    }

    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.IDENTIFIER_LINKED,
      success: true,
      meta: { provider: dto.provider },
    });
  }

  private normalize(channel: 'phone' | 'email', identifier: string): string {
    return channel === 'email'
      ? identifier.trim().toLowerCase()
      : identifier.trim();
  }

  /** Reads an already-validated/coerced numeric env via ConfigService —
   * never process.env directly (that would read the raw string and skip
   * envSchema's zod coercion/defaulting, the same mistake this module
   * already caught and fixed once in SessionService.gracePeriodMs()). */
  private limit(key: (typeof ENV)[keyof typeof ENV]): number {
    return this.config.getOrThrow<number>(key);
  }
}

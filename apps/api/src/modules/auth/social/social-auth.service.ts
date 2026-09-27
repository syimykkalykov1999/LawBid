import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { GoogleTokenVerifier } from './google-token-verifier.service';
import { AppleTokenVerifier } from './apple-token-verifier.service';
import { IdentityService } from '../services/identity.service';
import {
  SessionService,
  type DeviceInfo,
  type RequestMeta,
} from '../services/session.service';
import { TokenService } from '../services/token.service';
import {
  AuthEventService,
  AUTH_EVENT_TYPES,
} from '../services/auth-event.service';
import type { SocialLoginDto } from '../dto/social-login.dto';
import type { AuthTokensResult } from './auth-result.types';
import { RateLimitService } from '../services/rate-limit.service';
import { LoginMethodPolicy } from '../services/login-method-policy.service';
import { NewDeviceNotifier } from '../notifications/new-device-notifier.service';

/**
 * Dispatches to the right SocialTokenVerifier, resolves-or-creates the
 * user via IdentityService's no-auto-merge collision policy (see that
 * class's doc comment), and — on success — issues a session exactly like
 * the OTP path does. Kept as its own service (not folded into
 * AuthService) because the social branch is independent end-to-end
 * (verifier selection, Apple's one-time-name quirk, the 409 collision
 * shape) — this matches the build order both consulted subagents
 * converged on (docs/CHANGELOG.md, stage 1.4).
 */
@Injectable()
export class SocialAuthService {
  constructor(
    private readonly google: GoogleTokenVerifier,
    private readonly apple: AppleTokenVerifier,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly authEvents: AuthEventService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly loginMethods: LoginMethodPolicy,
    private readonly newDevice: NewDeviceNotifier,
    private readonly config: ConfigService,
  ) {}

  async login(
    dto: SocialLoginDto,
    meta: RequestMeta,
  ): Promise<AuthTokensResult> {
    // Feature flag apple_login / google_login, then a per-IP budget
    // (AUTH_SOCIAL_LIMIT_PER_IP_PER_HOUR) — both before the verifier's
    // JWKS work and any DB write.
    await this.loginMethods.assertEnabled(dto.provider);
    await this.assertIpLimit(meta);

    const verifier = dto.provider === 'apple' ? this.apple : this.google;
    const deviceInfo: DeviceInfo = dto.deviceInfo ?? {};

    let verifyResult;
    try {
      verifyResult = await verifier.verify(dto.idToken, dto.nonce);
    } catch (error) {
      await this.authEvents.record({
        eventType: AUTH_EVENT_TYPES.SOCIAL_LOGIN_FAILED,
        success: false,
        deviceId: deviceInfo.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { provider: dto.provider },
      });
      // Verifiers already throw a well-shaped HttpException
      // (AUTH_SOCIAL_TOKEN_INVALID / AUTH_PROVIDER_DISABLED) — rethrow as-is
      // rather than wrapping, so AllExceptionsFilter sees the real cause.
      throw error;
    }

    // docs/01_FOUNDATION_AUTH.md §10.2: Apple sends the name once, out of
    // band, on first login only — the id_token never carries it. Google
    // puts given_name/family_name straight in the token. Prefer whatever
    // the verifier itself returned; fall back to what the client passed
    // through for the Apple first-login case.
    const firstName = verifyResult.firstName ?? dto.firstName;
    const lastName = verifyResult.lastName ?? dto.lastName;

    const resolved = await this.identity.findOrCreateForSocial(
      dto.provider,
      verifyResult.providerUid,
      verifyResult.emailVerified ? verifyResult.email : undefined,
      firstName,
      lastName,
    );

    if ('collision' in resolved) {
      await this.authEvents.record({
        eventType: AUTH_EVENT_TYPES.SOCIAL_LOGIN_FAILED,
        success: false,
        deviceId: deviceInfo.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { provider: dto.provider, reason: 'collision' },
      });
      throw new ConflictException({
        code: ErrorCode.ACCOUNT_EXISTS_USE_OTHER_METHOD,
        message:
          'An account already exists for this email via a different sign-in method.',
        details: {
          maskedIdentifier: resolved.maskedIdentifier,
          availableMethods: resolved.availableMethods,
        },
      });
    }

    const { user } = resolved;

    if (user.status === 'suspended') {
      await this.authEvents.record({
        userId: user.id,
        eventType: AUTH_EVENT_TYPES.LOGIN_BLOCKED_SUSPENDED,
        success: false,
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
        deviceId: deviceInfo.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_DELETED,
        message: 'This account has been deleted.',
      });
    }
    if (user.status === 'deletion_pending') {
      // docs/01_FOUNDATION_AUTH.md §10.7: "можно отменить входом" — any
      // successful authentication during the grace period cancels the
      // pending deletion, social login included.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'active', deletion_requested_at: null },
      });
      await this.authEvents.record({
        userId: user.id,
        eventType: AUTH_EVENT_TYPES.ACCOUNT_DELETION_CANCELLED,
        success: true,
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
      // Placeholder claims — see docs/CHANGELOG.md stage 1.4: real meaning
      // (attorney bar verification / active subscription) doesn't exist
      // yet, those tables/flows are files 3 and 5.
      verified: false,
      subscriptionStatus: 'none',
    });

    await this.authEvents.record({
      userId: user.id,
      eventType: AUTH_EVENT_TYPES.SOCIAL_LOGIN_SUCCESS,
      success: true,
      deviceId: deviceInfo.deviceId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { provider: dto.provider, isNewDevice },
    });

    // docs/01 §10.6 new-device alert: audit row inline, delivery detached.
    await this.newDevice.onLogin({
      user,
      isNewUser: resolved.isNewUser,
      isNewDevice,
      device: deviceInfo,
      meta,
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      accessTokenExpiresIn: this.tokens.accessTtlSecondsValue(),
      isNewUser: resolved.isNewUser,
    };
  }

  private async assertIpLimit(meta: RequestMeta): Promise<void> {
    if (!meta.ip) return;
    const result = await this.rateLimit.consumeFixedWindow(
      ['social', 'ip', meta.ip],
      this.config.getOrThrow<number>('AUTH_SOCIAL_LIMIT_PER_IP_PER_HOUR'),
      3600,
    );
    if (result.allowed) return;
    throw new HttpException(
      {
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many sign-in attempts. Try again later.',
        details: { retryAfterSeconds: result.retryAfterSeconds },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

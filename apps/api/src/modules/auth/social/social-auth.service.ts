import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { GoogleTokenVerifier } from './google-token-verifier.service';
import { AppleTokenVerifier } from './apple-token-verifier.service';
import { IdentityService } from '../services/identity.service';
import type { DeviceInfo, RequestMeta } from '../services/session.service';
import {
  AuthEventService,
  AUTH_EVENT_TYPES,
} from '../services/auth-event.service';
import type { SocialLoginDto } from '../dto/social-login.dto';
import type { AuthTokensResult } from './auth-result.types';
import { RateLimitService } from '../services/rate-limit.service';
import { LoginMethodPolicy } from '../services/login-method-policy.service';
import { ClientFraudService } from '../../client-fraud/client-fraud.service';
import { AccountBansService } from '../../account-bans/account-bans.service';
import { AuthService } from '../auth.service';

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
    private readonly authEvents: AuthEventService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly loginMethods: LoginMethodPolicy,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly bans: AccountBansService,
    // Owner 2026-10-05 (docs/CLIENT_FRAUD.md): a new Apple / Google
    // account of a blocked fraudster (same subject, e-mail or device).
    @Optional() private readonly fraud?: ClientFraudService,
  ) {}

  async login(
    dto: SocialLoginDto,
    meta: RequestMeta,
  ): Promise<AuthTokensResult> {
    // Feature flag apple_login / google_login, then a per-IP budget
    // (AUTH_SOCIAL_LIMIT_PER_IP_PER_HOUR) — both before the verifier's
    // JWKS work and any DB write.
    await this.loginMethods.assertEnabled(dto.provider);
    await this.loginMethods.assertPlatformAllowed(dto.deviceInfo?.platform);
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
    const social = { provider: dto.provider, uid: verifyResult.providerUid };
    await this.fraud?.assertSignInAllowed({
      social,
      email: verifyResult.emailVerified ? verifyResult.email : null,
      deviceKey: meta.deviceKey,
    });

    const verifiedEmail = verifyResult.emailVerified
      ? verifyResult.email
      : undefined;
    // Owner 2026-10-02: a banned e-mail or device gets no account at all.
    await this.bans.assertAllowed({
      email: verifiedEmail ?? null,
      deviceId: deviceInfo.deviceId,
    });
    // S14-6: a first Apple / Google sign-in with a throw-away e-mail opens
    // no account (an identity that already exists is never refused).
    if (verifiedEmail) {
      const known = await this.prisma.userIdentifier.findUnique({
        where: {
          provider_provider_uid: {
            provider: dto.provider,
            provider_uid: verifyResult.providerUid,
          },
        },
        select: { user_id: true },
      });
      if (!known) {
        await this.auth.assertEmailAllowedForSignup(
          verifiedEmail.trim().toLowerCase(),
        );
      }
    }

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

    let { user } = resolved;
    let deletionCancelled = false;
    if (user.status === 'deletion_pending') {
      // docs/01_FOUNDATION_AUTH.md §10.7: "можно отменить входом" — any
      // successful authentication during the grace period cancels the
      // pending deletion, social login included. (A suspended or deleted
      // account is refused by finishLogin below, before this matters.)
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'active', deletion_requested_at: null },
      });
      deletionCancelled = true;
    }

    // S14-5: from here on the sign-in is the SAME one OTP and password use
    // (status checks, bans by phone / e-mail / device, the "other phone"
    // question, fraud, session, audit, new-device alert) — one choke point
    // instead of a third copy that had already drifted from it.
    return this.auth.finishLogin(
      user,
      resolved.isNewUser,
      deletionCancelled,
      `social:${dto.provider}`,
      deviceInfo,
      meta,
      { social },
    );
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

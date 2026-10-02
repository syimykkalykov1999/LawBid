import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PinoLogger } from 'nestjs-pino';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SocialAuthService } from './social/social-auth.service';
import { GoogleTokenVerifier } from './social/google-token-verifier.service';
import { AppleTokenVerifier } from './social/apple-token-verifier.service';
import { TokenService } from './services/token.service';
import { OtpService } from './services/otp.service';
import { RateLimitService } from './services/rate-limit.service';
import { IdentityService } from './services/identity.service';
import { SessionService } from './services/session.service';
import { SessionRevocationService } from './services/session-revocation.service';
import { AuthEventService } from './services/auth-event.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AssistantContextService } from './assistant/assistant-context';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ReauthGuard } from './guards/reauth.guard';
import { ReauthVerifier } from './services/reauth-verifier.service';
import { SMS_PROVIDER, EMAIL_PROVIDER } from './providers/provider.tokens';
import type { SmsProvider } from './providers/sms/sms-provider.interface';
import { MockSmsProvider } from './providers/sms/mock-sms.provider';
import { DynamicSmsProvider } from './providers/sms/twilio-sms.provider';
import { SecretsService } from '../../common/secrets/secrets.service';
import { createEmailProvider } from './providers/email/email-provider.factory';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoginMethodPolicy } from './services/login-method-policy.service';
import { NewDeviceNotifier } from './notifications/new-device-notifier.service';
import { EmailLoginNotificationChannel } from './notifications/email-login-notification.channel';
import { PushLoginNotificationChannel } from './notifications/push-login-notification.channel';
import {
  LOGIN_NOTIFICATION_CHANNELS,
  type LoginNotificationChannel,
} from './notifications/login-notification-channel';
import {
  APP_ATTEST_VERIFIER,
  PLAY_INTEGRITY_VERIFIER,
} from './attestation/attestation-verifier.interface';
import { UnconfiguredAttestationVerifier } from './attestation/unconfigured-attestation.verifier';
import { DeviceAttestationService } from './attestation/device-attestation.service';
import { DeviceAttestationGuard } from './attestation/device-attestation.guard';
import type { AppEnv } from '../../config/env.schema';
import { resolveSmsProvider } from '../../config/provider-selection';

/**
 * docs/01_FOUNDATION_AUTH.md §15 stage 1.4. Registers JwtAuthGuard as the
 * global APP_GUARD (fail-closed — every route needs @Public() to opt
 * out) alongside the existing global ThrottlerGuard from AppModule;
 * Nest runs global guards in registration order, and AppModule imports
 * AuthModule AFTER ThrottlerModule (see app.module.ts), so the cheap
 * per-IP rate-limit rejection still happens before any JWT verification.
 *
 * Which provider is built is decided by config/provider-selection.ts
 * (SMS_PROVIDER/EMAIL_PROVIDER=auto → real provider as soon as its
 * credentials are set; env.schema.ts already refused boot if a deployed
 * env would end up on mock). The choice is logged once at boot.
 *
 * SMS_PROVIDER/EMAIL_PROVIDER are built via useFactory rather than
 * registering all of Mock, Twilio, and Ses classes as ordinary providers:
 * Twilio/SesEmailProvider's constructors call config.getOrThrow() for
 * credentials that are only required (env.schema.ts) when that provider
 * is actually selected — eagerly instantiating the unused one (Nest's
 * default) would crash boot in dev/test where SMS_PROVIDER=mock but no
 * TWILIO_* vars are set.
 *
 * TokenService, SessionRevocationService, ReauthGuard, OtpService,
 * IdentityService and AuthEventService are exported for UsersModule:
 * ContactsService needs OtpService (purpose='contact') and
 * IdentityService.linkIdentifier (contact uniqueness/collision check,
 * see ContactsService's class doc); AccountDeletionService needs
 * SessionRevocationService to revoke every session at the 14-day
 * grace-period boundary and AuthEventService for its audit trail;
 * ReauthGuard protects contact-change/account-deletion routes per
 * docs/01_FOUNDATION_AUTH.md §10.1.
 */
@Module({
  // FeatureFlagsModule: AppConfigService for OtpService's SMS country
  // allow-list (app_config `sms.allowed_country_codes`).
  imports: [
    JwtModule.register({}),
    FeatureFlagsModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SocialAuthService,
    GoogleTokenVerifier,
    AppleTokenVerifier,
    TokenService,
    OtpService,
    RateLimitService,
    IdentityService,
    SessionService,
    SessionRevocationService,
    AuthEventService,
    ReauthGuard,
    ReauthVerifier,
    LoginMethodPolicy,
    // docs/01 §10.6 new-device alert: one entry per delivery channel.
    EmailLoginNotificationChannel,
    PushLoginNotificationChannel,
    {
      provide: LOGIN_NOTIFICATION_CHANNELS,
      useFactory: (
        email: EmailLoginNotificationChannel,
        push: PushLoginNotificationChannel,
      ): LoginNotificationChannel[] => [email, push],
      inject: [EmailLoginNotificationChannel, PushLoginNotificationChannel],
    },
    NewDeviceNotifier,
    // docs/01 §10.6 device integrity, behind flag `device_attestation`.
    // Both verifiers reject everything until real App Attest / Play
    // Integrity implementations (owner keys) replace these providers.
    {
      provide: APP_ATTEST_VERIFIER,
      useValue: new UnconfiguredAttestationVerifier('ios'),
    },
    {
      provide: PLAY_INTEGRITY_VERIFIER,
      useValue: new UnconfiguredAttestationVerifier('android'),
    },
    DeviceAttestationService,
    DeviceAttestationGuard,
    AssistantContextService,
    {
      provide: SMS_PROVIDER,
      // Owner 2026-10-01: keys from the admin (Integrations) or the env,
      // read at send time — a key change needs no restart.
      useFactory: (
        config: ConfigService,
        logger: PinoLogger,
        secrets: SecretsService,
      ): SmsProvider => {
        const { provider, missing } = resolveSmsProvider({
          NODE_ENV: config.getOrThrow<AppEnv['NODE_ENV']>('NODE_ENV'),
          SMS_PROVIDER:
            config.getOrThrow<AppEnv['SMS_PROVIDER']>('SMS_PROVIDER'),
          TWILIO_ACCOUNT_SID: config.get<string>('TWILIO_ACCOUNT_SID'),
          TWILIO_AUTH_TOKEN: config.get<string>('TWILIO_AUTH_TOKEN'),
          TWILIO_FROM_NUMBER: config.get<string>('TWILIO_FROM_NUMBER'),
          TWILIO_MESSAGING_SERVICE_SID: config.get<string>(
            'TWILIO_MESSAGING_SERVICE_SID',
          ),
        });
        logger.info({ provider, missing }, 'SMS provider selected at boot');
        return new DynamicSmsProvider(
          config,
          logger,
          secrets,
          new MockSmsProvider(logger),
        );
      },
      inject: [ConfigService, PinoLogger, SecretsService],
    },
    {
      provide: EMAIL_PROVIDER,
      useFactory: createEmailProvider,
      inject: [ConfigService, PinoLogger, SecretsService, PrismaService],
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [
    TokenService,
    SessionRevocationService,
    ReauthGuard,
    ReauthVerifier,
    OtpService,
    IdentityService,
    AuthEventService,
    // ContactsService: per-user/per-identifier limits on contact OTPs.
    RateLimitService,
    // OQ-048: the assistant module drops the cache on team changes.
    AssistantContextService,
  ],
})
export class AuthModule {}

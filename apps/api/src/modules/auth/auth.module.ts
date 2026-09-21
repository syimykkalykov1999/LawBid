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
import { ReauthGuard } from './guards/reauth.guard';
import { SMS_PROVIDER, EMAIL_PROVIDER } from './providers/provider.tokens';
import type { SmsProvider } from './providers/sms/sms-provider.interface';
import { MockSmsProvider } from './providers/sms/mock-sms.provider';
import { TwilioSmsProvider } from './providers/sms/twilio-sms.provider';
import type { EmailProvider } from './providers/email/email-provider.interface';
import { MockEmailProvider } from './providers/email/mock-email.provider';
import { SesEmailProvider } from './providers/email/ses-email.provider';

/**
 * docs/01_FOUNDATION_AUTH.md §15 stage 1.4. Registers JwtAuthGuard as the
 * global APP_GUARD (fail-closed — every route needs @Public() to opt
 * out) alongside the existing global ThrottlerGuard from AppModule;
 * Nest runs global guards in registration order, and AppModule imports
 * AuthModule AFTER ThrottlerModule (see app.module.ts), so the cheap
 * per-IP rate-limit rejection still happens before any JWT verification.
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
  imports: [JwtModule.register({})],
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
    {
      provide: SMS_PROVIDER,
      useFactory: (config: ConfigService, logger: PinoLogger): SmsProvider =>
        config.get<string>('SMS_PROVIDER') === 'twilio'
          ? new TwilioSmsProvider(config, logger)
          : new MockSmsProvider(logger),
      inject: [ConfigService, PinoLogger],
    },
    {
      provide: EMAIL_PROVIDER,
      useFactory: (config: ConfigService, logger: PinoLogger): EmailProvider =>
        config.get<string>('EMAIL_PROVIDER') === 'ses'
          ? new SesEmailProvider(config, logger)
          : new MockEmailProvider(config, logger),
      inject: [ConfigService, PinoLogger],
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [
    TokenService,
    SessionRevocationService,
    ReauthGuard,
    OtpService,
    IdentityService,
    AuthEventService,
  ],
})
export class AuthModule {}

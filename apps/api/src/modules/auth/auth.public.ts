/**
 * The auth module's public face for other modules (architecture rule:
 * src/architecture/module-boundaries.spec.ts — other modules import only
 * files at a module's root). Owner 2026-10-22 (security audit #3); the
 * analytics consent (audit #4) reads the optional bearer of a public
 * endpoint through TokenService.
 */
export { SessionRevocationService } from './services/session-revocation.service';
export { SignInChangeNotifier } from './notifications/sign-in-change-notifier.service';
export { TokenService } from './services/token.service';
// Owner 2026-10-22: passkeys for the admin panel (second factor / step-up)
// and the QR sign-in socket namespace (realtime).
export { PasskeyService } from './passkeys/passkey.service';
export type {
  AuthenticationChallenge,
  PasskeyView,
} from './passkeys/passkey.service';
export {
  PasskeyAuthenticationOptionsDto,
  PasskeyDto,
  PasskeyListDto,
  PasskeyRegistrationOptionsDto,
  PasskeyRemovedDto,
} from './passkeys/passkey.dto';
export { RateLimitService } from './services/rate-limit.service';
export { QR_LOGIN_TTL_SEC } from './services/qr-login.service';
// Compliance (#388): the provider contracts the e-mail / SMS suppression
// wrappers implement.
export type {
  EmailMessage,
  EmailProvider,
} from './providers/email/email-provider.interface';
export type { SmsProvider } from './providers/sms/sms-provider.interface';

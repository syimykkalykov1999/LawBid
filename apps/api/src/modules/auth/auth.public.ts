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

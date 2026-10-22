/**
 * The users module's public face for other modules (architecture rule:
 * src/architecture/module-boundaries.spec.ts — other modules import only
 * files at a module's root). Owner 2026-10-22 (client economy plan,
 * package G): GET /me/session answers the same `me` as GET /users/me.
 */
export { MeDto } from './dto/user-responses.dto';
export { OnboardingService, type MeView } from './services/onboarding.service';

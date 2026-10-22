/**
 * The feature-flags module's public face for other modules (architecture rule:
 * src/architecture/module-boundaries.spec.ts — other modules import only files
 * at a module's root).
 */
export { FeatureFlagsService } from './services/feature-flags.service';
// Owner 2026-10-22 (client economy plan, package G): GET /me/session
// builds on the bootstrap and its config version.
export { BootstrapService } from './services/bootstrap.service';
export { readConfigVersion } from './services/config-version';

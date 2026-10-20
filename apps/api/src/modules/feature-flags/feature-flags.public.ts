/**
 * The feature-flags module's public face for other modules (architecture rule:
 * src/architecture/module-boundaries.spec.ts — other modules import only files
 * at a module's root).
 */
export { FeatureFlagsService } from './services/feature-flags.service';

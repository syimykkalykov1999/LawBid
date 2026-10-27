/**
 * The admin-launch module's public face for other modules (architecture
 * rule: src/architecture/module-boundaries.spec.ts — other modules import
 * only files at a module's root).
 */
// Owner 2026-10-27: «Продвижение» starts the SEO workflow as a dry run
// through the same GitHub App as the infra switches.
export { InfraGithubClient } from './infra/infra-github.client';

/** The verification module's pieces for other modules (module-boundaries rule). */
// Owner 2026-11-12 (row 50): «ИИ-сотрудник» asks the official bar registries
// through the platform's own lookup (master flag, per-state settings, rate
// limits, cache, breaker), never a scraper of its own.
export { AutoBarLookupProvider } from './providers/bar-lookup/auto-bar-lookup.provider';
export { stateBarLookupUrl } from './state-bar-links';
// Owner 2026-11-12 (row 60): «Автоматическое решение по адвокатам» — the AI
// employee's proposals feed it; an accepted appeal reopens the request.
export {
  AUTO_REJECT_KIND,
  VerificationAutoDecisionService,
  reopenAutoRejectedRequest,
} from './services/verification-auto-decision.service';
// Owner row 50 (13.11): health of each state's bar registry; while a state is
// degraded its lookups go to a person (registryDegraded(state)).
export {
  REGISTRY_DEGRADED_REASON,
  RegistryHealthService,
} from './services/registry-health.service';

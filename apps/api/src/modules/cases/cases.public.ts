/**
 * The cases module's public face for other modules (architecture rule:
 * src/architecture/module-boundaries.spec.ts — other modules import only
 * files at a module's root). Owner 2026-10-18.
 */
export { touchClientActive } from './domain/client-activity';
export {
  assertContingency,
  contingencyPolicy,
  PERCENT_BPS_MAX,
  PERCENT_BPS_MIN,
} from './domain/contingency';
export { budgetFilterSql } from './queries/budget-filter.sql';
export { maskContactInfo } from './domain/contact-detector';
// Owner 2026-10-22 (security audit #3): the conflict check (bids) asks the
// same view policy before it loads a case.
export { CaseAccessPolicy } from './policies/case-access.policy';
export { caseNotFound } from './domain/case-state-machine';
// Owner 2026-10-25: the case fan-out audience (notifications) reads the
// urgency thresholds the case feed uses.
export {
  effectiveUrgency,
  loadUrgencyThresholds,
  URGENT_LEVELS,
} from './domain/case-urgency';

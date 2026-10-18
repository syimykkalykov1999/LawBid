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

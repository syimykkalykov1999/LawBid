import { CASE_WEIGHTS } from '../cases.scoring';

/**
 * The attorneys' case feed has its own learned ranker (owner 25.11: «умную
 * ленту для всех лент»). A two-sided marketplace ranks like Airbnb search
 * ("Applying Deep Learning to Airbnb Search", KDD 2019: candidates, then a
 * model trained on what ends in a booking, LambdaRank-style pairwise
 * loss): the label is the deal, not the click. Here it learns from what
 * the attorney does with a case — opens it, makes an offer, gets hired —
 * apart from the posts and reels models (ml/feed-ranker/train.py
 * --feed cases).
 *
 * Fairness / legal rule (owner 25.11): the model sees ONLY these numbers
 * about the case and the attorney's own fit with it — topic, licensed
 * state, freshness, budget, competition, urgency, the client's rating,
 * attention, the client's recent activity, the date — and whether the
 * attorney already made an offer. Nothing about who the client is (no
 * name, gender, age, ethnicity, religion, nationality, language, disability,
 * address, photo). The state / qualification / licence rules are hard
 * filters in SQL BEFORE ranking (cases-visible.sql.ts); a model can only
 * re-order cases the attorney may already see, never add or hide one.
 * cases-features.spec.ts holds this list to an allowlist.
 */
export const CASES_FEATURE_SPEC = {
  version: 'cases-ranker-features-v1',
  surface: 'case_feed',
  round: 4,
  features: [
    'practice',
    'state',
    'fresh',
    'budget',
    'competition',
    'urgency',
    'client',
    'demand',
    'clientActive',
    'urgentActive',
    'dateNear',
    'bidOn',
  ],
} as const;

/** The formula's own feature names (cases.scoring.ts), in its order. */
export const CASE_FORMULA_FEATURES = Object.keys(CASE_WEIGHTS);

/** The cases model's input object for one case (as logged, as scored). */
export function caseRankerRow(
  formula: Readonly<Record<string, number>>,
  bidOn: boolean,
): Record<string, number> {
  return { ...formula, bidOn: bidOn ? 1 : 0 };
}

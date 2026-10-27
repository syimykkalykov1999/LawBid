/**
 * Staff package T12: the non-AI recommendation text. T5 (rating) / T10
 * (owner pages) bind this token to their template; AI mode CALLS it, it does
 * not duplicate it. While nothing is bound the summary endpoint answers
 * `source: "none"` and the page shows its own template.
 */
export const STAFF_RECOMMENDATION_TEMPLATE = Symbol(
  'STAFF_RECOMMENDATION_TEMPLATE',
);

export interface StaffRecommendationTemplate {
  /** The plain-Russian rule-based sentence for one open suggestion, or null. */
  describe(suggestion: {
    id: string;
    adminId: string;
    kind: string;
    evidence: unknown;
  }): string | null;
}

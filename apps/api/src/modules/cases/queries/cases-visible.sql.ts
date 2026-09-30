import { Prisma } from '@prisma/client';

/** docs/04 §4.1 exception: not_sure_or_other cases are also shown to
 * attorneys who chose General Practice or Not Sure or Other. Same
 * constants as CaseAccessPolicy (kept local — these two files must not
 * import each other's private query internals). */
export const GENERAL_PRACTICE_CODE = 'general_practice.general_practice';
export const NOT_SURE_OR_OTHER_CODE = 'general_practice.not_sure_or_other';

export interface FeedCursor {
  createdAt: Date;
  id: string;
}

export interface VisibleCasesQueryInput {
  attorneyId: string;
  /** docs/04 §4.2 filters — narrow further, never widen. */
  practiceAreaId?: string;
  /** Owner 2026-09-30 (OQ-034): any leaf of this category code. */
  practiceCategory?: string;
  /** OQ-036: more `AND c.…` conditions (Search filters), both branches. */
  extra?: Prisma.Sql;
  state?: string;
  cursor?: FeedCursor;
  limit: number;
  /** docs/05 §7.4 search: full-text match on title + description
   * (cases.search_tsv) and a publication window. Absent = the §4.2 feed. */
  text?: string;
  since?: Date;
}

/**
 * docs/04_CASES_BIDS.md §4.1 / docs/02_DATABASE.md §5.4 — the attorney
 * case feed. This MUST stay the same shape as the canonical query in
 * test/db-roles-indexes.e2e-spec.ts (`visibleQuery`, docs/04 stage 4.3
 * instructions): matches on the case's primary state go through
 * `cases_open_feed_idx` (primary_state_code, practice_area_id,
 * created_at DESC) per (licensed state × practice) pair the attorney
 * holds; matches on an additional state go through `case_states
 * (state_code, case_id)`. A naive `IN (...) + EXISTS` form makes
 * CockroachDB scan every open case and every case_states row instead
 * (test/db-roles-indexes.e2e-spec.ts's comment on `visibleQuery`).
 *
 * Extended, without changing that shape, for:
 * - §4.1's not_sure_or_other exception: an extra branch UNIONed into each
 *   side's "which (state, practice) pairs are mine" subquery, mapping an
 *   attorney's General Practice selection onto the
 *   general_practice.not_sure_or_other id (mirrors
 *   CaseAccessPolicy's single-case form of the same exception);
 * - the §4.2 practice/state filters: pushed into the branch each column
 *   belongs to (primary_state_code on the first branch, case_states on
 *   the second), so they narrow the same index scans rather than adding
 *   a post-filter;
 * - keyset pagination (created_at DESC, id DESC) and LIMIT, applied to
 *   the UNION the same way the canonical query's own `ORDER BY ... LIMIT`
 *   already is.
 *
 * test/stage-4-3.e2e-spec.ts imports this function directly (not a copy
 * of the SQL) so its EXPLAIN assertions cover exactly what production
 * code sends to CockroachDB.
 */
export function buildVisibleCasesSql(
  input: VisibleCasesQueryInput,
): Prisma.Sql {
  const {
    attorneyId,
    practiceAreaId,
    practiceCategory,
    state,
    cursor,
    limit,
    text,
    since,
    extra,
  } = input;
  const extraFilter = extra ?? Prisma.empty;
  // Narrows (never widens) the per-branch practice match to the leaves of
  // one category.
  const categoryFilter = practiceCategory
    ? Prisma.sql`AND c.practice_area_id IN (
        SELECT leaf.id FROM practice_areas leaf
        JOIN practice_areas cat ON cat.id = leaf.parent_id
        WHERE cat.code = ${practiceCategory})`
    : Prisma.empty;
  const searchFilter = Prisma.sql`${
    text
      ? Prisma.sql`AND c.search_tsv @@ plainto_tsquery('english', ${text})`
      : Prisma.empty
  } ${since ? Prisma.sql`AND c.created_at >= ${since}` : Prisma.empty}`;

  const primaryStateFilter = state
    ? Prisma.sql`AND c.primary_state_code = ${state}`
    : Prisma.empty;
  const primaryPracticeFilter = practiceAreaId
    ? Prisma.sql`AND c.practice_area_id = ${practiceAreaId}::UUID`
    : Prisma.empty;
  const secondaryStateFilter = state
    ? Prisma.sql`AND cs.state_code = ${state}`
    : Prisma.empty;
  const secondaryPracticeFilter = practiceAreaId
    ? Prisma.sql`AND c.practice_area_id = ${practiceAreaId}::UUID`
    : Prisma.empty;
  const cursorFilter = cursor
    ? Prisma.sql`AND (created_at < ${cursor.createdAt}
        OR (created_at = ${cursor.createdAt} AND id < ${cursor.id}::UUID))`
    : Prisma.empty;

  return Prisma.sql`
    SELECT id, created_at FROM (
      SELECT c.id, c.created_at FROM cases c
      WHERE c.status = 'open' AND c.deleted_at IS NULL
        AND (c.primary_state_code, c.practice_area_id) IN (
          SELECT l.state_code, ap.practice_area_id
          FROM attorney_licenses l
          JOIN attorney_practice_areas ap ON ap.attorney_id = l.attorney_id
          WHERE l.attorney_id = ${attorneyId}::UUID AND l.license_status = 'verified'
          UNION
          SELECT l.state_code, pa2.id
          FROM attorney_licenses l
          JOIN attorney_practice_areas ap ON ap.attorney_id = l.attorney_id
          JOIN practice_areas pa ON pa.id = ap.practice_area_id
          JOIN practice_areas pa2 ON pa2.code = ${NOT_SURE_OR_OTHER_CODE}
          WHERE l.attorney_id = ${attorneyId}::UUID AND l.license_status = 'verified'
            AND pa.code = ${GENERAL_PRACTICE_CODE}
        )
        ${primaryStateFilter}
        ${primaryPracticeFilter}
        ${categoryFilter}
        ${extraFilter}
        ${text || since ? searchFilter : Prisma.empty}
      UNION
      SELECT c.id, c.created_at FROM case_states cs
      JOIN cases c ON c.id = cs.case_id
      WHERE NOT cs.is_primary
        AND cs.state_code IN (
          SELECT state_code FROM attorney_licenses
          WHERE attorney_id = ${attorneyId}::UUID AND license_status = 'verified')
        AND c.status = 'open' AND c.deleted_at IS NULL
        AND c.practice_area_id IN (
          SELECT practice_area_id FROM attorney_practice_areas
          WHERE attorney_id = ${attorneyId}::UUID
          UNION
          SELECT pa2.id
          FROM attorney_practice_areas ap
          JOIN practice_areas pa ON pa.id = ap.practice_area_id
          JOIN practice_areas pa2 ON pa2.code = ${NOT_SURE_OR_OTHER_CODE}
          WHERE ap.attorney_id = ${attorneyId}::UUID AND pa.code = ${GENERAL_PRACTICE_CODE}
        )
        ${secondaryStateFilter}
        ${secondaryPracticeFilter}
        ${categoryFilter}
        ${extraFilter}
        ${text || since ? searchFilter : Prisma.empty}
    ) v
    WHERE TRUE
      ${cursorFilter}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}`;
}

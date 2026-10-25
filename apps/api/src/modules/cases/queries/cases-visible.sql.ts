import { Prisma } from '@prisma/client';
import { ftsMatch } from '../../../common/search/fts-sql';
import type { PrismaService } from '../../../prisma/prisma.service';
import { forEachDatabase } from '../../../sharding/for-each-database';

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

/**
 * Shard-ready step 8 (feed = scatter-read): the parts of the feed rule that
 * live in the GLOBAL family (the attorney's licences and practices, practice
 * area codes) resolved first, in application code. With them the statement
 * touches the case family only and can run on every database; without
 * them (one database) the original single statement is built, byte for byte.
 */
export interface FeedGlobals {
  /** (state_code, practice_area_id) pairs the attorney may see. */
  stateTopics: Array<[string, string]>;
  /** Practice areas the attorney lists (plus «Not sure» for general). */
  topics: string[];
  /** The attorney's verified-licence state codes. */
  licensed: string[];
  /** Leaf practice areas of `practiceCategory`. */
  categoryLeaves?: string[];
  /** Practice areas named by a `practice` code (the area and its children). */
  practiceIds?: string[];
}

export interface VisibleCasesQueryInput {
  /** Pre-resolved global parts (several databases). */
  globals?: FeedGlobals;
  attorneyId: string;
  /** docs/04 §4.2 filters — narrow further, never widen. */
  practiceAreaId?: string;
  /** Owner 2026-09-30 (OQ-034): any leaf of this category code. */
  practiceCategory?: string;
  /** OQ-036: more `AND c.…` conditions (Search filters), both branches. */
  extra?: Prisma.Sql;
  /** Owner 2026-10-04: browse mode — every open case: any state, any
   * practice (view only; bidding still needs a verified licence there). */
  browseAll?: boolean;
  state?: string;
  /** Owner 2026-10-06: several states at once (with [state], any of them). */
  states?: string[];
  cursor?: FeedCursor;
  limit: number;
  /** docs/05 §7.4 search: full-text match on title + description
   * (cases.search_tsv) and a publication window. Absent = the §4.2 feed. */
  text?: string;
  /** The last word is a prefix (default); false = whole words only. */
  textPrefix?: boolean;
  /** Practices the text names in another language (practiceIdsFor). */
  textPractices?: string[];
  since?: Date;
}

/** The state codes to filter by: [state] plus [states], upper-cased. */
function stateCodes(state?: string, states?: string[]): string[] {
  return [
    ...new Set(
      [...(state ? [state] : []), ...(states ?? [])].map((s) =>
        s.toUpperCase(),
      ),
    ),
  ];
}

/** `= 'NJ'` for one state (the plan the EXPLAIN tests pin), `IN (...)` for
 * several (owner 2026-10-06). */
function inStates(column: Prisma.Sql, codes: string[]): Prisma.Sql {
  return codes.length === 1
    ? Prisma.sql`${column} = ${codes[0]}`
    : Prisma.sql`${column} IN (${Prisma.join(codes)})`;
}

/** The case's primary or any additional state is one of [codes]. */
function anyStateOf(codes: string[]): Prisma.Sql {
  return codes.length
    ? Prisma.sql`AND (${inStates(Prisma.sql`c.primary_state_code`, codes)}
        OR EXISTS (SELECT 1 FROM case_states s2
                   WHERE s2.case_id = c.id
                     AND ${inStates(Prisma.sql`s2.state_code`, codes)}))`
    : Prisma.empty;
}

/**
 * OQ-054: every query below also leaves out PAUSED cases (`paused_at IS NOT
 * NULL`: the client stayed silent past «Вам ещё нужен адвокат?»). They stay
 * `open`; attorneys who already bid keep seeing their bids elsewhere.
 *
 * docs/04_CASES_BIDS.md §4.1 / docs/02_DATABASE.md §5.4 — the attorney
 * case feed. This MUST stay the same shape as the canonical query in
 * test/db-roles-indexes.e2e-spec.ts (`visibleQuery`, docs/04 stage 4.3
 * instructions): matches on the case's primary state go through
 * `cases_open_feed_idx` (primary_state_code, practice_area_id,
 * created_at DESC) per (licensed state × practice) pair the attorney
 * holds; matches on an additional state go through `case_states
 * (state_code, case_id)`. A naive `IN (...) + EXISTS` form makes
 * PostgreSQL scan every open case and every case_states row instead
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
 * code sends to PostgreSQL.
 */
export function buildVisibleCasesSql(
  input: VisibleCasesQueryInput,
): Prisma.Sql {
  const {
    attorneyId,
    practiceAreaId,
    practiceCategory,
    state,
    states,
    cursor,
    limit,
    text,
    textPrefix,
    textPractices,
    since,
    extra,
    browseAll,
    globals,
  } = input;
  const extraFilter = extra ?? Prisma.empty;
  // Narrows (never widens) the per-branch practice match to the leaves of
  // one category.
  // Owner 2026-10-15: a case may name several topics (the first in
  // cases.practice_area_id, the rest in case_extra_practices); a filter on
  // a topic matches any of them.
  const categoryFilter =
    practiceCategory && globals
      ? Prisma.sql`AND (c.practice_area_id = ANY(${globals.categoryLeaves ?? []}::UUID[])
      OR EXISTS (
        SELECT 1 FROM case_extra_practices x
        WHERE x.case_id = c.id
          AND x.practice_area_id = ANY(${globals.categoryLeaves ?? []}::UUID[])))`
      : practiceCategory
        ? Prisma.sql`AND (c.practice_area_id IN (
        SELECT leaf.id FROM practice_areas leaf
        JOIN practice_areas cat ON cat.id = leaf.parent_id
        WHERE cat.code = ${practiceCategory})
      OR EXISTS (
        SELECT 1 FROM case_extra_practices x
        JOIN practice_areas leaf ON leaf.id = x.practice_area_id
        JOIN practice_areas cat ON cat.id = leaf.parent_id
        WHERE x.case_id = c.id AND cat.code = ${practiceCategory}))`
        : Prisma.empty;
  const searchFilter = Prisma.sql`${
    text
      ? Prisma.sql`AND ${ftsMatch('c', text, textPrefix ?? true, textPractices)}`
      : Prisma.empty
  } ${since ? Prisma.sql`AND c.created_at >= ${since}` : Prisma.empty}`;

  const codes = stateCodes(state, states);
  const primaryStateFilter = codes.length
    ? Prisma.sql`AND ${inStates(Prisma.sql`c.primary_state_code`, codes)}`
    : Prisma.empty;
  const primaryPracticeFilter = practiceAreaId
    ? Prisma.sql`AND (c.practice_area_id = ${practiceAreaId}::UUID
        OR EXISTS (SELECT 1 FROM case_extra_practices x
          WHERE x.case_id = c.id AND x.practice_area_id = ${practiceAreaId}::UUID))`
    : Prisma.empty;
  const secondaryStateFilter = codes.length
    ? Prisma.sql`AND ${inStates(Prisma.sql`cs.state_code`, codes)}`
    : Prisma.empty;
  const secondaryPracticeFilter = practiceAreaId
    ? Prisma.sql`AND (c.practice_area_id = ${practiceAreaId}::UUID
        OR EXISTS (SELECT 1 FROM case_extra_practices x
          WHERE x.case_id = c.id AND x.practice_area_id = ${practiceAreaId}::UUID))`
    : Prisma.empty;
  // (state, topic) pairs and topics this attorney is licensed / listed for
  // (a general-practice attorney also sees «Not sure / Other»).
  const stateTopics = globals
    ? Prisma.sql`
          SELECT t.s, t.p::UUID FROM unnest(${globals.stateTopics.map((x) => x[0])}::TEXT[],
                                            ${globals.stateTopics.map((x) => x[1])}::TEXT[]) AS t(s, p)`
    : Prisma.sql`
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
            AND pa.code = ${GENERAL_PRACTICE_CODE}`;
  const attorneyTopics = globals
    ? Prisma.sql`SELECT unnest(${globals.topics}::TEXT[])::UUID`
    : Prisma.sql`
          SELECT practice_area_id FROM attorney_practice_areas
          WHERE attorney_id = ${attorneyId}::UUID
          UNION
          SELECT pa2.id
          FROM attorney_practice_areas ap
          JOIN practice_areas pa ON pa.id = ap.practice_area_id
          JOIN practice_areas pa2 ON pa2.code = ${NOT_SURE_OR_OTHER_CODE}
          WHERE ap.attorney_id = ${attorneyId}::UUID AND pa.code = ${GENERAL_PRACTICE_CODE}`;
  const cursorFilter = cursor
    ? Prisma.sql`AND (created_at < ${cursor.createdAt}
        OR (created_at = ${cursor.createdAt} AND id < ${cursor.id}::UUID))`
    : Prisma.empty;

  if (browseAll) {
    const anyState = anyStateOf(codes);
    return Prisma.sql`
      SELECT c.id, c.created_at FROM cases c
      WHERE c.status = 'open' AND c.deleted_at IS NULL AND c.paused_at IS NULL
        ${anyState}
        ${primaryPracticeFilter}
        ${categoryFilter}
        ${extraFilter}
        ${text || since ? searchFilter : Prisma.empty}
        ${cursor ? Prisma.sql`AND (c.created_at < ${cursor.createdAt} OR (c.created_at = ${cursor.createdAt} AND c.id < ${cursor.id}::UUID))` : Prisma.empty}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ${limit}`;
  }

  return Prisma.sql`
    SELECT id, created_at FROM (
      SELECT c.id, c.created_at FROM cases c
      WHERE c.status = 'open' AND c.deleted_at IS NULL AND c.paused_at IS NULL
        AND ((c.primary_state_code, c.practice_area_id) IN (${stateTopics})
          OR EXISTS (
            SELECT 1 FROM case_extra_practices x
            WHERE x.case_id = c.id
              AND (c.primary_state_code, x.practice_area_id) IN (${stateTopics})))
        ${primaryStateFilter}
        ${primaryPracticeFilter}
        ${categoryFilter}
        ${extraFilter}
        ${text || since ? searchFilter : Prisma.empty}
      UNION
      SELECT c.id, c.created_at FROM case_states cs
      JOIN cases c ON c.id = cs.case_id
      WHERE NOT cs.is_primary
        AND cs.state_code IN (${
          globals
            ? Prisma.sql`SELECT unnest(${globals.licensed}::TEXT[])`
            : Prisma.sql`SELECT state_code FROM attorney_licenses
          WHERE attorney_id = ${attorneyId}::UUID AND license_status = 'verified'`
        })
        AND c.status = 'open' AND c.deleted_at IS NULL AND c.paused_at IS NULL
        AND (c.practice_area_id IN (${attorneyTopics})
          OR EXISTS (
            SELECT 1 FROM case_extra_practices x
            WHERE x.case_id = c.id AND x.practice_area_id IN (${attorneyTopics})))
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

export interface PracticeCasesQueryInput {
  /** Pre-resolved global parts (several databases). */
  globals?: FeedGlobals;
  attorneyId: string;
  /** A practice category or subcategory code; a category includes its
   * subcategories. */
  practice: string;
  state?: string;
  /** Owner 2026-10-06: several states at once (with [state], any of them). */
  states?: string[];
  cursor?: FeedCursor;
  limit: number;
  /** Audit 2026-10-01: search uses the same rule (text, period, extras). */
  text?: string;
  textPrefix?: boolean;
  /** Practices the text names in another language (practiceIdsFor). */
  textPractices?: string[];
  since?: Date;
  extra?: Prisma.Sql;
  browseAll?: boolean;
}

/**
 * Owner 2026-09-30: a qualification chosen in the attorney's topic filter
 * shows every open case of it in the attorney's verified-license states,
 * not only cases of their own practices (they may bid; the client is told
 * the qualification is outside the attorney's practices). "All" keeps the
 * §5.4 query above.
 */
export function buildPracticeCasesSql(
  input: PracticeCasesQueryInput,
): Prisma.Sql {
  const {
    attorneyId,
    practice,
    state,
    states,
    cursor,
    limit,
    text,
    textPrefix,
    textPractices,
    since,
    extra,
    browseAll,
    globals,
  } = input;
  const searchFilter = Prisma.sql`${
    text
      ? Prisma.sql`AND ${ftsMatch('c', text, textPrefix ?? true, textPractices)}`
      : Prisma.empty
  } ${since ? Prisma.sql`AND c.created_at >= ${since}` : Prisma.empty} ${
    extra ?? Prisma.empty
  }`;
  const stateFilter = anyStateOf(stateCodes(state, states));
  const cursorFilter = cursor
    ? Prisma.sql`AND (c.created_at < ${cursor.createdAt}
        OR (c.created_at = ${cursor.createdAt} AND c.id < ${cursor.id}::UUID))`
    : Prisma.empty;
  return Prisma.sql`
    SELECT c.id, c.created_at FROM cases c
    WHERE c.status = 'open' AND c.deleted_at IS NULL AND c.paused_at IS NULL
      ${
        globals
          ? Prisma.sql`AND c.practice_area_id = ANY(${globals.practiceIds ?? []}::UUID[])`
          : Prisma.sql`AND c.practice_area_id IN (
        SELECT pa.id FROM practice_areas pa
        WHERE pa.code = ${practice} OR pa.code LIKE ${`${practice}.%`})`
      }
      ${
        browseAll
          ? Prisma.empty
          : globals
            ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM case_states cs
        WHERE cs.case_id = c.id AND cs.state_code = ANY(${globals.licensed}::TEXT[]))`
            : Prisma.sql`AND EXISTS (
        SELECT 1 FROM case_states cs
        JOIN attorney_licenses l ON l.state_code = cs.state_code
        WHERE cs.case_id = c.id AND l.attorney_id = ${attorneyId}::UUID
          AND l.license_status = 'verified')`
      }
      ${stateFilter}
      ${searchFilter}
      ${cursorFilter}
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ${limit}`;
}

/**
 * Shard-ready step 8, FEED DECISION (scatter-read, not fan-out-on-write).
 *
 * The attorney case feed is "open cases matching my licences and topics,
 * newest first". Fan-out-on-write (a feed table per attorney, written when a
 * case is posted) is the answer when each reader follows a few authors and
 * the posting side is cheap (Instagram, Figma comments); here every case is
 * visible to every matching attorney (thousands to hundreds of thousands
 * of readers per case) and a case changes state (paused, closed, bid) often,
 * so a fan-out would write and then repair a huge number of rows. A scatter
 * read does `databases x one indexed query` and a k-way merge of the already
 * sorted pages (Notion and Figma both read across shards for lists and
 * search and keep write paths single-shard). The two cheap global lookups
 * (licences, topics) are done first, in application code.
 *
 * Revisit fan-out for the CLIENT home feed (many authors, follow graph) when
 * the post feed needs it; the case feed stays scatter-read.
 */
export async function resolveFeedGlobals(
  prisma: PrismaService,
  attorneyId: string,
  opts: { practiceCategory?: string; practice?: string },
): Promise<FeedGlobals> {
  const [licences, areas, notSure] = await Promise.all([
    prisma.attorneyLicense.findMany({
      where: { attorney_id: attorneyId, license_status: 'verified' },
      select: { state_code: true },
    }),
    prisma.attorneyPracticeArea.findMany({
      where: { attorney_id: attorneyId },
      select: {
        practice_area_id: true,
        practice_area: { select: { code: true } },
      },
    }),
    prisma.practiceArea.findFirst({
      where: { code: NOT_SURE_OR_OTHER_CODE },
      select: { id: true },
    }),
  ]);
  const licensed = [...new Set(licences.map((l) => l.state_code))];
  const topics = new Set(areas.map((a) => a.practice_area_id));
  if (
    notSure &&
    areas.some((a) => a.practice_area?.code === GENERAL_PRACTICE_CODE)
  ) {
    topics.add(notSure.id);
  }
  const stateTopics: Array<[string, string]> = [];
  for (const state of licensed) {
    for (const topic of topics) stateTopics.push([state, topic]);
  }
  const globals: FeedGlobals = {
    stateTopics,
    topics: [...topics],
    licensed,
  };
  if (opts.practiceCategory) {
    const leaves = await prisma.practiceArea.findMany({
      where: { parent: { code: opts.practiceCategory } },
      select: { id: true },
    });
    globals.categoryLeaves = leaves.map((l) => l.id);
  }
  if (opts.practice) {
    const found = await prisma.practiceArea.findMany({
      where: {
        OR: [
          { code: opts.practice },
          { code: { startsWith: `${opts.practice}.` } },
        ],
      },
      select: { id: true },
    });
    globals.practiceIds = found.map((f) => f.id);
  }
  return globals;
}

/** People the viewer blocked or who blocked the viewer (user family, both
 * directions; the second direction is spread over the databases). */
export async function blockedPeople(
  prisma: PrismaService,
  userId: string,
): Promise<string[]> {
  const [mine, theirs] = await Promise.all([
    prisma.userBlock.findMany({
      where: { blocker_id: userId },
      select: { blocked_id: true },
    }),
    prisma.userBlock.findMany({
      where: { blocked_id: userId },
      select: { blocker_id: true },
    }),
  ]);
  return [
    ...new Set([
      ...mine.map((b) => b.blocked_id),
      ...theirs.map((b) => b.blocker_id),
    ]),
  ];
}

export interface FeedRow {
  id: string;
  created_at: Date;
}

/**
 * Runs the case-only feed statement on every database and merges the
 * (created_at DESC, id DESC) pages: each page is sorted, so the top `limit`
 * of the union is exactly the top `limit` of the whole.
 */
export async function scatterFeed(
  prisma: PrismaService,
  sql: Prisma.Sql,
  limit: number,
  /** Search: statement timeout / trigram threshold, set per database in the
   * same transaction as the query (SET LOCAL semantics). */
  budget?: { ms: number; trigram: string },
): Promise<FeedRow[]> {
  const parts = await forEachDatabase(prisma, async () => {
    if (!budget) return prisma.$queryRaw<FeedRow[]>(sql);
    const [, , rows] = await prisma.$transaction([
      prisma.$executeRaw`SELECT set_config('statement_timeout', ${String(Math.floor(budget.ms))}, true)`,
      prisma.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${budget.trigram}, true)`,
      prisma.$queryRaw<FeedRow[]>(sql),
    ]);
    return rows;
  });
  if (parts.length === 1) return parts[0];
  return parts
    .flat()
    .sort((a, b) => {
      const t = b.created_at.getTime() - a.created_at.getTime();
      if (t !== 0) return t;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    })
    .slice(0, limit);
}

import { Injectable, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  HIDDEN_TAG_PREFIX,
  legacyTopicTags,
  postPracticeSql,
} from '../posts/hidden-tags';
import { attorneysWithEntitlementSql } from '../plans/entitlements.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ftsMatch,
  DEFAULT_TEXT_WEIGHTS,
  ftsRank,
  TYPO_THRESHOLD,
  typoMatch,
} from '../../common/search/fts-sql';
import { parseSearchQuery } from '../../common/search/search-query';
import { escapeLike, nameMatchSql } from '../../common/search/name-match.sql';
import { SearchSynonymsService } from './search-synonyms.service';
import { urgencyFilterSql } from '../cases/domain/case-urgency';
import { budgetFilterSql } from '../cases/cases.public';
import {
  buildPracticeCasesSql,
  buildVisibleCasesSql,
} from '../cases/queries/cases-visible.sql';
import type {
  AttorneySearchFilters,
  PostSearchFilters,
  CaseSearchParams,
  PersonRole,
  PersonTier,
  SearchProvider,
} from './search.provider';

/** Candidates per match branch: keeps a broad query ("new york") bounded
 * before ranking; an external engine lifts this later (§7.6). */
const BRANCH_CAP = 1000;
/** Posts: rank among the newest matches only. */
const POST_CANDIDATES = 1000;
/** Cases: rank among the newest visible matches only. */
const CASE_CANDIDATES = 1500;
/** A candidate query gets this much database time (ms). */
const SEARCH_BUDGET_MS = 700;
/** Fewer whole-word matches than this: try the prefix too. */
const MIN_EXACT = 3;

/** LIKE pattern text with %, _ and \ taken literally. */
/**
 * Owner 2026-10-15: SQL condition "every word of [norm] starts a word of the
 * translated practice name or of its keywords" (accents and commas
 * ignored) — "штраф гибдд", "visa", "ажырашуу" all work.
 */
function practiceWordsMatch(norm: string): Prisma.Sql {
  const words = norm.split(/\s+/).filter((w) => w.length > 0);
  const conds = words.map(
    (w) =>
      Prisma.sql`public.f_unaccent(' ' || replace(lower(t.value), ',', ' ')) LIKE ${`% ${escapeLike(w)}%`}`,
  );
  return conds.length ? Prisma.join(conds, ' AND ') : Prisma.sql`FALSE`;
}

/**
 * Audit 2026-10-18: SQL condition "the case is in the state/city [norm]
 * names": a state code (2 letters), a state name or a city word starting
 * with the query. Cases only (alias `c`).
 */
export function casePlaceMatch(norm: string): Prisma.Sql {
  if (norm.length < 2) return Prisma.sql`FALSE`;
  const like = `${escapeLike(norm)}%`;
  return Prisma.sql`(
    ${norm.length === 2 ? Prisma.sql`c.primary_state_code = ${norm.toUpperCase()} OR` : Prisma.empty}
    EXISTS (SELECT 1 FROM states s WHERE s.code = c.primary_state_code
               AND lower(s.name) LIKE ${like})
    OR lower(c.city) LIKE ${like}
    OR lower(c.city) LIKE ${`% ${escapeLike(norm)}%`})`;
}

/**
 * docs/05 §7.6 PostgresSearchProvider on the docs/02 §5.3 indexes:
 * trigram GIN on attorney_profiles.username_lower and
 * users.full_name_lower (partial, IS NOT NULL), tsvector GIN on
 * posts/cases.search_tsv, btree tags_tag_lower_key for tag prefixes.
 */
@Injectable()
export class PostgresSearchProvider implements SearchProvider {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: AppSettingsService,
    // Owner 2026-10-15: everyday words and phrases → topics.
    @Optional() private readonly synonyms?: SearchSynonymsService,
  ) {}

  /** Owner 2026-10-18 (speed): practice area id → its name in every
   * language, lower-cased, kept in memory for 10 minutes. The "practice by
   * its name in ANY language" branch of People search used to join all
   * i18n translations on every query (~16 ms); now it is a JS substring
   * test and the SQL only reads the matching areas' attorneys. Off under
   * jest, where specs import translations and search straight away. */
  private practiceNames: { at: number; byArea: Map<string, string[]> } | null =
    null;

  private async practiceAreaNames(): Promise<Map<string, string[]>> {
    const cached = this.practiceNames;
    if (
      process.env.NODE_ENV !== 'test' &&
      cached &&
      Date.now() - cached.at < 10 * 60_000
    ) {
      return cached.byArea;
    }
    const rows = await this.prisma.$queryRaw<{ id: string; v: string }[]>`
      SELECT pa.id::TEXT AS id, lower(tr.value) AS v
      FROM practice_areas pa
      JOIN i18n_keys k ON k.key = pa.i18n_key
      JOIN i18n_translations tr ON tr.key_id = k.id`;
    const byArea = new Map<string, string[]>();
    for (const r of rows) {
      const list = byArea.get(r.id);
      if (list) list.push(r.v);
      else byArea.set(r.id, [r.v]);
    }
    this.practiceNames = { at: Date.now(), byArea };
    return byArea;
  }

  /** The admin's ranking weights (defaults when unset). */
  private async weights() {
    const s = this.settings;
    if (!s) {
      return {
        text: DEFAULT_TEXT_WEIGHTS,
        priority: 1000,
        verified: 100,
        rating: 10,
      };
    }
    return {
      text: {
        title: await s.number('search.weight_title'),
        text: await s.number('search.weight_text'),
      },
      priority: await s.number('search.weight_priority'),
      verified: await s.number('search.weight_verified'),
      rating: await s.number('search.weight_rating'),
    };
  }

  async searchAttorneys(
    q: string,
    f: AttorneySearchFilters,
    max: number,
  ): Promise<string[]> {
    const rows = await this.people(q, f, max, false);
    return rows.map((r) => r.id);
  }

  searchPeople(
    q: string,
    f: AttorneySearchFilters,
    max: number,
  ): Promise<{ id: string; role: PersonRole; tier: PersonTier }[]> {
    // Attorney-only filters leave clients out; state also fits clients.
    const attorneyOnly =
      f.practiceAreaId !== undefined ||
      f.minRating !== undefined ||
      f.language !== undefined ||
      f.role === 'attorney';
    return this.people(q, f, max, !attorneyOnly);
  }

  /**
   * Attorneys (docs/05 §7.3 branches: @username, name, practice name,
   * state) and — OQ-026, when [withClients] — clients (@username, name),
   * ranked together: exact handle, handle prefix, trigram similarity,
   * attorneys before clients, verified first, rating.
   */
  private async people(
    q: string,
    f: AttorneySearchFilters,
    max: number,
    withClients: boolean,
  ): Promise<{ id: string; role: PersonRole; tier: PersonTier }[]> {
    const w = await this.weights();
    const prefix = `${escapeLike(q)}%`;
    const contains = `%${escapeLike(q)}%`;
    const byName = nameMatchSql(q);
    // Owner 2026-10-15: "развод" / "муж бьёт" → attorneys of that topic.
    const synPractices = (await this.synonyms?.resolve(q))?.practiceIds ?? [];
    const bySynonym = synPractices.length
      ? Prisma.sql`UNION
        (SELECT ap.attorney_id FROM attorney_practice_areas ap
          WHERE ap.practice_area_id = ANY(${synPractices}::UUID[])
          LIMIT ${BRANCH_CAP})`
      : Prisma.empty;
    // Owner 2026-10-13: a practice by its name in ANY language ("развод",
    // "तलाक"): the translations of its i18n key (matched in memory).
    const needle = q;
    const namedPractices: string[] = [];
    for (const [id, names] of await this.practiceAreaNames()) {
      if (names.some((n) => n.includes(needle))) namedPractices.push(id);
    }
    const byTranslation = namedPractices.length
      ? Prisma.sql`UNION
        (SELECT ap.attorney_id FROM attorney_practice_areas ap
          WHERE ap.practice_area_id = ANY(${namedPractices}::UUID[])
          LIMIT ${BRANCH_CAP})`
      : Prisma.empty;
    const filters = Prisma.sql`
      ${
        f.practiceAreaId
          ? // Audit 2026-10-01: a category also matches its subcategories.
            Prisma.sql`AND EXISTS (SELECT 1 FROM attorney_practice_areas x
              JOIN practice_areas xp ON xp.id = x.practice_area_id
              WHERE x.attorney_id = a.user_id
                AND (x.practice_area_id = ${f.practiceAreaId}::UUID
                     OR xp.parent_id = ${f.practiceAreaId}::UUID))`
          : Prisma.empty
      }
      ${
        f.state
          ? Prisma.sql`AND EXISTS (SELECT 1 FROM attorney_licenses x
              WHERE x.attorney_id = a.user_id AND x.state_code = ${f.state}
                AND x.license_status = 'verified')`
          : Prisma.empty
      }
      ${f.minRating !== undefined ? Prisma.sql`AND a.rating_avg >= ${f.minRating}` : Prisma.empty}
      ${f.language ? Prisma.sql`AND a.languages @> ARRAY[${f.language}]::TEXT[]` : Prisma.empty}
      ${f.verifiedOnly ? Prisma.sql`AND a.verification_status = 'verified'` : Prisma.empty}
      ${f.role === 'client' ? Prisma.sql`AND FALSE` : Prisma.empty}`;
    // Clients: state of residence; the check mark = verified phone (OQ-029).
    const clientFilters = Prisma.sql`
      ${f.state ? Prisma.sql`AND c.state_code = ${f.state}` : Prisma.empty}
      ${f.verifiedOnly ? Prisma.sql`AND u.phone_verified_at IS NOT NULL` : Prisma.empty}`;
    const clients = withClients
      ? Prisma.sql`
        UNION ALL
        SELECT u.id, 'client' AS role, c.username_lower AS uname,
               u.full_name_lower AS fname, FALSE AS verified,
               0::DECIMAL AS rating, FALSE AS priority
        FROM (
          (SELECT user_id FROM client_profiles
            WHERE username_lower IS NOT NULL
              AND (username_lower LIKE ${prefix} OR username_lower % ${q})
            LIMIT ${BRANCH_CAP})
          UNION
          (SELECT id AS user_id FROM users
            WHERE full_name_lower IS NOT NULL AND role = 'client'
              AND (full_name_lower % ${q} OR full_name_lower LIKE ${contains})
            LIMIT ${BRANCH_CAP})
          UNION
          (SELECT id AS user_id FROM users
            WHERE full_name_lower IS NOT NULL AND role = 'client' AND ${byName}
            LIMIT ${BRANCH_CAP})
        ) cc
        JOIN users u ON u.id = cc.user_id AND u.role = 'client'
          AND u.status = 'active' AND u.deleted_at IS NULL
        JOIN client_profiles c ON c.user_id = u.id
          AND c.username_lower IS NOT NULL
        WHERE TRUE ${clientFilters}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      { id: string; role: PersonRole; tier: number }[]
    >`
      WITH cand AS (
        (SELECT user_id AS id FROM attorney_profiles
          WHERE username_lower IS NOT NULL
            AND (username_lower LIKE ${prefix} OR username_lower % ${q})
          LIMIT ${BRANCH_CAP})
        UNION
        (SELECT id FROM users
          WHERE full_name_lower IS NOT NULL AND role = 'attorney'
            AND (full_name_lower % ${q} OR full_name_lower LIKE ${contains})
          LIMIT ${BRANCH_CAP})
        UNION
        (SELECT id FROM users
          WHERE full_name_lower IS NOT NULL AND role = 'attorney' AND ${byName}
          LIMIT ${BRANCH_CAP})
        UNION
        (SELECT ap.attorney_id FROM practice_areas pa
          JOIN attorney_practice_areas ap ON ap.practice_area_id = pa.id
          WHERE lower(pa.name_en) LIKE ${contains}
          LIMIT ${BRANCH_CAP})
        ${byTranslation}
        UNION
        (SELECT l.attorney_id FROM states s
          JOIN attorney_licenses l ON l.state_code = s.code
            AND l.license_status = 'verified'
          WHERE lower(s.name) LIKE ${prefix} OR lower(s.code) = ${q}
          LIMIT ${BRANCH_CAP})
        ${bySynonym}
      ),
      people AS (
        SELECT u.id, 'attorney' AS role, a.username_lower AS uname,
               u.full_name_lower AS fname,
               (a.verification_status = 'verified') AS verified,
               a.rating_avg AS rating,
               -- Owner 2026-10-05 (plan builder): "higher in search".
               ${attorneysWithEntitlementSql('priority_search', Prisma.sql`u.id`)} AS priority
        FROM cand
        JOIN users u ON u.id = cand.id AND u.role = 'attorney'
          AND u.status = 'active' AND u.deleted_at IS NULL
        JOIN attorney_profiles a ON a.user_id = u.id
          AND a.verification_status <> 'suspended'
        WHERE TRUE ${filters}
        ${clients}
      )
      SELECT id::TEXT AS id, role,
             (CASE WHEN uname = ${q} THEN 0
                   WHEN uname LIKE ${prefix} THEN 1 ELSE 2 END)::INT AS tier
      FROM people
      ORDER BY
        (uname = ${q}) DESC,
        (uname LIKE ${prefix}) DESC,
        GREATEST(similarity(uname, ${q}),
                 similarity(COALESCE(fname, ''), ${q}),
                 word_similarity(public.f_name_skel(${q}),
                                 public.f_name_skel(COALESCE(fname, '')))) DESC,
        (role = 'attorney') DESC,
        (priority::INT * ${w.priority}::FLOAT8 + verified::INT * ${w.verified}::FLOAT8
          + rating::FLOAT8 * ${w.rating}::FLOAT8) DESC,
        id
      LIMIT ${max}`;
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      tier: r.tier as PersonTier,
    }));
  }

  searchCases(
    q: string,
    p: CaseSearchParams,
  ): Promise<{ id: string; created_at: Date }[]> {
    // Looked up by the caller (searchCasesRanked): this stays a lazy Prisma
    // query, which the time budget runs inside a transaction.
    const textPractices = p.textPractices ?? [];
    const extra = Prisma.sql`
          ${budgetFilterSql({
            minCents: p.budgetMinCents,
            maxCents: p.budgetMaxCents,
            unknown: p.budgetUnknown,
            percent: p.budgetPercent,
            percentMax: p.percentMax,
          })}
          ${p.noBids ? Prisma.sql`AND c.bids_count = 0` : Prisma.empty}
          ${urgencyFilterSql(p.minUrgency, p.hasDeadline, p.urgencyThresholds)}
          ${p.extraSql ?? Prisma.empty}`;
    // Audit 2026-10-01: a qualification in search works like the feed's
    // topic — any qualification (category → its subcategories) in the
    // attorney's licensed states, not only their own practices.
    if (p.practiceCategory) {
      return this.prisma.$queryRaw<{ id: string; created_at: Date }[]>(
        buildPracticeCasesSql({
          attorneyId: p.attorneyId,
          practice: p.practiceCategory,
          state: p.state,
          cursor: p.cursor,
          limit: p.limit + 1,
          text: q,
          textPrefix: !p.textExact,
          textPractices,
          since: p.since,
          extra,
        }),
      );
    }
    return this.prisma.$queryRaw<{ id: string; created_at: Date }[]>(
      buildVisibleCasesSql({
        attorneyId: p.attorneyId,
        practiceAreaId: p.practiceAreaId,
        state: p.state,
        cursor: p.cursor,
        limit: p.limit + 1,
        text: q,
        textPrefix: !p.textExact,
        textPractices,
        since: p.since,
        extra,
      }),
    );
  }

  async searchPosts(
    q: string,
    max: number,
    f: PostSearchFilters = {},
  ): Promise<string[]> {
    const w = await this.weights();
    const where = Prisma.sql`
      ${
        // Audit 2026-10-01: a qualification matches posts of it (and its
        // subcategories) — older posts without one by the topic hashtag.
        f.practice
          ? Prisma.sql`AND ${postPracticeSql(f.practice, [
              ...(f.tag ? [f.tag] : []),
              ...legacyTopicTags(f.practice),
            ])}`
          : f.tag
            ? Prisma.sql`AND EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.tag_lower = ${f.tag})`
            : Prisma.empty
      }
      ${f.state ? Prisma.sql`AND EXISTS (SELECT 1 FROM attorney_licenses l WHERE l.attorney_id = p.author_id AND l.state_code = ${f.state} AND l.license_status = 'verified')` : Prisma.empty}
      ${f.since ? Prisma.sql`AND p.created_at >= ${f.since}` : Prisma.empty}
      ${f.briefsOnly ? Prisma.sql`AND p.kind = 'post' AND p.video_asset_id IS NULL AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id) AND NOT EXISTS (SELECT 1 FROM post_attachments pa WHERE pa.post_id = p.id)` : Prisma.empty}
      ${f.withPhotos ? Prisma.sql`AND EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id)` : Prisma.empty}
      ${f.contentClass ? Prisma.sql`AND p.content_class = ${f.contentClass}` : Prisma.empty}`;
    const order =
      f.sort === 'newest'
        ? Prisma.sql`m.created_at DESC, m.id DESC`
        : f.sort === 'popular'
          ? Prisma.sql`p.like_count + p.comment_count DESC, m.created_at DESC, m.id DESC`
          : Prisma.sql`${ftsRank('m', q, w.text)} DESC, m.created_at DESC, m.id DESC`;
    const run = (match: Prisma.Sql) => this.prisma.$queryRaw<{ id: string }[]>`
      WITH m AS (
        SELECT p.id, p.created_at, p.search_tsv, p.search_tsv_simple FROM posts p
        WHERE ${match}
          AND p.status = 'published' AND p.deleted_at IS NULL
          ${where}
        ORDER BY p.created_at DESC
        LIMIT ${POST_CANDIDATES}
      )
      SELECT m.id::TEXT AS id FROM m
      JOIN posts p ON p.id = m.id
      JOIN users u ON u.id = p.author_id AND u.status = 'active'
        -- OQ-038: clients post too; suspended attorneys never show.
        AND NOT EXISTS (SELECT 1 FROM attorney_profiles sa
          WHERE sa.user_id = p.author_id AND sa.verification_status = 'suspended')
      ORDER BY ${order}
      LIMIT ${max}`;
    // Whole words first (the planner estimates them well), then the last
    // word as a prefix ("immigr"), then typos; each within a time budget.
    const practiceIds = await this.practiceIdsFor(q);
    const exact = await this.budget(SEARCH_BUDGET_MS, () =>
      run(ftsMatch('p', q, false, practiceIds)),
    );
    const parsed = parseSearchQuery(q);
    if (exact.length >= MIN_EXACT || !parsed.plain) {
      return exact.map((r) => r.id);
    }
    const prefix = await this.budget(SEARCH_BUDGET_MS, () =>
      run(ftsMatch('p', q, true, practiceIds)),
    );
    const merged = [...new Map([...exact, ...prefix].map((r) => [r.id, r]))];
    if (merged.length > 0) return merged.map(([id]) => id);
    // Owner 2026-10-15: nothing matched, maybe a typo ("gren card"): the
    // trigram index on the titles finds the close ones.
    const typo = await this.budget(
      SEARCH_BUDGET_MS,
      () => run(typoMatch('p.title', q)),
      true,
    );
    return typo.map((r) => r.id);
  }

  /**
   * Owner 2026-10-15: the topic picker's search on any language — "развод",
   * "divorce" and "ажырашуу" all find Divorce. [hit] is the word that
   * matched when it is not the English name, so the picker can say why.
   */
  async practiceMatches(
    q: string,
    limit: number,
  ): Promise<{ code: string; nameEn: string; hit: string | null }[]> {
    const norm = parseSearchQuery(q).plain.toLowerCase();
    if (norm.length < 2) return [];
    const rows = await this.prisma.$queryRaw<
      { code: string; name_en: string; value: string; lang: string }[]
    >`
      SELECT code, name_en, value, lang FROM (
        SELECT DISTINCT ON (pa.id) pa.code, pa.name_en, t.value, t.lang,
               (k.key = pa.i18n_key) AS by_name, pa.sort
        FROM practice_areas pa
        JOIN i18n_keys k ON k.key IN (pa.i18n_key, pa.i18n_key || '.kw')
        JOIN i18n_translations t ON t.key_id = k.id
        WHERE pa.is_active AND (${practiceWordsMatch(norm)})
        ORDER BY pa.id, (k.key = pa.i18n_key) DESC, (t.lang = 'en') DESC
      ) m
      -- Owner 2026-10-15: a match on the topic's NAME comes before one on
      -- its keywords ("got" lists topics named so before "got arrested").
      ORDER BY by_name DESC, sort
      LIMIT ${limit}`;
    return rows.map((r) => ({
      code: r.code,
      nameEn: r.name_en,
      hit:
        r.lang === 'en'
          ? null
          : (r.value
              .split(/[\s,/-]+/)
              .find((w) => w.toLowerCase().startsWith(norm)) ?? r.value),
    }));
  }

  private readonly practiceCache = new Map<
    string,
    { at: number; ids: string[] }
  >();

  /**
   * Owner 2026-10-15 (cross-language search, no translation): the practices
   * whose name in ANY of the 85 languages is, or has a word starting with,
   * the query — "divorce", "развод" and "ажырашуу" all name Family law, so a
   * Russian case filed under it is found by an English query. The query
   * needs ≥3 letters; the result is cached for ten minutes.
   */
  async practiceIdsFor(q: string): Promise<string[]> {
    const names = await this.practiceIdsByName(q);
    // The dictionary is live (admin edits, learned clicks), so it is
    // merged outside the ten-minute name cache.
    const syn = await this.synonyms?.resolve(q);
    return syn?.practiceIds.length
      ? [...new Set([...names, ...syn.practiceIds])]
      : names;
  }

  private async practiceIdsByName(q: string): Promise<string[]> {
    const norm = parseSearchQuery(q).plain.toLowerCase();
    if (norm.length < 3) return [];
    const hit = this.practiceCache.get(norm);
    if (hit && Date.now() - hit.at < 600_000) return hit.ids;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH hits AS (
        SELECT DISTINCT pa.id, pa.parent_id
        FROM practice_areas pa
        JOIN i18n_keys k ON k.key IN (pa.i18n_key, pa.i18n_key || '.kw')
        JOIN i18n_translations t ON t.key_id = k.id
        WHERE pa.is_active AND (${practiceWordsMatch(norm)})
        LIMIT 12
      )
      SELECT id::TEXT AS id FROM hits
      UNION
      SELECT c.id::TEXT FROM practice_areas c
        JOIN hits h ON c.parent_id = h.id`;
    const ids = rows.map((r) => r.id);
    this.practiceCache.set(norm, { at: Date.now(), ids });
    if (this.practiceCache.size > 2000) this.practiceCache.clear();
    return ids;
  }

  /**
   * Runs one candidate query inside a time budget: a word the planner
   * misjudges (a prefix nobody has) could otherwise walk millions of rows.
   * Running out of time means "nothing found here"; other errors surface.
   * [loose] also lowers the trigram threshold for typos.
   */
  private async budget<T>(
    ms: number,
    query: () => Promise<T[]>,
    loose = false,
  ): Promise<T[]> {
    try {
      const [, , result] = await this.prisma.$transaction([
        this.prisma
          .$executeRaw`SELECT set_config('statement_timeout', ${String(Math.floor(ms))}, true)`,
        this.prisma
          .$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${loose ? TYPO_THRESHOLD : '0.6'}, true)`,
        query() as unknown as Prisma.PrismaPromise<T[]>,
      ]);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/statement timeout|57014/.test(msg)) return [];
      throw e;
    }
  }

  /**
   * Owner 2026-10-15: cases for a text query ranked by relevance (title
   * word > text word), among the newest [CASE_CANDIDATES] visible matches,
   * so a broad word stays fast; a typo falls back to the trigram index.
   * Same visibility and filters as [searchCases].
   */
  async searchCasesRanked(
    q: string,
    p: Omit<CaseSearchParams, 'cursor' | 'limit'>,
    max: number,
  ): Promise<string[]> {
    const w = await this.weights();
    const textPractices = await this.practiceIdsFor(q);
    p = { ...p, textPractices };
    const exact = await this.budget(SEARCH_BUDGET_MS, () =>
      this.searchCases(q, { ...p, textExact: true, limit: CASE_CANDIDATES }),
    );
    const parsed = parseSearchQuery(q);
    if (!parsed.plain) return [];
    let rows = exact;
    if (exact.length < MIN_EXACT) {
      const more = await this.budget(SEARCH_BUDGET_MS, () =>
        this.searchCases(q, { ...p, limit: CASE_CANDIDATES }),
      );
      rows = [...new Map([...exact, ...more].map((r) => [r.id, r])).values()];
    }
    // Audit 2026-10-18: "new york", "NY" or "brooklyn" name WHERE a case is,
    // which is not in its title/description: the whole query as a state
    // code/name or a city word also finds the cases there.
    const place = await this.budget(SEARCH_BUDGET_MS, () =>
      this.searchCases('', {
        ...p,
        limit: CASE_CANDIDATES,
        extraSql: Prisma.sql`${p.extraSql ?? Prisma.empty} AND ${casePlaceMatch(parsed.plain)}`,
      }),
    );
    rows = [...new Map([...rows, ...place].map((r) => [r.id, r])).values()];
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      const ranked = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT c.id::TEXT AS id FROM cases c
        WHERE c.id = ANY(${ids}::UUID[])
        ORDER BY ${ftsRank('c', q, w.text)} DESC, c.created_at DESC, c.id DESC
        LIMIT ${max}`;
      return ranked.map((r) => r.id);
    }
    const typo = await this.budget(
      SEARCH_BUDGET_MS,
      () =>
        this.searchCases('', {
          ...p,
          limit: max,
          extraSql: Prisma.sql`AND ${typoMatch('c.title', q)}`,
        }),
      true,
    );
    return typo.map((r) => r.id);
  }

  /**
   * Suggestions while typing (owner 2026-10-15): topics, attorney handles
   * and practice names that start with [prefix] — one cheap round trip.
   */
  async suggest(
    prefix: string,
    perKind: number,
  ): Promise<{ kind: 'tag' | 'person' | 'practice'; text: string }[]> {
    const like = `${escapeLike(prefix)}%`;
    const [tags, people, practices] = await Promise.all([
      this.searchTags(prefix, perKind),
      this.prisma.$queryRaw<{ username: string }[]>`
        SELECT username FROM attorney_profiles
        WHERE username_lower LIKE ${like}
          AND verification_status <> 'suspended'
        ORDER BY rating_count DESC, username_lower
        LIMIT ${perKind}`,
      this.prisma.$queryRaw<{ name: string }[]>`
        SELECT name_en AS name FROM practice_areas
        WHERE parent_id IS NULL AND lower(name_en) LIKE ${like}
        ORDER BY sort LIMIT ${perKind}`,
    ]);
    return [
      ...tags.map((text) => ({ kind: 'tag' as const, text })),
      ...people.map((r) => ({ kind: 'person' as const, text: r.username })),
      ...practices.map((r) => ({ kind: 'practice' as const, text: r.name })),
    ];
  }

  async searchTags(prefix: string, limit: number): Promise<string[]> {
    const rows = await this.prisma.tag.findMany({
      where: {
        tag_lower: { startsWith: prefix },
        NOT: { tag_lower: { startsWith: HIDDEN_TAG_PREFIX } },
      },
      orderBy: { tag_lower: 'asc' },
      take: limit,
      select: { tag_lower: true },
    });
    return rows.map((r) => r.tag_lower);
  }
}

export { escapeLike, nameMatchSql };

import { Injectable, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  HIDDEN_TAG_PREFIX,
  legacyTopicTags,
  postPracticeSql,
} from '../posts/hidden-tags';
import { attorneysWithEntitlementSql } from '../plans/entitlements.service';
import { Prisma } from '@prisma/client';
import { PrismaReadService } from '../../prisma/prisma-read.service';
import { readsAreSplit } from '../../sharding/split-reads';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ftsMatch,
  DEFAULT_TEXT_WEIGHTS,
  ftsRank,
  TYPO_THRESHOLD,
  typoMatch,
} from '../../common/search/fts-sql';
import { parseSearchQuery } from '../../common/search/search-query';
import {
  escapeLike,
  letterCount,
  NAME_MATCH,
  nameKeys,
  nameMatchSql,
  PERSON_TIER,
  personTierSql,
  startsAWord,
  wordStartSql,
} from '../../common/search/name-match.sql';
import { SearchSynonymsService } from './search-synonyms.service';
import { urgencyFilterSql } from '../cases/domain/case-urgency';
import { budgetFilterSql } from '../cases/cases.public';
import {
  buildPracticeCasesSql,
  resolveFeedGlobals,
  scatterFeed,
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

/** Attorney-only filters leave clients out; state also fits clients. */
export function attorneyOnly(f: AttorneySearchFilters): boolean {
  return (
    f.practiceAreaId !== undefined ||
    f.minRating !== undefined ||
    f.language !== undefined ||
    f.role === 'attorney'
  );
}

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
    // Load audit 6: search tolerates replica lag, so it reads the replica
    // when DATABASE_REPLICA_URL is set (prisma-read.service.ts).
    @Optional() private readonly read?: PrismaReadService,
  ) {}

  private get db(): PrismaService {
    return this.read?.db ?? this.prisma;
  }

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
    const rows = await this.db.$queryRaw<{ id: string; v: string }[]>`
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

  async searchAttorneysAmong(
    q: string,
    f: AttorneySearchFilters,
    max: number,
    ids: string[],
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.people(q, f, max, false, ids);
    return rows.map((r) => r.id);
  }

  searchPeople(
    q: string,
    f: AttorneySearchFilters,
    max: number,
  ): Promise<{ id: string; role: PersonRole; tier: PersonTier }[]> {
    return this.people(q, f, max, !attorneyOnly(f));
  }

  /** Search-engine step: the engine found the candidate [ids]; filters,
   * tiers and ranking are decided here, exactly as in [searchPeople]. */
  async searchPeopleAmong(
    q: string,
    f: AttorneySearchFilters,
    max: number,
    ids: string[],
  ): Promise<{ id: string; role: PersonRole; tier: PersonTier }[]> {
    if (ids.length === 0) return [];
    return this.people(q, f, max, !attorneyOnly(f), ids);
  }

  /** Practices whose name in any language contains [q] (search-engine step). */
  async practicesNamed(q: string): Promise<string[]> {
    const out: string[] = [];
    for (const [id, names] of await this.practiceAreaNames()) {
      if (names.some((n) => startsAWord(n, q))) out.push(id);
    }
    return out;
  }

  /** Practices the query's everyday words point at (search-engine step). */
  async synonymPractices(q: string): Promise<string[]> {
    return (await this.synonyms?.resolve(q))?.practiceIds ?? [];
  }

  /** Spelling keys of typed words (name skeleton and consonants), so the
   * engine can match names across alphabets the way Postgres does. */
  async nameKeys(words: string[]): Promise<{ skel: string; cons: string }[]> {
    if (words.length === 0) return [];
    const rows = await this.db.$queryRaw<
      { w: string; skel: string; cons: string }[]
    >`
      SELECT w, public.f_name_skel(w) AS skel, public.f_name_cons(w) AS cons
      FROM unnest(${words}::TEXT[]) AS w`;
    return words.map((w) => {
      const r = rows.find((x) => x.w === w);
      return { skel: r?.skel ?? '', cons: r?.cons ?? '' };
    });
  }

  /**
   * Attorneys (docs/05 §7.3 branches: @username, name, practice name,
   * state) and — OQ-026, when [withClients] — clients (@username, name).
   *
   * Owner 2026-10-28 (Instagram / Telegram order; «jah» found an unrelated
   * «Syimyk Kalykov» through the Indonesian practice name «Kejahatan»):
   * every row gets a tier ([PERSON_TIER], personTierSql) — exact, prefix,
   * word start, contains (3+ letters), other alphabet, typo (4+ letters),
   * topic/state — and a row of no tier is dropped, also for the engine's
   * candidates ([among]). Inside a tier: typo closeness, the paid "higher
   * in search", verified, rating (admin weights), followers, attorneys
   * first; SearchService then moves close neighbours by the viewer's own
   * interactions (reorderWithinTiers).
   */
  private async people(
    q: string,
    f: AttorneySearchFilters,
    max: number,
    withClients: boolean,
    among?: string[],
  ): Promise<{ id: string; role: PersonRole; tier: PersonTier }[]> {
    const w = await this.weights();
    const letters = letterCount(q);
    const prefix = `${escapeLike(q)}%`;
    const contains = `%${escapeLike(q)}%`;
    const keys = await nameKeys(this.db, q);
    const byName = nameMatchSql(keys);
    // Topics and places only from 3 letters, at a word start: «jah» is not
    // «Kejahatan» (criminal law, Indonesian), «ka» is not Kansas.
    const topical = letters >= NAME_MATCH.containsMinLetters;
    // Owner 2026-10-15: "развод" / "муж бьёт" → attorneys of that topic.
    const synPractices = (await this.synonyms?.resolve(q))?.practiceIds ?? [];
    // Owner 2026-10-13: a practice by its name in ANY language ("развод",
    // "तलाक"): the translations of its i18n key (matched in memory).
    const namedPractices: string[] = [];
    if (topical) {
      for (const [id, names] of await this.practiceAreaNames()) {
        if (names.some((n) => startsAWord(n, q))) namedPractices.push(id);
      }
    }
    const topicPractices = [...new Set([...synPractices, ...namedPractices])];
    const practiceByEnglish = topical
      ? wordStartSql(Prisma.sql`lower(pa.name_en)`, escapeLike(q))
      : Prisma.sql`FALSE`;
    const stateMatch = Prisma.sql`(lower(s.code) = ${q}${
      topical ? Prisma.sql` OR lower(s.name) LIKE ${prefix}` : Prisma.empty
    })`;
    // Is the attorney [u] one of the typed topic / state (tier "topic")?
    const topic = Prisma.sql`(EXISTS (SELECT 1 FROM attorney_practice_areas tp
        WHERE tp.attorney_id = u.id
          AND (tp.practice_area_id = ANY(${topicPractices}::UUID[])
               OR tp.practice_area_id IN (SELECT pa.id FROM practice_areas pa
                                           WHERE ${practiceByEnglish})))
      OR EXISTS (SELECT 1 FROM attorney_licenses tl
        JOIN states s ON s.code = tl.state_code
        WHERE tl.attorney_id = u.id AND tl.license_status = 'verified'
          AND ${stateMatch}))`;
    const byTopic = topicPractices.length
      ? Prisma.sql`UNION
        (SELECT ap.attorney_id FROM attorney_practice_areas ap
          WHERE ap.practice_area_id = ANY(${topicPractices}::UUID[])
          LIMIT ${BRANCH_CAP})`
      : Prisma.empty;
    const byEnglish = topical
      ? Prisma.sql`UNION
        (SELECT ap.attorney_id FROM practice_areas pa
          JOIN attorney_practice_areas ap ON ap.practice_area_id = pa.id
          WHERE ${practiceByEnglish}
          LIMIT ${BRANCH_CAP})`
      : Prisma.empty;
    // Candidate handles: prefix; inside from 3 letters; close from 4.
    const handleMatch = (col: Prisma.Sql) =>
      Prisma.sql`(${col} LIKE ${
        letters >= NAME_MATCH.containsMinLetters ? contains : prefix
      }${keys.fuzzy ? Prisma.sql` OR ${col} % ${q}` : Prisma.empty})`;
    // Candidate names: a word start; inside from 3 letters. Other
    // alphabets, word order and typos come from [byName].
    const fullNameMatch =
      letters >= NAME_MATCH.containsMinLetters
        ? Prisma.sql`full_name_lower LIKE ${contains}`
        : wordStartSql(Prisma.sql`full_name_lower`, escapeLike(q));
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
        SELECT u.id, 'client' AS role, u.full_name_lower AS fname,
               u.name_skel AS fskel,
               ${personTierSql(q, keys, Prisma.sql`c.username_lower`, 'u', Prisma.sql`FALSE`)} AS tier,
               FALSE AS verified,
               0::DECIMAL AS rating, FALSE AS priority,
               c.followers_count AS followers
        FROM (${
          among
            ? Prisma.sql`SELECT unnest(${among}::UUID[]) AS user_id`
            : Prisma.sql`
          (SELECT user_id FROM client_profiles
            WHERE username_lower IS NOT NULL
              AND ${handleMatch(Prisma.sql`username_lower`)}
            LIMIT ${BRANCH_CAP})
          UNION
          (SELECT id AS user_id FROM users
            WHERE full_name_lower IS NOT NULL AND role = 'client'
              AND ${fullNameMatch}
            LIMIT ${BRANCH_CAP})
          UNION
          (SELECT id AS user_id FROM users
            WHERE full_name_lower IS NOT NULL AND role = 'client' AND ${byName}
            LIMIT ${BRANCH_CAP})`
        }) cc
        JOIN users u ON u.id = cc.user_id AND u.role = 'client'
          AND u.status = 'active' AND u.deleted_at IS NULL
        JOIN client_profiles c ON c.user_id = u.id
          AND c.username_lower IS NOT NULL
        WHERE TRUE ${clientFilters}`
      : Prisma.empty;
    const rows = await this.db.$queryRaw<
      { id: string; role: PersonRole; tier: number }[]
    >`
      WITH cand AS (${
        among
          ? Prisma.sql`SELECT unnest(${among}::UUID[]) AS id`
          : Prisma.sql`
        (SELECT user_id AS id FROM attorney_profiles
          WHERE username_lower IS NOT NULL
            AND ${handleMatch(Prisma.sql`username_lower`)}
          LIMIT ${BRANCH_CAP})
        UNION
        (SELECT id FROM users
          WHERE full_name_lower IS NOT NULL AND role = 'attorney'
            AND ${fullNameMatch}
          LIMIT ${BRANCH_CAP})
        UNION
        (SELECT id FROM users
          WHERE full_name_lower IS NOT NULL AND role = 'attorney' AND ${byName}
          LIMIT ${BRANCH_CAP})
        ${byEnglish}
        ${byTopic}
        UNION
        (SELECT l.attorney_id FROM states s
          JOIN attorney_licenses l ON l.state_code = s.code
            AND l.license_status = 'verified'
          WHERE ${stateMatch}
          LIMIT ${BRANCH_CAP})`
      }
      ),
      people AS (
        SELECT u.id, 'attorney' AS role,
               u.full_name_lower AS fname, u.name_skel AS fskel,
               ${personTierSql(q, keys, Prisma.sql`a.username_lower`, 'u', topic)} AS tier,
               (a.verification_status = 'verified') AS verified,
               a.rating_avg AS rating,
               -- Owner 2026-10-05 (plan builder): "higher in search".
               ${attorneysWithEntitlementSql('priority_search', Prisma.sql`u.id`)} AS priority,
               a.followers_count AS followers
        FROM cand
        JOIN users u ON u.id = cand.id AND u.role = 'attorney'
          AND u.status = 'active' AND u.deleted_at IS NULL
        JOIN attorney_profiles a ON a.user_id = u.id
          AND a.verification_status <> 'suspended'
        WHERE TRUE ${filters}
        ${clients}
      )
      SELECT id::TEXT AS id, role, tier
      FROM (SELECT *,
                   bool_or(tier < ${PERSON_TIER.fuzzy}) OVER () AS has_strong
            FROM people WHERE tier < ${PERSON_TIER.none}) p
      -- Owner 2026-10-28 («sima kalykov» also listed «Syimyk Kalykov»):
      -- typo matches only when no name matched strongly.
      WHERE tier <> ${PERSON_TIER.fuzzy} OR NOT has_strong
      ORDER BY
        tier,
        -- A typo: the closer spelling first (both keys precomputed).
        (CASE WHEN tier = ${PERSON_TIER.fuzzy}
              THEN word_similarity(${keys.whole}::TEXT, COALESCE(fskel, ''))
              ELSE 0 END) DESC,
        (priority::INT * ${w.priority}::FLOAT8 + verified::INT * ${w.verified}::FLOAT8
          + rating::FLOAT8 * ${w.rating}::FLOAT8) DESC,
        followers DESC,
        (role = 'attorney') DESC,
        length(COALESCE(fname, '')),
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
    // Shard-ready step 8: several databases -> global parts resolved first,
    // the case-only statement runs on each database (see cases-visible.sql.ts).
    if (readsAreSplit(this.db)) {
      return this.searchCasesSplit(q, p, extra, textPractices, this.budgetNow);
    }
    // Audit 2026-10-01: a qualification in search works like the feed's
    // topic — any qualification (category → its subcategories) in the
    // attorney's licensed states, not only their own practices.
    if (p.practiceCategory) {
      return this.db.$queryRaw<{ id: string; created_at: Date }[]>(
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
    return this.db.$queryRaw<{ id: string; created_at: Date }[]>(
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

  /** The time budget of the call in progress (set by [budget], read on
   * entry of [searchCases]; both run in the same synchronous step). */
  private budgetNow: { ms: number; trigram: string } | null = null;

  private async searchCasesSplit(
    q: string,
    p: CaseSearchParams,
    extra: Prisma.Sql,
    textPractices: string[],
    budget: { ms: number; trigram: string } | null,
  ): Promise<{ id: string; created_at: Date }[]> {
    const globals = await resolveFeedGlobals(this.db, p.attorneyId, {
      practiceCategory: p.practiceCategory,
      practice: p.practiceCategory,
    });
    const sql = p.practiceCategory
      ? buildPracticeCasesSql({
          globals,
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
        })
      : buildVisibleCasesSql({
          globals,
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
        });
    return scatterFeed(this.db, sql, p.limit + 1, budget ?? undefined);
  }

  async searchPosts(
    q: string,
    max: number,
    f: PostSearchFilters = {},
  ): Promise<string[]> {
    const w = await this.weights();
    const run = this.postRunner(q, max, f, w);
    return this.searchPostsWith(q, run);
  }

  /** Search-engine step: the engine found [ids]; the same filters, access
   * rules and ordering as [searchPosts] decide what is shown. */
  async searchPostsAmong(
    q: string,
    max: number,
    f: PostSearchFilters,
    ids: string[],
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const w = await this.weights();
    const rows = await this.postRunner(
      q,
      max,
      f,
      w,
    )(Prisma.sql`p.id = ANY(${ids}::UUID[])`);
    return rows.map((r) => r.id);
  }

  private postRunner(
    q: string,
    max: number,
    f: PostSearchFilters,
    w: Awaited<ReturnType<PostgresSearchProvider['weights']>>,
  ): (match: Prisma.Sql) => Promise<{ id: string }[]> {
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
    return (match: Prisma.Sql) => this.db.$queryRaw<{ id: string }[]>`
      WITH m AS (
        SELECT p.id, p.created_at, p.search_tsv, p.search_tsv_simple FROM posts p
        WHERE ${match}
          AND p.status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
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
  }

  private async searchPostsWith(
    q: string,
    run: (match: Prisma.Sql) => Promise<{ id: string }[]>,
  ): Promise<string[]> {
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
   * Owner 2026-10-20: the same kinds of match as the main search — whole
   * words (full text, accents ignored), typos (trigram word similarity on
   * the title), plain substrings, and the topic the query's synonyms point
   * at — over the title, the text and every published answer.
   * (Moved here from LegalQaService unchanged: the Q&A search is a search.)
   *
   * Package N-12b (2026-10-25): first through the indexes only — the GIN
   * full-text indexes on questions and answers, the trigram index on the
   * folded title, the topic index (migration 20261031200100) — so a search
   * never scans the tables. Only when that finds nothing does the old full
   * query run (typos, a fragment inside the text), like the main search's
   * exact → typo steps.
   */
  async searchQuestions(text: string): Promise<string[]> {
    const topics = (await this.synonyms?.resolve(text))?.practiceIds ?? [];
    const like = `%${escapeLike(text)}%`;
    const fast = await this.db.$queryRaw<{ id: string }[]>`
      SELECT t.id::TEXT AS id FROM (
        SELECT q.id, q.created_at FROM legal_questions q
        WHERE q.status = 'published' AND q.deleted_at IS NULL
          AND to_tsvector('simple', f_unaccent(q.title || ' ' || q.body))
                @@ websearch_to_tsquery('simple', f_unaccent(${text}))
        UNION
        SELECT q.id, q.created_at FROM legal_questions q
        WHERE q.status = 'published' AND q.deleted_at IS NULL
          AND f_unaccent(lower(q.title)) LIKE f_unaccent(lower(${like}))
        UNION
        SELECT q.id, q.created_at FROM legal_answers a
        JOIN legal_questions q ON q.id = a.question_id
        WHERE a.status = 'published' AND a.deleted_at IS NULL
          AND q.status = 'published' AND q.deleted_at IS NULL
          AND to_tsvector('simple', f_unaccent(a.body))
                @@ websearch_to_tsquery('simple', f_unaccent(${text}))
        ${
          topics.length > 0
            ? Prisma.sql`UNION
        SELECT q.id, q.created_at FROM legal_questions q
        WHERE q.status = 'published' AND q.deleted_at IS NULL
          AND q.practice_area_id = ANY(${topics}::UUID[])`
            : Prisma.empty
        }
      ) t
      ORDER BY t.created_at DESC
      LIMIT 500`;
    if (fast.length > 0) return fast.map((r) => r.id);
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT q.id::TEXT AS id
      FROM legal_questions q
      WHERE q.status = 'published' AND q.deleted_at IS NULL
        AND (
          to_tsvector('simple', f_unaccent(q.title || ' ' || q.body))
            @@ websearch_to_tsquery('simple', f_unaccent(${text}))
          OR word_similarity(f_unaccent(lower(${text})), f_unaccent(lower(q.title))) > 0.45
          OR q.title ILIKE ${like} OR q.body ILIKE ${like}
          OR (${topics.length > 0} AND q.practice_area_id = ANY(${topics}::UUID[]))
          OR EXISTS (
            SELECT 1 FROM legal_answers a
            WHERE a.question_id = q.id AND a.status = 'published'
              AND a.deleted_at IS NULL
              AND (to_tsvector('simple', f_unaccent(a.body))
                     @@ websearch_to_tsquery('simple', f_unaccent(${text}))
                   OR a.body ILIKE ${like}))
        )
      ORDER BY q.created_at DESC
      LIMIT 500`;
    return rows.map((r) => r.id);
  }

  /** Search-engine step: only questions that are still published, newest
   * first (the order [searchQuestions] gives). */
  async searchQuestionsAmong(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT q.id::TEXT AS id FROM legal_questions q
      WHERE q.id = ANY(${ids}::UUID[])
        AND q.status = 'published' AND q.deleted_at IS NULL
      ORDER BY q.created_at DESC
      LIMIT 500`;
    return rows.map((r) => r.id);
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
    const rows = await this.db.$queryRaw<
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
    const rows = await this.db.$queryRaw<{ id: string }[]>`
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
    if (readsAreSplit(this.db)) {
      // The timeouts are applied per database inside searchCasesSplit.
      this.budgetNow = { ms, trigram: loose ? TYPO_THRESHOLD : '0.6' };
      try {
        return await query();
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (/statement timeout|57014/.test(msg)) return [];
        throw e;
      } finally {
        this.budgetNow = null;
      }
    }
    try {
      const [, , result] = await this.db.$transaction([
        this.db
          .$executeRaw`SELECT set_config('statement_timeout', ${String(Math.floor(ms))}, true)`,
        this.db
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
  /** Search-engine step: the engine found the candidate [ids]; the
   * attorney's visibility rules (§4.1) and every filter still decide here,
   * through the same SQL as [searchCasesRanked]. */
  async searchCasesRankedAmong(
    q: string,
    p: Omit<CaseSearchParams, 'cursor' | 'limit'>,
    max: number,
    ids: string[],
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const w = await this.weights();
    const rows = await this.searchCases('', {
      ...p,
      limit: CASE_CANDIDATES,
      extraSql: Prisma.sql`${p.extraSql ?? Prisma.empty} AND c.id = ANY(${ids}::UUID[])`,
    });
    const found = rows.map((r) => r.id);
    if (found.length === 0) return [];
    const ranked = await this.db.$queryRaw<{ id: string }[]>`
        SELECT c.id::TEXT AS id FROM cases c
        WHERE c.id = ANY(${found}::UUID[])
        ORDER BY ${ftsRank('c', q, w.text)} DESC, c.created_at DESC, c.id DESC
        LIMIT ${max}`;
    return ranked.map((r) => r.id);
  }

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
      const ranked = await this.db.$queryRaw<{ id: string }[]>`
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
      this.db.$queryRaw<{ username: string }[]>`
        SELECT username FROM attorney_profiles
        WHERE username_lower LIKE ${like}
          AND verification_status <> 'suspended'
        ORDER BY rating_count DESC, username_lower
        LIMIT ${perKind}`,
      this.db.$queryRaw<{ name: string }[]>`
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
    const rows = await this.db.tag.findMany({
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

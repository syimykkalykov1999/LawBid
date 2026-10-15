import type {
  CaseMinUrgency,
  UrgencyThresholds,
} from '../cases/domain/case-urgency';
import type { CreatedAtCursor } from '../../common/pagination/cursor.util';

export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');
/** §7.2 "Популярные темы", written by TrendingTagsJob. */
export const TRENDING_TAGS_KEY = 'search:trending-tags';

export interface AttorneySearchFilters {
  practiceAreaId?: string;
  state?: string;
  minRating?: number;
  language?: string;
  /** OQ-036 People filters. */
  role?: 'attorney' | 'client';
  verifiedOnly?: boolean;
}

export interface CaseSearchParams {
  attorneyId: string;
  practiceAreaId?: string;
  state?: string;
  since?: Date;
  cursor?: CreatedAtCursor;
  limit: number;
  /** OQ-036 Cases filters. */
  practiceCategory?: string;
  budgetMinCents?: number;
  budgetMaxCents?: number;
  budgetUnknown?: boolean;
  noBids?: boolean;
  /** Owner 2026-10-05: urgency filters (see urgencyFilterSql). */
  minUrgency?: CaseMinUrgency;
  hasDeadline?: boolean;
  urgencyThresholds?: UrgencyThresholds;
  /** Whole words only (no prefix on the last word), provider-internal. */
  textExact?: boolean;
  /** Extra `AND …` SQL (the typo fallback), provider-internal. */
  extraSql?: import('@prisma/client').Prisma.Sql;
}

/** OQ-036 Posts filters. */
export interface PostSearchFilters {
  tag?: string;
  /** Audit 2026-10-01: a qualification code (category or subcategory). */
  practice?: string;
  state?: string;
  since?: Date;
  withPhotos?: boolean;
  /** Owner 2026-10-13: only text-only posts (Briefs). */
  briefsOnly?: boolean;
  sort?: 'relevance' | 'newest' | 'popular';
  /** Owner 2026-10-05: only legal posts ("Legal only" viewers). */
  contentClass?: 'legal' | 'general';
}

/**
 * docs/05 §7.6: the search backend behind `/search/*`. The first
 * implementation is PostgresSearchProvider (trigram + tsvector indexes of
 * docs/02 §5.3); an external engine can replace it without an API change.
 * Every method returns ids only — access and presentation stay in
 * SearchService (cases always go through CaseAccessPolicy there).
 */
export type PersonRole = 'attorney' | 'client';
/** How the name matched: 0 exact @username, 1 username prefix, 2 other.
 * Personal ranking only reorders inside a tier (owner 2026-10-13). */
export type PersonTier = 0 | 1 | 2;

export interface SearchProvider {
  /** Ranked attorney ids (§7.3), at most [max]. */
  searchAttorneys(
    q: string,
    filters: AttorneySearchFilters,
    max: number,
  ): Promise<string[]>;
  /** OQ-026 People: attorneys AND clients by @username / name, ranked
   * together, at most [max]. With any attorney filter set only attorneys
   * qualify (clients have no practices/licenses/ratings). */
  searchPeople(
    q: string,
    filters: AttorneySearchFilters,
    max: number,
  ): Promise<{ id: string; role: PersonRole; tier: PersonTier }[]>;
  /** Case ids visible to the attorney by the §4.1 rules, newest first,
   * limit + 1 rows (the extra one signals a next page). */
  searchCases(
    q: string,
    params: CaseSearchParams,
  ): Promise<{ id: string; created_at: Date }[]>;
  /** Published post ids by relevance, then date, at most [max]. */
  searchPosts(
    q: string,
    max: number,
    filters?: PostSearchFilters,
  ): Promise<string[]>;
  /** Hashtags (lowercase, without '#') starting with [prefix]. */
  /** Cases for a text query ranked by relevance (ids), with a typo fallback. */
  searchCasesRanked(
    q: string,
    params: Omit<CaseSearchParams, 'cursor' | 'limit'>,
    max: number,
  ): Promise<string[]>;
  /** Type-ahead: topics, attorney handles and practice names by prefix. */
  suggest(
    prefix: string,
    perKind: number,
  ): Promise<{ kind: 'tag' | 'person' | 'practice'; text: string }[]>;
  searchTags(prefix: string, limit: number): Promise<string[]>;
}

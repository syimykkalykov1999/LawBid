import type { CreatedAtCursor } from '../../common/pagination/cursor.util';

export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');
/** §7.2 "Популярные темы", written by TrendingTagsJob. */
export const TRENDING_TAGS_KEY = 'search:trending-tags';

export interface AttorneySearchFilters {
  practiceAreaId?: string;
  state?: string;
  minRating?: number;
  language?: string;
}

export interface CaseSearchParams {
  attorneyId: string;
  practiceAreaId?: string;
  state?: string;
  since?: Date;
  cursor?: CreatedAtCursor;
  limit: number;
}

/**
 * docs/05 §7.6: the search backend behind `/search/*`. The first
 * implementation is CockroachSearchProvider (trigram + tsvector indexes of
 * docs/02 §5.3); an external engine can replace it without an API change.
 * Every method returns ids only — access and presentation stay in
 * SearchService (cases always go through CaseAccessPolicy there).
 */
export type PersonRole = 'attorney' | 'client';

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
  ): Promise<{ id: string; role: PersonRole }[]>;
  /** Case ids visible to the attorney by the §4.1 rules, newest first,
   * limit + 1 rows (the extra one signals a next page). */
  searchCases(
    q: string,
    params: CaseSearchParams,
  ): Promise<{ id: string; created_at: Date }[]>;
  /** Published post ids by relevance, then date, at most [max]. */
  searchPosts(q: string, max: number): Promise<string[]>;
  /** Hashtags (lowercase, without '#') starting with [prefix]. */
  searchTags(prefix: string, limit: number): Promise<string[]>;
}

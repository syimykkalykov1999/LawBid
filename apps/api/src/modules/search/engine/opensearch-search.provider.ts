import { Injectable, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { DEFAULT_TEXT_WEIGHTS } from '../../../common/search/fts-sql';
import { parseSearchQuery } from '../../../common/search/search-query';
import { typedWords } from '../../../common/search/name-match.sql';
import { PostgresSearchProvider } from '../postgres-search.provider';
import type {
  AttorneySearchFilters,
  CaseSearchParams,
  PersonRole,
  PersonTier,
  PostSearchFilters,
  SearchProvider,
} from '../search.provider';
import { OpenSearchClient } from './opensearch.client';
import {
  CANDIDATES,
  caseQuery,
  peopleQuery,
  postQuery,
  questionQuery,
  tagQuery,
  type Query,
  type TextWeights,
} from './search-engine.queries';
import type { SearchEntity } from './search-engine.mappings';

/**
 * The search engine behind SearchProvider (docs/05 §7.6, owner 2026-10-24).
 * "The engine finds, Postgres decides": the engine returns ranked candidate
 * ids for the text part of a query (the expensive part: full text, typos,
 * names in any alphabet); the same PostgresSearchProvider then applies
 * access (cases always through the §4.1 visibility SQL), filters and the
 * final order to those ids. So result shapes, rules and tiers are the
 * Postgres ones by construction, and a stale engine document can never
 * show something a person may not see.
 *
 * Throws when the engine fails or is slow; SwitchingSearchProvider turns
 * that into a Postgres answer.
 */
@Injectable()
export class OpenSearchProvider implements SearchProvider {
  constructor(
    private readonly pg: PostgresSearchProvider,
    private readonly client: OpenSearchClient,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  private async timeout(): Promise<number> {
    return this.settings
      ? await this.settings.number('search.engine_timeout_ms')
      : 800;
  }

  private async weights(): Promise<TextWeights> {
    if (!this.settings) return DEFAULT_TEXT_WEIGHTS;
    return {
      title: await this.settings.number('search.weight_title'),
      text: await this.settings.number('search.weight_text'),
    };
  }

  /** Strict query first; nothing found → the typo (fuzzy) one. */
  private async find(
    entity: SearchEntity,
    build: (fuzzy: boolean) => Query,
    size: number,
  ): Promise<string[]> {
    const ms = await this.timeout();
    const strict = await this.client.searchIds(entity, build(false), size, ms);
    if (strict.length > 0) return strict;
    return this.client.searchIds(entity, build(true), size, ms);
  }

  // --- people ---------------------------------------------------------------

  private async peopleIds(
    q: string,
    f: AttorneySearchFilters,
    withClients: boolean,
  ): Promise<string[]> {
    const [namedPractices, synonymPractices, nameKeys] = await Promise.all([
      this.pg.practicesNamed(q),
      this.pg.synonymPractices(q),
      this.pg.nameKeys(
        q
          .split(/\s+/)
          .map((w) => w.replace(/^[@#]+/, ''))
          .filter((w) => w.length >= 2)
          .slice(0, 4),
      ),
    ]);
    return this.find(
      'person',
      (fuzzy) =>
        peopleQuery(
          q,
          f,
          { namedPractices, synonymPractices, nameKeys, withClients },
          fuzzy,
        ),
      CANDIDATES.people,
    );
  }

  async searchAttorneys(
    q: string,
    f: AttorneySearchFilters,
    max: number,
  ): Promise<string[]> {
    const ids = await this.peopleIds(q, f, false);
    return this.pg.searchAttorneysAmong(q, f, max, ids);
  }

  async searchPeople(
    q: string,
    f: AttorneySearchFilters,
    max: number,
  ): Promise<{ id: string; role: PersonRole; tier: PersonTier }[]> {
    const ids = await this.peopleIds(q, f, true);
    return this.pg.searchPeopleAmong(q, f, max, ids);
  }

  // --- cases ----------------------------------------------------------------

  /** The cursor browse without text is the access-controlled feed: it never
   * needed full text, so it stays on Postgres. */
  searchCases(
    q: string,
    params: CaseSearchParams,
  ): Promise<{ id: string; created_at: Date }[]> {
    return this.pg.searchCases(q, params);
  }

  async searchCasesRanked(
    q: string,
    params: Omit<CaseSearchParams, 'cursor' | 'limit'>,
    max: number,
  ): Promise<string[]> {
    const parsed = parseSearchQuery(q);
    if (!parsed.plain) return [];
    const [w, textPractices] = await Promise.all([
      this.weights(),
      this.pg.practiceIdsFor(q),
    ]);
    const ids = await this.find(
      'case',
      (fuzzy) =>
        caseQuery(
          q,
          { state: params.state, since: params.since },
          w,
          textPractices,
          parsed.plain,
          fuzzy,
        ),
      CANDIDATES.cases,
    );
    return this.pg.searchCasesRankedAmong(
      q,
      { ...params, textPractices },
      max,
      ids,
    );
  }

  // --- posts ----------------------------------------------------------------

  async searchPosts(
    q: string,
    max: number,
    f: PostSearchFilters = {},
  ): Promise<string[]> {
    if (!parseSearchQuery(q).plain) return [];
    const [w, practiceIds] = await Promise.all([
      this.weights(),
      this.pg.practiceIdsFor(q),
    ]);
    const ids = await this.find(
      'post',
      (fuzzy) => postQuery(q, f, w, practiceIds, fuzzy),
      CANDIDATES.posts,
    );
    return this.pg.searchPostsAmong(q, max, f, ids);
  }

  // --- Q&A ------------------------------------------------------------------

  async searchQuestions(text: string): Promise<string[]> {
    if (typedWords(text).length === 0) return [];
    const topics = await this.pg.synonymPractices(text);
    const ids = await this.find(
      'question',
      (fuzzy) => questionQuery(text, topics, fuzzy),
      500,
    );
    return this.pg.searchQuestionsAmong(ids);
  }

  // --- tags and type-ahead --------------------------------------------------

  async searchTags(prefix: string, limit: number): Promise<string[]> {
    if (!prefix) return [];
    const ms = await this.timeout();
    return this.client.searchIds(
      'tag',
      tagQuery(prefix),
      limit,
      ms,
      [{ tag: 'asc' }],
      'tag',
    );
  }

  /** Small tables and btree prefixes: Postgres answers these in a
   * millisecond, there is nothing to move. */
  suggest(
    prefix: string,
    perKind: number,
  ): Promise<{ kind: 'tag' | 'person' | 'practice'; text: string }[]> {
    return this.pg.suggest(prefix, perKind);
  }

  practiceMatches(
    q: string,
    limit: number,
  ): Promise<{ code: string; nameEn: string; hit: string | null }[]> {
    return this.pg.practiceMatches(q, limit);
  }
}

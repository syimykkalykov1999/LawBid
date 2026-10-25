import { Injectable, Logger, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { OpenSearchProvider } from './engine/opensearch-search.provider';
import { PostgresSearchProvider } from './postgres-search.provider';
import type {
  AttorneySearchFilters,
  CaseSearchParams,
  PersonRole,
  PersonTier,
  PostSearchFilters,
  SearchProvider,
} from './search.provider';

export type SearchMode = 'postgres' | 'shadow' | 'engine';

/** After this many engine failures in a row it is skipped for [OPEN_MS]. */
const BREAKER_FAILS = 5;
const OPEN_MS = 30_000;
/** Identical shadow answers are logged this often (differences always). */
const LOG_SAMPLE = 20;

export interface ShadowDiff {
  op: string;
  pgCount: number;
  engineCount: number;
  /** Same ids in the same order. */
  identical: boolean;
  /** Same ids, any order. */
  sameSet: boolean;
  onlyPg: number;
  onlyEngine: number;
  top1Same: boolean;
}

/** Compares two ranked id lists (the shape of every search answer). */
export function diffIds(
  op: string,
  pg: string[],
  engine: string[],
): ShadowDiff {
  const a = new Set(pg);
  const b = new Set(engine);
  const onlyPg = pg.filter((x) => !b.has(x)).length;
  const onlyEngine = engine.filter((x) => !a.has(x)).length;
  return {
    op,
    pgCount: pg.length,
    engineCount: engine.length,
    identical:
      pg.length === engine.length && pg.every((x, i) => x === engine[i]),
    sameSet: onlyPg === 0 && onlyEngine === 0,
    onlyPg,
    onlyEngine,
    top1Same: pg[0] === engine[0],
  };
}

/**
 * The `search.engine` switch (owner 2026-10-24, SEARCH_READY.md): the
 * provider SearchService talks to.
 *   postgres  Postgres only, as always. The engine code is never touched.
 *   shadow    Postgres answers; the engine is asked as well, in the
 *             background, and the differences and both latencies are
 *             logged ("search.shadow"). A slow or broken engine costs the
 *             person nothing.
 *   engine    the engine answers; on error, timeout or while its circuit is
 *             open, Postgres answers instead (same request, no error shown).
 * Cursor browsing of cases, type-ahead and the topic picker always stay on
 * Postgres (they are not full-text work).
 */
@Injectable()
export class SwitchingSearchProvider implements SearchProvider {
  private readonly log = new Logger(SwitchingSearchProvider.name);
  private fails = 0;
  private openUntil = 0;
  private shadowSeen = 0;
  private readonly pending = new Set<Promise<void>>();
  /** Counters since start (shadow runs / differing runs / engine fallbacks). */
  readonly stats = { shadow: 0, shadowDiff: 0, fallbacks: 0 };

  constructor(
    private readonly pg: PostgresSearchProvider,
    private readonly engine: OpenSearchProvider,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  /** The clock (a field, not a constructor argument: Nest injects those). */
  now: () => number = Date.now;

  async mode(): Promise<SearchMode> {
    try {
      const v = await this.settings?.string('search.engine');
      return v === 'shadow' || v === 'engine' ? v : 'postgres';
    } catch {
      return 'postgres';
    }
  }

  /** Resolves when the background shadow comparisons have finished (tests,
   * graceful shutdown). */
  async idle(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  /** One metric line per search answered by Postgres: the CloudWatch metric
   * filter `search-pg-latency` (infra/modules/monitoring) takes the p95 of
   * `ms`; above 300 ms for 15 minutes the owner is told to turn the separate
   * search on (admin: search.engine). */
  private latency(op: string, engine: string, ms: number): void {
    this.log.log({ metric: 'search_latency', op, engine, ms });
  }

  private async timeoutMs(): Promise<number> {
    try {
      return (await this.settings?.number('search.engine_timeout_ms')) ?? 800;
    } catch {
      return 800;
    }
  }

  private async route<T>(
    op: string,
    run: (p: SearchProvider) => Promise<T>,
    ids: (r: T) => string[],
  ): Promise<T> {
    const mode = await this.mode();
    if (mode === 'postgres') {
      const t0 = this.now();
      try {
        return await run(this.pg);
      } finally {
        this.latency(op, 'postgres', this.now() - t0);
      }
    }

    if (mode === 'shadow') {
      const t0 = this.now();
      const result = await run(this.pg);
      const pgMs = this.now() - t0;
      this.latency(op, 'postgres', pgMs);
      const task = this.shadow(op, run, ids(result), pgMs).finally(() =>
        this.pending.delete(task),
      );
      this.pending.add(task);
      return result;
    }

    // engine
    if (this.now() < this.openUntil) {
      this.stats.fallbacks++;
      return run(this.pg);
    }
    try {
      const ms = await this.timeoutMs();
      const result = await withTimeout(run(this.engine), ms);
      this.fails = 0;
      return result;
    } catch (e) {
      this.fails++;
      if (this.fails >= BREAKER_FAILS) {
        this.openUntil = this.now() + OPEN_MS;
        this.fails = 0;
      }
      this.stats.fallbacks++;
      this.log.warn(
        `search.engine failed for ${op}, Postgres answers: ${e instanceof Error ? e.message : 'error'}`,
      );
      return run(this.pg);
    }
  }

  private async shadow<T>(
    op: string,
    run: (p: SearchProvider) => Promise<T>,
    pgIds: string[],
    pgMs: number,
  ): Promise<void> {
    const t0 = this.now();
    try {
      const ms = await this.timeoutMs();
      const result = await withTimeout(run(this.engine), ms * 2);
      const engineMs = this.now() - t0;
      const d = diffIds(op, pgIds, idsOf(result));
      this.stats.shadow++;
      const differs = !d.identical;
      if (differs) this.stats.shadowDiff++;
      if (differs || ++this.shadowSeen % LOG_SAMPLE === 0) {
        this.log.log(
          JSON.stringify({ event: 'search.shadow', ...d, pgMs, engineMs }),
        );
      }
    } catch (e) {
      this.stats.shadow++;
      this.log.warn(
        JSON.stringify({
          event: 'search.shadow.error',
          op,
          pgMs,
          engineMs: this.now() - t0,
          error: e instanceof Error ? e.message : 'error',
        }),
      );
    }
  }

  // --- routed ---------------------------------------------------------------

  searchAttorneys(q: string, f: AttorneySearchFilters, max: number) {
    return this.route(
      'attorneys',
      (p) => p.searchAttorneys(q, f, max),
      (r) => r,
    );
  }

  searchPeople(
    q: string,
    f: AttorneySearchFilters,
    max: number,
  ): Promise<{ id: string; role: PersonRole; tier: PersonTier }[]> {
    return this.route(
      'people',
      (p) => p.searchPeople(q, f, max),
      (r) => r.map((x) => x.id),
    );
  }

  searchCasesRanked(
    q: string,
    params: Omit<CaseSearchParams, 'cursor' | 'limit'>,
    max: number,
  ) {
    return this.route(
      'cases',
      (p) => p.searchCasesRanked(q, params, max),
      (r) => r,
    );
  }

  searchPosts(q: string, max: number, f?: PostSearchFilters) {
    return this.route(
      'posts',
      (p) => p.searchPosts(q, max, f),
      (r) => r,
    );
  }

  searchQuestions(text: string) {
    return this.route(
      'questions',
      (p) => p.searchQuestions(text),
      (r) => r,
    );
  }

  searchTags(prefix: string, limit: number) {
    return this.route(
      'tags',
      (p) => p.searchTags(prefix, limit),
      (r) => r,
    );
  }

  // --- always Postgres ------------------------------------------------------

  searchCases(q: string, params: CaseSearchParams) {
    return this.pg.searchCases(q, params);
  }

  suggest(prefix: string, perKind: number) {
    return this.pg.suggest(prefix, perKind);
  }

  practiceMatches(q: string, limit: number) {
    return this.pg.practiceMatches(q, limit);
  }
}

function idsOf(r: unknown): string[] {
  if (!Array.isArray(r)) return [];
  return r.map((x) =>
    typeof x === 'string' ? x : String((x as { id: string }).id),
  );
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, rej) => {
    timer = setTimeout(
      () => rej(new Error(`search engine timeout after ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

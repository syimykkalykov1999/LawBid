import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';
import { EngineError, OpenSearchClient } from './engine/opensearch.client';
import { SearchDocsLoader } from './engine/search-docs.loader';
import { SearchReindexService } from './search-reindex.service';
import {
  MAPPING_VERSION,
  SEARCH_ENTITIES,
  isSearchEntity,
  type SearchEntity,
} from './engine/search-engine.mappings';

/** An event is retried this many times (backoff below), then parked. */
export const MAX_ATTEMPTS = 8;
/** A claimed event is invisible to other workers for this long. */
const LEASE_SECONDS = 120;
/** Parked (failed) events are kept this long for a look, then pruned. */
const FAILED_KEEP_DAYS = 7;
const REINDEX_KEY = 'reindex';
/** One drain call stops taking new batches after this long. */
export const DRAIN_BUDGET_MS = 20_000;

/** Seconds to wait before attempt [n]+1: 10 s, 20 s, 40 s ... capped at 1 h. */
export function backoffSeconds(attempts: number): number {
  return Math.min(3600, 10 * 2 ** Math.max(0, attempts - 1));
}

export interface ReindexState {
  version: number;
  /** Entity being walked; null once every entity is done. */
  entity: SearchEntity | null;
  /** Keyset checkpoint (last id of the previous batch) inside [entity]. */
  after: string | null;
  indexed: number;
  done: boolean;
  startedAt: string;
  finishedAt?: string;
}

export interface ReindexOptions {
  batch?: number;
  /** Stop after this much time (the next call resumes). */
  budgetMs?: number;
  /** Only this entity. */
  entity?: SearchEntity;
  /** Also delete documents of rows that are not searchable (cleans a used
   * index; a fresh one does not need it). */
  deleteMissing?: boolean;
}

interface Claimed {
  id: string;
  entity: string;
  entity_id: string;
  attempts: number;
}

/**
 * Fills and feeds the search engine (owner 2026-10-24, SEARCH_READY.md).
 *  - drain():   the outbox → the engine, in batches, idempotent (documents
 *               are rebuilt from the current rows), with retries and parking.
 *  - reindex(): every searchable row → the engine, keyset by id, resumable
 *               (the checkpoint lives in search_index_state).
 *  - tick():    what the cron job runs: engine off → empty the outbox
 *               (it is normally empty already, the triggers write nothing
 *               while off); engine on → make sure the index is filled for
 *               the current mapping, then drain.
 */
@Injectable()
export class SearchIndexerService {
  private readonly log = new Logger(SearchIndexerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: OpenSearchClient,
    private readonly loader: SearchDocsLoader,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly reindexer?: SearchReindexService,
  ) {}

  async engineOn(): Promise<boolean> {
    const v = await this.settings?.string('search.engine');
    return v === 'shadow' || v === 'engine';
  }

  // --- outbox ---------------------------------------------------------------

  /**
   * The outbox rows are written by triggers on sharded tables, on the
   * physical database that holds the row, so every database is drained in
   * its own context (one database: one plain pass, as before).
   */
  async drain(
    limit = 500,
    budgetMs = DRAIN_BUDGET_MS,
  ): Promise<{ done: number; failed: number }> {
    // One budget for the whole call (S7-5): batches go on while they come
    // back full and time is left; the rest waits for the next minute.
    const deadline = Date.now() + budgetMs;
    let extraMemo: ReturnType<SearchReindexService['extraIndexes']> | undefined;
    const extraOnce = () =>
      (extraMemo ??= this.reindexer?.extraIndexes() ?? Promise.resolve({}));
    const parts = await forEachDatabase(this.prisma, async () => {
      const sum = { done: 0, failed: 0 };
      for (;;) {
        const r = await this.drainHere(limit, extraOnce);
        sum.done += r.done;
        sum.failed += r.failed;
        if (r.claimed < limit || Date.now() >= deadline) return sum;
      }
    });
    return parts.reduce(
      (a, p) => ({ done: a.done + p.done, failed: a.failed + p.failed }),
      { done: 0, failed: 0 },
    );
  }

  private async drainHere(
    limit: number,
    extraOnce: () => ReturnType<SearchReindexService['extraIndexes']>,
  ): Promise<{ done: number; failed: number; claimed: number }> {
    const claimed = await this.prisma.$queryRaw<Claimed[]>`
      WITH due AS (
        SELECT id FROM search_outbox
        WHERE failed_at IS NULL AND next_attempt_at <= now()
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED)
      UPDATE search_outbox o
      SET next_attempt_at = now() + make_interval(secs => ${LEASE_SECONDS}::INT),
          attempts = o.attempts + 1
      FROM due WHERE o.id = due.id
      RETURNING o.id::TEXT AS id, o.entity, o.entity_id::TEXT AS entity_id, o.attempts`;
    if (claimed.length === 0) return { done: 0, failed: 0, claimed: 0 };

    const failures = new Map<string, string>(); // outbox id → reason
    const byEntity = new Map<SearchEntity, Map<string, Claimed[]>>();
    for (const c of claimed) {
      if (!isSearchEntity(c.entity)) {
        failures.set(c.id, `unknown entity ${c.entity}`);
        continue;
      }
      const m = byEntity.get(c.entity) ?? new Map<string, Claimed[]>();
      m.set(c.entity_id, [...(m.get(c.entity_id) ?? []), c]);
      byEntity.set(c.entity, m);
    }

    // Dual-write targets of a running reindex (new generation being built /
    // old one kept warm); deletes always go to EVERY generation (GDPR).
    const extra = (await extraOnce()) ?? {};
    for (const [entity, rows] of byEntity) {
      const ids = [...rows.keys()];
      try {
        const loadedAt = Date.now();
        const docs = await this.loader.load(entity, ids);
        const res = await this.client.bulk(
          ids.map((id) => ({
            entity,
            id,
            doc: docs.get(id) ?? null,
            version: loadedAt,
          })),
          extra,
        );
        const bad = new Map(res.failed.map((f) => [f.id, f.reason]));
        for (const [entityId, events] of rows) {
          const reason = bad.get(entityId);
          if (reason) for (const e of events) failures.set(e.id, reason);
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'indexing failed';
        for (const events of rows.values()) {
          for (const ev of events) failures.set(ev.id, reason);
        }
      }
    }

    const okIds = claimed.filter((c) => !failures.has(c.id)).map((c) => c.id);
    if (okIds.length) {
      await this.prisma.$executeRaw`
        DELETE FROM search_outbox WHERE id = ANY(${okIds}::BIGINT[])`;
    }
    for (const c of claimed) {
      const reason = failures.get(c.id);
      if (reason === undefined) continue;
      const park = c.attempts >= MAX_ATTEMPTS || !isSearchEntity(c.entity);
      await this.prisma.$executeRaw`
        UPDATE search_outbox
        SET last_error = ${reason.slice(0, 500)},
            next_attempt_at = now() + make_interval(secs => ${backoffSeconds(c.attempts)}::INT),
            failed_at = CASE WHEN ${park} THEN now() ELSE NULL END
        WHERE id = ${c.id}::BIGINT`;
    }
    if (failures.size > 0) {
      this.log.warn(
        `search outbox: ${failures.size} of ${claimed.length} events failed (will retry)`,
      );
    }
    return {
      done: okIds.length,
      failed: failures.size,
      claimed: claimed.length,
    };
  }

  /** Engine off: nothing may pile up. Parked events are also aged out. */
  async prune(engineOn: boolean): Promise<number> {
    const parts = await forEachDatabase(this.prisma, () =>
      this.pruneHere(engineOn),
    );
    return parts.reduce((a, n) => a + n, 0);
  }

  private async pruneHere(engineOn: boolean): Promise<number> {
    if (!engineOn) {
      return Number(await this.prisma.$executeRaw`DELETE FROM search_outbox`);
    }
    return Number(
      await this.prisma.$executeRaw`
        DELETE FROM search_outbox
        WHERE failed_at < now() - make_interval(days => ${FAILED_KEEP_DAYS}::INT)`,
    );
  }

  /** Waiting / parked events and the age of the oldest waiting one. */
  async backlog(): Promise<{
    waiting: number;
    parked: number;
    oldestSeconds: number;
  }> {
    const [r] = await this.prisma.$queryRaw<
      { waiting: bigint; parked: bigint; oldest: number | null }[]
    >`
      SELECT count(*) FILTER (WHERE failed_at IS NULL) AS waiting,
             count(*) FILTER (WHERE failed_at IS NOT NULL) AS parked,
             EXTRACT(EPOCH FROM now() - min(created_at)
               FILTER (WHERE failed_at IS NULL))::FLOAT8 AS oldest
      FROM search_outbox`;
    return {
      waiting: Number(r?.waiting ?? 0),
      parked: Number(r?.parked ?? 0),
      oldestSeconds: Math.round(r?.oldest ?? 0),
    };
  }

  // --- reindex --------------------------------------------------------------

  private key(entity?: SearchEntity): string {
    return entity ? `${REINDEX_KEY}:${entity}` : REINDEX_KEY;
  }

  async state(entity?: SearchEntity): Promise<ReindexState | null> {
    const row = await this.prisma.searchIndexState.findUnique({
      where: { key: this.key(entity) },
    });
    return (row?.value as unknown as ReindexState | undefined) ?? null;
  }

  private async save(s: ReindexState, entity?: SearchEntity): Promise<void> {
    const value = s as unknown as Prisma.InputJsonValue;
    const key = this.key(entity);
    await this.prisma.searchIndexState.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  /** Forget progress: the next reindex starts from the first entity. */
  async resetReindex(entity?: SearchEntity): Promise<void> {
    await this.prisma.searchIndexState.deleteMany({
      where: { key: this.key(entity) },
    });
  }

  /**
   * One resumable pass: continues from the checkpoint, stops at [budgetMs]
   * (or when done). Safe to run while the outbox drains: both rebuild
   * documents from current rows, and an event that arrives mid-pass is
   * replayed by the drain.
   */
  async reindex(opts: ReindexOptions = {}): Promise<ReindexState> {
    const batch = Math.max(1, opts.batch ?? 500);
    const deadline = opts.budgetMs ? Date.now() + opts.budgetMs : Infinity;
    const order = opts.entity ? [opts.entity] : [...SEARCH_ENTITIES];
    let st = await this.state(opts.entity);
    if (st && st.version === MAPPING_VERSION && st.done) return st;
    if (!st || st.version !== MAPPING_VERSION) {
      st = {
        version: MAPPING_VERSION,
        entity: order[0],
        after: null,
        indexed: 0,
        done: false,
        startedAt: new Date().toISOString(),
      };
      await this.client.bootstrap();
      await this.save(st, opts.entity);
    }
    while (!st.done && Date.now() < deadline) {
      const entity: SearchEntity = st.entity ?? order[0];
      const ids = await this.loader.idsAfter(entity, st.after, batch);
      if (ids.length === 0) {
        const next: SearchEntity | null =
          order[order.indexOf(entity) + 1] ?? null;
        st = next
          ? { ...st, entity: next, after: null }
          : {
              ...st,
              entity: null,
              after: null,
              done: true,
              finishedAt: new Date().toISOString(),
            };
        await this.save(st, opts.entity);
        continue;
      }
      const loadedAt = Date.now();
      const docs = await this.loader.load(entity, ids);
      const ops = ids
        .filter((id) => opts.deleteMissing || docs.has(id))
        .map((id) => ({
          entity,
          id,
          doc: docs.get(id) ?? null,
          version: loadedAt,
        }));
      const res = await this.client.bulk(
        ops,
        (await this.reindexer?.extraIndexes()) ?? {},
      );
      if (res.failed.length > 0) {
        throw new EngineError(
          `reindex ${entity}: ${res.failed.length} documents rejected (${res.failed[0].reason})`,
        );
      }
      st = {
        ...st,
        entity,
        after: ids[ids.length - 1],
        indexed: st.indexed + docs.size,
      };
      await this.save(st, opts.entity);
    }
    return st;
  }

  // --- the cron job ---------------------------------------------------------

  /** Failed ticks in a row and when the next try is allowed (back-off: a
   * down engine is not hammered every minute; one good tick resets). */
  private tickFails = 0;
  private pausedUntil = 0;

  async tick(
    budgetMs = 20_000,
  ): Promise<{ on: boolean; pruned?: number; drained?: number }> {
    const on = await this.engineOn();
    if (!on) return { on, pruned: await this.prune(false) };
    if (!(await this.client.isConfigured())) {
      this.log.warn('search.engine is on but the engine address is not set');
      return { on };
    }
    if (Date.now() < this.pausedUntil) return { on };
    try {
      // Aliases + first generation (or adopt a pre-alias index). A new
      // mapping does NOT refill by itself any more: the admin starts a
      // zero-downtime reindex (SearchReindexService).
      await this.client.bootstrap();
      const st = await this.state();
      if (!st || !st.done) {
        await this.reindex({ budgetMs });
      }
      const { done } = await this.drain(500, budgetMs);
      await this.prune(true);
      await this.reindexer?.step(budgetMs);
      this.tickFails = 0;
      return { on, drained: done };
    } catch (e) {
      this.tickFails++;
      // 1, 2, 4, 8 ... capped at 10 minutes between tries.
      this.pausedUntil =
        Date.now() + Math.min(600, 2 ** (this.tickFails - 1) * 60) * 1000;
      this.log.warn(
        `search indexer: ${e instanceof Error ? e.message : 'failed'}`,
      );
      return { on };
    }
  }
}

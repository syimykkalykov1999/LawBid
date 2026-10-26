import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EngineError,
  OpenSearchClient,
  type EntityLayout,
} from './engine/opensearch.client';
import { SearchDocsLoader } from './engine/search-docs.loader';
import {
  BUSY_PHASES,
  canRollback,
  canStart,
  canSwapRead,
  canSwapWrite,
  countsAgree,
  dualWriteTargets,
  isDue,
  nextGeneration,
  retainUntil,
  sameDoc,
  sampleAgrees,
  type AliasReindexState,
  type ReindexSource,
  type VerifyEntity,
} from './engine/search-alias';
import {
  MAPPING_VERSION,
  SEARCH_ENTITIES,
  type SearchEntity,
} from './engine/search-engine.mappings';

const STATE_KEY = 'alias-reindex';
const BATCH = 500;
const SAMPLE = 50;
/** Native `_reindex` speed limit, documents per second (0 = unlimited). */
const ENGINE_COPY_RPS = 2000;

/** A refused admin action (wrong phase, failed verification ...). */
export class ReindexRefused extends Error {}

export interface ReindexStatus {
  engineConfigured: boolean;
  state: AliasReindexState | null;
  mappingVersion: number;
  entities: {
    entity: SearchEntity;
    readTarget: string | null;
    writeTarget: string | null;
    mappingOutdated: boolean;
    indexes: {
      name: string;
      generation: number;
      docs: number;
      sizeBytes: number;
      role: 'read' | 'write' | 'read+write' | 'building' | 'rollback' | 'idle';
    }[];
  }[];
  can: { start: boolean; swap: boolean; rollback: boolean };
  /** What the single "Swap" button does now. */
  nextSwap: 'read' | 'write' | null;
}

/**
 * Zero-downtime reindex over native OpenSearch pieces (owner 2026-10-25):
 * index templates (mappings in code), aliases swapped by one atomic
 * `_aliases` call, and either the engine's own `_reindex` task (source
 * `engine`: same document shape, new settings/mapping) or a resumable,
 * throttled backfill from Postgres (source `postgres`: the default, since
 * the database is the truth and the document shape may have changed).
 * Own code is only the state machine and the checks around them.
 */
@Injectable()
export class SearchReindexService {
  private readonly log = new Logger(SearchReindexService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: OpenSearchClient,
    private readonly loader: SearchDocsLoader,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  // --- state ----------------------------------------------------------------

  async state(): Promise<AliasReindexState | null> {
    const row = await this.prisma.searchIndexState.findUnique({
      where: { key: STATE_KEY },
    });
    return (row?.value as unknown as AliasReindexState | undefined) ?? null;
  }

  private async save(s: AliasReindexState): Promise<AliasReindexState> {
    const next = { ...s, updatedAt: new Date().toISOString() };
    const value = next as unknown as Prisma.InputJsonValue;
    await this.prisma.searchIndexState.upsert({
      where: { key: STATE_KEY },
      create: { key: STATE_KEY, value },
      update: { value },
    });
    return next;
  }

  /** Dual-write targets for the indexer (empty when nothing is running). */
  async extraIndexes(): Promise<Partial<Record<SearchEntity, string[]>>> {
    return dualWriteTargets(await this.state());
  }

  private async keepDays(): Promise<number> {
    return (await this.settings?.number('search.reindex_keep_days')) ?? 7;
  }
  private async throttleMs(): Promise<number> {
    return (await this.settings?.number('search.reindex_throttle_ms')) ?? 200;
  }

  // --- status for the admin page / CLI ---------------------------------------

  async status(): Promise<ReindexStatus> {
    const state = await this.state();
    if (!(await this.client.isConfigured())) {
      return {
        engineConfigured: false,
        state,
        mappingVersion: MAPPING_VERSION,
        entities: [],
        can: { start: false, swap: false, rollback: false },
        nextSwap: null,
      };
    }
    const layout = await this.client.layout();
    const entities = await Promise.all(
      layout.map(async (l) => {
        const t = state?.targets[l.entity];
        const mv = l.readTarget
          ? ((await this.client.mappingVersion(l.readTarget)) ?? 1)
          : MAPPING_VERSION;
        return {
          entity: l.entity,
          readTarget: l.readTarget,
          writeTarget: l.writeTarget,
          mappingOutdated: mv < MAPPING_VERSION,
          indexes: l.indexes.map((i) => {
            const r = i.name === l.readTarget;
            const w = i.name === l.writeTarget;
            const warm = state?.phase === 'write_swapped' && i.name === t?.prev;
            const role: ReindexStatus['entities'][number]['indexes'][number]['role'] =
              r && w
                ? 'read+write'
                : r
                  ? 'read'
                  : w
                    ? 'write'
                    : t?.index === i.name &&
                        state &&
                        BUSY_PHASES.includes(state.phase)
                      ? 'building'
                      : warm
                        ? 'rollback'
                        : 'idle';
            return {
              name: i.name,
              generation: i.generation,
              docs: i.docs,
              sizeBytes: i.sizeBytes,
              role,
            };
          }),
        };
      }),
    );
    return {
      engineConfigured: true,
      state,
      mappingVersion: MAPPING_VERSION,
      entities,
      can: {
        start: canStart(state),
        swap: canSwapRead(state) || canSwapWrite(state),
        rollback: canRollback(state),
      },
      nextSwap: canSwapRead(state)
        ? 'read'
        : canSwapWrite(state)
          ? 'write'
          : null,
    };
  }

  // --- start ----------------------------------------------------------------

  async start(
    source: ReindexSource = 'postgres',
    only?: SearchEntity,
  ): Promise<AliasReindexState> {
    const prev = await this.state();
    if (!canStart(prev)) {
      throw new ReindexRefused(
        `A reindex is already ${prev?.phase}; swap, roll back or wait for it.`,
      );
    }
    if (!(await this.client.isConfigured())) {
      throw new ReindexRefused('The search engine address is not set.');
    }
    const mode = await this.settings?.string('search.engine');
    if (mode !== 'shadow' && mode !== 'engine') {
      throw new ReindexRefused(
        'Set search.engine to shadow or engine first: the change log (outbox) is only written then, and the new index would miss changes made while it builds.',
      );
    }
    await this.client.bootstrap();
    const layout = await this.client.layout();
    const entities = only ? [only] : [...SEARCH_ENTITIES];
    const discard = [...(prev?.discard ?? [])];
    if (prev?.phase === 'write_swapped') {
      // Starting again ends the rollback window of the previous run.
      for (const e of prev.entities) {
        const old = prev.targets[e]?.prev;
        if (old) discard.push({ index: old, after: new Date().toISOString() });
      }
    }
    const targets: AliasReindexState['targets'] = {};
    for (const l of layout) {
      if (!entities.includes(l.entity)) continue;
      const generation = nextGeneration(l);
      const index = await this.client.createGeneration(l.entity, generation);
      targets[l.entity] = { index, prev: l.readTarget };
    }
    const now = new Date().toISOString();
    return this.save({
      id: randomUUID(),
      phase: 'building',
      source,
      startedAt: now,
      updatedAt: now,
      entities,
      targets,
      progress: {
        entity: entities[0],
        after: null,
        indexed: 0,
        task: null,
        taskTotal: 0,
        taskDone: 0,
      },
      verify: null,
      discard,
      error: null,
    });
  }

  // --- build (called by the cron job and the CLI) -----------------------------

  /** Advances the build for at most [budgetMs]; also does the clean-up. */
  async step(budgetMs = 20_000): Promise<AliasReindexState | null> {
    let s = await this.state();
    if (!s) return null;
    try {
      if (s.phase === 'building') {
        s =
          s.source === 'engine'
            ? await this.stepEngine(s)
            : await this.stepPostgres(s, budgetMs);
      }
      s = await this.cleanup(s);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'reindex step failed';
      this.log.warn(`search reindex: ${msg}`);
      // Re-read: the loop may have saved checkpoints before it failed.
      s = await this.save({
        ...((await this.state()) ?? s),
        error: msg.slice(0, 300),
      });
    }
    return s;
  }

  private nextEntity(s: AliasReindexState): SearchEntity | null {
    const i = s.progress.entity ? s.entities.indexOf(s.progress.entity) : -1;
    return s.entities[i + 1] ?? null;
  }

  private async finishBuild(s: AliasReindexState): Promise<AliasReindexState> {
    return this.save({
      ...s,
      phase: 'built',
      error: null,
      progress: { ...s.progress, entity: null, after: null, task: null },
    });
  }

  private async stepPostgres(
    s: AliasReindexState,
    budgetMs: number,
  ): Promise<AliasReindexState> {
    const deadline = Date.now() + budgetMs;
    const throttle = await this.throttleMs();
    while (s.phase === 'building' && Date.now() < deadline) {
      const entity = s.progress.entity;
      const target = entity ? s.targets[entity] : undefined;
      if (!entity || !target) return this.finishBuild(s);
      const ids = await this.loader.idsAfter(entity, s.progress.after, BATCH);
      if (ids.length === 0) {
        const next = this.nextEntity(s);
        s = next
          ? await this.save({
              ...s,
              error: null,
              progress: { ...s.progress, entity: next, after: null },
            })
          : await this.finishBuild(s);
        continue;
      }
      const loadedAt = Date.now();
      const docs = await this.loader.load(entity, ids);
      const res = await this.client.bulkInto(
        target.index,
        ids
          .filter((id) => docs.has(id))
          .map((id) => ({
            entity,
            id,
            doc: docs.get(id) ?? null,
            version: loadedAt,
          })),
      );
      if (res.failed.length > 0) {
        throw new EngineError(
          `backfill ${entity}: ${res.failed.length} documents rejected (${res.failed[0].reason})`,
        );
      }
      s = await this.save({
        ...s,
        error: null,
        progress: {
          ...s.progress,
          after: ids[ids.length - 1],
          indexed: s.progress.indexed + docs.size,
        },
      });
      if (throttle > 0) await new Promise((r) => setTimeout(r, throttle));
    }
    return s;
  }

  /** Native `_reindex` task per entity: start, poll on each tick. */
  private async stepEngine(s: AliasReindexState): Promise<AliasReindexState> {
    const entity = s.progress.entity;
    const target = entity ? s.targets[entity] : undefined;
    if (!entity || !target) return this.finishBuild(s);
    if (!target.prev) {
      throw new EngineError(`${entity} has no source index to copy`);
    }
    if (!s.progress.task) {
      const task = await this.client.startReindexTask(
        target.prev,
        target.index,
        ENGINE_COPY_RPS,
      );
      return this.save({
        ...s,
        error: null,
        progress: { ...s.progress, task, taskTotal: 0, taskDone: 0 },
      });
    }
    const t = await this.client.reindexTask(s.progress.task);
    if (!t.completed) {
      return this.save({
        ...s,
        progress: { ...s.progress, taskTotal: t.total, taskDone: t.done },
      });
    }
    if (t.error) {
      // Start the copy of this entity again on the next tick.
      return this.save({
        ...s,
        error: t.error,
        progress: { ...s.progress, task: null },
      });
    }
    const next = this.nextEntity(s);
    const done = {
      ...s,
      error: null,
      progress: {
        ...s.progress,
        indexed: s.progress.indexed + t.done,
        task: null,
        taskTotal: 0,
        taskDone: 0,
      },
    };
    return next
      ? this.save({ ...done, progress: { ...done.progress, entity: next } })
      : this.finishBuild(done);
  }

  // --- verify ---------------------------------------------------------------

  /**
   * Counts (live vs new, ±max(5, 1 %)) and a random sample of both sides
   * checked against the database: every sampled document of the new index
   * must equal the one built from the current row (a document of a row that
   * is gone or hidden counts as wrong: it must not be there), and sampled
   * database rows must be present.
   */
  async verify(): Promise<AliasReindexState> {
    const s = await this.requireState();
    if (s.phase !== 'built' && s.phase !== 'building') {
      throw new ReindexRefused(`Nothing to verify in phase ${s.phase}.`);
    }
    const layout = new Map(
      (await this.client.layout()).map((l) => [l.entity, l]),
    );
    const out: Partial<Record<SearchEntity, VerifyEntity>> = {};
    for (const e of s.entities) {
      const t = s.targets[e];
      if (!t) continue;
      out[e] = await this.verifyEntity(e, t.index, layout.get(e));
    }
    const ok = Object.values(out).every((v) => v?.ok);
    return this.save({
      ...s,
      verify: { ok, at: new Date().toISOString(), entities: out },
    });
  }

  private async verifyEntity(
    entity: SearchEntity,
    next: string,
    l: EntityLayout | undefined,
  ): Promise<VerifyEntity> {
    const live = l?.readTarget ? await this.client.countIndex(l.readTarget) : 0;
    const count = await this.client.countIndex(next);
    let mismatched = 0;
    let sampled = 0;
    // (a) sample of the new index → must equal the database truth.
    const fromIndex = await this.client.sample(next, SAMPLE);
    const truth = await this.loader.load(
      entity,
      fromIndex.map((x) => x.id),
    );
    for (const x of fromIndex) {
      sampled++;
      const t = truth.get(x.id);
      if (!t || !sameDoc(t, x.doc)) mismatched++;
    }
    // (b) sample of the database → must be in the new index.
    const ids = await this.loader.sampleIds(entity, SAMPLE);
    const rows = await this.loader.load(entity, ids);
    const there = await this.client.getDocs(next, [...rows.keys()]);
    for (const id of rows.keys()) {
      sampled++;
      if (!there.has(id)) mismatched++;
    }
    const agreeCount = countsAgree(live, count);
    const agreeSample = sampleAgrees(sampled, mismatched);
    return {
      live,
      next: count,
      sampled,
      mismatched,
      ok: agreeCount && agreeSample,
      note: !agreeCount
        ? 'document counts differ'
        : !agreeSample
          ? 'sampled documents differ from the database'
          : undefined,
    };
  }

  // --- swaps and rollback -----------------------------------------------------

  private async requireState(): Promise<AliasReindexState> {
    const s = await this.state();
    if (!s) throw new ReindexRefused('No reindex has been started.');
    return s;
  }

  /** The Swap button: first the read alias, then (later) the write alias. */
  async swap(): Promise<AliasReindexState> {
    const s = await this.state();
    if (canSwapRead(s)) return this.swapRead();
    if (canSwapWrite(s)) return this.swapWrite();
    throw new ReindexRefused('Nothing to swap now.');
  }

  /** Verifies again, then moves the read alias of every entity at once. */
  async swapRead(): Promise<AliasReindexState> {
    let s = await this.requireState();
    if (!canSwapRead(s)) {
      throw new ReindexRefused(`Cannot swap reads in phase ${s.phase}.`);
    }
    s = await this.verify();
    if (!s.verify?.ok) {
      throw new ReindexRefused(
        'Verification failed: ' +
          Object.entries(s.verify?.entities ?? {})
            .filter(([, v]) => !v?.ok)
            .map(([e, v]) => `${e} (${v?.note ?? 'differs'})`)
            .join(', '),
      );
    }
    const layout = new Map(
      (await this.client.layout()).map((l) => [l.entity, l]),
    );
    await this.client.swap(
      s.entities.flatMap((entity) => {
        const to = s.targets[entity]?.index;
        return to
          ? [
              {
                entity,
                which: 'read' as const,
                from: layout.get(entity)?.readTarget ?? null,
                to,
              },
            ]
          : [];
      }),
    );
    return this.save({
      ...s,
      phase: 'read_swapped',
      readSwappedAt: new Date().toISOString(),
      error: null,
    });
  }

  /** Moves the write alias; the old generation then keeps receiving writes
   * (dual-write) until its keep window ends, so a rollback is lossless. */
  async swapWrite(): Promise<AliasReindexState> {
    const s = await this.requireState();
    if (!canSwapWrite(s)) {
      throw new ReindexRefused(`Cannot swap writes in phase ${s.phase}.`);
    }
    const layout = new Map(
      (await this.client.layout()).map((l) => [l.entity, l]),
    );
    await this.client.swap(
      s.entities.flatMap((entity) => {
        const to = s.targets[entity]?.index;
        return to
          ? [
              {
                entity,
                which: 'write' as const,
                from: layout.get(entity)?.writeTarget ?? null,
                to,
              },
            ]
          : [];
      }),
    );
    const now = new Date();
    return this.save({
      ...s,
      phase: 'write_swapped',
      writeSwappedAt: now.toISOString(),
      retainUntil: retainUntil(now, await this.keepDays()),
      error: null,
    });
  }

  /**
   * Back to the previous generation. Before any swap it simply cancels the
   * build (the new index is deleted); after a swap the aliases go back in
   * one atomic call and the new generation is deleted after the keep window.
   */
  async rollback(): Promise<AliasReindexState> {
    const s = await this.requireState();
    if (!canRollback(s)) {
      throw new ReindexRefused(`Nothing to roll back in phase ${s.phase}.`);
    }
    if (s.progress.task) await this.client.cancelReindexTask(s.progress.task);
    const layout = new Map(
      (await this.client.layout()).map((l) => [l.entity, l]),
    );
    const back: Parameters<OpenSearchClient['swap']>[0] = [];
    for (const entity of s.entities) {
      const t = s.targets[entity];
      const l = layout.get(entity);
      if (!t?.prev) continue;
      if (l?.readTarget === t.index) {
        back.push({ entity, which: 'read', from: t.index, to: t.prev });
      }
      if (l?.writeTarget === t.index) {
        back.push({ entity, which: 'write', from: t.index, to: t.prev });
      }
    }
    await this.client.swap(back);
    const cancelled = s.phase === 'building' || s.phase === 'built';
    const discard = [...s.discard];
    const keep = cancelled ? 0 : await this.keepDays();
    for (const entity of s.entities) {
      const t = s.targets[entity];
      if (t) {
        discard.push({
          index: t.index,
          after: retainUntil(new Date(), keep),
        });
      }
    }
    return this.cleanup(
      await this.save({
        ...s,
        phase: cancelled ? 'cancelled' : 'rolled_back',
        discard,
        error: null,
      }),
    );
  }

  // --- clean-up --------------------------------------------------------------

  /** Deletes generations whose keep window is over. */
  async cleanup(s: AliasReindexState): Promise<AliasReindexState> {
    const now = new Date();
    let next = s;
    if (s.phase === 'write_swapped' && isDue(s.retainUntil, now)) {
      const discard = [...s.discard];
      for (const e of s.entities) {
        const old = s.targets[e]?.prev;
        if (old) discard.push({ index: old, after: now.toISOString() });
      }
      next = await this.save({ ...s, phase: 'completed', discard });
    }
    if (next.discard.length === 0) return next;
    const keep: AliasReindexState['discard'] = [];
    for (const d of next.discard) {
      if (!isDue(d.after, now)) {
        keep.push(d);
        continue;
      }
      try {
        await this.client.deleteIndex(d.index);
      } catch (e) {
        this.log.warn(
          `search reindex: cannot delete ${d.index}: ${e instanceof Error ? e.message : 'error'}`,
        );
        keep.push(d);
      }
    }
    if (keep.length === next.discard.length) return next;
    return this.save({ ...next, discard: keep });
  }
}

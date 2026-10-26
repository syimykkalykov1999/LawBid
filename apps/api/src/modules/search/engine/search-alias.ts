import { isDeepStrictEqual } from 'node:util';
import type { EntityLayout } from './opensearch.client';
import type { SearchEntity } from './search-engine.mappings';

/**
 * The pure rules of the zero-downtime reindex (owner 2026-10-25). The
 * service (search-reindex.service.ts) only does I/O around these.
 *
 *   building ──► built ──► read_swapped ──► write_swapped ──► completed
 *      │           │            │                 │
 *      └───────────┴────────────┴─────────────────┴──► rolled_back / cancelled
 */
export type ReindexPhase =
  | 'building'
  | 'built'
  | 'read_swapped'
  | 'write_swapped'
  | 'completed'
  | 'rolled_back'
  | 'cancelled';

export type ReindexSource = 'postgres' | 'engine';

export interface TargetInfo {
  /** The new generation. */
  index: string;
  /** What the aliases pointed at when the reindex started. */
  prev: string | null;
}

export interface VerifyEntity {
  live: number;
  next: number;
  sampled: number;
  mismatched: number;
  ok: boolean;
  note?: string;
}

export interface ReindexProgress {
  entity: SearchEntity | null;
  /** Keyset checkpoint inside [entity] (postgres source). */
  after: string | null;
  indexed: number;
  /** Engine-side `_reindex` task (engine source). */
  task: string | null;
  taskTotal: number;
  taskDone: number;
}

export interface AliasReindexState {
  id: string;
  phase: ReindexPhase;
  source: ReindexSource;
  startedAt: string;
  updatedAt: string;
  entities: SearchEntity[];
  targets: Partial<Record<SearchEntity, TargetInfo>>;
  progress: ReindexProgress;
  verify: {
    ok: boolean;
    at: string;
    entities: Partial<Record<SearchEntity, VerifyEntity>>;
  } | null;
  readSwappedAt?: string;
  writeSwappedAt?: string;
  /** Old generations are deleted after this moment (write_swapped). */
  retainUntil?: string;
  /** Indexes waiting to be deleted: rolled-back / superseded generations. */
  discard: { index: string; after: string }[];
  error: string | null;
}

/** Phases in which a second reindex may not start. */
export const BUSY_PHASES: readonly ReindexPhase[] = [
  'building',
  'built',
  'read_swapped',
];

export function canStart(state: AliasReindexState | null): boolean {
  return !state || !BUSY_PHASES.includes(state.phase);
}

export function canSwapRead(s: AliasReindexState | null): boolean {
  return s?.phase === 'built';
}
export function canSwapWrite(s: AliasReindexState | null): boolean {
  return s?.phase === 'read_swapped';
}
export function canRollback(s: AliasReindexState | null): boolean {
  return (
    !!s &&
    (
      ['building', 'built', 'read_swapped', 'write_swapped'] as string[]
    ).includes(s.phase)
  );
}

/** Next generation number of an entity: one above the highest that exists. */
export function nextGeneration(l: EntityLayout): number {
  return l.indexes.reduce((m, i) => Math.max(m, i.generation), 0) + 1;
}

/**
 * Extra indexes every index write must also reach (dual-write):
 *  - while a generation is being built / is built / only the read alias moved:
 *    the new generation;
 *  - after the write alias moved: the previous generation, so a rollback
 *    within the keep window finds fresh data.
 */
export function dualWriteTargets(
  s: AliasReindexState | null,
): Partial<Record<SearchEntity, string[]>> {
  const out: Partial<Record<SearchEntity, string[]>> = {};
  if (!s) return out;
  for (const e of s.entities) {
    const t = s.targets[e];
    if (!t) continue;
    if (
      s.phase === 'building' ||
      s.phase === 'built' ||
      s.phase === 'read_swapped'
    ) {
      out[e] = [t.index];
    } else if (s.phase === 'write_swapped' && t.prev) {
      out[e] = [t.prev];
    }
  }
  return out;
}

/** Counts agree when they differ by at most max(5, 1 %). */
export function countsAgree(live: number, next: number): boolean {
  const tol = Math.max(5, Math.ceil(Math.max(live, next) * 0.01));
  return Math.abs(live - next) <= tol;
}

/** Arrays of scalars are sets for us (array_agg order is not stable). */
export function normalizeDoc(v: unknown): unknown {
  if (Array.isArray(v)) {
    const items = v.map(normalizeDoc);
    return items.every((x) => x === null || typeof x !== 'object')
      ? [...items].sort((a, b) => String(a).localeCompare(String(b)))
      : items;
  }
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, normalizeDoc(x)]),
    );
  }
  return v;
}

export function sameDoc(a: unknown, b: unknown): boolean {
  return isDeepStrictEqual(
    normalizeDoc(JSON.parse(JSON.stringify(a))),
    normalizeDoc(JSON.parse(JSON.stringify(b))),
  );
}

/** Up to 2 % of the sampled documents may differ (writes in flight). */
export function sampleAgrees(sampled: number, mismatched: number): boolean {
  return mismatched <= Math.floor(sampled * 0.02);
}

export function retainUntil(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export function isDue(iso: string | undefined, now: Date): boolean {
  return !!iso && new Date(iso).getTime() <= now.getTime();
}

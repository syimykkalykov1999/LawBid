import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OpsStateService } from '../../common/ops/ops-state.service';
import type { BloatSnapshot } from '../../common/ops/ops.constants';

/** The busiest tables: the ones whose bloat would show first. */
export const BLOAT_HOT_TABLES: readonly string[] = [
  'messages',
  'notifications',
  'posts',
  'sessions',
  'search_outbox',
  'cross_family_outbox',
];
/** Health light turns yellow above this share of wasted space. */
export const BLOAT_WARN_PERCENT = 30;
/** Small tables are never worth a repack, whatever their ratio. */
export const BLOAT_MIN_BYTES = 64 * 1024 * 1024;
/** pgstatindex reads the whole index: skip the really big ones. */
const INDEX_SCAN_MAX_BYTES = 512 * 1024 * 1024;
/** A fresh btree leaf is ~90 % full (fillfactor 90). */
const BTREE_FILLFACTOR = 90;

/**
 * Nightly bloat measurement of the hot tables (owner 2026-10-25, online DDL).
 * Uses the PostgreSQL `pgstattuple` extension (pgstattuple_approx for tables:
 * a visibility-map assisted estimate that does not read the whole table;
 * pgstatindex for btree indexes, https://www.postgresql.org/docs/current/
 * pgstattuple.html). Without the extension (nobody ran CREATE EXTENSION yet)
 * it falls back to the dead-tuple ratio of pg_stat_user_tables, which only
 * sees dead rows, not free space. Result goes to Redis for the «database»
 * light; nothing is repacked automatically (docs/runbooks/pg-repack.md).
 */
@Injectable()
export class DbBloatJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: OpsStateService,
  ) {}

  async run(): Promise<BloatSnapshot> {
    const ext = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'pgstattuple'`;
    const hasExt = (ext[0]?.n ?? 0) > 0;
    const tables: BloatSnapshot['tables'] = [];
    for (const table of BLOAT_HOT_TABLES) {
      const t = await this.measure(table, hasExt);
      if (t) tables.push(t);
    }
    const snap: BloatSnapshot = {
      at: new Date().toISOString(),
      source: hasExt ? 'pgstattuple' : 'stats',
      warnPercent: BLOAT_WARN_PERCENT,
      tables,
      over: tables
        .filter((t) => t.sizeBytes >= BLOAT_MIN_BYTES)
        .filter(
          (t) =>
            t.bloatPercent > BLOAT_WARN_PERCENT ||
            (t.worstIndexBloatPercent ?? 0) > BLOAT_WARN_PERCENT,
        )
        .map((t) => t.table),
    };
    await this.state.setBloat(snap);
    return snap;
  }

  private async measure(
    table: string,
    hasExt: boolean,
  ): Promise<BloatSnapshot['tables'][number] | null> {
    const size = await this.prisma.$queryRaw<{ heap: bigint | null }[]>`
      SELECT pg_table_size(to_regclass(${'public.' + table}))::bigint AS heap`;
    const heap = size[0]?.heap;
    if (heap === null || heap === undefined) return null; // table does not exist here
    const sizeBytes = Number(heap);
    let bloatPercent = 0;
    let worstIndex: string | undefined;
    let worstIndexBloatPercent: number | undefined;
    if (hasExt && sizeBytes >= BLOAT_MIN_BYTES) {
      const r = await this.prisma.$queryRaw<{ dead: number; free: number }[]>`
        SELECT dead_tuple_percent::float8 AS dead, approx_free_percent::float8 AS free
        FROM pgstattuple_approx(to_regclass(${'public.' + table}))`;
      bloatPercent = (r[0]?.dead ?? 0) + (r[0]?.free ?? 0);
      const idx = await this.prisma.$queryRaw<
        { name: string; density: number }[]
      >`
        SELECT c.relname AS name, (pgstatindex(c.oid::regclass)).avg_leaf_density::float8 AS density
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_am am ON am.oid = c.relam AND am.amname = 'btree'
        WHERE i.indrelid = to_regclass(${'public.' + table}) AND i.indisvalid
          AND pg_relation_size(c.oid) BETWEEN ${BLOAT_MIN_BYTES / 8} AND ${INDEX_SCAN_MAX_BYTES}`;
      for (const i of idx) {
        const b = Math.max(
          0,
          ((BTREE_FILLFACTOR - i.density) / BTREE_FILLFACTOR) * 100,
        );
        if (
          worstIndexBloatPercent === undefined ||
          b > worstIndexBloatPercent
        ) {
          worstIndex = i.name;
          worstIndexBloatPercent = b;
        }
      }
    } else {
      const r = await this.prisma.$queryRaw<{ live: bigint; dead: bigint }[]>`
        SELECT n_live_tup::bigint AS live, n_dead_tup::bigint AS dead
        FROM pg_stat_user_tables WHERE relid = to_regclass(${'public.' + table})`;
      const live = Number(r[0]?.live ?? 0);
      const dead = Number(r[0]?.dead ?? 0);
      bloatPercent = live + dead > 0 ? (dead / (live + dead)) * 100 : 0;
    }
    return {
      table,
      sizeBytes,
      bloatPercent: Math.round(bloatPercent * 10) / 10,
      ...(worstIndex !== undefined
        ? {
            worstIndex,
            worstIndexBloatPercent:
              Math.round((worstIndexBloatPercent ?? 0) * 10) / 10,
          }
        : {}),
    };
  }
}

import { Injectable, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
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
/** A fresh btree leaf is ~90 % full (fillfactor 90). */
const BTREE_FILLFACTOR = 90;
/** Usable bytes of an 8 kB btree page (page header 24 + special 16). */
const BTREE_PAGE_USABLE = 8192 - 24 - 16;
/** Per index entry: IndexTuple header 8 + line pointer 4. */
const BTREE_ENTRY_OVERHEAD = 12;
/** Default of `db.bloat_scan_max_mb`: heap estimate pass only up to this size. */
export const BLOAT_SCAN_MAX_MB = 256;
/** «Авто»: the heap estimate runs only when the stats show this dead share. */
export const BLOAT_AUTO_DEAD_PERCENT = 10;

export type DbBloatMode = 'off' | 'on' | 'auto';

/**
 * Index bloat WITHOUT reading the index (perf review 2026-10-26, R-25:
 * pgstatindex read whole indexes, up to tens of GB a night). The expected
 * size comes from the planner statistics (pg_class.reltuples and pg_stats
 * avg_width of the key columns), the same idea as the widely used
 * ioguix/pgsql-bloat-estimation query; bloat = share of the real size above
 * it. Expression / partial index columns without stats count as 8 bytes.
 */
export function btreeBloatPercent(
  bytes: number,
  tuples: number,
  keyWidth: number,
): number {
  if (bytes <= 0 || tuples <= 0) return 0;
  const entry = BTREE_ENTRY_OVERHEAD + Math.ceil(Math.max(keyWidth, 1) / 8) * 8;
  const perPage = Math.floor(
    (BTREE_PAGE_USABLE * BTREE_FILLFACTOR) / 100 / entry,
  );
  const expected = (Math.ceil(tuples / Math.max(perPage, 1)) + 1) * 8192;
  return Math.max(0, (1 - expected / bytes) * 100);
}

/**
 * Nightly bloat measurement of the hot tables (owner 2026-10-25, online DDL).
 * Bounded (perf review 2026-10-26, R-25):
 *  - indexes are estimated from statistics, never read (btreeBloatPercent);
 *  - the heap estimate `pgstattuple_approx` (visibility-map assisted, reads
 *    only pages that are not all-visible, https://www.postgresql.org/docs/
 *    current/pgstattuple.html) runs only for tables up to
 *    `db.bloat_scan_max_mb` (256 MB) and, in «Авто», only when
 *    pg_stat_user_tables already shows ≥ 10 % dead rows; otherwise the
 *    dead-row ratio of the statistics is the answer;
 *  - `db.bloat_mode` Выкл / Вкл / Авто (default Авто) and the «Пауза тяжёлых
 *    задач» switch (it is in HEAVY_CRON_JOBS) stop it.
 * Without the extension it uses the statistics only. Result goes to Redis
 * for the «database» light; nothing is repacked automatically
 * (docs/runbooks/pg-repack.md).
 */
@Injectable()
export class DbBloatJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: OpsStateService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  private async mode(): Promise<DbBloatMode> {
    try {
      const v = await this.settings?.string('db.bloat_mode');
      return v === 'off' || v === 'on' ? v : 'auto';
    } catch {
      return 'auto';
    }
  }

  private async scanMaxBytes(): Promise<number> {
    let mb = BLOAT_SCAN_MAX_MB;
    try {
      const v = await this.settings?.number('db.bloat_scan_max_mb');
      if (v !== undefined && Number.isFinite(v) && v >= 0) mb = v;
    } catch {
      mb = BLOAT_SCAN_MAX_MB;
    }
    return mb * 1024 * 1024;
  }

  async run(): Promise<BloatSnapshot | { skipped: 'mode_off' }> {
    const mode = await this.mode();
    if (mode === 'off') return { skipped: 'mode_off' };
    const scanMax = await this.scanMaxBytes();
    const ext = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'pgstattuple'`;
    const hasExt = (ext[0]?.n ?? 0) > 0;
    const tables: BloatSnapshot['tables'] = [];
    for (const table of BLOAT_HOT_TABLES) {
      const t = await this.measure(table, hasExt, mode, scanMax);
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
    mode: DbBloatMode,
    scanMax: number,
  ): Promise<BloatSnapshot['tables'][number] | null> {
    const size = await this.prisma.$queryRaw<{ heap: bigint | null }[]>`
      SELECT pg_table_size(to_regclass(${'public.' + table}))::bigint AS heap`;
    const heap = size[0]?.heap;
    if (heap === null || heap === undefined) return null; // table does not exist here
    const sizeBytes = Number(heap);
    const st = await this.prisma.$queryRaw<{ live: bigint; dead: bigint }[]>`
      SELECT n_live_tup::bigint AS live, n_dead_tup::bigint AS dead
      FROM pg_stat_user_tables WHERE relid = to_regclass(${'public.' + table})`;
    const live = Number(st[0]?.live ?? 0);
    const dead = Number(st[0]?.dead ?? 0);
    const deadPercent = live + dead > 0 ? (dead / (live + dead)) * 100 : 0;
    let bloatPercent = deadPercent;
    let worstIndex: string | undefined;
    let worstIndexBloatPercent: number | undefined;
    if (sizeBytes >= BLOAT_MIN_BYTES) {
      const scanHeap =
        hasExt &&
        sizeBytes <= scanMax &&
        (mode === 'on' || deadPercent >= BLOAT_AUTO_DEAD_PERCENT);
      if (scanHeap) {
        const r = await this.prisma.$queryRaw<{ dead: number; free: number }[]>`
          SELECT dead_tuple_percent::float8 AS dead, approx_free_percent::float8 AS free
          FROM pgstattuple_approx(to_regclass(${'public.' + table}))`;
        bloatPercent = (r[0]?.dead ?? 0) + (r[0]?.free ?? 0);
      }
      // Catalog + pg_stats only: no index page is read.
      const idx = await this.prisma.$queryRaw<
        { name: string; bytes: number; tuples: number; width: number }[]
      >`
        SELECT c.relname AS name, pg_relation_size(c.oid)::float8 AS bytes,
               GREATEST(c.reltuples, 0)::float8 AS tuples,
               (SELECT COALESCE(sum(COALESCE(s.avg_width, 8)), 8)
                  FROM unnest(i.indkey::int2[]) AS k(attnum)
                  LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                  LEFT JOIN pg_stats s ON s.schemaname = 'public' AND s.tablename = ${table}
                                      AND s.attname = a.attname)::float8 AS width
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_am am ON am.oid = c.relam AND am.amname = 'btree'
        WHERE i.indrelid = to_regclass(${'public.' + table}) AND i.indisvalid
          AND pg_relation_size(c.oid) >= ${BLOAT_MIN_BYTES / 8}`;
      for (const i of idx) {
        const b = btreeBloatPercent(i.bytes, i.tuples, i.width);
        if (
          worstIndexBloatPercent === undefined ||
          b > worstIndexBloatPercent
        ) {
          worstIndex = i.name;
          worstIndexBloatPercent = b;
        }
      }
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

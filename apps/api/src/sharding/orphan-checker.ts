import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { MoveDbPool } from './move/move-db';
import type { MoveDb } from './move/move-db';
import { CrossFamilyEdge, crossFamilyEdges } from './move/move-plan';
import { q } from './move/move-sql';
import { isShardedModel } from './shard-manifest';

/**
 * Shard-ready step 9: the application-level replacement of the dropped
 * cross-family foreign keys. Nightly (cron `shard.orphan-check`) it looks,
 * for every dropped edge (child.column -> parent.id), at the distinct
 * values of the child column on every database and asks the database(s)
 * that can hold the parent whether the id exists. Missing ones are logged
 * as `{metric:"cross_family_orphans"}` at error level (the alert log) and
 * kept in Redis for the admin screen. It only reads.
 *
 * Bounded: at most `maxValuesPerEdge` distinct values per edge and database
 * per run, walking the column in key order from a cursor kept in Redis, so
 * a huge table is covered over several nights without a long scan.
 */
export interface OrphanEdgeResult {
  edge: string;
  database: string;
  checked: number;
  orphans: number;
  sample: string[];
  truncated: boolean;
}
export interface OrphanReport {
  at: string;
  totalOrphans: number;
  edges: OrphanEdgeResult[];
}

export const ORPHAN_LAST_KEY = 'lawbid:orphan-check:last';
const CURSOR_PREFIX = 'lawbid:orphan-check:cursor:';

export interface OrphanOptions {
  pageSize: number;
  maxValuesPerEdge: number;
}

@Injectable()
export class OrphanChecker {
  private readonly log = new Logger('OrphanChecker');

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional() private readonly pool: MoveDbPool = new MoveDbPool(),
  ) {}

  async run(opts: Partial<OrphanOptions> = {}): Promise<OrphanReport> {
    const report = await this.check(
      this.pool.keys().map((k) => this.pool.get(k)),
      crossFamilyEdges(),
      {
        pageSize: opts.pageSize ?? 2000,
        maxValuesPerEdge:
          opts.maxValuesPerEdge ??
          Number(process.env.ORPHAN_CHECK_MAX_VALUES ?? 100_000),
      },
    );
    if (report.totalOrphans > 0) {
      this.log.error(
        JSON.stringify({
          metric: 'cross_family_orphans',
          total: report.totalOrphans,
          edges: report.edges
            .filter((e) => e.orphans > 0)
            .map((e) => ({
              edge: e.edge,
              db: e.database,
              orphans: e.orphans,
              sample: e.sample,
            })),
        }),
      );
    } else {
      this.log.log(
        JSON.stringify({ metric: 'cross_family_orphans', total: 0 }),
      );
    }
    await this.redis
      ?.set(ORPHAN_LAST_KEY, JSON.stringify(report), 'EX', 3 * 86_400)
      .catch(() => undefined);
    return report;
  }

  async last(): Promise<OrphanReport | null> {
    try {
      const raw = await this.redis?.get(ORPHAN_LAST_KEY);
      return raw ? (JSON.parse(raw) as OrphanReport) : null;
    } catch {
      return null;
    }
  }

  /** Testable core: databases and edges are passed in. */
  async check(
    dbs: MoveDb[],
    edges: CrossFamilyEdge[],
    o: OrphanOptions,
  ): Promise<OrphanReport> {
    const out: OrphanEdgeResult[] = [];
    for (const e of edges) {
      // A parent that is sharded can be on any database; a global one is on
      // the primary database only.
      const parentDbs = isShardedModel(e.parentModel)
        ? dbs
        : dbs.filter((d) => d.key === 'primary');
      for (const db of dbs) {
        // Global tables only have rows on the primary database.
        if (!isShardedModel(e.childModel) && db.key !== 'primary') continue;
        const res = await this.checkEdge(db, parentDbs, e, o);
        if (res) out.push(res);
      }
    }
    return {
      at: new Date().toISOString(),
      totalOrphans: out.reduce((n, r) => n + r.orphans, 0),
      edges: out,
    };
  }

  private readonly types = new Map<string, string | null>();

  /** The SQL type of a column (e.g. `uuid`), cached; null when absent. */
  private async columnType(
    db: MoveDb,
    table: string,
    column: string,
  ): Promise<string | null> {
    const key = `${db.key}:${table}.${column}`;
    if (this.types.has(key)) return this.types.get(key) ?? null;
    const r: { t: string }[] = await db.query(
      `SELECT format_type(a.atttypid, a.atttypmod) AS t FROM pg_attribute a
        WHERE a.attrelid = to_regclass($1) AND a.attname = $2 AND NOT a.attisdropped`,
      [`public.${q(table)}`, column],
    );
    const t = r[0]?.t ?? null;
    // Interpolated into SQL: only plain type names are accepted.
    const safe = t && /^[a-z][a-z0-9 _(),]*$/i.test(t) ? t : null;
    this.types.set(key, safe);
    return safe;
  }

  private async checkEdge(
    db: MoveDb,
    parentDbs: MoveDb[],
    e: CrossFamilyEdge,
    o: OrphanOptions,
  ): Promise<OrphanEdgeResult | null> {
    const name = `${e.childTable}.${e.column}->${e.parentTable}.${e.parentColumn}`;
    const curKey = `${CURSOR_PREFIX}${db.key}:${name}`;
    let cursor: string | null = null;
    try {
      cursor = (await this.redis?.get(curKey)) ?? null;
    } catch {
      cursor = null;
    }
    let checked = 0;
    let orphans = 0;
    const sample: string[] = [];
    let truncated = false;
    try {
      // Compare in the column's own type (perf review 2026-10-26, R-22): a
      // `col::text > $2` filter / ORDER BY defeats the index and turns every
      // page into a full scan + sort; casting the PARAMETER keeps an index
      // range scan. Same for the parent lookup (`id = ANY($1::uuid[])`).
      const childType = await this.columnType(db, e.childTable, e.column);
      if (!childType) return null; // table not on this database
      const col = q(e.column);
      while (checked < o.maxValuesPerEdge) {
        const rows: { v: string }[] = await db.query(
          `SELECT s.${col}::text AS v FROM (
             SELECT DISTINCT ${col} FROM ${q(e.childTable)}
              WHERE ${col} IS NOT NULL ${cursor ? `AND ${col} > $2::${childType}` : ''}
              ORDER BY ${col} LIMIT $1::int) s
            ORDER BY s.${col}`,
          cursor ? [o.pageSize, cursor] : [o.pageSize],
        );
        if (rows.length === 0) {
          cursor = null;
          break;
        }
        const ids = rows.map((r) => r.v);
        const found = new Set<string>();
        for (const p of parentDbs) {
          const parentType = await this.columnType(
            p,
            e.parentTable,
            e.parentColumn,
          );
          if (!parentType) continue; // parent table not on this database
          const hit: { v: string }[] = await p.query(
            `SELECT ${q(e.parentColumn)}::text AS v FROM ${q(e.parentTable)}
              WHERE ${q(e.parentColumn)} = ANY($1::${parentType}[])`,
            [ids],
          );
          hit.forEach((h) => found.add(h.v));
        }
        for (const id of ids) {
          if (!found.has(id)) {
            orphans += 1;
            if (sample.length < 5) sample.push(id);
          }
        }
        checked += ids.length;
        cursor = ids[ids.length - 1];
        if (rows.length < o.pageSize) {
          cursor = null;
          break;
        }
        if (checked >= o.maxValuesPerEdge) truncated = true;
      }
    } catch (err) {
      // A table that does not exist on this database (global-only) is not
      // an orphan problem.
      if (/does not exist/i.test(String(err))) return null;
      throw err;
    }
    try {
      if (cursor) await this.redis?.set(curKey, cursor, 'EX', 7 * 86_400);
      else await this.redis?.del(curKey);
    } catch {
      /* cursor is an optimisation */
    }
    return {
      edge: name,
      database: db.key,
      checked,
      orphans,
      sample,
      truncated,
    };
  }
}

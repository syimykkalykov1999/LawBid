/* eslint-disable @typescript-eslint/require-await -- fakes and sync-bodied interface methods */
import { MoveTable, buildMoveTables, shardedEdges } from './move-plan';
import type { MoveDb } from './move-db';
import {
  checksumSql,
  createGuardTriggerSql,
  dropGuardTriggerSql,
  lateUpdateSql,
  missingKeysSql,
  q,
  removeBatchSql,
  removeByPkSql,
  selectBatchSql,
  selectByPkSql,
  triggerName,
  upsertSql,
} from './move-sql';
import {
  dropCrossFamilyForeignKeys,
  remainingCrossFamilyForeignKeys,
} from './cross-family-fks';
import type { MoveOps } from './shard-move.runner';
import type { PreflightResult, TableCount, VerifyResult } from './move-types';

/** Models routed by their OWN id (route params / sockets); see preflight. */
const ID_ROUTED = [
  'Case',
  'Bid',
  'Conversation',
  'Call',
  'Message',
  'Review',
  'ClientReview',
  'CaseComment',
  'PaymentRequest',
  'Post',
  'Comment',
];

const ROWS_PER_SECOND = 4000;

/**
 * Shard-ready step 10: the PostgreSQL side of the move tool (see
 * shard-move.runner.ts for the sequence and docs §13 for the design).
 *
 * Catch-up method (works on RDS with no reboot and no replication slot):
 * the source gets a BEFORE row trigger on every sharded table
 * (`lawbid_shard_move_guard`) that writes the primary key of each changed
 * row of the moving shard into `shard_change_log`; replay reads the CURRENT
 * row by key from the source and upserts it into the target (or deletes it
 * there when it is gone), so no "before/after" images or REPLICA IDENTITY
 * are needed and the replay is idempotent. The same trigger is the write
 * fence for the freeze.
 */
export class PgMoveOps implements MoveOps {
  private readonly plan = buildMoveTables();
  private readonly byTable = new Map(this.plan.map((t) => [t.table, t]));
  private columnCache = new Map<string, Map<string, string[]>>();

  constructor(
    private readonly source: MoveDb,
    private readonly target: MoveDb,
  ) {}

  tables(): MoveTable[] {
    return this.plan;
  }

  private async columns(db: MoveDb, table: string): Promise<string[]> {
    let m = this.columnCache.get(db.key);
    if (!m) {
      m = new Map();
      const rows = await db.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND is_generated = 'NEVER'
          ORDER BY table_name, ordinal_position`,
      );
      for (const r of rows) {
        if (!m.has(r.table_name)) m.set(r.table_name, []);
        m.get(r.table_name)!.push(r.column_name);
      }
      this.columnCache.set(db.key, m);
    }
    const cols = m.get(table);
    if (!cols) throw new Error(`table ${table} missing on ${db.key}`);
    return cols;
  }

  /* ------------------------------------------------------ preflight --- */

  async preflight(shard: number): Promise<PreflightResult> {
    const problems: string[] = [];
    const warnings: string[] = [];
    if (this.source.key === this.target.key) {
      problems.push('source and target are the same database');
    }
    const tables: TableCount[] = [];
    let migrationsMatch = true;
    let fkSource = false;
    let fkTarget = false;
    try {
      const mig = async (db: MoveDb) =>
        new Set(
          (
            await db.query<{ migration_name: string }>(
              `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
            )
          ).map((r) => r.migration_name),
        );
      const [a, b] = await Promise.all([mig(this.source), mig(this.target)]);
      const missing = [...a].filter((m) => !b.has(m));
      if (missing.length) {
        migrationsMatch = false;
        problems.push(
          `target ${this.target.key} lacks ${missing.length} migration(s), first: ${missing.sort()[0]} (run prisma migrate deploy on it)`,
        );
      }
      if ([...b].some((m) => !a.has(m))) {
        warnings.push('target has migrations the source does not');
      }
      fkSource = (await remainingCrossFamilyForeignKeys(this.source)) === 0;
      fkTarget = (await remainingCrossFamilyForeignKeys(this.target)) === 0;
      if (!fkSource || !fkTarget) {
        warnings.push(
          'cross-family foreign keys still exist; the move drops them on both databases first (plan step 9, reversible)',
        );
      }
    } catch (e) {
      migrationsMatch = false;
      problems.push(`cannot read ${this.target.key}: ${errText(e)}`);
    }

    let total = 0;
    for (const t of this.plan) {
      const [r] = await this.source.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${q(t.table)} WHERE shard_id = $1`,
        [shard],
      );
      tables.push({ table: t.table, rows: r.n });
      total += r.n;
    }

    if (migrationsMatch) {
      for (const t of this.plan) {
        const [r] = await this.target.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM ${q(t.table)} WHERE shard_id = $1`,
          [shard],
        );
        if (r.n > 0) {
          problems.push(
            `target ${this.target.key} already holds ${r.n} row(s) of shard ${shard} in ${t.table}`,
          );
          break;
        }
      }
      const [guard] = await this.source.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM shard_move_track WHERE logical_shard = $1`,
        [shard],
      );
      if (guard.n > 0)
        problems.push(`shard ${shard} is already tracked by another move`);
    }

    // Rows of this shard must not reference rows of another shard (their
    // foreign key could not hold on another server).
    for (const e of shardedEdges()) {
      const [r] = await this.source.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${q(e.childTable)} c
          JOIN ${q(e.parentTable)} p ON p.${q(e.parentColumn)} = c.${q(e.column)}
         WHERE (c.shard_id = $1) <> (p.shard_id = $1)`,
        [shard],
      );
      if (r.n > 0) {
        problems.push(
          `${r.n} row(s) of ${e.childTable}.${e.column} point to ${e.parentTable} rows of another shard`,
        );
      }
    }

    // Legacy random (v4) ids carry no shard: the router would look for them
    // by the last byte of the id, not by the stored shard_id.
    for (const model of ID_ROUTED) {
      const t = this.plan.find((x) => x.model === model);
      if (!t || t.pk.length !== 1 || t.pk[0] !== 'id') continue;
      const [r] = await this.source.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${q(t.table)}
          WHERE substr(id::text, 15, 1) <> '8'
            AND ('x' || right(id::text, 2))::bit(8)::int <> shard_id
            AND (shard_id = $1 OR ('x' || right(id::text, 2))::bit(8)::int = $1)`,
        [shard],
      );
      if (r.n > 0) {
        problems.push(
          `${r.n} legacy-id row(s) in ${t.table} would be routed to a different shard than they are stored in (seed/demo data: remove with prelaunch-wipe or re-key before the split)`,
        );
      }
    }

    return {
      ok: problems.length === 0,
      problems,
      warnings,
      tables,
      totalRows: total,
      estimatedSeconds: Math.ceil(
        total / ROWS_PER_SECOND + this.plan.length * 0.05 + 10,
      ),
      fkDropped: { source: fkSource, target: fkTarget },
      migrationsMatch,
    };
  }

  /* ------------------------------------------------------- prepare --- */

  async prepare(shard: number, moveId: string): Promise<void> {
    await dropCrossFamilyForeignKeys(this.target);
    await dropCrossFamilyForeignKeys(this.source);
    await this.track(this.source, shard, moveId);
  }

  private async track(
    db: MoveDb,
    shard: number,
    moveId: string,
  ): Promise<void> {
    await db.query(
      `INSERT INTO shard_move_track (logical_shard, move_id) VALUES ($1, $2::uuid)
       ON CONFLICT (logical_shard) DO UPDATE SET move_id = EXCLUDED.move_id`,
      [shard, moveId],
    );
    const have = new Set(
      (
        await db.query<{ tgname: string }>(
          `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\\_shard\\_move'`,
        )
      ).map((r) => r.tgname),
    );
    for (const t of this.plan) {
      if (have.has(triggerName(t.table))) continue;
      for (const sql of createGuardTriggerSql(t)) await db.query(sql);
    }
  }

  /* --------------------------------------------------------- copy --- */

  async copyBatch(
    shard: number,
    t: MoveTable,
    cursor: string | null,
    batch: number,
  ): Promise<{ rows: number; cursor: string | null; done: boolean }> {
    const [r] = await this.source.query<{
      n: number;
      rows: string;
      last: string | null;
    }>(
      selectBatchSql(t, cursor !== null),
      cursor !== null ? [shard, cursor, batch] : [shard, batch],
    );
    if (r.n === 0) return { rows: 0, cursor, done: true };
    const cols = await this.columns(this.target, t.table);
    await this.target.tx(
      async (tx) => {
        await tx.query(upsertSql(t, cols, true), [r.rows]);
      },
      { bypass: true },
    );
    return { rows: r.n, cursor: r.last, done: r.n < batch };
  }

  async fillLate(shard: number): Promise<void> {
    for (const t of this.plan) {
      if (t.late.length === 0) continue;
      let cursor = null as string | null;
      for (;;) {
        const [r]: { n: number; rows: string; last: string | null }[] =
          await this.source.query<{
            n: number;
            rows: string;
            last: string | null;
          }>(
            selectBatchSql(t, cursor !== null),
            cursor !== null ? [shard, cursor, 2000] : [shard, 2000],
          );
        if (r.n === 0) break;
        await this.target.tx(
          async (tx) => {
            await tx.query(lateUpdateSql(t), [r.rows]);
          },
          { bypass: true },
        );
        cursor = r.last;
        if (r.n < 2000) break;
      }
    }
  }

  /* ------------------------------------------------------ catch-up --- */

  async backlog(shard: number, after: number): Promise<number> {
    const [r] = await this.source.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM shard_change_log WHERE shard_id = $1 AND id > $2`,
      [shard, after],
    );
    return r.n;
  }

  async applyLog(
    shard: number,
    after: number,
    limit: number,
  ): Promise<{ lastId: number; entries: number }> {
    const log = await this.source.query<{
      id: bigint | number;
      table_name: string;
      pk: string;
    }>(
      `SELECT id, table_name, pk::text AS pk FROM shard_change_log
        WHERE shard_id = $1 AND id > $2 ORDER BY id LIMIT $3`,
      [shard, after, limit],
    );
    if (log.length === 0) return { lastId: after, entries: 0 };
    const lastId = Number(log[log.length - 1].id);
    const keys = new Map<string, Map<string, unknown>>();
    for (const e of log) {
      if (!this.byTable.has(e.table_name)) continue;
      if (!keys.has(e.table_name)) keys.set(e.table_name, new Map());
      keys.get(e.table_name)!.set(e.pk, JSON.parse(e.pk));
    }
    const upserts: { t: MoveTable; rows: string }[] = [];
    const deletes: { t: MoveTable; keys: string }[] = [];
    for (const t of this.plan) {
      const k = keys.get(t.table);
      if (!k) continue;
      const json = JSON.stringify([...k.values()]);
      const [rows] = await this.source.query<{ rows: string }>(
        selectByPkSql(t),
        [json],
      );
      if (rows.rows !== '[]') upserts.push({ t, rows: rows.rows });
      const [gone] = await this.source.query<{ keys: string }>(
        missingKeysSql(t),
        [json],
      );
      if (gone.keys !== '[]') deletes.push({ t, keys: gone.keys });
    }
    const run = (deletesFirst: boolean) =>
      this.target.tx(
        async (tx) => {
          const doDeletes = async () => {
            for (const d of [...deletes].reverse()) {
              await tx.query(removeByPkSql(d.t), [d.keys]);
            }
          };
          if (deletesFirst) await doDeletes();
          for (const u of upserts) {
            const cols = await this.columns(this.target, u.t.table);
            await tx.query(upsertSql(u.t, cols, true), [u.rows]);
          }
          for (const u of upserts) {
            if (u.t.late.length) await tx.query(lateUpdateSql(u.t), [u.rows]);
          }
          if (!deletesFirst) await doDeletes();
        },
        { bypass: true },
      );
    try {
      await run(false);
    } catch (e) {
      // A unique value freed by a delete and taken by an insert in the same
      // slice: do the deletes first.
      if (!/duplicate key|23505/i.test(errText(e))) throw e;
      await run(true);
    }
    return { lastId, entries: log.length };
  }

  /* ------------------------------------------------- freeze, fence --- */

  async freeze(shard: number, ms: number): Promise<void> {
    // The guard takes FOR SHARE on the track row, so this UPDATE waits for
    // writers that are in flight (the drain) and queues new ones behind it.
    await this.source.tx(async (tx) => {
      await tx.query(`SET LOCAL lock_timeout = '30s'`);
      await tx.query(
        `UPDATE shard_move_track
            SET frozen_until = CASE WHEN frozen_until = 'infinity' THEN frozen_until
                                    ELSE now() + make_interval(secs => $2::float8 / 1000.0) END
          WHERE logical_shard = $1`,
        [shard, ms],
      );
    });
  }

  async drain(): Promise<boolean> {
    // Done by `freeze` (row lock); nothing left to wait for.
    return true;
  }

  async fenceSource(shard: number): Promise<void> {
    await this.source.query(
      `UPDATE shard_move_track SET frozen_until = 'infinity' WHERE logical_shard = $1`,
      [shard],
    );
  }

  async unfreeze(shard: number): Promise<void> {
    await this.source.query(
      `UPDATE shard_move_track SET frozen_until = NULL WHERE logical_shard = $1`,
      [shard],
    );
  }

  async armTarget(shard: number, moveId: string): Promise<void> {
    await this.track(this.target, shard, moveId);
  }

  /* ---------------------------------------------------- verification --- */

  async verify(shard: number): Promise<VerifyResult> {
    const tables = [];
    let ok = true;
    for (const t of this.plan) {
      const [a] = await this.source.query<{ n: number; sum: string }>(
        checksumSql(t),
        [shard],
      );
      const [b] = await this.target.query<{ n: number; sum: string }>(
        checksumSql(t),
        [shard],
      );
      const same = a.n === b.n && a.sum === b.sum;
      ok &&= same;
      tables.push({
        table: t.table,
        sourceRows: a.n,
        targetRows: b.n,
        sourceSum: a.sum,
        targetSum: b.sum,
        ok: same,
      });
    }
    return { ok, tables };
  }

  /* ------------------------------------------- release, purge ------ */

  async release(shard: number, side: 'source' | 'target'): Promise<void> {
    const db = side === 'source' ? this.source : this.target;
    await db.query(`DELETE FROM shard_move_track WHERE logical_shard = $1`, [
      shard,
    ]);
    await db.query(`DELETE FROM shard_change_log WHERE shard_id = $1`, [shard]);
    const [left] = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM shard_move_track`,
    );
    if (left.n === 0) {
      for (const t of this.plan) await db.query(dropGuardTriggerSql(t));
    }
  }

  async purge(
    shard: number,
    side: 'source' | 'target',
    batch: number,
  ): Promise<number> {
    const db = side === 'source' ? this.source : this.target;
    return db.tx(
      async (tx) => {
        // Cycle-breaking columns first, so no remaining row blocks a delete.
        for (const t of this.plan) {
          if (t.late.length === 0) continue;
          await tx.query(
            `UPDATE ${q(t.table)} SET ${t.late.map((c) => `${q(c)} = NULL`).join(', ')}
              WHERE shard_id = $1`,
            [shard],
          );
        }
        let removed = 0;
        for (const t of [...this.plan].reverse()) {
          const rows = await tx.query<{ n: number }>(
            `WITH d AS (${removeBatchSql(t)} RETURNING 1) SELECT count(*)::int AS n FROM d`,
            [shard, batch],
          );
          removed += rows[0]?.n ?? 0;
        }
        return removed;
      },
      { bypass: true },
    );
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

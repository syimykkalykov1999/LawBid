import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  BackfillDefinition,
  BackfillRow,
  BackfillStatus,
  BackfillStore,
  KeyRange,
} from './backfill.types';

const IDENT = /^[a-z_][a-z0-9_]*$/;
/** Another runner beat within this window means "still alive". */
export const ALIVE_WINDOW_SEC = 60;

export function ident(name: string): Prisma.Sql {
  if (!IDENT.test(name)) throw new Error(`bad identifier: ${name}`);
  return Prisma.raw(`"${name}"`);
}

type Raw = Omit<BackfillRow, 'processed' | 'total_estimate'> & {
  processed: bigint;
  total_estimate: bigint | null;
};
const toRow = (r: Raw): BackfillRow => ({
  ...r,
  processed: Number(r.processed),
  total_estimate: r.total_estimate === null ? null : Number(r.total_estimate),
});

/** `backfill_runs` over raw SQL (the table is read and written only here). */
export class PgBackfillStore implements BackfillStore {
  constructor(
    private readonly db: Pick<PrismaService, '$queryRaw' | '$executeRaw'>,
  ) {}

  async begin(
    def: BackfillDefinition,
    opts: { batchSize: number; maxRowsPerSec: number; restart: boolean },
  ) {
    const existing = await this.get(def.name);
    if (existing) {
      if (existing.status === 'done' && !opts.restart)
        return { refused: 'already finished (use --restart to run again)' };
      if (existing.status === 'aborted' && !opts.restart)
        return { refused: 'was aborted (use --restart to start over)' };
      const alive =
        Date.now() - existing.heartbeat_at.getTime() < ALIVE_WINDOW_SEC * 1000;
      if (existing.status === 'running' && alive)
        return { refused: 'another runner is working on it' };
    }
    const total = await this.estimateTotal(def);
    const rows = await this.db.$queryRaw<Raw[]>`
      INSERT INTO backfill_runs (name, status, table_name, batch_size, max_rows_per_sec, total_estimate)
      VALUES (${def.name}, 'running', ${def.table}, ${opts.batchSize}, ${opts.maxRowsPerSec}, ${total})
      ON CONFLICT (name) DO UPDATE SET
        status = CASE WHEN backfill_runs.status = 'paused' AND NOT ${opts.restart} THEN 'paused' ELSE 'running' END,
        cursor = CASE WHEN ${opts.restart} THEN NULL ELSE backfill_runs.cursor END,
        processed = CASE WHEN ${opts.restart} THEN 0 ELSE backfill_runs.processed END,
        finished_at = NULL,
        last_error = NULL,
        batch_size = ${opts.batchSize},
        max_rows_per_sec = ${opts.maxRowsPerSec},
        total_estimate = ${total},
        heartbeat_at = now(),
        updated_at = now()
      RETURNING *`;
    return { row: toRow(rows[0]) };
  }

  async get(name: string): Promise<BackfillRow | null> {
    const rows = await this.db.$queryRaw<
      Raw[]
    >`SELECT * FROM backfill_runs WHERE name = ${name}`;
    return rows[0] ? toRow(rows[0]) : null;
  }

  async list(): Promise<BackfillRow[]> {
    const rows = await this.db.$queryRaw<Raw[]>`
      SELECT * FROM backfill_runs ORDER BY (status IN ('running','paused')) DESC, updated_at DESC LIMIT 50`;
    return rows.map(toRow);
  }

  /** The key after `size` more keys: one index range scan, no OFFSET. */
  async nextRange(
    def: BackfillDefinition,
    cursor: string | null,
    size: number,
  ): Promise<KeyRange | null> {
    const key = ident(def.keyColumn ?? 'id');
    const cast = Prisma.raw(def.keyType === 'uuid' ? '::uuid' : '::bigint');
    const rows = await this.db.$queryRaw<{ hi: string | null }[]>`
      SELECT max(k)::text AS hi FROM (
        SELECT ${key} AS k FROM ${ident(def.table)}
        WHERE (${cursor}::text IS NULL OR ${key} > ${cursor}${cast})
        ORDER BY ${key} LIMIT ${size}
      ) s`;
    const hi = rows[0]?.hi ?? null;
    return hi ? { lo: cursor, hi } : null;
  }

  async progress(
    name: string,
    cursor: string,
    rowsDone: number,
  ): Promise<BackfillStatus> {
    const r = await this.db.$queryRaw<{ status: BackfillStatus }[]>`
      UPDATE backfill_runs SET cursor = ${cursor}, processed = processed + ${rowsDone},
        pause_reason = NULL, heartbeat_at = now(), updated_at = now()
      WHERE name = ${name} RETURNING status`;
    return r[0]?.status ?? 'aborted';
  }

  async heartbeat(
    name: string,
    pauseReason: string | null,
  ): Promise<BackfillStatus> {
    const r = await this.db.$queryRaw<{ status: BackfillStatus }[]>`
      UPDATE backfill_runs SET heartbeat_at = now(),
        pause_reason = CASE WHEN status = 'paused' THEN pause_reason ELSE ${pauseReason} END
      WHERE name = ${name} RETURNING status`;
    return r[0]?.status ?? 'aborted';
  }

  async finish(name: string): Promise<void> {
    await this.db.$executeRaw`
      UPDATE backfill_runs SET status = 'done', finished_at = now(), updated_at = now(), pause_reason = NULL
      WHERE name = ${name} AND status = 'running'`;
  }

  async fail(name: string, error: string): Promise<void> {
    await this.db.$executeRaw`
      UPDATE backfill_runs SET status = 'failed', last_error = ${error.slice(0, 500)}, updated_at = now()
      WHERE name = ${name} AND status IN ('running','paused')`;
  }

  /** Admin buttons. pause: running→paused; resume: paused→running; abort: running|paused|failed→aborted. */
  async setStatus(
    name: string,
    to: 'paused' | 'running' | 'aborted',
  ): Promise<BackfillRow | null> {
    const from =
      to === 'paused'
        ? ['running']
        : to === 'running'
          ? ['paused', 'failed']
          : ['running', 'paused', 'failed'];
    const rows = await this.db.$queryRaw<Raw[]>`
      UPDATE backfill_runs SET status = ${to}, updated_at = now(),
        pause_reason = ${to === 'paused' ? 'paused by admin' : null},
        finished_at = ${to === 'aborted' ? new Date() : null}
      WHERE name = ${name} AND status = ANY(${from}::text[]) RETURNING *`;
    return rows[0] ? toRow(rows[0]) : null;
  }

  /** Planner estimate, free (no scan); null when never analysed. */
  async estimateTotal(def: BackfillDefinition): Promise<number | null> {
    const r = await this.db.$queryRaw<{ n: number | null }[]>`
      SELECT reltuples::bigint::float8 AS n FROM pg_class WHERE oid = to_regclass(${'public.' + def.table})`;
    const n = r[0]?.n;
    return n !== null && n !== undefined && n >= 0 ? Math.round(n) : null;
  }
}

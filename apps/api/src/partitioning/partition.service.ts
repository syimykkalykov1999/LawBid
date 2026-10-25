import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  FINALIZE_AFTER_DAYS,
  GROWTH_ALARM_ROWS,
  HASH_PARTITIONED,
  MIGRATED_PARTITIONED,
  PARTITION_TABLES,
  PartitionRunner,
  specOf,
  type JobRow,
  type PartitionSpec,
} from './partition-runner';
import { prismaSql, sharedSql, type SqlDb } from './sql';

/** Months kept ahead of today by the daily job. */
export const MONTHS_AHEAD = 2;
/**
 * Optional retention per table, in months. EMPTY on purpose: nothing is
 * detached today (audit and auth history are kept). Add `audit_log: 36` to
 * start detaching whole months older than that; the detached tables stay in
 * the database until someone archives and drops them.
 */
export const PARTITION_RETENTION_MONTHS: Readonly<Record<string, number>> = {};

export type PartitionCardState =
  | 'monthly' // partitioned by the migration or by the runner
  | 'idle'
  | 'running'
  | 'paused'
  | 'swapped'
  | 'error'
  | 'blocked'; // cannot be converted yet (reasons)

export interface PartitionCard {
  table: string;
  label: string;
  rows: number;
  bytes: number;
  partitioned: boolean;
  partitions: number;
  state: PartitionCardState;
  /** Why it cannot be converted (Russian), empty when it can. */
  blockedBy: string[];
  /** 0..100 while a conversion runs. */
  progress: number | null;
  phase: string | null;
  error: string | null;
  paused: boolean;
  canStart: boolean;
  canUndo: boolean;
  canFinalize: boolean;
  /** When «Завершить» becomes possible (ISO), after the swap. */
  finalizeAfter: string | null;
  /** More than 50 million rows and not partitioned: the growth signal. */
  overThreshold: boolean;
  /** The service role for the runner is configured. */
  runnerConfigured: boolean;
}

/**
 * Owner 2026-10-24: partitioning by month. The migration partitioned the
 * small append-only tables already; this service (1) keeps their future
 * months created (daily job), (2) advances an admin-started online
 * conversion of another table (every-minute job), (3) feeds the admin card
 * and the «table grew past 50 million rows» health signal.
 * The online conversion needs its own database role that OWNS the table
 * (`PARTITION_DATABASE_URL`); without it the card is read-only.
 */
@Injectable()
export class PartitionService implements OnModuleDestroy {
  private readonly log = new Logger('Partitioning');
  private rw?: SqlDb;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private url(): string | undefined {
    const v = this.config.get<string>('PARTITION_DATABASE_URL');
    return v && v.length > 0 ? v : undefined;
  }

  get runnerConfigured(): boolean {
    return !!this.url();
  }

  private runnerRw(): PartitionRunner {
    const url = this.url();
    if (!url) {
      throw new Error(
        'Не настроен PARTITION_DATABASE_URL (роль-владелец таблиц). См. docs/runbooks/table-partitioning.md.',
      );
    }
    this.rw ??= prismaSql(url);
    return new PartitionRunner(this.rw);
  }

  /** Read-only runner on the application's own connection. */
  private runnerRead(): PartitionRunner {
    const sql = sharedSql(this.prisma);
    return new PartitionRunner({
      ...sql,
      tx: () => Promise.reject(new Error('read only')),
      close: () => Promise.resolve(),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.rw?.close().catch(() => undefined);
  }

  // ----------------------------------------------------------- the jobs ---

  /** Daily: pre-create the next months of every partitioned table. */
  async maintain(): Promise<{
    created: Record<string, number>;
    detached: Record<string, number>;
  }> {
    const created: Record<string, number> = {};
    const detached: Record<string, number> = {};
    for (const s of MIGRATED_PARTITIONED) {
      try {
        const r = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
          `SELECT lawbid_ensure_month_partitions($1, $2)::int AS n`,
          s.table,
          MONTHS_AHEAD,
        );
        created[s.table] = Number(r[0]?.n ?? 0);
        const keep = PARTITION_RETENTION_MONTHS[s.table];
        if (keep && keep > 0) {
          const d = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
            `SELECT lawbid_detach_old_partitions($1, $2)::int AS n`,
            s.table,
            keep,
          );
          detached[s.table] = Number(d[0]?.n ?? 0);
        }
      } catch (e) {
        this.log.error(`maintain ${s.table}: ${(e as Error).message}`);
      }
    }
    return { created, detached };
  }

  /** Every minute: a bounded round of the admin-started conversion. */
  async tick(): Promise<{ worked: string[] } | null> {
    if (!this.runnerConfigured) return null;
    const run = this.runnerRw();
    const r = await run.tick(40_000);
    // Tables converted by the runner also need their future months.
    for (const t of r.worked)
      await run.ensureFuture(t, MONTHS_AHEAD).catch(() => 0);
    return r;
  }

  // ------------------------------------------------------------- the UI ---

  async report(): Promise<PartitionCard[]> {
    const read = this.runnerRead();
    const jobs = await this.jobs();
    const out: PartitionCard[] = [];
    for (const spec of [
      ...MIGRATED_PARTITIONED,
      ...HASH_PARTITIONED,
      ...PARTITION_TABLES,
    ]) {
      out.push(await this.card(read, spec, jobs.get(spec.table) ?? null));
    }
    return out;
  }

  private async jobs(): Promise<Map<string, JobRow>> {
    const m = new Map<string, JobRow>();
    try {
      const res = await this.prisma.$queryRawUnsafe<JobRow[]>(
        `SELECT tbl, phase, paused, cursor_at::text, cursor_id, rows_total::int, rows_copied::int,
                started_at::text, swapped_at::text, updated_at::text, error, error_count,
                claimed_until::text, started_by
           FROM public._partition_job`,
      );
      for (const j of res) m.set(j.tbl, j);
    } catch {
      // No state table yet: nothing was ever started.
    }
    return m;
  }

  private async card(
    read: PartitionRunner,
    spec: PartitionSpec,
    job: JobRow | null,
  ): Promise<PartitionCard> {
    const st = await read.stats(spec.table);
    let partitions = 0;
    if (st.partitioned) {
      const r = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent = to_regclass($1)`,
        `public."${spec.table}"`,
      );
      partitions = Number(r[0]?.n ?? 0);
    }
    const base = {
      table: spec.table,
      label: spec.label,
      rows: st.rows,
      bytes: st.bytes,
      partitioned: st.partitioned,
      partitions,
      runnerConfigured: this.runnerConfigured,
      overThreshold: !st.partitioned && st.rows >= GROWTH_ALARM_ROWS,
    };
    const idle = {
      progress: null,
      phase: null,
      error: null,
      paused: false,
      canStart: false,
      canUndo: false,
      canFinalize: false,
      finalizeAfter: null,
      blockedBy: [] as string[],
    };
    if (
      st.partitioned &&
      (!job || job.phase === 'done' || job.phase === 'aborted')
    ) {
      return { ...base, ...idle, state: 'monthly' };
    }
    if (job && ['prepare', 'backfill', 'verify', 'swap'].includes(job.phase)) {
      const pct =
        job.rows_total > 0
          ? Math.min(99, Math.round((100 * job.rows_copied) / job.rows_total))
          : 0;
      return {
        ...base,
        ...idle,
        state: job.error ? 'error' : job.paused ? 'paused' : 'running',
        phase: job.phase,
        progress:
          job.phase === 'prepare' ? 0 : job.phase === 'backfill' ? pct : 99,
        error: job.error,
        paused: job.paused,
      };
    }
    if (job && job.phase === 'swapped' && job.swapped_at) {
      const after = new Date(
        new Date(job.swapped_at).getTime() + FINALIZE_AFTER_DAYS * 86_400_000,
      );
      return {
        ...base,
        ...idle,
        state: 'swapped',
        phase: 'swapped',
        progress: 100,
        canUndo: true,
        canFinalize: after.getTime() <= Date.now(),
        finalizeAfter: after.toISOString(),
      };
    }
    const pre = await read
      .precheck(spec)
      .catch((e: Error) => ({ ok: false, reasons: [e.message] }));
    return {
      ...base,
      ...idle,
      state: pre.ok ? 'idle' : 'blocked',
      blockedBy: pre.reasons,
      canStart: pre.ok && this.runnerConfigured,
    };
  }

  /** Health signal: tables over 50 million rows that are not partitioned. */
  async growthSignal(): Promise<{
    over: { table: string; rows: number }[];
    top: { table: string; rows: number }[];
  }> {
    const rows = await this.prisma.$queryRawUnsafe<
      { t: string; rows: number }[]
    >(
      `SELECT c.relname AS t,
              CASE WHEN c.relkind = 'p'
                   THEN (SELECT COALESCE(sum(GREATEST(p.reltuples, 0)), 0) FROM pg_inherits i JOIN pg_class p ON p.oid = i.inhrelid WHERE i.inhparent = c.oid)
                   ELSE GREATEST(c.reltuples, 0) END::float8 AS rows
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relispartition
        ORDER BY 2 DESC LIMIT 8`,
    );
    const partitioned = new Set(
      [...MIGRATED_PARTITIONED, ...HASH_PARTITIONED].map((s) => s.table),
    );
    const all = (rows ?? []).map((r) => ({
      table: r.t,
      rows: Math.round(Number(r.rows)),
    }));
    return {
      top: all.slice(0, 5),
      // A partitioned table is allowed to be big: it is exactly the cure.
      over: all.filter(
        (r) => r.rows >= GROWTH_ALARM_ROWS && !partitioned.has(r.table),
      ),
    };
  }

  // ------------------------------------------------------------ actions ---

  private spec(table: string): PartitionSpec {
    const s = PARTITION_TABLES.find((x) => x.table === table) ?? specOf(table);
    if (!s || !PARTITION_TABLES.some((x) => x.table === table)) {
      throw new Error('Эту таблицу нельзя разделить кнопкой.');
    }
    return s;
  }

  start(table: string, by: string): Promise<JobRow> {
    return this.runnerRw().start(this.spec(table), by);
  }
  pause(table: string, paused: boolean): Promise<void> {
    this.spec(table);
    return this.runnerRw().pause(table, paused);
  }
  retry(table: string): Promise<void> {
    this.spec(table);
    return this.runnerRw().retry(table);
  }
  abort(table: string): Promise<void> {
    return this.runnerRw().abort(this.spec(table));
  }
  undo(table: string): Promise<void> {
    return this.runnerRw().undo(this.spec(table));
  }
  finalize(table: string): Promise<void> {
    return this.runnerRw().finalize(this.spec(table));
  }
}

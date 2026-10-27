import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BackfillGuard } from './backfill.types';

/** Numbers the guard looks at; null = unknown (never blocks). */
export interface GuardProbes {
  /** Worst replica replay lag in seconds, null without a replica. */
  replicaLagSec(): Promise<number | null>;
  /** Connections in use / max_connections, 0..1. */
  connectionRatio(): Promise<number | null>;
  /** Newest database CPU reading (ops:capacity) when fresh. */
  dbCpuPercent(): Promise<number | null>;
  /** An autovacuum is running on this table right now. */
  autovacuumOn(table: string): Promise<boolean>;
  /** The owner's «pause heavy jobs» switch. */
  heavyPaused(): Promise<boolean>;
}

export const GUARD_LIMITS = {
  replicaLagSec: 10,
  connectionRatio: 0.8,
  dbCpuPercent: 75,
} as const;

/**
 * Stop signals, taken from GitLab's batched background migrations (WAL /
 * autovacuum / apdex health indicators) plus the ones this stack has: replica
 * lag (read replica switch), DB CPU and connection pressure (ops:capacity),
 * and the owner's heavy-jobs pause.
 */
export class HealthBackfillGuard implements BackfillGuard {
  constructor(private readonly probes: GuardProbes) {}

  async check(table: string): Promise<string | null> {
    const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch {
        return null; // a failing probe must not stop work by itself
      }
    };
    if (await safe(() => this.probes.heavyPaused()))
      return 'heavy background work is paused by the owner';
    const lag = await safe(() => this.probes.replicaLagSec());
    if (lag !== null && lag > GUARD_LIMITS.replicaLagSec)
      return `replica lag ${lag.toFixed(0)}s`;
    const cpu = await safe(() => this.probes.dbCpuPercent());
    if (cpu !== null && cpu > GUARD_LIMITS.dbCpuPercent)
      return `database CPU ${cpu.toFixed(0)}%`;
    const conn = await safe(() => this.probes.connectionRatio());
    if (conn !== null && conn > GUARD_LIMITS.connectionRatio)
      return `connections ${(conn * 100).toFixed(0)}% of max`;
    if (await safe(() => this.probes.autovacuumOn(table)))
      return `autovacuum is running on ${table}`;
    return null;
  }
}

/** Probes that ask the database itself (pg_stat_*), plus optional ops state. */
export function dbProbes(
  db: Pick<PrismaService, '$queryRaw'>,
  ops?: {
    capacity(): Promise<{ at: string; dbCpuPercent: number | null } | null>;
    isHeavyPaused(): Promise<boolean>;
  },
): GuardProbes {
  return {
    async replicaLagSec() {
      // Primary's view: empty without a replica; null columns when the role
      // may not read replication details (then there is no signal).
      const r = await db.$queryRaw<{ lag: number | null }[]>`
        SELECT max(EXTRACT(EPOCH FROM replay_lag))::float8 AS lag FROM pg_stat_replication`;
      return r[0]?.lag ?? null;
    },
    async connectionRatio() {
      const r = await db.$queryRaw<{ used: number; max: number }[]>`
        SELECT (SELECT count(*) FROM pg_stat_activity)::int AS used,
               current_setting('max_connections')::int AS max`;
      return r[0] ? r[0].used / r[0].max : null;
    },
    async dbCpuPercent() {
      const c = await ops?.capacity();
      if (!c || c.dbCpuPercent === null) return null;
      return Date.now() - Date.parse(c.at) < 15 * 60_000
        ? c.dbCpuPercent
        : null;
    },
    async autovacuumOn(table: string) {
      const r = await db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_progress_vacuum v
        JOIN pg_class c ON c.oid = v.relid WHERE c.relname = ${table}
        AND v.datid = (SELECT oid FROM pg_database WHERE datname = current_database())`;
      return (r[0]?.n ?? 0) > 0;
    },
    async heavyPaused() {
      return (await ops?.isHeavyPaused()) ?? false;
    },
  };
}

/** Helper for definitions: `(lo, hi]` as SQL on the key column. */
export function keyRangeSql(
  column: string,
  type: 'uuid' | 'bigint',
  lo: string | null,
  hi: string,
): Prisma.Sql {
  const c = Prisma.raw(`"${column.replace(/[^a-z0-9_]/g, '')}"`);
  const cast = Prisma.raw(type === 'uuid' ? '::uuid' : '::bigint');
  return lo === null
    ? Prisma.sql`${c} <= ${hi}${cast}`
    : Prisma.sql`${c} > ${lo}${cast} AND ${c} <= ${hi}${cast}`;
}

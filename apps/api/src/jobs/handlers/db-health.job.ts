import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { OpsStateService } from '../../common/ops/ops-state.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { forEachDatabase } from '../../sharding/for-each-database';
import { withJobLock } from './job-lock';

/** Tables smaller than this are never "bloated" (a 50 % ratio of 200 rows). */
export const MIN_ROWS_FOR_RATIO = 10_000;
/** The bloat alert needs a table big enough to matter. */
export const MIN_ROWS_FOR_BLOAT_ALERT = 100_000;
/** How many of the biggest tables each database reports. */
const TOP_TABLES = 20;
const GB = 1024 ** 3;
const REDIS_KEY = 'ops:db-health';
const REDIS_TTL_SEC = 3 * 24 * 3600;

export interface TableStat {
  table: string;
  live: number;
  dead: number;
  bytes: number;
}

export interface TableThresholds {
  /** Yellow at this table size (bytes). 0 = off. */
  sizeBytes: number;
  /** Yellow at this share of dead rows (0.2 = 20 %). 0 = off. */
  deadRatio: number;
}

export interface TableVerdict {
  table: string;
  bytes: number;
  rows: number;
  /** dead / (live + dead), null for a small table. */
  ratio: number | null;
  large: boolean;
  bloated: boolean;
}

/** Pure: turns the statistics of one database into verdicts. */
export function judgeTables(
  rows: readonly TableStat[],
  limits: TableThresholds,
): TableVerdict[] {
  return rows.map((r) => {
    const total = r.live + r.dead;
    const ratio =
      total >= MIN_ROWS_FOR_RATIO
        ? Math.round((r.dead / total) * 10_000) / 10_000
        : null;
    return {
      table: r.table,
      bytes: r.bytes,
      rows: total,
      ratio,
      large: limits.sizeBytes > 0 && r.bytes >= limits.sizeBytes,
      bloated:
        limits.deadRatio > 0 &&
        ratio !== null &&
        total >= MIN_ROWS_FOR_BLOAT_ALERT &&
        ratio >= limits.deadRatio,
    };
  });
}

export interface DbHealthResult {
  databases: number;
  tables: number;
  alerts: number;
  txidAge: number | null;
}

/**
 * DB-ops hardening S5-1 / S5-15: `db.health`, daily. Writes the numbers the
 * CloudWatch alarms (infra/modules/monitoring/db-health.tf) watch:
 *   {metric:"db_dead_tuple_ratio", database, table, ratio}  (tables >= 10k rows)
 *   {metric:"db_table_size", database, table, bytes}        (top 20 per database)
 *   {metric:"db_txid_age", database, age}                   (wraparound distance)
 * and, past the limits (`db.health_table_size_gb`, default 20 GB, and
 * `db.health_dead_ratio_percent`, default 20 %), one `alert:"db_table_large"`
 * / `alert:"db_table_bloat"` line per table. The latest report also sits in
 * Redis (`ops:db-health`, 3 days) for the admin. Read-only; never throws
 * (a failing database is logged and the others are still checked).
 */
@Injectable()
export class DbHealthJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly opsState?: OpsStateService,
  ) {
    this.logger.setContext(DbHealthJob.name);
  }

  async run(): Promise<DbHealthResult | null> {
    // Three-state admin switch (Настройки → db.health_mode).
    const mode = await this.settings.string('db.health_mode');
    if (mode === 'off') return null;
    if (mode !== 'on' && (await this.opsState?.isHeavyPaused())) return null;
    return withJobLock(this.redis, 'db.health', 10 * 60_000, () =>
      this.check(),
    );
  }

  async check(): Promise<DbHealthResult> {
    const [sizeGb, deadPercent] = await Promise.all([
      this.settings.number('db.health_table_size_gb'),
      this.settings.number('db.health_dead_ratio_percent'),
    ]);
    const limits: TableThresholds = {
      sizeBytes: sizeGb > 0 ? sizeGb * GB : 0,
      deadRatio: deadPercent > 0 ? deadPercent / 100 : 0,
    };
    const report: Array<{
      database: string;
      txidAge: number | null;
      tables: TableVerdict[];
    }> = [];
    let alerts = 0;
    let worstAge: number | null = null;

    await forEachDatabase(this.prisma, async (database) => {
      try {
        const [tables, age] = await Promise.all([
          this.tableStats(),
          this.txidAge(),
        ]);
        const verdicts = judgeTables(tables, limits);
        report.push({ database, txidAge: age, tables: verdicts });
        if (age !== null) {
          worstAge = worstAge === null ? age : Math.max(worstAge, age);
          this.logger.info(
            { metric: 'db_txid_age', database, age },
            'database transaction id age',
          );
        }
        for (const v of verdicts) {
          this.logger.info(
            {
              metric: 'db_table_size',
              database,
              table: v.table,
              bytes: v.bytes,
            },
            'table size',
          );
          if (v.ratio !== null) {
            this.logger.info(
              {
                metric: 'db_dead_tuple_ratio',
                database,
                table: v.table,
                ratio: v.ratio,
              },
              'dead tuple ratio',
            );
          }
          if (v.large) {
            alerts += 1;
            this.logger.warn(
              {
                alert: 'db_table_large',
                database,
                table: v.table,
                bytes: v.bytes,
              },
              'table passed the size limit',
            );
          }
          if (v.bloated) {
            alerts += 1;
            this.logger.warn(
              {
                alert: 'db_table_bloat',
                database,
                table: v.table,
                ratio: v.ratio,
              },
              'table has too many dead rows',
            );
          }
        }
      } catch (err) {
        this.logger.warn({ err, database }, 'db.health: database not checked');
      }
    });

    await this.redis
      .set(
        REDIS_KEY,
        JSON.stringify({ at: new Date().toISOString(), report }),
        'EX',
        REDIS_TTL_SEC,
      )
      .catch(() => undefined);
    return {
      databases: report.length,
      tables: report.reduce((n, d) => n + d.tables.length, 0),
      alerts,
      txidAge: worstAge,
    };
  }

  private async tableStats(): Promise<TableStat[]> {
    const rows = await this.prisma.$queryRaw<
      {
        name: string;
        live: bigint | null;
        dead: bigint | null;
        bytes: bigint | null;
      }[]
    >`
      SELECT relname AS name,
             n_live_tup::INT8 AS live,
             n_dead_tup::INT8 AS dead,
             pg_total_relation_size(relid)::INT8 AS bytes
      FROM pg_stat_user_tables
      WHERE schemaname = current_schema()
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT ${TOP_TABLES}`;
    return rows.map((r) => ({
      table: r.name,
      live: Number(r.live ?? 0n),
      dead: Number(r.dead ?? 0n),
      bytes: Number(r.bytes ?? 0n),
    }));
  }

  private async txidAge(): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ age: bigint | null }[]>`
      SELECT age(datfrozenxid)::INT8 AS age
      FROM pg_database WHERE datname = current_database()`;
    return rows[0]?.age == null ? null : Number(rows[0].age);
  }
}

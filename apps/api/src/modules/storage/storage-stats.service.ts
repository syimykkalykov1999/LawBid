import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface PurposeUsage {
  purpose: string;
  count: number;
  bytes: number;
}

export interface TableUsage {
  table: string;
  rows: number;
  bytes: number;
}

export interface StorageUsage {
  /** Live files as users see them (each copy counted). */
  filesBytes: number;
  filesCount: number;
  /** What S3 really keeps: shared objects counted once. */
  storedBytes: number;
  byPurpose: PurposeUsage[];
  /** Set aside by the cleanup, removed after storage.purge_after_days. */
  pendingRemovalCount: number;
  pendingRemovalBytes: number;
}

export interface UserUsage {
  userId: string;
  name: string | null;
  email: string | null;
  bytes: number;
  count: number;
  quotaMb: number | null;
}

/**
 * Owner 2026-10-05 (storage like Telegram): what files and the database
 * take — for the admin «Хранилище» page and a daily snapshot
 * (`storage.snapshot`) that draws growth and raises one alert when files
 * or the database grew more than `storage.growth_alert_percent` in a day
 * (`alert: storage_growth` → CloudWatch → e-mail).
 */
@Injectable()
export class StorageStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StorageStatsService.name);
  }

  async usage(): Promise<StorageUsage> {
    const [byPurpose, stored, pending] = await Promise.all([
      this.prisma.$queryRaw<{ purpose: string; n: bigint; bytes: bigint }[]>`
        SELECT purpose::STRING AS purpose, count(*)::INT8 AS n,
               coalesce(sum(size_bytes), 0)::INT8 AS bytes
        FROM files WHERE deleted_at IS NULL
        GROUP BY purpose ORDER BY bytes DESC`,
      this.prisma.$queryRaw<{ bytes: bigint | null }[]>`
        SELECT sum(size_bytes)::INT8 AS bytes FROM (
          SELECT DISTINCT ON (s3_bucket, s3_key) size_bytes
          FROM files WHERE deleted_at IS NULL)`,
      this.prisma.file.aggregate({
        where: { deleted_at: { not: null }, purged_at: null },
        _count: { _all: true },
        _sum: { size_bytes: true },
      }),
    ]);
    const rows = byPurpose.map((r) => ({
      purpose: r.purpose,
      count: Number(r.n),
      bytes: Number(r.bytes),
    }));
    return {
      filesBytes: rows.reduce((a, r) => a + r.bytes, 0),
      filesCount: rows.reduce((a, r) => a + r.count, 0),
      storedBytes: Number(stored[0]?.bytes ?? 0n),
      byPurpose: rows,
      pendingRemovalCount: pending._count._all,
      pendingRemovalBytes: Number(pending._sum.size_bytes ?? 0n),
    };
  }

  /**
   * The biggest tables (CockroachDB span statistics: live bytes and the
   * optimizer's row estimate). Empty when the database user may not read
   * crdb_internal — the page then just hides the card.
   */
  async tables(limit = 15): Promise<TableUsage[]> {
    try {
      const rows = await this.prisma.$queryRaw<
        { name: string; bytes: bigint | null; n: bigint | null }[]
      >`
        SELECT t.name AS name, s.live_bytes::INT8 AS bytes,
               r.estimated_row_count::INT8 AS n
        FROM crdb_internal.tenant_span_stats() s
        JOIN crdb_internal.tables t ON t.table_id = s.table_id
        LEFT JOIN crdb_internal.table_row_statistics r
          ON r.table_id = s.table_id
        WHERE t.database_name = current_database() AND t.drop_time IS NULL
        ORDER BY s.live_bytes DESC
        LIMIT ${limit}`;
      return rows.map((r) => ({
        table: r.name,
        rows: Number(r.n ?? 0n),
        bytes: Number(r.bytes ?? 0n),
      }));
    } catch (err) {
      this.logger.debug({ err }, 'table statistics unavailable');
      return [];
    }
  }

  /** Who stores the most (live files of every purpose). */
  async topUsers(limit = 20): Promise<UserUsage[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        quota: number | null;
        bytes: bigint;
        n: bigint;
      }[]
    >`
      SELECT u.id::STRING AS id, u.first_name, u.last_name, u.email,
             u.storage_quota_mb AS quota, x.bytes, x.n
      FROM (
        SELECT owner_user_id, sum(size_bytes)::INT8 AS bytes,
               count(*)::INT8 AS n
        FROM files WHERE deleted_at IS NULL
        GROUP BY owner_user_id ORDER BY bytes DESC LIMIT ${limit}
      ) x JOIN users u ON u.id = x.owner_user_id
      ORDER BY x.bytes DESC`;
    return rows.map((r) => ({
      userId: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
      email: r.email,
      bytes: Number(r.bytes),
      count: Number(r.n),
      quotaMb: r.quota,
    }));
  }

  /** The last [days] daily snapshots, oldest first. */
  async history(days = 90): Promise<
    {
      day: string;
      filesBytes: number;
      storedBytes: number;
      dbBytes: number;
      filesCount: number;
    }[]
  > {
    const rows = await this.prisma.storageSnapshot.findMany({
      orderBy: { day: 'desc' },
      take: days,
    });
    return rows.reverse().map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      filesBytes: Number(r.files_bytes),
      storedBytes: Number(r.stored_bytes),
      dbBytes: Number(r.db_bytes),
      filesCount: r.files_count,
    }));
  }

  /** The nightly snapshot (one row a day; re-running the day replaces
   * it) and the growth alert. */
  async snapshot(now: Date = new Date()): Promise<{ grewPercent: number }> {
    const [usage, tables] = await Promise.all([this.usage(), this.tables(50)]);
    const day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const dbBytes = tables.reduce((a, t) => a + t.bytes, 0);
    const data = {
      files_bytes: BigInt(usage.filesBytes),
      stored_bytes: BigInt(usage.storedBytes),
      files_count: usage.filesCount,
      by_purpose: usage.byPurpose as unknown as Prisma.InputJsonValue,
      db_tables: tables as unknown as Prisma.InputJsonValue,
      db_bytes: BigInt(dbBytes),
    };
    await this.prisma.storageSnapshot.upsert({
      where: { day },
      create: { day, ...data },
      update: data,
    });
    const previous = await this.prisma.storageSnapshot.findFirst({
      where: { day: { lt: day } },
      orderBy: { day: 'desc' },
    });
    const grewPercent = previous
      ? Math.max(
          growth(Number(previous.stored_bytes), usage.storedBytes),
          growth(Number(previous.db_bytes), dbBytes),
        )
      : 0;
    const threshold = await this.settings.number(
      'storage.growth_alert_percent',
    );
    if (threshold > 0 && grewPercent >= threshold) {
      this.logger.warn(
        {
          alert: 'storage_growth',
          grewPercent,
          storedBytes: usage.storedBytes,
          dbBytes,
        },
        'Storage grew faster than expected',
      );
    }
    return { grewPercent };
  }
}

/** Percent growth from [before] to [after]; small bases (under 100 MB)
 * never alert — a few uploads on a new system are not a trend. */
export function growth(before: number, after: number): number {
  if (before < 100 * 1024 * 1024) return 0;
  return Math.round(((after - before) / before) * 100);
}

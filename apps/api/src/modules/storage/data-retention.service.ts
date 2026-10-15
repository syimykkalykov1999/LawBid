import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Rows per DELETE: small transactions, no long locks. */
const BATCH = 5000;
/** A run stops after this many rows per table; the next night continues. */
const MAX_PER_TABLE = 1_000_000;
const DAY_MS = 24 * 3600 * 1000;

export interface RetentionResult {
  authEvents: number;
  assistantActivity: number;
  snapshots: number;
  postViews: number;
  appEvents: number;
}

/**
 * Owner 2026-10-05 (storage like Telegram): technical logs do not pile up
 * in the database. Nightly (`storage.retention`) while
 * `storage.auto_retention` is on, rows older than their setting go:
 * - auth_events (`storage.retention_auth_events_days`, 730) — append-only
 *   for the app, so removed under the `lawbid_retention` role
 *   (RETENTION_DATABASE_URL), one write shard at a time;
 * - assistant_activity (`storage.retention_assistant_activity_days`, 365);
 * - storage_snapshots (`storage.retention_snapshots_days`, 730);
 * - post_views (`storage.retention_post_views_days`, 365): the who-viewed
 *   rows only dedupe a viewer; the post's own view_count stays. Without
 *   this the table grows with every user x post for ever.
 * 0 days = keep forever. Already handled elsewhere: notifications
 * (notifications.retention_days), sessions, OTP, processed Stripe webhooks
 * (30 days), the case journal (5 years), archived tasks. Never touched:
 * audit_log, data_access_log, case_journal before retain_until, chats.
 */
@Injectable()
export class DataRetentionService implements OnModuleDestroy {
  private retentionDb?: PrismaClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DataRetentionService.name);
  }

  async run(now: Date = new Date()): Promise<RetentionResult | null> {
    if (!(await this.settings.boolean('storage.auto_retention'))) return null;
    const [authDays, activityDays, snapshotDays, viewsDays, eventsDays] =
      await Promise.all([
        this.settings.number('storage.retention_auth_events_days'),
        this.settings.number('storage.retention_assistant_activity_days'),
        this.settings.number('storage.retention_snapshots_days'),
        this.settings.number('storage.retention_post_views_days'),
        this.settings.number('storage.retention_app_events_days'),
      ]);
    const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const result: RetentionResult = {
      authEvents: authDays > 0 ? await this.authEvents(before(authDays)) : 0,
      assistantActivity:
        activityDays > 0
          ? await this.batched(
              (limit) => this.prisma.$executeRaw`
                DELETE FROM assistant_activity
                WHERE ctid IN (
                  SELECT ctid FROM assistant_activity
                  WHERE created_at < ${before(activityDays)}
                  ORDER BY created_at LIMIT ${limit})`,
            )
          : 0,
      snapshots:
        snapshotDays > 0
          ? (
              await this.prisma.storageSnapshot.deleteMany({
                where: { day: { lt: before(snapshotDays) } },
              })
            ).count
          : 0,
      postViews:
        viewsDays > 0
          ? await this.batched(
              (limit) => this.prisma.$executeRaw`
                DELETE FROM post_views
                WHERE ctid IN (
                  SELECT ctid FROM post_views
                  WHERE created_at < ${before(viewsDays)}
                  ORDER BY created_at LIMIT ${limit})`,
            )
          : 0,
      appEvents:
        eventsDays > 0
          ? (
              await this.prisma.appEventDay.deleteMany({
                where: { day: { lt: before(eventsDays) } },
              })
            ).count
          : 0,
    };
    if (Object.values(result).some((n) => n > 0)) {
      this.logger.info(result, 'data retention');
    }
    return result;
  }

  /** auth_events has an explicit write shard (0..15): one shard at a time
   * keeps each DELETE on the (created_shard, created_at) index. */
  private async authEvents(before: Date): Promise<number> {
    const db = this.retention();
    let total = 0;
    for (let shard = 0; shard < 16; shard += 1) {
      total += await this.batched(
        (limit) => db.$executeRaw`
          DELETE FROM auth_events
          WHERE ctid IN (
            SELECT ctid FROM auth_events
            WHERE created_shard = ${shard} AND created_at < ${before}
            ORDER BY created_at LIMIT ${limit})`,
      );
    }
    return total;
  }

  private async batched(
    step: (limit: number) => Promise<number>,
  ): Promise<number> {
    let deleted = 0;
    while (deleted < MAX_PER_TABLE) {
      const n = await step(BATCH);
      deleted += n;
      if (n < BATCH) break;
      // A short pause so a big backlog never hogs the database.
      await new Promise((r) => setTimeout(r, 200));
    }
    return deleted;
  }

  private retention(): PrismaClient | PrismaService {
    const url = this.config.get<string>('RETENTION_DATABASE_URL');
    if (!url) return this.prisma;
    this.retentionDb ??= new PrismaClient({ datasourceUrl: url });
    return this.retentionDb;
  }

  async onModuleDestroy(): Promise<void> {
    await this.retentionDb?.$disconnect();
  }
}

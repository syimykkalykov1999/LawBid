import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { allHeldIds, heldSqlFor } from '../../common/privacy/legal-hold';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';
import { pgAdapter } from '../../prisma/pg-adapter';
import {
  dropExpiredMonths,
  type MonthRetentionDb,
  type MonthRetentionTable,
} from '../../partitioning/partition-retention';
import {
  deleteInBatches,
  retentionPace,
  type RetentionPace,
} from './retention-batches';

const DAY_MS = 24 * 3600 * 1000;

export interface RetentionResult {
  authEvents: number;
  assistantActivity: number;
  snapshots: number;
  postViews: number;
  /** Audit A-10: one row per (channel post x reader). */
  channelPostViews: number;
  appEvents: number;
  /** Scale audit 2026-10-23: one row per impression / view of a post. */
  postViewEvents: number;
  /** Scale audit 2026-10-23: one row per active person per day. */
  userActivityDays: number;
  /** DB-ops S5-3: applied cross-family events (`status = 'done'`). */
  crossFamilyOutboxDone: number;
  /** DB-ops S5-3: idempotency keys of applied events. */
  crossFamilyInbox: number;
  /** DB scale batch B: whole months dropped as one partition (every
   * database for post_view_events). */
  postViewEventMonths: number;
  authEventMonths: number;
  /** DB scale batch C: keys of applied counter flush batches. */
  counterFlushBatches: number;
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
 * - post_view_events (`storage.retention_post_view_events_days`, 730): one
 *   row per impression / view of a post, the fastest-growing table after
 *   messages; only a post's own insights read it;
 * - user_activity_days (`storage.retention_user_activity_days`, 400): one
 *   row per active person per day (1M daily users = 365M rows a year); the
 *   admin charts read at most the last 60 days.
 * - cross_family_outbox, rows with status `done`
 *   (`storage.retention_outbox_done_days`, 7) on every database, and
 *   cross_family_inbox (`storage.retention_inbox_days`, 30): written on every
 *   sharded write that touches a global counter, they would become the
 *   largest tables. `pending` and `dead` outbox rows are never touched. The
 *   outbox's oldest still-pending age is logged by the relay itself
 *   (`outbox.sweep`, metric `cross_family_outbox_oldest_pending`).
 * - counter_flush_batches (`storage.retention_counter_flush_days`, 7) on
 *   every database: keys of applied counter flush batches.
 * DB scale batch B: rows per DELETE, the pause and the per-table cap of one
 * run are settings (storage.retention_batch_rows / _pause_ms /
 * _max_rows_per_table, 0 = no cap). Once post_view_events or auth_events is
 * partitioned by month, a month whose whole range is past the retention is
 * dropped as one partition first (storage.retention_partition_drop_enabled);
 * the row delete then takes what is left (the current month's part, held
 * persons' months). Removed post views always go to posts.view_count_base
 * (row delete and month drop alike), so the recount keeps them.
 * A person under a legal hold keeps their login history (round 13, S13-6).
 * 0 days = keep forever. Already handled elsewhere: notifications
 * (notifications.retention_days), sessions, OTP, processed Stripe webhooks
 * (30 days), the case journal (5 years), archived tasks. Never touched:
 * audit_log, data_access_log, case_journal before retain_until, chats.
 */
@Injectable()
export class DataRetentionService implements OnModuleDestroy {
  private retentionDb?: PrismaClient;
  /** Pace of the run in progress (settings read once per run). */
  private pace!: RetentionPace;

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
    const held = await heldSqlFor(this.prisma);
    const [
      authDays,
      activityDays,
      snapshotDays,
      viewsDays,
      channelViewsDays,
      eventsDays,
      viewEventsDays,
      activeDaysDays,
      outboxDoneDays,
      inboxDays,
      flushDays,
      monthDrop,
      monthLockMs,
      pace,
    ] = await Promise.all([
      this.settings.number('storage.retention_auth_events_days'),
      this.settings.number('storage.retention_assistant_activity_days'),
      this.settings.number('storage.retention_snapshots_days'),
      this.settings.number('storage.retention_post_views_days'),
      this.settings.number('storage.retention_channel_post_views_days'),
      this.settings.number('storage.retention_app_events_days'),
      this.settings.number('storage.retention_post_view_events_days'),
      this.settings.number('storage.retention_user_activity_days'),
      this.settings.number('storage.retention_outbox_done_days'),
      this.settings.number('storage.retention_inbox_days'),
      this.settings.number('storage.retention_counter_flush_days'),
      this.settings.boolean('storage.retention_partition_drop_enabled'),
      this.settings.number('storage.retention_partition_lock_timeout_ms'),
      retentionPace(this.settings),
    ]);
    this.pace = pace;
    const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
    // Months go first (cheap: one DROP each); the row delete takes the rest.
    const heldUsers =
      monthDrop && (viewEventsDays > 0 || authDays > 0)
        ? await allHeldIds(this.prisma, 'user', now)
        : [];
    const months = async (
      table: MonthRetentionTable,
      days: number,
      db: () => MonthRetentionDb,
    ): Promise<number> =>
      monthDrop && days > 0
        ? (
            await this.dropMonths(
              table,
              db,
              before(days),
              heldUsers,
              monthLockMs,
            )
          ).length
        : 0;
    // Owner 2026-10-28: activity rows of a person under a legal hold stay.
    const ok = (col: string) =>
      Prisma.sql`NOT ${held('user', Prisma.raw(col))}`;
    const authEventMonths = await months('auth_events', authDays, () =>
      this.retention(),
    );
    const postViewEventMonths =
      monthDrop && viewEventsDays > 0
        ? await this.onEveryDatabase(() =>
            months('post_view_events', viewEventsDays, () => this.prisma),
          )
        : 0;
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
                    AND ${ok('attorney_id')}
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
          ? await this.onEveryDatabase(() =>
              this.batched(
                (limit) => this.prisma.$executeRaw`
                DELETE FROM post_views
                WHERE ctid IN (
                  SELECT ctid FROM post_views
                  WHERE created_at < ${before(viewsDays)}
                    AND ${ok('user_id')}
                  ORDER BY created_at LIMIT ${limit})`,
              ),
            )
          : 0,
      channelPostViews:
        channelViewsDays > 0
          ? await this.onEveryDatabase(() =>
              this.batched(
                (limit) => this.prisma.$executeRaw`
                DELETE FROM channel_post_views
                WHERE ctid IN (
                  SELECT ctid FROM channel_post_views
                  WHERE viewed_at < ${before(channelViewsDays)}
                    AND ${ok('user_id')}
                  ORDER BY viewed_at LIMIT ${limit})`,
              ),
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
      // By (id, created_at), not ctid: a ctid is only unique inside ONE
      // partition, so after the monthly conversion it could hit other months.
      // DB scale batch C: the removed 'view' rows are added to their post's
      // view_count_base in the same statement (the post lives with its
      // events: foreign key), so the nightly recount keeps those views.
      postViewEvents:
        viewEventsDays > 0
          ? await this.onEveryDatabase(() =>
              this.batched(async (limit) => {
                const rows = await this.prisma.$queryRaw<{ n: number }[]>`
                WITH d AS (
                  DELETE FROM post_view_events
                  WHERE created_at < ${before(viewEventsDays)}
                    AND (id, created_at) IN (
                    SELECT id, created_at FROM post_view_events
                    WHERE created_at < ${before(viewEventsDays)}
                      AND ${ok('viewer_id')}
                    LIMIT ${limit})
                  RETURNING post_id, kind),
                v AS (
                  SELECT post_id, count(*)::INT AS n FROM d
                  WHERE kind = 'view' GROUP BY post_id),
                u AS (
                  UPDATE posts AS p SET view_count_base = p.view_count_base + v.n
                  FROM v WHERE p.id = v.post_id RETURNING 1)
                SELECT count(*)::INT AS n FROM d`;
                return Number(rows[0]?.n ?? 0);
              }),
            )
          : 0,
      userActivityDays:
        activeDaysDays > 0
          ? await this.batched(
              (limit) => this.prisma.$executeRaw`
                DELETE FROM user_activity_days
                WHERE ctid IN (
                  SELECT ctid FROM user_activity_days
                  WHERE day < ${before(activeDaysDays)}::DATE
                    AND ${ok('user_id')}
                  LIMIT ${limit})`,
            )
          : 0,
      // DB-ops S5-3. The outbox lives on EVERY physical database; the
      // (status, next_attempt_at) index serves the range, `processed_at`
      // is the real condition. The inbox is a global-family table.
      crossFamilyOutboxDone:
        outboxDoneDays > 0
          ? await this.onEveryDatabase(() =>
              this.batched(
                (limit) => this.prisma.$executeRaw`
                DELETE FROM cross_family_outbox
                WHERE ctid IN (
                  SELECT ctid FROM cross_family_outbox
                  WHERE status = 'done'
                    AND next_attempt_at < ${before(outboxDoneDays)}
                    AND processed_at < ${before(outboxDoneDays)}
                  LIMIT ${limit})`,
              ),
            )
          : 0,
      crossFamilyInbox:
        inboxDays > 0
          ? await this.batched(
              (limit) => this.prisma.$executeRaw`
                DELETE FROM cross_family_inbox
                WHERE ctid IN (
                  SELECT ctid FROM cross_family_inbox
                  WHERE applied_at < ${before(inboxDays)}
                  LIMIT ${limit})`,
            )
          : 0,
      postViewEventMonths,
      authEventMonths,
      // DB scale batch C: on every database, next to the counted rows.
      counterFlushBatches:
        flushDays > 0
          ? await this.onEveryDatabase(() =>
              this.batched(
                (limit) => this.prisma.$executeRaw`
                DELETE FROM counter_flush_batches
                WHERE token IN (
                  SELECT token FROM counter_flush_batches
                  WHERE applied_at < ${before(flushDays)}
                  LIMIT ${limit})`,
              ),
            )
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
    const held = await heldSqlFor(this.prisma);
    const db = this.retention();
    let total = 0;
    for (let shard = 0; shard < 16; shard += 1) {
      total += await this.batched(
        (limit) => db.$executeRaw`
          DELETE FROM auth_events
          WHERE (id, created_at) IN (
            SELECT id, created_at FROM auth_events
            WHERE created_shard = ${shard} AND created_at < ${before}
              AND (user_id IS NULL OR NOT ${held('user', Prisma.sql`user_id`)})
            ORDER BY created_at LIMIT ${limit})`,
      );
    }
    return total;
  }

  /** Shard-ready step 8: a sweep of a sharded table runs on every database. */
  private async onEveryDatabase(sweep: () => Promise<number>): Promise<number> {
    const parts = await forEachDatabase(this.prisma, sweep);
    return parts.reduce((n, d) => n + d, 0);
  }

  private batched(step: (limit: number) => Promise<number>): Promise<number> {
    return deleteInBatches(step, this.pace);
  }

  /** Whole expired months of a monthly table; a failure (a busy table hits
   * the lock timeout) is logged and the row delete carries on. */
  private async dropMonths(
    table: MonthRetentionTable,
    db: () => MonthRetentionDb,
    before: Date,
    heldUsers: string[],
    lockMs: number,
  ): Promise<string[]> {
    try {
      const dropped = await dropExpiredMonths(
        db(),
        table,
        before,
        heldUsers,
        lockMs,
      );
      if (dropped.length > 0) {
        this.logger.info({ table, dropped }, 'retention: months dropped');
      }
      return dropped;
    } catch (error) {
      this.logger.warn(
        { table, err: (error as Error).message },
        'retention: month drop skipped',
      );
      return [];
    }
  }

  private retention(): PrismaClient | PrismaService {
    const url = this.config.get<string>('RETENTION_DATABASE_URL');
    if (!url) return this.prisma;
    this.retentionDb ??= new PrismaClient({ adapter: pgAdapter(url) });
    return this.retentionDb;
  }

  async onModuleDestroy(): Promise<void> {
    await this.retentionDb?.$disconnect();
  }
}

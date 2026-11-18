import { forEachDatabase } from '../../sharding/for-each-database';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { heldSqlFor } from '../../common/privacy/legal-hold';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadgesService } from '../../modules/notifications/badges.service';
import {
  deleteInBatches,
  retentionPace,
  type RetentionPace,
} from '../../modules/storage/retention-batches';

/** docs/05 stage 5.8 "очистка старых уведомлений": rows older than
 * `notifications.retention_days` (app_config, default 180). DB scale batch
 * B: rows per DELETE, the pause and the per-run cap (0 = none) are the
 * storage.retention_* settings, shared with the other logs. */
@Injectable()
export class NotificationsRetentionJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly badges: BadgesService,
  ) {}

  async run(now: Date = new Date()): Promise<{ deleted: number }> {
    const days = await this.settings.number('notifications.retention_days');
    const before = new Date(now.getTime() - days * 24 * 3600 * 1000);
    // Two databases: notifications live with their user; each database
    // is cleaned in its own (one database: one pass, as before).
    const held = await heldSqlFor(this.prisma);
    const pace = await retentionPace(this.settings);
    const parts = await forEachDatabase(this.prisma, () =>
      this.runIn(before, held, pace),
    );
    return { deleted: parts.reduce((a, b) => a + b, 0) };
  }

  private runIn(
    before: Date,
    held: Awaited<ReturnType<typeof heldSqlFor>>,
    pace: RetentionPace,
  ): Promise<number> {
    // Verify batch 8 (17.11, NO7): old UNREAD rows leave the cached badge
    // number (Redis) too — their owners' counts are dropped and recounted
    // on the next read, like any other change of the unread rows.
    return deleteInBatches(async (limit) => {
      const [gone] = await this.prisma.$queryRaw<
        { n: bigint; users: string[] }[]
      >`
        WITH gone AS (
          DELETE FROM notifications
          WHERE (id, user_id) IN (
            SELECT id, user_id FROM notifications
            WHERE created_at < ${before}
              AND NOT ${held('user', Prisma.sql`user_id`)}
            ORDER BY created_at
            LIMIT ${limit})
          RETURNING user_id, read_at)
        SELECT count(*)::INT8 AS n,
               coalesce(array_agg(DISTINCT user_id::TEXT)
                          FILTER (WHERE read_at IS NULL), '{}') AS users
        FROM gone`;
      if (gone?.users.length) {
        await this.badges.invalidateNotificationsMany(gone.users);
      }
      return Number(gone?.n ?? 0);
    }, pace);
  }
}

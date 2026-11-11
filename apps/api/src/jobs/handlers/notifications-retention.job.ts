import { forEachDatabase } from '../../sharding/for-each-database';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { heldSqlFor } from '../../common/privacy/legal-hold';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Rows per DELETE: small transactions, no long locks. */
const BATCH = 5000;
/** A run stops after this many rows; the next night continues. */
const MAX_PER_RUN = 1_000_000;

/** docs/05 stage 5.8 "очистка старых уведомлений": rows older than
 * `notifications.retention_days` (app_config, default 180). */
@Injectable()
export class NotificationsRetentionJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
  ) {}

  async run(now: Date = new Date()): Promise<{ deleted: number }> {
    const days = await this.settings.number('notifications.retention_days');
    const before = new Date(now.getTime() - days * 24 * 3600 * 1000);
    // Two databases: notifications live with their user; each database
    // is cleaned in its own (one database: one pass, as before).
    const held = await heldSqlFor(this.prisma);
    const parts = await forEachDatabase(this.prisma, () =>
      this.runIn(before, held),
    );
    return { deleted: parts.reduce((a, b) => a + b, 0) };
  }

  private async runIn(
    before: Date,
    held: Awaited<ReturnType<typeof heldSqlFor>>,
  ): Promise<number> {
    let deleted = 0;
    while (deleted < MAX_PER_RUN) {
      const n = await this.prisma.$executeRaw`
        DELETE FROM notifications
        WHERE (id, user_id) IN (
          SELECT id, user_id FROM notifications
          WHERE created_at < ${before}
            AND NOT ${held('user', Prisma.sql`user_id`)}
          ORDER BY created_at
          LIMIT ${BATCH})`;
      deleted += n;
      if (n < BATCH) break;
      // Short pause so a big backlog never hogs the DB (load review).
      await new Promise((r) => setTimeout(r, 200));
    }
    return deleted;
  }
}

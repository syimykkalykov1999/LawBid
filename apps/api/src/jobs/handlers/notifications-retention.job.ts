import { Injectable } from '@nestjs/common';
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
    let deleted = 0;
    while (deleted < MAX_PER_RUN) {
      const n = await this.prisma.$executeRaw`
        DELETE FROM notifications
        WHERE created_at < ${before}
        ORDER BY created_at
        LIMIT ${BATCH}`;
      deleted += n;
      if (n < BATCH) break;
      // Short pause so a big backlog never hogs the DB (load review).
      await new Promise((r) => setTimeout(r, 200));
    }
    return { deleted };
  }
}

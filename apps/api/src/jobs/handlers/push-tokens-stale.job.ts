import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { heldSqlFor } from '../../common/privacy/legal-hold';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';
import {
  deleteInBatches,
  retentionPace,
  type RetentionPace,
} from '../../modules/storage/retention-batches';

/**
 * G10 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): stale push tokens.
 * Firebase, "Best practices for FCM registration token management" (read
 * 25.11.2026): keep a timestamp per token, refresh it at least monthly, and
 * remove tokens past your staleness window; FCM itself expires an Android
 * token after 270 days without a connection. The app re-registers every 7
 * days while it is used (push_registrar.dart `reregisterAfter`), so only a
 * device nobody opened for `push.token_stale_days` (default 270) is
 * removed; 0 = never. Until now only UNREGISTERED answers and rows over the
 * device cap were deleted, so a dead token was sent to on every push.
 * Batches and pause: the shared storage.retention_* settings. VoIP tokens
 * (calls) are not touched. A person under a legal hold keeps their rows
 * (owner 2026-10-28: every deleting job respects a hold).
 */
@Injectable()
export class PushTokensStaleJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
  ) {}

  async run(now: Date = new Date()): Promise<{ deleted: number }> {
    const days = Math.floor(
      await this.settings.number('push.token_stale_days'),
    );
    if (!(days > 0)) return { deleted: 0 };
    const before = new Date(now.getTime() - days * 24 * 3600 * 1000);
    const held = await heldSqlFor(this.prisma);
    const pace = await retentionPace(this.settings);
    // Two databases: a token lives with its user (user family).
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
    // push_tokens_last_seen_at_idx (prisma/concurrent) keeps each batch an
    // index range scan.
    return deleteInBatches(async (limit) => {
      const [gone] = await this.prisma.$queryRaw<{ n: bigint }[]>`
        WITH gone AS (
          DELETE FROM push_tokens
          WHERE id IN (
            SELECT id FROM push_tokens
            WHERE last_seen_at < ${before}
              AND NOT ${held('user', Prisma.sql`user_id`)}
            ORDER BY last_seen_at
            LIMIT ${limit})
          RETURNING 1)
        SELECT count(*)::INT8 AS n FROM gone`;
      return Number(gone?.n ?? 0);
    }, pace);
  }
}

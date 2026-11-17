import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PinoLogger } from 'nestjs-pino';
import type { AppSettingKey } from '../../common/app-settings/app-settings.defaults';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { heldSqlFor } from '../../common/privacy/legal-hold';
import { PrismaService } from '../../prisma/prisma.service';

/** Default of `sessions.revoked_retention_days`: terminally revoked rows
 * (logout, logout_all, reuse_detected, admin block, account deletion) are
 * kept this long for incident review and the new-device signal, then
 * removed even if their refresh expiry is later. docs/02 §6.4 only fixes
 * the daily cadence. */
export const REVOKED_SESSION_RETENTION_DAYS = 30;

/** Default of `sessions.cleanup_batch`: rows scanned per statement, one
 * short implicit transaction each (docs/02 §1.1 "Транзакции короткие",
 * backfills in 1000-5000 batches). */
export const SESSION_CLEANUP_BATCH = 1000;

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export interface SessionsCleanupResult {
  scanned: number;
  deleted: number;
}

interface BatchRow {
  last_id: string | null;
  scanned: bigint;
  deleted: bigint;
}

/**
 * docs/02_DATABASE.md §6.4: "Токены/сессии/OTP: истёкшие сессии чистятся
 * раз в сутки".
 *
 * Deletes a session row when
 *  - its refresh token has expired (`expires_at < now`) — nothing can use
 *    it any more, whatever its revocation state; or
 *  - it was terminally revoked more than REVOKED_SESSION_RETENTION_DAYS
 *    ago. Rows revoked as 'rotated' are NOT removed early: a replay of a
 *    rotated token is how refresh-token reuse is detected (SessionService.
 *    rotate), so they must live until their own expiry.
 *
 * Walks the table in primary-key order in fixed-size batches instead of
 * relying on an index over expires_at: sessions is a high-write table and
 * expires_at is monotonic, so a plain index on it would be a write
 * hot-spot (§1.1) — the same trade-off a row-level TTL
 * makes. Each batch is one statement: scan ≤ N rows by PK range, delete
 * the doomed ones among them. Push and VoIP tokens are never removed here:
 * every refresh moves them to the chain's newest row (SessionService.
 * rotate, DB scale review 14.11), so the foreign-key cascade (indexed since
 * then) only takes the tokens of a chain that has ended. With the families
 * in different databases there is no key: the token of an ended chain is
 * dropped when the next push finds it dead (push-tokens / voip-tokens).
 *
 * Runs on the `cron-heavy` lane (jobs.constants HEAVY_JOBS): it reads the
 * whole table every night and must not hold the hourly jobs of `cron`.
 *
 * Idempotent and safe to run concurrently: a second runner only finds
 * fewer rows to delete.
 */
@Injectable()
export class SessionsCleanupJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly settings: AppSettingsService,
  ) {
    this.logger.setContext(SessionsCleanupJob.name);
  }

  /** [now] and [batchSize] are for tests; the job reads its owner settings
   * `sessions.cleanup_batch` and `sessions.revoked_retention_days`. */
  async run(
    now: Date = new Date(),
    batchSize?: number,
  ): Promise<SessionsCleanupResult> {
    const [batchSetting, retentionDays] = await Promise.all([
      this.setting('sessions.cleanup_batch', SESSION_CLEANUP_BATCH),
      this.setting(
        'sessions.revoked_retention_days',
        REVOKED_SESSION_RETENTION_DAYS,
      ),
    ]);
    batchSize ??= batchSetting;
    const held = await heldSqlFor(this.prisma);
    const revokedBefore = new Date(
      now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
    );
    let cursor = ZERO_UUID;
    let scanned = 0;
    let deleted = 0;

    for (;;) {
      const [row] = await this.prisma.$queryRaw<BatchRow[]>(Prisma.sql`
        WITH batch AS (
          SELECT id, user_id, expires_at, revoked_at, revoked_reason
          FROM sessions
          WHERE id > ${cursor}::UUID
          ORDER BY id
          LIMIT ${batchSize}
        ),
        doomed AS (
          DELETE FROM sessions
          WHERE id IN (
            SELECT id FROM batch
            WHERE (expires_at < ${now}
               OR (revoked_at < ${revokedBefore}
                   AND revoked_reason IS DISTINCT FROM 'rotated'))
              AND NOT ${held('user', Prisma.sql`batch.user_id`)}
          )
          RETURNING id
        )
        SELECT (SELECT id FROM batch ORDER BY id DESC LIMIT 1)::TEXT AS last_id,
               (SELECT count(*) FROM batch) AS scanned,
               (SELECT count(*) FROM doomed) AS deleted`);

      const batchScanned = Number(row?.scanned ?? 0);
      scanned += batchScanned;
      deleted += Number(row?.deleted ?? 0);
      if (batchScanned < batchSize || !row?.last_id) break;
      cursor = row.last_id;
    }

    this.logger.info(
      { scanned, deleted, batchSize },
      'sessions cleanup finished',
    );
    return { scanned, deleted };
  }

  /** A positive whole number from the owner settings, else [fallback]. */
  private async setting(key: AppSettingKey, fallback: number): Promise<number> {
    const v = await this.settings.number(key).catch(() => Number.NaN);
    return Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
  }
}

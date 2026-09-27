import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';

/** Terminally revoked rows (logout, logout_all, reuse_detected, admin
 * block, account deletion) are kept this long for incident review and the
 * new-device signal, then removed even if their refresh expiry is later.
 * Engineering judgment — docs/02 §6.4 only fixes the daily cadence. */
export const REVOKED_SESSION_RETENTION_DAYS = 30;

/** Rows scanned per statement: one short implicit transaction each
 * (docs/02 §1.1 "Транзакции короткие", backfills in 1000-5000 batches). */
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
 * hot-spot (§1.1) — the same trade-off CockroachDB's own row-level TTL
 * makes. Each batch is one statement: scan ≤ N rows by PK range, delete
 * the doomed ones among them. push_tokens rows go with their session
 * (FK ON DELETE CASCADE, stage 2.5).
 *
 * Idempotent and safe to run concurrently: a second runner only finds
 * fewer rows to delete.
 */
@Injectable()
export class SessionsCleanupJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SessionsCleanupJob.name);
  }

  async run(
    now: Date = new Date(),
    batchSize: number = SESSION_CLEANUP_BATCH,
  ): Promise<SessionsCleanupResult> {
    const revokedBefore = new Date(
      now.getTime() - REVOKED_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    let cursor = ZERO_UUID;
    let scanned = 0;
    let deleted = 0;

    for (;;) {
      const [row] = await this.prisma.$queryRaw<BatchRow[]>(Prisma.sql`
        WITH batch AS (
          SELECT id, expires_at, revoked_at, revoked_reason
          FROM sessions
          WHERE id > ${cursor}::UUID
          ORDER BY id
          LIMIT ${batchSize}
        ),
        doomed AS (
          DELETE FROM sessions
          WHERE id IN (
            SELECT id FROM batch
            WHERE expires_at < ${now}
               OR (revoked_at < ${revokedBefore}
                   AND revoked_reason IS DISTINCT FROM 'rotated')
          )
          RETURNING id
        )
        SELECT (SELECT max(id) FROM batch)::STRING AS last_id,
               (SELECT count(*) FROM batch) AS scanned,
               (SELECT count(*) FROM doomed) AS deleted`);

      const batchScanned = Number(row?.scanned ?? 0);
      scanned += batchScanned;
      deleted += Number(row?.deleted ?? 0);
      if (batchScanned < batchSize || !row?.last_id) break;
      cursor = row.last_id;
    }

    this.logger.info({ scanned, deleted }, 'sessions cleanup finished');
    return { scanned, deleted };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { forEachDatabase } from '../../sharding/for-each-database';
import { readsAreSplit } from '../../sharding/split-reads';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { emitOnce } from './reminder-claim';

/** A case closed up to this many days before the reminder cutoff still
 * gets its reminder, so a job outage of a few days loses nothing; older
 * cases are not nagged weeks late. Engineering judgment — docs/03 §7.3
 * only says "через 7 дней". */
export const REVIEW_REMINDER_GRACE_DAYS = 3;
export const REVIEW_REMINDER_BATCH = 500;

const DAY_SEC = 24 * 60 * 60;
const DAY_MS = DAY_SEC * 1000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface DueRow {
  case_id: string;
  client_id: string;
  attorney_id: string;
}

export interface ReviewReminderResult {
  sent: number;
}

/**
 * docs/03 §7.3: "Если отзыв не оставлен, через 7 дней приходит одно
 * напоминание того же типа" (`review_requested`, delay =
 * app_config review.reminder_after_days).
 *
 * Due = case `closed` between (cutoff - grace, cutoff], with its accepted
 * bid, an active client, no review, and no reminder yet. "No reminder yet"
 * is read from the notifications table itself (payload.caseId +
 * payload.reminder = true), so reruns, retries and concurrent runners
 * never send a second one — no extra state column (docs/03 §10 allows no
 * other schema changes). Walks cases by primary key in batches so a row
 * whose emit fails can't loop the job. Overlapping runs: each emit is
 * guarded by an atomic Redis claim `reminder:review:<caseId>` (TTL past
 * the grace window), since the NOT EXISTS read alone races.
 *
 * Query cost note: there is no cases(status, closed_at) index (file 04
 * owns that table's indexes); the scan is bounded to closed cases.
 */
@Injectable()
export class ReviewReminderJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly notifications: NotificationsService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.logger.setContext(ReviewReminderJob.name);
  }

  async run(
    now: Date = new Date(),
    batchSize: number = REVIEW_REMINDER_BATCH,
  ): Promise<ReviewReminderResult> {
    const afterDays = await this.settings.number('review.reminder_after_days');
    const cutoff = new Date(now.getTime() - afterDays * DAY_MS);
    const floor = new Date(
      cutoff.getTime() - REVIEW_REMINDER_GRACE_DAYS * DAY_MS,
    );
    let sent = 0;
    // A case stays due for at most the grace window; keep the claim longer.
    const claimTtl = (REVIEW_REMINDER_GRACE_DAYS + 1) * DAY_SEC;

    const split = readsAreSplit(this.prisma);
    // Shard-ready step 8: cases, bids and reviews sit on the shard
    // databases, so each one is walked in turn (one database: once).
    await forEachDatabase(this.prisma, async () => {
      let cursor = ZERO_UUID;
      for (;;) {
        const page = split
          ? await this.dueSplit(cutoff, floor, cursor, batchSize)
          : null;
        const due = page
          ? page.due
          : await this.prisma.$queryRaw<DueRow[]>(Prisma.sql`
        SELECT c.id::TEXT AS case_id,
               c.client_id::TEXT AS client_id,
               b.attorney_id::TEXT AS attorney_id
        FROM cases AS c
        JOIN bids AS b ON b.id = c.accepted_bid_id AND b.status = 'accepted'
        JOIN users AS u ON u.id = c.client_id
          AND u.deleted_at IS NULL AND u.status = 'active'
        WHERE c.status = 'closed'
          AND c.deleted_at IS NULL
          AND c.closed_at <= ${cutoff}
          AND c.closed_at > ${floor}
          AND c.id > ${cursor}::UUID
          AND NOT EXISTS (SELECT 1 FROM reviews AS r WHERE r.case_id = c.id)
          AND NOT EXISTS (
            SELECT 1 FROM notifications AS n
            WHERE n.user_id = c.client_id
              AND n.type = 'review_requested'
              AND n.payload->>'caseId' = c.id::TEXT
              AND n.payload->>'reminder' = 'true')
        ORDER BY c.id
        LIMIT ${batchSize}`);

        for (const row of due) {
          const emitted = await emitOnce(
            this.redis,
            `reminder:review:${row.case_id}`,
            claimTtl,
            () =>
              this.notifications.emit({
                type: 'review_requested',
                recipientId: row.client_id,
                payload: {
                  caseId: row.case_id,
                  attorneyId: row.attorney_id,
                  reminder: true,
                },
              }),
          );
          if (emitted) sent += 1;
        }
        if (page) {
          if (!page.full || !page.lastId) break;
          cursor = page.lastId;
          continue;
        }
        const last = due[due.length - 1];
        if (due.length < batchSize || !last) break;
        cursor = last.case_id;
      }
    });

    this.logger.info({ sent }, 'review reminders sent');
    return { sent };
  }

  /**
   * The due list when the case family and the global one are on different
   * databases: the case-family part (closed case, accepted bid, no review)
   * on this database, then the client's status (global) and the earlier
   * reminder (notifications: the client's shard) in two more reads. The
   * cursor still walks the candidates, so a filtered row cannot loop.
   */
  private async dueSplit(
    cutoff: Date,
    floor: Date,
    cursor: string,
    batchSize: number,
  ): Promise<{ due: DueRow[]; lastId: string | null; full: boolean }> {
    const cand = await this.prisma.$queryRaw<DueRow[]>(Prisma.sql`
      SELECT c.id::TEXT AS case_id,
             c.client_id::TEXT AS client_id,
             b.attorney_id::TEXT AS attorney_id
      FROM cases AS c
      JOIN bids AS b ON b.id = c.accepted_bid_id AND b.status = 'accepted'
      WHERE c.status = 'closed'
        AND c.deleted_at IS NULL
        AND c.closed_at <= ${cutoff}
        AND c.closed_at > ${floor}
        AND c.id > ${cursor}::UUID
        AND NOT EXISTS (SELECT 1 FROM reviews AS r WHERE r.case_id = c.id)
      ORDER BY c.id
      LIMIT ${batchSize}`);
    if (cand.length === 0) return { due: [], lastId: null, full: false };
    const clientIds = [...new Set(cand.map((r) => r.client_id))];
    const active = new Set(
      (
        await this.prisma.user.findMany({
          where: { id: { in: clientIds }, deleted_at: null, status: 'active' },
          select: { id: true },
        })
      ).map((u) => u.id),
    );
    const caseIds = cand.map((r) => r.case_id);
    const reminded = new Set(
      (
        await forEachDatabase(
          this.prisma,
          () =>
            this.prisma.$queryRaw<{ case_id: string }[]>`
            SELECT n.payload->>'caseId' AS case_id FROM notifications AS n
            WHERE n.user_id = ANY(${clientIds}::UUID[])
              AND n.type = 'review_requested'
              AND n.payload->>'caseId' = ANY(${caseIds}::TEXT[])
              AND n.payload->>'reminder' = 'true'`,
        )
      )
        .flat()
        .map((r) => r.case_id),
    );
    const due = cand.filter(
      (r) => active.has(r.client_id) && !reminded.has(r.case_id),
    );
    return {
      due,
      lastId: cand[cand.length - 1].case_id,
      full: cand.length >= batchSize,
    };
  }
}

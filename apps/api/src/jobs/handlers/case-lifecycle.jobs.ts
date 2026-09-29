import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { CaseLifecycleService } from '../../modules/cases/lifecycle/case-lifecycle.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { withJobLock } from './job-lock';
import { emitOnce } from './reminder-claim';

/** docs/04 §10.2: "работают батчами (500 кейсов за прогон)". */
export const CASE_JOB_BATCH = 500;
/** §10.2: no activity for 30 days → "Кейс ещё актуален?". */
export const STALE_AFTER_DAYS = 30;
/** §10.2: 14 days after the prompt without activity → archived. */
export const ARCHIVE_AFTER_PROMPT_DAYS = 14;
/** §10.2: remind the attorney when ≤ 24 h remain before auto_close_at. */
export const COMPLETION_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Hourly jobs: a lock outliving one run, released at the end. */
const LOCK_TTL_MS = 55 * 60 * 1000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export interface CaseJobResult {
  processed: number;
  /** false: another run held the lock, nothing was done. */
  ran: boolean;
}

interface KeyRow {
  id: string;
  at: Date;
}

/**
 * Walks due case ids in keyset order (`at`, `id`) in batches of
 * CASE_JOB_BATCH so a case whose action returns false (raced) or throws
 * can't make the job loop, and each query stays on the §10.2 partial
 * indexes. `act` re-checks the due condition under the row lock.
 */
async function walk(
  fetch: (after: KeyRow) => Promise<KeyRow[]>,
  act: (id: string) => Promise<boolean>,
): Promise<number> {
  let cursor: KeyRow = { id: ZERO_UUID, at: new Date(0) };
  let processed = 0;
  for (;;) {
    const rows = await fetch(cursor);
    for (const row of rows) {
      if (await act(row.id)) processed += 1;
    }
    const last = rows[rows.length - 1];
    if (rows.length < CASE_JOB_BATCH || !last) return processed;
    cursor = last;
  }
}

/** §10.2 "Напоминание об актуальности" (hourly). */
@Injectable()
export class CaseStalePromptJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: CaseLifecycleService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.logger.setContext(CaseStalePromptJob.name);
  }

  async run(now: Date = new Date()): Promise<CaseJobResult> {
    const inactiveBefore = new Date(now.getTime() - STALE_AFTER_DAYS * DAY_MS);
    const processed = await withJobLock(
      this.redis,
      'cases.stale-prompt',
      LOCK_TTL_MS,
      () =>
        walk(
          (after) =>
            this.prisma.$queryRaw<KeyRow[]>(Prisma.sql`
              SELECT id::STRING AS id, last_activity_at AS at FROM cases
              WHERE status = 'open' AND deleted_at IS NULL
                AND stale_prompt_sent_at IS NULL
                AND last_activity_at < ${inactiveBefore}
                AND (last_activity_at, id) > (${after.at}, ${after.id}::UUID)
              ORDER BY last_activity_at, id
              LIMIT ${CASE_JOB_BATCH}`),
          (id) => this.lifecycle.sendStalePrompt(id, now, inactiveBefore),
        ),
    );
    this.logger.info({ processed }, 'case stale prompts');
    return { processed: processed ?? 0, ran: processed !== null };
  }
}

/** §10.2 "Автоархивация" (hourly). */
@Injectable()
export class CaseAutoArchiveJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: CaseLifecycleService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.logger.setContext(CaseAutoArchiveJob.name);
  }

  async run(now: Date = new Date()): Promise<CaseJobResult> {
    const promptedBefore = new Date(
      now.getTime() - ARCHIVE_AFTER_PROMPT_DAYS * DAY_MS,
    );
    const processed = await withJobLock(
      this.redis,
      'cases.auto-archive',
      LOCK_TTL_MS,
      () =>
        walk(
          (after) =>
            this.prisma.$queryRaw<KeyRow[]>(Prisma.sql`
              SELECT id::STRING AS id, last_activity_at AS at FROM cases
              WHERE status = 'open' AND deleted_at IS NULL
                AND stale_prompt_sent_at < ${promptedBefore}
                AND last_activity_at <= stale_prompt_sent_at
                AND (last_activity_at, id) > (${after.at}, ${after.id}::UUID)
              ORDER BY last_activity_at, id
              LIMIT ${CASE_JOB_BATCH}`),
          (id) => this.lifecycle.autoArchive(id, now, promptedBefore),
        ),
    );
    this.logger.info({ processed }, 'cases auto-archived');
    return { processed: processed ?? 0, ran: processed !== null };
  }
}

/** §10.2 "Автозакрытие" (hourly). */
@Injectable()
export class CaseAutoCloseJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: CaseLifecycleService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.logger.setContext(CaseAutoCloseJob.name);
  }

  async run(now: Date = new Date()): Promise<CaseJobResult> {
    const processed = await withJobLock(
      this.redis,
      'cases.auto-close',
      LOCK_TTL_MS,
      () =>
        walk(
          (after) =>
            this.prisma.$queryRaw<KeyRow[]>(Prisma.sql`
              SELECT id::STRING AS id, auto_close_at AS at FROM cases
              WHERE status = 'pending_completion' AND deleted_at IS NULL
                AND auto_close_at <= ${now}
                AND (auto_close_at, id) > (${after.at}, ${after.id}::UUID)
              ORDER BY auto_close_at, id
              LIMIT ${CASE_JOB_BATCH}`),
          (id) => this.lifecycle.autoClose(id, now),
        ),
    );
    this.logger.info({ processed }, 'cases auto-closed');
    return { processed: processed ?? 0, ran: processed !== null };
  }
}

interface ReminderRow extends KeyRow {
  attorney_id: string;
}

/**
 * §10.2 "Напоминание адвокату" (hourly): pending_completion with ≤ 24 h
 * left and no reminder yet → `completion_reminder` to the accepted
 * attorney. "No reminder yet" is read from the notifications table (no
 * extra column: stage 4.1 owns file 04's only migration); overlapping
 * emits are closed by an atomic Redis claim, as in the review reminder.
 */
@Injectable()
export class CaseCompletionReminderJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.logger.setContext(CaseCompletionReminderJob.name);
  }

  async run(now: Date = new Date()): Promise<CaseJobResult> {
    const until = new Date(now.getTime() + COMPLETION_REMINDER_WINDOW_MS);
    // A case stays due for at most the window; keep the claim a bit longer.
    const claimTtlSec = (2 * COMPLETION_REMINDER_WINDOW_MS) / 1000;
    const processed = await withJobLock(
      this.redis,
      'cases.completion-reminder',
      LOCK_TTL_MS,
      async () => {
        let sent = 0;
        let cursor: KeyRow = { id: ZERO_UUID, at: new Date(0) };
        for (;;) {
          const rows = await this.prisma.$queryRaw<ReminderRow[]>(Prisma.sql`
            SELECT c.id::STRING AS id, c.auto_close_at AS at,
                   b.attorney_id::STRING AS attorney_id
            FROM cases AS c
            JOIN bids AS b ON b.id = c.accepted_bid_id
            WHERE c.status = 'pending_completion' AND c.deleted_at IS NULL
              AND c.auto_close_at > ${now}
              AND c.auto_close_at <= ${until}
              AND (c.auto_close_at, c.id) > (${cursor.at}, ${cursor.id}::UUID)
              AND NOT EXISTS (
                SELECT 1 FROM notifications AS n
                WHERE n.user_id = b.attorney_id
                  AND n.type = 'completion_reminder'
                  AND n.payload->>'caseId' = c.id::STRING)
            ORDER BY c.auto_close_at, c.id
            LIMIT ${CASE_JOB_BATCH}`);
          for (const row of rows) {
            const emitted = await emitOnce(
              this.redis,
              `reminder:completion:${row.id}`,
              claimTtlSec,
              () =>
                this.notifications.emit({
                  type: 'completion_reminder',
                  recipientId: row.attorney_id,
                  payload: {
                    caseId: row.id,
                    autoCloseAt: row.at.toISOString(),
                  },
                }),
            );
            if (emitted) sent += 1;
          }
          const last = rows[rows.length - 1];
          if (rows.length < CASE_JOB_BATCH || !last) return sent;
          cursor = last;
        }
      },
    );
    this.logger.info({ processed }, 'completion reminders');
    return { processed: processed ?? 0, ran: processed !== null };
  }
}

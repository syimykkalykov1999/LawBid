import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  isClientDaytime,
  loadStaleTimers,
  shouldAsk,
} from '../../modules/cases/domain/case-staleness';
import { CaseLifecycleService } from '../../modules/cases/lifecycle/case-lifecycle.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { withJobLock } from './job-lock';
import { emitOnce } from './reminder-claim';

const DAY_MS = 24 * 60 * 60 * 1000;

/** docs/04 §10.2: "работают батчами (500 кейсов за прогон)". */
export const CASE_JOB_BATCH = 500;
/** §10.2: remind the attorney when ≤ 24 h remain before auto_close_at. */
export const COMPLETION_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

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
 * CASE_JOB_BATCH on the §10.2 partial indexes. `act` re-checks the due
 * condition under the row lock and returns false when a case is no longer
 * due. A case whose action throws is logged and skipped — it can never
 * stop the run or starve the cases after it (load review, file 04).
 */
async function walk(
  fetch: (after: KeyRow) => Promise<KeyRow[]>,
  act: (id: string) => Promise<boolean>,
  onError: (id: string, error: unknown) => void,
): Promise<number> {
  let cursor: KeyRow = { id: ZERO_UUID, at: new Date(0) };
  let processed = 0;
  for (;;) {
    const rows = await fetch(cursor);
    for (const row of rows) {
      try {
        if (await act(row.id)) processed += 1;
      } catch (error) {
        onError(row.id, error);
      }
    }
    const last = rows[rows.length - 1];
    if (rows.length < CASE_JOB_BATCH || !last) return processed;
    cursor = last;
  }
}

function logFailure(logger: PinoLogger, job: string) {
  return (caseId: string, error: unknown) =>
    logger.error(
      {
        job,
        caseId,
        err: error instanceof Error ? error.message : String(error),
      },
      'case job step failed; skipped',
    );
}

interface AskRow {
  id: string;
  client_id: string;
  urgency: string | null;
  deadline_at: Date | null;
  client_active_at: Date;
  stale_prompt_sent_at: Date | null;
  at: Date;
}

/**
 * Owner 2026-10-17/18 (OQ-054), hourly: «Вам ещё нужен адвокат?».
 *
 * A case is due when its client has been silent (no action of their own,
 * attorney bids never count) for the first timer of its urgency
 * (`cases.stale_ask_days_*`; a «по дате» case: the date has passed).
 * Per client at most ONE notification per run, grouping their due cases
 * ("2 ваших кейса ждут ответа"); only in the client's daytime (09:00–21:00
 * in their time zone, else US Eastern; otherwise the next hourly run
 * takes it); not when the case got new bids in the silent window; never
 * twice for the same silent period. In-app + push only, never SMS.
 * Also the launch cleanup: the same rules, sent when each case's own
 * timer has run out.
 */
@Injectable()
export class CaseStaleAskJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: CaseLifecycleService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(CaseStaleAskJob.name);
  }

  async run(now: Date = new Date()): Promise<CaseJobResult> {
    const timers = await loadStaleTimers(this.settings);
    const minAsk = Math.min(...Object.values(timers.askDays));
    const silentBefore = new Date(now.getTime() - minAsk * DAY_MS);
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const processed = await withJobLock(
      this.redis,
      'cases.stale-ask',
      LOCK_TTL_MS,
      async () => {
        // 1. Due cases, grouped by client.
        const byClient = new Map<string, string[]>();
        let cursor: KeyRow = { id: ZERO_UUID, at: new Date(0) };
        for (;;) {
          const rows = await this.prisma.$queryRaw<AskRow[]>(Prisma.sql`
            SELECT id::TEXT AS id, client_id::TEXT AS client_id, urgency,
                   deadline_at, client_active_at, stale_prompt_sent_at,
                   client_active_at AS at
            FROM cases
            WHERE status = 'open' AND deleted_at IS NULL AND paused_at IS NULL
              AND (stale_prompt_sent_at IS NULL
                   OR stale_prompt_sent_at < client_active_at)
              AND (client_active_at < ${silentBefore}
                   OR (urgency = 'by_date' AND deadline_at < ${today}))
              AND (client_active_at, id) > (${cursor.at}, ${cursor.id}::UUID)
            ORDER BY client_active_at, id
            LIMIT ${CASE_JOB_BATCH}`);
          for (const r of rows) {
            const due = shouldAsk(
              {
                urgency: r.urgency,
                deadlineAt: r.deadline_at,
                clientActiveAt: r.client_active_at,
                promptSentAt: r.stale_prompt_sent_at,
                pausedAt: null,
              },
              timers,
              now,
            );
            if (!due) continue;
            const list = byClient.get(r.client_id) ?? [];
            list.push(r.id);
            byClient.set(r.client_id, list);
          }
          const last = rows[rows.length - 1];
          if (rows.length < CASE_JOB_BATCH || !last) break;
          cursor = last;
        }
        // 2. Only clients in their daytime.
        const zones = await this.timeZones([...byClient.keys()]);
        let asked = 0;
        for (const [clientId, caseIds] of byClient) {
          if (!isClientDaytime(now, zones.get(clientId))) continue;
          try {
            asked += (
              await this.lifecycle.askStillNeeded(
                clientId,
                caseIds,
                now,
                timers,
              )
            ).length;
          } catch (error) {
            this.logger.error(
              {
                job: 'cases.stale-ask',
                clientId,
                err: error instanceof Error ? error.message : String(error),
              },
              'stale question failed; skipped',
            );
          }
        }
        return asked;
      },
    );
    this.logger.info({ processed }, 'case stale questions');
    return { processed: processed ?? 0, ran: processed !== null };
  }

  /** The clients' own time zone (their quiet-hours setting), if any. */
  private async timeZones(clientIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (let i = 0; i < clientIds.length; i += 1000) {
      const rows = await this.prisma.notificationQuietHours.findMany({
        where: { user_id: { in: clientIds.slice(i, i + 1000) } },
        select: { user_id: true, timezone: true },
      });
      for (const r of rows) out.set(r.user_id, r.timezone);
    }
    return out;
  }
}

/**
 * OQ-054 (hourly): the silent part. A case whose question went unanswered
 * (and nothing happened since) for the second timer
 * (`cases.stale_pause_days_*`; «по дате»: N days after the date) is
 * paused — hidden from the attorneys' feed and search, no push. A case
 * paused for `cases.stale_archive_after_pause_days` is archived like the
 * old auto-archive.
 */
@Injectable()
export class CaseStalePauseJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: CaseLifecycleService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(CaseStalePauseJob.name);
  }

  async run(now: Date = new Date()): Promise<CaseJobResult> {
    const timers = await loadStaleTimers(this.settings);
    const pausedBefore = new Date(
      now.getTime() - timers.archiveAfterPauseDays * DAY_MS,
    );
    const processed = await withJobLock(
      this.redis,
      'cases.stale-pause',
      LOCK_TTL_MS,
      async () => {
        const paused = await walk(
          (after) =>
            this.prisma.$queryRaw<KeyRow[]>(Prisma.sql`
              SELECT id::TEXT AS id, stale_prompt_sent_at AS at
              FROM cases
              WHERE status = 'open' AND deleted_at IS NULL
                AND paused_at IS NULL
                AND stale_prompt_sent_at IS NOT NULL
                AND stale_prompt_sent_at >= client_active_at
                AND stale_prompt_sent_at <= ${now}
                AND (stale_prompt_sent_at, id) > (${after.at}, ${after.id}::UUID)
              ORDER BY stale_prompt_sent_at, id
              LIMIT ${CASE_JOB_BATCH}`),
          (id) => this.lifecycle.pauseStale(id, now, timers),
          logFailure(this.logger, 'cases.stale-pause'),
        );
        const archived = await walk(
          (after) =>
            this.prisma.$queryRaw<KeyRow[]>(Prisma.sql`
              SELECT id::TEXT AS id, paused_at AS at
              FROM cases
              WHERE status = 'open' AND deleted_at IS NULL
                AND paused_at IS NOT NULL
                AND paused_at <= ${pausedBefore}
                AND (paused_at, id) > (${after.at}, ${after.id}::UUID)
              ORDER BY paused_at, id
              LIMIT ${CASE_JOB_BATCH}`),
          (id) => this.lifecycle.archivePaused(id, now, timers),
          logFailure(this.logger, 'cases.stale-archive'),
        );
        this.logger.info({ paused, archived }, 'case stale pause / archive');
        return paused + archived;
      },
    );
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
              SELECT id::TEXT AS id, auto_close_at AS at FROM cases
              WHERE status = 'pending_completion' AND deleted_at IS NULL
                AND auto_close_at <= ${now}
                AND (auto_close_at, id) > (${after.at}, ${after.id}::UUID)
              ORDER BY auto_close_at, id
              LIMIT ${CASE_JOB_BATCH}`),
          (id) => this.lifecycle.autoClose(id, now),
          logFailure(this.logger, 'cases.auto-close'),
        ),
    );
    this.logger.info({ processed }, 'cases auto-closed');
    return { processed: processed ?? 0, ran: processed !== null };
  }
}

interface ReminderRow extends KeyRow {
  /** The party who has NOT marked "Done" yet. */
  recipient_id: string;
}

/**
 * §10.2 "Напоминание адвокату" (hourly): pending_completion with ≤ 24 h
 * left and no reminder yet → `completion_reminder` to the party who has
 * not marked "Done" (the accepted attorney, or the client when the
 * attorney marked first), at most once: an atomic Redis claim per case whose TTL (48 h)
 * outlives the 24 h window (no notifications scan per case — load review).
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
            SELECT c.id::TEXT AS id, c.auto_close_at AS at,
                   (CASE WHEN c.attorney_confirmed_at IS NOT NULL
                              AND c.client_completed_at IS NULL
                         THEN c.client_id ELSE b.attorney_id END
                   )::TEXT AS recipient_id
            FROM cases AS c
            JOIN bids AS b ON b.id = c.accepted_bid_id
            WHERE c.status = 'pending_completion' AND c.deleted_at IS NULL
              AND c.auto_close_at > ${now}
              AND c.auto_close_at <= ${until}
              AND (c.auto_close_at, c.id) > (${cursor.at}, ${cursor.id}::UUID)
            ORDER BY c.auto_close_at, c.id
            LIMIT ${CASE_JOB_BATCH}`);
          for (const row of rows) {
            try {
              const emitted = await emitOnce(
                this.redis,
                `reminder:completion:${row.id}`,
                claimTtlSec,
                () =>
                  this.notifications.emit({
                    type: 'completion_reminder',
                    recipientId: row.recipient_id,
                    payload: {
                      caseId: row.id,
                      autoCloseAt: row.at.toISOString(),
                    },
                  }),
              );
              if (emitted) sent += 1;
            } catch (error) {
              logFailure(this.logger, 'cases.completion-reminder')(
                row.id,
                error,
              );
            }
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

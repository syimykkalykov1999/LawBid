import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma, type NotificationType } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { isoDate } from '../../modules/cases/domain/case-urgency';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { CASE_JOB_BATCH, type CaseJobResult } from './case-lifecycle.jobs';
import { withJobLock } from './job-lock';
import { emitOnce } from './reminder-claim';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_TTL_MS = 55 * 60 * 1000;
/** A claim outlives the day it is sent on (the job runs daily). */
const CLAIM_TTL_SEC = 3 * 24 * 60 * 60;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface DueRow {
  id: string;
  client_id: string;
  attorney_id: string | null;
}

/**
 * Owner 2026-10-05 (daily): a case with a date (court hearing, filing
 * deadline…) reminds the client and the hired attorney
 * `cases.deadline_reminder_days` before it (`case_deadline_soon`, with
 * {days}; `case_deadline_today` on the day). The day after the date, a
 * client still without an attorney is asked to update it
 * (`case_deadline_passed`). Each reminder goes out once per case, date,
 * day and person (Redis claim; a moved date gets its own reminders).
 * `cases.deadline_reminders_auto` off stops them all.
 */
@Injectable()
export class CaseDeadlineReminderJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(CaseDeadlineReminderJob.name);
  }

  async run(now: Date = new Date()): Promise<CaseJobResult> {
    if (
      this.settings &&
      !(await this.settings.boolean('cases.deadline_reminders_auto'))
    ) {
      return { processed: 0, ran: false };
    }
    const days = this.settings
      ? await this.settings.numberList('cases.deadline_reminder_days')
      : [7, 3, 1, 0];
    const today = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const processed = await withJobLock(
      this.redis,
      'cases.deadline-reminder',
      LOCK_TTL_MS,
      async () => {
        let sent = 0;
        for (const d of [...new Set(days)].filter((x) => x >= 0)) {
          sent += await this.remind(
            new Date(today + d * DAY_MS),
            ['open', 'in_progress', 'pending_completion'],
            true,
            d === 0 ? 'case_deadline_today' : 'case_deadline_soon',
            d,
          );
        }
        // Yesterday's date passed and nobody is hired: ask the client.
        sent += await this.remind(
          new Date(today - DAY_MS),
          ['open'],
          false,
          'case_deadline_passed',
          -1,
        );
        return sent;
      },
    );
    this.logger.info({ processed }, 'case deadline reminders');
    return { processed: processed ?? 0, ran: processed !== null };
  }

  private async remind(
    date: Date,
    statuses: string[],
    withAttorney: boolean,
    type: NotificationType,
    days: number,
  ): Promise<number> {
    const day = isoDate(date);
    let sent = 0;
    let after = ZERO_UUID;
    for (;;) {
      const rows = await this.prisma.$queryRaw<DueRow[]>(Prisma.sql`
        SELECT c.id::TEXT AS id, c.client_id::TEXT AS client_id,
               b.attorney_id::TEXT AS attorney_id
        FROM cases AS c
        LEFT JOIN bids AS b ON b.id = c.accepted_bid_id
        WHERE c.deadline_at = ${day}::DATE
          AND c.deleted_at IS NULL
          AND c.status::TEXT = ANY(${statuses}::TEXT[])
          AND c.id > ${after}::UUID
        ORDER BY c.id
        LIMIT ${CASE_JOB_BATCH}`);
      for (const row of rows) {
        const recipients = [
          row.client_id,
          ...(withAttorney && row.attorney_id ? [row.attorney_id] : []),
        ];
        for (const recipientId of recipients) {
          try {
            const emitted = await emitOnce(
              this.redis,
              `reminder:deadline:${row.id}:${day}:${days}:${recipientId}`,
              CLAIM_TTL_SEC,
              () =>
                this.notifications.emit({
                  type,
                  recipientId,
                  payload: {
                    caseId: row.id,
                    deadlineAt: day,
                    ...(days >= 0 ? { days } : {}),
                  },
                }),
            );
            if (emitted) sent += 1;
          } catch (error) {
            this.logger.warn(
              { caseId: row.id, err: String(error) },
              'cases.deadline-reminder failed',
            );
          }
        }
      }
      const last = rows[rows.length - 1];
      if (rows.length < CASE_JOB_BATCH || !last) return sent;
      after = last.id;
    }
  }
}

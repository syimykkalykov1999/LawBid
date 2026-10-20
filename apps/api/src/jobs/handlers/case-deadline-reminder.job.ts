import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma, type NotificationType } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { safeTimeZone, zonedParts } from '../../common/utils/zoned-time';
import { isoDate } from '../../modules/cases/domain/case-urgency';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { CASE_JOB_BATCH, type CaseJobResult } from './case-lifecycle.jobs';
import { withJobLock } from './job-lock';
import { emitOnce } from './reminder-claim';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Cases a deadline reminder is about (the date passes on `open` ones). */
const WATCHED = ['open', 'in_progress', 'pending_completion'];
const LOCK_TTL_MS = 55 * 60 * 1000;
/** A claim outlives the day it is sent on (the job runs daily). */
const CLAIM_TTL_SEC = 3 * 24 * 60 * 60;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface DueRow {
  id: string;
  client_id: string;
  attorney_id: string | null;
  status: string;
  deadline: string;
}

/** Local hours (inclusive start, exclusive end) in which a daily reminder
 * goes out: a morning reminder, caught up later in the day if the worker
 * was down at nine, never in the night. */
export const REMINDER_FROM_HOUR = 9;
export const REMINDER_UNTIL_HOUR = 21;

/** Whether the person's local clock is inside the reminder hours. */
export function inReminderHours(now: Date, timeZone: string): boolean {
  const h = zonedParts(now, timeZone).hour;
  return h >= REMINDER_FROM_HOUR && h < REMINDER_UNTIL_HOUR;
}

/**
 * Owner 2026-10-05 (hourly since 2026-10-20): a case with a date (court
 * hearing, filing deadline…) reminds the client and the hired attorney
 * `cases.deadline_reminder_days` before it (`case_deadline_soon`, with
 * {days}; `case_deadline_today` on the day). The day after the date, a
 * client still without an attorney is asked to update it
 * (`case_deadline_passed`). Each person is reminded on their own calendar
 * day at their own morning (09:00–21:00 local, `users.timezone`), so the
 * hourly run catches up after a missed one. Each reminder goes out once
 * per case, date, day and person (Redis claim; a moved date gets its own
 * reminders). `cases.deadline_reminders_auto` off stops them all.
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
    const days = (
      this.settings
        ? await this.settings.numberList('cases.deadline_reminder_days')
        : [7, 3, 1, 0]
    ).filter((x) => x >= 0);
    const processed = await withJobLock(
      this.redis,
      'cases.deadline-reminder',
      LOCK_TTL_MS,
      () => this.remind(now, new Set(days)),
    );
    this.logger.info({ processed }, 'case deadline reminders');
    return { processed: processed ?? 0, ran: processed !== null };
  }

  /** The zone of each person: own, else quiet hours, else UTC. */
  private async zones(ids: string[]): Promise<Map<string, string>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        timezone: true,
        quiet_hours: { select: { timezone: true } },
      },
    });
    return new Map(
      users.map((u) => [
        u.id,
        safeTimeZone(u.timezone ?? u.quiet_hours?.timezone),
      ]),
    );
  }

  private async remind(now: Date, days: Set<number>): Promise<number> {
    const farthest = Math.max(0, ...days);
    const today = isoDate(now);
    let sent = 0;
    let after = ZERO_UUID;
    for (;;) {
      // Two days of slack either side: the zones span UTC−12 … UTC+14.
      const rows = await this.prisma.$queryRaw<DueRow[]>(Prisma.sql`
        SELECT c.id::TEXT AS id, c.client_id::TEXT AS client_id,
               b.attorney_id::TEXT AS attorney_id, c.status::TEXT AS status,
               c.deadline_at::TEXT AS deadline
        FROM cases AS c
        LEFT JOIN bids AS b ON b.id = c.accepted_bid_id
        WHERE c.deadline_at BETWEEN (${today}::DATE - 2)
                                AND (${today}::DATE + ${farthest + 2}::INT)
          AND c.deleted_at IS NULL
          AND c.status::TEXT = ANY(${WATCHED}::TEXT[])
          AND c.id > ${after}::UUID
        ORDER BY c.id
        LIMIT ${CASE_JOB_BATCH}`);
      const zones = await this.zones([
        ...new Set(
          rows.flatMap((r) => [r.client_id, r.attorney_id ?? r.client_id]),
        ),
      ]);
      for (const row of rows) {
        sent += await this.remindRow(row, now, days, zones);
      }
      const last = rows[rows.length - 1];
      if (rows.length < CASE_JOB_BATCH || !last) return sent;
      after = last.id;
    }
  }

  private async remindRow(
    row: DueRow,
    now: Date,
    days: Set<number>,
    zones: Map<string, string>,
  ): Promise<number> {
    const deadline = Date.parse(`${row.deadline}T00:00:00Z`);
    const recipients = [row.client_id, row.attorney_id].filter(
      (x): x is string => !!x,
    );
    let sent = 0;
    for (const recipientId of new Set(recipients)) {
      const zone = zones.get(recipientId) ?? 'UTC';
      if (!inReminderHours(now, zone)) continue;
      const local = zonedParts(now, zone);
      const localToday = Date.UTC(local.year, local.month - 1, local.day);
      const left = Math.round((deadline - localToday) / DAY_MS);
      const isClient = recipientId === row.client_id;
      let type: NotificationType | null = null;
      if (left >= 0 && days.has(left)) {
        type = left === 0 ? 'case_deadline_today' : 'case_deadline_soon';
      } else if (left === -1 && isClient && row.status === 'open') {
        // Yesterday's date passed and nobody is hired: ask the client.
        type = 'case_deadline_passed';
      }
      if (!type) continue;
      try {
        const emitted = await emitOnce(
          this.redis,
          `reminder:deadline:${row.id}:${row.deadline}:${left}:${recipientId}`,
          CLAIM_TTL_SEC,
          () =>
            this.notifications.emit({
              type: type,
              recipientId,
              payload: {
                caseId: row.id,
                deadlineAt: row.deadline,
                ...(left >= 0 ? { days: left } : {}),
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
    return sent;
  }
}

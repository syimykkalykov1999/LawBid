import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { ConsultationsService } from './consultations.service';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A reminder later than this after its time is dropped (worker outage). */
const GRACE_MS = 2 * HOUR_MS;
const BATCH = 200;

export interface ConsultationSweepResult {
  expired: number;
  day: number;
  hour: number;
  ended: number;
}

/**
 * Owner 2026-10-20: every minute — a request nobody answered before the
 * start is declined («expired»), a confirmed booking gets a push a day and
 * an hour before, and a finished one is ticked off in both Planners.
 * Reminders are claimed with a conditional update: overlapping runs send
 * each of them once.
 */
@Injectable()
export class ConsultationRemindersJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consultations: ConsultationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConsultationRemindersJob.name);
  }

  async run(now: Date = new Date()): Promise<ConsultationSweepResult> {
    const result: ConsultationSweepResult = {
      expired: 0,
      day: 0,
      hour: 0,
      ended: 0,
    };
    result.expired = await this.expirePending(now);
    result.hour = await this.remindHour(now);
    result.day = await this.remindDay(now);
    result.ended = await this.markEnded(now);
    if (result.expired || result.day || result.hour || result.ended) {
      this.logger.info(result, 'consultation sweep');
    }
    return result;
  }

  private async expirePending(now: Date): Promise<number> {
    const due = await this.prisma.consultation.findMany({
      where: { status: 'pending', starts_at: { lte: now } },
      take: BATCH,
    });
    let n = 0;
    for (const c of due) {
      const row = await withTxRetry(this.prisma, async (tx) => {
        const { count } = await tx.consultation.updateMany({
          where: { id: c.id, status: 'pending' },
          data: { status: 'declined', cancel_reason: 'expired' },
        });
        if (count === 0) return null;
        const fresh = await tx.consultation.findUniqueOrThrow({
          where: { id: c.id },
        });
        await this.consultations.syncMirrors(tx, fresh);
        return fresh;
      });
      if (!row) continue;
      await this.consultations.notify(row.client_id, null, row, 'expired');
      n += 1;
    }
    return n;
  }

  private async remindHour(now: Date): Promise<number> {
    const due = await this.prisma.consultation.findMany({
      where: {
        status: 'confirmed',
        reminded_hour_at: null,
        starts_at: {
          gt: new Date(now.getTime() - GRACE_MS),
          lte: new Date(now.getTime() + HOUR_MS),
        },
        ends_at: { gt: now },
      },
      take: BATCH,
    });
    let n = 0;
    for (const c of due) {
      const { count } = await this.prisma.consultation.updateMany({
        where: { id: c.id, reminded_hour_at: null, status: 'confirmed' },
        data: {
          reminded_hour_at: now,
          reminded_day_at: c.reminded_day_at ?? now,
        },
      });
      if (count === 0) continue;
      await this.consultations.notify(c.attorney_id, null, c, 'reminder_hour');
      await this.consultations.notify(c.client_id, null, c, 'reminder_hour');
      n += 1;
    }
    return n;
  }

  private async remindDay(now: Date): Promise<number> {
    const due = await this.prisma.consultation.findMany({
      where: {
        status: 'confirmed',
        reminded_day_at: null,
        // A booking made less than an hour ahead only gets the hour push.
        starts_at: {
          gt: new Date(now.getTime() + HOUR_MS),
          lte: new Date(now.getTime() + DAY_MS),
        },
      },
      take: BATCH,
    });
    let n = 0;
    for (const c of due) {
      const { count } = await this.prisma.consultation.updateMany({
        where: { id: c.id, reminded_day_at: null, status: 'confirmed' },
        data: { reminded_day_at: now },
      });
      if (count === 0) continue;
      await this.consultations.notify(c.attorney_id, null, c, 'reminder_day');
      await this.consultations.notify(c.client_id, null, c, 'reminder_day');
      n += 1;
    }
    return n;
  }

  /** A held consultation is done in both Planners. */
  private async markEnded(now: Date): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE attorney_tasks t
      SET status = 'done'::attorney_task_status, done_at = ${now}
      WHERE t.status = 'open'::attorney_task_status
        AND t.consultation_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM consultations c
          WHERE c.id = t.consultation_id
            AND c.status = 'confirmed'::consultation_status
            AND c.ends_at <= ${now})`;
  }
}

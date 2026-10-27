import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { IncidentsService } from '../../common/ops/status/incidents.service';
import { PushQueueService } from '../../modules/notifications/push/push-queue.service';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 3600 * 1000;

export interface LegalRemindersResult {
  due: number;
  gagEnding: number;
  alertsQueued: number;
}

/**
 * Owner 2026-10-28 (legal requests): `legal.reminders`, hourly. Tells the
 * on-call admins (same push + e-mail path as the status watchdog) when
 * (1) an official request is due within `legal.reminder_days` and still
 * open, and (2) a gag / non-disclosure order is about to end or has ended
 * and the user has not been told yet. At most one reminder per request and
 * reason per day. Off with `legal.reminders_enabled`.
 */
@Injectable()
export class LegalRemindersJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly incidents: IncidentsService,
    private readonly push: PushQueueService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LegalRemindersJob.name);
  }

  async run(now: Date = new Date()): Promise<LegalRemindersResult> {
    const out: LegalRemindersResult = { due: 0, gagEnding: 0, alertsQueued: 0 };
    if (!(await this.settings.boolean('legal.reminders_enabled'))) return out;
    const days = Math.max(0, await this.settings.number('legal.reminder_days'));
    const horizon = new Date(now.getTime() + days * DAY_MS);
    const dayAgo = new Date(now.getTime() - DAY_MS);

    const due = await this.prisma.dataAccessRequest.findMany({
      where: {
        status: { in: ['received', 'in_progress'] },
        due_at: { not: null, lte: horizon },
        OR: [{ last_reminded_at: null }, { last_reminded_at: { lt: dayAgo } }],
      },
      select: { id: true, reference_number: true, agency: true, due_at: true },
      take: 100,
    });
    const gag = await this.prisma.dataAccessRequest.findMany({
      where: {
        do_not_notify: true,
        user_notified_at: null,
        nondisclosure_until: { not: null, lte: horizon },
        OR: [
          { nondisclosure_reminded_at: null },
          { nondisclosure_reminded_at: { lt: dayAgo } },
        ],
      },
      select: {
        id: true,
        reference_number: true,
        agency: true,
        nondisclosure_until: true,
      },
      take: 100,
    });
    if (due.length === 0 && gag.length === 0) return out;

    const people = await this.incidents.recipients();
    const seq = Math.floor(now.getTime() / DAY_MS);
    for (const r of due) {
      const dueAt = r.due_at as Date;
      out.alertsQueued += await this.alert(
        people,
        r.id,
        'legal_due',
        seq,
        dueAt <= now ? 'Legal request is overdue' : 'Legal request is due soon',
        `${r.reference_number} (${r.agency}), due ${dueAt.toISOString().slice(0, 10)}.`,
      );
      await this.prisma.dataAccessRequest.update({
        where: { id: r.id },
        data: { last_reminded_at: now },
      });
      out.due += 1;
    }
    for (const r of gag) {
      const until = r.nondisclosure_until as Date;
      out.alertsQueued += await this.alert(
        people,
        r.id,
        'legal_gag',
        seq,
        until <= now
          ? 'Gag order ended: tell the user'
          : 'Gag order ends soon: prepare the user notice',
        `${r.reference_number} (${r.agency}), until ${until.toISOString().slice(0, 10)}.`,
      );
      await this.prisma.dataAccessRequest.update({
        where: { id: r.id },
        data: { nondisclosure_reminded_at: now },
      });
      out.gagEnding += 1;
    }
    this.logger.info(out, 'legal reminders');
    return out;
  }

  private async alert(
    people: { userId: string; email: string | null }[],
    requestId: string,
    event: string,
    seq: number,
    title: string,
    body: string,
  ): Promise<number> {
    let n = 0;
    for (const p of people) {
      await this.push.enqueueOpsAlert({
        recipientId: p.userId,
        title,
        body,
        incidentId: requestId,
        event,
        seq,
        email: Boolean(p.email),
      });
      n += 1;
    }
    return n;
  }
}

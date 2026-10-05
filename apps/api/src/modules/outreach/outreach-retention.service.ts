import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OUTREACH_SETTINGS_KEY,
  parseOutreachSettings,
  type LeadStatus,
} from './outreach.settings';

/** Statuses that count as "never converted"; registered/paid/replied stay. */
export const RETENTION_STATUSES: readonly LeadStatus[] = [
  'new',
  'working',
  'contacted',
  'lost',
];

const BATCH = 500;

/**
 * Owner 2026-10-05 (legal): data minimization — an unconverted lead that
 * nobody touched for `leadRetentionDays` is deleted by the daily
 * `outreach.retention` job. A do-not-contact lead leaves its phone/email
 * on the stop-list first, so a later import can never bring it back.
 */
@Injectable()
export class OutreachRetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutreachRetentionService.name);
  }

  /** Leads due for deletion at `now` (oldest first, one batch). */
  async due(now: Date, retentionDays: number, take = BATCH) {
    const before = new Date(now.getTime() - retentionDays * 86_400_000);
    return this.prisma.outreachLead.findMany({
      where: {
        converted_user_id: null,
        status: { in: [...RETENTION_STATUSES] },
        OR: [
          { last_activity_at: { lt: before } },
          { last_activity_at: null, created_at: { lt: before } },
        ],
      },
      select: {
        id: true,
        phone: true,
        email: true,
        do_not_contact_at: true,
      },
      orderBy: { created_at: 'asc' },
      take,
    });
  }

  async run(
    now: Date = new Date(),
  ): Promise<{ deleted: number; suppressed: number; retentionDays: number }> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: OUTREACH_SETTINGS_KEY },
    });
    const { leadRetentionDays } = parseOutreachSettings(row?.value);
    let deleted = 0;
    let suppressed = 0;
    for (;;) {
      const batch = await this.due(now, leadRetentionDays);
      if (batch.length === 0) break;
      const keep = batch
        .filter((l) => l.do_not_contact_at)
        .flatMap((l) => [
          ...(l.phone ? [{ kind: 'phone', value: l.phone }] : []),
          ...(l.email ? [{ kind: 'email', value: l.email }] : []),
        ]);
      if (keep.length > 0) {
        const res = await this.prisma.outreachSuppression.createMany({
          data: keep.map((k) => ({
            ...k,
            note: 'retained from deleted lead',
            created_by: SYSTEM_ACTOR,
            created_at: now,
          })),
          skipDuplicates: true,
        });
        suppressed += res.count;
      }
      // Activities go with the lead (ON DELETE CASCADE).
      const { count } = await this.prisma.outreachLead.deleteMany({
        where: { id: { in: batch.map((l) => l.id) } },
      });
      deleted += count;
      if (batch.length < BATCH) break;
    }
    if (deleted || suppressed) {
      this.logger.info(
        { deleted, suppressed, retentionDays: leadRetentionDays },
        'outreach retention',
      );
    }
    return { deleted, suppressed, retentionDays: leadRetentionDays };
  }
}

/** created_by of stop-list rows written by the job (no admin). */
export const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

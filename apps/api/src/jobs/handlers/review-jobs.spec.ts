import type { Prisma } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { NotificationsService } from '../../modules/notifications/notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  REVIEW_REMINDER_GRACE_DAYS,
  ReviewReminderJob,
} from './review-reminder.job';
import { RatingReconcileJob } from './rating-reconcile.job';

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as PinoLogger;
const DAY = 24 * 60 * 60 * 1000;

function due(n: number) {
  return {
    case_id: `0000000${n}-0000-4000-8000-000000000000`,
    client_id: `client-${n}`,
    attorney_id: 'att-1',
  };
}

describe('ReviewReminderJob (docs/03 §7.3)', () => {
  it('sends one review_requested reminder per due case, walking by case id', async () => {
    const batches = [[due(1), due(2)], [due(3)]];
    const calls: Prisma.Sql[] = [];
    const $queryRaw = jest.fn((sql: Prisma.Sql) => {
      calls.push(sql);
      return Promise.resolve(batches[calls.length - 1] ?? []);
    });
    const emit = jest.fn(() => Promise.resolve({ id: 'n' }));
    const job = new ReviewReminderJob(
      { $queryRaw } as unknown as PrismaService,
      { number: () => Promise.resolve(7) } as unknown as AppSettingsService,
      { emit } as unknown as NotificationsService,
      logger,
    );
    const now = new Date('2026-09-27T16:00:00Z');

    await expect(job.run(now, 2)).resolves.toEqual({ sent: 3 });

    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenCalledWith({
      type: 'review_requested',
      recipientId: 'client-1',
      payload: { caseId: due(1).case_id, attorneyId: 'att-1', reminder: true },
    });
    // cutoff = now - 7d, floor = cutoff - grace; the 2nd batch resumes
    // after the last case id of the 1st.
    const cutoff = new Date(now.getTime() - 7 * DAY);
    const floor = new Date(cutoff.getTime() - REVIEW_REMINDER_GRACE_DAYS * DAY);
    expect(calls[0].values).toEqual(
      expect.arrayContaining([
        cutoff,
        floor,
        '00000000-0000-0000-0000-000000000000',
      ]),
    );
    expect(calls[1].values).toContain(due(2).case_id);
    // Dedupe and eligibility are part of the query itself.
    expect(calls[0].sql).toContain("n.payload->>'reminder' = 'true'");
    expect(calls[0].sql).toContain('NOT EXISTS (SELECT 1 FROM reviews');
    expect(calls[0].sql).toContain("c.status = 'closed'");
  });
});

describe('RatingReconcileJob (docs/03 §7.5)', () => {
  it('walks attorney_profiles by key until a short batch, summing fixes', async () => {
    const batches = [
      { last_id: '10000000-0000-0000-0000-000000000000', scanned: 2, fixed: 1 },
      { last_id: '20000000-0000-0000-0000-000000000000', scanned: 1, fixed: 0 },
    ];
    const calls: Prisma.Sql[] = [];
    const $queryRaw = jest.fn((sql: Prisma.Sql) => {
      calls.push(sql);
      const b = batches[calls.length - 1];
      return Promise.resolve([
        {
          last_id: b.last_id,
          scanned: BigInt(b.scanned),
          fixed: BigInt(b.fixed),
        },
      ]);
    });
    const job = new RatingReconcileJob(
      { $queryRaw } as unknown as PrismaService,
      logger,
    );
    await expect(job.run(2)).resolves.toEqual({ scanned: 3, fixed: 1 });
    expect(calls).toHaveLength(2);
    expect(calls[1].values).toContain(batches[0].last_id);
    expect(calls[0].sql).toContain("r.status = 'published'");
  });
});

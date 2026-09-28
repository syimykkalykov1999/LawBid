import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { NotificationsService } from '../../modules/notifications/notifications.service';
import {
  LICENSE_NOTIFICATION_KIND,
  LicenseExpiryJob,
  reminderThreshold,
  utcDay,
} from './license-expiry.job';

describe('reminderThreshold (docs/03 §2.6, notify days [30, 7])', () => {
  const t = [30, 7];
  it.each([
    [31, null],
    [30, 30],
    [8, 30],
    [7, 7],
    [1, 7],
    [0, null],
    [-3, null],
  ])('%i days left -> %p', (days, want) => {
    expect(reminderThreshold(days, t)).toBe(want);
  });

  it('ignores non-positive thresholds', () => {
    expect(reminderThreshold(5, [0, -1])).toBeNull();
  });
});

describe('utcDay', () => {
  it('truncates to UTC midnight', () => {
    expect(utcDay(new Date('2026-09-27T23:59:00-05:00')).toISOString()).toBe(
      '2026-09-28T00:00:00.000Z',
    );
  });
});

describe('LicenseExpiryJob.run', () => {
  const now = new Date('2026-09-27T05:05:00Z');
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

  function setup(opts: {
    due: { id: string; attorney_id: string; expires_at: Date }[];
    remaining: number;
    downgraded: number;
    upcoming?: { id: string; attorney_id: string; expires_at: Date }[];
    existingPayloads?: Record<string, unknown>[];
  }) {
    const emitted: { userId: string; payload: Record<string, unknown> }[] = [];
    let dueCalls = 0;
    const tx = {
      attorneyLicense: {
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
        count: jest.fn(() => Promise.resolve(opts.remaining)),
      },
      attorneyProfile: {
        updateMany: jest.fn(() => Promise.resolve({ count: opts.downgraded })),
      },
    };
    const prisma = {
      attorneyLicense: {
        findMany: jest.fn((args: { where: { expires_at: object } }) => {
          if (
            'lte' in args.where.expires_at &&
            !('gt' in args.where.expires_at)
          ) {
            dueCalls += 1;
            return Promise.resolve(
              dueCalls === 1
                ? opts.due.map((d) => ({ ...d, state_code: 'NJ' }))
                : [],
            );
          }
          return Promise.resolve(
            (opts.upcoming ?? []).map((d) => ({ ...d, state_code: 'NY' })),
          );
        }),
      },
      notification: {
        findMany: jest.fn(() =>
          Promise.resolve(
            (opts.existingPayloads ?? []).map((payload) => ({ payload })),
          ),
        ),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const settings = { numberList: jest.fn(() => Promise.resolve([30, 7])) };
    const notifications = {
      emit: jest.fn(
        (input: { userId: string; payload: Record<string, unknown> }) => {
          emitted.push(input);
          return Promise.resolve({ id: 'n' });
        },
      ),
    };
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const job = new LicenseExpiryJob(
      prisma as unknown as PrismaService,
      settings as unknown as AppSettingsService,
      notifications as unknown as NotificationsService,
      logger as unknown as PinoLogger,
    );
    return { job, tx, emitted };
  }

  it('expires a due license and unverifies the profile when it was the last one', async () => {
    const { job, tx, emitted } = setup({
      due: [{ id: 'l1', attorney_id: 'a1', expires_at: day('2026-09-27') }],
      remaining: 0,
      downgraded: 1,
    });
    const result = await job.run(now);
    expect(result).toEqual({ expired: 1, unverifiedProfiles: 1, reminders: 0 });
    expect(tx.attorneyLicense.updateMany).toHaveBeenCalledWith({
      where: { id: 'l1', license_status: 'verified' },
      data: { license_status: 'expired' },
    });
    expect(tx.attorneyProfile.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'a1', verification_status: 'verified' },
      data: { verification_status: 'unverified' },
    });
    expect(emitted.map((e) => e.payload.kind)).toEqual([
      LICENSE_NOTIFICATION_KIND.expired,
      LICENSE_NOTIFICATION_KIND.profileUnverified,
    ]);
  });

  it('keeps the profile when another verified license remains', async () => {
    const { job, tx } = setup({
      due: [{ id: 'l1', attorney_id: 'a1', expires_at: day('2026-09-20') }],
      remaining: 1,
      downgraded: 1,
    });
    const result = await job.run(now);
    expect(result.unverifiedProfiles).toBe(0);
    expect(tx.attorneyProfile.updateMany).not.toHaveBeenCalled();
  });

  it('sends the 30- and 7-day reminders once', async () => {
    const { job, emitted } = setup({
      due: [],
      remaining: 0,
      downgraded: 0,
      upcoming: [
        { id: 'l30', attorney_id: 'a1', expires_at: day('2026-10-27') },
        { id: 'l7', attorney_id: 'a2', expires_at: day('2026-10-04') },
        { id: 'l7dup', attorney_id: 'a3', expires_at: day('2026-10-04') },
      ],
      existingPayloads: [
        {
          kind: LICENSE_NOTIFICATION_KIND.expiring,
          licenseId: 'l7dup',
          expiresAt: '2026-10-04',
          thresholdDays: 7,
        },
      ],
    });
    const result = await job.run(now);
    expect(result.reminders).toBe(2);
    expect(emitted.map((e) => [e.userId, e.payload.thresholdDays])).toEqual([
      ['a1', 30],
      ['a2', 7],
    ]);
  });
});

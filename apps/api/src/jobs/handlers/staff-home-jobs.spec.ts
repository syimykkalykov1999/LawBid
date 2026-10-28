import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import type { PushQueueService } from '../../modules/notifications/push/push-queue.service';
import type { StaffDigestService } from '../../modules/staff-home/staff-digest.service';
import type { StaffTodayService } from '../../modules/staff-home/staff-today.service';
import type { StaffTodaySystemService } from '../../modules/staff-home/staff-today-system.service';
import { StaffTodayJob } from './staff-today.job';
import { StaffWeeklyDigestJob } from './staff-weekly-digest.job';

const settings = (stored: Record<string, unknown> = {}) =>
  new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);

describe('staff.today job (T10)', () => {
  it('switch off: returns at once, builds nothing', async () => {
    const today = { refresh: jest.fn() };
    const job = new StaffTodayJob(
      settings(),
      today as unknown as StaffTodayService,
    );
    await expect(job.run()).resolves.toEqual({ skipped: 'off' });
    expect(today.refresh).not.toHaveBeenCalled();
  });

  it('switch on: refreshes the stored snapshot', async () => {
    const today = {
      refresh: jest.fn().mockResolvedValue({
        appeals: { open: 2 },
        suggestions: null,
        decision: { code: 'appeal' },
      }),
    };
    const job = new StaffTodayJob(
      settings({ 'staff.owner_home_enabled': true }),
      today as unknown as StaffTodayService,
    );
    await expect(job.run()).resolves.toEqual({
      appeals: 2,
      suggestions: 0,
      decision: 'appeal',
    });
    expect(today.refresh).toHaveBeenCalledTimes(1);
  });

  it('owner desk: refreshes the «Система» block only when stale and reports counts', async () => {
    const today = {
      refresh: jest.fn().mockResolvedValue({
        appeals: null,
        suggestions: null,
        decision: null,
      }),
    };
    const system = {
      refreshIfStale: jest
        .fn()
        .mockResolvedValueOnce({
          items: [{ code: 'a' }, { code: 'b' }],
          counts: { critical: 1, high: 1, medium: 0, low: 0 },
        })
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('redis')),
    };
    const job = new StaffTodayJob(
      settings({ 'staff.owner_home_enabled': true }),
      today as unknown as StaffTodayService,
      system as unknown as StaffTodaySystemService,
    );
    await expect(job.run()).resolves.toEqual({
      appeals: 0,
      suggestions: 0,
      decision: 'none',
      systemItems: 2,
      systemCritical: 1,
    });
    await expect(job.run()).resolves.toEqual({
      appeals: 0,
      suggestions: 0,
      decision: 'none',
    });
    await expect(job.run()).resolves.toMatchObject({ system: 'failed' });
    expect(system.refreshIfStale).toHaveBeenCalledTimes(3);
  });
});

describe('staff.weekly-digest job (T10)', () => {
  const numbers = {
    decisions: 5,
    returnedPct: null,
    appeals: 0,
    worstCount: 0,
    bestCount: 0,
    worstName: null,
    bestName: null,
    pieceworkCents: 0,
    currency: 'usd',
  };
  const build = (stored: Record<string, unknown>, prepared: unknown) => {
    const digest = {
      prepare: jest.fn().mockResolvedValue(prepared),
      recipients: jest.fn().mockResolvedValue([
        { id: 'o1', email: 'o@x.test' },
        { id: 'o2', email: null },
      ]),
    };
    const push = { enqueueOpsAlert: jest.fn().mockResolvedValue(undefined) };
    const job = new StaffWeeklyDigestJob(
      settings(stored),
      digest as unknown as StaffDigestService,
      push as unknown as PushQueueService,
    );
    return { job, digest, push };
  };

  it('switch off: nothing is composed or sent', async () => {
    const { job, digest, push } = build({}, null);
    await expect(job.run()).resolves.toEqual({ skipped: 'off' });
    expect(digest.prepare).not.toHaveBeenCalled();
    expect(push.enqueueOpsAlert).not.toHaveBeenCalled();
  });

  it('switch on: one push (+ e-mail where there is an address) per owner, five lines', async () => {
    const { job, push } = build(
      { 'staff.weekly_digest_enabled': true },
      { week: '2026-10-19', numbers },
    );
    await expect(job.run()).resolves.toEqual({ week: '2026-10-19', sent: 2 });
    expect(push.enqueueOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'o1',
        incidentId: 'staff-digest-2026-10-19',
        event: 'digest',
        seq: 1,
        email: true,
      }),
    );
    const first = push.enqueueOpsAlert.mock.calls[0] as [{ body: string }];
    expect(first[0].body.split('\n')).toHaveLength(5);
    const second = push.enqueueOpsAlert.mock.calls[1] as [{ email: boolean }];
    expect(second[0].email).toBe(false);
  });

  it('a week already stored sends nothing again', async () => {
    const { job, push } = build({ 'staff.weekly_digest_enabled': true }, null);
    await expect(job.run()).resolves.toEqual({ result: 'already sent' });
    expect(push.enqueueOpsAlert).not.toHaveBeenCalled();
  });

  it('one failed enqueue does not stop the others', async () => {
    const { job, push } = build(
      { 'staff.weekly_digest_enabled': true },
      { week: '2026-10-19', numbers },
    );
    push.enqueueOpsAlert
      .mockRejectedValueOnce(new Error('redis'))
      .mockResolvedValue(undefined);
    await expect(job.run()).resolves.toEqual({ week: '2026-10-19', sent: 1 });
  });
});

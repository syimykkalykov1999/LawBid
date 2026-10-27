import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { StaffHeadScoreService } from '../../modules/staff-appeals/staff-head-score.service';
import type { StaffRetaliationService } from '../../modules/staff-appeals/staff-retaliation.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { StaffHeadScoreJob } from './staff-head-score.job';
import { StaffRetaliationExpireJob } from './staff-retaliation-expire.job';

const settings = (stored: Record<string, unknown> = {}) =>
  new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);

const NOW = new Date('2026-10-27T03:22:00Z');

describe('staff.retaliation-expire (T6)', () => {
  it('switch off (the default): returns at once, the service is not touched', async () => {
    const svc = { expire: jest.fn() };
    const job = new StaffRetaliationExpireJob(
      settings(),
      svc as unknown as StaffRetaliationService,
    );
    await expect(job.run(NOW)).resolves.toEqual({ skipped: 'off' });
    expect(svc.expire).not.toHaveBeenCalled();
  });

  it('switch on: runs the expiry and reports the counts', async () => {
    const svc = {
      expire: jest
        .fn()
        .mockResolvedValue({ holdsEnded: 2, flagsCleared: 1, reminders: 3 }),
    };
    const job = new StaffRetaliationExpireJob(
      settings({ 'staff.appeals_enabled': true }),
      svc as unknown as StaffRetaliationService,
    );
    await expect(job.run(NOW)).resolves.toEqual({
      holdsEnded: 2,
      flagsCleared: 1,
      reminders: 3,
    });
    expect(svc.expire).toHaveBeenCalledWith(NOW);
  });
});

describe('staff.head-score (T6)', () => {
  it('switch off (the default): returns at once', async () => {
    const svc = { run: jest.fn() };
    const job = new StaffHeadScoreJob(
      settings(),
      svc as unknown as StaffHeadScoreService,
    );
    await expect(job.run(NOW)).resolves.toEqual({ skipped: 'off' });
    expect(svc.run).not.toHaveBeenCalled();
  });

  it('switch on: scores the heads', async () => {
    const svc = { run: jest.fn().mockResolvedValue({ heads: 1, signals: 2 }) };
    const job = new StaffHeadScoreJob(
      settings({ 'staff.head_enabled': true }),
      svc as unknown as StaffHeadScoreService,
    );
    await expect(job.run(NOW)).resolves.toEqual({ heads: 1, signals: 2 });
  });
});

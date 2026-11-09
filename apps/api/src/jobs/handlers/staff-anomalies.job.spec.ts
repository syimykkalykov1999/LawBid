import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import type { StaffAnomalyService } from '../../modules/staff-security/staff-anomaly.service';
import { StaffAnomaliesJob } from './staff-anomalies.job';

const settings = (stored: Record<string, unknown>) =>
  new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);

describe('staff.anomalies cron job (staff package T11)', () => {
  const computeDay = jest.fn(() =>
    Promise.resolve({ day: 'x', admins: 2, rows: 1, digest: 'line' }),
  );
  const svc = { computeDay } as unknown as StaffAnomalyService;
  beforeEach(() => computeDay.mockClear());

  it('«Авто» (the default) with fewer than two staff, or «Выкл»: returns at once, the report is not touched', async () => {
    for (const s of [
      settings({}),
      settings({ 'staff.anomalies_enabled': 'off' }),
    ]) {
      await expect(new StaffAnomaliesJob(s, svc).run()).resolves.toEqual({
        skipped: 'off',
      });
    }
    expect(computeDay).not.toHaveBeenCalled();
  });

  it('«Авто» with two staff besides the owner: runs (owner rule 5c)', async () => {
    const auto = new StaffSettingsService(
      { all: () => Promise.resolve({}) } as unknown as AppSettingsService,
      {
        adminProfile: { count: () => Promise.resolve(2) },
        staffRate: { count: () => Promise.resolve(0) },
      } as unknown as PrismaService,
    );
    await new StaffAnomaliesJob(auto, svc).run(
      new Date('2026-10-27T02:25:00Z'),
    );
    expect(computeDay).toHaveBeenCalledWith('2026-10-26');
  });

  it('on: reads yesterday (UTC) and returns the digest line', async () => {
    const job = new StaffAnomaliesJob(
      settings({ 'staff.anomalies_enabled': true }),
      svc,
    );
    const r = await job.run(new Date('2026-10-27T02:25:00Z'));
    expect(computeDay).toHaveBeenCalledWith('2026-10-26');
    expect(r).toMatchObject({ rows: 1, digest: 'line' });
  });
});

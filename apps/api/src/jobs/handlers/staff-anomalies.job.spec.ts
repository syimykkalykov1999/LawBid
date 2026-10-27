import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
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

  it('switch off (the default): returns at once, the report is not touched', async () => {
    await expect(
      new StaffAnomaliesJob(settings({}), svc).run(),
    ).resolves.toEqual({
      skipped: 'off',
    });
    expect(computeDay).not.toHaveBeenCalled();
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

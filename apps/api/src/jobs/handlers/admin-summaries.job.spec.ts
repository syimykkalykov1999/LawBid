import { AdminSummariesJob } from './admin-summaries.job';

function make(peek: unknown) {
  const dashboard = { refresh: jest.fn().mockResolvedValue(undefined) };
  const billing = { refreshOverview: jest.fn().mockResolvedValue(undefined) };
  const trust = { refreshScan: jest.fn().mockResolvedValue(undefined) };
  const analytics = {
    refreshSnapshots: jest.fn().mockResolvedValue(undefined),
  };
  const summary = { peek: jest.fn().mockResolvedValue(peek) };
  const logger = { setContext: jest.fn(), warn: jest.fn() };
  const accessReport = { refreshDaily: jest.fn().mockResolvedValue(undefined) };
  const job = new AdminSummariesJob(
    dashboard as never,
    billing as never,
    trust as never,
    summary as never,
    analytics as never,
    logger as never,
    accessReport as never,
  );
  return { job, dashboard, billing, trust, logger, accessReport };
}

describe('AdminSummariesJob', () => {
  it('recounts the dashboard, billing and (when stale) the trust scan', async () => {
    const { job, dashboard, billing, trust, accessReport } = make(null);
    await expect(job.run()).resolves.toEqual({
      refreshed: [
        'dashboard',
        'analytics',
        'billing-overview',
        'access-report',
        'trust-scan',
      ],
      failed: [],
    });
    expect(dashboard.refresh).toHaveBeenCalledTimes(1);
    expect(billing.refreshOverview).toHaveBeenCalledTimes(1);
    expect(accessReport.refreshDaily).toHaveBeenCalledTimes(1);
    expect(trust.refreshScan).toHaveBeenCalledTimes(1);
  });

  it('leaves a fresh trust scan alone (it reads every attorney)', async () => {
    const { job, trust } = make({
      data: { queueSize: 3, byStatus: {} },
      computedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await job.run();
    expect(trust.refreshScan).not.toHaveBeenCalled();
  });

  it('one failing count does not block the others', async () => {
    const { job, dashboard, billing, trust, logger } = make(null);
    dashboard.refresh.mockRejectedValue(new Error('db down'));
    const out = await job.run();
    expect(out.failed).toEqual(['dashboard']);
    expect(out.refreshed).toEqual([
      'analytics',
      'billing-overview',
      'access-report',
      'trust-scan',
    ]);
    expect(billing.refreshOverview).toHaveBeenCalled();
    expect(trust.refreshScan).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  describe('S20-1: ops.admin_summaries_mode', () => {
    function gated(mode: string, active: boolean, last: string | null) {
      const base = make(null);
      const settings = { string: jest.fn().mockResolvedValue(mode) };
      const redis = {
        exists: jest.fn().mockResolvedValue(active ? 1 : 0),
        get: jest.fn().mockResolvedValue(last),
        set: jest.fn().mockResolvedValue('OK'),
      };
      const job = new AdminSummariesJob(
        { refresh: base.dashboard.refresh } as never,
        { refreshOverview: base.billing.refreshOverview } as never,
        { refreshScan: base.trust.refreshScan } as never,
        { peek: jest.fn().mockResolvedValue(null) } as never,
        // #377: the daily stats snapshot (not under test here).
        { refreshSnapshots: jest.fn().mockResolvedValue(undefined) } as never,
        base.logger as never,
        undefined,
        settings as never,
        redis as never,
      );
      return { job, base, redis };
    }
    const minutesAgo = (m: number) =>
      new Date(Date.now() - m * 60_000).toISOString();

    it('auto and nobody in the admin: skips a recent run (hourly)', async () => {
      const { job, base, redis } = gated('auto', false, minutesAgo(2));
      await expect(job.run()).resolves.toMatchObject({
        skipped: 'nobody is looking',
      });
      expect(base.dashboard.refresh).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('auto and an admin is active: counts and stamps the run', async () => {
      const { job, base, redis } = gated('auto', true, minutesAgo(2));
      await job.run();
      expect(base.dashboard.refresh).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith(
        'ops:admin-summaries:last',
        expect.any(String),
      );
    });

    it('auto, nobody there, but the last run is an hour old: counts', async () => {
      const { job, base } = gated('auto', false, minutesAgo(61));
      await job.run();
      expect(base.dashboard.refresh).toHaveBeenCalledTimes(1);
    });

    it('on: always counts', async () => {
      const { job, base } = gated('on', false, minutesAgo(1));
      await job.run();
      expect(base.dashboard.refresh).toHaveBeenCalledTimes(1);
    });
  });
});

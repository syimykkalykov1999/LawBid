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
        'promotions-by-model',
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
      'promotions-by-model',
    ]);
    expect(billing.refreshOverview).toHaveBeenCalled();
    expect(trust.refreshScan).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});

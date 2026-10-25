import { AdminExperimentsService } from './admin-experiments.service';

const admin = { id: 'a1', ip: '1.1.1.1', sessionId: 's1' } as never;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    key: 'case_feed_v2',
    name: 'Новая формула дел',
    hypothesis: null,
    surface: 'case_feed',
    status: 'draft',
    variants: [
      { key: 'control', weight: 50 },
      { key: 'new_formula', weight: 50 },
    ],
    traffic_percent: 0,
    guardrails: {},
    start_at: null,
    end_at: null,
    started_at: null,
    stopped_at: null,
    stop_reason: null,
    stopped_by_system: false,
    created_by: 'a1',
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

function build(current: ReturnType<typeof row> | null, lastResult: unknown = null) {
  const prisma = {
    experiment: {
      findUnique: jest.fn().mockResolvedValue(current),
      findMany: jest.fn().mockResolvedValue(current ? [current] : []),
      create: jest.fn((a: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...a.data, id: 'new' })),
      ),
      update: jest.fn((a: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...current, ...a.data }),
      ),
    },
    experimentExposure: { count: jest.fn().mockResolvedValue(0) },
    experimentResult: { findFirst: jest.fn().mockResolvedValue(lastResult) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const settings = { number: jest.fn().mockResolvedValue(10) };
  const experiments = { invalidate: jest.fn() };
  const nightly = { computeNow: jest.fn() };
  const svc = new AdminExperimentsService(
    prisma as never,
    audit as never,
    settings as never,
    experiments as never,
    nightly as never,
  );
  return { svc, prisma, audit, experiments };
}

const dto = {
  key: 'case_feed_v3',
  name: 'Тест',
  surface: 'case_feed',
  variants: [
    { key: 'control', weight: 50 },
    { key: 'b', weight: 50 },
  ],
};

describe('AdminExperimentsService', () => {
  it('creates a draft and audits it', async () => {
    const { svc, prisma, audit } = build(null);
    const r = await svc.create(admin, dto);
    expect(r.status).toBe('draft');
    expect(prisma.experiment.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'experiment.create' }),
    );
  });

  it('refuses a bad definition and a duplicate key', async () => {
    const a = build(null);
    await expect(
      a.svc.create(admin, { ...dto, variants: [{ key: 'control', weight: 100 }] }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    const b = build(row());
    await expect(b.svc.create(admin, dto)).rejects.toMatchObject({
      response: { code: 'EXPERIMENT_STATE_INVALID' },
    });
  });

  it('starts a draft at 10%, drops the cache and audits', async () => {
    const { svc, experiments, audit } = build(row());
    const r = await svc.start(admin, 'e1', 10);
    expect(r.status).toBe('running');
    expect(r.trafficPercent).toBe(10);
    expect(experiments.invalidate).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'experiment.start' }),
    );
  });

  it('will not start above the cap, or twice, or after a stop', async () => {
    await expect(build(row()).svc.start(admin, 'e1', 50)).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR' },
    });
    await expect(
      build(row({ status: 'running' })).svc.start(admin, 'e1', 5),
    ).rejects.toMatchObject({ response: { code: 'EXPERIMENT_STATE_INVALID' } });
    await expect(
      build(row({ status: 'stopped' })).svc.start(admin, 'e1', 5),
    ).rejects.toMatchObject({ response: { code: 'EXPERIMENT_STATE_INVALID' } });
  });

  it('raises the share only upwards, only while running, and not on a red check', async () => {
    const running = row({ status: 'running', traffic_percent: 10 });
    const ok = await build(running).svc.setTraffic(admin, 'e1', 50);
    expect(ok.trafficPercent).toBe(50);
    await expect(build(running).svc.setTraffic(admin, 'e1', 10)).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR' },
    });
    await expect(build(row()).svc.setTraffic(admin, 'e1', 50)).rejects.toMatchObject({
      response: { code: 'EXPERIMENT_STATE_INVALID' },
    });
    const red = build(running, { srm_flag: true, guardrail_tripped: false });
    await expect(red.svc.setTraffic(admin, 'e1', 50)).rejects.toMatchObject({
      response: { code: 'EXPERIMENT_STATE_INVALID' },
    });
  });

  it('stop rolls back at once and records the reason', async () => {
    const { svc, experiments, audit } = build(row({ status: 'running', traffic_percent: 10 }));
    const r = await svc.stop(admin, 'e1', 'не нравится');
    expect(r.status).toBe('stopped');
    expect(r.stopReason).toBe('не нравится');
    expect(r.stoppedBySystem).toBe(false);
    expect(experiments.invalidate).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'experiment.stop' }),
    );
    await expect(build(row()).svc.stop(admin, 'e1')).rejects.toMatchObject({
      response: { code: 'EXPERIMENT_STATE_INVALID' },
    });
  });

  it('answers 404 for an unknown id', async () => {
    await expect(build(null).svc.start(admin, 'zz', 5)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });
});

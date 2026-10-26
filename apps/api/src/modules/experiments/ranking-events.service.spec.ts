import { randomUUID } from 'node:crypto';
import { RankingEventsService } from './ranking-events.service';

function build(sample = 100, mode: string = 'on', running = true) {
  const createMany = jest
    .fn<
      Promise<{ count: number }>,
      [{ data: Array<Record<string, unknown>> }]
    >()
    .mockResolvedValue({ count: 0 });
  const prisma = {
    rankingEvent: { createMany },
    experiment: { count: jest.fn().mockResolvedValue(running ? 1 : 0) },
  };
  const settings = {
    string: jest.fn().mockResolvedValue(mode),
    number: jest.fn().mockResolvedValue(sample),
  };
  const svc = new RankingEventsService(prisma as never, settings as never);
  return { svc, createMany };
}

const base = (userId: string) => ({
  userId,
  surface: 'case_feed',
  itemId: 'case-1',
  position: 1,
  formulaVersion: 'v1',
  experimentKey: 'case_feed_v2',
  variant: 'control',
});

describe('RankingEventsService', () => {
  it('buffers and writes one batch', async () => {
    const { svc, createMany } = build();
    const u = randomUUID();
    await svc.logImpression({ ...base(u), position: 1, features: { a: 0.5 } });
    await svc.logImpression({ ...base(u), position: 2 });
    await svc.logAction('click', base(u));
    expect(createMany).not.toHaveBeenCalled();
    expect(await svc.flush()).toBe(0);
    expect(createMany).toHaveBeenCalledTimes(1);
    const rows = createMany.mock.calls[0][0].data;
    expect(rows.map((r) => r.kind)).toEqual([
      'impression',
      'impression',
      'click',
    ]);
    expect(rows[0]).toMatchObject({
      user_id: u,
      surface: 'case_feed',
      item_id: 'case-1',
      formula_version: 'v1',
      experiment_key: 'case_feed_v2',
      variant: 'control',
      features: { a: 0.5 },
    });
  });

  it('samples impressions and clicks by user but keeps bids, accepts and reports', async () => {
    const { svc, createMany } = build(0);
    const u = randomUUID();
    await svc.logImpression(base(u));
    await svc.logAction('click', base(u));
    await svc.logAction('bid', base(u));
    await svc.logAction('accept', base(u));
    await svc.logAction('report', base(u));
    await svc.flush();
    const kinds = createMany.mock.calls[0][0].data.map((r) => r.kind);
    expect(kinds).toEqual(['bid', 'accept', 'report']);
  });

  it('keeps the same users at 20%: the sample is stable, not per event', async () => {
    const { svc, createMany } = build(20);
    const users = Array.from({ length: 2000 }, () => randomUUID());
    for (const u of users) {
      await svc.logImpression(base(u));
      await svc.logAction('click', base(u));
    }
    await svc.flush();
    const rows = createMany.mock.calls.flatMap((c) => c[0].data);
    const imp = new Set(
      rows.filter((r) => r.kind === 'impression').map((r) => r.user_id),
    );
    const clk = new Set(
      rows.filter((r) => r.kind === 'click').map((r) => r.user_id),
    );
    expect(imp).toEqual(clk);
    expect(imp.size / users.length).toBeGreaterThan(0.16);
    expect(imp.size / users.length).toBeLessThan(0.24);
  });

  it('writes nothing while the log is switched off', async () => {
    const { svc, createMany } = build(100, 'off');
    await svc.logAction('bid', base(randomUUID()));
    await svc.flush();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('auto: impressions wait while no experiment runs, then flow at the sample', async () => {
    const idle = build(100, 'auto', false);
    const u = randomUUID();
    await idle.svc.logImpression(base(u));
    await idle.svc.logAction('bid', base(u));
    await idle.svc.flush();
    expect(idle.createMany.mock.calls[0][0].data.map((r) => r.kind)).toEqual([
      'bid',
    ]);
    const busy = build(100, 'auto', true);
    await busy.svc.logImpression(base(u));
    await busy.svc.flush();
    expect(busy.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it('never throws when the database fails', async () => {
    const { svc, createMany } = build();
    createMany.mockRejectedValue(new Error('db down'));
    await svc.logAction('bid', base(randomUUID()));
    await expect(svc.flush()).resolves.toBe(0);
  });

  it('truncates over-long text instead of failing the insert', async () => {
    const { svc, createMany } = build();
    await svc.logAction('bid', {
      ...base(randomUUID()),
      surface: 's'.repeat(80),
      itemId: 'i'.repeat(100),
    });
    await svc.flush();
    const row = createMany.mock.calls[0][0].data[0];
    expect(row.surface).toHaveLength(40);
    expect(row.item_id).toHaveLength(64);
  });
});

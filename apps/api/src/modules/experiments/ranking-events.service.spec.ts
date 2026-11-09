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

  // Owner 2026-11-08: served lists, clicks on their places, tagged actions.
  describe('lists, clicks and actions', () => {
    function withRedis(experiments?: unknown) {
      const createMany = jest
        .fn<
          Promise<{ count: number }>,
          [{ data: Array<Record<string, unknown>> }]
        >()
        .mockResolvedValue({ count: 0 });
      const prisma = {
        rankingEvent: { createMany },
        experiment: { count: jest.fn().mockResolvedValue(1) },
      };
      const settings = {
        string: jest.fn().mockResolvedValue('on'),
        number: jest.fn().mockResolvedValue(100),
      };
      const hashes = new Map<string, Map<string, string>>();
      const redis = {
        multi() {
          const ops: Array<() => void> = [];
          const chain = {
            hset(key: string, ...kv: string[]) {
              ops.push(() => {
                const h = hashes.get(key) ?? new Map<string, string>();
                for (let i = 0; i < kv.length; i += 2) h.set(kv[i], kv[i + 1]);
                hashes.set(key, h);
              });
              return chain;
            },
            expire() {
              return chain;
            },
            exec: async () => ops.forEach((o) => o()),
          };
          return chain;
        },
        hmget: async (key: string, ...f: string[]) =>
          f.map((x) => hashes.get(key)?.get(x) ?? null),
        hdel: async (key: string, ...f: string[]) =>
          f.forEach((x) => hashes.get(key)?.delete(x)),
      };
      const svc = new RankingEventsService(
        prisma as never,
        settings as never,
        experiments as never,
        redis as never,
      );
      return { svc, createMany };
    }

    it('a served page logs places after the offset, and an open is a click on its place once', async () => {
      const { svc, createMany } = withRedis();
      const u = randomUUID();
      await svc.logList({
        userId: u,
        surface: 'case_feed',
        itemIds: ['a', 'b', 'c'],
        offset: 20,
        assignment: { experimentKey: 'exp_one', variant: 'new_formula' },
        formulaVersion: 'cases-2026-10',
        features: new Map([['b', { urgency: 0.5 }]]),
      });
      await svc.logClicks(u, ['b', 'zzz']);
      await svc.logClicks(u, ['b']);
      await svc.flush();
      const rows = createMany.mock.calls[0][0].data;
      const imps = rows.filter((r) => r.kind === 'impression');
      expect(imps.map((r) => r.position)).toEqual([21, 22, 23]);
      expect(new Set(imps.map((r) => r.list_id)).size).toBe(1);
      expect(imps[1].features).toEqual({ urgency: 0.5 });
      const clicks = rows.filter((r) => r.kind === 'click');
      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatchObject({
        item_id: 'b',
        position: 22,
        surface: 'case_feed',
        experiment_key: 'exp_one',
        variant: 'new_formula',
        list_id: imps[0].list_id,
      });
    });

    it('an action is tagged once per running test of the unit, or untagged', async () => {
      const assignAll = jest
        .fn()
        .mockResolvedValueOnce([
          { experimentKey: 'a_test', variant: 'control' },
          { experimentKey: 'b_test', variant: 'x' },
        ])
        .mockResolvedValueOnce([]);
      const { svc, createMany } = withRedis({ assignAll });
      const u = randomUUID();
      await svc.logUserAction('bid', {
        userId: u,
        surface: 'case_feed',
        itemId: 'c1',
      });
      await svc.logUserAction('report', {
        userId: u,
        surface: 'post',
        itemId: 'p1',
      });
      await svc.flush();
      expect(assignAll).toHaveBeenCalledWith(u, { expose: false });
      const rows = createMany.mock.calls[0][0].data;
      expect(rows.map((r) => [r.kind, r.experiment_key, r.variant])).toEqual([
        ['bid', 'a_test', 'control'],
        ['bid', 'b_test', 'x'],
        ['report', null, null],
      ]);
    });

    it('logs nothing for a person outside the sample', async () => {
      const { svc, createMany } = withRedis();
      jest.spyOn(svc, 'keepsImpressionsOf').mockResolvedValue(false);
      await svc.logList({
        userId: randomUUID(),
        surface: 'people',
        itemIds: ['a'],
      });
      await svc.flush();
      expect(createMany).not.toHaveBeenCalled();
    });
  });
});

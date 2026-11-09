import { EconomyService } from './economy.service';

type Fig = { awsLimitUsd: number };

function make(
  mode: string,
  allowed: number,
  params: Record<string, string | null>,
) {
  const stored: Record<string, string | null> = { ...params };
  const ssm = {
    available: true,
    maxClassParam: (t: string) => (t === 'db' ? '/p/db/max' : '/p/redis/max'),
    get: jest.fn((n: string) => Promise.resolve(stored[n] ?? null)),
    put: jest.fn((n: string, v: string) => {
      stored[n] = v;
      return Promise.resolve();
    }),
  };
  const settings = { string: jest.fn().mockResolvedValue(mode) };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const svc = new EconomyService(
    {} as never,
    {} as never,
    settings as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    logger as never,
    undefined, // spend (#370)
    undefined, // storage (#370)
    ssm as never,
  );
  const run = (f: Fig, cap = f.awsLimitUsd) =>
    (
      svc as unknown as {
        applyCapacityCeilings: (
          f: Fig,
          cfg: { awsCapUsd: number },
        ) => Promise<Record<string, unknown> | null>;
      }
    ).applyCapacityCeilings(f, { awsCapUsd: cap });
  return { run, ssm, stored, f: { awsLimitUsd: allowed } };
}

describe('EconomyService.applyCapacityCeilings (cost registry V4)', () => {
  it('writes the affordable size into both SSM ceilings', async () => {
    const { run, ssm, stored, f } = make('auto', 350, {});
    const out = await run(f);
    expect(stored['/p/db/max']).toBe('db.t4g.medium');
    expect(stored['/p/redis/max']).toBe('cache.t4g.small');
    expect(ssm.put).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({
      db: { changed: true },
      redis: { changed: true },
    });
  });

  it('raises the ceiling when the AWS budget grows, and writes nothing when unchanged', async () => {
    const { run, ssm, stored } = make('auto', 350, {
      '/p/db/max': 'db.t4g.medium',
      '/p/redis/max': 'cache.t4g.small',
    });
    await run({ awsLimitUsd: 350 });
    expect(ssm.put).not.toHaveBeenCalled();
    await run({ awsLimitUsd: 1000 });
    expect(stored['/p/db/max']).toBe('db.r7g.large');
  });

  it('owner 2026-11-09: off, or no sum typed, lifts both ceilings to the largest size', async () => {
    for (const [mode, cap] of [
      ['off', 350],
      ['auto', 0],
    ] as const) {
      const { run, stored, f } = make(mode, 350, {
        '/p/db/max': 'db.t4g.medium',
        '/p/redis/max': 'cache.t4g.small',
      });
      await run(f, cap);
      expect(stored['/p/db/max']).toBe('db.r7g.2xlarge');
      expect(stored['/p/redis/max']).toBe('cache.r7g.2xlarge');
    }
  });
});

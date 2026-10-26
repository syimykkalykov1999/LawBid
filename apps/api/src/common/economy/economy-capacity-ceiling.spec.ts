import { EconomyService } from './economy.service';

type Fig = { allowedUsd: number };

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
    ssm as never,
  );
  const run = (f: Fig) =>
    (
      svc as unknown as {
        applyCapacityCeilings: (
          f: Fig,
        ) => Promise<Record<string, unknown> | null>;
      }
    ).applyCapacityCeilings(f);
  return { run, ssm, stored, f: { allowedUsd: allowed } };
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

  it('raises the ceiling when the allowance grows, and writes nothing when unchanged', async () => {
    const { run, ssm, stored } = make('auto', 350, {
      '/p/db/max': 'db.t4g.medium',
      '/p/redis/max': 'cache.t4g.small',
    });
    await run({ allowedUsd: 350 });
    expect(ssm.put).not.toHaveBeenCalled();
    await run({ allowedUsd: 1000 });
    expect(stored['/p/db/max']).toBe('db.r7g.large');
  });

  it('off = hands off', async () => {
    const { run, ssm, f } = make('off', 350, {});
    expect(await run(f)).toMatchObject({ skipped: expect.any(String) });
    expect(ssm.put).not.toHaveBeenCalled();
  });
});

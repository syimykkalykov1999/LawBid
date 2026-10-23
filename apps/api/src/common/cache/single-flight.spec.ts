import { inflightCount, jitterTtl, singleFlight } from './single-flight';

describe('singleFlight', () => {
  it('runs one load for many concurrent callers of the same key', async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return 'v';
    };
    const out = await Promise.all(
      Array.from({ length: 500 }, () => singleFlight('k', load)),
    );
    expect(calls).toBe(1);
    expect(new Set(out)).toEqual(new Set(['v']));
    expect(inflightCount()).toBe(0);
  });

  it('keeps different keys apart and loads again after it finished', async () => {
    const load = jest.fn().mockResolvedValue(1);
    await Promise.all([singleFlight('a', load), singleFlight('b', load)]);
    expect(load).toHaveBeenCalledTimes(2);
    await singleFlight('a', load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('shares a failure and then lets the next caller retry', async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValue('ok');
    const [a, b] = await Promise.allSettled([
      singleFlight('f', load),
      singleFlight('f', load),
    ]);
    expect(a.status).toBe('rejected');
    expect(b.status).toBe('rejected');
    expect(load).toHaveBeenCalledTimes(1);
    await expect(singleFlight('f', load)).resolves.toBe('ok');
  });
});

describe('jitterTtl', () => {
  it('stays inside +/-20 % and is never below 1', () => {
    expect(jitterTtl(100, 0.2, () => 0)).toBe(80);
    expect(jitterTtl(100, 0.2, () => 1)).toBe(120);
    expect(jitterTtl(1, 0.2, () => 0)).toBe(1);
  });
});

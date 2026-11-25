import { ExpAvgMeasurement, Gradient2Limit } from './gradient2-limit';

/**
 * The port must behave like Netflix concurrency-limits Gradient2Limit
 * (Apache-2.0); numbers recomputed by hand from
 * the Java update formula.
 */
describe('ExpAvgMeasurement (Netflix port)', () => {
  it('is the plain mean during warm-up, then an exponential average', () => {
    const m = new ExpAvgMeasurement(100, 3);
    expect(m.add(10)).toBe(10);
    expect(m.add(20)).toBe(15);
    expect(m.add(30)).toBe(20);
    // factor 2/(100+1)
    const f = 2 / 101;
    expect(m.add(100)).toBeCloseTo(20 * (1 - f) + 100 * f, 10);
    m.update((v) => v * 0.5);
    expect(m.get()).toBeCloseTo((20 * (1 - f) + 100 * f) * 0.5, 10);
    m.reset();
    expect(m.get()).toBe(0);
  });
});

describe('Gradient2Limit (Netflix port)', () => {
  it('grows 50 → 51 at steady latency (Java formula by hand)', () => {
    const limit = new Gradient2Limit({
      initialLimit: 50,
      maxLimit: 200,
      minLimit: 1,
    });
    // inflight 50 ≥ limit/2, short = long RTT → gradient 1, +4 queue, ×0.2
    expect(limit.update(10, 50)).toBe(50); // 50*0.8 + 54*0.2 = 50.8
    expect(limit.update(10, 50)).toBe(51); // 50.8*0.8 + 54.8*0.2 = 51.6
  });

  it('a 10x slower sample shrinks the limit', () => {
    const limit = new Gradient2Limit({
      initialLimit: 100,
      maxLimit: 200,
      minLimit: 1,
    });
    for (let i = 0; i < 10; i++) limit.update(10, 100);
    const before = limit.limit;
    // gradient = max(0.5, 1.5 * longRtt / 100) = 0.5 → smaller
    const after = limit.update(100, 100);
    expect(after).toBeLessThan(before);
  });

  it('does not grow while the server is app-limited (inflight < limit/2)', () => {
    const limit = new Gradient2Limit({ initialLimit: 20, minLimit: 20 });
    for (let i = 0; i < 100; i++) limit.update(5, 3);
    expect(limit.limit).toBe(20);
  });

  it('stays inside the admin bounds, read live', () => {
    const limit = new Gradient2Limit({
      initialLimit: 20,
      minLimit: 20,
      maxLimit: 30,
    });
    for (let i = 0; i < 200; i++) limit.update(5, limit.limit);
    expect(limit.limit).toBe(30);
    limit.setBounds(5, 25);
    expect(limit.limit).toBe(25);
    for (let i = 0; i < 200; i++) limit.update(500, limit.limit);
    expect(limit.limit).toBeGreaterThanOrEqual(5);
    // A broken setting (min 0, max below min) is ignored.
    limit.setBounds(0, -1);
    expect(limit.limit).toBeGreaterThanOrEqual(5);
  });

  it('ignores an empty sample', () => {
    const limit = new Gradient2Limit();
    expect(limit.update(0, 100)).toBe(20);
    expect(limit.update(Number.NaN, 100)).toBe(20);
  });
});

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// KNOWN_ERRORS 260/261: the admin Lighthouse job calibrates the CPU slowdown to
// the runner (apps/admin/lighthouse-cpu.cjs, used by lighthouserc.cjs) with a
// table fitted on 160 admin-ci jobs.
const require = createRequire(import.meta.url);
const cpu = require('../../lighthouse-cpu.cjs') as {
  KNOTS: [number, number][];
  inRange: (bi: number) => boolean;
  cpuSlowdownMultiplier: (bi: number | string) => number;
  median: (xs: number[]) => number;
};

describe('lighthouse-cpu', () => {
  it('keeps x4 on the reference runner', () => {
    expect(cpu.cpuSlowdownMultiplier(2950)).toBe(4);
    expect(cpu.cpuSlowdownMultiplier('2950')).toBe(4);
  });

  it('gives the measured multipliers of the runner classes', () => {
    // 26.11: slow runner (d323e2a8e class), 3400 class (x4.6 on 26.11 was right),
    // and PR #1319's 4251 runner, which the calculator curve sent to x6.2.
    expect(cpu.cpuSlowdownMultiplier(2450)).toBe(3.3);
    expect(cpu.cpuSlowdownMultiplier(3426)).toBe(4.55);
    expect(cpu.cpuSlowdownMultiplier(4251)).toBe(4.65);
    expect(cpu.cpuSlowdownMultiplier(2800)).toBeCloseTo(3.74, 2); // linear between knots
  });

  it('never decreases as the runner gets faster', () => {
    let prev = 0;
    for (let bi = 2000; bi <= 5000; bi += 10) {
      const m = cpu.cpuSlowdownMultiplier(bi);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it('clamps outside the fitted range and says so', () => {
    expect(cpu.cpuSlowdownMultiplier(1800)).toBe(3.3);
    expect(cpu.cpuSlowdownMultiplier(5200)).toBe(4.88);
    expect(cpu.inRange(1800)).toBe(false);
    expect(cpu.inRange(5200)).toBe(false);
    expect(cpu.inRange(2950)).toBe(true);
  });

  it('refuses a missing measurement', () => {
    expect(() => cpu.cpuSlowdownMultiplier(Number.NaN)).toThrow(/not a measured runner/);
    expect(() => cpu.cpuSlowdownMultiplier(0)).toThrow(/not a measured runner/);
  });

  it('takes the median of the calibration runs', () => {
    expect(cpu.median([2400, 3000, 2500])).toBe(2500);
    expect(cpu.median([2400, 2600])).toBe(2500);
    expect(Number.isNaN(cpu.median([]))).toBe(true);
  });
});

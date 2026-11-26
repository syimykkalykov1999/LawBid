import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// KNOWN_ERRORS 260: the admin Lighthouse job calibrates the CPU slowdown to
// the runner (apps/admin/lighthouse-cpu.cjs, used by lighthouserc.cjs).
const require = createRequire(import.meta.url);
const cpu = require('../../lighthouse-cpu.cjs') as {
  calculatorMultiplier: (bi: number) => number | null;
  cpuSlowdownMultiplier: (bi: number | string) => number;
  median: (xs: number[]) => number;
};

describe('lighthouse-cpu', () => {
  it('matches the Lighthouse CPU throttling calculator', () => {
    // The calculator prints 4.0x for 1533, 3.0x for 1300, 2.0x for 800, 1.0x for 150.
    expect(cpu.calculatorMultiplier(1533)).toBeCloseTo(4, 2);
    expect(cpu.calculatorMultiplier(1300)).toBe(3);
    expect(cpu.calculatorMultiplier(800)).toBe(2);
    expect(cpu.calculatorMultiplier(150)).toBe(1);
    expect(cpu.calculatorMultiplier(149)).toBeNull();
  });

  it('keeps x4 on the reference runner and scales the others', () => {
    expect(cpu.cpuSlowdownMultiplier(2950)).toBe(4);
    expect(cpu.cpuSlowdownMultiplier('2950')).toBe(4);
    // Slow runner of 26.11 (d323e2a8e) and the fast one (5daf90b22 class).
    expect(cpu.cpuSlowdownMultiplier(2400)).toBe(3.1);
    expect(cpu.cpuSlowdownMultiplier(3450)).toBe(4.9);
    expect(cpu.cpuSlowdownMultiplier(4000)).toBe(5.8);
  });

  it('refuses a runner too slow to emulate the target', () => {
    expect(() => cpu.cpuSlowdownMultiplier(100)).toThrow(/too slow/);
    expect(() => cpu.cpuSlowdownMultiplier(Number.NaN)).toThrow(/too slow/);
  });

  it('takes the median of the calibration runs', () => {
    expect(cpu.median([2400, 3000, 2500])).toBe(2500);
    expect(cpu.median([2400, 2600])).toBe(2500);
    expect(Number.isNaN(cpu.median([]))).toBe(true);
  });
});

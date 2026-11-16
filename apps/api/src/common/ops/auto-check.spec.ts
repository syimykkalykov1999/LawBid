import {
  AUTO_CHECK_DEFAULT_MINUTES,
  autoCheckMs,
  autoLockTtlS,
} from './auto-check';

/** 15.11: infra.auto_check_minutes — how often «Авто» looks. */
describe('auto check interval', () => {
  it('default 10 minutes and a 9-minute lock, as before', () => {
    expect(AUTO_CHECK_DEFAULT_MINUTES).toBe(10);
    expect(autoCheckMs(10)).toBe(600_000);
    expect(autoLockTtlS(600_000)).toBe(540);
  });

  it('live tests: 1 minute, lock 30 s (shorter than the pause)', () => {
    expect(autoCheckMs(1)).toBe(60_000);
    expect(autoLockTtlS(60_000)).toBe(30);
    expect(autoLockTtlS(120_000)).toBe(60);
  });

  it('0, junk or a missing value = the default', () => {
    for (const v of [0, -5, Number.NaN, undefined]) {
      expect(autoCheckMs(v)).toBe(600_000);
    }
  });
});

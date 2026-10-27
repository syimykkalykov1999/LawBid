import {
  isIdleResult,
  nextIdleState,
  shouldSkipTick,
  type IdleState,
} from './cron-idle-backoff';

const now = new Date('2026-10-25T12:00:00Z');
const ago = (min: number): IdleState['lastRunAt'] =>
  new Date(now.getTime() - min * 60_000).toISOString();

describe('isIdleResult', () => {
  it.each([
    [null],
    [undefined],
    [{}],
    [{ skipped: 'heavy jobs paused' }],
    [{ built: null, expired: 0 }],
    [{ expired: 0, day: 0, hour: 0, ended: 0 }],
    [[]],
  ])('%j is idle', (r) => expect(isIdleResult(r)).toBe(true));

  it.each([
    [{ built: 'abc', expired: 0 }],
    [{ expired: 1 }],
    [{ sent: 0, missed: 2 }],
    [7],
    ['x'],
    [[1]],
    [{ error: 'boom' }],
  ])('%j is work', (r) => expect(isIdleResult(r)).toBe(false));
});

describe('nextIdleState', () => {
  it('counts empty runs and resets on work', () => {
    let s = nextIdleState(null, true, now);
    s = nextIdleState(s, true, now);
    expect(s.empty).toBe(2);
    expect(nextIdleState(s, false, now).empty).toBe(0);
  });
});

describe('shouldSkipTick', () => {
  const base = { afterRuns: 10, everyMs: 5 * 60_000, now };
  it('off: never skips', () => {
    expect(
      shouldSkipTick({
        ...base,
        mode: 'off',
        state: { empty: 99, lastRunAt: ago(1) },
      }),
    ).toBe(false);
  });
  it('auto: runs every minute until N empty runs', () => {
    expect(
      shouldSkipTick({
        ...base,
        mode: 'auto',
        state: { empty: 9, lastRunAt: ago(1) },
      }),
    ).toBe(false);
  });
  it('auto: after N empty runs skips until 5 minutes passed', () => {
    const state = { empty: 10, lastRunAt: ago(1) };
    expect(shouldSkipTick({ ...base, mode: 'auto', state })).toBe(true);
    expect(
      shouldSkipTick({
        ...base,
        mode: 'auto',
        state: { empty: 10, lastRunAt: ago(5) },
      }),
    ).toBe(false);
  });
  it('on: slow pace from the first run', () => {
    expect(
      shouldSkipTick({
        ...base,
        mode: 'on',
        state: { empty: 0, lastRunAt: ago(2) },
      }),
    ).toBe(true);
  });
  it('no state (first run, or woken): runs', () => {
    expect(shouldSkipTick({ ...base, mode: 'on', state: null })).toBe(false);
  });
});

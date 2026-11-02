import { throttledWarn } from './throttled-warn';

describe('throttledWarn', () => {
  it('logs at most once per window', () => {
    let t = 0;
    const logger = {
      warn: jest.fn<void, [Record<string, unknown>, string]>(),
    };
    const warn = throttledWarn(logger, 1000, () => t);
    warn({ a: 1 }, 'm');
    warn({ a: 2 }, 'm');
    t = 999;
    warn({ a: 3 }, 'm');
    t = 1000;
    warn({ a: 4 }, 'm');
    expect(logger.warn.mock.calls.map(([ctx]) => ctx)).toEqual([
      { a: 1 },
      { a: 4 },
    ]);
  });
});

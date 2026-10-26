import type { ErrorEvent } from '@sentry/nestjs';
import { throttledBeforeSend } from './sentry-throttle';

const ev = (msg: string): ErrorEvent => ({
  type: undefined,
  exception: { values: [{ type: 'Error', value: msg }] },
});

describe('throttledBeforeSend', () => {
  it('lets the same error through 5 times a minute, then drops it', () => {
    let t = 0;
    const f = throttledBeforeSend((e) => e, { now: () => t });
    const results = Array.from({ length: 8 }, () => f(ev('boom')));
    expect(results.filter(Boolean)).toHaveLength(5);
    t = 61_000;
    expect(f(ev('boom'))).not.toBeNull();
  });

  it('a different error is counted on its own', () => {
    const f = throttledBeforeSend((e) => e, {
      perErrorPerMinute: 1,
      now: () => 0,
    });
    expect(f(ev('a'))).not.toBeNull();
    expect(f(ev('a'))).toBeNull();
    expect(f(ev('b'))).not.toBeNull();
  });

  it('caps the total per minute', () => {
    const f = throttledBeforeSend((e) => e, {
      totalPerMinute: 3,
      now: () => 0,
    });
    const sent = ['a', 'b', 'c', 'd', 'e'].map((m) => f(ev(m))).filter(Boolean);
    expect(sent).toHaveLength(3);
  });

  it('keeps the original filter: an event it drops is dropped', () => {
    const f = throttledBeforeSend(() => null, { now: () => 0 });
    expect(f(ev('x'))).toBeNull();
  });
});

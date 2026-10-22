import {
  SOCKET_EVENT_CAPACITY,
  SOCKET_EVENT_REFILL_PER_SECOND,
  newSocketEventBucket,
  takeSocketEvent,
} from './socket-event-bucket';

/** Security research #5 (2026-10-22), A5. */
describe('socket event bucket', () => {
  it('allows a burst up to the capacity, then refuses', () => {
    const t0 = 1_000_000;
    const b = newSocketEventBucket(t0);
    for (let i = 0; i < SOCKET_EVENT_CAPACITY; i++) {
      expect(takeSocketEvent(b, t0)).toBe(true);
    }
    expect(takeSocketEvent(b, t0)).toBe(false);
    expect(takeSocketEvent(b, t0 + 100)).toBe(false);
  });

  it('refills over time, never above the capacity', () => {
    const t0 = 5_000;
    const b = newSocketEventBucket(t0);
    for (let i = 0; i < SOCKET_EVENT_CAPACITY; i++) takeSocketEvent(b, t0);
    // One second later: `refill` more packets, no more.
    const t1 = t0 + 1000;
    for (let i = 0; i < SOCKET_EVENT_REFILL_PER_SECOND; i++) {
      expect(takeSocketEvent(b, t1)).toBe(true);
    }
    expect(takeSocketEvent(b, t1)).toBe(false);
    // A long pause fills it back to the capacity only.
    const t2 = t1 + 3_600_000;
    expect(takeSocketEvent(b, t2)).toBe(true);
    expect(b.tokens).toBeCloseTo(SOCKET_EVENT_CAPACITY - 1, 5);
  });

  it('a clock going backwards does not refill', () => {
    const t0 = 10_000;
    const b = newSocketEventBucket(t0);
    for (let i = 0; i < SOCKET_EVENT_CAPACITY; i++) takeSocketEvent(b, t0);
    expect(takeSocketEvent(b, t0 - 60_000)).toBe(false);
  });

  it('a sustained flood is held to the refill rate', () => {
    const b = newSocketEventBucket(0);
    let accepted = 0;
    // 100 packets per second for 10 seconds.
    for (let ms = 0; ms < 10_000; ms += 10) {
      if (takeSocketEvent(b, ms)) accepted++;
    }
    expect(accepted).toBeLessThanOrEqual(
      SOCKET_EVENT_CAPACITY + 10 * SOCKET_EVENT_REFILL_PER_SECOND + 1,
    );
    expect(accepted).toBeGreaterThanOrEqual(SOCKET_EVENT_CAPACITY);
  });
});

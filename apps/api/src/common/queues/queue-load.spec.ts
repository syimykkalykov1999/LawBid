import { queueLoadSignal } from './queue-load';

const row = (queue: string, waiting: number, oldestAgeSeconds = 0) => ({
  queue,
  waiting,
  oldestAgeSeconds,
});

describe('queueLoadSignal', () => {
  it('off = the old flat sum (the DLQ never counts)', () => {
    const out = queueLoadSignal(
      [row('push', 7), row('files', 3), row('stripe-webhooks-dlq', 100)],
      'off',
    );
    expect(out).toEqual({ signal: 10, rawWaiting: 10 });
  });

  it('on = backlog weighted by cost per job', () => {
    // 1000 push sends are cheap, 10 exports are not.
    const cheap = queueLoadSignal([row('push', 1000)], 'on').signal;
    const dear = queueLoadSignal([row('data-export', 10)], 'on').signal;
    expect(cheap).toBe(500);
    expect(dear).toBe(250);
    expect(queueLoadSignal([row('unknown-queue', 4)], 'on').signal).toBe(4);
  });

  it('auto adds pressure for an old queue head, none for a young one', () => {
    const young = queueLoadSignal([row('files', 10, 60)], 'auto').signal;
    const old = queueLoadSignal([row('files', 10, 420)], 'auto').signal;
    expect(young).toBe(50);
    // 300 s over the free 120 s = 5 min x 50 = +250
    expect(old).toBe(300);
  });

  it('pressure is capped per queue and ignores an empty queue', () => {
    const capped = queueLoadSignal([row('push', 1, 86_400)], 'auto').signal;
    expect(capped).toBeLessThanOrEqual(501);
    expect(queueLoadSignal([row('push', 0, 9_999)], 'auto').signal).toBe(0);
  });
});

/* eslint-disable @typescript-eslint/require-await -- hand-made Redis fakes */
import { ChatService } from './chat.service';

/** S1-3: the sweep that finishes the effects of a message whose request
 * died after the commit. */
describe('ChatService.redeliverPending', () => {
  const member = JSON.stringify({ c: 'conv1', u: 'u1', k: 'cm1', s: 0, r: 1 });

  function make(opts: { stored: boolean; ready?: boolean }) {
    const entries = new Map<string, number>([[member, 1000]]);
    const redis = {
      status: opts.ready === false ? 'reconnecting' : 'ready',
      zrangebyscore: jest.fn(async (_k: string, _min: string, max: number) =>
        [...entries].filter(([, t]) => t <= max).map(([m]) => m),
      ),
      zrem: jest.fn(async (_k: string, m: string) => entries.delete(m)),
      zscore: jest.fn(async (_k: string, m: string) => entries.get(m)),
    };
    const svc = new (
      ChatService as unknown as new (...a: unknown[]) => ChatService
    )(
      { conversation: { findUnique: jest.fn(async () => ({ id: 'conv1' })) } },
      ...Array(15).fill(undefined),
      redis,
    );
    const priv = svc as unknown as Record<string, jest.Mock>;
    priv.findOwn = jest.fn(async () => (opts.stored ? { id: 'm1' } : null));
    priv.deliverEffects = jest.fn(async () => ({}));
    return { svc, redis, priv, entries };
  }

  it('re-sends a stored message and drops the entry (recount, not +1)', async () => {
    const { svc, priv, entries } = make({ stored: true });
    const r = await svc.redeliverPending(1000 + 130_000);
    expect(r).toEqual({ redelivered: 1, dropped: 0 });
    expect(priv.deliverEffects).toHaveBeenCalledWith(
      { id: 'conv1' },
      { id: 'm1' },
      'u1',
      { silent: false, requestFirst: true, recount: true },
    );
    expect(entries.size).toBe(0);
  });

  it('a message that was never stored only drops the entry', async () => {
    const { svc, priv, entries } = make({ stored: false });
    const r = await svc.redeliverPending(1000 + 130_000);
    expect(r).toEqual({ redelivered: 0, dropped: 1 });
    expect(priv.deliverEffects).not.toHaveBeenCalled();
    expect(entries.size).toBe(0);
  });

  it('leaves entries younger than the grace alone, and does nothing without Redis', async () => {
    const young = make({ stored: true });
    expect(await young.svc.redeliverPending(1000 + 5000)).toEqual({
      redelivered: 0,
      dropped: 0,
    });
    expect(young.entries.size).toBe(1);
    const down = make({ stored: true, ready: false });
    expect(await down.svc.redeliverPending(1000 + 130_000)).toEqual({
      redelivered: 0,
      dropped: 0,
    });
  });
});

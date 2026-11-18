/* eslint-disable @typescript-eslint/require-await -- hand-made Redis fake */
import { PresenceService } from './presence.service';

/**
 * Verify 5b (C3): an older instance's grace timer must not settle (delete
 * and announce) a NEWER hold written after the person reconnected and
 * dropped again elsewhere — the hold carries a token and is settled by
 * compare-and-delete.
 */
describe('PresenceService offline hold token (C3)', () => {
  function make() {
    const kv = new Map<string, string>();
    const redis = {
      set: jest.fn(async (k: string, v: string) => {
        kv.set(k, v);
        return 'OK';
      }),
      get: jest.fn(async (k: string) => kv.get(k) ?? null),
      del: jest.fn(async (k: string) => (kv.delete(k) ? 1 : 0)),
      // the compare-and-delete script, as Redis would run it
      eval: jest.fn(
        async (_lua: string, _n: number, k: string, token: string) => {
          if (kv.get(k) !== token) return 0;
          kv.delete(k);
          return 1;
        },
      ),
      zcount: jest.fn(async () => 0),
    };
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const svc = new PresenceService(
      { user: { updateMany } } as never,
      redis as never,
      {} as never,
      {} as never,
    );
    return { svc, kv, updateMany };
  }

  it('old timer after reconnect + new drop: the newer hold survives and settles itself', async () => {
    const { svc, kv, updateMany } = make();
    // instance A: the last socket drops, hold A
    const a = await svc.holdOffline('u1', 10);
    // instance B: the person reconnects (cancels A's hold) and drops again
    expect(await svc.cancelOffline('u1')).toBe(true);
    const b = await svc.holdOffline('u1', 10);
    expect(b).not.toBe(a);
    // A's timer fires first: it must not remove B's hold nor announce
    expect(await svc.settleOffline('u1', new Date(), a)).toBe(false);
    expect(kv.has('presence:off:u1')).toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
    // B's own timer settles once
    expect(await svc.settleOffline('u1', new Date(), b)).toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(kv.has('presence:off:u1')).toBe(false);
  });
});

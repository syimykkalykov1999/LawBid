/* eslint-disable @typescript-eslint/require-await -- hand-made Redis fakes */
import { PresenceService } from './presence.service';

/** S1-4: the held-back "offline" announcement and the cached permission. */
describe('PresenceService offline grace + permission cache', () => {
  function make(opts: { live?: number } = {}) {
    const kv = new Map<string, string>();
    const redis = {
      set: jest.fn(async (k: string, v: string) => {
        kv.set(k, v);
        return 'OK';
      }),
      get: jest.fn(async (k: string) => kv.get(k) ?? null),
      del: jest.fn(async (k: string) => (kv.delete(k) ? 1 : 0)),
      zcount: jest.fn(async () => opts.live ?? 0),
      pipeline: () => {
        const p = {
          zcount: () => p,
          exec: async () => [[null, opts.live ?? 0]],
        };
        return p;
      },
    };
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const findMany = jest.fn(async () => [
      { id: 'v', last_active_at: null, show_activity_status: true },
      { id: 't', last_active_at: null, show_activity_status: true },
    ]);
    const privacy = {
      lastSeenVisibleTo: jest.fn(async () => new Set(['t'])),
    };
    const svc = new PresenceService(
      { user: { updateMany, findMany } } as never,
      redis as never,
      privacy as never,
    );
    return { svc, redis, updateMany, findMany };
  }

  it('a reconnect inside the grace cancels the announcement, nothing is written', async () => {
    const { svc, updateMany } = make();
    await svc.holdOffline('u1', 10);
    expect(await svc.cancelOffline('u1')).toBe(true);
    expect(await svc.settleOffline('u1', new Date())).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('after the grace the person is settled once: last seen written, announce', async () => {
    const { svc, updateMany } = make();
    await svc.holdOffline('u1', 10);
    const at = new Date('2026-10-25T10:00:00Z');
    expect(await svc.settleOffline('u1', at)).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { last_active_at: at },
    });
    // a second instance's timer finds nothing to settle
    expect(await svc.settleOffline('u1', at)).toBe(false);
  });

  it('someone else came online meanwhile: no announcement', async () => {
    const { svc, updateMany } = make({ live: 1 });
    await svc.holdOffline('u1', 10);
    expect(await svc.settleOffline('u1', new Date())).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('mayWatch asks the database once per ttl window', async () => {
    const { svc, findMany } = make();
    expect(await svc.mayWatch('v', 't', 30)).toBe(true);
    expect(await svc.mayWatch('v', 't', 30)).toBe(true);
    expect(findMany).toHaveBeenCalledTimes(1);
    await svc.mayWatch('v', 't', 0);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

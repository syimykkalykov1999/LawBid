/* eslint-disable @typescript-eslint/require-await -- hand-made Redis fake */
import { PresenceService } from '../../modules/presence/presence.service';
import { PRESENCE_SETTLED_CHANNEL } from '../../common/presence/live-presence';
import { PresenceSettleJob } from './presence-settle.job';

/**
 * Verify 5b (C4): the "offline" settle used to live only in the holding
 * process's setTimeout — a crashed API never settled (watchers kept
 * "online", `last_active_at` was never written). The delayed
 * `presence.settle` job settles it from any process; a reconnect before it
 * (the hold deleted / replaced, or a live connection anywhere) makes it a
 * no-op.
 */
describe('PresenceSettleJob (C4)', () => {
  function make(opts: { show?: boolean } = {}) {
    const kv = new Map<string, string>();
    let live = 0;
    const redis = {
      set: jest.fn(async (k: string, v: string) => {
        kv.set(k, v);
        return 'OK';
      }),
      del: jest.fn(async (k: string) => (kv.delete(k) ? 1 : 0)),
      eval: jest.fn(
        async (_lua: string, _n: number, k: string, token: string) => {
          if (kv.get(k) !== token) return 0;
          kv.delete(k);
          return 1;
        },
      ),
      zcount: jest.fn(async () => live),
      publish: jest.fn(async () => 1),
    };
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const findUnique = jest.fn(async () => ({
      show_activity_status: opts.show ?? true,
    }));
    const prisma = { user: { updateMany, findUnique } };
    const presence = new PresenceService(
      prisma as never,
      redis as never,
      {} as never,
    );
    const job = new PresenceSettleJob(prisma as never, redis as never);
    return {
      kv,
      redis,
      updateMany,
      presence,
      job,
      setLive: (n: number) => (live = n),
    };
  }
  const leftAt = '2026-11-17T20:00:00.000Z';

  it('the holding process died (no timer anywhere): the job settles and announces', async () => {
    const t = make();
    const token = await t.presence.holdOffline('u1', 10);
    // the API that held it is gone; only the queued job runs
    const res = await t.job.run({ userId: 'u1', token, leftAt });
    expect(res).toEqual({ settled: true });
    expect(t.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { last_active_at: new Date(leftAt) },
    });
    expect(t.kv.has('presence:off:u1')).toBe(false);
    expect(t.redis.publish).toHaveBeenCalledWith(
      PRESENCE_SETTLED_CHANNEL,
      JSON.stringify({ userId: 'u1', leftAt }),
    );
  });

  it('reconnect before the job: the hold is gone, nothing settled or announced', async () => {
    const t = make();
    const token = await t.presence.holdOffline('u1', 10);
    expect(await t.presence.cancelOffline('u1')).toBe(true);
    const res = await t.job.run({ userId: 'u1', token, leftAt });
    expect(res.settled).toBe(false);
    expect(t.updateMany).not.toHaveBeenCalled();
    expect(t.redis.publish).not.toHaveBeenCalled();
  });

  it('reconnect + new drop: the old job leaves the newer hold to its own job', async () => {
    const t = make();
    const old = await t.presence.holdOffline('u1', 10);
    await t.presence.cancelOffline('u1');
    const fresh = await t.presence.holdOffline('u1', 10);
    expect(
      (await t.job.run({ userId: 'u1', token: old, leftAt })).settled,
    ).toBe(false);
    expect(t.kv.get('presence:off:u1')).toBe(fresh);
    expect(t.redis.publish).not.toHaveBeenCalled();
    expect(
      (await t.job.run({ userId: 'u1', token: fresh, leftAt })).settled,
    ).toBe(true);
    expect(t.redis.publish).toHaveBeenCalledTimes(1);
  });

  it('live on another server: not settled', async () => {
    const t = make();
    const token = await t.presence.holdOffline('u1', 10);
    t.setLive(1);
    expect((await t.job.run({ userId: 'u1', token, leftAt })).settled).toBe(
      false,
    );
    expect(t.updateMany).not.toHaveBeenCalled();
    expect(t.redis.publish).not.toHaveBeenCalled();
  });

  it('a person who hides their status: settled, never announced', async () => {
    const t = make({ show: false });
    const token = await t.presence.holdOffline('u1', 10);
    expect((await t.job.run({ userId: 'u1', token, leftAt })).settled).toBe(
      true,
    );
    expect(t.updateMany).toHaveBeenCalledTimes(1);
    expect(t.redis.publish).not.toHaveBeenCalled();
  });

  it('the hold outlives the grace, so a late job still finds it', async () => {
    const t = make();
    await t.presence.holdOffline('u1', 10);
    const ttl = t.redis.set.mock.calls[0] as unknown as [
      string,
      string,
      string,
      number,
    ];
    expect(ttl[3]).toBeGreaterThanOrEqual(10 + 600);
  });
});

import { Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { bullOptions, createRedisClient } from './redis-connection';
import { ck, delSafe, mgetSafe, pipeline } from './redis-cluster-safe';

/**
 * Opt-in: needs a real Redis Cluster, e.g.
 *   docker run -d -p 17000-17002:17000-17002 redis:7-alpine sh -c '…'
 *   REDIS_CLUSTER_TEST_URL=redis://127.0.0.1:17000 npx jest redis-cluster.integration
 * Skipped in normal runs and CI.
 */
const URL = process.env.REDIS_CLUSTER_TEST_URL;
const d = URL ? describe : describe.skip;
const ENV = { REDIS_CLUSTER: 'true' };

d('against a real Redis Cluster', () => {
  let r: Redis;
  beforeAll(() => {
    r = createRedisClient(URL as string, { maxRetriesPerRequest: 3 }, ENV);
  });
  afterAll(async () => {
    await r.quit().catch(() => undefined);
  });

  it('routes single-key commands over all shards', async () => {
    for (let i = 0; i < 20; i++) await r.set(`it:k${i}`, String(i));
    expect(await r.get('it:k7')).toBe('7');
  });

  it('a Lua script over untagged keys of other slots is CROSSSLOT, tagged keys work', async () => {
    const lua =
      "redis.call('SET', KEYS[1], 1) redis.call('SET', KEYS[2], 2) return 1";
    await expect(r.eval(lua, 2, 'it:a', 'it:b')).rejects.toThrow(/CROSSSLOT/);
    await expect(
      r.eval(lua, 2, ck('t', 'it:a', ENV), ck('t', 'it:b', ENV)),
    ).resolves.toBe(1);
  });

  it('mgetSafe, delSafe and the split pipeline work across slots', async () => {
    const keys = Array.from({ length: 12 }, (_, i) => `it:m${i}`);
    for (const k of keys) await r.set(k, k);
    expect(await mgetSafe(r, keys, ENV)).toEqual(keys);
    await expect(r.mget(keys)).rejects.toThrow(/CROSSSLOT/);
    const p = pipeline(r, ENV);
    keys.forEach((k) => p.get(k));
    const res = await p.exec();
    expect(res?.map((x) => x[1])).toEqual(keys);
    expect(await delSafe(r, keys, ENV)).toBe(12);
  });

  it('sharded pub/sub (SSUBSCRIBE / SPUBLISH) delivers', async () => {
    const sub = r.duplicate();
    const got = new Promise<string>((resolve) => {
      sub.on('smessage', (_c: string, m: string) => resolve(m));
    });
    await (
      sub as unknown as { ssubscribe(c: string): Promise<unknown> }
    ).ssubscribe('it:chan');
    await (
      r as unknown as { spublish(c: string, m: string): Promise<number> }
    ).spublish('it:chan', 'hello');
    expect(await got).toBe('hello');
    sub.disconnect();
  });

  it('BullMQ queue + worker with the {queue} prefix process a job', async () => {
    const name = 'it-queue';
    const q = new Queue(name, bullOptions(name, URL as string, {}, ENV));
    const done = new Promise<string>((resolve, reject) => {
      const w = new Worker(
        name,
        (job) => Promise.resolve(job.data as string),
        bullOptions(name, URL as string, { worker: true }, ENV),
      );
      w.on('completed', (_j, result: string) => {
        void w.close().then(() => resolve(result));
      });
      w.on('error', reject);
    });
    await q.add('j', 'payload');
    expect(await done).toBe('payload');
    await q.obliterate({ force: true });
    await q.close();
  }, 30_000);
});

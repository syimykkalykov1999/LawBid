import Redis from 'ioredis';
import {
  createRedisClient,
  drainAutoPipeline,
  pubSubClient,
  quitGracefully,
  requestPathOptions,
  waitForReady,
} from './redis-connection';

const URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * KNOWN_ERRORS 194 (17.11, #1195 «API perf guard (user endpoints)»: 8×
 * «Test suite failed to run: Connection is closed.»). With auto-pipelining
 * on, commands issued in the same tick as quit() are written on the next
 * setImmediate, after QUIT, and are rejected. quitGracefully() drains the
 * documented `autoPipelineQueueSize` first. Runs on a real Redis (dev
 * docker / CI service); skipped without one.
 */
describe('auto-pipelining and shutdown (real Redis)', () => {
  let probe: Redis;
  let up = false;

  beforeAll(async () => {
    probe = new Redis(URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    probe.on('error', () => undefined);
    try {
      await probe.connect();
      await probe.ping();
      up = true;
    } catch {
      up = false;
    }
  });

  afterAll(() => probe.disconnect());

  const client = async () => {
    const c = createRedisClient(URL, {
      ...requestPathOptions(1000),
      enableAutoPipelining: true,
    });
    c.on('error', () => undefined);
    await waitForReady(c, 5_000);
    return c;
  };

  it('plain quit() overtakes the queued commands (the bug, pinned)', async () => {
    if (!up) return;
    const c = await client();
    const key = `apq-plain-${process.pid}-${Date.now()}`;
    const results = Array.from({ length: 50 }, () =>
      c.incr(key).then(
        () => 'ok',
        () => 'rejected',
      ),
    );
    await c.quit();
    const out = await Promise.all(results);
    expect(out.filter((r) => r === 'rejected').length).toBe(50);
  });

  it('quitGracefully() writes every queued command before QUIT', async () => {
    if (!up) return;
    const c = await client();
    const key = `apq-drain-${process.pid}-${Date.now()}`;
    const results = Array.from({ length: 50 }, () =>
      c.incr(key).then(
        () => 'ok',
        () => 'rejected',
      ),
    );
    expect(c.autoPipelineQueueSize).toBe(50);
    await quitGracefully(c);
    const out = await Promise.all(results);
    expect(out.every((r) => r === 'ok')).toBe(true);
    expect(await probe.get(key)).toBe('50');
    await probe.del(key);
  });

  it('a pub/sub clone never auto-pipelines (SSUBSCRIBE / SUNSUBSCRIBE are not excluded by ioredis)', () => {
    const base = createRedisClient(URL, {
      ...requestPathOptions(1000),
      enableAutoPipelining: true,
    });
    base.on('error', () => undefined);
    const sub = pubSubClient(base);
    sub.on('error', () => undefined);
    expect(base.options.enableAutoPipelining).toBe(true);
    expect(sub.options.enableAutoPipelining).toBe(false);
    expect(sub.options.enableOfflineQueue).toBe(true);
    sub.disconnect();
    base.disconnect();
  });

  it('drainAutoPipeline is a no-op for a client without the queue (test doubles)', async () => {
    await expect(drainAutoPipeline({})).resolves.toBeUndefined();
  });
});

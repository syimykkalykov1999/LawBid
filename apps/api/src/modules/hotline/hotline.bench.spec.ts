import Redis from 'ioredis';
import { bandOf } from '../../common/app-settings/hotline-settings';
import { bucketOf, HotlineKeys, HotlineStore } from './hotline.store';
import { pipeline } from '../../redis/redis-cluster-safe';

const URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
jest.setTimeout(600_000);

/**
 * Owner 16.11 ~18:45: the laptop load numbers of the hot path (10 000
 * attorneys on the line, 100 000 clients). Opt-in: HOTLINE_BENCH=1 (CI does
 * not run it); prints the numbers for the PR.
 */
const run = process.env.HOTLINE_BENCH === '1' ? describe : describe.skip;

run('hotline bench (real Valkey)', () => {
  let redis: Redis;
  const k = new HotlineKeys(`hlbench:{hlb${process.pid}}`);
  let store: HotlineStore;
  const NOW = Date.now();
  const STATES = ['CA', 'NY', 'TX', 'FL', 'IL'];
  const PRACTICES = ['family', 'immigration', 'criminal', 'labor'];
  const LANGS = ['en', 'es', 'ru', 'zh', 'vi'];
  const pick = <T>(a: T[], i: number) => a[i % a.length];
  /** 100 buckets, spread evenly: attorney / client i → bucket i mod 100. */
  const bucketFor = (i: number) =>
    bucketOf(
      pick(STATES, i),
      pick(PRACTICES, Math.floor(i / 5)),
      pick(LANGS, Math.floor(i / 20)),
    );

  beforeAll(() => {
    redis = new Redis(URL);
    store = new HotlineStore(redis, k);
  });

  afterAll(async () => {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${k.p}*`,
        'COUNT',
        1000,
      );
      if (keys.length) await redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
    redis.disconnect();
  });

  it('10 000 attorneys join, 100 000 clients ask, counters read', async () => {
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) {
      const b = [bucketFor(i)];
      const lw = `L${i}`;
      await store.lawyerOn(lw, NOW + 3_600_000, true);
      await store.setLawyerMembership(
        lw,
        { buckets: b, langs: [b[0].split('~')[2]] },
        { buckets: [], langs: [] },
      );
      await store.free(lw, b, NOW, NOW + 10_000, NOW + i);
    }
    const tJoin = performance.now() - t0;

    const t1 = performance.now();
    let offers = 0;
    for (let i = 0; i < 100_000; i++) {
      const req = `R${i}`;
      const b = [bucketFor(i)];
      const p = pipeline(redis);
      p.hset(k.rst, req, 's');
      p.hset(k.rcl, req, `C${i}`);
      await p.exec();
      const [kind, lw] = await store.match(
        req,
        b,
        NOW,
        NOW + 10_000,
        NOW + i,
        0,
      );
      if (kind === 'offer') {
        offers += 1;
        // as the service does after a reservation
        await store.dropLawyerFromBuckets(lw, b);
      }
    }
    const tAsk = performance.now() - t1;

    const keys: string[] = [];
    for (const s of STATES)
      for (const p of PRACTICES)
        for (const l of LANGS) keys.push(bucketOf(s, p, l));
    const t2 = performance.now();
    const ROUNDS = 1000;
    for (let r = 0; r < ROUNDS; r++) {
      const p = pipeline(redis);
      for (const b of keys) {
        p.scard(k.bucketLawyers(b));
        p.zcard(k.queue(b));
      }
      const res = (await p.exec()) ?? [];
      res.forEach((x) => bandOf(Number(x?.[1] ?? 0), [1, 10, 50, 100]));
    }
    const tCount = performance.now() - t2;
    const mem = await redis.memory('USAGE', k.lst);

    const line = (label: string, n: number, ms: number) =>
      `${label}: ${n} in ${(ms / 1000).toFixed(1)} s = ${Math.round((n / ms) * 1000)}/s, ${(ms / n).toFixed(3)} ms each`;
    console.log(
      [
        line('attorney joins (on + membership + free script)', 10_000, tJoin),
        line('client requests (match script)', 100_000, tAsk),
        `  of them offered at once: ${offers}, queued: ${100_000 - offers}`,
        line(
          `counter passes (${keys.length} buckets, one pipeline)`,
          ROUNDS,
          tCount,
        ),
        `  attorney state hash for 10 000: ${mem} bytes`,
      ].join('\n'),
    );
    // every attorney got exactly one client (100 buckets, 1 000 clients each)
    expect(offers).toBe(10_000);
  });
});

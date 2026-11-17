import Redis from 'ioredis';
import { bucketOf, HotlineKeys, HotlineStore } from './hotline.store';

const URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * The matching scripts against a real Valkey / Redis (dev docker, CI service
 * container); skipped without one, like heavy-hitters.service.spec.ts.
 * Owner scenarios 16.11 ~19:30 (a)–(e) at the store level; the service spec
 * covers the same through the API.
 */
describe('hotline matching scripts (real Valkey)', () => {
  let redis: Redis;
  let up = false;
  let n = 0;
  let store: HotlineStore;
  let k: HotlineKeys;
  const NOW = 1_800_000_000_000;
  const TTL = NOW + 60_000;
  const DL = NOW + 10_000;
  const B = bucketOf('CA', 'family', 'en');
  const B2 = bucketOf('CA', 'family', 'es');

  beforeAll(async () => {
    redis = new Redis(URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined);
    try {
      await redis.connect();
      await redis.ping();
      up = true;
    } catch {
      up = false;
    }
  });

  beforeEach(() => {
    n += 1;
    k = new HotlineKeys(`hltest:{hlt${process.pid}x${n}}`);
    store = new HotlineStore(redis, k);
  });

  afterEach(async () => {
    if (!up) return;
    const keys = await redis.keys(`hltest:{hlt${process.pid}x${n}}*`);
    if (keys.length) await redis.del(...keys);
  });

  afterAll(() => redis.disconnect());

  const lawyer = async (id: string, buckets = [B], idleAt = NOW - 1000) => {
    await store.lawyerOn(id, TTL, true);
    return store.free(id, buckets, NOW, DL, idleAt);
  };
  const request = async (
    id: string,
    created: number,
    buckets = [B],
    client = `c-${id}`,
    maxQueue = 0,
  ) => {
    await redis.hset(k.rst, id, 's');
    await redis.hset(k.rcl, id, client);
    return store.match(id, buckets, NOW, DL, created, maxQueue);
  };

  it('no attorney: the client waits under his original time (UC 1)', async () => {
    if (!up) return;
    expect(await request('r1', 100)).toEqual(['queued', '']);
    expect(await redis.zscore(k.queue(B), 'r1')).toBe('100');
    expect(await store.requestState('r1')).toBe('q');
  });

  it('(a) 1 attorney joins, 2 online waiting → the OLDEST gets him, nobody offline notified', async () => {
    if (!up) return;
    await request('old', 100);
    await request('new', 200);
    await request('offline', 50);
    await store.goOffline('offline');
    expect(await lawyer('L1')).toEqual(['offer', 'old']);
    expect(await store.lawyerState('L1')).toBe('o|old');
    expect(await store.requestState('old')).toBe('o|L1');
    // the attorney is not free any more: no notice for the offline entry
    const pick = await store.notifyPick(B, NOW, 150, NOW + 60_000, 200);
    expect(pick).toEqual({ free: 0, outstanding: 0, picked: [] });
  });

  it('(b) 3 attorneys join, 2 online + offline list → 2 served, offline notified for the 3rd', async () => {
    if (!up) return;
    await request('on1', 100);
    await request('on2', 200);
    for (const [id, t] of [
      ['off1', 10],
      ['off2', 20],
      ['off3', 30],
    ] as const) {
      await request(id, t);
      await store.goOffline(id);
    }
    expect((await lawyer('L1'))[1]).toBe('on1');
    expect((await lawyer('L2'))[1]).toBe('on2');
    expect(await lawyer('L3')).toEqual(['idle', '']);
    // ceil(1 free × 150 %) = 2 notices, oldest offline first
    const pick = await store.notifyPick(B, NOW, 150, NOW + 60_000, 200);
    expect(pick.free).toBe(1);
    expect(pick.picked).toEqual(['off1', 'off2']);
    // a second pass while they are open sends nothing more
    expect(
      (await store.notifyPick(B, NOW, 150, NOW + 60_000, 200)).picked,
    ).toEqual([]);
    // the rate budget caps a pass
    await redis.del(k.ntf);
    expect(
      (await store.notifyPick(B, NOW, 150, NOW + 60_000, 1)).picked,
    ).toEqual(['off1']);
  });

  it('(c) 1000 online + 1100 attorneys: every client is offered exactly one attorney, 100 stay idle', async () => {
    if (!up) return;
    for (let i = 0; i < 1000; i++) await request(`r${i}`, 1000 + i);
    const offered = new Map<string, string>();
    let idle = 0;
    for (let i = 0; i < 1100; i++) {
      const [kind, req] = await lawyer(`L${i}`);
      if (kind === 'offer') {
        expect(offered.has(req)).toBe(false);
        offered.set(req, `L${i}`);
      } else idle += 1;
    }
    expect(offered.size).toBe(1000);
    expect(idle).toBe(100);
    // FIFO: the first attorney got the oldest request
    expect(offered.get('r0')).toBe('L0');
    expect(await redis.zcard(k.queue(B))).toBe(0);
  });

  it('(c′) batch pass pairs a burst in one call, oldest with longest idle', async () => {
    if (!up) return;
    for (let i = 0; i < 5; i++) {
      await store.lawyerOn(`L${i}`, TTL, true);
      await redis.zadd(k.bucket(B), 10 + i, `L${i}`);
    }
    for (let i = 0; i < 3; i++) {
      await redis.hset(k.rst, `r${i}`, 'q');
      await redis.zadd(k.queue(B), 100 + i, `r${i}`);
    }
    expect(await store.pairBucket(B, NOW, DL, 100)).toEqual([
      ['r0', 'L0'],
      ['r1', 'L1'],
      ['r2', 'L2'],
    ]);
  });

  it('(d) a notified client taps after the attorney was taken → online with his ORIGINAL time, served next', async () => {
    if (!up) return;
    await request('off', 10);
    await store.goOffline('off');
    expect(await lawyer('L1')).toEqual(['idle', '']);
    await store.notifyPick(B, NOW, 150, NOW + 60_000, 200);
    // a live caller takes L1 meanwhile
    expect(await request('live', 500)).toEqual(['offer', 'L1']);
    // the tap: online again, original time kept, still waiting
    expect(await store.claim('off')).toBe(true);
    expect(await store.claim('off')).toBe(true); // double tap
    expect(await store.match('off', [B], NOW, DL, 10, 0)).toEqual([
      'queued',
      '',
    ]);
    expect(await redis.zscore(k.queue(B), 'off')).toBe('10');
    // a newer live caller waits too; the next free attorney goes to «off»
    await request('newer', 600);
    expect(await lawyer('L2')).toEqual(['offer', 'off']);
  });

  it('(e) double «Взять» is idempotent; a late one and a stranger are refused', async () => {
    if (!up) return;
    await lawyer('L1');
    await request('r1', 100);
    expect(await store.accept('r1', 'L2', NOW)).toBe('gone');
    expect(await store.accept('r1', 'L1', DL + 1)).toBe('late');
    expect(await store.accept('r1', 'L1', NOW)).toBe('ok');
    expect(await store.accept('r1', 'L1', NOW)).toBe('already');
    expect(await store.lawyerState('L1')).toBe('b|r1');
  });

  it('(e) two clients at once never get the same attorney (race)', async () => {
    if (!up) return;
    await lawyer('L1');
    const [a, b] = await Promise.all([request('r1', 100), request('r2', 101)]);
    const offers = [a, b].filter((x) => x[0] === 'offer');
    expect(offers).toHaveLength(1);
  });

  it('an attorney who skipped a request is not offered it again; the next one is (UC decline)', async () => {
    if (!up) return;
    await lawyer('L1', [B], NOW - 2000);
    await lawyer('L2', [B], NOW - 1000);
    expect(await request('r1', 100)).toEqual(['offer', 'L1']);
    expect(await store.release('r1', 'L1', 'declined', NOW + 3600_000)).toBe(
      'ok',
    );
    expect(await store.lawyerState('L1')).toBe('i');
    // L1 free again: the skipped request is not his
    expect(await store.free('L1', [B], NOW, DL, NOW)).toEqual(['idle', '']);
    expect(await store.match('r1', [B], NOW, DL, 100, 0)).toEqual([
      'offer',
      'L2',
    ]);
  });

  it('an attorney is never offered his own request (same account as client)', async () => {
    if (!up) return;
    await lawyer('L1');
    expect(await request('r1', 100, [B], 'L1')).toEqual(['queued', '']);
  });

  it('a request in two languages waits in both queues; matched in one, the other entry is stale (skipped) until cleaned', async () => {
    if (!up) return;
    expect(await request('r1', 100, [B, B2])).toEqual(['queued', '']);
    expect(await lawyer('L1', [B2])).toEqual(['offer', 'r1']);
    expect(await redis.zcard(k.queue(B2))).toBe(0);
    // the en entry stays until the service's cleanup, and is never offered
    expect(await redis.zcard(k.queue(B))).toBe(1);
    expect(await lawyer('L2', [B])).toEqual(['idle', '']);
    expect(await redis.zcard(k.queue(B))).toBe(0);
    await store.dropRequestFromQueues('r1', [B, B2]);
  });

  it('narrow filter is not starved: the oldest request across all the attorney’s queues wins', async () => {
    if (!up) return;
    await request('broad', 200, [B]);
    await request('narrow', 100, [B2]);
    expect(await lawyer('L1', [B, B2])).toEqual(['offer', 'narrow']);
  });

  it('a full queue refuses a new client (max queue per bucket)', async () => {
    if (!up) return;
    expect(await request('r1', 100, [B], 'c1', 1)).toEqual(['queued', '']);
    expect(await request('r2', 101, [B], 'c2', 1)).toEqual(['full', '']);
  });

  it('an attorney whose heartbeat expired is skipped (left the section, screen off)', async () => {
    if (!up) return;
    await store.lawyerOn('L1', NOW - 1, true);
    await redis.zadd(k.bucket(B), 1, 'L1');
    expect(await request('r1', 100)).toEqual(['queued', '']);
  });

  it('attorney leaves mid-offer: released without memory, the request searches again', async () => {
    if (!up) return;
    await lawyer('L1');
    await request('r1', 100);
    expect(await store.lawyerOff('L1')).toEqual(['o|', 'r1']);
    expect(await store.release('r1', 'L1', 'offline', 0)).toBe('ok');
    expect(await store.lawyerState('L1')).toBeNull();
    expect(await store.requestState('r1')).toBe('s');
    expect(await redis.zcard(k.rqd)).toBe(0);
  });

  it('client cancels during an offer: the attorney is freed; cancel twice is fine', async () => {
    if (!up) return;
    await lawyer('L1');
    await request('r1', 100);
    expect(await store.cancel('r1', [B])).toEqual(['cancelled', 'L1']);
    expect(await store.lawyerState('L1')).toBe('i');
    expect(await store.cancel('r1', [B])).toEqual(['gone', '']);
  });

  it('end of call: idempotent, the attorney returns idle / not accepting / off', async () => {
    if (!up) return;
    await lawyer('L1');
    await request('r1', 100);
    await store.accept('r1', 'L1', NOW);
    expect(await store.cancel('r1', [B])).toEqual(['connected', 'L1']);
    expect(await store.endCall('r1', 'L1', 'n')).toBe('ok');
    expect(await store.endCall('r1', 'L1', 'n')).toBe('gone');
    expect(await store.lawyerState('L1')).toBe('n');
  });

  it('night window in the client’s clock: no notice at night', async () => {
    if (!up) return;
    await request('off', 10);
    await store.goOffline('off');
    await lawyer('L1');
    // NOW is 2027-01-15 08:00 UTC; offset −480 (Pacific) = 00:00 → night 21–8
    const minutesUtc = Math.floor(NOW / 60000) % 1440;
    expect(minutesUtc).toBe(480);
    await redis.hset(k.nq, 'off', `-480,${21 * 60},${8 * 60}`);
    expect(
      (await store.notifyPick(B, NOW, 150, NOW + 60_000, 200)).picked,
    ).toEqual([]);
    // the client allowed night calls / a day-time zone
    await redis.hset(k.nq, 'off', `0,${21 * 60},${8 * 60}`);
    expect(
      (await store.notifyPick(B, NOW, 150, NOW + 60_000, 200)).picked,
    ).toEqual(['off']);
    expect(await redis.hget(k.natt, 'off')).toBe('1');
  });

  it('an online waiter blocks notices (rule 1: online first)', async () => {
    if (!up) return;
    await request('off', 10);
    await store.goOffline('off');
    await request('on', 20);
    // L1 skipped «on» earlier, so he is idle while «on» waits
    await redis.zadd(k.rqd, NOW + 1e6, 'on|L1');
    expect(await lawyer('L1')).toEqual(['idle', '']);
    expect(
      (await store.notifyPick(B, NOW, 150, NOW + 60_000, 200)).picked,
    ).toEqual([]);
  });
});

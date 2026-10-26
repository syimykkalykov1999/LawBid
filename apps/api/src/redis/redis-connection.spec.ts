import Redis, { Cluster } from 'ioredis';
import {
  attachAuthRefresh,
  bullOptions,
  closeSharedProducers,
  createRedisClient,
  isAuthError,
  isRedisClusterMode,
  jitteredBackoff,
  parseRedisUrl,
  PRODUCER_OPTIONS,
  reconnectOnReadonly,
  redisOptions,
  setRedisUrlProvider,
  sharedProducer,
} from './redis-connection';
import { EventEmitter } from 'node:events';
import { ck, delSafe, keySlot, mgetSafe, pipeline } from './redis-cluster-safe';
import { socketAdapterMode } from '../modules/realtime/realtime-publisher.service';

jest.setTimeout(20_000);

const URL = 'rediss://:s3cret%2Fx@cache.example.com:6380';
const OFF = {};
const ON = { REDIS_CLUSTER: 'true' };

describe('redis connection factory', () => {
  it('reads the switch', () => {
    expect(isRedisClusterMode(OFF)).toBe(false);
    expect(isRedisClusterMode({ REDIS_CLUSTER: 'false' })).toBe(false);
    expect(isRedisClusterMode(ON)).toBe(true);
    expect(isRedisClusterMode({ REDIS_CLUSTER: '1' })).toBe(true);
  });

  it('parses the url (tls, decoded password, default port)', () => {
    expect(parseRedisUrl(URL)).toEqual({
      host: 'cache.example.com',
      port: 6380,
      username: undefined,
      password: 's3cret/x',
      tls: true,
    });
    expect(parseRedisUrl('redis://localhost').port).toBe(6379);
  });

  it('standalone: a plain Redis client, not a Cluster', () => {
    const c = createRedisClient(
      'redis://localhost:6379',
      { maxRetriesPerRequest: 3, commandTimeout: 2000 },
      OFF,
    );
    expect(c).not.toBeInstanceOf(Cluster);
    expect(c.options.commandTimeout).toBe(2000);
    expect(c.options.maxRetriesPerRequest).toBe(3);
    c.disconnect();
  });

  it('cluster: an ioredis Cluster with TLS, identity dnsLookup, sharded subscribers', () => {
    const c = createRedisClient(
      URL,
      { commandTimeout: 1500 },
      {
        ...ON,
        REDIS_CLUSTER_NAT_MAP: '{"10.0.0.1:6379":{"host":"h","port":1}}',
      },
    ) as unknown as Cluster;
    expect(c).toBeInstanceOf(Cluster);
    const o = c.options;
    expect(o.shardedSubscribers).toBe(true);
    expect(o.redisOptions?.tls).toEqual({});
    expect(o.redisOptions?.password).toBe('s3cret/x');
    expect(o.redisOptions?.commandTimeout).toBe(1500);
    expect(o.natMap).toEqual({ '10.0.0.1:6379': { host: 'h', port: 1 } });
    const cb = jest.fn();
    o.dnsLookup?.('node-1.example.com', cb);
    expect(cb).toHaveBeenCalledWith(null, 'node-1.example.com');
    c.disconnect();
  });

  it('cluster without TLS in the url leaves tls off', () => {
    const c = createRedisClient(
      'redis://localhost:7000',
      {},
      ON,
    ) as unknown as Cluster;
    expect(c.options.redisOptions?.tls).toBeUndefined();
    c.disconnect();
  });
});

describe('bullOptions', () => {
  afterAll(() => closeSharedProducers());

  it('standalone worker: own connection, no retry limit, shared reconnect options', () => {
    const w = bullOptions('push', 'redis://h:1', { worker: true }, OFF);
    expect(w.prefix).toBeUndefined();
    expect(w.connection).toEqual({
      url: 'redis://h:1',
      maxRetriesPerRequest: null,
      reconnectOnError: reconnectOnReadonly,
      retryStrategy: expect.any(Function),
    });
  });

  it('standalone queue: the ONE shared fail-fast producer connection', () => {
    const a = bullOptions('push', 'redis://h:1', {}, OFF);
    const b = bullOptions('files', 'redis://h:1', {}, OFF);
    expect(a.prefix).toBeUndefined();
    expect(a.connection).toBe(b.connection);
    const o = (a.connection as Redis).options;
    expect(o.enableOfflineQueue).toBe(false);
    expect(o.maxRetriesPerRequest).toBe(1);
    expect(o.commandTimeout).toBe(2000);
    expect(o.reconnectOnError).toBe(reconnectOnReadonly);
  });

  it('cluster: {queue} prefix and a Cluster connection (worker: no retry limit)', () => {
    const q = bullOptions('push', 'redis://h:1', {}, ON);
    expect(q.prefix).toBe('{push}');
    expect(q.connection).toBeInstanceOf(Cluster);
    const w = bullOptions('push', 'redis://h:1', { worker: true }, ON);
    expect(
      (w.connection as Cluster).options.redisOptions?.maxRetriesPerRequest,
    ).toBeNull();
    (w.connection as Cluster).disconnect();
  });

  it('cluster: REDIS_BULL_PREFIX puts every queue in one slot', () => {
    const env = { ...ON, REDIS_BULL_PREFIX: '{bull}' };
    const a = bullOptions('push', 'redis://h:1', {}, env);
    const b = bullOptions('files', 'redis://h:1', {}, env);
    expect(a.prefix).toBe('{bull}');
    expect(b.prefix).toBe('{bull}');
    expect(keySlot(`${a.prefix}:push:wait`)).toBe(
      keySlot(`${b.prefix}:files:meta`),
    );
  });

  it('every BullMQ key of a queue shares one slot under the prefix', () => {
    const p = bullOptions('push', 'redis://h:1', {}, ON);
    const keys = ['wait', 'active', 'id', 'meta', 'events', 'stalled'].map(
      (k) => `${p.prefix}:push:${k}`,
    );
    expect(new Set(keys.map(keySlot)).size).toBe(1);
  });
});

describe('socket adapter choice', () => {
  it('standalone follows SOCKET_IO_ADAPTER (sharded by default)', () => {
    expect(socketAdapterMode(OFF)).toBe('sharded');
    expect(socketAdapterMode({ SOCKET_IO_ADAPTER: 'classic' })).toBe('classic');
  });
  it('cluster forces the sharded adapter even when classic is set', () => {
    expect(
      socketAdapterMode({
        REDIS_CLUSTER: 'true',
        SOCKET_IO_ADAPTER: 'classic',
      }),
    ).toBe('sharded');
  });
});

describe('cluster-safe helpers', () => {
  it('keySlot matches the Redis spec examples', () => {
    expect(keySlot('foo')).toBe(12182);
    expect(keySlot('{user1000}.following')).toBe(
      keySlot('{user1000}.followers'),
    );
    expect(keySlot('{}x')).not.toBe(keySlot('{}y'));
  });

  it('ck is a no-op standalone and a leading tag in cluster', () => {
    expect(ck('adm', 'adm:sess:1', OFF)).toBe('adm:sess:1');
    expect(ck('adm', 'adm:sess:1', ON)).toBe('{adm}adm:sess:1');
    expect(keySlot(ck('adm', 'a', ON))).toBe(keySlot(ck('adm', 'b', ON)));
  });

  it('mgetSafe / delSafe: one command standalone, per-key in cluster', async () => {
    const r = {
      mget: jest.fn().mockResolvedValue(['1', null]),
      get: jest.fn().mockResolvedValue('v'),
      del: jest.fn().mockResolvedValue(1),
    };
    expect(await mgetSafe(r as never, ['a', 'b'], OFF)).toEqual(['1', null]);
    expect(r.mget).toHaveBeenCalledWith(['a', 'b']);
    expect(await mgetSafe(r as never, ['a', 'b'], ON)).toEqual(['v', 'v']);
    expect(r.get).toHaveBeenCalledTimes(2);
    expect(await delSafe(r as never, ['a', 'b'], OFF)).toBe(1);
    expect(r.del).toHaveBeenLastCalledWith('a', 'b');
    expect(await delSafe(r as never, ['a', 'b'], ON)).toBe(2);
  });

  it('pipeline: standalone is redis.pipeline(); cluster splits by slot, keeps order', async () => {
    const standalone = { pipeline: jest.fn().mockReturnValue('P') };
    expect(pipeline(standalone as never, OFF)).toBe('P');

    const sent: string[][] = [];
    const redis = {
      pipeline: () => {
        const cmds: string[] = [];
        const p: Record<string, unknown> = {
          zcount: (k: string) => (cmds.push(k), p),
          exec: () => {
            sent.push(cmds);
            return Promise.resolve(cmds.map((c) => [null, `r:${c}`]));
          },
        };
        return p;
      },
    };
    const pipe = pipeline(redis as never, ON) as unknown as {
      zcount(k: string): unknown;
      exec(): Promise<[Error | null, unknown][]>;
    };
    const keys = ['k1', 'k2', 'k3', 'k4'];
    keys.forEach((k) => pipe.zcount(k));
    const res = await pipe.exec();
    expect(res.map((r) => r[1])).toEqual(keys.map((k) => `r:${k}`));
    expect(sent.flat().sort()).toEqual(keys);
    // no real pipeline mixes two slots
    for (const group of sent) {
      expect(new Set(group.map(keySlot)).size).toBe(1);
    }
  });
});

describe('shared options (S6-2)', () => {
  it('READONLY reconnects and resends (2); other errors do not', () => {
    expect(reconnectOnReadonly(new Error("READONLY You can't write"))).toBe(2);
    expect(reconnectOnReadonly(new Error('ERR boom'))).toBe(false);
    expect(redisOptions().reconnectOnError).toBe(reconnectOnReadonly);
  });

  it('retry delay is jittered between 50 % and 100 % of the base, capped', () => {
    expect(jitteredBackoff(10, () => 0)).toBe(250);
    expect(jitteredBackoff(10, () => 1)).toBe(500);
    expect(jitteredBackoff(1000, () => 1)).toBe(2000);
    expect(jitteredBackoff(1000, () => 0)).toBe(1000);
    expect(jitteredBackoff(10, Math.random)).toBeGreaterThanOrEqual(250);
  });

  it('every client gets them, standalone and cluster, and options pass through', () => {
    const c = createRedisClient(
      'redis://localhost:6379',
      { enableAutoPipelining: true, enableOfflineQueue: false },
      OFF,
    );
    expect(c.options.reconnectOnError).toBe(reconnectOnReadonly);
    expect(c.options.retryStrategy).toEqual(expect.any(Function));
    expect(c.options.enableAutoPipelining).toBe(true);
    expect(c.options.enableOfflineQueue).toBe(false);
    c.disconnect();
    const k = createRedisClient(
      'redis://localhost:7000',
      {},
      ON,
    ) as unknown as Cluster;
    expect(k.options.redisOptions?.reconnectOnError).toBe(reconnectOnReadonly);
    expect(
      k.options.clusterRetryStrategy?.(1, new Error('x') as never),
    ).toBeGreaterThan(0);
    k.disconnect();
  });

  it('auto-pipelining is not set unless asked', () => {
    const c = createRedisClient('redis://localhost:6379', {}, OFF);
    expect(c.options.enableAutoPipelining).toBeFalsy();
    c.disconnect();
  });

  it('PRODUCER_OPTIONS are the fail-fast set', () => {
    expect(PRODUCER_OPTIONS).toEqual({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 2000,
    });
  });

  it('sharedProducer: one per url, closed on request', async () => {
    const a = sharedProducer('redis://localhost:6379', OFF);
    expect(sharedProducer('redis://localhost:6379', OFF)).toBe(a);
    expect(sharedProducer('redis://localhost:6380', OFF)).not.toBe(a);
    await closeSharedProducers();
    expect(sharedProducer('redis://localhost:6379', OFF)).not.toBe(a);
    await closeSharedProducers();
  });
});

describe('WRONGPASS / NOAUTH token re-read (S6-9)', () => {
  afterEach(() => setRedisUrlProvider());

  function fake(password: string) {
    const e = new EventEmitter() as EventEmitter & {
      options: { password?: string; username?: string };
      disconnect: jest.Mock;
    };
    e.options = { password };
    e.disconnect = jest.fn();
    return e;
  }

  it('detects the two auth errors', () => {
    expect(
      isAuthError(new Error('WRONGPASS invalid username-password pair')),
    ).toBe(true);
    expect(isAuthError(new Error('NOAUTH Authentication required.'))).toBe(
      true,
    );
    expect(isAuthError(new Error('READONLY'))).toBe(false);
  });

  it('new token: updates the client and reconnects', async () => {
    setRedisUrlProvider(() => 'rediss://:new%2Ftoken@h:6379');
    const c = fake('old');
    const handle = attachAuthRefresh(c as never, () => 100_000);
    expect(await handle(new Error('WRONGPASS bad'))).toBe(true);
    expect(c.options.password).toBe('new/token');
    expect(c.disconnect).toHaveBeenCalledWith(true);
  });

  it('same token or no secret: nothing happens; other errors ignored', async () => {
    const c = fake('same');
    setRedisUrlProvider(() => 'redis://:same@h:6379');
    expect(
      await attachAuthRefresh(
        c as never,
        () => 1_000_000,
      )(new Error('NOAUTH x')),
    ).toBe(false);
    setRedisUrlProvider(() => undefined);
    expect(
      await attachAuthRefresh(
        c as never,
        () => 2_000_000,
      )(new Error('NOAUTH x')),
    ).toBe(false);
    expect(await attachAuthRefresh(c as never)(new Error('ECONNRESET'))).toBe(
      false,
    );
    expect(c.disconnect).not.toHaveBeenCalled();
  });

  it('re-reads at most once per 5 s; the error event triggers it', async () => {
    const provider = jest.fn().mockReturnValue('redis://:n@h:6379');
    setRedisUrlProvider(provider);
    let t = 10_000_000;
    const c = fake('o');
    const handle = attachAuthRefresh(c as never, () => t);
    await handle(new Error('WRONGPASS'));
    c.options.password = 'o';
    expect(await handle(new Error('WRONGPASS'))).toBe(false);
    expect(provider).toHaveBeenCalledTimes(1);
    t += 6000;
    expect(await handle(new Error('WRONGPASS'))).toBe(true);
    c.emit('error', new Error('WRONGPASS'));
  });
});

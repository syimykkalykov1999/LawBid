import { Cluster } from 'ioredis';
import {
  bullOptions,
  createRedisClient,
  isRedisClusterMode,
  parseRedisUrl,
} from './redis-connection';
import { ck, delSafe, keySlot, mgetSafe, pipeline } from './redis-cluster-safe';
import { socketAdapterMode } from '../modules/realtime/realtime-publisher.service';

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
  it('standalone is exactly the old shape, no prefix', () => {
    expect(bullOptions('push', 'redis://h:1', {}, OFF)).toEqual({
      connection: { url: 'redis://h:1' },
    });
    expect(bullOptions('push', 'redis://h:1', { worker: true }, OFF)).toEqual({
      connection: { url: 'redis://h:1', maxRetriesPerRequest: null },
    });
  });

  it('cluster: {queue} prefix and a Cluster connection (worker: no retry limit)', () => {
    const q = bullOptions('push', 'redis://h:1', {}, ON);
    expect(q.prefix).toBe('{push}');
    expect(q.connection).toBeInstanceOf(Cluster);
    const w = bullOptions('push', 'redis://h:1', { worker: true }, ON);
    expect(
      (w.connection as Cluster).options.redisOptions?.maxRetriesPerRequest,
    ).toBeNull();
    (q.connection as Cluster).disconnect();
    (w.connection as Cluster).disconnect();
  });

  it('every BullMQ key of a queue shares one slot under the prefix', () => {
    const p = bullOptions('push', 'redis://h:1', {}, ON);
    (p.connection as Cluster).disconnect();
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

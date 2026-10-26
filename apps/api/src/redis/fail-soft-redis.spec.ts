import type Redis from 'ioredis';
import { CircuitBreaker } from '../common/resilience/resilience';
import { failSoftRedis } from './fail-soft-redis';

/** Batch C item 9: a dead cache node must never break a request. */
describe('failSoftRedis', () => {
  it('passes values through while the cache works', async () => {
    const client = {
      get: jest.fn().mockResolvedValue('v'),
    } as unknown as Redis;
    expect(await failSoftRedis(client).get('k')).toBe('v');
  });

  it('answers like a miss when the cache fails, and reports it', async () => {
    const client = {
      get: jest.fn().mockRejectedValue(new Error('down')),
      set: jest.fn().mockRejectedValue(new Error('down')),
      del: jest.fn().mockRejectedValue(new Error('down')),
    } as unknown as Redis;
    const seen: string[] = [];
    const soft = failSoftRedis(client, (c) => seen.push(c));
    expect(await soft.get('k')).toBeNull();
    expect(await soft.set('k', 'v', 'EX', 5)).toBeNull();
    expect(await soft.del('k')).toBe(0);
    expect(seen).toEqual(['get', 'set', 'del']);
  });

  it('skips a dead cache for a while after three failures', async () => {
    const get = jest.fn().mockRejectedValue(new Error('down'));
    const soft = failSoftRedis(
      { get } as unknown as Redis,
      undefined,
      new CircuitBreaker('t', { threshold: 3, openMs: 60_000 }),
    );
    for (let i = 0; i < 6; i += 1) await soft.get('k');
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('leaves other commands (queues, locks) untouched', () => {
    const evalFn = jest.fn();
    const soft = failSoftRedis({ eval: evalFn } as unknown as Redis);
    void soft.eval('x', 0);
    expect(evalFn).toHaveBeenCalledWith('x', 0);
  });
});

describe('failSoftRedis: every guarded command (S6-10)', () => {
  const down = () => jest.fn().mockRejectedValue(new Error('down'));
  const cases: [string, unknown[], unknown][] = [
    ['mget', [['a', 'b', 'c']], [null, null, null]],
    ['mget', ['a', 'b'], [null, null]],
    ['hmget', ['k', 'f1', 'f2'], [null, null]],
    ['hmget', ['k', ['f1', 'f2', 'f3']], [null, null, null]],
    ['incr', ['k'], 0],
    ['incrby', ['k', 2], 0],
    ['pexpire', ['k', 100], 0],
    ['pttl', ['k'], -2],
    ['zscore', ['k', 'm'], null],
    ['zadd', ['k', 1, 'm'], 0],
    ['zrem', ['k', 'm'], 0],
    ['get', ['k'], null],
    ['hgetall', ['k'], {}],
    ['smembers', ['k'], []],
  ];
  it.each(cases)('%s answers like a miss', async (cmd, args, expected) => {
    const client = { [cmd]: down() } as unknown as Redis;
    const soft = failSoftRedis(client, undefined, new CircuitBreaker('x'));
    const out = await (
      soft as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
    )[cmd](...args);
    expect(out).toEqual(expected);
  });

  it('pipeline: queues normally, exec on a dead cache is a no-op []', async () => {
    const calls: string[] = [];
    const pipe: Record<string, unknown> = {};
    pipe.get = (k: string) => (calls.push(k), pipe);
    pipe.exec = jest.fn().mockRejectedValue(new Error('down'));
    const seen: string[] = [];
    const soft = failSoftRedis(
      { pipeline: () => pipe } as unknown as Redis,
      (c) => seen.push(c),
      new CircuitBreaker('p'),
    );
    const res = await soft.pipeline().get('a').get('b').exec();
    expect(res).toEqual([]);
    expect(calls).toEqual(['a', 'b']);
    expect(seen).toEqual(['pipeline']);
  });

  it('pipeline passes real replies through when the cache works', async () => {
    const pipe: Record<string, unknown> = {};
    pipe.get = () => pipe;
    pipe.exec = jest.fn().mockResolvedValue([[null, 'v']]);
    const soft = failSoftRedis(
      { pipeline: () => pipe } as unknown as Redis,
      undefined,
      new CircuitBreaker('p2'),
    );
    expect(await soft.pipeline().get('a').exec()).toEqual([[null, 'v']]);
  });
});

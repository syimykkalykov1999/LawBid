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

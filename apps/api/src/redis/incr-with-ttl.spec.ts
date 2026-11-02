import { incrWithTtl } from './incr-with-ttl';

describe('incrWithTtl', () => {
  it('runs one atomic script and returns the counter as a number', async () => {
    const redis = { eval: jest.fn().mockResolvedValue('3') };
    expect(await incrWithTtl(redis, 'k:1', 600)).toBe(3);
    expect(redis.eval).toHaveBeenCalledTimes(1);
    const [lua, nKeys, key, ttl] = redis.eval.mock.calls[0] as unknown[];
    expect(nKeys).toBe(1);
    expect(key).toBe('k:1');
    expect(ttl).toBe('600');
    // INCR and EXPIRE live in the same script: no gap to crash in.
    expect(String(lua)).toMatch(/INCR[\s\S]*EXPIRE/);
  });
});

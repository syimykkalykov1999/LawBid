/** Spec helper: gives a fake Redis (with `incr` + `expire` mocks) the `eval`
 * that [incrWithTtl] calls, replaying INCR then EXPIRE-on-first-hit. */
export function withEvalIncr<
  T extends {
    incr: (k: string) => Promise<unknown>;
    expire: (k: string, ttl: number) => Promise<unknown>;
  },
>(redis: T): T & { eval: jest.Mock } {
  const out = redis as T & { eval: jest.Mock };
  out.eval = jest.fn(
    async (_lua: string, _n: number, key: string, ttl: string) => {
      const n = Number(await redis.incr(key));
      if (n === 1) await redis.expire(key, Number(ttl));
      return n;
    },
  );
  return out;
}

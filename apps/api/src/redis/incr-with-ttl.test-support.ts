/** Spec helper: gives a fake Redis (with `incr` + `expire` mocks) the `eval`
 * that [incrWithTtl] calls, replaying INCR then EXPIRE-on-first-hit. */
export function withEvalIncr<T>(redis: T): T & { eval: jest.Mock } {
  const fake = redis as unknown as {
    incr: (k: string) => Promise<unknown>;
    expire: (k: string, ttl: number) => Promise<unknown>;
  };
  const out = redis as T & { eval: jest.Mock };
  out.eval = jest.fn(
    async (_lua: string, _n: number, key: string, ttl: string) => {
      const n = Number(await fake.incr(key));
      if (n === 1) await fake.expire(key, Number(ttl));
      return n;
    },
  );
  return out;
}

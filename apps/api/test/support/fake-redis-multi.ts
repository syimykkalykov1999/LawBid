/**
 * Verify batch 13: the code under test writes a counter and its TTL in one
 * MULTI. Unit fakes that implement single commands get MULTI from this:
 * the queued commands run on the fake, in order, on exec().
 */
export function fakeMulti(target: object) {
  const run = target as Record<string, (...a: unknown[]) => unknown>;
  return () => {
    const queue: Array<() => unknown> = [];
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, name: string) =>
          name === 'exec'
            ? async () => {
                const out: Array<[null, unknown]> = [];
                for (const f of queue) out.push([null, await f()]);
                return out;
              }
            : (...args: unknown[]) => {
                queue.push(() => run[name](...args));
                return chain;
              },
      },
    );
    return chain;
  };
}

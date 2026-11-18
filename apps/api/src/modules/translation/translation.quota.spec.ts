import { TranslationService } from './translation.service';

/** Verify 17.11 T5: the per-person daily quota is reserved atomically
 * before Google is called, so parallel requests can't overspend it. */
function fakeRedis() {
  const store = new Map<string, string>();
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    store,
    get: jest.fn(async (k: string) => {
      await tick();
      return store.get(k) ?? null;
    }),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      await tick();
      return 'OK';
    }),
    eval: jest.fn(async (_lua: string, _n: number, k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      await tick();
      return n;
    }),
    decr: jest.fn(async (k: string) => {
      const n = Number(store.get(k) ?? 0) - 1;
      store.set(k, String(n));
      await tick();
      return n;
    }),
  };
}

function setup(quota: number) {
  const redis = fakeRedis();
  const service = new TranslationService(
    {
      get: jest.fn().mockResolvedValue({ fields: { apiKey: 'k' } }),
    } as never,
    { isEnabled: jest.fn().mockResolvedValue(true) } as never,
    redis as never,
    { setContext: jest.fn() } as never,
    { getConfig: jest.fn().mockResolvedValue({}) } as never,
    {
      has: jest.fn().mockResolvedValue(true),
      limit: jest.fn().mockResolvedValue(quota),
    } as never,
  );
  const google = jest
    .spyOn(
      service as unknown as { callGoogle: () => Promise<unknown> },
      'callGoogle',
    )
    .mockImplementation(async () => {
      await new Promise((r) => setImmediate(r));
      return { text: 'x', sourceLanguage: 'en', targetLanguage: 'ru' };
    });
  return { service, redis, google };
}

const user = { sub: 'u1', role: 'client' } as never;

describe('TranslationService daily quota (race)', () => {
  it('parallel requests over the quota call Google only quota times', async () => {
    const s = setup(2);
    const results = await Promise.allSettled(
      [1, 2, 3, 4, 5, 6].map((i) =>
        s.service.translate(user, 'posts', `post:${i}`, `t${i}`, 'ru'),
      ),
    );
    expect(s.google).toHaveBeenCalledTimes(2);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  });

  it('a Google error gives the reserved slot back', async () => {
    const s = setup(1);
    s.google.mockRejectedValueOnce(new Error('HTTP 500'));
    await expect(
      s.service.translate(user, 'posts', 'post:1', 'a', 'ru'),
    ).rejects.toThrow('HTTP 500');
    await expect(
      s.service.translate(user, 'posts', 'post:2', 'b', 'ru'),
    ).resolves.toMatchObject({ text: 'x' });
  });
});

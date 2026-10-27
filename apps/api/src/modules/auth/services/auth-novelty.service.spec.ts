import { AuthNoveltyService } from './auth-novelty.service';

/** S14-4 (2026-10-25): server-side novelty with an in-memory Redis. */
class FakeRedis {
  sets = new Map<string, Set<string>>();
  strings = new Map<string, string>();
  scard(k: string) {
    return Promise.resolve(this.sets.get(k)?.size ?? 0);
  }
  sadd(k: string, v: string) {
    const s = this.sets.get(k) ?? new Set<string>();
    this.sets.set(k, s);
    const had = s.has(v);
    s.add(v);
    return Promise.resolve(had ? 0 : 1);
  }
  expire() {
    return Promise.resolve(1);
  }
  spop() {
    return Promise.resolve(null);
  }
  get(k: string) {
    return Promise.resolve(this.strings.get(k) ?? null);
  }
  set(k: string, v: string) {
    this.strings.set(k, v);
    return Promise.resolve('OK');
  }
}

describe('AuthNoveltyService', () => {
  const make = () => {
    const redis = new FakeRedis();
    return { redis, service: new AuthNoveltyService(redis as never) };
  };
  const safari =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

  it('the first country ever seen is a baseline, not an alert; a second one is novel once', async () => {
    const { service } = make();
    expect(await service.onLogin('u', { country: 'US' }, 'ios')).toEqual({
      newCountry: false,
      newBrowser: false,
    });
    expect(
      (await service.onLogin('u', { country: 'US' }, 'ios')).newCountry,
    ).toBe(false);
    expect(
      (await service.onLogin('u', { country: 'DE' }, 'ios')).newCountry,
    ).toBe(true);
    expect(
      (await service.onLogin('u', { country: 'DE' }, 'ios')).newCountry,
    ).toBe(false);
  });

  it('no country header: nothing to compare, never an alert', async () => {
    const { service } = make();
    await service.onLogin('u', { country: 'US' }, 'ios');
    expect(await service.onLogin('u', {}, 'ios')).toEqual({
      newCountry: false,
      newBrowser: false,
    });
  });

  it('a new browser family counts on the website only', async () => {
    const { service } = make();
    await service.onLogin('u', { userAgent: safari }, 'web');
    expect(
      (await service.onLogin('u', { userAgent: 'Edg/120 Windows' }, 'web'))
        .newBrowser,
    ).toBe(true);
    expect(
      (await service.onLogin('u', { userAgent: 'okhttp/4' }, 'android'))
        .newBrowser,
    ).toBe(false);
  });

  it('a refresh from a new country is flagged once per move', async () => {
    const { service } = make();
    await service.rememberChainCountry('c', 'US');
    expect(await service.refreshFromNewCountry('c', 'US')).toBe(false);
    expect(await service.refreshFromNewCountry('c', 'DE')).toBe(true);
    expect(await service.refreshFromNewCountry('c', 'DE')).toBe(false);
    expect(await service.refreshFromNewCountry('c', undefined)).toBe(false);
    expect(await service.refreshFromNewCountry('other', 'FR')).toBe(false);
  });

  it('a Redis failure is "nothing new", never a failed login', async () => {
    const redis = new FakeRedis();
    redis.scard = () => Promise.reject(new Error('down'));
    const service = new AuthNoveltyService(redis as never);
    expect(await service.onLogin('u', { country: 'US' }, 'ios')).toEqual({
      newCountry: false,
      newBrowser: false,
    });
  });
});

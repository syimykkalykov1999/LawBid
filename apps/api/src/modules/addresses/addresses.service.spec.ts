import { HttpException } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { AppConfigService } from '../feature-flags/services/app-config.service';
import type { RateLimitService } from '../auth/auth.public';
import {
  type AddressProvider,
  type AddressQuery,
  stripCountry,
} from './address-providers';
import {
  ADDRESS_CACHE_TTL_SEC,
  AddressesService,
  normalizeAddressQuery,
} from './addresses.service';

const settingsWith = (stored: Record<string, unknown> = {}) =>
  new AppSettingsService({
    getConfig: () => Promise.resolve(stored),
  } as unknown as AppConfigService);

/** A provider whose methods are plain jest.fn properties. */
type Fake = Pick<AddressProvider, 'name' | 'cacheable'> & {
  suggest: jest.Mock;
  configured: jest.Mock;
};

function fakeProvider(
  over: Partial<Pick<AddressProvider, 'name' | 'cacheable'>> & {
    suggest?: jest.Mock;
    configured?: jest.Mock;
  } = {},
): Fake {
  return {
    name: 'aws',
    cacheable: false,
    configured: jest.fn().mockResolvedValue(true),
    suggest: jest.fn((q: AddressQuery) =>
      Promise.resolve([
        {
          label: `${q.text} St, Hays, KS 67601`,
          city: 'Hays',
          stateCode: 'KS',
        },
      ]),
    ),
    ...over,
  };
}

function make(opts: {
  stored?: Record<string, unknown>;
  providers?: Fake[];
  limits?: Record<string, boolean>;
}) {
  const store = new Map<string, string>();
  const redis = {
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve('OK');
    }),
  };
  const limiter = {
    consumeFixedWindow: jest.fn((parts: string[]) =>
      Promise.resolve({
        allowed: !Object.entries(opts.limits ?? {}).some(
          ([k, ok]) => !ok && parts.join(':').startsWith(k),
        ),
        remaining: 1,
        retryAfterSeconds: 30,
      }),
    ),
  };
  const providers = opts.providers ?? [fakeProvider()];
  const svc = new AddressesService(
    redis as never,
    limiter as unknown as RateLimitService,
    settingsWith(opts.stored),
    providers,
  );
  return { svc, redis, limiter, providers };
}

describe('AddressesService (owner 2026-10-28)', () => {
  it('normalizes the query (case, punctuation, spaces)', () => {
    expect(normalizeAddressQuery('  12  MAIN st.,  Hays ')).toBe(
      '12 main st hays',
    );
    expect(normalizeAddressQuery('Apt #4-B')).toBe('apt #4-b');
  });

  it('drops the country tail from US labels', () => {
    expect(stripCountry('12 Main St, Hays, KS 67601, United States')).toBe(
      '12 Main St, Hays, KS 67601',
    );
    expect(stripCountry('Hays, KS, USA')).toBe('Hays, KS');
  });

  it('defaults: auto, aws, a monthly cap, a per-person day cap', async () => {
    const s = settingsWith();
    expect(await s.string('addresses.autocomplete_enabled')).toBe('auto');
    expect(await s.string('addresses.provider')).toBe('aws');
    expect(await s.number('addresses.monthly_cap')).toBeGreaterThan(0);
    expect(await s.number('addresses.per_user_per_day')).toBeGreaterThan(0);
  });

  it('switch off: enabled=false, no limiter, no provider call', async () => {
    for (const off of ['off', false]) {
      const { svc, providers, limiter } = make({
        stored: { 'addresses.autocomplete_enabled': off },
      });
      expect(await svc.suggest('u1', '12 main')).toEqual({
        enabled: false,
        items: [],
      });
      expect(providers[0].suggest).not.toHaveBeenCalled();
      expect(limiter.consumeFixedWindow).not.toHaveBeenCalled();
    }
  });

  it('auto without keys: enabled=false and nothing is called', async () => {
    const p = fakeProvider({ configured: jest.fn().mockResolvedValue(false) });
    const { svc } = make({ providers: [p] });
    expect((await svc.suggest('u1', '12 main')).enabled).toBe(false);
    expect(p.suggest).not.toHaveBeenCalled();
  });

  it('fewer than 3 letters: enabled, empty, no provider call', async () => {
    const { svc, providers } = make({});
    expect(await svc.suggest('u1', ' 1 ')).toEqual({
      enabled: true,
      items: [],
    });
    expect(providers[0].suggest).not.toHaveBeenCalled();
  });

  it('calls the chosen provider with the normalized text, US kind and session', async () => {
    const aws = fakeProvider();
    const google = fakeProvider({ name: 'google' });
    const { svc } = make({
      stored: { 'addresses.provider': 'google' },
      providers: [aws, google],
    });
    const res = await svc.suggest('u1', '12 Main', 'city', 'sess_12345678');
    expect(res.items[0].label).toBe('12 main St, Hays, KS 67601');
    expect(aws.suggest).not.toHaveBeenCalled();
    expect(google.suggest).toHaveBeenCalledWith({
      text: '12 main',
      kind: 'city',
      session: 'sess_12345678',
      limit: 5,
    });
  });

  it('per-person limit: 429 RATE_LIMITED, no provider call', async () => {
    const { svc, providers } = make({
      limits: { 'addresses:user:m': false },
    });
    await expect(svc.suggest('u1', '12 main')).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(providers[0].suggest).not.toHaveBeenCalled();
  });

  it('global per-minute limit or monthly cap reached: empty, no provider call', async () => {
    for (const k of ['addresses:global', 'addresses:month']) {
      const { svc, providers } = make({ limits: { [k]: false } });
      expect(await svc.suggest('u1', '12 main')).toEqual({
        enabled: true,
        items: [],
      });
      expect(providers[0].suggest).not.toHaveBeenCalled();
    }
    const { svc, providers } = make({
      stored: { 'addresses.monthly_cap': 0 },
    });
    expect((await svc.suggest('u1', '12 main')).items).toEqual([]);
    expect(providers[0].suggest).not.toHaveBeenCalled();
  });

  it('provider error: graceful empty list', async () => {
    const p = fakeProvider({
      suggest: jest.fn().mockRejectedValue(new Error('ThrottlingException')),
    });
    const { svc } = make({ providers: [p] });
    expect(await svc.suggest('u1', '12 main')).toEqual({
      enabled: true,
      items: [],
    });
  });

  it('cache hit: a cacheable provider is called once per normalized query (TTL 7 days)', async () => {
    const p = fakeProvider({ cacheable: true });
    const { svc, redis } = make({ providers: [p] });
    const a = await svc.suggest('u1', '12 Main');
    const b = await svc.suggest('u2', '  12   MAIN. ');
    expect(b).toEqual(a);
    expect(p.suggest).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^addr:v1:/),
      expect.any(String),
      'EX',
      ADDRESS_CACHE_TTL_SEC,
    );
    expect(ADDRESS_CACHE_TTL_SEC).toBeGreaterThanOrEqual(7 * 86_400);
  });

  it('terms: a provider that forbids caching never touches Redis', async () => {
    const { svc, redis, providers } = make({});
    await svc.suggest('u1', '12 main');
    await svc.suggest('u1', '12 main');
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(providers[0].suggest).toHaveBeenCalledTimes(2);
  });

  it('the same query in flight at once is one provider call', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const p = fakeProvider({
      suggest: jest.fn(async () => {
        await gate;
        return [{ label: 'x', city: null, stateCode: null }];
      }),
    });
    const { svc } = make({ providers: [p] });
    const both = Promise.all([
      svc.suggest('u1', '12 main'),
      svc.suggest('u2', '12 main'),
    ]);
    await new Promise((r) => setImmediate(r));
    release();
    const [a, b] = await both;
    expect(a).toEqual(b);
    expect(p.suggest).toHaveBeenCalledTimes(1);
  });
});

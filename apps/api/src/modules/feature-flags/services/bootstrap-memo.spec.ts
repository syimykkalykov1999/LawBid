import {
  BOOTSTRAP_BODY_KEY_PREFIX,
  BOOTSTRAP_CACHE_KEY,
  BootstrapService,
} from './bootstrap.service';

/** Perf batch 2 (13.11, row 125): GET /config/bootstrap is built once per
 * ETag (config version + 5-minute bucket), shared across tasks. */
class MemoryRedis {
  readonly store = new Map<string, string>();
  get = jest.fn((key: string) => Promise.resolve(this.store.get(key) ?? null));
  set = jest.fn((key: string, value: string) => {
    this.store.set(key, value);
    return Promise.resolve('OK');
  });
  mget = jest.fn((keys: string[]) =>
    Promise.resolve(keys.map((k) => this.store.get(k) ?? null)),
  );
  del = jest.fn((key: string) => {
    this.store.delete(key);
    return Promise.resolve(1);
  });
}

const EN = { code: 'en', name_native: 'English', is_active: true, sort: 0 };
const TERMS = {
  id: 'doc-1',
  doc_type: 'terms',
  version: '1.0',
  locale: 'en',
  content_url: null,
  content_md: '# Terms',
  published_at: new Date('2026-01-01T00:00:00Z'),
};

function make(redis = new MemoryRedis(), memoSec?: number) {
  const flags = {
    getFlags: jest.fn().mockResolvedValue({ apple_login: true }),
  };
  const appConfig = {
    getConfig: jest.fn().mockResolvedValue({ min_app_version_ios: '0.1.0' }),
  };
  const prisma = {
    i18nLanguage: { findMany: jest.fn().mockResolvedValue([EN]) },
    i18nBundleVersion: {
      findMany: jest.fn().mockResolvedValue([{ lang: 'en', version: 3 }]),
    },
    legalDocument: { findMany: jest.fn().mockResolvedValue([TERMS]) },
  };
  const settings =
    memoSec === undefined
      ? undefined
      : {
          number: jest.fn().mockResolvedValue(memoSec),
          string: jest.fn().mockResolvedValue('off'),
        };
  const service = new BootstrapService(
    prisma as never,
    flags as never,
    appConfig as never,
    redis as never,
    { get: jest.fn().mockResolvedValue(null), getAll: jest.fn() } as never,
    undefined,
    settings as never,
  );
  return { service, flags, appConfig, redis, prisma };
}

describe('BootstrapService.buildFor (perf batch 2)', () => {
  it('languages, legal documents and bundle versions stay live under the same tag (e2e «GET /config/bootstrap caching»)', async () => {
    const { service, redis, prisma } = make();
    await service.buildFor('W/"boot-7-1"');
    // a new language after the content cache is dropped (admin / invalidate)
    prisma.i18nLanguage.findMany.mockResolvedValue([
      EN,
      { code: 'zz', name_native: 'Zed', is_active: true, sort: 99 },
    ]);
    await redis.del(BOOTSTRAP_CACHE_KEY);
    // an i18n import sets only the bundle version key
    redis.store.set('i18n:bundle:version:zz', '7');
    const b = await service.buildFor('W/"boot-7-1"');
    expect(b.languages.map((l) => l.code)).toEqual(['en', 'zz']);
    expect(b.translations_version.zz).toBe(7);
  });

  it('builds once per tag, with fresh flag/config reads, and again for a new tag', async () => {
    const { service, flags, appConfig } = make();
    const a = await service.buildFor('W/"boot-7-1"');
    const b = await service.buildFor('W/"boot-7-1"');
    expect(b).toEqual(a);
    expect(flags.getFlags).toHaveBeenCalledTimes(1);
    expect(flags.getFlags).toHaveBeenCalledWith(true);
    expect(appConfig.getConfig).toHaveBeenCalledWith(true);

    // an admin change bumps the config version = a new tag = a new build
    await service.buildFor('W/"boot-8-1"');
    expect(flags.getFlags).toHaveBeenCalledTimes(2);
  });

  it('another task with the same Redis answers from the shared copy without building', async () => {
    const redis = new MemoryRedis();
    const first = make(redis);
    const built = await first.service.buildFor('W/"boot-7-1"');
    expect(redis.store.has(`${BOOTSTRAP_BODY_KEY_PREFIX}W/"boot-7-1"`)).toBe(
      true,
    );

    const second = make(redis);
    const shared = await second.service.buildFor('W/"boot-7-1"');
    expect(second.flags.getFlags).not.toHaveBeenCalled();
    expect(shared.flags).toEqual(built.flags);
    expect(shared.legal_documents[0].published_at).toBeInstanceOf(Date);
    expect(shared.legal_documents[0].published_at?.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('a translation import shows at once: the bundle versions are overlaid on every answer', async () => {
    const { service, redis, flags } = make();
    expect(
      (await service.buildFor('W/"boot-7-1"')).translations_version,
    ).toEqual({ en: 3 });
    redis.store.set('i18n:bundle:version:en', '9');
    expect(
      (await service.buildFor('W/"boot-7-1"')).translations_version,
    ).toEqual({ en: 9 });
    expect(flags.getFlags).toHaveBeenCalledTimes(1);
  });

  it('a corrupt shared copy is a miss, never an answer', async () => {
    const redis = new MemoryRedis();
    redis.store.set(`${BOOTSTRAP_BODY_KEY_PREFIX}W/"boot-7-1"`, '{"flags":1}');
    const { service, flags } = make(redis);
    const out = await service.buildFor('W/"boot-7-1"');
    expect(flags.getFlags).toHaveBeenCalledTimes(1);
    expect(out.flags.apple_login).toBe(true);
  });

  it('ops.bootstrap_cache_sec = 0: built on every request as before', async () => {
    const { service, flags, redis } = make(new MemoryRedis(), 0);
    await service.buildFor('W/"boot-7-1"');
    await service.buildFor('W/"boot-7-1"');
    expect(flags.getFlags).toHaveBeenCalledTimes(2);
    expect(flags.getFlags).toHaveBeenCalledWith();
    expect(
      [...redis.store.keys()].some((k) =>
        k.startsWith(BOOTSTRAP_BODY_KEY_PREFIX),
      ),
    ).toBe(false);
  });

  it('Redis away: still answers (built here)', async () => {
    const redis = new MemoryRedis();
    redis.get.mockRejectedValue(new Error('down'));
    redis.set.mockRejectedValue(new Error('down'));
    redis.mget.mockRejectedValue(new Error('down'));
    const { service } = make(redis);
    const out = await service.buildFor('W/"boot-7-1"');
    expect(out.translations_version).toEqual({ en: 3 });
  });
});

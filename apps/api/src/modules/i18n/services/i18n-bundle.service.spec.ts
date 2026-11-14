import { NotFoundException } from '@nestjs/common';
import { I18nBundleService } from './i18n-bundle.service';
import { I18nLanguagesService } from './i18n-languages.service';

function buildFakeLanguages(activeCode: string | null): I18nLanguagesService {
  return {
    getActiveOrThrow: jest.fn().mockImplementation((code: string) => {
      if (code !== activeCode) {
        throw new NotFoundException({
          code: 'I18N_LANGUAGE_NOT_FOUND',
          message: `Unknown or inactive language "${code}".`,
        });
      }
      return Promise.resolve({ code, is_active: true });
    }),
  } as unknown as I18nLanguagesService;
}

function buildFakeRedis(store: Map<string, string> = new Map()) {
  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
  };
}

describe('I18nBundleService.getCurrentVersion', () => {
  it('throws I18N_LANGUAGE_NOT_FOUND for an unknown/inactive language before touching Redis or Prisma', async () => {
    const languages = buildFakeLanguages('en');
    const redis = buildFakeRedis();
    const prisma = { i18nBundleVersion: { findUnique: jest.fn() } };
    const service = new I18nBundleService(
      prisma as never,
      languages,
      redis as never,
    );

    await expect(service.getCurrentVersion('xx')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(redis.get).not.toHaveBeenCalled();
    expect(prisma.i18nBundleVersion.findUnique).not.toHaveBeenCalled();
  });

  it('reads through to Prisma on a Redis cache miss and populates the cache', async () => {
    const languages = buildFakeLanguages('en');
    const redis = buildFakeRedis();
    const findUnique = jest.fn().mockResolvedValue({ lang: 'en', version: 3 });
    const prisma = { i18nBundleVersion: { findUnique } };
    const service = new I18nBundleService(
      prisma as never,
      languages,
      redis as never,
    );

    const version = await service.getCurrentVersion('en');

    expect(version).toBe(3);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'i18n:bundle:version:en',
      '3',
      'EX',
      expect.any(Number),
    );
  });

  it('returns 0 for a language that has never had a bundle version row', async () => {
    const languages = buildFakeLanguages('en');
    const redis = buildFakeRedis();
    const prisma = {
      i18nBundleVersion: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new I18nBundleService(
      prisma as never,
      languages,
      redis as never,
    );

    expect(await service.getCurrentVersion('en')).toBe(0);
  });

  it('serves the cached version without hitting Prisma on a cache hit', async () => {
    const languages = buildFakeLanguages('en');
    const store = new Map([['i18n:bundle:version:en', '7']]);
    const redis = buildFakeRedis(store);
    const findUnique = jest.fn();
    const prisma = { i18nBundleVersion: { findUnique } };
    const service = new I18nBundleService(
      prisma as never,
      languages,
      redis as never,
    );

    expect(await service.getCurrentVersion('en')).toBe(7);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('I18nBundleService.getTranslations', () => {
  function buildService(
    rows: { lang: string; value: string; i18n_key: { key: string } }[],
  ) {
    const languages = buildFakeLanguages('en');
    const redis = buildFakeRedis();
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { i18nTranslation: { findMany } };
    const service = new I18nBundleService(
      prisma as never,
      languages,
      redis as never,
    );
    return { service, findMany };
  }

  it('returns the full key/value map when `since` is omitted', async () => {
    const { service, findMany } = buildService([
      { lang: 'en', value: 'Cancel', i18n_key: { key: 'common.cancel' } },
      { lang: 'en', value: 'Confirm', i18n_key: { key: 'common.confirm' } },
    ]);

    const translations = await service.getTranslations('en', 5, undefined);

    expect(translations).toEqual({
      'common.cancel': 'Cancel',
      'common.confirm': 'Confirm',
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { lang: 'en' },
      include: { i18n_key: true },
    });
  });

  it('queries only rows newer than `since` for a delta request', async () => {
    const { service, findMany } = buildService([
      { lang: 'en', value: 'New copy', i18n_key: { key: 'a' } },
    ]);

    await service.getTranslations('en', 5, 3);

    expect(findMany).toHaveBeenCalledWith({
      where: { lang: 'en', version: { gt: 3 } },
      include: { i18n_key: true },
    });
  });

  it('short-circuits to an empty object without querying when `since` is already at or ahead of the current version', async () => {
    const { service, findMany } = buildService([]);

    const translations = await service.getTranslations('en', 5, 5);

    expect(translations).toEqual({});
    expect(findMany).not.toHaveBeenCalled();
  });

  // Owner 2026-11-11 (web start): the full bundle is built once per
  // (language, version), not on every request.
  it('builds a full bundle once per version and again after a new version', async () => {
    const { service, findMany } = buildService([
      { lang: 'en', value: 'Cancel', i18n_key: { key: 'common.cancel' } },
    ]);

    await service.getTranslations('en', 5, undefined);
    const again = await service.getTranslations('en', 5, undefined);
    expect(again).toEqual({ 'common.cancel': 'Cancel' });
    expect(findMany).toHaveBeenCalledTimes(1);

    await service.getTranslations('en', 6, undefined);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('a delta request is never served from the kept full bundle', async () => {
    const { service, findMany } = buildService([
      { lang: 'en', value: 'Cancel', i18n_key: { key: 'common.cancel' } },
    ]);

    await service.getTranslations('en', 5, undefined);
    await service.getTranslations('en', 5, 3);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

// Perf batch 2 (13.11, row 125): every slow 200 on prod was a fresh task's
// first build; the serialized answer is shared through the cache Redis and
// concurrent misses share one build.
describe('I18nBundleService.getBody (shared copy, single-flight)', () => {
  const rows = [
    { lang: 'en', value: 'Cancel', i18n_key: { key: 'common.cancel' } },
  ];
  function make(store: Map<string, string>, settings?: Record<string, number>) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const service = new I18nBundleService(
      { i18nTranslation: { findMany } } as never,
      buildFakeLanguages('en'),
      buildFakeRedis(store) as never,
      settings
        ? ({
            number: jest.fn((k: string) => Promise.resolve(settings[k])),
          } as never)
        : undefined,
    );
    return { service, findMany };
  }

  it('the exact answer body, built once and kept per (language, version, since)', async () => {
    const { service, findMany } = make(new Map());
    const body = await service.getBody('en', 5);
    expect(JSON.parse(body)).toEqual({
      data: {
        lang: 'en',
        version: 5,
        translations: { 'common.cancel': 'Cancel' },
      },
    });
    expect(await service.getBody('en', 5)).toBe(body);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('a fresh task reads the shared copy instead of the table', async () => {
    const store = new Map<string, string>();
    const first = make(store);
    const body = await first.service.getBody('en', 5);
    expect(store.has('i18n:bundle:body:v1:en:5:full')).toBe(true);

    const second = make(store);
    expect(await second.service.getBody('en', 5)).toBe(body);
    expect(second.findMany).not.toHaveBeenCalled();
    // a delta of the same version is its own copy
    await second.service.getBody('en', 5, 3);
    expect(second.findMany).toHaveBeenCalledTimes(1);
  });

  it('a new version is never answered from the old copy', async () => {
    const store = new Map<string, string>();
    const { service, findMany } = make(store);
    await service.getBody('en', 5);
    findMany.mockResolvedValue([
      { lang: 'en', value: 'Abort', i18n_key: { key: 'common.cancel' } },
    ]);
    const next = JSON.parse(await service.getBody('en', 6)) as {
      data: { version: number; translations: Record<string, string> };
    };
    expect(next.data.version).toBe(6);
    expect(next.data.translations['common.cancel']).toBe('Abort');
  });

  it('concurrent misses in one process share one table read', async () => {
    const { service, findMany } = make(new Map());
    const bodies = await Promise.all(
      Array.from({ length: 20 }, () => service.getBody('en', 7)),
    );
    expect(new Set(bodies).size).toBe(1);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('a corrupt shared copy is a miss, never an answer', async () => {
    const store = new Map([
      ['i18n:bundle:body:v1:en:5:full', Buffer.from('nope').toString('base64')],
    ]);
    const { service, findMany } = make(store);
    const body = await service.getBody('en', 5);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(body.startsWith('{"data":')).toBe(true);
  });

  it('admin settings: TTL 0 keeps no shared copy, 0 languages keeps nothing in memory', async () => {
    const store = new Map<string, string>();
    const { service, findMany } = make(store, {
      'ops.i18n_bundle_cache_ttl_sec': 0,
      'ops.i18n_bundle_cache_langs': 0,
    });
    await service.getBody('en', 5);
    await service.getBody('en', 5);
    expect(store.size).toBe(0);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

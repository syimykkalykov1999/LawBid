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
});

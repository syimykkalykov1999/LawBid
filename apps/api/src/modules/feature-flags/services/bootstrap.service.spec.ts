import {
  BOOTSTRAP_CACHE_KEY,
  BOOTSTRAP_CACHE_TTL_SECONDS,
  BootstrapService,
} from './bootstrap.service';
import type { FeatureFlagsService } from './feature-flags.service';
import type { AppConfigService } from './app-config.service';

class MemoryRedis {
  readonly store = new Map<string, string>();
  readonly setCalls: unknown[][] = [];
  get = jest.fn((key: string) => Promise.resolve(this.store.get(key) ?? null));
  set = jest.fn((key: string, value: string, ...rest: unknown[]) => {
    this.setCalls.push([key, value, ...rest]);
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

const EN = {
  code: 'en',
  name_native: 'English',
  is_active: true,
  is_rtl: false,
  sort: 0,
};
const TERMS = {
  id: 'doc-1',
  doc_type: 'terms',
  version: '1.0',
  locale: 'en',
  content_url: null,
  content_md: '# Terms',
  published_at: new Date('2026-01-01T00:00:00Z'),
};

function build(
  opts: {
    bundleVersions?: { lang: string; version: number }[];
    redis?: MemoryRedis;
  } = {},
) {
  const flags = {
    getFlags: jest
      .fn()
      .mockResolvedValue({ apple_login: true, video_posts: false }),
  } as unknown as FeatureFlagsService;
  const appConfig = {
    getConfig: jest.fn().mockResolvedValue({ min_app_version_ios: '0.1.0' }),
  } as unknown as AppConfigService;
  const prisma = {
    i18nLanguage: { findMany: jest.fn().mockResolvedValue([EN]) },
    i18nBundleVersion: {
      findMany: jest.fn().mockResolvedValue(
        opts.bundleVersions ?? [
          { lang: 'en', version: 3 },
          { lang: 'ru', version: 1 },
        ],
      ),
    },
    legalDocument: { findMany: jest.fn().mockResolvedValue([TERMS]) },
  };
  const redis = opts.redis ?? new MemoryRedis();
  const service = new BootstrapService(
    prisma as never,
    flags,
    appConfig,
    redis as never,
  );
  return { service, prisma, redis };
}

describe('BootstrapService.build', () => {
  it('aggregates flags, app_config, active languages, translation versions, and current legal documents', async () => {
    const { service, prisma } = build();
    const result = await service.build();

    expect(result.flags).toEqual({ apple_login: true, video_posts: false });
    expect(result.app_config).toEqual({ min_app_version_ios: '0.1.0' });
    expect(result.languages).toEqual([EN]);
    expect(result.translations_version).toEqual({ en: 3, ru: 1 });
    expect(result.legal_documents).toEqual([TERMS]);
    expect(prisma.legalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_current: true } }),
    );
  });

  it('returns an empty translations_version map when no bundle versions exist', async () => {
    const { service } = build({ bundleVersions: [] });
    const result = await service.build();
    expect(result.translations_version).toEqual({});
  });

  it('serves the DB-backed content from Redis on repeat (cache-aside, short TTL)', async () => {
    const { service, prisma, redis } = build();
    const first = await service.build();
    const second = await service.build();

    expect(prisma.i18nLanguage.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.i18nBundleVersion.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.legalDocument.findMany).toHaveBeenCalledTimes(1);
    expect(redis.setCalls[0]).toEqual([
      BOOTSTRAP_CACHE_KEY,
      expect.any(String),
      'EX',
      BOOTSTRAP_CACHE_TTL_SECONDS,
    ]);
    // Dates survive the JSON round trip as Date instances.
    expect(second).toEqual(first);
    expect(second.legal_documents[0].published_at).toBeInstanceOf(Date);
  });

  it('invalidate() forces the next build to read the DB again', async () => {
    const { service, prisma } = build();
    await service.build();
    await service.invalidate();
    await service.build();
    expect(prisma.i18nLanguage.findMany).toHaveBeenCalledTimes(2);
  });

  it('an i18n import (live bundle-version key) is visible immediately despite the cached map', async () => {
    const { service, redis } = build();
    await service.build(); // caches en:3
    redis.store.set('i18n:bundle:version:en', '4'); // I18nImportService after commit
    const result = await service.build();
    expect(result.translations_version.en).toBe(4);
  });

  it('never lets a stale lower live key roll a version back, and omits never-imported languages', async () => {
    const { service, redis } = build({
      bundleVersions: [{ lang: 'en', version: 5 }],
    });
    redis.store.set('i18n:bundle:version:en', '2');
    const result = await service.build();
    expect(result.translations_version).toEqual({ en: 5 });

    const { service: s2, redis: r2 } = build({ bundleVersions: [] });
    r2.store.set('i18n:bundle:version:en', '0');
    expect((await s2.build()).translations_version).toEqual({});
  });

  it('falls back to the DB when Redis errors instead of failing bootstrap', async () => {
    const redis = new MemoryRedis();
    redis.get.mockRejectedValue(new Error('redis down'));
    redis.set.mockRejectedValue(new Error('redis down'));
    redis.mget.mockRejectedValue(new Error('redis down'));
    const { service } = build({ redis });
    const result = await service.build();
    expect(result.translations_version).toEqual({ en: 3, ru: 1 });
  });
});

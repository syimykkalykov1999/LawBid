import { BootstrapService } from './bootstrap.service';
import type { FeatureFlagsService } from './feature-flags.service';
import type { AppConfigService } from './app-config.service';

describe('BootstrapService.build', () => {
  it('aggregates flags, app_config, active languages, translation versions, and current legal documents', async () => {
    const flags = {
      getFlags: jest
        .fn()
        .mockResolvedValue({ apple_login: true, video_posts: false }),
    } as unknown as FeatureFlagsService;
    const appConfig = {
      getConfig: jest.fn().mockResolvedValue({ min_app_version_ios: '0.1.0' }),
    } as unknown as AppConfigService;

    const prisma = {
      i18nLanguage: {
        findMany: jest.fn().mockResolvedValue([
          {
            code: 'en',
            name_native: 'English',
            is_active: true,
            is_rtl: false,
            sort: 0,
          },
        ]),
      },
      i18nBundleVersion: {
        findMany: jest.fn().mockResolvedValue([
          { lang: 'en', version: 3 },
          { lang: 'ru', version: 1 },
        ]),
      },
      legalDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            doc_type: 'terms',
            version: '1.0',
            locale: 'en',
            content_url: null,
            content_md: '# Terms',
            published_at: new Date('2026-01-01T00:00:00Z'),
          },
        ]),
      },
    };

    const service = new BootstrapService(prisma as never, flags, appConfig);
    const result = await service.build();

    expect(result.flags).toEqual({ apple_login: true, video_posts: false });
    expect(result.app_config).toEqual({ min_app_version_ios: '0.1.0' });
    expect(result.languages).toEqual([
      {
        code: 'en',
        name_native: 'English',
        is_active: true,
        is_rtl: false,
        sort: 0,
      },
    ]);
    expect(result.translations_version).toEqual({ en: 3, ru: 1 });
    expect(result.legal_documents).toEqual([
      {
        doc_type: 'terms',
        version: '1.0',
        locale: 'en',
        content_url: null,
        content_md: '# Terms',
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    expect(prisma.legalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_current: true } }),
    );
  });

  it('returns an empty translations_version map when no bundle versions exist', async () => {
    const flags = {
      getFlags: jest.fn().mockResolvedValue({}),
    } as unknown as FeatureFlagsService;
    const appConfig = {
      getConfig: jest.fn().mockResolvedValue({}),
    } as unknown as AppConfigService;
    const prisma = {
      i18nLanguage: { findMany: jest.fn().mockResolvedValue([]) },
      i18nBundleVersion: { findMany: jest.fn().mockResolvedValue([]) },
      legalDocument: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const service = new BootstrapService(prisma as never, flags, appConfig);
    const result = await service.build();

    expect(result.translations_version).toEqual({});
  });
});

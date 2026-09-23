import { Injectable } from '@nestjs/common';
import type { I18nLanguage, LegalDocument } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { FeatureFlagsService } from './feature-flags.service';
import { AppConfigService } from './app-config.service';

/** `GET /config/bootstrap`'s response shape (docs/01_FOUNDATION_AUTH.md
 * §15, "Этап 1.8": "эндпоинт GET /config/bootstrap (флаги, min-версия,
 * активные языки, версия переводов, юридические документы)") — one field
 * per item that bullet names, nothing invented beyond it. Field names
 * match the underlying Prisma models' own column names (snake_case),
 * same convention `I18nController.listLanguages` already uses — the
 * global `ResponseInterceptor` doesn't transform casing (see
 * i18n_api_client.dart's doc comment on the Flutter side). */
export interface BootstrapResponse {
  flags: Record<string, boolean>;
  app_config: Record<string, unknown>;
  languages: I18nLanguage[];
  translations_version: Record<string, number>;
  legal_documents: Pick<
    LegalDocument,
    | 'doc_type'
    | 'version'
    | 'locale'
    | 'content_url'
    | 'content_md'
    | 'published_at'
  >[];
}

/**
 * Aggregates the five pieces `GET /config/bootstrap` returns. Pure
 * composition — each piece is read through its own owning service
 * (FeatureFlagsService, AppConfigService) or a direct Prisma read for the
 * two i18n-owned pieces (languages, bundle versions) and the
 * legal-documents piece, none of which need their own service class for
 * a single `findMany` each. `legal_documents` intentionally omits
 * `id`/`created_at`/`updated_at`/`is_current` — the client only needs
 * enough to know which document/version/locale to show and where to get
 * its content, not this app's internal bookkeeping columns.
 */
@Injectable()
export class BootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly appConfig: AppConfigService,
  ) {}

  async build(): Promise<BootstrapResponse> {
    const [flags, appConfig, languages, bundleVersions, legalDocuments] =
      await Promise.all([
        this.flags.getFlags(),
        this.appConfig.getConfig(),
        this.prisma.i18nLanguage.findMany({
          where: { is_active: true },
          orderBy: { sort: 'asc' },
        }),
        this.prisma.i18nBundleVersion.findMany({
          select: { lang: true, version: true },
        }),
        this.prisma.legalDocument.findMany({
          where: { is_current: true },
          select: {
            doc_type: true,
            version: true,
            locale: true,
            content_url: true,
            content_md: true,
            published_at: true,
          },
        }),
      ]);

    const translationsVersion: Record<string, number> = {};
    for (const row of bundleVersions)
      translationsVersion[row.lang] = row.version;

    return {
      flags,
      app_config: appConfig,
      languages,
      translations_version: translationsVersion,
      legal_documents: legalDocuments,
    };
  }
}

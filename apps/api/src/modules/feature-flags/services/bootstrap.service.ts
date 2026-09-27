import { Inject, Injectable } from '@nestjs/common';
import type { I18nLanguage, LegalDocument } from '@prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
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
  legal_documents: BootstrapLegalDocument[];
}

type BootstrapLegalDocument = Pick<
  LegalDocument,
  | 'id'
  | 'doc_type'
  | 'version'
  | 'locale'
  | 'content_url'
  | 'content_md'
  | 'published_at'
>;

/** The DB-backed part of the payload that flags/app_config don't already
 * cache themselves. `published_at` travels as an ISO string in Redis. */
interface CachedBootstrapContent {
  languages: I18nLanguage[];
  translations_version: Record<string, number>;
  legal_documents: (Omit<BootstrapLegalDocument, 'published_at'> & {
    published_at: string | null;
  })[];
}

/** Same TTL as FeatureFlagsService/AppConfigService (see the reasoning
 * there): bootstrap is called on every cold start by every client
 * (docs/01 §10.2 A), so at 5k RPS peak (docs/01 §13) three uncached
 * `findMany`s per call would put the splash screen on the DB's hot path.
 * Languages and legal documents change on release-like events (an admin
 * publishing a new ToS version, file 6), where ≤30s propagation is fine. */
export const BOOTSTRAP_CACHE_TTL_SECONDS = 30;
export const BOOTSTRAP_CACHE_KEY = 'config:bootstrap:content';

/** I18nBundleService (modules/i18n) owns this key: I18nImportService
 * writes each language's new bundle version into it right after an
 * import commits. Overlaying it on the cached map means an import is
 * visible in bootstrap immediately — the "invalidate on import" hook —
 * without the i18n module having to know bootstrap exists. */
const I18N_BUNDLE_VERSION_KEY_PREFIX = 'i18n:bundle:version:';

/**
 * Aggregates the five pieces `GET /config/bootstrap` returns. Flags and
 * app_config come through their own cached services; languages, bundle
 * versions and current legal documents are read with one cache-aside
 * entry (BOOTSTRAP_CACHE_KEY). `legal_documents` includes `id` so the
 * client can send it as `documentId` with POST /users/me/consents (the
 * accepted version is recorded, docs/01 §10.2 H); it omits
 * `created_at`/`updated_at`/`is_current` bookkeeping columns.
 *
 * A Redis error on this service's own cache/overlay reads degrades to
 * the DB-derived values rather than failing the splash screen.
 */
@Injectable()
export class BootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly appConfig: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async build(): Promise<BootstrapResponse> {
    const [flags, appConfig, content] = await Promise.all([
      this.flags.getFlags(),
      this.appConfig.getConfig(),
      this.getContent(),
    ]);

    const translationsVersion = await this.overlayImportedVersions(
      content.translations_version,
      content.languages.map((l) => l.code),
    );

    return {
      flags,
      app_config: appConfig,
      languages: content.languages,
      translations_version: translationsVersion,
      legal_documents: content.legal_documents.map((doc) => ({
        ...doc,
        published_at:
          doc.published_at === null ? null : new Date(doc.published_at),
      })),
    };
  }

  /** Drops the cached content (for a writer of languages/legal
   * documents — admin panel, file 6). */
  async invalidate(): Promise<void> {
    await this.redis.del(BOOTSTRAP_CACHE_KEY);
  }

  private async getContent(): Promise<CachedBootstrapContent> {
    const cached = await this.safeRedis(() =>
      this.redis.get(BOOTSTRAP_CACHE_KEY),
    );
    if (typeof cached === 'string') {
      return JSON.parse(cached) as CachedBootstrapContent;
    }

    const [languages, bundleVersions, legalDocuments] = await Promise.all([
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
          id: true,
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

    const content: CachedBootstrapContent = {
      languages,
      translations_version: translationsVersion,
      legal_documents: legalDocuments.map((doc) => ({
        ...doc,
        published_at: doc.published_at?.toISOString() ?? null,
      })),
    };
    await this.safeRedis(() =>
      this.redis.set(
        BOOTSTRAP_CACHE_KEY,
        JSON.stringify(content),
        'EX',
        BOOTSTRAP_CACHE_TTL_SECONDS,
      ),
    );
    return content;
  }

  /** Bundle versions only ever increase, so the larger of (cached DB
   * value, I18nBundleService's live key) is always the freshest. A
   * language with no bundle yet stays absent (never reported as 0),
   * matching the uncached DB-derived shape. */
  private async overlayImportedVersions(
    cachedVersions: Record<string, number>,
    activeLangs: string[],
  ): Promise<Record<string, number>> {
    const langs = [
      ...new Set([...Object.keys(cachedVersions), ...activeLangs]),
    ];
    const result = { ...cachedVersions };
    if (langs.length === 0) return result;

    const live = await this.safeRedis(() =>
      this.redis.mget(
        langs.map((l) => `${I18N_BUNDLE_VERSION_KEY_PREFIX}${l}`),
      ),
    );
    if (!Array.isArray(live)) return result;

    langs.forEach((lang, i) => {
      const version = Number(live[i]);
      if (!Number.isInteger(version) || version <= 0) return;
      result[lang] = Math.max(result[lang] ?? 0, version);
    });
    return result;
  }

  private async safeRedis<T>(op: () => Promise<T>): Promise<T | undefined> {
    try {
      return await op();
    } catch {
      return undefined;
    }
  }
}

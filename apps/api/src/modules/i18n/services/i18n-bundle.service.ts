import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CACHE_CLIENT } from '../../../redis/redis.constants';
import { I18nLanguagesService } from './i18n-languages.service';

/** Safety-net TTL on the Redis-cached bundle version. Import apply
 * actively writes the new version into this same key right after commit
 * (see I18nImportService), so this TTL only matters if that write is
 * ever missed — worst case, a bundle request briefly serves a
 * one-request-stale version number until the key expires, never stale
 * *translations* (the version returned always matches the query that
 * produced the translations in the same call). */
const BUNDLE_VERSION_CACHE_TTL_SECONDS = 300;

/** Owner 2026-11-11 (web start is slow): a full bundle is ~6 000 rows read
 * with a join and turned into a 400 KB map — 1-2 s per request on prod
 * (the 304 path answers in 0.4 s). A full bundle is a pure function of
 * (language, version), so the built map is kept per version; a new version
 * is a new key. Only the last few languages asked for are kept. */
const FULL_BUNDLES_KEPT = 8;

/**
 * GET /i18n/bundle/:lang?since=version (docs/01_FOUNDATION_AUTH.md §9.3:
 * "Поддержка ETag/304", "Версия бандла хранится в Redis/БД"). Pure data
 * access — the controller owns the actual HTTP conditional-GET mechanics
 * (comparing If-None-Match, writing a raw 304) because that needs direct
 * response-object control this service has no business knowing about.
 */
@Injectable()
export class I18nBundleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly languages: I18nLanguagesService,
    @Inject(REDIS_CACHE_CLIENT) private readonly redis: Redis,
  ) {}

  /** `<lang>:<version>` → the full bundle, oldest first (a Map keeps
   * insertion order; a hit moves to the end). */
  private readonly fullBundles = new Map<string, Record<string, string>>();

  /** Validates the language (throws I18N_LANGUAGE_NOT_FOUND — same as
   * I18nLanguagesService.getActiveOrThrow) and returns its current bundle
   * version, 0 if the language has never had a translation imported. */
  async getCurrentVersion(lang: string): Promise<number> {
    await this.languages.getActiveOrThrow(lang);
    const cacheKey = this.versionCacheKey(lang);
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) return Number(cached);

    const row = await this.prisma.i18nBundleVersion.findUnique({
      where: { lang },
    });
    const version = row?.version ?? 0;
    await this.cacheVersion(lang, version);
    return version;
  }

  /** Full bundle when `since` is omitted; otherwise only the keys whose
   * translation.version is newer than `since` (empty object if the
   * caller is already at or ahead of `currentVersion` — a stale/replayed
   * `since` from a client that raced the version forward is treated the
   * same as "already up to date", not an error: §9.3 doesn't specify
   * behavior for since > version, and refusing the request would be
   * harsher than the spec asks for). */
  async getTranslations(
    lang: string,
    currentVersion: number,
    since?: number,
  ): Promise<Record<string, string>> {
    if (since !== undefined && since >= currentVersion) return {};

    const key = `${lang}:${currentVersion}`;
    if (since === undefined) {
      const kept = this.fullBundles.get(key);
      if (kept) {
        this.fullBundles.delete(key);
        this.fullBundles.set(key, kept);
        return kept;
      }
    }

    const rows = await this.prisma.i18nTranslation.findMany({
      where: since !== undefined ? { lang, version: { gt: since } } : { lang },
      include: { i18n_key: true },
    });

    const translations: Record<string, string> = {};
    for (const row of rows) translations[row.i18n_key.key] = row.value;
    if (since === undefined) {
      for (const k of this.fullBundles.keys()) {
        if (k.startsWith(`${lang}:`)) this.fullBundles.delete(k);
      }
      this.fullBundles.set(key, translations);
      if (this.fullBundles.size > FULL_BUNDLES_KEPT) {
        const oldest = this.fullBundles.keys().next().value;
        if (oldest !== undefined) this.fullBundles.delete(oldest);
      }
    }
    return translations;
  }

  /** Called by I18nImportService right after an apply-mode commit so the
   * cache reflects the new version immediately, without waiting for the
   * TTL above to expire. */
  async cacheVersion(lang: string, version: number): Promise<void> {
    await this.redis.set(
      this.versionCacheKey(lang),
      String(version),
      'EX',
      BUNDLE_VERSION_CACHE_TTL_SECONDS,
    );
  }

  private versionCacheKey(lang: string): string {
    return `i18n:bundle:version:${lang}`;
  }
}

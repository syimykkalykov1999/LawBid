import { gunzipSync, gzipSync } from 'node:zlib';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import { singleFlight } from '../../../common/cache/single-flight';
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
 * (the 304 path answers in 0.4 s). An answer is a pure function of
 * (language, version, since), so it is built once per version; a new
 * version is a new key (Telegram langpack: versioned packs).
 *
 * Perf batch 2 (13.11, row 125; prod logs 12-13.11: every slow 200 was
 * the FIRST request on a fresh task, en + ru in the same millisecond,
 * `I18nTranslation.findMany took 1692 ms`; a hit answered in 22 ms): the
 * serialized answer is also kept in the shared cache Redis (gzip, base64),
 * so a new or restarted task reads it in a few ms instead of the table,
 * and concurrent misses in one process share ONE build (single-flight).
 * What it could break and how it is guarded:
 * - stale texts after an edit: every write path (admin texts, import, seed)
 *   bumps `i18n_bundle_versions`, and the key carries the version, so an
 *   edit can never be answered from an old copy once the version moved;
 * - a stampede on a cold start: single-flight per key in this process;
 *   across tasks at most one build each (2-3 tasks), then the Redis copy;
 * - Redis down or a corrupt copy: a miss, the table is read as before.
 * Both limits are admin settings (ops.i18n_bundle_cache_ttl_sec / _langs). */
const BODY_KEY_PREFIX = 'i18n:bundle:body:v1:';

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
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  /** `<lang>:<version>:<since|full>` → the serialized answer, oldest first
   * (a Map keeps insertion order; a hit moves to the end). */
  private readonly bodies = new Map<string, string>();

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
    const body = await this.getBody(lang, currentVersion, since);
    return (
      JSON.parse(body) as { data: { translations: Record<string, string> } }
    ).data.translations;
  }

  /** The serialized 200 answer `{"data":{lang,version,translations}}` —
   * from this task's memory, else the shared Redis copy, else built from
   * the table once (see BODY_KEY_PREFIX). */
  async getBody(
    lang: string,
    currentVersion: number,
    since?: number,
  ): Promise<string> {
    if (since !== undefined && since >= currentVersion) {
      return this.serialize(lang, currentVersion, {});
    }
    const key = `${lang}:${currentVersion}:${since ?? 'full'}`;
    const kept = this.bodies.get(key);
    if (kept !== undefined) {
      this.bodies.delete(key);
      this.bodies.set(key, kept);
      return kept;
    }
    return singleFlight(BODY_KEY_PREFIX + key, async () => {
      const [ttlSec, keep] = await Promise.all([
        this.setting('ops.i18n_bundle_cache_ttl_sec'),
        this.setting('ops.i18n_bundle_cache_langs'),
      ]);
      let body = ttlSec > 0 ? await this.readShared(key) : null;
      if (body === null) {
        body = this.serialize(
          lang,
          currentVersion,
          await this.readTable(lang, since),
        );
        if (ttlSec > 0) await this.writeShared(key, body, ttlSec);
      }
      this.keep(key, body, keep);
      return body;
    });
  }

  private async readTable(
    lang: string,
    since?: number,
  ): Promise<Record<string, string>> {
    const rows = await this.prisma.i18nTranslation.findMany({
      where: since !== undefined ? { lang, version: { gt: since } } : { lang },
      include: { i18n_key: true },
    });
    const translations: Record<string, string> = {};
    for (const row of rows) translations[row.i18n_key.key] = row.value;
    return translations;
  }

  private serialize(
    lang: string,
    version: number,
    translations: Record<string, string>,
  ): string {
    return JSON.stringify({ data: { lang, version, translations } });
  }

  /** Keeps [body]; older versions of the same language go first (only the
   * newest version is ever asked for again), then the oldest overall. */
  private keep(key: string, body: string, max: number): void {
    if (max <= 0) return;
    const [lang, version] = key.split(':');
    for (const k of [...this.bodies.keys()]) {
      const [l, v] = k.split(':');
      if (l === lang && v !== version) this.bodies.delete(k);
    }
    this.bodies.set(key, body);
    while (this.bodies.size > max) {
      const oldest = this.bodies.keys().next().value;
      if (oldest === undefined) break;
      this.bodies.delete(oldest);
    }
  }

  private async readShared(key: string): Promise<string | null> {
    try {
      const raw = await this.redis.get(BODY_KEY_PREFIX + key);
      if (typeof raw !== 'string' || raw.length === 0) return null;
      const body = gunzipSync(Buffer.from(raw, 'base64')).toString('utf8');
      // A copy of another shape (corrupt, cut) is a miss, never an answer.
      return body.startsWith('{"data":') ? body : null;
    } catch {
      return null;
    }
  }

  private async writeShared(
    key: string,
    body: string,
    ttlSec: number,
  ): Promise<void> {
    try {
      await this.redis.set(
        BODY_KEY_PREFIX + key,
        gzipSync(body).toString('base64'),
        'EX',
        Math.round(ttlSec),
      );
    } catch {
      // not shared, still right
    }
  }

  private async setting(
    key: 'ops.i18n_bundle_cache_ttl_sec' | 'ops.i18n_bundle_cache_langs',
  ): Promise<number> {
    try {
      const v = await this.settings?.number(key);
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
    } catch {
      // settings unreadable: the built-in default
    }
    return APP_SETTINGS[key];
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

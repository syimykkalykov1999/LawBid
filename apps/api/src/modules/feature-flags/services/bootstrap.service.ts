import { jitterTtl, singleFlight } from '../../../common/cache/single-flight';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { I18nLanguage, LegalDocument } from '@prisma/client';
import type Redis from 'ioredis';
import { weakEtag } from '../../../common/sync/cheap-etag';
import {
  APP_SETTINGS,
  OWNER_CACHE_SETTINGS,
  OWNER_DEAL_RECORD_SETTINGS,
} from '../../../common/app-settings/app-settings.defaults';
import {
  CLIENT_TUNING_DEFS,
  effectivePrefetch,
} from '../../../common/app-settings/client-tuning';
import { USAGE_SNAPSHOT_KEY } from '../../../common/ops/usage-snapshot-key';
import { triMode } from '../../../common/ops/tri-mode';
import {
  clientTimingsFrom,
  type ClientTimings,
} from '../../../common/app-settings/realtime-settings';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import {
  bumpConfigVersion,
  configTag,
  readConfigVersion,
} from './config-version';
import { FeatureFlagsService } from './feature-flags.service';
import { AppConfigService } from './app-config.service';
import {
  VIDEO_CALLS_FLAG,
  WebRtcVideoProvider,
  videoCallAvailability,
} from '../../calls/video-call-provider';
import { SecretsService } from '../../../common/secrets/secrets.service';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import {
  UPLOAD_LIMITS_KEY,
  sanitizeUploadLimits,
} from '../../files/upload-limits';
import {
  TRANSLATE_FLAG,
  TRANSLATE_ZONES,
  zoneAllowed,
  zoneFlag,
} from '../../translation/translation-zones';
import { mgetSafe } from '../../../redis/redis-cluster-safe';

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
  /** Owner 2026-10-23: server-driven client behaviour. */
  client: { timings: ClientTimings };
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
/** Perf batch 2: the assembled answer per ETag (BootstrapService.buildFor). */
export const BOOTSTRAP_BODY_KEY_PREFIX = 'config:bootstrap:body:v1:';

/** Types whose text travels in the bootstrap payload (the old four). */
const BOOTSTRAP_TEXT_TYPES: ReadonlySet<string> = new Set([
  'terms',
  'privacy',
  'disclaimer',
  'client_contact_sharing',
]);

/** I18nBundleService (modules/i18n) owns this key: I18nImportService
 * writes each language's new bundle version into it right after an
 * import commits. Overlaying it on the cached map means an import is
 * visible in bootstrap immediately — the "invalidate on import" hook —
 * without the i18n module having to know bootstrap exists. */
const I18N_BUNDLE_VERSION_KEY_PREFIX = 'i18n:bundle:version:';
/** The bootstrap ETag rotates at least this often (see [etag]). */
export const BOOTSTRAP_ETAG_BUCKET_MS = 300_000;

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
/** app_config keys the public bootstrap may expose (by prefix). */
export const PUBLIC_CONFIG_PREFIXES = [
  'min_app_version_',
  'soft_update_version_',
  'files.',
  'video.max_',
  // Owner 2026-10-23: reel / video post length limits.
  'video.reel_max_',
  'video.post_max_',
  'posts.attachments_',
  // Text limits the app shows as counters (admin: Config → Лимиты ввода).
  'limits.',
  'post.max_chars_',
  'media.',
  'stickers.',
  'translate.',
  // Owner 2026-10-17: the percent cap and where the percent is hidden.
  'fees.contingency_',
  // Owner 2026-10-22 (client economy plan §5): the on-device cache limits
  // (`cache.limit_mb.*`) — the app may
  // lower them, never raise above these.
  'cache.',
  // Scale audit 2026-10-23: where "Update" opens the store (the iOS App
  // Store id is unknown until the app is registered), and the knobs of the
  // phone's own traffic (retries, reconnects, polling, events) that must
  // change without an app update (api/common/app-settings/client-tuning.ts).
  'store_url_',
  'client.',
  // Deal record 2026-10-27: the app chooses the accept path and the bid
  // form variant from these two switches (both on by default, owner 2026-11-06).
  'deal_record.',
  'bids.rich_terms_enabled',
  'bids.confirmation_required',
  // Feature reality audit 2026-11-08: the app reads these two limits
  // (stories_providers.dart, channel_compose.dart) but they never reached
  // it, so an admin change was enforced by the server only.
  'stories.max_video_sec',
  'channels.max_post_media',
] as const;

@Injectable()
export class BootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly appConfig: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly secrets?: SecretsService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  /**
   * S20-9: the reel warm-up the app obeys. The 3-state switch
   * (`client.video_prefetch_mode`) is turned into two numbers here: Wi-Fi
   * and mobile data; in Авто both drop to 0 while Bunny video traffic is
   * over its warning level (daily usage poll). Always present.
   */
  private async videoPrefetchPlan(
    appConfig: Record<string, unknown>,
  ): Promise<Record<string, number>> {
    const num = (
      key: 'client.video_prefetch_ahead' | 'client.video_prefetch_cellular',
    ) => {
      const v = appConfig[key];
      return typeof v === 'number' && Number.isFinite(v)
        ? v
        : (CLIENT_TUNING_DEFS[key].default as number);
    };
    const mode = triMode(
      appConfig['client.video_prefetch_mode'] ??
        CLIENT_TUNING_DEFS['client.video_prefetch_mode'].default,
    );
    let bunnyOver = false;
    if (mode === 'auto') {
      try {
        const raw = await this.redis.get(USAGE_SNAPSHOT_KEY);
        const level = (
          JSON.parse(raw ?? 'null') as {
            bunny?: { bandwidthLevel?: string };
          } | null
        )?.bunny?.bandwidthLevel;
        bunnyOver = level === 'warn' || level === 'crit';
      } catch {
        // no snapshot yet: not over
      }
    }
    const plan = effectivePrefetch({
      mode,
      ahead: num('client.video_prefetch_ahead'),
      cellular: num('client.video_prefetch_cellular'),
      bunnyOver,
    });
    return {
      'client.video_prefetch_ahead': plan.ahead,
      'client.video_prefetch_cellular': plan.cellular,
    };
  }

  /** 2026-10-24 (batch D, item 4): the website asks Cloudflare Turnstile
   * for a token before sign-up / code requests. The site key is public by
   * design; it is published only while `security.turnstile.mode` is not
   * `off` and a key is saved, so with the switch off the page does
   * nothing at all. */
  async turnstileSiteKey(): Promise<Record<string, string>> {
    try {
      const mode = await this.settings?.string('security.turnstile.mode');
      if (mode !== 'monitor' && mode !== 'enforce') return {};
      const key = (await this.secrets?.get('turnstile'))?.fields?.siteKey;
      return key ? { 'turnstile.site_key': key } : {};
    } catch {
      return {};
    }
  }

  /** Owner 2026-11-02: the browser's push needs the Firebase web app and a
   * VAPID key. They are public by design and live in Admin → Integrations →
   * FCM (fields «Сайт: …»); the web build reads them from here at start, so
   * changing them needs no rebuild. Published only when every required one
   * is saved. */
  async fcmWebConfig(): Promise<Record<string, string>> {
    try {
      // The first key set that carries the whole web group: the server keys
      // may sit on several sets (main, backup) and their order follows
      // failures, so the public config must not flip with it. Only the
      // public fields named here are ever read; the private key is not.
      for (const set of (await this.secrets?.getAll('fcm')) ?? []) {
        const f = set.fields ?? {};
        if (
          !f.webApiKey ||
          !f.webAppId ||
          !f.webSenderId ||
          !f.projectId ||
          !f.webVapidKey
        ) {
          continue;
        }
        return {
          'fcm.web.api_key': f.webApiKey,
          'fcm.web.app_id': f.webAppId,
          'fcm.web.sender_id': f.webSenderId,
          'fcm.web.project_id': f.projectId,
          'fcm.web.vapid_key': f.webVapidKey,
          ...(f.webAuthDomain
            ? { 'fcm.web.auth_domain': f.webAuthDomain }
            : {}),
        };
      }
      return {};
    } catch {
      return {};
    }
  }

  /** Owner 2026-10-01: reels stay hidden from everyone until the owner
   * both turns `video_posts` on AND saves every Bunny key in Admin →
   * Integrations — the app reads only this combined value. */
  private async withVideoGate(
    flags: Record<string, boolean>,
  ): Promise<Record<string, boolean>> {
    if (!flags.video_posts) return flags;
    // Dev only: the local Bunny stand-in needs no keys.
    if (this.config?.get<boolean>('DEV_FAKE_BUNNY') === true) return flags;
    const f = (await this.secrets?.get('bunny_stream'))?.fields ?? {};
    const ready = [
      'libraryId',
      'cdnHostname',
      'apiKey',
      'tokenAuthKey',
      'webhookToken',
    ].every((k) => !!f[k]);
    return { ...flags, video_posts: ready };
  }

  /** Owner 2026-10-04/05: a "Translate" button shows only while the
   * translator is on (`chat_translate`), the Google key is saved and its
   * zone is allowed (Ключи и сервисы → Google Translate). Owner 2026-11-08
   * (one control): `chat_translate` = the master (flag and key), and one
   * `translate_<zone>` per zone, chats included, that follows it. */
  private async withTranslateGate(
    flags: Record<string, boolean>,
    appConfig: Record<string, unknown>,
  ): Promise<Record<string, boolean>> {
    const on =
      !!flags[TRANSLATE_FLAG] &&
      !!(await this.secrets?.get('google_translate'))?.fields.apiKey;
    const out: Record<string, boolean> = { ...flags, [TRANSLATE_FLAG]: on };
    for (const zone of TRANSLATE_ZONES) {
      out[zoneFlag(zone)] = on && zoneAllowed(appConfig, zone);
    }
    return out;
  }

  /** Owner 2026-10-05: the "Видеозвонок" button shows only while
   * `video_calls` is on AND the video provider (WebRTC + TURN) is set. */
  private async withVideoCallsGate(
    flags: Record<string, boolean>,
  ): Promise<Record<string, boolean>> {
    if (!flags[VIDEO_CALLS_FLAG]) return flags;
    const a = await videoCallAvailability(
      true,
      new WebRtcVideoProvider(this.secrets, this.config),
    );
    return { ...flags, [VIDEO_CALLS_FLAG]: a.available };
  }

  /** Owner 2026-10-20: the app and the admin panel send their errors to
   * Sentry with the DSNs saved in Admin → Integrations → Sentry. A DSN is
   * a send-only address, safe to publish; absent keys mean "off". */
  private async sentryDsns(): Promise<Record<string, string>> {
    try {
      const f = (await this.secrets?.get('sentry'))?.fields ?? {};
      return {
        ...(f.mobileDsn ? { 'sentry.mobile_dsn': f.mobileDsn } : {}),
        ...(f.adminDsn ? { 'sentry.admin_dsn': f.adminDsn } : {}),
      };
    } catch {
      return {};
    }
  }

  /** The two client guest switches, forced off while the master is off. */
  /**
   * Owner 2026-11-09 (FR D-c2): the text-message consent wording the admin
   * keeps under «Соответствие» reaches the app. The version is always told
   * (the app records it with a consent); the wording and the HELP text
   * only once the admin stored one — until then the app keeps its own
   * translated string, so the look does not change by itself.
   */
  smsDisclosureKeys(
    appConfig: Record<string, unknown>,
  ): Record<string, string> {
    const text = (key: string): string | undefined => {
      const v = appConfig[key];
      return typeof v === 'string' && v.trim().length > 0
        ? v.trim()
        : undefined;
    };
    const version = text('compliance.sms.disclosure_version');
    const out: Record<string, string> = {
      'compliance.sms.disclosure_version':
        version ?? APP_SETTINGS['compliance.sms.disclosure_version'],
    };
    const disclosure = text('compliance.sms.disclosure_text');
    if (disclosure) out['compliance.sms.disclosure_text'] = disclosure;
    const help = text('compliance.sms.help_text');
    if (help) out['compliance.sms.help_text'] = help;
    return out;
  }

  private guestBrowseKeys(
    appConfig: Record<string, unknown>,
  ): Record<string, boolean> {
    const master = appConfig['guest.browsing_enabled'] !== false;
    const pick = (
      key:
        'client.guest_browse_app_enabled' | 'client.guest_browse_web_enabled',
    ) => {
      const stored = appConfig[key];
      return (
        master &&
        (typeof stored === 'boolean' ? stored : CLIENT_TUNING_DEFS[key].default)
      );
    };
    return {
      'client.guest_browse_app_enabled': pick(
        'client.guest_browse_app_enabled',
      ),
      'client.guest_browse_web_enabled': pick(
        'client.guest_browse_web_enabled',
      ),
    };
  }

  /**
   * Perf batch 2 (13.11, row 125; prod 7 d p50 378 ms, p95 1.19 s, the slow
   * ones ~1 s on a task's first builds): the answer for [tag] (the cheap
   * ETag: config version + 5-minute bucket, see [etag]) is built once and
   * reused for `ops.bootstrap_cache_sec` (admin, 0 = build every time) -
   * in this process and through a shared Redis copy, so a fresh task does
   * not build it either. Concurrent misses share one build (single-flight).
   * What it could break and how it is guarded:
   * - a setting change not seen: every writer bumps the config version, so
   *   [tag] changes and the old copy is never served for it; a build after
   *   a miss reads flags and app_config past this process's few-second
   *   copies (`fresh`), so it cannot store a value older than its version;
   * - inputs the version does not cover (a saved integration key, the
   *   Bunny usage level) were already bounded by the 5-minute bucket of the
   *   ETag (a client 304s that long); the copy lives at most as long;
   * - languages, legal documents and translation versions (their own
   *   cache, dropped without a config bump): taken live on every answer.
   */
  async buildFor(tag: string): Promise<BootstrapResponse> {
    const ttlMs = (await this.memoSeconds()) * 1000;
    if (ttlMs <= 0) return this.build();
    const now = Date.now();
    let base =
      this.memo && this.memo.tag === tag && now - this.memo.at < ttlMs
        ? this.memo.value
        : undefined;
    if (!base) {
      base = await singleFlight(BOOTSTRAP_BODY_KEY_PREFIX + tag, async () => {
        const shared = await this.readShared(tag);
        if (shared) return shared;
        const built = await this.build(true);
        await this.safeRedis(() =>
          this.redis.set(
            BOOTSTRAP_BODY_KEY_PREFIX + tag,
            JSON.stringify(built),
            'EX',
            Math.max(1, Math.round(ttlMs / 1000)),
          ),
        );
        return built;
      });
      this.memo = { tag, at: Date.now(), value: base };
    }
    // Languages, legal documents and bundle versions have their own cache
    // (BOOTSTRAP_CACHE_KEY, dropped by [invalidate] and by an i18n import
    // that sets only the bundle version key): always taken live, so this
    // copy never serves them older than before (e2e «GET /config/bootstrap
    // caching»). Only flags / app_config / client are reused.
    const content = await this.getContent();
    return {
      ...base,
      languages: content.languages,
      translations_version: await this.overlayImportedVersions(
        content.translations_version,
        content.languages.map((l) => l.code),
      ),
      legal_documents: content.legal_documents.map((doc) => ({
        ...doc,
        published_at:
          doc.published_at === null ? null : new Date(doc.published_at),
      })),
    };
  }

  private memo?: { tag: string; at: number; value: BootstrapResponse };

  private async memoSeconds(): Promise<number> {
    try {
      const v = await this.settings?.number('ops.bootstrap_cache_sec');
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
    } catch {
      // settings unreadable: the built-in default
    }
    return APP_SETTINGS['ops.bootstrap_cache_sec'];
  }

  /** The shared copy for [tag], or null (missing, corrupt, Redis away). */
  private async readShared(tag: string): Promise<BootstrapResponse | null> {
    const raw = await this.safeRedis(() =>
      this.redis.get(BOOTSTRAP_BODY_KEY_PREFIX + tag),
    );
    if (typeof raw !== 'string') return null;
    try {
      const v = JSON.parse(raw) as Partial<BootstrapResponse>;
      if (
        typeof v.flags !== 'object' ||
        v.flags === null ||
        typeof v.app_config !== 'object' ||
        v.app_config === null ||
        !Array.isArray(v.languages) ||
        !Array.isArray(v.legal_documents) ||
        typeof v.translations_version !== 'object' ||
        v.translations_version === null ||
        typeof v.client !== 'object' ||
        v.client === null
      ) {
        return null;
      }
      return {
        ...(v as BootstrapResponse),
        legal_documents: v.legal_documents.map((doc) => ({
          ...doc,
          published_at:
            doc.published_at === null ? null : new Date(doc.published_at),
        })),
      };
    } catch {
      return null;
    }
  }

  /** [fresh]: read flags and app_config past this process's few-second
   * copies (see [buildFor]). */
  async build(fresh = false): Promise<BootstrapResponse> {
    const [flags, appConfig, content] = await Promise.all([
      fresh ? this.flags.getFlags(true) : this.flags.getFlags(),
      fresh ? this.appConfig.getConfig(true) : this.appConfig.getConfig(),
      this.getContent(),
    ]);

    const translationsVersion = await this.overlayImportedVersions(
      content.translations_version,
      content.languages.map((l) => l.code),
    );

    return {
      flags: await this.withVideoCallsGate(
        await this.withTranslateGate(
          await this.withVideoGate(flags),
          appConfig,
        ),
      ),
      // Audit 2026-10-02: only what the app needs — never the moderation
      // term lists, budgets or reserved names (this endpoint is public).
      app_config: {
        // Owner 2026-10-22 (client economy plan §5): the cache ceilings are
        // always present — the defaults until the admin stores a value.
        ...OWNER_CACHE_SETTINGS,
        // Owner 2026-11-06: the deal-record switches are on by default, so
        // the app is told the default too (a stored admin value wins below);
        // otherwise a fresh database would show the old accept path while
        // the API already asks for a signed record.
        'deal_record.enabled':
          OWNER_DEAL_RECORD_SETTINGS['deal_record.enabled'],
        'bids.rich_terms_enabled':
          OWNER_DEAL_RECORD_SETTINGS['bids.rich_terms_enabled'],
        'bids.confirmation_required':
          OWNER_DEAL_RECORD_SETTINGS['bids.confirmation_required'],
        // Owner 2026-10-23: whether the apps / the website offer browsing
        // without an account; always present (app off, web on) until the
        // admin stores a value.
        'client.guest_browse_app_enabled':
          CLIENT_TUNING_DEFS['client.guest_browse_app_enabled'].default,
        'client.guest_browse_web_enabled':
          CLIENT_TUNING_DEFS['client.guest_browse_web_enabled'].default,
        ...Object.fromEntries(
          Object.entries(appConfig).filter(([k]) =>
            PUBLIC_CONFIG_PREFIXES.some((p) => k.startsWith(p)),
          ),
        ),
        // Dedup D-12: `guest.browsing_enabled` is the one master switch (it is
        // also the server's gate for token-less reads). The apps are told
        // "browse as guest" only while it is on, so an app never offers what
        // the API would answer with 401.
        ...this.guestBrowseKeys(appConfig),
        ...this.smsDisclosureKeys(appConfig),
        // Owner 2026-10-07 (bug 17): the app shows and checks the admin's
        // upload limits (always present, inside the safe ceilings).
        [UPLOAD_LIMITS_KEY]: sanitizeUploadLimits(appConfig[UPLOAD_LIMITS_KEY]),
        ...(await this.sentryDsns()),
        ...(await this.turnstileSiteKey()),
        ...(await this.fcmWebConfig()),
        ...(await this.videoPrefetchPlan(appConfig)),
      },
      client: { timings: clientTimingsFrom(appConfig) },
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
    await bumpConfigVersion(this.redis);
  }

  /**
   * Owner 2026-10-22 (client economy plan, package D): the cheap ETag of
   * the bootstrap — the config version (bumped on every flag / config /
   * legal change) plus a 5-minute bucket as a safety net for inputs that
   * bypass the version (a saved integration key gating a flag). Costs one
   * Redis GET; a 304 skips the whole build.
   */
  async etag(now: number = Date.now()): Promise<string> {
    const version = await readConfigVersion(this.redis);
    return weakEtag(
      'boot',
      version,
      Math.floor(now / BOOTSTRAP_ETAG_BUCKET_MS),
    );
  }

  /** R-385: a cheap ETag for another answer that changes only with the
   * config version (legal documents): see [configTag]. */
  configTag(...parts: (string | number | null | undefined)[]): Promise<string> {
    return configTag(this.redis, ...parts);
  }

  private async getContent(): Promise<CachedBootstrapContent> {
    const cached = await this.safeRedis(() =>
      this.redis.get(BOOTSTRAP_CACHE_KEY),
    );
    if (typeof cached === 'string') {
      // A corrupt entry, or one written by a previous deploy with another
      // shape, must degrade to the DB path, never fail the splash screen.
      try {
        const parsed = JSON.parse(cached) as Partial<CachedBootstrapContent>;
        if (
          Array.isArray(parsed.languages) &&
          Array.isArray(parsed.legal_documents) &&
          typeof parsed.translations_version === 'object' &&
          parsed.translations_version !== null
        ) {
          return parsed as CachedBootstrapContent;
        }
      } catch {
        // fall through to the DB
      }
    }

    // Load audit 6: one refill per pod when the key expires or is cleared.
    return singleFlight(BOOTSTRAP_CACHE_KEY, async () => {
      const [languages, bundleVersions, legalDocuments] = await Promise.all([
        this.prisma.i18nLanguage.findMany({
          where: { is_active: true },
          orderBy: { sort: 'asc' },
        }),
        this.prisma.i18nBundleVersion.findMany({
          select: { lang: true, version: true },
        }),
        this.prisma.legalDocument.findMany({
          where: { is_current: true, status: 'published' },
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
          // Owner 2026-10-05: the newer documents are large and are read
          // on demand (GET /legal/documents/:type); bootstrap keeps the
          // text of the four old ones only, as before.
          content_md: BOOTSTRAP_TEXT_TYPES.has(doc.doc_type)
            ? doc.content_md
            : null,
          published_at: doc.published_at?.toISOString() ?? null,
        })),
      };
      await this.safeRedis(() =>
        this.redis.set(
          BOOTSTRAP_CACHE_KEY,
          JSON.stringify(content),
          'EX',
          jitterTtl(BOOTSTRAP_CACHE_TTL_SECONDS),
        ),
      );
      return content;
    });
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
      mgetSafe(
        this.redis,
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

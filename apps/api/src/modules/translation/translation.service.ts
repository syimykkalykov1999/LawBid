import { createHash } from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { SecretsService } from '../../common/secrets/secrets.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AppConfigService } from '../feature-flags/services/app-config.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  TRANSLATE_FLAG,
  type TranslateZone,
  zoneAllowed,
} from './translation-zones';

/** Translations are kept a week, so re-opening a screen costs nothing. */
const CACHE_TTL_S = 7 * 24 * 3600;
/** Per person per day, all zones together: a guard against a script
 * running up the bill. */
export const DAILY_TRANSLATIONS = 300;
const TIMEOUT_MS = 8_000;

export interface TextTranslation {
  text: string;
  sourceLanguage: string | null;
  targetLanguage: string;
}

/**
 * Owner 2026-10-04/05: the one place that calls Google Cloud Translation
 * (it covers Kyrgyz, Kazakh, Uzbek…). Every zone (chats, posts, cases,
 * reviews, profiles) goes through [translate], which checks the master
 * flag, the zone and the key before spending money, caches the answer and
 * counts the person's daily quota. Callers load the text themselves, after
 * their own access check; the original is never replaced.
 */
@Injectable()
export class TranslationService {
  constructor(
    private readonly secrets: SecretsService,
    private readonly flags: FeatureFlagsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    @Optional() private readonly appConfig?: AppConfigService,
    // Owner 2026-10-05 (plan builder): translation is a plan term.
    @Optional() private readonly entitlements?: EntitlementsService,
    // Audit 2026-10-05: the global budget guard for paid providers.
    @Optional() private readonly costGuard?: CostGuardService,
  ) {}

  /** The Google key when [zone] may be translated, else null. */
  async apiKey(zone: TranslateZone): Promise<string | null> {
    if (!(await this.flags.isEnabled(TRANSLATE_FLAG, false))) return null;
    const config = (await this.appConfig?.getConfig()) ?? {};
    if (!zoneAllowed(config, zone)) return null;
    const key = (await this.secrets.get('google_translate'))?.fields.apiKey;
    return key || null;
  }

  /** Translates [text] (already access-checked by the caller); [cacheId]
   * names the source, e.g. `post:<id>`. */
  /** The plan's `chat_translate` term (owner 2026-10-05): checked
   * before anything else, in every zone. */
  async assertEntitled(user: RequestUser): Promise<void> {
    if (
      this.entitlements &&
      !(await this.entitlements.has(user.sub, 'chat_translate'))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan does not include translation.',
      });
    }
  }

  async translate(
    user: RequestUser,
    zone: TranslateZone,
    cacheId: string,
    text: string,
    target: string,
  ): Promise<TextTranslation> {
    await this.assertEntitled(user);
    const key = await this.apiKey(zone);
    if (!key) throw translationUnavailable();
    // The text's hash is part of the key: an edited post is re-translated.
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
    const cacheKey = `tr:${cacheId}:${hash}:${target}`;
    const hit = await this.redis.get(cacheKey);
    if (hit) return JSON.parse(hit) as TextTranslation;

    const day = new Date().toISOString().slice(0, 10);
    const quotaKey = `tr:quota:${user.sub}:${day}`;
    const used = Number((await this.redis.get(quotaKey)) ?? 0);
    const planQuota = this.entitlements
      ? await this.entitlements.limit(user.sub, 'translations_per_day')
      : null;
    // null/undefined = the app default; 0 = unlimited on this plan.
    const quota =
      planQuota == null
        ? DAILY_TRANSLATIONS
        : planQuota === 0
          ? null
          : planQuota;
    if (quota !== null && used >= quota) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many translations today.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.costGuard?.consume('translate');
    const out = await this.callGoogle(key, text, target, zone, hash);
    // Counted only after a successful call: a Google error costs no quota.
    if ((await this.redis.incr(quotaKey)) === 1) {
      await this.redis.expire(quotaKey, 26 * 3600);
    }
    await this.redis.set(cacheKey, JSON.stringify(out), 'EX', CACHE_TTL_S);
    return out;
  }

  private async callGoogle(
    key: string,
    text: string,
    target: string,
    zone: TranslateZone,
    textHash: string,
  ): Promise<TextTranslation> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q: text, target, format: 'text' }),
          signal: ctrl.signal,
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        data?: {
          translations?: {
            translatedText?: string;
            detectedSourceLanguage?: string;
          }[];
        };
      };
      const t = body.data?.translations?.[0];
      if (typeof t?.translatedText !== 'string') {
        throw new Error('no translation in the answer');
      }
      return {
        text: t.translatedText,
        sourceLanguage: t.detectedSourceLanguage ?? null,
        targetLanguage: target,
      };
    } catch (e) {
      // Only the hash of the text is logged: content stays private.
      this.logger.warn(
        {
          alert: 'translation_failed',
          zone,
          textHash,
          err: e instanceof Error ? e.message : String(e),
        },
        'translation failed',
      );
      throw translationUnavailable();
    } finally {
      clearTimeout(timer);
    }
  }
}

export function translationUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ErrorCode.TRANSLATION_UNAVAILABLE,
    message: 'Translation is not available right now.',
  });
}

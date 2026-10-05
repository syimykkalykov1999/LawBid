import { createHash } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { SecretsService } from '../../common/secrets/secrets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AppConfigService } from '../feature-flags/services/app-config.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

export const CHAT_TRANSLATE_FLAG = 'chat_translate';
/** Owner 2026-10-05: per-zone switch (Настройки → translate.chat). */
export const CHAT_TRANSLATE_ZONE = 'translate.chat';
/** Translations are kept a week, so re-opening a chat costs nothing. */
const CACHE_TTL_S = 7 * 24 * 3600;
/** Per person per day: a guard against a script running up the bill. */
export const DAILY_TRANSLATIONS = 300;
const TIMEOUT_MS = 8_000;

export interface MessageTranslation {
  text: string;
  sourceLanguage: string | null;
  targetLanguage: string;
}

/**
 * Owner 2026-10-04: "Translate" under a chat message (chats only, not
 * comments). Google Cloud Translation (it covers Kyrgyz, Kazakh, Uzbek…),
 * key in Admin → Integrations; the app shows the button only while the
 * `chat_translate` flag is on AND the key is saved (bootstrap gate).
 * Translates the displayed text (hidden contacts stay hidden); the
 * original is never replaced.
 */
@Injectable()
export class ChatTranslationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly flags: FeatureFlagsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    @Optional() private readonly appConfig?: AppConfigService,
  ) {}

  /** The Google key when the feature is on and configured, else null. */
  async apiKey(): Promise<string | null> {
    if (!(await this.flags.isEnabled(CHAT_TRANSLATE_FLAG, false))) return null;
    const config = (await this.appConfig?.getConfig()) ?? {};
    if (config[CHAT_TRANSLATE_ZONE] === false) return null;
    const key = (await this.secrets.get('google_translate'))?.fields.apiKey;
    return key || null;
  }

  async translate(
    user: RequestUser,
    conversationId: string,
    messageId: string,
    target: string,
  ): Promise<MessageTranslation> {
    const key = await this.apiKey();
    if (!key) throw unavailable();
    const m = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversation_id: conversationId,
        deleted_at: null,
        type: { in: ['text', 'attachment'] },
      },
      select: { body_display: true },
    });
    const text = m?.body_display.trim() ?? '';
    if (!m || text === '') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Message not found.',
      });
    }
    const cacheKey = `chat:tr:${messageId}:${target}`;
    const hit = await this.redis.get(cacheKey);
    if (hit) return JSON.parse(hit) as MessageTranslation;

    const day = new Date().toISOString().slice(0, 10);
    const quotaKey = `chat:tr:quota:${user.sub}:${day}`;
    const used = await this.redis.incr(quotaKey);
    if (used === 1) await this.redis.expire(quotaKey, 26 * 3600);
    if (used > DAILY_TRANSLATIONS) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many translations today.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const out = await this.callGoogle(key, text, target);
    await this.redis.set(cacheKey, JSON.stringify(out), 'EX', CACHE_TTL_S);
    return out;
  }

  private async callGoogle(
    key: string,
    text: string,
    target: string,
  ): Promise<MessageTranslation> {
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
      // Only the hash of the text is logged: chat content stays private.
      this.logger.warn(
        {
          alert: 'translation_failed',
          textHash: createHash('sha256')
            .update(text)
            .digest('hex')
            .slice(0, 12),
          err: e instanceof Error ? e.message : String(e),
        },
        'chat translation failed',
      );
      throw unavailable();
    } finally {
      clearTimeout(timer);
    }
  }
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ErrorCode.TRANSLATION_UNAVAILABLE,
    message: 'Translation is not available right now.',
  });
}

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { REDIS_CACHE_CLIENT } from '../../redis/redis.constants';
import { RateLimitService } from '../auth/auth.public';
import { LinkPreviewDto } from './link-preview.dto';
import { parsePreview } from './og-parser';
import { checkPreviewUrl, safeFetchHtml, SafeFetchError } from './safe-fetch';

export const LINK_PREVIEW_CACHE_TTL_SEC = 24 * 3600;
export const LINK_PREVIEW_NEGATIVE_TTL_SEC = 3600;
/** One person: a screen of chat bubbles opening at once is about 20. */
export const LINK_PREVIEW_USER_PER_MINUTE = 30;
export const LINK_PREVIEW_USER_PER_DAY = 1000;
/** Everybody together: real outbound fetches (cache misses) per minute. */
export const LINK_PREVIEW_GLOBAL_PER_MINUTE = 300;
const CACHE_PREFIX = 'lp:v1:';

/**
 * Owner 2026-10-22: `GET /link-preview?url=` — the title / description /
 * picture card under a chat message with a link. Isolated on purpose: its
 * own limits, its own cache, its own timeouts, so a slow or hostile site
 * can only cost this one request.
 */
@Injectable()
export class LinkPreviewService {
  private readonly log = new Logger(LinkPreviewService.name);
  private readonly inflight = new Map<string, Promise<LinkPreviewDto>>();

  constructor(
    @Inject(REDIS_CACHE_CLIENT) private readonly redis: Redis,
    private readonly limiter: RateLimitService,
    private readonly settings: AppSettingsService,
    private readonly config: ConfigService,
  ) {}

  private get allowLocal(): boolean {
    const env = this.config.get<string>('NODE_ENV');
    return env !== 'production' && env !== 'staging';
  }

  private async denylist(): Promise<string[]> {
    return (await this.settings.stringList('chat.link_preview_denylist'))
      .map((d) =>
        d
          .trim()
          .toLowerCase()
          .replace(/^\*?\./, ''),
      )
      .filter(Boolean);
  }

  static isDenied(host: string, list: string[]): boolean {
    const h = host.toLowerCase().replace(/\.$/, '');
    return list.some((d) => h === d || h.endsWith(`.${d}`));
  }

  private empty(url: string): LinkPreviewDto {
    return {
      url,
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
    };
  }

  async preview(userId: string, rawUrl: string): Promise<LinkPreviewDto> {
    const user = await this.limiter.consumeFixedWindow(
      ['link-preview', 'user', 'm', userId],
      LINK_PREVIEW_USER_PER_MINUTE,
      60,
    );
    const day = user.allowed
      ? await this.limiter.consumeFixedWindow(
          ['link-preview', 'user', 'd', userId],
          LINK_PREVIEW_USER_PER_DAY,
          86_400,
        )
      : user;
    if (!day.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many link previews. Try again later.',
          details: { retryAfterSeconds: day.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const deny = await this.denylist();
    const isDenied = (h: string) => LinkPreviewService.isDenied(h, deny);
    let url: URL;
    try {
      url = checkPreviewUrl(rawUrl, { allowLocal: this.allowLocal, isDenied });
    } catch (e) {
      if (e instanceof SafeFetchError && e.reason === 'blocked_host') {
        return this.empty(rawUrl);
      }
      throw new HttpException(
        {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Not a valid http(s) link.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const canonical = url.toString();

    // The kill switch hides the cards, it does not break chats.
    if (!(await this.settings.boolean('chat.link_preview_enabled'))) {
      return this.empty(canonical);
    }

    const key =
      CACHE_PREFIX + createHash('sha256').update(canonical).digest('hex');
    const cached = await this.readCache(key);
    if (cached) return cached;

    const pending = this.inflight.get(key);
    if (pending) return pending;
    const work = this.fetchAndStore(key, canonical, isDenied).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, work);
    return work;
  }

  private async readCache(key: string): Promise<LinkPreviewDto | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as LinkPreviewDto) : null;
    } catch {
      return null; // a broken cache only means a fresh fetch
    }
  }

  private async writeCache(
    key: string,
    value: LinkPreviewDto,
    ttl: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      /* the answer is still good */
    }
  }

  private async fetchAndStore(
    key: string,
    url: string,
    isDenied: (h: string) => boolean,
  ): Promise<LinkPreviewDto> {
    const global = await this.limiter.consumeFixedWindow(
      ['link-preview', 'global'],
      LINK_PREVIEW_GLOBAL_PER_MINUTE,
      60,
    );
    if (!global.allowed) {
      // Not cached: it says nothing about the site.
      return this.empty(url);
    }
    try {
      const page = await safeFetchHtml(url, {
        allowLocal: this.allowLocal,
        isDenied,
      });
      const parsed = parsePreview(page.html, page.finalUrl);
      const result: LinkPreviewDto = { url, ...parsed };
      const useful = parsed.title || parsed.description || parsed.imageUrl;
      await this.writeCache(
        key,
        result,
        useful ? LINK_PREVIEW_CACHE_TTL_SEC : LINK_PREVIEW_NEGATIVE_TTL_SEC,
      );
      return result;
    } catch (e) {
      const reason = e instanceof SafeFetchError ? e.reason : 'network';
      this.log.debug(`link preview failed (${reason}): ${new URL(url).host}`);
      const result = this.empty(url);
      await this.writeCache(key, result, LINK_PREVIEW_NEGATIVE_TTL_SEC);
      return result;
    }
  }
}

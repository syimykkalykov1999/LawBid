import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { readSwitchMode } from '../../common/app-settings/switch-mode';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { REDIS_CACHE_CLIENT } from '../../redis/redis.constants';
import { RateLimitService } from '../auth/auth.public';
import {
  ADDRESS_PROVIDERS,
  type AddressKind,
  type AddressProvider,
  type AddressSuggestion,
} from './address-providers';
import type { AddressSuggestionsDto } from './addresses.dto';

/** Fewer letters than this never reach a provider (the app waits too). */
export const ADDRESS_MIN_CHARS = 3;
/** Longer input is cut (an address line is never this long). */
export const ADDRESS_MAX_CHARS = 120;
export const ADDRESS_RESULTS = 5;
/** One person typing: a debounced field makes ~1 call a second at most. */
export const ADDRESS_USER_PER_MINUTE = 60;
/** Everybody together: provider calls a minute (cache misses). */
export const ADDRESS_GLOBAL_PER_MINUTE = 1_200;
/** Only for a provider whose terms allow keeping answers (none today). */
export const ADDRESS_CACHE_TTL_SEC = 7 * 86_400;
const CACHE_PREFIX = 'addr:v1:';

/** Lower case, one space, no punctuation that does not change the match. */
export function normalizeAddressQuery(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ADDRESS_MAX_CHARS);
}

/**
 * Owner 2026-10-28: `GET /addresses/suggest` — US address suggestions
 * while a person types (docs/architecture/ADDRESS_AUTOCOMPLETE_2026-10-28.md).
 * The provider key never leaves the server. Order of guards: switch →
 * min length → per-person limits → cache (only if the provider's terms
 * allow it) → in-flight dedupe → global per-minute limit → monthly cap →
 * provider. Any provider failure is an empty list, never an error: the
 * field keeps working as plain text.
 */
@Injectable()
export class AddressesService {
  private readonly log = new Logger(AddressesService.name);
  private readonly inflight = new Map<string, Promise<AddressSuggestion[]>>();

  constructor(
    @Inject(REDIS_CACHE_CLIENT) private readonly redis: Redis,
    private readonly limiter: RateLimitService,
    private readonly settings: AppSettingsService,
    @Inject(ADDRESS_PROVIDERS) private readonly providers: AddressProvider[],
  ) {}

  private off(): AddressSuggestionsDto {
    return { enabled: false, items: [] };
  }

  /** The provider to call, or null when the switch / keys say no. */
  async activeProvider(): Promise<AddressProvider | null> {
    const mode = await readSwitchMode(
      this.settings,
      'addresses.autocomplete_enabled',
    );
    if (mode === 'off') return null;
    const name = await this.settings.string('addresses.provider');
    const provider =
      this.providers.find((p) => p.name === name) ?? this.providers[0];
    if (!provider) return null;
    // on and auto both need keys: without them a call can only fail.
    return (await provider.configured()) ? provider : null;
  }

  async suggest(
    userId: string,
    rawQuery: string,
    kind: AddressKind = 'address',
    session?: string,
  ): Promise<AddressSuggestionsDto> {
    const provider = await this.activeProvider();
    if (!provider) return this.off();

    const text = normalizeAddressQuery(rawQuery);
    if ([...text].length < ADDRESS_MIN_CHARS) {
      return { enabled: true, items: [] };
    }

    const minute = await this.limiter.consumeFixedWindow(
      ['addresses', 'user', 'm', userId],
      ADDRESS_USER_PER_MINUTE,
      60,
    );
    const day = minute.allowed
      ? await this.limiter.consumeFixedWindow(
          ['addresses', 'user', 'd', userId],
          await this.settings.number('addresses.per_user_per_day'),
          86_400,
        )
      : minute;
    if (!day.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many address lookups. Try again later.',
          details: { retryAfterSeconds: day.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const key =
      CACHE_PREFIX +
      createHash('sha256')
        .update(`${provider.name}|${kind}|${text}`)
        .digest('hex');
    if (provider.cacheable) {
      const cached = await this.readCache(key);
      if (cached) return { enabled: true, items: cached };
    }

    const pending = this.inflight.get(key);
    if (pending) return { enabled: true, items: await pending };
    const work = this.callProvider(provider, key, {
      text,
      kind,
      session,
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, work);
    return { enabled: true, items: await work };
  }

  private async callProvider(
    provider: AddressProvider,
    key: string,
    q: { text: string; kind: AddressKind; session?: string },
  ): Promise<AddressSuggestion[]> {
    const global = await this.limiter.consumeFixedWindow(
      ['addresses', 'global'],
      ADDRESS_GLOBAL_PER_MINUTE,
      60,
    );
    if (!global.allowed) return [];
    const cap = await this.settings.number('addresses.monthly_cap');
    if (cap <= 0) return [];
    const month = new Date().toISOString().slice(0, 7);
    const monthly = await this.limiter.consumeFixedWindow(
      ['addresses', 'month', month],
      cap,
      35 * 86_400,
    );
    if (!monthly.allowed) return [];
    try {
      const items = await provider.suggest({ ...q, limit: ADDRESS_RESULTS });
      if (provider.cacheable && items.length > 0) {
        await this.writeCache(key, items);
      }
      return items;
    } catch (e) {
      this.log.warn(
        `address suggest failed (${provider.name}): ${e instanceof Error ? e.name : 'error'}`,
      );
      return [];
    }
  }

  private async readCache(key: string): Promise<AddressSuggestion[] | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as AddressSuggestion[]) : null;
    } catch {
      return null; // a broken cache only means a fresh call
    }
  }

  private async writeCache(
    key: string,
    items: AddressSuggestion[],
  ): Promise<void> {
    try {
      await this.redis.set(
        key,
        JSON.stringify(items),
        'EX',
        ADDRESS_CACHE_TTL_SEC,
      );
    } catch {
      /* the answer is still good */
    }
  }
}

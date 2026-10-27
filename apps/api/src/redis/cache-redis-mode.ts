import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { setCacheTtlCeiling } from '../common/cache/cached';
import { AppSettingsService } from '../common/app-settings/app-settings.service';

/**
 * Owner 2026-10-25 (caching round 2): admin control `cache.redis_mode`
 * (Выкл / Вкл / Авто). `off` sends every cache command to the MAIN Redis
 * (as before the cache node existed); `on` / `auto` use the cache node when
 * REDIS_CACHE_URL is set. Read every 30 s, so a switch applies within half
 * a minute without a release.
 */
let forcedOff = false;

export function setCacheRedisForcedOff(v: boolean): void {
  forcedOff = v;
}

export function cacheRedisForcedOff(): boolean {
  return forcedOff;
}

/** [cache] normally; [main] (fail-soft) while the admin switch is off. */
export function switchableRedis(cache: Redis, main: Redis): Redis {
  return new Proxy(cache, {
    get(_target, prop) {
      const t = forcedOff ? main : cache;
      const value = Reflect.get(t, prop, t) as unknown;
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(t)
        : value;
    },
  });
}

@Injectable()
export class CacheRedisModeService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(@Optional() private readonly settings?: AppSettingsService) {}

  async onModuleInit(): Promise<void> {
    if (!this.settings || process.env.NODE_ENV === 'test') return;
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), 30_000);
    this.timer.unref();
  }

  async refresh(): Promise<void> {
    try {
      const mode = await this.settings?.string('cache.redis_mode');
      setCacheRedisForcedOff(mode === 'off');
      setCacheTtlCeiling(
        (await this.settings?.number('cache.max_ttl_sec')) ?? 0,
      );
    } catch {
      // keep the current mode
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

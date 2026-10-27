import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import type { RequestMeta } from './session.service';
import { browserLabel } from '../device-label.util';

/** Countries / browsers seen for an account are remembered this long. */
const SEEN_TTL_SECONDS = 180 * 24 * 3600;
/** The last country a session chain was used from. */
const CHAIN_TTL_SECONDS = 90 * 24 * 3600;
/** Never let one account grow an unbounded set. */
const SEEN_MAX = 30;

export interface LoginNovelty {
  /** The sign-in came from a country this account has not used before. */
  newCountry: boolean;
  /** A web sign-in from a browser / OS this account has not used before. */
  newBrowser: boolean;
}

/**
 * 2026-10-25 (S14-4): server-side novelty of a sign-in. The device id is a
 * client-supplied header, so an attacker with a stolen code simply omits it;
 * the country (as the CDN / load balancer reports it) and, for the website,
 * the browser family are things the caller cannot hide. They only count
 * once the account has a baseline: the first sign-in after this ships (or
 * one without a country header) just records, it never alerts.
 */
@Injectable()
export class AuthNoveltyService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Records this sign-in's country / browser and says what was new. A
   * Redis failure is "nothing new": novelty must never block a login. */
  async onLogin(
    userId: string,
    meta: RequestMeta,
    platform: string | undefined,
  ): Promise<LoginNovelty> {
    const none: LoginNovelty = { newCountry: false, newBrowser: false };
    try {
      const newCountry = meta.country
        ? await this.seen(`auth:seen:c:${userId}`, meta.country)
        : false;
      const family =
        platform === 'web' ? browserLabel(meta.userAgent) : undefined;
      const newBrowser = family
        ? await this.seen(`auth:seen:u:${userId}`, family)
        : false;
      return { newCountry, newBrowser };
    } catch {
      return none;
    }
  }

  /** Remembers where a session chain was last used (the session list shows
   * it, and the next refresh compares against it). */
  async rememberChainCountry(
    chainId: string,
    country: string | undefined,
  ): Promise<void> {
    if (!country) return;
    try {
      await this.redis.set(
        `auth:chain-country:${chainId}`,
        country,
        'EX',
        CHAIN_TTL_SECONDS,
      );
    } catch {
      // best effort
    }
  }

  async chainCountries(chainIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (chainIds.length === 0) return out;
    try {
      const values = await Promise.all(
        chainIds.map((id) => this.redis.get(`auth:chain-country:${id}`)),
      );
      chainIds.forEach((id, i) => {
        const v = values[i];
        if (v) out.set(id, v);
      });
    } catch {
      // best effort
    }
    return out;
  }

  /** On a refresh: true when the country differs from the chain's last one.
   * The new country is stored at once, so the alert fires once per move. */
  async refreshFromNewCountry(
    chainId: string,
    country: string | undefined,
  ): Promise<boolean> {
    if (!country) return false;
    try {
      const key = `auth:chain-country:${chainId}`;
      const previous = await this.redis.get(key);
      await this.redis.set(key, country, 'EX', CHAIN_TTL_SECONDS);
      return previous !== null && previous !== country;
    } catch {
      return false;
    }
  }

  /** COST GATE: at most one new-country (or no-device-id) alert (push + e-mail) per account
   * per 24 h, however often the country changes. Redis down = no alert. */
  async allowAlert(
    userId: string,
    kind: 'country' | 'nodevice',
  ): Promise<boolean> {
    try {
      return (
        (await this.redis.set(
          `auth:alert-cap:${kind}:${userId}`,
          '1',
          'EX',
          24 * 3600,
          'NX',
        )) === 'OK'
      );
    } catch {
      return false;
    }
  }

  /** SADD into a per-account set; "new" only when the set already had a
   * baseline (otherwise the first value ever seen is not suspicious). */
  private async seen(key: string, value: string): Promise<boolean> {
    const before = await this.redis.scard(key);
    const added = await this.redis.sadd(key, value);
    if (before === 0) {
      await this.redis.expire(key, SEEN_TTL_SECONDS);
      return false;
    }
    if (added === 1) {
      await this.redis.expire(key, SEEN_TTL_SECONDS);
      if (before + 1 > SEEN_MAX) await this.redis.spop(key);
      return true;
    }
    return false;
  }
}

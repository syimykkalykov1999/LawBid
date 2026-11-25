import type Redis from 'ioredis';
import { bumpFeedVersion } from '../../common/cache/feed-version';
import { delSafe } from '../../redis/redis-cluster-safe';
import { dropAppConfigCache } from '../feature-flags/services/app-config.service';
import { bumpConfigVersion } from '../feature-flags/services/config-version';
import { dedupeIntents, type CacheIntent } from './cdc-key-map';

/** EntitlementsService's keys (modules/plans/entitlements.service.ts). */
export const ENTITLEMENTS_VERSION_KEY = 'ent:ver';
export const entitlementsKey = (ver: string, uid: string) =>
  `ent:${ver}:${uid}`;

/** Keys per Redis command (a mass update must not send one huge DEL). */
const CHUNK = 500;

/**
 * Runs the cache actions of one committed transaction (C2). The same
 * helpers the in-request path uses (dropAppConfigCache, bumpFeedVersion,
 * bumpConfigVersion, delSafe), so both lines drop exactly the same thing.
 * Throws when Redis refuses: the caller then does NOT acknowledge the WAL
 * position and the change is decoded again after the reconnect
 * (at-least-once; a repeated DEL is harmless).
 */
export class CdcInvalidator {
  constructor(
    private readonly main: Redis,
    private readonly cache: Redis,
  ) {}

  async apply(intents: CacheIntent[]): Promise<number> {
    const list = dedupeIntents(intents);
    if (list.length === 0) return 0;
    const delMain: string[] = [];
    const delCache: string[] = [];
    const feed: string[] = [];
    const entUsers: string[] = [];
    let appConfig = false;
    let configVersion = false;
    let entAll = false;
    for (const i of list) {
      switch (i.kind) {
        case 'del':
          (i.redis === 'main' ? delMain : delCache).push(i.key);
          break;
        case 'feed':
          feed.push(i.uid);
          break;
        case 'entitlements_user':
          entUsers.push(i.uid);
          break;
        case 'app_config':
          appConfig = true;
          break;
        case 'config_version':
          configVersion = true;
          break;
        case 'entitlements_all':
          entAll = true;
          break;
      }
    }
    if (entUsers.length > 0) {
      const ver = (await this.main.get(ENTITLEMENTS_VERSION_KEY)) ?? '0';
      for (const uid of entUsers) delCache.push(entitlementsKey(ver, uid));
    }
    // delSafe and INCR reject on a Redis error (the caller retries);
    // bumpFeedVersion / dropAppConfigCache are best effort by design (their
    // miss is covered by the TTL, exactly as on the in-request path).
    for (let i = 0; i < delMain.length; i += CHUNK) {
      await delSafe(this.main, delMain.slice(i, i + CHUNK));
    }
    for (let i = 0; i < delCache.length; i += CHUNK) {
      await delSafe(this.cache, delCache.slice(i, i + CHUNK));
    }
    for (let i = 0; i < feed.length; i += CHUNK) {
      await bumpFeedVersion(this.cache, ...feed.slice(i, i + CHUNK));
    }
    if (appConfig) await dropAppConfigCache(this.main);
    else if (configVersion) await bumpConfigVersion(this.main);
    if (entAll) await this.main.incr(ENTITLEMENTS_VERSION_KEY);
    return list.length;
  }
}

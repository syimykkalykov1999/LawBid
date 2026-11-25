import { PRACTICE_TREE_CACHE_KEY } from '../../common/cache/cache-keys';
import { BOOTSTRAP_CACHE_KEY } from '../feature-flags/services/bootstrap.service';
import {
  FLAGS_CACHE_KEY,
  ROLLOUT_CACHE_KEY,
  ROLLOUT_V2_CACHE_KEY,
} from '../feature-flags/services/feature-flags.service';

/**
 * C2 (docs/dev/ARCHITECTURE_VS_BIG_PLATFORMS_2026-11-25.md, item 22): cache
 * invalidation driven by the database change log, the way Facebook's
 * memcache does it («Scaling Memcache at Facebook», NSDI 2013, §4.1:
 * mcsqueal daemons tail the commit log and send the deletes) and Uber's
 * CacheFront (2024: CDC «Flux» tails the binlog and invalidates). The
 * in-request invalidations stay the FIRST line; this map is the second:
 * a row change that reaches the commit log by any path (admin SQL, a
 * trigger, a shard move, a job that forgot the delete) drops the same keys.
 *
 * Pure: a decoded row change in, the cache actions out. Every key string
 * here is the one the module that owns the cache deletes itself;
 * cdc-key-map.spec.ts runs those modules' own invalidators against a fake
 * Redis and proves both paths drop the same keys.
 */

export type CdcOp = 'insert' | 'update' | 'delete';

export interface CdcRowChange {
  table: string;
  op: CdcOp;
  /** The new row (insert / update). */
  new?: Record<string, unknown> | null;
  /** The old row or its key (update of the key, delete); with REPLICA
   * IDENTITY DEFAULT only the primary key columns are set. */
  old?: Record<string, unknown> | null;
}

/** Which Redis holds the key (redis/redis.constants.ts). */
export type CdcRedis = 'cache' | 'main';

export type CacheIntent =
  /** DEL of one key. */
  | { kind: 'del'; redis: CdcRedis; key: string }
  /** The viewer's feed first page: common/cache/feed-version.ts. */
  | { kind: 'feed'; uid: string }
  /** app_config: dropAppConfigCache (memo, Redis copy, config version). */
  | { kind: 'app_config' }
  /** INCR config:version (bootstrap / flags ETag). */
  | { kind: 'config_version' }
  /** The user's plan terms `ent:{ver}:{uid}` (ver = main `ent:ver`). */
  | { kind: 'entitlements_user'; uid: string }
  /** A plan changed: INCR `ent:ver`, every cached answer is stale. */
  | { kind: 'entitlements_all' };

/** Key builders, the same strings as the owning modules (see spec). */
export const cdcKeys = {
  blockSet: (uid: string) => `blocks:${uid}`,
  userCard: (uid: string) => `lawbid:user-card:v1:${uid}`,
  subActive: (uid: string) => `sub:active:${uid}`,
  consentAnalytics: (uid: string) => `consent:analytics:${uid}`,
  consentDoNotSell: (uid: string) => `consent:dns:${uid}`,
  strikeLimit: (uid: string) => `strike:limit:${uid}`,
  assistantContext: (uid: string) => `assistant:ctx:${uid}`,
  i18nBundleVersion: (lang: string) => `i18n:bundle:version:${lang}`,
} as const;

type Mapper = (row: Record<string, unknown>) => CacheIntent[];

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

/** One intent per non-empty value of [col]. */
const byCol =
  (col: string, make: (v: string) => CacheIntent[]): Mapper =>
  (row) => {
    const v = str(row[col]);
    return v ? make(v) : [];
  };

const del = (redis: CdcRedis, key: string): CacheIntent => ({
  kind: 'del',
  redis,
  key,
});

const flags: CacheIntent[] = [
  del('main', FLAGS_CACHE_KEY),
  del('main', ROLLOUT_CACHE_KEY),
  del('main', ROLLOUT_V2_CACHE_KEY),
  { kind: 'config_version' },
];

const bootstrap: CacheIntent[] = [
  del('main', BOOTSTRAP_CACHE_KEY),
  { kind: 'config_version' },
];

const subscriptionOf = byCol('user_id', (uid) => [
  del('cache', cdcKeys.subActive(uid)),
  { kind: 'entitlements_user', uid },
]);

/**
 * Table → what its row change drops. Applied to the new row AND the old row
 * (so a moved key, e.g. a changed author, drops both sides). Tables whose
 * delete carries no owner column under REPLICA IDENTITY DEFAULT are set to
 * REPLICA IDENTITY FULL in the migration (small, rarely written tables);
 * hot tables (posts, users) keep DEFAULT: their hard deletes are rare and
 * end with the 60 s TTL.
 */
const MAP: Record<string, Mapper> = {
  // blocks.service.ts: dropBlockSets + bumpFeedVersion for both users.
  user_blocks: (row) =>
    ['blocker_id', 'blocked_id'].flatMap((c) => {
      const uid = str(row[c]);
      return uid
        ? [del('cache', cdcKeys.blockSet(uid)), { kind: 'feed' as const, uid }]
        : [];
    }),
  // follows.service.ts: the follower's feed.
  follows: byCol('follower_id', (uid) => [{ kind: 'feed', uid }]),
  // posts.service.ts: the author's feed.
  posts: byCol('author_id', (uid) => [{ kind: 'feed', uid }]),
  // sharding/user-directory.ts: the public card (name, avatar, badge).
  users: byCol('id', (uid) => [del('main', cdcKeys.userCard(uid))]),
  feature_flags: () => flags,
  app_config: () => [{ kind: 'app_config' }],
  practice_areas: () => [del('cache', PRACTICE_TREE_CACHE_KEY)],
  // subscription-access.service.ts invalidate(): sub:active + plan terms.
  subscriptions: subscriptionOf,
  contract_grants: subscriptionOf,
  plans: () => [{ kind: 'entitlements_all' }],
  user_consents: byCol('user_id', (uid) => [
    del('main', cdcKeys.consentAnalytics(uid)),
    del('main', cdcKeys.consentDoNotSell(uid)),
  ]),
  user_strikes: byCol('user_id', (uid) => [
    del('main', cdcKeys.strikeLimit(uid)),
  ]),
  assistant_memberships: byCol('assistant_user_id', (uid) => [
    del('main', cdcKeys.assistantContext(uid)),
  ]),
  legal_documents: () => bootstrap,
  i18n_languages: () => bootstrap,
  i18n_bundle_versions: byCol('lang', (lang) => [
    del('cache', cdcKeys.i18nBundleVersion(lang)),
  ]),
};

/** The tables the publication `lawbid_cache_cdc` carries (migration
 * 20261223120000_cache_cdc_publication), sorted. */
export const CDC_TABLES: readonly string[] = Object.keys(MAP).sort();

/** Tables set to REPLICA IDENTITY FULL by the migration (their delete
 * must carry the owner column the map reads). */
export const CDC_FULL_IDENTITY_TABLES: readonly string[] = [
  'assistant_memberships',
  'contract_grants',
  'subscriptions',
  'user_consents',
  'user_strikes',
];

export const CDC_PUBLICATION = 'lawbid_cache_cdc';

/** The cache actions of one row change; [] for a table not in the map. */
export function intentsFor(change: CdcRowChange): CacheIntent[] {
  const map = MAP[change.table];
  if (!map) return [];
  const out: CacheIntent[] = [];
  for (const row of [change.new, change.old]) {
    if (row) out.push(...map(row));
  }
  return out;
}

/** Stable identity of an intent, for de-duplication within a batch. */
export function intentId(i: CacheIntent): string {
  switch (i.kind) {
    case 'del':
      return `del:${i.redis}:${i.key}`;
    case 'feed':
    case 'entitlements_user':
      return `${i.kind}:${i.uid}`;
    default:
      return i.kind;
  }
}

/** [intents] without repeats, first occurrence order kept. */
export function dedupeIntents(intents: CacheIntent[]): CacheIntent[] {
  const seen = new Set<string>();
  const out: CacheIntent[] = [];
  for (const i of intents) {
    const id = intentId(i);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(i);
  }
  return out;
}

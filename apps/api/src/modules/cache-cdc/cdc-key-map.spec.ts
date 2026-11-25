import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Redis from 'ioredis';
import { dropBlockSets } from '../blocks/block-set.cache';
import { feedVersionKey } from '../../common/cache/feed-version';
import { PRACTICE_TREE_CACHE_KEY } from '../../common/cache/cache-keys';
import { StrikeGate } from '../../common/usage-limits/strike-gate.service';
import { AnalyticsConsentService } from '../analytics/analytics-consent.service';
import { AssistantContextService } from '../auth/assistant/assistant-context';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { BootstrapService } from '../feature-flags/services/bootstrap.service';
import {
  APP_CONFIG_CACHE_KEY,
  dropAppConfigCache,
} from '../feature-flags/services/app-config.service';
import { CONFIG_VERSION_KEY } from '../feature-flags/services/config-version';
import { I18nBundleService } from '../i18n/services/i18n-bundle.service';
import { UserDirectory } from '../../sharding/user-directory';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  CDC_FULL_IDENTITY_TABLES,
  CDC_PUBLICATION,
  CDC_TABLES,
  dedupeIntents,
  intentsFor,
  type CacheIntent,
} from './cdc-key-map';
import { CdcInvalidator } from './cdc-invalidator';

/** Records what a code path does to Redis. */
function recorder() {
  const deleted: string[] = [];
  const incr: string[] = [];
  const set: string[] = [];
  const store = new Map<string, string>();
  const r = {
    del: jest.fn((...keys: string[]) => {
      deleted.push(...keys.flat());
      return Promise.resolve(keys.length);
    }),
    incr: jest.fn((k: string) => {
      incr.push(k);
      return Promise.resolve(1);
    }),
    set: jest.fn((k: string, v: string) => {
      set.push(k);
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
  };
  return {
    redis: r as unknown as Redis,
    deleted,
    incr,
    set,
    store,
    /** Every key the path touched, in a stable order. */
    touched: () => [...new Set([...deleted, ...incr, ...set])].sort(),
  };
}

const bare = <T extends object>(
  cls: { prototype: T },
  fields: Record<string, unknown>,
): T => Object.assign(Object.create(cls.prototype) as object, fields) as T;

/** Keys the CDC path touches for [changes], run through the real executor
 * with one recorder for both Redis clients. */
async function cdcTouched(
  ...changes: Parameters<typeof intentsFor>[0][]
): Promise<string[]> {
  const rec = recorder();
  await new CdcInvalidator(rec.redis, rec.redis).apply(
    changes.flatMap((c) => intentsFor(c)),
  );
  return rec.touched();
}

describe('cache CDC key map: the change log drops what the code drops', () => {
  it('user_blocks: both block sets and both feeds, like BlocksService', async () => {
    const rec = recorder();
    await dropBlockSets(rec.redis, 'a', 'b');
    const expected = [...rec.deleted, feedVersionKey('a'), feedVersionKey('b')];
    expect(
      await cdcTouched({
        table: 'user_blocks',
        op: 'delete',
        old: { blocker_id: 'a', blocked_id: 'b' },
      }),
    ).toEqual(expected.sort());
  });

  it('follows: the follower feed; posts: the author feed', async () => {
    expect(
      await cdcTouched({
        table: 'follows',
        op: 'insert',
        new: { follower_id: 'f', followee_id: 'g' },
      }),
    ).toEqual([feedVersionKey('f')]);
    expect(
      await cdcTouched({
        table: 'posts',
        op: 'update',
        new: { id: 'p1', author_id: 'au' },
      }),
    ).toEqual([feedVersionKey('au')]);
  });

  it('users: the public card UserDirectory drops', async () => {
    const rec = recorder();
    const dir = new UserDirectory({} as PrismaService);
    dir.attachCache(rec.redis, 5);
    await dir.invalidate('u1');
    expect(
      await cdcTouched({ table: 'users', op: 'update', new: { id: 'u1' } }),
    ).toEqual(rec.touched());
  });

  it('feature_flags: what FeatureFlagsService.invalidate drops', async () => {
    const rec = recorder();
    await bare(FeatureFlagsService, {
      l1: { clear: () => undefined },
      redis: rec.redis,
    }).invalidate();
    expect(
      await cdcTouched({
        table: 'feature_flags',
        op: 'update',
        new: { key: 'x' },
      }),
    ).toEqual(rec.touched());
    expect(rec.incr).toContain(CONFIG_VERSION_KEY);
  });

  it('app_config: dropAppConfigCache (copy + version)', async () => {
    const rec = recorder();
    await dropAppConfigCache(rec.redis);
    const got = await cdcTouched({
      table: 'app_config',
      op: 'update',
      new: { key: 'db.cdc_mode' },
    });
    expect(got).toEqual(rec.touched());
    expect(got).toEqual([APP_CONFIG_CACHE_KEY, CONFIG_VERSION_KEY].sort());
  });

  it('legal_documents / i18n_languages: BootstrapService.invalidate', async () => {
    const rec = recorder();
    await bare(BootstrapService, { redis: rec.redis }).invalidate();
    for (const table of ['legal_documents', 'i18n_languages']) {
      expect(
        await cdcTouched({ table, op: 'insert', new: { id: '1', code: 'xx' } }),
      ).toEqual(rec.touched());
    }
  });

  it('i18n_bundle_versions: the version copy of that language', async () => {
    const rec = recorder();
    await bare(I18nBundleService, { redis: rec.redis }).cacheVersion('de', 7);
    expect(
      await cdcTouched({
        table: 'i18n_bundle_versions',
        op: 'update',
        new: { lang: 'de', version: 8 },
      }),
    ).toEqual(rec.touched());
  });

  it('practice_areas: the tree', async () => {
    expect(
      await cdcTouched({
        table: 'practice_areas',
        op: 'update',
        new: { id: '1' },
      }),
    ).toEqual([PRACTICE_TREE_CACHE_KEY]);
  });

  it('subscriptions / contract_grants: SubscriptionAccessService.invalidate (sub:active + plan terms)', async () => {
    const rec = recorder();
    rec.store.set('ent:ver', '4');
    const ent = new EntitlementsService(
      {} as never,
      { invalidate: () => undefined } as never,
      rec.redis,
      undefined,
      rec.redis,
    );
    await bare(SubscriptionAccessService, {
      redis: rec.redis,
      entitlements: ent,
    }).invalidate('att1');
    const code = rec.touched();
    expect(code).toEqual(['ent:4:att1', 'sub:active:att1']);
    for (const table of ['subscriptions', 'contract_grants']) {
      const cdc = recorder();
      cdc.store.set('ent:ver', '4');
      await new CdcInvalidator(cdc.redis, cdc.redis).apply(
        intentsFor({ table, op: 'delete', old: { id: 's', user_id: 'att1' } }),
      );
      expect(cdc.touched()).toEqual(code);
    }
  });

  it('plans: EntitlementsService.invalidateAll bumps the global version', async () => {
    const rec = recorder();
    await new EntitlementsService(
      {} as never,
      { invalidate: () => undefined } as never,
      rec.redis,
      undefined,
      rec.redis,
    ).invalidateAll();
    expect(
      await cdcTouched({ table: 'plans', op: 'update', new: { id: 'p' } }),
    ).toEqual(rec.touched());
  });

  it('user_consents, user_strikes, assistant_memberships: their services', async () => {
    const consent = recorder();
    await bare(AnalyticsConsentService, { redis: consent.redis }).invalidate(
      'u',
    );
    expect(
      await cdcTouched({
        table: 'user_consents',
        op: 'insert',
        new: { id: 'c', user_id: 'u' },
      }),
    ).toEqual(consent.touched());

    const strike = recorder();
    await bare(StrikeGate, { redis: strike.redis }).invalidate('u');
    expect(
      await cdcTouched({
        table: 'user_strikes',
        op: 'delete',
        old: { id: 's', user_id: 'u' },
      }),
    ).toEqual(strike.touched());

    const asst = recorder();
    await bare(AssistantContextService, { redis: asst.redis }).invalidate('as');
    expect(
      await cdcTouched({
        table: 'assistant_memberships',
        op: 'update',
        new: { id: 'm', attorney_id: 'at', assistant_user_id: 'as' },
      }),
    ).toEqual(asst.touched());
  });

  it('an update that moves the owner drops both sides (old and new row)', async () => {
    expect(
      await cdcTouched({
        table: 'posts',
        op: 'update',
        new: { id: 'p', author_id: 'new' },
        old: { id: 'p', author_id: 'old' },
      }),
    ).toEqual([feedVersionKey('new'), feedVersionKey('old')].sort());
  });

  it('a delete that carries only the primary key of a hot table drops nothing (TTL)', () => {
    expect(
      intentsFor({ table: 'posts', op: 'delete', old: { id: 'p' } }),
    ).toEqual([]);
  });

  it('tables outside the map do nothing', () => {
    expect(
      intentsFor({ table: 'messages', op: 'insert', new: { id: 'm' } }),
    ).toEqual([]);
  });

  it('dedupes repeats of one transaction', () => {
    const a: CacheIntent = { kind: 'feed', uid: 'x' };
    expect(dedupeIntents([a, { ...a }, { kind: 'config_version' }])).toEqual([
      a,
      { kind: 'config_version' },
    ]);
  });
});

describe('the migration publishes exactly the mapped tables', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../../prisma/migrations/20261223120000_cache_cdc_publication/migration.sql',
    ),
    'utf8',
  );

  const listAfter = (marker: string) => {
    const at = sql.indexOf(marker);
    const end = sql.indexOf(';', at);
    return [...sql.slice(at, end).matchAll(/"([a-z_0-9]+)"/g)]
      .map((m) => m[1])
      .sort();
  };

  it('CREATE and ALTER carry CDC_TABLES', () => {
    expect(sql).toContain(`CREATE PUBLICATION ${CDC_PUBLICATION} FOR TABLE`);
    expect(listAfter('CREATE PUBLICATION')).toEqual([...CDC_TABLES]);
    expect(listAfter('SET TABLE')).toEqual([...CDC_TABLES]);
  });

  it('REPLICA IDENTITY FULL on the tables whose delete needs the owner', () => {
    const full = [
      ...sql.matchAll(/ALTER TABLE "([a-z_]+)" REPLICA IDENTITY FULL/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(full).toEqual([...CDC_FULL_IDENTITY_TABLES]);
    for (const t of full) expect(CDC_TABLES).toContain(t);
  });

  it('every FULL table really needs it: its delete maps only with a non-key column', () => {
    for (const t of CDC_FULL_IDENTITY_TABLES) {
      expect(
        intentsFor({ table: t, op: 'delete', old: { id: 'only-pk' } }),
      ).toEqual([]);
    }
  });
});

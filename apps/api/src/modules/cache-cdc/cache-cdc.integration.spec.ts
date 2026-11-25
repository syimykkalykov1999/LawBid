import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import IORedis from 'ioredis';
import type Redis from 'ioredis';
import { Client } from 'pg';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { feedVersionKey } from '../../common/cache/feed-version';
import { CacheCdcService } from './cache-cdc.service';
import { CDC_TABLES } from './cdc-key-map';
import { CDC_SLOT } from './cdc-slot';
import type { CdcStatus } from './cdc-status';

/**
 * Opt-in: a real PostgreSQL with wal_level=logical and a real Valkey, e.g.
 *   docker run -d --name cdc-pg -p 55433:5432 -e POSTGRES_PASSWORD=pw \
 *     postgres:18.6 -c wal_level=logical
 *   docker run -d --name cdc-valkey -p 56380:6379 valkey/valkey:9.1.3-alpine
 *   CDC_PG_TEST_URL=postgresql://postgres:pw@127.0.0.1:55433/postgres \
 *   CDC_REDIS_TEST_URL=redis://127.0.0.1:56380 \
 *     npx jest cache-cdc.integration
 * Skipped in normal runs and CI (like redis-cluster.integration.spec.ts).
 *
 * Builds the 16 published tables (only the columns the map reads), runs the
 * REAL migration file on them, starts the real service and proves that a
 * change made straight in SQL (no app code) drops the cached keys.
 */
const PG = process.env.CDC_PG_TEST_URL;
const REDIS = process.env.CDC_REDIS_TEST_URL;
const d = PG && REDIS ? describe : describe.skip;

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const U3 = '00000000-0000-4000-8000-000000000003';

const TABLES: Record<string, string> = {
  app_config: 'key text PRIMARY KEY, value jsonb',
  assistant_memberships:
    'id uuid PRIMARY KEY, attorney_id uuid, assistant_user_id uuid',
  contract_grants: 'id uuid PRIMARY KEY, user_id uuid',
  feature_flags: 'key text PRIMARY KEY, enabled boolean',
  follows:
    'follower_id uuid, followee_id uuid, PRIMARY KEY (follower_id, followee_id)',
  i18n_bundle_versions: 'lang text PRIMARY KEY, version int',
  i18n_languages: 'code text PRIMARY KEY',
  legal_documents: 'id uuid PRIMARY KEY',
  plans: 'id uuid PRIMARY KEY',
  posts: 'id uuid PRIMARY KEY, author_id uuid, body text',
  practice_areas: 'id uuid PRIMARY KEY',
  subscriptions: 'id uuid PRIMARY KEY, user_id uuid, status text',
  user_blocks:
    'blocker_id uuid, blocked_id uuid, PRIMARY KEY (blocker_id, blocked_id)',
  user_consents: 'id uuid PRIMARY KEY, user_id uuid',
  user_strikes: 'id uuid PRIMARY KEY, user_id uuid',
  users: 'id uuid PRIMARY KEY, name text',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(
  what: string,
  ok: () => Promise<boolean>,
  ms = 15_000,
): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return;
    await sleep(100);
  }
  throw new Error(`timed out: ${what}`);
}

d('cache CDC against real PostgreSQL (wal_level=logical) and Valkey', () => {
  jest.setTimeout(60_000);
  let pg: Client;
  let redis: Redis;
  let svc: CacheCdcService;
  const settings: Record<string, unknown> = {
    'db.cdc_mode': 'on',
    'db.cdc_max_slot_wal_mb': 2048,
    'db.cdc_lag_alarm_sec': 120,
  };
  const warns: unknown[] = [];

  beforeAll(async () => {
    pg = new Client({ connectionString: PG });
    await pg.connect();
    await pg.query(
      `SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots
        WHERE slot_name = $1 AND NOT active`,
      [CDC_SLOT],
    );
    await pg.query('DROP PUBLICATION IF EXISTS lawbid_cache_cdc');
    for (const t of Object.keys(TABLES)) {
      await pg.query(`DROP TABLE IF EXISTS "${t}"`);
    }
    for (const [t, cols] of Object.entries(TABLES)) {
      await pg.query(`CREATE TABLE "${t}" (${cols})`);
    }
    // The real migration, as prisma would run it (one transaction).
    const sql = readFileSync(
      join(
        __dirname,
        '../../../prisma/migrations/20261223120000_cache_cdc_publication/migration.sql',
      ),
      'utf8',
    );
    await pg.query(`BEGIN; ${sql}; COMMIT;`);

    redis = new IORedis(REDIS as string, { maxRetriesPerRequest: 2 });
    await redis.flushdb();

    process.env.CACHE_CDC_DATABASE_URL = PG;
    delete process.env.DATABASE_URL_SHARDS;
    delete process.env.DB_SHARD_HOSTS;
    const logger = {
      setContext: () => undefined,
      info: () => undefined,
      warn: (o: unknown) => warns.push(o),
    } as unknown as PinoLogger;
    const appSettings = {
      string: (k: string) => Promise.resolve(String(settings[k])),
      number: (k: string) => Promise.resolve(Number(settings[k])),
    } as unknown as AppSettingsService;
    svc = new CacheCdcService(redis, redis, logger, appSettings);
  });

  afterAll(async () => {
    await svc?.onApplicationShutdown();
    settings['db.cdc_mode'] = 'off';
    await svc?.tick().catch(() => undefined);
    await redis?.quit().catch(() => undefined);
    await pg?.end().catch(() => undefined);
    delete process.env.CACHE_CDC_DATABASE_URL;
  });

  const streaming = async () => {
    await until('stream up', async () => {
      const s = await svc.tick();
      return s?.dbs[0]?.state === 'streaming';
    });
  };

  it('the migration published every mapped table with a usable identity', async () => {
    const r = await pg.query<{ tablename: string }>(
      `SELECT tablename FROM pg_publication_tables
        WHERE pubname = 'lawbid_cache_cdc' ORDER BY tablename`,
    );
    expect(r.rows.map((x) => x.tablename)).toEqual([...CDC_TABLES]);
    const full = await pg.query<{ relname: string }>(
      `SELECT relname FROM pg_class WHERE relreplident = 'f'
        AND relname = ANY($1) ORDER BY relname`,
      [Object.keys(TABLES)],
    );
    expect(full.rows.map((x) => x.relname)).toEqual([
      'assistant_memberships',
      'contract_grants',
      'subscriptions',
      'user_consents',
      'user_strikes',
    ]);
  });

  it('Вкл: creates the slot and streams', async () => {
    await streaming();
    const slot = await pg.query(
      'SELECT active, plugin FROM pg_replication_slots WHERE slot_name = $1',
      [CDC_SLOT],
    );
    expect(slot.rows[0]).toMatchObject({ active: true, plugin: 'pgoutput' });
  });

  it('an UPDATE made in plain SQL drops the cached user card', async () => {
    await pg.query(`INSERT INTO users (id, name) VALUES ($1, 'A')`, [U1]);
    const key = `lawbid:user-card:v1:${U1}`;
    await redis.set(key, '{"name":"A"}', 'EX', 300);
    await pg.query(`UPDATE users SET name = 'B' WHERE id = $1`, [U1]);
    await until('card dropped', async () => (await redis.exists(key)) === 0);
  });

  it('a DELETE drops both block sets and bumps both feeds', async () => {
    await pg.query('INSERT INTO user_blocks VALUES ($1, $2)', [U1, U2]);
    await until(
      'insert seen',
      async () => (await redis.exists(feedVersionKey(U1))) === 1,
    );
    await redis.set(`blocks:${U1}`, '[]', 'EX', 300);
    await redis.set(`blocks:${U2}`, '[]', 'EX', 300);
    await redis.del(feedVersionKey(U1), feedVersionKey(U2));
    await pg.query('DELETE FROM user_blocks WHERE blocker_id = $1', [U1]);
    await until(
      'blocks dropped',
      async () =>
        (await redis.exists(`blocks:${U1}`, `blocks:${U2}`)) === 0 &&
        (await redis.exists(feedVersionKey(U1), feedVersionKey(U2))) === 2,
    );
  });

  it('a DELETE of a REPLICA IDENTITY FULL table knows whose cache it was', async () => {
    const sub = '00000000-0000-4000-8000-0000000000aa';
    await pg.query(
      `INSERT INTO subscriptions (id, user_id, status) VALUES ($1, $2, 'active')`,
      [sub, U3],
    );
    await sleep(300);
    await redis.set(`sub:active:${U3}`, '1', 'EX', 300);
    await redis.set(`ent:0:${U3}`, '{}', 'EX', 300);
    await pg.query('DELETE FROM subscriptions WHERE id = $1', [sub]);
    await until(
      'subscription caches dropped',
      async () => (await redis.exists(`sub:active:${U3}`, `ent:0:${U3}`)) === 0,
    );
  });

  it('a change of a table outside the publication is not read', async () => {
    await pg.query('CREATE TABLE IF NOT EXISTS cdc_other (id int PRIMARY KEY)');
    await pg.query('INSERT INTO cdc_other VALUES (1) ON CONFLICT DO NOTHING');
    const s = (await svc.tick()) as CdcStatus;
    expect(s.dbs[0].state).toBe('streaming');
    expect(s.dbs[0].applied).toBeGreaterThan(0);
  });

  it('the slot guard drops a slot that keeps too much WAL and starts again', async () => {
    // Force a backlog: stop the stream, write, then set a tiny ceiling.
    await svc.onApplicationShutdown();
    for (let i = 0; i < 50; i++) {
      await pg.query(`UPDATE users SET name = $2 WHERE id = $1`, [U1, `n${i}`]);
    }
    settings['db.cdc_max_slot_wal_mb'] = 0.001; // ~1 KB
    const s = (await svc.tick()) as CdcStatus;
    expect(s.dbs[0].slotDrops).toBe(1);
    expect(warns).toContainEqual(
      expect.objectContaining({ alert: 'cache_cdc_slot_dropped' }),
    );
    settings['db.cdc_max_slot_wal_mb'] = 2048;
    await streaming();
    // The new slot streams: a change after it is applied again.
    const key = `lawbid:user-card:v1:${U1}`;
    await redis.set(key, '{}', 'EX', 300);
    await pg.query(`UPDATE users SET name = 'C' WHERE id = $1`, [U1]);
    await until(
      'card dropped after re-create',
      async () => (await redis.exists(key)) === 0,
    );
  });

  it('Выкл: stops and removes the slot (no WAL kept for nobody)', async () => {
    settings['db.cdc_mode'] = 'off';
    await svc.tick();
    await until('slot removed', async () => {
      await svc.tick();
      const r = await pg.query(
        'SELECT 1 FROM pg_replication_slots WHERE slot_name = $1',
        [CDC_SLOT],
      );
      return r.rowCount === 0;
    });
    const key = `lawbid:user-card:v1:${U1}`;
    await redis.set(key, '{}', 'EX', 300);
    await pg.query(`UPDATE users SET name = 'D' WHERE id = $1`, [U1]);
    await sleep(1500);
    expect(await redis.exists(key)).toBe(1);
  });
});

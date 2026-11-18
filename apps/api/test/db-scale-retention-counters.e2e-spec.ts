import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import {
  CounterAggregator,
  batchesKey,
  touchedKey,
} from '../src/modules/counters/counter-aggregator.service';
import { DataRetentionService } from '../src/modules/storage/data-retention.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { shardContext } from '../src/sharding/shard-context';
import { twoDbMode } from './support/e2e-two-db';

/**
 * DB scale findings batch B (retention) and C (counters), on a real
 * PostgreSQL + Redis:
 *  B  an expired month of post_view_events is dropped as one partition
 *     (lawbid_drop_expired_month_partition), its views kept in
 *     posts.view_count_base; months with a held viewer, unfinished online
 *     conversions and recent cut-offs are refused; the grants keep auth_events
 *     away from the application role.
 *  C  the nightly recount keeps the views whose events retention removed;
 *     a recount racing a retention commit counts nothing twice; a delta a
 *     flusher had already drained is not counted again by the recount; a
 *     batch drained by a flush that died (before or after its commit) lands
 *     exactly once, also for the recount-less counters (channel,
 *     channel_post).
 */
jest.setTimeout(120_000);

const DAY_MS = 24 * 3600 * 1000;
const logger = () =>
  ({
    setContext: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  }) as unknown as PinoLogger;

async function until(
  what: string,
  check: () => Promise<boolean>,
  ms = 15_000,
): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

describe('DB scale batch B + C (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let counters: CounterAggregator;
  let pg: Client;
  let watch: Client;

  /** The database the posts and their view events live on: the second one
   * when E2E_TWO_DB=all puts every shard there (the raw sessions below must
   * see and lock the same rows the app does). */
  const rowsDbUrl = (): string => {
    if (twoDbMode() !== 'all') return process.env.DATABASE_URL!;
    const shards = JSON.parse(process.env.DATABASE_URL_SHARDS ?? '{}') as {
      db1?: string;
    };
    return shards.db1 ?? process.env.DATABASE_URL!;
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(REDIS_CLIENT);
    counters = app.get(CounterAggregator);
    // The app's own 10-second flusher must not take the deltas these tests
    // drive by hand (it stops its timers and flushes once).
    await counters.onModuleDestroy();
    pg = new Client({ connectionString: rowsDbUrl() });
    await pg.connect();
    // pg_stat_activity is a per-transaction snapshot: waits are watched
    // from a connection of their own.
    watch = new Client({ connectionString: rowsDbUrl() });
    await watch.connect();
  });

  afterAll(async () => {
    await pg?.end();
    await watch?.end();
    await app?.close();
  });

  async function postWithViews(oldViews: number, freshViews: number) {
    const author = await prisma.user.create({ data: { role: 'attorney' } });
    const post = await prisma.post.create({
      data: { author_id: author.id, body: 'views keep' },
    });
    const old = new Date(Date.now() - 800 * DAY_MS);
    // Raw SQL names no shard: run it in the author's (the post's) database,
    // as the app's own view writer does.
    await shardContext.runForUser(author.id, async () => {
      for (let i = 0; i < oldViews; i++) {
        await prisma.$executeRaw`INSERT INTO post_view_events (post_id, kind, created_at)
          VALUES (${post.id}::UUID, 'view', ${old})`;
      }
      // An impression is no view: never counted, never added to the base.
      await prisma.$executeRaw`INSERT INTO post_view_events (post_id, kind, created_at)
        VALUES (${post.id}::UUID, 'impression', ${old})`;
      for (let i = 0; i < freshViews; i++) {
        await prisma.$executeRaw`INSERT INTO post_view_events (post_id, kind)
          VALUES (${post.id}::UUID, 'view')`;
      }
    });
    await prisma.post.update({
      where: { id: post.id },
      data: { view_count: oldViews + freshViews },
    });
    return post.id;
  }

  const views = async (id: string) =>
    prisma.post.findUniqueOrThrow({
      where: { id },
      select: { view_count: true, view_count_base: true },
    });

  // ----------------------------------------------------------------- C ---

  it('C: retention removes old view events, the recount keeps their views', async () => {
    const id = await postWithViews(3, 2);
    const r = await app.get(DataRetentionService).run();
    expect(r!.postViewEvents).toBeGreaterThanOrEqual(4);
    expect(await views(id)).toEqual({ view_count: 5, view_count_base: 3 });
    await redis.sadd(touchedKey('post'), id);
    await counters.reconcile();
    expect(await views(id)).toEqual({ view_count: 5, view_count_base: 3 });
  });

  it('C: a recount waiting on a retention commit counts the moved views once', async () => {
    const id = await postWithViews(3, 2);
    // Retention in another session: events out, base in; not committed yet.
    await pg.query('BEGIN');
    await pg.query(
      `WITH d AS (DELETE FROM post_view_events
                   WHERE post_id = $1 AND created_at < now() - interval '730 days'
                   RETURNING kind)
       UPDATE posts SET view_count_base = view_count_base +
              (SELECT count(*) FROM d WHERE kind = 'view') WHERE id = $1`,
      [id],
    );
    await redis.sadd(touchedKey('post'), id);
    const recount = counters.reconcile();
    // The recount took its snapshot and waits for the post row.
    await until('the recount waits for the row lock', async () => {
      const r = await watch.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE '%UPDATE posts AS p SET%'`,
      );
      return (r.rows[0] as { n: number }).n > 0;
    });
    await pg.query('COMMIT');
    await recount;
    expect(await views(id)).toEqual({ view_count: 5, view_count_base: 3 });
  });

  it('C: a delta a flusher already drained is not counted again by the recount', async () => {
    const author = await prisma.user.create({ data: { role: 'attorney' } });
    const post = await prisma.post.create({
      data: { author_id: author.id, body: 'likes' },
    });
    const likers = await Promise.all(
      [1, 2, 3].map(() => prisma.user.create({ data: { role: 'client' } })),
    );
    for (const l of likers) {
      await prisma.postLike.create({
        data: { post_id: post.id, user_id: l.id },
      });
    }
    await prisma.post.update({
      where: { id: post.id },
      data: { like_count: 2 },
    });
    // The third like's delta is drained by a flush whose UPDATE is held up.
    await counters.bump('post', post.id, 'like_count', 1);
    await counters.flushLocal();
    await pg.query('BEGIN');
    await pg.query('LOCK TABLE counter_flush_batches IN EXCLUSIVE MODE');
    const flush = counters.flush();
    await until('the flush waits on its batch key', async () => {
      const r = await watch.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE '%counter_flush_batches%'`,
      );
      return (r.rows[0] as { n: number }).n > 0;
    });
    await redis.sadd(touchedKey('post'), post.id);
    const recount = counters.reconcile();
    await new Promise((r) => setTimeout(r, 1500));
    await pg.query('COMMIT');
    await Promise.all([flush, recount]);
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
    });
    expect(row.like_count).toBe(3);
  });

  async function channelWithPost() {
    const owner = await prisma.user.create({ data: { role: 'attorney' } });
    const tag = owner.id.replace(/-/g, '').slice(0, 20);
    const channel = await prisma.channel.create({
      data: { owner_id: owner.id, title: 'c', username: `c_${tag}` },
    });
    const cp = await prisma.channelPost.create({
      data: { channel_id: channel.id, author_id: owner.id, body: 'x' },
    });
    return { channelId: channel.id, postId: cp.id };
  }

  /** A second aggregator ("pod") whose database writes never return:
   * 'before' = killed before its UPDATE committed, 'after' = killed right
   * after the commit, before it cleaned up in Redis. */
  function dyingPod(mode: 'before' | 'after') {
    const db = new Proxy(prisma, {
      get(target, key, receiver) {
        if (key === '$executeRaw') {
          return async (...a: unknown[]) => {
            if (mode === 'after') {
              await (
                target.$executeRaw as unknown as (
                  ...x: unknown[]
                ) => Promise<number>
              )(...a);
            }
            return new Promise<number>(() => undefined);
          };
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    return new CounterAggregator(db, redis, logger());
  }

  it('C: a batch drained by a flush killed before its commit lands once (recount:false counters)', async () => {
    const { channelId, postId } = await channelWithPost();
    const pod = dyingPod('before');
    await pod.bump('channel', channelId, 'post_count', 1);
    await pod.bump('channel_post', postId, 'view_count', 1);
    await pod.flushLocal();
    void pod.flush({ waitForRunning: false });
    await until(
      'the dying flush holds a drained batch',
      async () => (await redis.zcard(batchesKey('channel'))) > 0,
    );
    // The pod is gone: its lock runs out (TTL) and another pod flushes.
    await redis.del('lock:job:counters.flush');
    const next = new CounterAggregator(prisma, redis, logger());
    await next.flush();
    const ch = await prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
    });
    const cp = await prisma.channelPost.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(ch.post_count).toBe(1);
    expect(cp.view_count).toBe(1);
    expect(await redis.zcard(batchesKey('channel'))).toBe(0);
  });

  it('C: a batch whose commit landed before the kill is not applied twice', async () => {
    const { postId } = await channelWithPost();
    const pod = dyingPod('after');
    await pod.bump('channel_post', postId, 'view_count', 1);
    await pod.flushLocal();
    void pod.flush({ waitForRunning: false });
    await until(
      'the dying flush committed',
      async () =>
        (
          await prisma.channelPost.findUniqueOrThrow({
            where: { id: postId },
          })
        ).view_count === 1,
    );
    expect(await redis.zcard(batchesKey('channel_post'))).toBe(1);
    await redis.del('lock:job:counters.flush');
    await new CounterAggregator(prisma, redis, logger()).flush();
    const cp = await prisma.channelPost.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(cp.view_count).toBe(1);
    expect(await redis.zcard(batchesKey('channel_post'))).toBe(0);
  });

  // ----------------------------------------------------------------- B ---

  /** post_view_events as a monthly partitioned table INSIDE a transaction
   * that the test rolls back (the shared e2e schema stays as it is). */
  async function partitioned(): Promise<void> {
    await pg.query('BEGIN');
    await pg.query('ALTER TABLE post_view_events RENAME TO pve_plain');
    await pg.query(`CREATE TABLE post_view_events (
      id uuid NOT NULL DEFAULT gen_random_uuid(), post_id uuid NOT NULL,
      viewer_id uuid, kind varchar(16) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      shard_id smallint NOT NULL DEFAULT 0, PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at)`);
    for (const [name, from, to] of [
      ['post_view_events_p2024_01', '2024-01-01', '2024-02-01'],
      ['post_view_events_p2024_02', '2024-02-01', '2024-03-01'],
      ['post_view_events_p2024_03', '2024-03-01', '2024-04-01'],
    ]) {
      await pg.query(
        `CREATE TABLE ${name} PARTITION OF post_view_events
           FOR VALUES FROM ('${from} 00:00:00+00') TO ('${to} 00:00:00+00')`,
      );
    }
    await pg.query(
      'CREATE TABLE post_view_events_default PARTITION OF post_view_events DEFAULT',
    );
  }

  const drop = async (before: string, held: string[] = []) =>
    (
      await pg.query(
        'SELECT lawbid_drop_expired_post_view_events_month($1::timestamptz, $2::uuid[], 2000) AS name',
        [before, held],
      )
    ).rows[0] as { name: string | null };

  it('B: drops only whole expired months, one per call, views go to the base', async () => {
    const author = await prisma.user.create({ data: { role: 'attorney' } });
    const post = await prisma.post.create({
      data: { author_id: author.id, body: 'months' },
    });
    await partitioned();
    try {
      for (const [at, kind] of [
        ['2024-01-10', 'view'],
        ['2024-01-20', 'view'],
        ['2024-01-21', 'impression'],
        ['2024-02-05', 'view'],
        ['2024-03-31', 'view'],
        ['2023-12-01', 'view'], // the DEFAULT partition is never dropped
      ]) {
        await pg.query(
          `INSERT INTO post_view_events (post_id, kind, created_at) VALUES ($1, $2, $3)`,
          [post.id, kind, `${at} 12:00:00+00`],
        );
      }
      // Cut-off inside March: January and February are wholly older.
      expect(await drop('2024-03-15 00:00:00+00')).toEqual({
        name: 'post_view_events_p2024_01',
      });
      expect(await drop('2024-03-15 00:00:00+00')).toEqual({
        name: 'post_view_events_p2024_02',
      });
      expect(await drop('2024-03-15 00:00:00+00')).toEqual({ name: null });
      const left = await pg.query(
        `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
          WHERE i.inhparent = 'post_view_events'::regclass ORDER BY 1`,
      );
      expect(left.rows.map((r: { relname: string }) => r.relname)).toEqual([
        'post_view_events_default',
        'post_view_events_p2024_03',
      ]);
      const base = await pg.query(
        'SELECT view_count_base FROM posts WHERE id = $1',
        [post.id],
      );
      expect(base.rows[0]).toEqual({ view_count_base: 3 });
    } finally {
      await pg.query('ROLLBACK');
    }
  });

  it('B: a month with a held viewer stays; a recent cut-off and an unfinished conversion are refused', async () => {
    const author = await prisma.user.create({ data: { role: 'attorney' } });
    const viewer = await prisma.user.create({ data: { role: 'client' } });
    const post = await prisma.post.create({
      data: { author_id: author.id, body: 'held' },
    });
    // Not partitioned: nothing to drop.
    expect(await drop('2024-03-15 00:00:00+00')).toEqual({ name: null });
    await partitioned();
    try {
      await pg.query(
        `INSERT INTO post_view_events (post_id, viewer_id, kind, created_at)
           VALUES ($1, $2, 'view', '2024-01-10 12:00:00+00')`,
        [post.id, viewer.id],
      );
      // January has the held person's row: February goes first, January stays.
      expect(await drop('2024-03-15 00:00:00+00', [viewer.id])).toEqual({
        name: 'post_view_events_p2024_02',
      });
      expect(await drop('2024-03-15 00:00:00+00', [viewer.id])).toEqual({
        name: null,
      });
      await pg.query('SAVEPOINT s');
      await expect(drop(new Date().toISOString())).rejects.toThrow(
        /must be at least a day ago/,
      );
      await pg.query('ROLLBACK TO SAVEPOINT s');
      await pg.query(`CREATE TABLE IF NOT EXISTS public._partition_job (
        tbl text PRIMARY KEY, phase text NOT NULL)`);
      await pg.query(
        `INSERT INTO public._partition_job (tbl, phase) VALUES ('post_view_events', 'swapped')
           ON CONFLICT (tbl) DO UPDATE SET phase = 'swapped'`,
      );
      expect(await drop('2024-03-15 00:00:00+00')).toEqual({ name: null });
    } finally {
      await pg.query('ROLLBACK');
    }
  });

  it('B: the application role may drop post view months, never auth_events months', async () => {
    const r = await pg.query(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_app') AS app,
              EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_retention') AS ret`,
    );
    const { app: hasApp, ret: hasRet } = r.rows[0] as {
      app: boolean;
      ret: boolean;
    };
    if (!hasApp) return; // a database without the roles (local dev)
    const can = async (role: string, fn: string) =>
      (
        (
          await pg.query(
            `SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`,
            [role, fn],
          )
        ).rows[0] as { ok: boolean }
      ).ok;
    const pve =
      'lawbid_drop_expired_post_view_events_month(timestamptz, uuid[], integer)';
    const auth =
      'lawbid_drop_expired_auth_events_month(timestamptz, uuid[], integer)';
    const inner =
      'lawbid_drop_expired_month_partition(text, timestamptz, uuid[], integer)';
    expect(await can('lawbid_app', pve)).toBe(true);
    expect(await can('lawbid_app', auth)).toBe(false);
    expect(await can('lawbid_app', inner)).toBe(false);
    if (hasRet) expect(await can('lawbid_retention', auth)).toBe(true);
  });
});

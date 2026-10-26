import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { withJobLock } from '../../jobs/handlers/job-lock';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';
import { readsAreSplit } from '../../sharding/split-reads';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ck } from '../../redis/redis-cluster-safe';

/**
 * docs/02 §1.5 / docs/05 §4–§6 (stage 5.1): hot counters are not updated
 * row-by-row on every like. A change bumps a Redis pending delta; a
 * flusher applies all pending deltas every few seconds in one multi-row
 * UPDATE per counter; reads show DB value + pending delta. A nightly
 * reconcile recomputes the rows touched that day from the source tables.
 */
export const COUNTERS = {
  post: {
    table: 'posts',
    key: 'id',
    fields: [
      'like_count',
      'comment_count',
      'save_count',
      'share_count',
      'view_count',
    ],
  },
  comment: {
    table: 'comments',
    key: 'id',
    fields: ['like_count', 'reply_count'],
  },
  // Owner 2026-09-30 (OQ-034): comments under cases.
  case: {
    table: 'cases',
    key: 'id',
    fields: ['comment_count', 'share_count'],
  },
  case_comment: {
    table: 'case_comments',
    key: 'id',
    fields: ['like_count', 'reply_count'],
  },
  // Owner 2026-10-25 (DB audit finding 8): hot rows that every viewer
  // touched with its own UPDATE. A story's views are recounted from
  // story_views; the others have several direct writers or no source table
  // to recount from, so the nightly job leaves them alone (`recount: false`).
  story: {
    table: 'stories',
    key: 'id',
    fields: ['view_count'],
  },
  case_promotion: {
    table: 'case_promotions',
    key: 'id',
    fields: ['impressions', 'reach', 'clicks'],
    recount: false,
  },
  channel: {
    table: 'channels',
    key: 'id',
    fields: ['post_count'],
    recount: false,
  },
  attorney: {
    table: 'attorney_profiles',
    key: 'user_id',
    fields: ['posts_count', 'followers_count', 'following_count'],
  },
  // OQ-038: clients post and are followed too.
  client: {
    table: 'client_profiles',
    key: 'user_id',
    fields: ['posts_count', 'followers_count', 'following_count'],
  },
} as const;

const GLOBAL_COUNTER_TABLES: ReadonlySet<string> = new Set([
  'attorney_profiles',
  'client_profiles',
  'case_promotions',
]);

/** Entities whose nightly reconcile recounts from source tables. */
function hasRecount(entity: CounterEntity): boolean {
  return (COUNTERS[entity] as { recount?: boolean }).recount !== false;
}

export type CounterEntity = keyof typeof COUNTERS;

/** OQ-038: the profile counter entity of a user by role. */
export function profileEntity(
  role: string | null | undefined,
): 'attorney' | 'client' {
  return role === 'client' ? 'client' : 'attorney';
}
export type CounterField<E extends CounterEntity> =
  (typeof COUNTERS)[E]['fields'][number];

/** S6-6: one hash per field was ONE hot Redis key for every row (a viral
 * post = tens of thousands of HINCRBY/s on one core). The pending hash is
 * split into 16 by the id: the last hex digit of the UUID (id % 16). */
export const COUNTER_SHARDS = 16;
export function counterShard(id: string): number {
  const d = Number.parseInt(id.slice(-1), 16);
  if (!Number.isNaN(d)) return d;
  let h = 0; // not a UUID: any stable spread will do
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % COUNTER_SHARDS;
}
/** Pre-S6-6 key (all ids in one hash): still drained by every flush so a
 * deploy loses no pending delta. */
export const legacyKey = (e: string, f: string) => ck(e, `cnt:${e}:${f}`);
export const pendingKey = (e: string, f: string, shard: number) =>
  ck(e, `cnt:${e}:${f}:${shard}`);
export const touchedKey = (e: string) => ck(e, `cnt:touched:${e}`);
const TOUCHED_TTL_SEC = 2 * 24 * 3600;
export const COUNTER_FLUSH_MS = 10_000;
/** Per-process aggregation window before the deltas go to Redis. */
export const COUNTER_LOCAL_MS = 1_000;
const BATCH = 500;

/** Atomic HMGET + HDEL of a batch of pending fields. */
const DRAIN = `
local vals = redis.call('HMGET', KEYS[1], unpack(ARGV))
redis.call('HDEL', KEYS[1], unpack(ARGV))
return vals`;

/** Pending bumps of one hash shard + "touched today" marks in one call:
 * ARGV = ttl, then id, delta, id, delta ... */
const BUMP_MANY = `
for i = 2, #ARGV, 2 do
  redis.call('HINCRBY', KEYS[1], ARGV[i], ARGV[i + 1])
  redis.call('SADD', KEYS[2], ARGV[i])
end
redis.call('EXPIRE', KEYS[2], ARGV[1])
return 1`;

@Injectable()
export class CounterAggregator
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private localTimer?: ReturnType<typeof setInterval>;
  /** entity|field|id -> delta not yet sent to Redis (S6-6). */
  private local = new Map<string, number>();
  /** Deltas this process has taken out of `local` (on their way to Redis)
   * or out of Redis (on their way to the database) and not yet landed:
   * [pending] adds them, so a read in this process never sees a delta in
   * neither place (read-your-writes during a flush). */
  private inflight = new Map<string, number>();
  private moveInflight(k: string, delta: number): void {
    const v = (this.inflight.get(k) ?? 0) + delta;
    if (v === 0) this.inflight.delete(k);
    else this.inflight.set(k, v);
  }
  /** Set once a flush saw every legacy (unsharded) hash empty; reads then
   * skip the extra HMGET. Flush keeps draining the legacy hashes anyway. */
  private legacyDrained = false;
  private legacyFound = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CounterAggregator.name);
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      this.flush({ waitForRunning: false }).catch((error: unknown) =>
        this.logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          'counter flush failed',
        ),
      );
    }, COUNTER_FLUSH_MS);
    this.timer.unref?.();
    this.localTimer = setInterval(() => {
      this.flushLocal().catch((error: unknown) =>
        this.logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          'counter local flush failed',
        ),
      );
    }, COUNTER_LOCAL_MS);
    this.localTimer.unref?.();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.localTimer) clearInterval(this.localTimer);
    await this.flushLocal().catch(() => undefined);
  }

  /** Records +delta / -delta for one row. Call only after the source row
   * change actually happened (e.g. a like insert that affected a row).
   * S6-6: the delta is added to an in-process map and goes to Redis once a
   * second (COUNTER_LOCAL_MS), many bumps of one row becoming one HINCRBY;
   * a crash loses at most that second, the nightly reconcile repairs it. */
  bump<E extends CounterEntity>(
    entity: E,
    id: string,
    field: CounterField<E>,
    delta: number,
  ): Promise<void> {
    const k = `${entity}|${field}|${id}`;
    this.local.set(k, (this.local.get(k) ?? 0) + delta);
    return Promise.resolve();
  }

  /** Sends the in-process deltas to Redis: one EVAL per (entity, field,
   * hash shard), all in flight together (auto-pipelining). On a Redis error
   * the deltas of that group are merged back and retried next second. */
  async flushLocal(): Promise<void> {
    if (this.local.size === 0) return;
    const taken = this.local;
    this.local = new Map();
    for (const [k, d] of taken) this.moveInflight(k, d);
    const groups = new Map<
      string,
      {
        entity: string;
        field: string;
        shard: number;
        args: (string | number)[];
      }
    >();
    for (const [k, delta] of taken) {
      if (delta === 0) continue;
      const [entity, field, id] = k.split('|');
      const shard = counterShard(id);
      const gk = `${entity}|${field}|${shard}`;
      const g =
        groups.get(gk) ??
        groups.set(gk, { entity, field, shard, args: [] }).get(gk)!;
      g.args.push(id, delta);
    }
    await Promise.all(
      [...groups.values()].map(async (g) => {
        try {
          await this.redis.eval(
            BUMP_MANY,
            2,
            pendingKey(g.entity, g.field, g.shard),
            touchedKey(g.entity),
            TOUCHED_TTL_SEC,
            ...g.args,
          );
        } catch (error) {
          for (let i = 0; i < g.args.length; i += 2) {
            const k = `${g.entity}|${g.field}|${String(g.args[i])}`;
            this.local.set(k, (this.local.get(k) ?? 0) + Number(g.args[i + 1]));
          }
          throw error;
        } finally {
          for (let i = 0; i < g.args.length; i += 2) {
            const k = `${g.entity}|${g.field}|${String(g.args[i])}`;
            this.moveInflight(k, -Number(g.args[i + 1]));
          }
        }
      }),
    );
  }

  /** Pending (not yet flushed) deltas for [ids] — add to DB values on read:
   * Redis (the hash shard of each id) plus this process' own unsent deltas. */
  async pending<E extends CounterEntity>(
    entity: E,
    field: CounterField<E>,
    ids: string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const out = new Map<string, number>();
    const byShard = new Map<number, string[]>();
    for (const id of ids) {
      const sh = counterShard(id);
      (byShard.get(sh) ?? byShard.set(sh, []).get(sh)!).push(id);
    }
    const add = (id: string, v: number) => out.set(id, (out.get(id) ?? 0) + v);
    const reads: Promise<void>[] = [...byShard].map(async ([sh, part]) => {
      const vals = await this.redis.hmget(
        pendingKey(entity, field, sh),
        ...part,
      );
      part.forEach((id, i) => {
        const v = vals[i];
        if (v) add(id, Number(v));
      });
    });
    if (!this.legacyDrained) {
      reads.push(
        (async () => {
          const vals = await this.redis.hmget(legacyKey(entity, field), ...ids);
          ids.forEach((id, i) => {
            const v = vals[i];
            if (v) add(id, Number(v));
          });
        })(),
      );
    }
    await Promise.all(reads);
    for (const id of ids) {
      const l = this.local.get(`${entity}|${field}|${id}`);
      if (l) add(id, l);
      const f = this.inflight.get(`${entity}|${field}|${id}`);
      if (f) add(id, f);
    }
    for (const [id, v] of out) if (v === 0) out.delete(id);
    return out;
  }

  /** Applies all pending deltas; one flusher across pods. An explicit call
   * (the nightly job, tests) that finds another flush running waits for it
   * (up to one flush period) and then runs, so what was pending when it was
   * called has landed when it returns. The 10-second timer does not wait. */
  async flush(
    opts: { waitForRunning?: boolean } = {},
  ): Promise<{ rows: number }> {
    const first = await this.flushOnce();
    if (first !== null || opts.waitForRunning === false) {
      return { rows: first ?? 0 };
    }
    const until = Date.now() + COUNTER_FLUSH_MS;
    while (Date.now() < until) {
      if (!(await this.redis.exists('lock:job:counters.flush'))) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    return { rows: (await this.flushOnce()) ?? 0 };
  }

  private async flushOnce(): Promise<number | null> {
    await this.flushLocal();
    return withJobLock(
      this.redis,
      'counters.flush',
      COUNTER_FLUSH_MS,
      async () => {
        let rows = 0;
        this.legacyFound = 0;
        for (const [entity, def] of Object.entries(COUNTERS)) {
          for (const field of def.fields) {
            rows += await this.flushField(entity, def.table, def.key, field);
          }
        }
        if (this.legacyFound === 0) this.legacyDrained = true;
        return rows;
      },
    );
  }

  private async flushField(
    entity: string,
    table: string,
    key: string,
    field: string,
  ): Promise<number> {
    let applied = 0;
    for (let i = 0; i < COUNTER_SHARDS; i += 1) {
      applied += await this.flushHash(
        entity,
        pendingKey(entity, field, i),
        table,
        key,
        field,
      );
    }
    // The pre-S6-6 hash (all ids in one key): drained like any shard.
    const legacy = await this.flushHash(
      entity,
      legacyKey(entity, field),
      table,
      key,
      field,
    );
    this.legacyFound += legacy;
    return applied + legacy;
  }

  private async flushHash(
    entity: string,
    hash: string,
    table: string,
    key: string,
    field: string,
  ): Promise<number> {
    let applied = 0;
    let cursor = '0';
    do {
      const [next, flat] = await this.redis.hscan(hash, cursor, 'COUNT', BATCH);
      cursor = next;
      const ids = flat.filter((_, i) => i % 2 === 0);
      if (ids.length === 0) continue;
      const raw = (await this.redis.eval(DRAIN, 1, hash, ...ids)) as (
        string | null
      )[];
      const keep: string[] = [];
      const deltas: number[] = [];
      ids.forEach((id, i) => {
        const d = raw[i] ? Number(raw[i]) : 0;
        if (d !== 0) {
          keep.push(id);
          deltas.push(d);
        }
      });
      if (keep.length === 0) continue;
      // Between the drain and the commit the deltas are in neither Redis nor
      // the row: keep them visible to this process' reads.
      keep.forEach((id, i) =>
        this.moveInflight(`${entity}|${field}|${id}`, deltas[i]),
      );
      try {
        // Identifiers come from the COUNTERS constant, never from input.
        const update = () =>
          this.prisma.$executeRaw(Prisma.sql`
          UPDATE ${Prisma.raw(`"${table}"`)} AS t
          SET ${Prisma.raw(`"${field}"`)} = GREATEST(t.${Prisma.raw(`"${field}"`)} + v.delta, 0)
          FROM (
            SELECT unnest(${keep}::UUID[]) AS id, unnest(${deltas}::INT[]) AS delta
          ) AS v
          WHERE t.${Prisma.raw(`"${key}"`)} = v.id`);
        // Shard-ready step 8: posts / comments / cases live on the shard
        // databases and the id could be on any of them; the other databases
        // simply match no row. The profile tables are global.
        if (GLOBAL_COUNTER_TABLES.has(table) || !readsAreSplit(this.prisma)) {
          await update();
        } else {
          await forEachDatabase(this.prisma, update);
        }
        applied += keep.length;
      } catch (error) {
        // Put the deltas back; the next flush retries them.
        const restore = this.redis.multi();
        keep.forEach((id, i) => restore.hincrby(hash, id, deltas[i]));
        await restore.exec();
        throw error;
      } finally {
        keep.forEach((id, i) =>
          this.moveInflight(`${entity}|${field}|${id}`, -deltas[i]),
        );
      }
    } while (cursor !== '0');
    return applied;
  }

  /**
   * Nightly: rows touched in the last day are recomputed from the source
   * tables (likes, comments, saves, follows, posts). Pending deltas for a
   * row are dropped first — the recount is the truth.
   */
  async reconcile(): Promise<{ rows: number }> {
    await this.flushLocal();
    const result = await withJobLock(
      this.redis,
      'counters.reconcile',
      60 * 60 * 1000,
      async () => {
        let rows = 0;
        for (const entity of Object.keys(COUNTERS) as CounterEntity[]) {
          if (!hasRecount(entity)) continue;
          for (;;) {
            const ids = await this.redis.spop(touchedKey(entity), BATCH);
            if (!ids || ids.length === 0) break;
            for (const field of COUNTERS[entity].fields) {
              await this.dropPending(entity, field, ids);
            }
            await this.recount(entity, ids);
            rows += ids.length;
          }
        }
        return rows;
      },
    );
    return { rows: result ?? 0 };
  }

  /**
   * Owner 2026-10-26 (stale profile counters): the nightly reconcile above
   * only repairs rows touched in the last 2 days, so a profile whose
   * counter once drifted stayed wrong for good. This walks the profile
   * tables in id order (a cursor kept in Redis), [cap] rows per run per
   * table, recounts them from posts / follows and fixes the ones that
   * differ. A full lap takes ceil(rows / cap) nights; the cursor wraps.
   */
  async driftSweep(
    cap: number,
  ): Promise<{ scanned: number; fixed: number; wrapped: boolean }> {
    if (cap <= 0) return { scanned: 0, fixed: 0, wrapped: false };
    await this.flushLocal();
    let scanned = 0;
    let fixed = 0;
    let wrapped = false;
    for (const entity of ['attorney', 'client'] as const) {
      const table = Prisma.raw(COUNTERS[entity].table);
      const cursorKey = ck(entity, `cnt:drift-cursor:${entity}`);
      const cursor =
        (await this.redis.get(cursorKey)) ??
        '00000000-0000-0000-0000-000000000000';
      const before = await this.prisma.global().$queryRaw<
        {
          id: string;
          p: number;
          f: number;
          g: number;
        }[]
      >(Prisma.sql`SELECT user_id::TEXT AS id, posts_count AS p,
            followers_count AS f, following_count AS g
          FROM ${table} WHERE user_id > ${cursor}::UUID
          ORDER BY user_id LIMIT ${cap}`);
      if (before.length < cap) {
        wrapped = true;
        await this.redis.del(cursorKey);
      } else {
        await this.redis.set(cursorKey, before[before.length - 1].id);
      }
      if (before.length === 0) continue;
      const ids = before.map((r) => r.id);
      for (const field of COUNTERS[entity].fields) {
        await this.dropPending(entity, field, ids);
      }
      await this.recount(entity, ids);
      const after = await this.prisma.global().$queryRaw<
        { id: string; p: number; f: number; g: number }[]
      >(Prisma.sql`SELECT user_id::TEXT AS id, posts_count AS p,
            followers_count AS f, following_count AS g
          FROM ${table} WHERE user_id = ANY(${ids}::UUID[])`);
      const was = new Map(before.map((r) => [r.id, r]));
      for (const r of after) {
        const w = was.get(r.id);
        if (w && (w.p !== r.p || w.f !== r.f || w.g !== r.g)) fixed += 1;
      }
      scanned += ids.length;
    }
    return { scanned, fixed, wrapped };
  }

  /** Forgets the pending deltas of [ids] (the recount is the truth). */
  private async dropPending(
    entity: string,
    field: string,
    ids: string[],
  ): Promise<void> {
    const byShard = new Map<number, string[]>();
    for (const id of ids) {
      const sh = counterShard(id);
      (byShard.get(sh) ?? byShard.set(sh, []).get(sh)!).push(id);
    }
    await Promise.all([
      ...[...byShard].map(([sh, part]) =>
        this.redis.hdel(pendingKey(entity, field, sh), ...part),
      ),
      this.redis.hdel(legacyKey(entity, field), ...ids),
    ]);
  }

  /** Sum over every database of `rows`, keyed by the first column. */
  private async sumAcross(
    run: () => Promise<{ id: string; n: bigint | number }[]>,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const part of await forEachDatabase(this.prisma, run)) {
      for (const r of part) out.set(r.id, (out.get(r.id) ?? 0) + Number(r.n));
    }
    return out;
  }

  /**
   * recount() for several databases (shard-ready step 8). Counts that sit
   * on one family and one shard keep their statement on every database;
   * counts spread over shards (saves of a post, followers of a person, a
   * person's posts) are summed over all databases first and written with
   * the row.
   */
  private async recountSplit(
    entity: CounterEntity,
    ids: string[],
  ): Promise<void> {
    const arr = (m: Map<string, number>) => ids.map((id) => m.get(id) ?? 0);
    if (entity === 'post') {
      const saves = arr(
        await this.sumAcross(
          () =>
            this.prisma.$queryRaw`SELECT item_id::TEXT AS id, count(*) AS n
              FROM saved_items WHERE item_type = 'post'
                AND item_id = ANY(${ids}::UUID[]) GROUP BY item_id`,
        ),
      );
      await forEachDatabase(
        this.prisma,
        () => this.prisma.$executeRaw`
        UPDATE posts AS p SET
          like_count = (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id),
          comment_count = (SELECT count(*) FROM comments c
                           WHERE c.post_id = p.id AND c.deleted_at IS NULL
                             AND c.status = 'published'),
          save_count = COALESCE((SELECT s.n FROM unnest(${ids}::UUID[], ${saves}::INT[])
                                 AS s(id, n) WHERE s.id = p.id), 0),
          share_count = (SELECT count(*) FROM post_shares x WHERE x.post_id = p.id),
          view_count = (SELECT count(*) FROM post_view_events v
                        WHERE v.post_id = p.id AND v.kind = 'view')
        WHERE p.id = ANY(${ids}::UUID[])`,
      );
      return;
    }
    if (entity === 'client' || entity === 'attorney') {
      const posts = arr(
        await this.sumAcross(
          () =>
            this.prisma.$queryRaw`SELECT author_id::TEXT AS id, count(*) AS n
              FROM posts WHERE author_id = ANY(${ids}::UUID[])
                AND deleted_at IS NULL AND archived_at IS NULL
                AND status = 'published' GROUP BY author_id`,
        ),
      );
      const followers = arr(
        await this.sumAcross(
          () =>
            this.prisma.$queryRaw`SELECT followee_id::TEXT AS id, count(*) AS n
              FROM follows WHERE followee_id = ANY(${ids}::UUID[])
              GROUP BY followee_id`,
        ),
      );
      const following = arr(
        await this.sumAcross(
          () =>
            this.prisma.$queryRaw`SELECT follower_id::TEXT AS id, count(*) AS n
              FROM follows WHERE follower_id = ANY(${ids}::UUID[])
              GROUP BY follower_id`,
        ),
      );
      const table = Prisma.raw(
        entity === 'client' ? 'client_profiles' : 'attorney_profiles',
      );
      await this.prisma.global().$executeRaw(Prisma.sql`
        UPDATE ${table} AS a SET posts_count = v.p, followers_count = v.f,
                                 following_count = v.g
        FROM unnest(${ids}::UUID[], ${posts}::INT[], ${followers}::INT[],
                    ${following}::INT[]) AS v(id, p, f, g)
        WHERE a.user_id = v.id`);
      return;
    }
    // comment / case / case_comment / story: every source table sits with
    // the row.
    await forEachDatabase(this.prisma, () => this.recountLocal(entity, ids));
  }

  private async recount(entity: CounterEntity, ids: string[]): Promise<void> {
    if (readsAreSplit(this.prisma)) return this.recountSplit(entity, ids);
    return this.recountLocal(entity, ids);
  }

  private async recountLocal(
    entity: CounterEntity,
    ids: string[],
  ): Promise<void> {
    if (entity === 'post') {
      await this.prisma.$executeRaw`
        UPDATE posts AS p SET
          like_count = (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id),
          comment_count = (SELECT count(*) FROM comments c
                           WHERE c.post_id = p.id AND c.deleted_at IS NULL
                             AND c.status = 'published'),
          save_count = (SELECT count(*) FROM saved_items s
                        WHERE s.item_type = 'post' AND s.item_id = p.id),
          share_count = (SELECT count(*) FROM post_shares x WHERE x.post_id = p.id),
          -- Owner 2026-10-18: views once per viewer per 24 h (post_view_events).
          view_count = (SELECT count(*) FROM post_view_events v
                        WHERE v.post_id = p.id AND v.kind = 'view')
        WHERE p.id = ANY(${ids}::UUID[])`;
    } else if (entity === 'comment') {
      await this.prisma.$executeRaw`
        UPDATE comments AS c SET
          like_count = (SELECT count(*) FROM comment_likes l WHERE l.comment_id = c.id),
          reply_count = (SELECT count(*) FROM comments r
                         WHERE r.parent_comment_id = c.id AND r.deleted_at IS NULL
                           AND r.status = 'published')
        WHERE c.id = ANY(${ids}::UUID[])`;
    } else if (entity === 'case') {
      await this.prisma.$executeRaw`
        UPDATE cases AS k SET
          comment_count = (SELECT count(*) FROM case_comments c
                           WHERE c.case_id = k.id AND c.deleted_at IS NULL
                             AND c.status = 'published'),
          share_count = (SELECT count(*) FROM case_shares x WHERE x.case_id = k.id)
        WHERE k.id = ANY(${ids}::UUID[])`;
    } else if (entity === 'case_comment') {
      await this.prisma.$executeRaw`
        UPDATE case_comments AS c SET
          like_count = (SELECT count(*) FROM case_comment_likes l WHERE l.comment_id = c.id),
          reply_count = (SELECT count(*) FROM case_comments r
                         WHERE r.parent_comment_id = c.id AND r.deleted_at IS NULL
                           AND r.status = 'published')
        WHERE c.id = ANY(${ids}::UUID[])`;
    } else if (entity === 'story') {
      await this.prisma.$executeRaw`
        UPDATE stories AS s SET
          view_count = (SELECT count(*) FROM story_views v WHERE v.story_id = s.id)
        WHERE s.id = ANY(${ids}::UUID[])`;
    } else if (entity === 'client') {
      await this.prisma.$executeRaw`
        UPDATE client_profiles AS a SET
          posts_count = (SELECT count(*) FROM posts p
                         WHERE p.author_id = a.user_id AND p.deleted_at IS NULL
                           AND p.archived_at IS NULL
                           AND p.status = 'published'),
          followers_count = (SELECT count(*) FROM follows f WHERE f.followee_id = a.user_id),
          following_count = (SELECT count(*) FROM follows f WHERE f.follower_id = a.user_id)
        WHERE a.user_id = ANY(${ids}::UUID[])`;
    } else {
      await this.prisma.$executeRaw`
        UPDATE attorney_profiles AS a SET
          posts_count = (SELECT count(*) FROM posts p
                         WHERE p.author_id = a.user_id AND p.deleted_at IS NULL
                           AND p.archived_at IS NULL
                           AND p.status = 'published'),
          followers_count = (SELECT count(*) FROM follows f WHERE f.followee_id = a.user_id),
          following_count = (SELECT count(*) FROM follows f WHERE f.follower_id = a.user_id)
        WHERE a.user_id = ANY(${ids}::UUID[])`;
    }
  }
}

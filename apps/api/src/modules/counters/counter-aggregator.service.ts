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

const pendingKey = (e: string, f: string) => `cnt:${e}:${f}`;
const touchedKey = (e: string) => `cnt:touched:${e}`;
const TOUCHED_TTL_SEC = 2 * 24 * 3600;
export const COUNTER_FLUSH_MS = 10_000;
const BATCH = 500;

/** Atomic HMGET + HDEL of a batch of pending fields. */
const DRAIN = `
local vals = redis.call('HMGET', KEYS[1], unpack(ARGV))
redis.call('HDEL', KEYS[1], unpack(ARGV))
return vals`;

/** Pending bump + "touched today" mark in one call. */
const BUMP = `
redis.call('HINCRBY', KEYS[1], ARGV[1], ARGV[2])
redis.call('SADD', KEYS[2], ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 1`;

@Injectable()
export class CounterAggregator
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CounterAggregator.name);
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      this.flush().catch((error: unknown) =>
        this.logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          'counter flush failed',
        ),
      );
    }, COUNTER_FLUSH_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Records +delta / -delta for one row. Call only after the source row
   * change actually happened (e.g. a like insert that affected a row). */
  async bump<E extends CounterEntity>(
    entity: E,
    id: string,
    field: CounterField<E>,
    delta: number,
  ): Promise<void> {
    await this.redis.eval(
      BUMP,
      2,
      pendingKey(entity, field),
      touchedKey(entity),
      id,
      delta,
      TOUCHED_TTL_SEC,
    );
  }

  /** Pending (not yet flushed) deltas for [ids] — add to DB values on read. */
  async pending<E extends CounterEntity>(
    entity: E,
    field: CounterField<E>,
    ids: string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const vals = await this.redis.hmget(pendingKey(entity, field), ...ids);
    const out = new Map<string, number>();
    ids.forEach((id, i) => {
      const v = vals[i];
      if (v) out.set(id, Number(v));
    });
    return out;
  }

  /** Applies all pending deltas; one flusher across pods. */
  async flush(): Promise<{ rows: number }> {
    const result = await withJobLock(
      this.redis,
      'counters.flush',
      COUNTER_FLUSH_MS,
      async () => {
        let rows = 0;
        for (const [entity, def] of Object.entries(COUNTERS)) {
          for (const field of def.fields) {
            rows += await this.flushField(entity, def.table, def.key, field);
          }
        }
        return rows;
      },
    );
    return { rows: result ?? 0 };
  }

  private async flushField(
    entity: string,
    table: string,
    key: string,
    field: string,
  ): Promise<number> {
    const hash = pendingKey(entity, field);
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
              await this.redis.hdel(pendingKey(entity, field), ...ids);
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

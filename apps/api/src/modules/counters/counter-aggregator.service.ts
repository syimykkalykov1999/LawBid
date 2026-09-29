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
    fields: ['like_count', 'comment_count', 'save_count'],
  },
  comment: {
    table: 'comments',
    key: 'id',
    fields: ['like_count', 'reply_count'],
  },
  attorney: {
    table: 'attorney_profiles',
    key: 'user_id',
    fields: ['posts_count', 'followers_count', 'following_count'],
  },
} as const;

export type CounterEntity = keyof typeof COUNTERS;
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
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE ${Prisma.raw(`"${table}"`)} AS t
          SET ${Prisma.raw(`"${field}"`)} = GREATEST(t.${Prisma.raw(`"${field}"`)} + v.delta, 0)
          FROM (
            SELECT unnest(${keep}::UUID[]) AS id, unnest(${deltas}::INT[]) AS delta
          ) AS v
          WHERE t.${Prisma.raw(`"${key}"`)} = v.id`);
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

  private async recount(entity: CounterEntity, ids: string[]): Promise<void> {
    if (entity === 'post') {
      await this.prisma.$executeRaw`
        UPDATE posts AS p SET
          like_count = (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id),
          comment_count = (SELECT count(*) FROM comments c
                           WHERE c.post_id = p.id AND c.deleted_at IS NULL
                             AND c.status = 'published'),
          save_count = (SELECT count(*) FROM saved_items s
                        WHERE s.item_type = 'post' AND s.item_id = p.id)
        WHERE p.id = ANY(${ids}::UUID[])`;
    } else if (entity === 'comment') {
      await this.prisma.$executeRaw`
        UPDATE comments AS c SET
          like_count = (SELECT count(*) FROM comment_likes l WHERE l.comment_id = c.id),
          reply_count = (SELECT count(*) FROM comments r
                         WHERE r.parent_comment_id = c.id AND r.deleted_at IS NULL
                           AND r.status = 'published')
        WHERE c.id = ANY(${ids}::UUID[])`;
    } else {
      await this.prisma.$executeRaw`
        UPDATE attorney_profiles AS a SET
          posts_count = (SELECT count(*) FROM posts p
                         WHERE p.author_id = a.user_id AND p.deleted_at IS NULL
                           AND p.status = 'published'),
          followers_count = (SELECT count(*) FROM follows f WHERE f.followee_id = a.user_id),
          following_count = (SELECT count(*) FROM follows f WHERE f.follower_id = a.user_id)
        WHERE a.user_id = ANY(${ids}::UUID[])`;
    }
  }
}

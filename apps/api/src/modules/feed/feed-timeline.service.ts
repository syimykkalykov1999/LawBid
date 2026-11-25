import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import type { Post, Prisma } from '../../generated/prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { readSwitchMode } from '../../common/app-settings/switch-mode';
import { demoContext } from '../../common/demo/demo-context';
import { createdBefore } from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { POST_FANOUT_QUEUE } from '../notifications/post-fanout.service';
import { bullOptions } from '../../redis/redis-connection';
import { ck } from '../../redis/redis-cluster-safe';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from '../../redis/redis.constants';
import { readsAreSplit } from '../../sharding/split-reads';
import { shardCarry } from '../../sharding/shard-context';

/**
 * Item 23 (F1, 25.11): the hybrid home timeline of Twitter "Timelines at
 * Scale" (2013) and Instagram feed infra — fan-out on WRITE for ordinary
 * authors, fan-out on READ for authors with many followers.
 *
 * - Each reader has a timeline in Valkey (cache client): a ZSET of
 *   `postId:authorId` scored by created_at (ms), at most
 *   `feed.fanout_timeline_len` entries, kept `feed.fanout_timeline_days`
 *   after the last read. Twitter keeps the same shape (tweet id + user id,
 *   800 entries, only for active users).
 * - A new post of an author with fewer than `feed.fanout_max_followers`
 *   followers is written into the warm timelines of the followers by the
 *   `post-fanout` queue (job `timeline`). Authors at or above the number are
 *   kept in a sticky set and read from the database at open time, merged
 *   into the same page.
 * - The timeline only chooses WHICH posts to read: the page is still one
 *   database query with the feed's own visibility rule, content mode and
 *   keyset cursor, so deletion, hiding, privacy, suspension and edits are
 *   checked on every read exactly as before. A page is served from the
 *   timeline only when it is provably the same as the old read: every
 *   followed author is covered, and the candidates reach past the last row
 *   of the page; otherwise the caller runs the old read (cold timeline, a
 *   new follow, a page older than the timeline, a cache error).
 */

/** Job name inside the `post-fanout` queue. */
export const TIMELINE_JOB = 'timeline';

export interface TimelineFanoutJob {
  postId: string;
  authorId: string;
  /** created_at of the post in ms (the timeline score). */
  score: number;
  /** Last follower id of the previous batch (null: start). */
  after: string | null;
  demo?: boolean;
  shardKey?: string;
}

/** The viewer's own posts are "covered" with this follow token. */
const SELF_TOKEN = 'self';
/** Followers written per batch job. */
const FANOUT_BATCH = 1000;
/** Parallel Valkey calls of one batch. */
const WRITE_PARALLEL = 100;
/** A post still waiting for its fan-out after this long is given up on:
 * every timeline is rebuilt (the fan-out may have been lost). */
const PENDING_MAX_MS = 24 * 3600_000;
/** One background build per reader at a time. */
const BUILD_LOCK_SEC = 30;
/** The sentinel member: a timeline without it was evicted (cache node). */
const SENTINEL = '_';

const userTag = (uid: string) => `tl:${uid}`;
export const timelineKey = (uid: string) => ck(userTag(uid), `feed:tl:${uid}`);
export const timelineMetaKey = (uid: string) =>
  ck(userTag(uid), `feed:tlm:${uid}`);
const buildLockKey = (uid: string) => `feed:tlb:${uid}`;
/** Main Redis (not evicted): epoch {id, n}, sticky read-at-open authors,
 * posts whose fan-out has not finished. One {feedfo} slot. */
export const FANOUT_EPOCH_KEY = ck('feedfo', 'feed:fo:epoch');
export const FANOUT_SKIP_KEY = ck('feedfo', 'feed:fo:skip');
export const FANOUT_PENDING_KEY = ck('feedfo', 'feed:fo:pending');

/**
 * KEYS[1] timeline, KEYS[2] meta (one {tl:uid} slot).
 * ARGV[1] max entries, ARGV[2] '1' = only when the meta exists (fan-out),
 * ARGV[3] raise the floor to at least this (0 = no), ARGV[4..] score,
 * member pairs. Trims the oldest entries over the max (never the sentinel
 * at rank 0) and raises the floor above the newest removed one, so "every
 * post of a covered author with a score >= floor is here" stays true.
 */
const WRITE_LUA = `
if ARGV[2] == '1' and redis.call('EXISTS', KEYS[2]) == 0 then return -1 end
for i = 4, #ARGV, 2 do redis.call('ZADD', KEYS[1], ARGV[i], ARGV[i + 1]) end
local floor = tonumber(redis.call('HGET', KEYS[2], '_f') or '0')
local raise = tonumber(ARGV[3])
local max = tonumber(ARGV[1]) + 1
local n = redis.call('ZCARD', KEYS[1])
if n > max then
  local cut = n - max
  local top = redis.call('ZRANGE', KEYS[1], cut, cut, 'WITHSCORES')
  redis.call('ZREMRANGEBYRANK', KEYS[1], 1, cut)
  local f = tonumber(top[2]) + 1
  if f > raise then raise = f end
end
if raise > floor then redis.call('HSET', KEYS[2], '_f', string.format('%d', raise)) end
return n
`;

/** KEYS[1] timeline, KEYS[2] meta. ARGV[1] epoch id, ARGV[2] ttl sec.
 * A fresh, empty, complete timeline of this epoch. */
const RESET_LUA = `
redis.call('DEL', KEYS[1], KEYS[2])
redis.call('ZADD', KEYS[1], 0, '${SENTINEL}')
redis.call('HSET', KEYS[2], '_e', ARGV[1], '_f', '0')
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1
`;

/** KEYS[1] epoch hash, KEYS[2] skip set ({feedfo} slot). ARGV[1] new id,
 * ARGV[2] N. A new epoch forgets the sticky authors (N changed, or the
 * fan-out was off / lost): every timeline of the old epoch is rebuilt. */
const EPOCH_LUA = `
local cur = redis.call('HMGET', KEYS[1], 'id', 'n')
if cur[1] and cur[2] == ARGV[2] then return cur[1] end
redis.call('DEL', KEYS[2])
redis.call('HSET', KEYS[1], 'id', ARGV[1], 'n', ARGV[2])
return ARGV[1]
`;

export interface TimelineSettings {
  active: boolean;
  maxFollowers: number;
  length: number;
  ttlSec: number;
}

export interface FollowedQuery {
  viewerId: string;
  /** followee id → follow created_at (ms); the viewer → SELF_TOKEN. */
  tokens: Map<string, string>;
  /** Authors whose posts may be shown (the feed's author rule). */
  shown: string[];
  /** The feed's post rule + content mode. */
  where: Prisma.PostWhereInput;
  after: { t: string; id: string } | null;
  /** Rows wanted (the page limit + 1). */
  take: number;
}

export const followToken = (createdAt: Date) => String(createdAt.getTime());
export const selfToken = () => SELF_TOKEN;

@Injectable()
export class FeedTimelineService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly log = new Logger(FeedTimelineService.name);
  private queue?: Queue<TimelineFanoutJob>;
  private readonly cache: Redis;
  /** Background builds of this process (tests wait for them). */
  private readonly builds = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() @Inject(REDIS_CACHE_CLIENT) cache?: Redis,
  ) {
    this.cache = cache ?? redis;
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    // The same queue as the follower alerts (post-fanout): its worker,
    // tuning, metrics and alarms already exist.
    if (url) {
      this.queue = new Queue(
        POST_FANOUT_QUEUE,
        bullOptions(POST_FANOUT_QUEUE, url),
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close().catch(() => undefined);
  }

  /** The admin settings, read live. Auto = on while the job queue exists. */
  async readSettings(): Promise<TimelineSettings> {
    const num = async (
      key:
        | 'feed.fanout_max_followers'
        | 'feed.fanout_timeline_len'
        | 'feed.fanout_timeline_days',
      min: number,
    ) => {
      let v: number = APP_SETTINGS[key];
      try {
        if (this.settings) v = await this.settings.number(key);
      } catch {
        // unreadable: the built-in default
      }
      return Math.max(min, Math.floor(Number.isFinite(v) ? v : min));
    };
    // Unreadable settings = auto (a typo never turns the feed off).
    const mode = this.settings
      ? await readSwitchMode(this.settings, 'feed.fanout_mode').catch(
          () => 'auto' as const,
        )
      : (APP_SETTINGS['feed.fanout_mode'] as 'auto');
    return {
      active: mode === 'on' || (mode === 'auto' && !!this.queue),
      maxFollowers: await num('feed.fanout_max_followers', 0),
      length: await num('feed.fanout_timeline_len', 1),
      ttlSec: (await num('feed.fanout_timeline_days', 1)) * 86_400,
    };
  }

  // ───────────────────────────── read side ─────────────────────────────

  /**
   * The followed stream of one feed page from the timeline: the same rows,
   * in the same order, as the old read (`take` rows of `where` by [shown]
   * before [after], newest first). Null = use the old read (and, when the
   * timeline is cold or misses a followed author, it is built behind).
   */
  async followed(q: FollowedQuery): Promise<Post[] | null> {
    if (demoContext.isDemo() || q.shown.length === 0) return null;
    try {
      const cfg = await this.readSettings();
      if (!cfg.active) return null;
      const epoch = await this.epoch(cfg.maxFollowers);
      const tl = timelineKey(q.viewerId);
      const meta = timelineMetaKey(q.viewerId);
      const [head, sentinel] = await Promise.all([
        this.cache.hmget(meta, '_e', '_f'),
        this.cache.zscore(tl, SENTINEL),
      ]);
      if (head[0] !== epoch || sentinel === null) {
        this.buildLater(q, epoch, cfg, true);
        return null;
      }
      const high = await this.highAuthors(q.shown);
      const low = q.shown.filter((a) => !high.has(a));
      const tokens = low.length ? await this.cache.hmget(meta, ...low) : [];
      const uncovered = low.filter((a, i) => tokens[i] !== q.tokens.get(a));
      if (uncovered.length > 0) {
        this.buildLater({ ...q, shown: uncovered }, epoch, cfg, false);
        return null;
      }
      const rows = await this.fromTimeline(
        q,
        new Set(low),
        [...high],
        Number(head[1] ?? 0) || 0,
        cfg,
      );
      if (rows) {
        void Promise.all([
          this.cache.expire(tl, cfg.ttlSec),
          this.cache.expire(meta, cfg.ttlSec),
        ]).catch(() => undefined);
      }
      return rows;
    } catch (e) {
      this.log.warn({ err: String(e) }, 'timeline read skipped');
      return null;
    }
  }

  private async fromTimeline(
    q: FollowedQuery,
    low: Set<string>,
    high: string[],
    floor: number,
    cfg: TimelineSettings,
  ): Promise<Post[] | null> {
    const maxScore = q.after ? Date.parse(q.after.t) : Number.POSITIVE_INFINITY;
    const max = Number.isFinite(maxScore) ? String(maxScore) : '+inf';
    const min = floor > 0 ? String(floor) : '1';
    // Posts whose fan-out is still running: not in every timeline yet.
    const pending = (
      await this.redis.zrangebyscore(FANOUT_PENDING_KEY, '-inf', max)
    ).filter((m) => low.has(authorOf(m)));
    for (let k = Math.max(q.take * 2, 32); ; k *= 4) {
      const raw = await this.cache.zrevrangebyscore(
        timelineKey(q.viewerId),
        max,
        min,
        'WITHSCORES',
        'LIMIT',
        0,
        k,
      );
      const n = raw.length / 2;
      const ids = new Set<string>();
      for (let i = 0; i < raw.length; i += 2) {
        if (low.has(authorOf(raw[i]))) ids.add(postOf(raw[i]));
      }
      for (const m of pending) ids.add(postOf(m));
      const exhausted = n < k;
      // Every post of a covered author scored >= bound is a candidate.
      const bound = exhausted
        ? floor > 0
          ? floor
          : Number.NEGATIVE_INFINITY
        : Number(raw[raw.length - 1]) + 1;
      const rows = await this.query(q, [...ids], [...low], high);
      const last = rows[q.take - 1];
      if (
        rows.length < q.take
          ? bound === Number.NEGATIVE_INFINITY
          : last.created_at.getTime() >= bound
      )
        return rows;
      // The page reaches below what the timeline holds: the old read.
      if (exhausted || k >= cfg.length * 4) return null;
    }
  }

  private query(
    q: FollowedQuery,
    ids: string[],
    low: string[],
    high: string[],
  ): Promise<Post[]> {
    const parts: Prisma.PostWhereInput[] = [];
    if (ids.length > 0) parts.push({ id: { in: ids }, author_id: { in: low } });
    if (high.length > 0) parts.push({ author_id: { in: high } });
    if (parts.length === 0) return Promise.resolve([]);
    return this.prisma.post.findMany({
      where: {
        AND: [
          q.where,
          parts.length === 1 ? parts[0] : { OR: parts },
          ...(q.after ? [createdBefore(q.after)] : []),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: q.take,
    });
  }

  /** Of [authors], the ones read at open time (sticky, this epoch). */
  private async highAuthors(authors: string[]): Promise<Set<string>> {
    if (authors.length === 0) return new Set();
    const flags = await this.redis.smismember(FANOUT_SKIP_KEY, ...authors);
    return new Set(authors.filter((_, i) => flags[i] === 1));
  }

  /** The current epoch id; a new one when N changed or none exists. */
  private async epoch(n: number): Promise<string> {
    const [id, stored] = await this.redis.hmget(FANOUT_EPOCH_KEY, 'id', 'n');
    if (id && stored === String(n)) return id;
    return String(
      await this.redis.eval(
        EPOCH_LUA,
        2,
        FANOUT_EPOCH_KEY,
        FANOUT_SKIP_KEY,
        randomUUID(),
        String(n),
      ),
    );
  }

  private buildLater(
    q: FollowedQuery,
    epoch: string,
    cfg: TimelineSettings,
    reset: boolean,
  ): void {
    const p = this.build(q, epoch, cfg, reset)
      .catch((e) => {
        this.log.warn({ err: String(e) }, 'timeline build failed');
      })
      .finally(() => this.builds.delete(p));
    this.builds.add(p);
  }

  /** Waits for this process's background builds (tests). */
  async settled(): Promise<void> {
    while (this.builds.size > 0) await Promise.all([...this.builds]);
  }

  /**
   * Writes the posts of [q.shown] (all of them on a reset) into the
   * timeline, then marks them covered with their follow token. Order
   * matters for a concurrent fan-out: the meta exists BEFORE the database
   * read, so a post committed after the read is written by its fan-out.
   */
  private async build(
    q: FollowedQuery,
    epoch: string,
    cfg: TimelineSettings,
    reset: boolean,
  ): Promise<void> {
    const lock = await this.redis.set(
      buildLockKey(q.viewerId),
      '1',
      'EX',
      BUILD_LOCK_SEC,
      'NX',
    );
    if (lock !== 'OK') return;
    try {
      const tl = timelineKey(q.viewerId);
      const meta = timelineMetaKey(q.viewerId);
      const high = await this.highAuthors(q.shown);
      const authors = q.shown.filter((a) => !high.has(a));
      if (reset) {
        await this.cache.eval(RESET_LUA, 2, tl, meta, epoch, cfg.ttlSec);
      }
      if (authors.length === 0) return;
      const floor = Number(await this.cache.hget(meta, '_f')) || 0;
      // No visibility filter: a hidden post that is restored later must be
      // in place; the read re-checks every row anyway.
      const rows = await this.prisma.post.findMany({
        where: {
          author_id: { in: authors },
          ...(floor > 0 ? { created_at: { gte: new Date(floor) } } : {}),
        },
        select: { id: true, author_id: true, created_at: true },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: cfg.length,
      });
      const truncated = rows.length >= cfg.length;
      const raise = truncated
        ? rows[rows.length - 1].created_at.getTime() + 1
        : 0;
      const pairs = rows.flatMap((r) => [
        String(r.created_at.getTime()),
        `${r.id}:${r.author_id}`,
      ]);
      for (let i = 0; i < Math.max(pairs.length, 2); i += 1000) {
        const chunk = pairs.slice(i, i + 1000);
        const last = i + 1000 >= pairs.length;
        const res = await this.cache.eval(
          WRITE_LUA,
          2,
          tl,
          meta,
          cfg.length,
          '1',
          last ? raise : 0,
          ...chunk,
        );
        // The meta vanished (evicted / reset by another epoch): give up.
        if (Number(res) < 0) return;
      }
      const fields = authors.flatMap((a) => [a, q.tokens.get(a) ?? '']);
      await this.cache.hset(meta, ...fields);
      await Promise.all([
        this.cache.expire(tl, cfg.ttlSec),
        this.cache.expire(meta, cfg.ttlSec),
      ]);
    } finally {
      await this.redis.del(buildLockKey(q.viewerId)).catch(() => 0);
    }
  }

  // ───────────────────────────── write side ────────────────────────────

  /**
   * A post was created or (re)published with a new created_at: write it
   * into the timelines of the author's followers, or mark the author as
   * read at open time when the followers are at or above the number.
   */
  async onPostWritten(post: {
    id: string;
    author_id: string;
    created_at: Date;
  }): Promise<void> {
    if (demoContext.isDemo()) return;
    try {
      const cfg = await this.readSettings();
      if (!cfg.active) {
        // Off: nothing written now, so every timeline is stale when it is
        // switched on again; a missing epoch rebuilds them all.
        await this.redis.del(FANOUT_EPOCH_KEY);
        return;
      }
      await this.epoch(cfg.maxFollowers);
      if (await this.isHigh(post.author_id, cfg.maxFollowers)) return;
      const score = post.created_at.getTime();
      const member = `${post.id}:${post.author_id}`;
      await this.redis.zadd(FANOUT_PENDING_KEY, score, member);
      const stale = await this.redis.zremrangebyscore(
        FANOUT_PENDING_KEY,
        '-inf',
        Date.now() - PENDING_MAX_MS,
      );
      if (stale > 0) await this.redis.del(FANOUT_EPOCH_KEY);
      // The author's own feed at once.
      await this.writeOne(post.author_id, score, member, cfg.length);
      const job: TimelineFanoutJob = {
        postId: post.id,
        authorId: post.author_id,
        score,
        after: null,
        ...shardCarry(),
      };
      if (this.queue) {
        await this.queue.add(TIMELINE_JOB, job, {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 1000 },
          jobId: `tl-${post.id}-${score}-start`,
        });
      } else {
        let next: TimelineFanoutJob | null = job;
        while (next) next = await this.runBatch(next, false);
      }
    } catch (e) {
      // The post is in the database; a reader whose timeline misses it would
      // be wrong, so every timeline is rebuilt instead.
      this.log.warn(
        { err: String(e), postId: post.id },
        'timeline fan-out failed',
      );
      await this.redis.del(FANOUT_EPOCH_KEY).catch(() => 0);
    }
  }

  /** One batch of followers; queues the next (or returns it inline). */
  async runBatch(
    data: TimelineFanoutJob,
    queueNext = true,
  ): Promise<TimelineFanoutJob | null> {
    const cfg = await this.readSettings();
    const member = `${data.postId}:${data.authorId}`;
    let followers: string[];
    let next: string | null = null;
    if (readsAreSplit(this.prisma)) {
      // Sharded reads: the audience in one go (like the follower alerts).
      followers = data.after
        ? []
        : (
            await this.prisma.follow.findMany({
              where: { followee_id: data.authorId },
              select: { follower_id: true },
            })
          ).map((f) => f.follower_id);
    } else {
      followers = (
        await this.prisma.follow.findMany({
          where: {
            followee_id: data.authorId,
            ...(data.after ? { follower_id: { gt: data.after } } : {}),
          },
          select: { follower_id: true },
          orderBy: { follower_id: 'asc' },
          take: FANOUT_BATCH,
        })
      ).map((f) => f.follower_id);
      if (followers.length === FANOUT_BATCH)
        next = followers[followers.length - 1];
    }
    for (let i = 0; i < followers.length; i += WRITE_PARALLEL) {
      await Promise.all(
        followers
          .slice(i, i + WRITE_PARALLEL)
          .map((f) => this.writeOne(f, data.score, member, cfg.length)),
      );
    }
    if (next) {
      const more = { ...data, after: next };
      if (!queueNext || !this.queue) return more;
      await this.queue.add(TIMELINE_JOB, more, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
        jobId: `tl-${data.postId}-${data.score}-${next}`,
      });
      return null;
    }
    await this.redis.zrem(FANOUT_PENDING_KEY, member);
    return null;
  }

  /** Into one reader's timeline, only if it is warm (Twitter: only the
   * timelines in cache are written). Throws on a cache error (retried). */
  private async writeOne(
    uid: string,
    score: number,
    member: string,
    length: number,
  ): Promise<void> {
    await this.cache.eval(
      WRITE_LUA,
      2,
      timelineKey(uid),
      timelineMetaKey(uid),
      length,
      '1',
      0,
      score,
      member,
    );
  }

  /** At or above the number: read at open time from now on (sticky in
   * this epoch, so no post of the author is ever missing from both). */
  private async isHigh(authorId: string, max: number): Promise<boolean> {
    if (await this.redis.sismember(FANOUT_SKIP_KEY, authorId)) return true;
    const [att, cli] = await Promise.all([
      this.prisma.attorneyProfile.findUnique({
        where: { user_id: authorId },
        select: { followers_count: true },
      }),
      this.prisma.clientProfile.findUnique({
        where: { user_id: authorId },
        select: { followers_count: true },
      }),
    ]);
    const followers = Math.max(
      att?.followers_count ?? 0,
      cli?.followers_count ?? 0,
    );
    if (followers < max) return false;
    await this.redis.sadd(FANOUT_SKIP_KEY, authorId);
    return true;
  }
}

function postOf(member: string): string {
  const i = member.indexOf(':');
  return i < 0 ? member : member.slice(0, i);
}

function authorOf(member: string): string {
  const i = member.indexOf(':');
  return i < 0 ? '' : member.slice(i + 1);
}

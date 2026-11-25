import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from '../src/redis/redis.constants';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { feedVersionKey } from '../src/common/cache/feed-version';
import { recoCurrentKey } from '../src/modules/feed/feed.service';
import {
  FANOUT_PENDING_KEY,
  FANOUT_SKIP_KEY,
  FeedTimelineService,
  timelineKey,
} from '../src/modules/feed/feed-timeline.service';

/**
 * Item 23 (F1, 25.11): the hybrid feed — Twitter "Timelines at Scale".
 * Followed posts of ordinary authors come from the reader's precomputed
 * timeline (written on publish), an author at or above
 * `feed.fanout_max_followers` is read at open time and merged. Every page
 * must be the same as the old database read (`feed.fanout_mode` off), and a
 * delete or a block must be respected at once.
 */
jest.setTimeout(120_000);

describe('Feed: hybrid fan-out (e2e, item 23 F1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let cache: Redis;
  let timeline: FeedTimelineService;
  let baseUrl = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    redis = app.get(REDIS_CLIENT);
    cache = app.get(REDIS_CACHE_CLIENT);
    timeline = app.get(FeedTimelineService);
    await setConfig('feed.fanout_max_followers', 3);
  });

  afterAll(async () => {
    for (const k of ['feed.fanout_mode', 'feed.fanout_max_followers']) {
      await prisma.appConfig.deleteMany({ where: { key: k } });
    }
    await dropAppConfigCache(redis);
    await app.close();
  });

  async function setConfig(key: string, value: unknown) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
    await dropAppConfigCache(redis);
  }

  const api = () => request(baseUrl);

  async function user(role: 'client' | 'attorney', followers = 0) {
    const u = await prisma.user.create({ data: { role } });
    if (role === 'attorney') {
      const username = `fo_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: 'verified',
          followers_count: followers,
        },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  /** Posts as PostsService writes them: the row, then the fan-out. */
  async function publish(
    authorId: string,
    n: number,
    base: number,
    step = 60_000,
  ) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await prisma.post.create({
        data: {
          author_id: authorId,
          body: `Post ${i} by ${authorId.slice(0, 6)}`,
          created_at: new Date(base - i * step),
        },
      });
      await timeline.onPostWritten(p);
      ids.push(p.id);
    }
    return ids;
  }

  /** Runs the queued fan-out batches of [postIds] here (the worker may
   * not run in this process). */
  async function drain(postIds: string[]) {
    for (const id of postIds) {
      const p = await prisma.post.findUniqueOrThrow({ where: { id } });
      let next = await timeline.runBatch(
        {
          postId: p.id,
          authorId: p.author_id,
          score: p.created_at.getTime(),
          after: null,
        },
        false,
      );
      while (next) next = await timeline.runBatch(next, false);
    }
  }

  /** One page; a fresh first-page cache key every time (the 60 s page
   * cache would otherwise answer for both modes). */
  async function page(
    viewer: { id: string; auth: Record<string, string> },
    cursor?: string,
  ) {
    if (!cursor) await cache.set(feedVersionKey(viewer.id), randomUUID());
    const r = await api()
      .get('/api/v1/feed')
      .query({ limit: 12, ...(cursor ? { cursor } : {}) })
      .set(viewer.auth);
    expect(r.status).toBe(200);
    const organic = (
      r.body.data as { id: string; promotionId?: string }[]
    ).filter((p) => !p.promotionId);
    return {
      ids: organic.map((p) => p.id),
      next: r.body.meta?.nextCursor as string | null,
    };
  }

  /** The first [pages] pages, and how many followed streams the timeline
   * served (a non-null `followed`). */
  async function walk(
    viewer: { id: string; auth: Record<string, string> },
    pages = 4,
  ) {
    // No recommendation snapshot: both modes see the same candidates.
    await redis.del(recoCurrentKey());
    const spy = jest.spyOn(timeline, 'followed');
    const all: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < pages; i++) {
      const p = await page(viewer, cursor);
      all.push(...p.ids);
      if (!p.next) break;
      cursor = p.next;
    }
    const flags = (
      await Promise.all(
        spy.mock.results.map((r) => r.value as Promise<unknown>),
      )
    ).map((v) => v !== null);
    spy.mockRestore();
    await timeline.settled();
    return { all, served: flags.filter(Boolean).length, first: flags[0] };
  }

  async function readPath(viewer: {
    id: string;
    auth: Record<string, string>;
  }) {
    await setConfig('feed.fanout_mode', 'off');
    const r = await walk(viewer);
    await setConfig('feed.fanout_mode', 'on');
    expect(r.served).toBe(0);
    return r.all;
  }

  async function members(uid: string) {
    return cache.zrange(timelineKey(uid), '0', '-1');
  }

  let reader: { id: string; auth: Record<string, string> };
  let a: { id: string };
  let b: { id: string; auth: Record<string, string> };
  let star: { id: string };
  let starPosts: string[] = [];
  const now = Date.now();

  it('serves the same pages as the database read, high-follower author merged at open', async () => {
    await setConfig('feed.fanout_mode', 'on');
    reader = await user('client');
    a = await user('attorney', 1);
    b = await user('attorney', 1);
    // At or above feed.fanout_max_followers (3): read at open time.
    star = await user('attorney', 50);
    for (const f of [a, b, star]) {
      await prisma.follow.create({
        data: { follower_id: reader.id, followee_id: f.id },
      });
    }
    const aPosts = await publish(a.id, 15, now - 1_000, 7 * 60_000);
    const bPosts = await publish(b.id, 10, now - 2_000, 11 * 60_000);
    starPosts = await publish(star.id, 8, now - 3_000, 13 * 60_000);
    await publish(reader.id, 2, now - 4_000, 17 * 60_000);
    await drain([...aPosts, ...bPosts]);

    // The famous author is in the read-at-open set and in no timeline.
    expect(await redis.sismember(FANOUT_SKIP_KEY, star.id)).toBe(1);

    // First open: the timeline is cold — the database read, built behind.
    const cold = await walk(reader);
    expect(cold.first).toBe(false);
    const warm = await walk(reader);
    expect(warm.served).toBeGreaterThan(0);
    const want = await readPath(reader);
    expect(warm.all).toEqual(want);
    expect(cold.all).toEqual(want);
    // Every followed post is there, the star's too (merged at read).
    for (const id of [...aPosts, ...bPosts, ...starPosts]) {
      expect(warm.all).toContain(id);
    }
    const tl = await members(reader.id);
    expect(tl.some((m) => m.endsWith(`:${a.id}`))).toBe(true);
    expect(tl.some((m) => m.endsWith(`:${star.id}`))).toBe(false);
  });

  it('a new post is on top at once (its fan-out still pending), also from the famous author', async () => {
    const fresh = (await publish(a.id, 1, Date.now()))[0];
    const ownStar = (await publish(star.id, 1, Date.now() + 5))[0];
    const first = await walk(reader, 1);
    expect(first.first).toBe(true);
    expect(first.all.slice(0, 2)).toEqual([ownStar, fresh]);
    // Pending until the fan-out ran; then in the reader's timeline.
    const member = `${fresh}:${a.id}`;
    await drain([fresh]);
    expect(await redis.zscore(FANOUT_PENDING_KEY, member)).toBeNull();
    expect(await members(reader.id)).toContain(member);
    expect((await walk(reader)).all).toEqual(await readPath(reader));
  });

  it('a deleted post is gone at once, served from the timeline', async () => {
    const before = await walk(reader, 1);
    const victim = before.all.find((id) => !starPosts.includes(id))!;
    await prisma.post.update({
      where: { id: victim },
      data: { deleted_at: new Date() },
    });
    const after = await walk(reader);
    expect(after.served).toBeGreaterThan(0);
    expect(after.all).not.toContain(victim);
    expect(after.all).toEqual(await readPath(reader));
  });

  it('a block drops the blocked author at once and stays equal to the read', async () => {
    // B blocks the reader (the block removes the follow on both sides).
    const r = await api().put(`/api/v1/users/${reader.id}/block`).set(b.auth);
    expect([200, 201, 204]).toContain(r.status);
    const bIds = new Set(
      (
        await prisma.post.findMany({
          where: { author_id: b.id },
          select: { id: true },
        })
      ).map((p) => p.id),
    );
    const after = await walk(reader);
    expect(after.served).toBeGreaterThan(0);
    expect(after.all.some((id) => bIds.has(id))).toBe(false);
    expect(after.all).toEqual(await readPath(reader));
  });

  it('a new follow is read from the database once, then covered by the timeline', async () => {
    const c = await user('attorney', 0);
    const cPosts = await publish(c.id, 4, now - 30_000, 5 * 60_000);
    await prisma.follow.create({
      data: { follower_id: reader.id, followee_id: c.id },
    });
    const once = await walk(reader);
    expect(once.first).toBe(false);
    for (const id of cPosts) expect(once.all).toContain(id);
    const again = await walk(reader);
    expect(again.served).toBeGreaterThan(0);
    expect(again.all).toEqual(once.all);
    expect(again.all).toEqual(await readPath(reader));
  });

  it('off: nothing is read from the timeline', async () => {
    await setConfig('feed.fanout_mode', 'off');
    const r = await walk(reader);
    expect(r.served).toBe(0);
    await setConfig('feed.fanout_mode', 'on');
  });
});

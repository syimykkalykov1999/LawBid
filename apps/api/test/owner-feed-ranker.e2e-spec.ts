import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from '../src/redis/redis.constants';
import { ExperimentsService } from '../src/modules/experiments/experiments.service';
import { RankingEventsService } from '../src/modules/experiments/ranking-events.service';
import { PostRankerService } from '../src/modules/recommendations/ranker/post-ranker.service';
import { RecommendationsService } from '../src/modules/recommendations/recommendations.service';
import { diversify } from '../src/modules/recommendations/ranking.math';
import {
  byFormula,
  withModelOrder,
} from '../src/modules/recommendations/ranker/rerank';
import { TokenService } from '../src/modules/auth/services/token.service';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';

/**
 * Owner 25.11 («умную ленту для всех лент», Instagram home feed): Feed →
 * «Посты» (GET /feed). For the model arm of the posts ranker test the
 * feed's own candidate window (followed + own posts, newest first) is
 * ordered by the posts model (fixture from ml/feed-ranker/make_fixture.py),
 * the viewer's own newest post stays on top, and the scroll pages that
 * pinned order without a repeat or a gap, then goes on newest first. With
 * the model missing or the switch «Выкл» the feed is newest first, exactly
 * as before. Every served page is logged (surface home_feed, the model's
 * input rows) for train.py --feed posts. And the reels' watch time:
 * POST /posts/watch, one `watch` row per view id (completion = the reels
 * model's top label).
 */
jest.setTimeout(240_000);

const FIX = resolve(__dirname, 'fixtures/feed-ranker');
const MISSING = `file:${resolve(FIX, 'none/model.onnx')}`;
const letters = (s: string) => s.replace(/\d/g, (d) => 'ghijklmnop'[Number(d)]);

describe('Feed «Посты» ranked by the posts model + reel watch time (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let cache: Redis;
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
    redis = app.get<Redis>(REDIS_CLIENT);
    cache = app.get<Redis>(REDIS_CACHE_CLIENT);
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: {
        OR: [
          { key: { startsWith: 'reco.ranker.' } },
          { key: { startsWith: 'ranking.' } },
        ],
      },
    });
    await dropAppConfigCache(redis);
    await app.close();
  });

  async function setConfig(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      });
    }
    await dropAppConfigCache(redis);
    for (const r of [cache, redis]) {
      for (const pattern of ['reco:*', 'feed:first:*', 'feed:rank:*']) {
        const keys = await r.keys(pattern);
        if (keys.length) await r.del(...keys);
      }
    }
    app.get(ExperimentsService).invalidate();
    app.get(RankingEventsService).invalidate();
    app.get(PostRankerService).invalidate();
  }

  const auth = (id: string) => ({
    Authorization: `Bearer ${app.get(TokenService).signAccessToken({
      sub: id,
      role: 'attorney',
      sid: randomUUID(),
      verified: true,
      subscriptionStatus: 'active',
    })}`,
  });

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const handle = `fr${randomUUID().slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: 'verified',
      },
    });
    return u.id;
  }

  async function post(
    author: string,
    ageSec: number,
    likes: number,
    video = false,
  ) {
    const asset = video
      ? await prisma.videoAsset.create({
          data: {
            owner_user_id: author,
            library_id: 'lib',
            external_id: `e2e-${randomUUID()}`,
            status: 'ready',
            upload_expires_at: new Date(Date.now() + 86_400_000),
            ready_at: new Date(),
            duration_sec: 20,
          },
        })
      : null;
    return prisma.post.create({
      data: {
        author_id: author,
        title: `Feed rank ${letters(randomUUID().slice(0, 6))}`,
        body: 'A post',
        video_asset_id: asset?.id ?? null,
        like_count: likes,
        save_count: Math.floor(likes / 3),
        share_count: Math.floor(likes / 5),
        comment_count: Math.floor(likes / 4),
        created_at: new Date(Date.now() - ageSec * 1000),
      },
    });
  }

  /** One viewer following one author with 22 posts (newest first: young
   * and untouched → old and loved) and one own post, the newest of all. */
  async function world() {
    const viewer = await attorney();
    const author = await attorney();
    await prisma.follow.create({
      data: { follower_id: viewer, followee_id: author },
    });
    const theirs = [];
    for (let i = 0; i < 22; i++) {
      theirs.push(await post(author, 60 + i * 7200, i * 20));
    }
    const own = await post(viewer, 5, 0);
    const chrono = [own.id, ...theirs.map((p) => p.id)];
    return { viewer, own, chrono, mine: new Set(chrono) };
  }

  /** Scrolls GET /feed (10 a page) until [mine] are all served. */
  async function scroll(viewer: string, mine: Set<string>) {
    const served: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 40; i++) {
      const q: Record<string, string | number> = { limit: 10 };
      if (cursor) q.cursor = cursor;
      const r: request.Response = await request(baseUrl)
        .get('/api/v1/feed')
        .query(q)
        .set(auth(viewer))
        .expect(200);
      served.push(...(r.body.data as { id: string }[]).map((p) => p.id));
      cursor = (r.body.meta?.nextCursor as string | null) ?? null;
      if (!cursor || [...mine].every((id) => served.includes(id))) break;
    }
    return served;
  }

  async function homeImpressions(viewer: string, since: Date, n: number) {
    const ev = app.get(RankingEventsService);
    for (let i = 0; i < 40; i++) {
      await ev.flush();
      const rows = await prisma.rankingEvent.findMany({
        where: {
          kind: 'impression',
          user_id: viewer,
          surface: 'home_feed',
          created_at: { gte: since },
        },
        orderBy: { position: 'asc' },
      });
      if (rows.length >= n) return rows;
      await new Promise((r) => setTimeout(r, 100));
    }
    return [];
  }

  const base = {
    'reco.ranker.reels.mode': 'off',
    'reco.ranker.cases.mode': 'off',
    'ranking.events_mode': 'on',
    'ranking.impression_sample_percent': 100,
    'reco.ranker.mode': 'on',
    'reco.ranker.traffic_percent': 100,
    'reco.ranker.model_share_percent': 100,
    'reco.ranker.model_key': `file:${resolve(FIX, 'model.onnx')}`,
    'reco.ranker.feed_window': 20,
  };

  it('model arm: the window in the posts model order, own post on top, stable pages, then newest first; logged for training', async () => {
    await setConfig(base);
    const ranker = app.get(PostRankerService);
    expect(await ranker.ensureLoaded()).toBe(true);
    const { viewer, own, chrono, mine } = await world();
    const t0 = new Date(Date.now() - 1000);
    const served = (await scroll(viewer, mine)).filter((id) => mine.has(id));

    // Every post exactly once: no repeat, no gap across the pages.
    expect(new Set(served).size).toBe(served.length);
    expect([...served].sort()).toEqual([...chrono].sort());
    // The own newest post leads (a post just published is seen at once).
    expect(served[0]).toBe(own.id);
    // The 20-post window is in the model's order …
    const window = chrono.slice(0, 20);
    const { rows } = await app
      .get(RecommendationsService)
      .homeFeedRows(viewer, window.slice(1));
    const scores = await ranker.score(
      window.slice(1).map((id) => rows.get(id)!),
    );
    expect(scores).not.toBeNull();
    const byModel = window
      .slice(1)
      .map((id, i) => ({ id, s: scores![i] }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.id);
    // Exactly the posts model's order of the window, then the same
    // diversity spread Search «Для вас» applies (one author is not shown
    // many times in a row): the page is what rankHomeWindow returns.
    const ranked = await app
      .get(RecommendationsService)
      .rankHomeWindow(viewer, window, new Set([own.id]), {
        experimentKey: 'post_ranker',
        variant: 'model',
      });
    expect(served.slice(0, 20)).toEqual(ranked?.ids);
    expect(new Set(served.slice(1, 20))).toEqual(new Set(byModel));
    // Recomputed here from the real model scores: model order, then the
    // spread.
    const { scored } = await app
      .get(RecommendationsService)
      .homeFeedRows(viewer, window.slice(1));
    const ordered = byFormula(scored);
    const modelScores = await ranker.score(
      ordered.map((s) => rows.get(s.item.id)!),
    );
    const spread = (list: typeof ordered) =>
      diversify(list, {
        key: (c) => c.authorId,
        kind: (c) => c.kind,
        window: 6,
      }).map((c) => c.id);
    expect(served.slice(1, 20)).toEqual(
      spread(withModelOrder(ordered, modelScores!)),
    );
    expect(served.slice(0, 20)).not.toEqual(window); // not newest first
    // … and after it the feed goes on newest first.
    expect(served.slice(20)).toEqual(chrono.slice(20));

    // Impressions: surface home_feed, the posts test's model arm, the
    // model's input rows, places 1..n with no hole.
    const logged = (await homeImpressions(viewer, t0, chrono.length)).filter(
      (r) => mine.has(r.item_id ?? ''),
    );
    expect(logged.map((r) => r.item_id)).toEqual(served);
    expect(logged.map((r) => r.position)).toEqual(served.map((_, i) => i + 1));
    for (const r of logged) {
      expect(r.experiment_key).toBe('post_ranker');
      expect(r.variant).toBe('model');
      expect(r.formula_version).toBe('ranker:fixture');
      expect(r.features).toMatchObject({ kind_photo: 0, kind_brief: 1 });
    }
  });

  it('a post deleted mid-scroll is never served from the pinned window', async () => {
    await setConfig(base);
    expect(await app.get(PostRankerService).ensureLoaded()).toBe(true);
    const { viewer, mine } = await world();
    const p1 = await request(baseUrl)
      .get('/api/v1/feed')
      .query({ limit: 10 })
      .set(auth(viewer))
      .expect(200);
    const first = (p1.body.data as { id: string }[]).map((p) => p.id);
    const later = [...mine].filter((id) => !first.includes(id));
    await prisma.post.update({
      where: { id: later[0] },
      data: { deleted_at: new Date() },
    });
    const rest: string[] = [];
    let cursor = p1.body.meta.nextCursor as string | null;
    for (let i = 0; cursor && i < 10; i++) {
      const r = await request(baseUrl)
        .get('/api/v1/feed')
        .query({ limit: 10, cursor })
        .set(auth(viewer))
        .expect(200);
      rest.push(...(r.body.data as { id: string }[]).map((p) => p.id));
      cursor = r.body.meta?.nextCursor ?? null;
    }
    expect(rest).not.toContain(later[0]);
  });

  it('no model / «Выкл»: the feed newest first, exactly as before; impressions tagged as the plain feed', async () => {
    for (const over of [
      { 'reco.ranker.model_key': MISSING },
      { 'reco.ranker.mode': 'off' },
    ]) {
      await setConfig({ ...base, ...over });
      await app.get(PostRankerService).ensureLoaded();
      const { viewer, chrono, mine } = await world();
      const t0 = new Date(Date.now() - 1000);
      const served = (await scroll(viewer, mine)).filter((id) => mine.has(id));
      expect(served).toEqual(chrono);
      const logged = await homeImpressions(viewer, t0, 10);
      expect(logged.length).toBeGreaterThan(0);
      for (const r of logged) {
        expect(r.variant).not.toBe('model');
        expect(r.formula_version).toBe('home-2026-11');
      }
    }
  });

  it('reels watch time: one watch row per view id, own reels and bad input refused', async () => {
    await setConfig(base);
    const viewer = await attorney();
    const author = await attorney();
    const reel = await post(author, 30, 3, true);
    const ownReel = await post(viewer, 30, 3, true);
    const photo = await post(author, 30, 3, false);
    const viewId = randomUUID();
    const event = {
      postId: reel.id,
      viewId,
      watchedMs: 19_500,
      durationMs: 20_000,
      completed: true,
    };
    const t0 = new Date(Date.now() - 1000);
    for (let i = 0; i < 2; i++) {
      // The same view reported twice (a retry after a lost answer).
      await request(baseUrl)
        .post('/api/v1/posts/watch')
        .set(auth(viewer))
        .send({
          events: [
            event,
            { ...event, postId: ownReel.id, viewId: randomUUID() },
            { ...event, postId: photo.id, viewId: randomUUID() },
          ],
        })
        .expect(204);
    }
    await app.get(RankingEventsService).flush();
    const rows = await prisma.rankingEvent.findMany({
      where: { kind: 'watch', user_id: viewer, created_at: { gte: t0 } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      surface: 'reels',
      item_id: reel.id,
      value: 19_500,
      features: { watched_ms: 19_500, duration_ms: 20_000, completed: 1 },
    });
    await request(baseUrl)
      .post('/api/v1/posts/watch')
      .set(auth(viewer))
      .send({ events: [{ ...event, watchedMs: -1 }] })
      .expect(400);
    await request(baseUrl)
      .post('/api/v1/posts/watch')
      .send({ events: [event] })
      .expect(401);
  });
});

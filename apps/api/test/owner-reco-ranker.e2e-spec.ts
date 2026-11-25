import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from '../src/redis/redis.constants';
import { ExperimentsService } from '../src/modules/experiments/experiments.service';
import { RankingEventsService } from '../src/modules/experiments/ranking-events.service';
import { POST_WEIGHTS } from '../src/modules/recommendations/posts.scoring';
import { PostRankerService } from '../src/modules/recommendations/ranker/post-ranker.service';
import { PostsService } from '../src/modules/posts/posts.service';
import type { RequestUser } from '../src/modules/auth/decorators/current-user.decorator';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';

/**
 * F2 (architecture report 25.11 §6 item 24) end to end: the learned
 * second stage of the posts ranking. With the admin switch on and the
 * fixture model (ml/feed-ranker/make_fixture.py) the reels of a viewer in
 * the model arm come in the model's order, and the served list is logged
 * with the arm, the model version and the features the model saw; with
 * the model missing the same viewer gets the formula's order again.
 */
jest.setTimeout(180_000);

const MODEL = resolve(__dirname, 'fixtures/feed-ranker/model.onnx');

describe('Learned posts ranker (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let cache: Redis;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    cache = app.get<Redis>(REDIS_CACHE_CLIENT);
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: {
        OR: [
          { key: { startsWith: 'reco.ranker.' } },
          { key: { startsWith: 'reco.post.' } },
          { key: { startsWith: 'ranking.' } },
          { key: 'reco.reels_ranked' },
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
      const keys = await r.keys('reco:*');
      if (keys.length) await r.del(...keys);
    }
    app.get(ExperimentsService).invalidate();
    app.get(RankingEventsService).invalidate();
    app.get(PostRankerService).invalidate();
  }

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const handle = `rk${randomUUID().slice(0, 8)}`;
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

  async function impressions(viewer: string, items: string[], since: Date) {
    const ev = app.get(RankingEventsService);
    for (let i = 0; i < 40; i++) {
      await ev.flush();
      const rows = await prisma.rankingEvent.findMany({
        where: {
          kind: 'impression',
          user_id: viewer,
          surface: 'posts',
          item_id: { in: items },
          created_at: { gte: since },
        },
        orderBy: { position: 'asc' },
      });
      if (rows.length >= items.length) return rows;
      await new Promise((r) => setTimeout(r, 100));
    }
    return [];
  }

  it('model arm: reels in the model order, logged with arm, version and features; no model = the formula again', async () => {
    const viewer = await attorney();
    const author = await attorney();
    const reel = async (title: string, ageSec: number, likes: number) => {
      const asset = await prisma.videoAsset.create({
        data: {
          owner_user_id: author,
          library_id: 'lib',
          external_id: `e2e-${randomUUID()}`,
          status: 'ready',
          upload_expires_at: new Date(Date.now() + 86_400_000),
          ready_at: new Date(),
        },
      });
      return prisma.post.create({
        data: {
          author_id: author,
          title,
          body: 'A reel',
          video_asset_id: asset.id,
          like_count: likes,
          comment_count: Math.floor(likes / 4),
          created_at: new Date(Date.now() - ageSec * 1000),
        },
      });
    };
    // Two days old and loved vs brand new and untouched.
    const loved = await reel('Loved reel', 2 * 86_400, 400);
    const fresh = await reel('Fresh reel', 5, 0);
    const mine = [loved.id, fresh.id];

    // The formula looks at freshness alone: the new reel first.
    const formulaOnlyFresh = Object.fromEntries(
      Object.keys(POST_WEIGHTS).map((k) => [
        `reco.post.${k}`,
        k === 'fresh' ? 1 : 0,
      ]),
    );
    const base = {
      ...formulaOnlyFresh,
      'reco.reels_ranked': true,
      'ranking.events_mode': 'on',
      'ranking.impression_sample_percent': 100,
      'reco.ranker.mode': 'on',
      'reco.ranker.traffic_percent': 100,
      'reco.ranker.model_share_percent': 100,
      'reco.ranker.model_key': `file:${MODEL}`,
    };
    await setConfig(base);
    const ranker = app.get(PostRankerService);
    expect(await ranker.ensureLoaded()).toBe(true);

    const reels = async () =>
      (
        await app
          .get(PostsService)
          .listReels({ sub: viewer, role: 'attorney' } as RequestUser, {
            limit: 20,
          })
      ).items
        .map((p) => p.id)
        .filter((id) => mine.includes(id));

    const t1 = new Date(Date.now() - 1000);
    const served = await reels();
    const logged = await impressions(viewer, mine, t1);
    expect(logged.map((r) => r.item_id)).toEqual(served);
    for (const r of logged) {
      expect(r.experiment_key).toBe('post_ranker');
      expect(r.variant).toBe('model');
      expect(r.formula_version).toBe('ranker:fixture');
      expect(r.features).toMatchObject({
        kind_reel: 1,
        kind_photo: 0,
        seen: 0,
      });
    }
    // The order is the model's: score the logged features with the model.
    const scores = await ranker.score(
      logged.map((r) => r.features as Record<string, number>),
    );
    expect(scores).not.toBeNull();
    const byModel = logged
      .map((r, i) => ({ id: r.item_id, s: scores![i] }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.id);
    expect(served).toEqual(byModel);
    // …and it is not the formula's (fresh first): the model moved them.
    expect(served).toEqual([loved.id, fresh.id]);

    // The model file is gone: everyone keeps the formula, untagged.
    await setConfig({
      ...base,
      'reco.ranker.model_key': `file:${resolve(__dirname, 'fixtures/feed-ranker/none/model.onnx')}`,
    });
    expect(await ranker.ensureLoaded()).toBe(false);
    const t2 = new Date();
    expect(await reels()).toEqual([fresh.id, loved.id]);
    const after = await impressions(viewer, mine, t2);
    for (const r of after) {
      expect(r.experiment_key).not.toBe('post_ranker');
      expect(r.formula_version).toBe('posts-2026-10');
    }

    // «Выкл» with a good model: the formula too.
    await setConfig({ ...base, 'reco.ranker.mode': 'off' });
    expect(await reels()).toEqual([fresh.id, loved.id]);
  });
});

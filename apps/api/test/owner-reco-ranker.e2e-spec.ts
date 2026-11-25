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
import { CASE_WEIGHTS } from '../src/modules/recommendations/cases.scoring';
import { POST_WEIGHTS } from '../src/modules/recommendations/posts.scoring';
import { PostRankerService } from '../src/modules/recommendations/ranker/post-ranker.service';
import {
  CaseRankerService,
  ReelRankerService,
} from '../src/modules/recommendations/ranker/feed-rankers.service';
import type { LearnedRanker } from '../src/modules/recommendations/ranker/learned-ranker';
import { PostsService } from '../src/modules/posts/posts.service';
import { SearchService } from '../src/modules/search/search.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import type { RequestUser } from '../src/modules/auth/decorators/current-user.decorator';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';

/**
 * F2 + owner 25.11 («умную ленту для всех лент») end to end: each feed —
 * Search «Для вас» posts, the reels feed, the attorneys' case feed — is
 * re-ordered by ITS OWN learned model (fixtures from
 * ml/feed-ranker/make_fixture.py --feed …) for the model arm of its own
 * test, logged on its own surface with the features that model saw; with
 * the model missing or the switch «Выкл» the same viewer gets the
 * formula's order. The case model only re-orders what the hard filters
 * (licensed states) let through.
 */
jest.setTimeout(240_000);

const FIX = resolve(__dirname, 'fixtures/feed-ranker');
const MISSING = `file:${resolve(FIX, 'none/model.onnx')}`;
const letters = (s: string) => s.replace(/\d/g, (d) => 'ghijklmnop'[Number(d)]);

describe('Learned feed rankers: posts, reels, cases (e2e)', () => {
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
          { key: { startsWith: 'reco.post.' } },
          { key: { startsWith: 'reco.case.' } },
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
    for (const r of rankers()) r.invalidate();
  }

  const rankers = (): LearnedRanker[] => [
    app.get(PostRankerService),
    app.get(ReelRankerService),
    app.get(CaseRankerService),
  ];

  /** Every feed's ranker «Выкл» first, then [over]. */
  const allOff = {
    'reco.ranker.mode': 'off',
    'reco.ranker.reels.mode': 'off',
    'reco.ranker.cases.mode': 'off',
  };
  const on = (prefix: string, feed: string) => ({
    [`${prefix}.mode`]: 'on',
    [`${prefix}.traffic_percent`]: 100,
    [`${prefix}.model_share_percent`]: 100,
    [`${prefix}.model_key`]: `file:${resolve(FIX, feed, 'model.onnx')}`,
  });

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

  async function impressions(
    viewer: string,
    surface: string,
    items: string[],
    since: Date,
  ) {
    const ev = app.get(RankingEventsService);
    for (let i = 0; i < 40; i++) {
      await ev.flush();
      const rows = await prisma.rankingEvent.findMany({
        where: {
          kind: 'impression',
          user_id: viewer,
          surface,
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

  /** The order the loaded [ranker] gives the logged feature rows. */
  async function modelOrder(
    ranker: LearnedRanker,
    logged: { item_id: string | null; features: unknown }[],
  ) {
    const scores = await ranker.score(
      logged.map((r) => r.features as Record<string, number>),
    );
    expect(scores).not.toBeNull();
    return logged
      .map((r, i) => ({ id: r.item_id, s: scores![i] }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.id);
  }

  /** Formula weights where only [only] counts (others 0). */
  const formulaOnly = (kind: 'post' | 'case', only: string) =>
    Object.fromEntries(
      Object.keys(kind === 'post' ? POST_WEIGHTS : CASE_WEIGHTS).map((k) => [
        `reco.${kind}.${k}`,
        k === only ? 1 : 0,
      ]),
    );

  async function twoPosts(video: boolean) {
    const author = await attorney();
    const make = async (title: string, ageSec: number, likes: number) => {
      const asset = video
        ? await prisma.videoAsset.create({
            data: {
              owner_user_id: author,
              library_id: 'lib',
              external_id: `e2e-${randomUUID()}`,
              status: 'ready',
              upload_expires_at: new Date(Date.now() + 86_400_000),
              ready_at: new Date(),
              duration_sec: 40,
            },
          })
        : null;
      return prisma.post.create({
        data: {
          author_id: author,
          title: `${title} ${letters(randomUUID().slice(0, 6))}`,
          body: video ? 'A reel' : 'A post',
          video_asset_id: asset?.id ?? null,
          like_count: likes,
          save_count: Math.floor(likes / 3),
          share_count: Math.floor(likes / 5),
          comment_count: Math.floor(likes / 4),
          created_at: new Date(Date.now() - ageSec * 1000),
        },
      });
    };
    // Two days old and loved vs brand new and untouched.
    const loved = await make('Loved', 2 * 86_400, 400);
    const fresh = await make('Fresh', 5, 0);
    return { loved, fresh, mine: [loved.id, fresh.id] };
  }

  it('posts (Search «Для вас»): the posts model order, its own test and surface; no model / «Выкл» = the formula', async () => {
    const viewer = await attorney();
    const { loved, fresh, mine } = await twoPosts(false);
    const base = {
      ...allOff,
      ...formulaOnly('post', 'fresh'),
      'ranking.events_mode': 'on',
      'ranking.impression_sample_percent': 100,
      ...on('reco.ranker', '.'),
    };
    await setConfig(base);
    const ranker = app.get(PostRankerService);
    expect(await ranker.ensureLoaded()).toBe(true);
    const user = { sub: viewer, role: 'attorney' } as RequestUser;
    const grid = async () =>
      (
        await app
          .get(SearchService)
          .latestPosts(user, undefined, undefined, { sort: 'for_you' })
      ).items
        .map((p) => p.id)
        .filter((id) => mine.includes(id));

    const t1 = new Date(Date.now() - 1000);
    const served = await grid();
    const logged = await impressions(viewer, 'posts', mine, t1);
    expect(logged.map((r) => r.item_id)).toEqual(served);
    for (const r of logged) {
      expect(r.experiment_key).toBe('post_ranker');
      expect(r.variant).toBe('model');
      expect(r.formula_version).toBe('ranker:fixture');
      expect(r.features).toMatchObject({ kind_reel: 0, seen: 0 });
    }
    expect(served).toEqual(await modelOrder(ranker, logged));
    expect(served).toEqual([loved.id, fresh.id]); // not the formula's

    await setConfig({ ...base, 'reco.ranker.model_key': MISSING });
    expect(await ranker.ensureLoaded()).toBe(false);
    expect(await grid()).toEqual([fresh.id, loved.id]);
    await setConfig({ ...base, 'reco.ranker.mode': 'off' });
    expect(await grid()).toEqual([fresh.id, loved.id]);
  });

  it('reels: the reels model (not the posts one), surface reels, reel features; no model / «Выкл» = the formula', async () => {
    const viewer = await attorney();
    const { loved, fresh, mine } = await twoPosts(true);
    const base = {
      ...allOff,
      ...formulaOnly('post', 'fresh'),
      'reco.reels_ranked': true,
      'ranking.events_mode': 'on',
      'ranking.impression_sample_percent': 100,
      // The posts model is on too: it must not touch the reels.
      ...on('reco.ranker', '.'),
      ...on('reco.ranker.reels', 'reels'),
    };
    await setConfig(base);
    const ranker = app.get(ReelRankerService);
    expect(await ranker.ensureLoaded()).toBe(true);
    expect(await app.get(PostRankerService).ensureLoaded()).toBe(true);
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
    const logged = await impressions(viewer, 'reels', mine, t1);
    expect(logged.map((r) => r.item_id)).toEqual(served);
    for (const r of logged) {
      expect(r.experiment_key).toBe('reel_ranker');
      expect(r.variant).toBe('model');
      expect(r.formula_version).toBe('ranker:fixture');
      const f = r.features as Record<string, number>;
      for (const k of ['likeRate', 'saveRate', 'shareRate', 'own', 'length'])
        expect(typeof f[k]).toBe('number');
    }
    expect(served).toEqual(await modelOrder(ranker, logged));
    expect(served).toEqual([loved.id, fresh.id]); // not the formula's
    // Nothing of the reels went to the posts surface or the posts test.
    expect(
      await prisma.rankingEvent.count({
        where: {
          user_id: viewer,
          OR: [{ surface: 'posts' }, { experiment_key: 'post_ranker' }],
          created_at: { gte: t1 },
        },
      }),
    ).toBe(0);

    await setConfig({ ...base, 'reco.ranker.reels.model_key': MISSING });
    expect(await ranker.ensureLoaded()).toBe(false);
    const t2 = new Date();
    expect(await reels()).toEqual([fresh.id, loved.id]);
    for (const r of await impressions(viewer, 'reels', mine, t2)) {
      expect(r.experiment_key).not.toBe('reel_ranker');
      expect(r.formula_version).toBe('reels-2026-11');
    }
    await setConfig({ ...base, 'reco.ranker.reels.mode': 'off' });
    expect(await reels()).toEqual([fresh.id, loved.id]);
  });

  it('cases (the Feed «Кейсы»): the cases model order inside the hard filters; no model / «Выкл» = the formula', async () => {
    const tokens = app.get(TokenService);
    const auth = (id: string, role: 'client' | 'attorney') => ({
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: id,
        role,
        sid: randomUUID(),
        verified: role === 'attorney',
        subscriptionStatus: role === 'attorney' ? 'active' : 'none',
      })}`,
    });
    const code = `e2e_rk_${letters(randomUUID().slice(0, 6))}`;
    const cat = await prisma.practiceArea.create({
      data: { code, name_en: 'Rk cat', i18n_key: `practice.${code}`, sort: 1 },
    });
    const leaf = await prisma.practiceArea.create({
      data: {
        code: `${code}.leaf`,
        parent_id: cat.id,
        name_en: 'Rk leaf',
        i18n_key: `practice.${code}.leaf`,
        sort: 1,
      },
    });
    for (const st of ['NY', 'TX']) {
      await prisma.state.upsert({
        where: { code: st },
        create: { code: st, name: st },
        update: {},
      });
    }
    const att = await attorney();
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: att,
        state_code: 'NY',
        bar_number: `NY-${randomUUID()}`,
        license_status: 'verified',
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: att, practice_area_id: leaf.id },
    });
    await prisma.subscription.create({
      data: { user_id: att, status: 'active', price_cents: 39900 },
    });
    const now = new Date();
    const cli = await prisma.user.create({
      data: {
        email: `e2e-${randomUUID()}@example.com`,
        role: 'client',
        first_name: 'Anna',
        last_name: 'Kowalski',
        phone_verified_at: now,
        email_verified_at: now,
      },
    });
    await prisma.onboardingState.create({
      data: { user_id: cli.id, completed_at: now },
    });
    const mk = async (state: string, budget: Record<string, unknown>) => {
      const r = await request(baseUrl)
        .post('/api/v1/cases')
        .set(auth(cli.id, 'client'))
        .set('Idempotency-Key', randomUUID())
        .send({
          practiceAreaId: leaf.id,
          title: `Ranker case ${letters(randomUUID().slice(0, 6))}`,
          description:
            'The landlord of our warehouse keeps the deposit and refuses to repair the roof after the storm.',
          primaryStateCode: state,
          clientContactSharingConsent: true,
          ...budget,
        });
      expect(`${r.status} ${JSON.stringify(r.body).slice(0, 300)}`).toMatch(
        /^201/,
      );
      return r.body.data.id as string;
    };
    // Formula = budget only: big > small > unknown. The big one already
    // drew 40 offers (competition ~0), which the model weighs and the
    // formula (budget only) does not.
    const big = await mk('NY', {
      budgetMode: 'amount',
      budgetAmountDollars: 5000,
    });
    const small = await mk('NY', {
      budgetMode: 'amount',
      budgetAmountDollars: 900,
    });
    const unknown = await mk('NY', { budgetMode: 'clarify_later' });
    const texas = await mk('TX', {
      budgetMode: 'amount',
      budgetAmountDollars: 9000,
    });
    await prisma.case.update({ where: { id: big }, data: { bids_count: 40 } });
    const mine = [big, small, unknown];

    const base = {
      ...allOff,
      ...formulaOnly('case', 'budget'),
      'ranking.events_mode': 'on',
      'ranking.impression_sample_percent': 100,
      ...on('reco.ranker.cases', 'cases'),
    };
    await setConfig(base);
    const ranker = app.get(CaseRankerService);
    expect(await ranker.ensureLoaded()).toBe(true);
    const feed = async () => {
      const res = await request(baseUrl)
        .get(`/api/v1/cases?limit=50&sort=for_you&practice=${code}`)
        .set(auth(att, 'attorney'));
      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((x) => x.id);
      // The hard filter: a case outside the licensed states never comes.
      expect(ids).not.toContain(texas);
      return ids.filter((id) => mine.includes(id));
    };

    const t1 = new Date(Date.now() - 1000);
    const served = await feed();
    const logged = await impressions(att, 'case_feed', mine, t1);
    expect(logged.map((r) => r.item_id)).toEqual(served);
    for (const r of logged) {
      expect(r.experiment_key).toBe('case_ranker');
      expect(r.variant).toBe('model');
      expect(r.formula_version).toBe('ranker:fixture');
      expect(Object.keys(r.features as object).sort()).toEqual(
        [...Object.keys(CASE_WEIGHTS), 'bidOn'].sort(),
      );
    }
    expect(served).toEqual(await modelOrder(ranker, logged));
    const formula = [big, small, unknown];
    expect(served).not.toEqual(formula);

    await setConfig({ ...base, 'reco.ranker.cases.model_key': MISSING });
    expect(await ranker.ensureLoaded()).toBe(false);
    expect(await feed()).toEqual(formula);
    await setConfig({ ...base, 'reco.ranker.cases.mode': 'off' });
    expect(await feed()).toEqual(formula);
  });
});

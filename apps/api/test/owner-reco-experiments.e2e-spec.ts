import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CASE_WEIGHTS } from '../src/modules/recommendations/cases.scoring';
import { ExperimentsService } from '../src/modules/experiments/experiments.service';
import { RankingEventsService } from '../src/modules/experiments/ranking-events.service';
import { ExperimentsNightlyJob } from '../src/modules/experiments/experiments-nightly.job';
import { assignVariant } from '../src/modules/experiments/experiment-math';
import { POST_WEIGHTS } from '../src/modules/recommendations/posts.scoring';
import { PostsService } from '../src/modules/posts/posts.service';
import type { RequestUser } from '../src/modules/auth/decorators/current-user.decorator';

/**
 * Owner 2026-11-08 («сделай так чтобы он работал»): the attorney case feed
 * «для вас» end to end — admin weights change the order; a running A/B test
 * assigns a stable variant, applies its weights, records the exposure; the
 * served page, the open (click on its place) and the bid land in
 * ranking_events with the variant; the nightly report counts them.
 */
jest.setTimeout(180_000);

const letters = (s: string) => s.replace(/\d/g, (d) => 'ghijklmnop'[Number(d)]);

describe('Recommendations + experiments wiring (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let cache: Redis;
  let baseUrl = '';
  let leafId = '';

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
    redis = app.get<Redis>(REDIS_CLIENT);
    cache = app.get<Redis>(REDIS_CACHE_CLIENT);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    const cat = await prisma.practiceArea.upsert({
      where: { code: 'e2e_rx_cat' },
      create: {
        code: 'e2e_rx_cat',
        name_en: 'Reco cat',
        i18n_key: 'practice.e2e_rx_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_rx_cat.leaf' },
      create: {
        code: 'e2e_rx_cat.leaf',
        parent_id: cat.id,
        name_en: 'Reco leaf',
        i18n_key: 'practice.e2e_rx_cat.leaf',
        sort: 1,
      },
      update: {},
    });
    leafId = leaf.id;
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: {
        OR: [
          { key: { startsWith: 'reco.case.' } },
          { key: { startsWith: 'ranking.' } },
          { key: { startsWith: 'reco.post.' } },
          { key: 'reco.reels_ranked' },
        ],
      },
    });
    await redis.del('config:app_config');
    await app.close();
  });

  const api = () => request(baseUrl);

  function auth(id: string, role: 'client' | 'attorney') {
    const t = tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: role === 'attorney' ? 'active' : 'none',
    });
    return { Authorization: `Bearer ${t}` };
  }

  async function client() {
    const now = new Date();
    const u = await prisma.user.create({
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
      data: { user_id: u.id, completed_at: now },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const handle = `rx${randomUUID().slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: 'verified',
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: 'NY',
        bar_number: `NY-${randomUUID()}`,
        license_status: 'verified',
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: u.id, practice_area_id: leafId },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  async function setConfig(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      });
    }
    await redis.del('config:app_config');
  }

  /** Only one formula weight on: the order follows that feature alone. */
  const only = (name: keyof typeof CASE_WEIGHTS) =>
    Object.fromEntries(
      Object.keys(CASE_WEIGHTS).map((k) => [
        `reco.case.${k}`,
        k === name ? 1 : 0,
      ]),
    );

  async function dropRankedCaches() {
    for (const r of [cache, redis]) {
      const keys = await r.keys('reco:*');
      if (keys.length) await r.del(...keys);
    }
    app.get(ExperimentsService).invalidate();
    app.get(RankingEventsService).invalidate();
  }

  let cli: { id: string; auth: Record<string, string> };
  let rich = '';
  let urgent = '';

  async function makeCases() {
    cli = await client();
    const tag = letters(randomUUID().slice(0, 6));
    const mk = async (title: string, extra: Record<string, unknown>) => {
      const r = await api()
        .post('/api/v1/cases')
        .set(cli.auth)
        .set('Idempotency-Key', randomUUID())
        .send({
          practiceAreaId: leafId,
          title: `${title} ${tag}`,
          description:
            'The landlord of our warehouse keeps the deposit and refuses to repair the roof after the storm.',
          primaryStateCode: 'NY',
          clientContactSharingConsent: true,
          ...extra,
        });
      expect(`${r.status} ${JSON.stringify(r.body).slice(0, 300)}`).toMatch(
        /^201/,
      );
      return r.body.data.id as string;
    };
    // A big budget, no hurry.
    rich = await mk('Warehouse deposit', {
      budgetMode: 'amount',
      budgetAmountDollars: 50_000,
    });
    // No budget yet, a hearing in three days.
    urgent = await mk('Hearing soon', {
      budgetMode: 'clarify_later',
      urgency: 'by_date',
      deadlineAt: new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10),
      deadlineKind: 'court_hearing',
    });
  }

  const order = async (who: { auth: Record<string, string> }) => {
    const res = await api()
      .get('/api/v1/cases?limit=50&sort=for_you')
      .set(who.auth);
    expect(res.status).toBe(200);
    return (res.body.data as { id: string }[])
      .map((x) => x.id)
      .filter((id) => id === rich || id === urgent);
  };

  async function rankingRows(where: Record<string, unknown>) {
    const ev = app.get(RankingEventsService);
    // The served page is logged after the response; wait for the batch.
    for (let i = 0; i < 40; i++) {
      await ev.flush();
      const rows = await prisma.rankingEvent.findMany({
        where,
        orderBy: { position: 'asc' },
      });
      if (rows.length > 0) return rows;
      await new Promise((r) => setTimeout(r, 100));
    }
    return [];
  }

  it('admin weights (reco.case.*) change the attorney feed order', async () => {
    await makeCases();
    const att = await attorney();
    await setConfig(only('budget'));
    await dropRankedCaches();
    expect(await order(att)).toEqual([rich, urgent]);

    await setConfig(only('urgency'));
    await dropRankedCaches();
    expect(await order(att)).toEqual([urgent, rich]);
  });

  it('an A/B test assigns a stable variant, applies its weights, logs exposure, impressions, click and bid, and the nightly report counts them', async () => {
    await setConfig({
      ...only('budget'),
      'ranking.events_mode': 'on',
      'ranking.impression_sample_percent': 100,
    });
    const variants = [
      { key: 'control', weight: 50 },
      { key: 'urgent_first', weight: 50 },
    ];
    // One attorney in each variant (assignment is a pure hash: find them).
    const key = `e2e_rx_${letters(randomUUID().slice(0, 8))}`;
    let inNew: { id: string; auth: Record<string, string> } | null = null;
    let inControl: { id: string; auth: Record<string, string> } | null = null;
    for (let i = 0; i < 30 && (!inNew || !inControl); i++) {
      const a = await attorney();
      const v = assignVariant(a.id, key, variants, 100);
      if (v === 'urgent_first' && !inNew) inNew = a;
      if (v === 'control' && !inControl) inControl = a;
    }
    expect(inNew && inControl).toBeTruthy();
    const exp = await prisma.experiment.create({
      data: {
        key,
        name: 'Urgent cases first',
        surface: 'case_feed',
        status: 'running',
        variants: [
          variants[0],
          { ...variants[1], weights: { budget: 0, urgency: 1 } },
        ],
        traffic_percent: 100,
        guardrails: {},
        started_at: new Date(Date.now() - 1000),
      },
    });
    await dropRankedCaches();

    // The variant's weights decide its people's order; control keeps the
    // admin's; both stay the same on every call.
    for (let i = 0; i < 3; i++) {
      expect(await order(inNew!)).toEqual([urgent, rich]);
      expect(await order(inControl!)).toEqual([rich, urgent]);
    }

    // Exposure: one row per person, with their variant.
    await app.get(ExperimentsService).flushExposures();
    const exposures = await prisma.experimentExposure.findMany({
      where: { experiment_id: exp.id },
    });
    expect(exposures.map((e) => [e.unit_id, e.variant]).sort()).toEqual(
      [
        [inNew!.id, 'urgent_first'],
        [inControl!.id, 'control'],
      ].sort(),
    );

    // Impressions of the served page, at their places, with the variant
    // and the features the formula saw.
    const imps = await rankingRows({
      kind: 'impression',
      user_id: inNew!.id,
      experiment_key: key,
      item_id: { in: [rich, urgent] },
    });
    expect(imps.length).toBeGreaterThanOrEqual(2);
    const first = imps.find((r) => r.item_id === urgent)!;
    expect(first).toMatchObject({
      surface: 'case_feed',
      variant: 'urgent_first',
      formula_version: 'cases-2026-10',
    });
    expect(first.position).toBeLessThan(
      imps.find((r) => r.item_id === rich)!.position!,
    );
    expect(first.features).toMatchObject({ urgency: expect.any(Number) });

    // Opening the case (the app's batched POST /cases/views) is a click on
    // its place; the bid is the outcome.
    await api()
      .post('/api/v1/cases/views')
      .set(inNew!.auth)
      .send({ caseIds: [urgent] })
      .expect((r) => expect(r.status).toBeLessThan(300));
    const clicks = await rankingRows({
      kind: 'click',
      user_id: inNew!.id,
      item_id: urgent,
    });
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({
      experiment_key: key,
      variant: 'urgent_first',
      position: first.position,
    });
    // The place on a page the person was actually served.
    expect(
      imps.filter((r) => r.item_id === urgent).map((r) => r.list_id),
    ).toContain(clicks[0].list_id);
    const bid = await api()
      .post(`/api/v1/cases/${urgent}/bids`)
      .set(inNew!.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 60_000,
        message: 'I handle these hearings every week, happy to help you.',
        startAvailability: 'immediately',
      });
    expect(`${bid.status} ${JSON.stringify(bid.body).slice(0, 300)}`).toMatch(
      /^201/,
    );
    const bids = await rankingRows({
      kind: 'bid',
      user_id: inNew!.id,
      item_id: urgent,
      experiment_key: key,
    });
    expect(bids[0]?.variant).toBe('urgent_first');

    // The admin page's report: both variants have their person, and the
    // click-through and bid metrics count the new variant's impressions
    // (one person each, so the value itself waits for a second one).
    const report = await app.get(ExperimentsNightlyJob).computeNow(exp.id);
    expect(report?.exposures).toEqual({ control: 1, urgent_first: 1 });
    const ctr = report?.metrics.find((m) => m.key === 'ctr');
    expect(ctr?.variants.urgent_first).toMatchObject({ n: 1 });
    expect(ctr?.variants.urgent_first?.volume).toBeGreaterThanOrEqual(2);
    expect(ctr?.variants.control?.volume).toBeGreaterThanOrEqual(2);
    const bidRate = report?.metrics.find((m) => m.key === 'bid_rate');
    expect(bidRate?.variants.urgent_first).toMatchObject({ n: 1 });
    expect(
      await prisma.experimentResult.count({ where: { experiment_id: exp.id } }),
    ).toBe(1);

    // Stopped: everyone is back on the admin weights.
    await prisma.experiment.update({
      where: { id: exp.id },
      data: { status: 'stopped', stopped_at: new Date() },
    });
    await dropRankedCaches();
    expect(await order(inNew!)).toEqual([rich, urgent]);
  });

  it('reels are ordered for the viewer by the posts formula (reco.reels_ranked), newest first when off', async () => {
    const viewer = await attorney();
    const author = await attorney();
    const reel = async (title: string, ageSec: number, likes: number) => {
      const asset = await prisma.videoAsset.create({
        data: {
          owner_user_id: author.id,
          library_id: 'lib',
          external_id: `e2e-${randomUUID()}`,
          status: 'ready',
          upload_expires_at: new Date(Date.now() + 86_400_000),
          ready_at: new Date(),
        },
      });
      return prisma.post.create({
        data: {
          author_id: author.id,
          title,
          body: 'A reel',
          video_asset_id: asset.id,
          like_count: likes,
          created_at: new Date(Date.now() - ageSec * 1000),
        },
      });
    };
    const loved = await reel('Loved reel', 3600, 80);
    const fresh = await reel('Fresh reel', 5, 0);
    const mine = [loved.id, fresh.id];
    // Only «hot» counts: the loved reel goes first despite being older.
    await setConfig({
      ...Object.fromEntries(
        Object.keys(POST_WEIGHTS).map((k) => [
          `reco.post.${k}`,
          k === 'hot' ? 1 : 0,
        ]),
      ),
      'reco.reels_ranked': true,
    });
    await dropRankedCaches();
    // The video flag and provider are off in the test env: the service the
    // /reels route calls.
    const reels = async () =>
      (
        await app
          .get(PostsService)
          .listReels({ sub: viewer.id, role: 'attorney' } as RequestUser, {
            limit: 20,
          })
      ).items
        .map((p) => p.id)
        .filter((id) => mine.includes(id));
    expect(await reels()).toEqual([loved.id, fresh.id]);
    const imps = await rankingRows({
      kind: 'impression',
      user_id: viewer.id,
      surface: 'posts',
      item_id: { in: mine },
    });
    expect(imps.map((r) => r.item_id)).toEqual([loved.id, fresh.id]);

    await setConfig({ 'reco.reels_ranked': false });
    await dropRankedCaches();
    // Newest first again (other suites' newer reels may fill the page).
    expect((await reels())[0]).toBe(fresh.id);
  });
});

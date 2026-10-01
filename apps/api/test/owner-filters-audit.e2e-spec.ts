import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/**
 * Audit 2026-10-01: every filter does its job on the server — the state
 * filter keeps the author checks, Search uses qualifications like the
 * feed, explore grids filter every page, tags carry post counts.
 */
jest.setTimeout(60_000);

describe('Filters audit (e2e, 2026-10-01)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
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
    await ensurePostPractices(prisma);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(role: 'client' | 'attorney', verified = true) {
    const u = await prisma.user.create({
      data: { role, phone_verified_at: role === 'client' ? new Date() : null },
    });
    if (role === 'client') {
      const handle = `cl_${u.id.slice(0, 8)}`;
      await prisma.clientProfile.create({
        data: {
          user_id: u.id,
          state_code: 'NY',
          preferred_languages: ['en'],
          username: handle,
          username_lower: handle,
        },
      });
    }
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: verified ? 'verified' : 'unverified',
        },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney' && verified,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  const post = (auth: Record<string, string>, body: Record<string, unknown>) =>
    api()
      .post('/api/v1/posts')
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send(body);

  const SUB = 'civil_litigation.arbitration_and_mediation_representation';

  async function license(attorneyId: string, state = 'NY') {
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: attorneyId,
        state_code: state,
        bar_number: `${state}-${randomUUID()}`,
        license_status: 'verified',
      },
    });
  }

  it('state filter keeps the author checks (suspended authors stay hidden)', async () => {
    const good = await user('attorney');
    const bad = await user('attorney');
    await license(good.id);
    await license(bad.id);
    const viewer = await user('client');
    const tag = `aud${randomUUID().slice(0, 6)}`;
    expect(
      (
        await post(good.auth, {
          title: 'Visible',
          body: `Visible #${tag}`,
          practiceCode: SUB,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post(bad.auth, {
          title: 'Hidden',
          body: `Hidden #${tag}`,
          practiceCode: SUB,
        })
      ).status,
    ).toBe(201);
    await prisma.user.update({
      where: { id: bad.id },
      data: { status: 'suspended' },
    });
    const latest = await api()
      .get('/api/v1/search/latest-posts')
      .query({ state: 'NY', practice: SUB })
      .set(viewer.auth)
      .expect(200);
    const authors = (latest.body.data as { author: { id: string } }[]).map(
      (p) => p.author.id,
    );
    expect(authors).toContain(good.id);
    expect(authors).not.toContain(bad.id);
    const tagged = await api()
      .get(`/api/v1/tags/${tag}/posts`)
      .query({ state: 'NY', sort: 'new' })
      .set(viewer.auth)
      .expect(200);
    expect(
      (tagged.body.data as { author: { id: string } }[]).map(
        (p) => p.author.id,
      ),
    ).toEqual([good.id]);

    // Tag search carries post counts.
    const tags = await api()
      .get('/api/v1/search/tags')
      .query({ q: tag })
      .set(viewer.auth)
      .expect(200);
    expect(tags.body.data[0]).toMatchObject({ tag, postsCount: 1 });
  });

  it('latest posts: photos only, period and popular on the server', async () => {
    const att = await user('attorney');
    await license(att.id);
    const viewer = await user('client');
    const plain = await post(att.auth, {
      title: 'Plain',
      body: 'Plain',
      practiceCode: SUB,
    });
    const liked = await post(att.auth, {
      title: 'Liked',
      body: 'Liked',
      practiceCode: SUB,
    });
    await prisma.post.update({
      where: { id: liked.body.data.id },
      data: { like_count: 50 },
    });
    await prisma.post.update({
      where: { id: plain.body.data.id },
      data: { created_at: new Date(Date.now() - 40 * 24 * 3600e3) },
    });
    const popular = await api()
      .get('/api/v1/search/latest-posts')
      .query({ practice: SUB, state: 'NY', sort: 'popular' })
      .set(viewer.auth)
      .expect(200);
    expect(popular.body.data[0].id).toBe(liked.body.data.id);
    const month = await api()
      .get('/api/v1/search/latest-posts')
      .query({ practice: SUB, state: 'NY', period: '30d' })
      .set(viewer.auth)
      .expect(200);
    const ids = (month.body.data as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(liked.body.data.id);
    expect(ids).not.toContain(plain.body.data.id);
    const photos = await api()
      .get('/api/v1/search/latest-posts')
      .query({ practice: SUB, state: 'NY', withPhotos: true })
      .set(viewer.auth)
      .expect(200);
    expect(
      (photos.body.data as { id: string }[]).some(
        (p) => p.id === liked.body.data.id,
      ),
    ).toBe(false);
  });

  it('case feed: budget / no bids / Not sure; search uses any qualification', async () => {
    const att = await user('attorney');
    await license(att.id);
    const client = await user('client');
    const notSure = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'general_practice.not_sure_or_other' },
    });
    const sub = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: SUB },
    });
    async function kase(areaId: string, extra: Record<string, unknown> = {}) {
      const c = await prisma.case.create({
        data: {
          client_id: client.id,
          title: 'Audit case about arbitration',
          description: 'Arbitration clause in my contract',
          practice_area_id: areaId,
          primary_state_code: 'NY',
          budget_mode: 'clarify_later',
          ...extra,
        },
      });
      await prisma.caseState.create({
        data: { case_id: c.id, state_code: 'NY', is_primary: true },
      });
      return c.id;
    }
    const unsure = await kase(notSure.id);
    const withBids = await kase(sub.id, { bids_count: 3 });
    const fresh = await kase(sub.id);
    // "Not sure" pill: any attorney licensed there sees those cases.
    const ns = await api()
      .get('/api/v1/cases')
      .query({ practice: 'general_practice.not_sure_or_other' })
      .set(att.auth)
      .expect(200);
    expect((ns.body.data as { id: string }[]).map((c) => c.id)).toContain(
      unsure,
    );
    // No bids yet — server side.
    const noBids = await api()
      .get('/api/v1/cases')
      .query({ practice: 'civil_litigation', noBids: true })
      .set(att.auth)
      .expect(200);
    const ids = (noBids.body.data as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(fresh);
    expect(ids).not.toContain(withBids);
    // Search › Cases: any qualification (not only my practices).
    const s = await api()
      .get('/api/v1/search/cases')
      .query({ q: 'arbitration', practiceCategory: 'civil_litigation' })
      .set(att.auth)
      .expect(200);
    expect((s.body.data as { id: string }[]).map((c) => c.id)).toEqual(
      expect.arrayContaining([fresh, withBids]),
    );
  });
});

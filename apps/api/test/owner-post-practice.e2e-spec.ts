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
 * Owner 2026-09-30: a post has a title, a qualification (category or
 * subcategory) and a kind (post / News — attorneys only); the feed filters
 * by qualification (a category includes its subcategories) and News; the
 * attorney profile lists News apart.
 */
jest.setTimeout(60_000);

describe('Post qualifications and News (e2e, owner 2026-09-30)', () => {
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

  it('stores the title, the qualification and the kind', async () => {
    const att = await user('attorney');
    const r = await post(att.auth, {
      title: 'Arbitration clauses explained',
      practiceCode: SUB,
      kind: 'news',
      body: 'What changed this year.',
    });
    expect(r.status).toBe(201);
    expect(r.body.data.title).toBe('Arbitration clauses explained');
    expect(r.body.data.kind).toBe('news');
    expect(r.body.data.practice).toMatchObject({
      code: SUB,
      categoryCode: 'civil_litigation',
    });
  });

  it('a post or news without a qualification (owner 2026-10-01)', async () => {
    const att = await user('attorney');
    const r = await post(att.auth, {
      title: 'Election day: courts close early',
      kind: 'news',
      body: 'General news, no area of law.',
    });
    expect(r.status).toBe(201);
    expect(r.body.data.practice).toBeNull();
  });

  it('refuses a missing title, an unknown qualification and client News', async () => {
    const att = await user('attorney');
    const noTitle = await post(att.auth, { practiceCode: SUB, body: 'x' });
    expect(noTitle.status).toBe(400);
    const unknown = await post(att.auth, {
      title: 'T',
      practiceCode: 'no_such_practice',
      body: 'x',
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('VALIDATION_ERROR');

    const client = await user('client');
    const news = await post(client.auth, {
      title: 'T',
      practiceCode: SUB,
      kind: 'news',
      body: 'x',
    });
    expect(news.status).toBe(403);
    expect(news.body.error.code).toBe('POST_NOT_ALLOWED');
    const ok = await post(client.auth, {
      title: 'My story',
      practiceCode: SUB,
      body: 'x',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data.kind).toBe('post');
  });

  it('filters the feed by qualification (with subcategories) and News', async () => {
    const att = await user('attorney');
    const marker = randomUUID().slice(0, 8);
    const sub = await post(att.auth, {
      title: `sub ${marker}`,
      practiceCode: SUB,
      body: 'sub',
    });
    const news = await post(att.auth, {
      title: `news ${marker}`,
      practiceCode: 'civil_litigation',
      kind: 'news',
      body: 'news',
    });
    const other = await post(att.auth, {
      title: `other ${marker}`,
      practiceCode: 'family_law',
      body: 'other',
    });
    const ids = (r: request.Response) =>
      (r.body.data as { id: string }[]).map((p) => p.id);

    const cat = await api()
      .get('/api/v1/search/latest-posts?practice=civil_litigation')
      .set(att.auth);
    expect(cat.status).toBe(200);
    expect(ids(cat)).toEqual(
      expect.arrayContaining([sub.body.data.id, news.body.data.id]),
    );
    expect(ids(cat)).not.toContain(other.body.data.id);

    const leaf = await api()
      .get(`/api/v1/search/latest-posts?practice=${SUB}`)
      .set(att.auth);
    expect(ids(leaf)).toContain(sub.body.data.id);
    expect(ids(leaf)).not.toContain(news.body.data.id);

    const onlyNews = await api()
      .get('/api/v1/search/latest-posts?kind=news')
      .set(att.auth);
    expect(ids(onlyNews)).toContain(news.body.data.id);
    expect(ids(onlyNews)).not.toContain(sub.body.data.id);

    const profileNews = await api()
      .get(`/api/v1/attorneys/${att.id}/posts?kind=news`)
      .set(att.auth);
    expect(ids(profileNews)).toEqual([news.body.data.id]);
  });

  it('edits the title and the qualification', async () => {
    const att = await user('attorney');
    const r = await post(att.auth, {
      title: 'Old',
      practiceCode: 'family_law',
      body: 'text',
    });
    const e = await api()
      .patch(`/api/v1/posts/${r.body.data.id}`)
      .set(att.auth)
      .send({ title: 'New', practiceCode: SUB, body: 'text 2' });
    expect(e.status).toBe(200);
    expect(e.body.data.title).toBe('New');
    expect(e.body.data.practice.code).toBe(SUB);
  });
});

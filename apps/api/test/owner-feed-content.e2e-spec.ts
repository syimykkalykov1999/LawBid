import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-05: legal posts vs general (personal) posts. A post with a
 * law topic or News is legal; without one it is general unless the author
 * marks it legal. "Legal only" viewers never get general posts in the
 * feed, the topic lists or search; moderation can reclassify.
 */
jest.setTimeout(60_000);

describe('Feed content: legal vs general posts (e2e, owner 2026-10-05)', () => {
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
    // States belong to a country (owner 2026-10-05).
    await prisma.country.upsert({
      where: { code: 'US' },
      create: {
        code: 'US',
        name: 'United States',
        is_enabled: true,
        calling_code: '1',
        currency: 'USD',
        region_kind: 'state',
        sort: 0,
      },
      update: {},
    });
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
      data: {
        email: `e2e-${crypto.randomUUID()}@example.com`,
        role,
        phone_verified_at: role === 'client' ? new Date() : null,
      },
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

  const ids = (r: request.Response) =>
    (r.body.data as { id: string }[]).map((p) => p.id);

  it('classifies posts, filters a "legal only" viewer, lets moderation reclassify', async () => {
    const att = await user('attorney');
    const cl = await user('client');
    const viewer = await user('client');

    const legal = await post(att.auth, {
      title: 'Arbitration clauses explained',
      practiceCode: SUB,
      body: 'What changed this year.',
    });
    expect(legal.status).toBe(201);
    expect(legal.body.data.contentClass).toBe('legal');

    const food = await post(cl.auth, {
      title: 'Lunch today',
      body: 'Plov with tomatoes.',
    });
    expect(food.status).toBe(201);
    expect(food.body.data.contentClass).toBe('general');

    // No topic, but the author marks it legal.
    const marked = await post(cl.auth, {
      title: 'My landlord kept the deposit',
      body: 'Is that allowed?',
      contentClass: 'legal',
    });
    expect(marked.body.data.contentClass).toBe('legal');

    // Default: everything.
    const prefs = await api().get('/api/v1/feed/preferences').set(viewer.auth);
    expect(prefs.status).toBe(200);
    expect(prefs.body.data.contentMode).toBe('all');
    let latest = await api()
      .get('/api/v1/search/latest-posts')
      .set(viewer.auth);
    expect(ids(latest)).toEqual(
      expect.arrayContaining([
        legal.body.data.id,
        food.body.data.id,
        marked.body.data.id,
      ]),
    );

    // "Legal only".
    const bad = await api()
      .put('/api/v1/feed/preferences')
      .set(viewer.auth)
      .send({ contentMode: 'nope' });
    expect(bad.status).toBe(400);
    const set = await api()
      .put('/api/v1/feed/preferences')
      .set(viewer.auth)
      .send({ contentMode: 'legal_only' });
    expect(set.status).toBe(200);
    expect(set.body.data.contentMode).toBe('legal_only');

    latest = await api().get('/api/v1/search/latest-posts').set(viewer.auth);
    expect(ids(latest)).toEqual(
      expect.arrayContaining([legal.body.data.id, marked.body.data.id]),
    );
    expect(ids(latest)).not.toContain(food.body.data.id);

    const feed = await api().get('/api/v1/feed').set(viewer.auth);
    expect(feed.status).toBe(200);
    expect(ids(feed)).not.toContain(food.body.data.id);

    // The "Posts" topic asks for general posts explicitly.
    const general = await api()
      .get('/api/v1/search/latest-posts?contentClass=general')
      .set(viewer.auth);
    expect(ids(general)).toContain(food.body.data.id);
    expect(ids(general)).not.toContain(legal.body.data.id);

    // Moderation: mark the food post legal; the author's edit keeps it.
    const admin = await adminSession(baseUrl, prisma, 'super_admin');
    const listed = await api()
      .get(`/api/v1/admin/content/posts?authorId=${cl.id}&contentClass=general`)
      .set(admin.auth);
    expect(listed.status).toBe(200);
    expect(ids(listed)).toEqual([food.body.data.id]);
    const cls = await api()
      .post('/api/v1/admin/content/posts/classify')
      .set(admin.auth)
      .send({ ids: [food.body.data.id, randomUUID()], contentClass: 'legal' });
    expect(cls.status).toBe(200);
    expect(cls.body.data.done).toEqual([food.body.data.id]);
    expect(cls.body.data.skipped).toHaveLength(1);
    await api()
      .patch(`/api/v1/posts/${food.body.data.id}`)
      .set(cl.auth)
      .send({ body: 'Plov again.', contentClass: 'general' })
      .expect(200);
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: food.body.data.id },
    });
    expect(row.content_class).toBe('legal');
    expect(row.content_class_locked).toBe(true);

    // Back to automatic: no topic = general again.
    await api()
      .post('/api/v1/admin/content/posts/classify')
      .set(admin.auth)
      .send({ ids: [food.body.data.id], contentClass: 'auto' })
      .expect(200);
    const back = await prisma.post.findUniqueOrThrow({
      where: { id: food.body.data.id },
    });
    expect(back.content_class).toBe('general');
    expect(back.content_class_locked).toBe(false);
  });
});

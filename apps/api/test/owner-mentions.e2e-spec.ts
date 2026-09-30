import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/** OQ-042: @username mentions in posts and comments. */
jest.setTimeout(120_000);

describe('Mentions (e2e, OQ-042)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
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
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    const cat = await prisma.practiceArea.upsert({
      where: { code: 'e2e_mn_cat' },
      create: {
        code: 'e2e_mn_cat',
        name_en: 'Client cat',
        i18n_key: 'practice.e2e_mn_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_mn_cat.leaf' },
      create: {
        code: 'e2e_mn_cat.leaf',
        parent_id: cat.id,
        name_en: 'Client leaf',
        i18n_key: 'practice.e2e_mn_cat.leaf',
        sort: 1,
      },
      update: {},
    });
    leafId = leaf.id;
  });

  afterAll(async () => {
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
    const handle = `att${randomUUID().slice(0, 8)}`;
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

  async function withProfile(id: string) {
    const handle = `cl${randomUUID().slice(0, 8)}`;
    await prisma.clientProfile.create({
      data: {
        user_id: id,
        state_code: 'NY',
        preferred_languages: ['en'],
        username: handle,
        username_lower: handle,
      },
    });
    return handle;
  }

  const mentionCount = (userId: string) =>
    prisma.notification.count({ where: { user_id: userId, type: 'mention' } });

  it('links and notifies mentioned people once; edits notify only new ones', async () => {
    const author = await attorney();
    const cli = await client();
    const clientHandle = await withProfile(cli.id);
    const other = await attorney();
    const otherHandle = (
      await prisma.attorneyProfile.findUniqueOrThrow({
        where: { user_id: other.id },
      })
    ).username;
    const blocker = await client();
    const blockerHandle = await withProfile(blocker.id);
    await prisma.userBlock.create({
      data: { blocker_id: blocker.id, blocked_id: author.id },
    });

    const post = await api()
      .post('/api/v1/posts')
      .set(author.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        body: `Great talk with @${clientHandle} and @${blockerHandle}, hi @nobody_here #law`,
      });
    expect(post.status).toBe(201);
    const mentions = post.body.data.mentions as {
      username: string;
      kind: string;
      userId: string;
    }[];
    expect(mentions.map((m) => m.kind)).toEqual(['client', 'client']);
    expect(mentions[0]).toMatchObject({
      username: clientHandle,
      userId: cli.id,
    });
    expect(await mentionCount(cli.id)).toBe(1);
    // Blocked either way: no notification.
    expect(await mentionCount(blocker.id)).toBe(0);

    // An edit adding someone notifies only the newcomer.
    const edited = await api()
      .patch(`/api/v1/posts/${post.body.data.id}`)
      .set(author.auth)
      .send({ body: `Great talk with @${clientHandle} and @${otherHandle}` });
    expect(edited.status).toBe(200);
    expect(await mentionCount(cli.id)).toBe(1);
    expect(await mentionCount(other.id)).toBe(1);

    // A comment mention; the post author is told via post_comment only,
    // and nobody is notified about mentioning themself.
    const comment = await api()
      .post(`/api/v1/posts/${post.body.data.id}/comments`)
      .set(cli.auth)
      .send({ body: `@${otherHandle} agreed! @${clientHandle}` });
    expect(comment.status).toBe(201);
    expect(comment.body.data.mentions).toHaveLength(2);
    expect(await mentionCount(other.id)).toBe(2);
    expect(await mentionCount(cli.id)).toBe(1);
    expect(await mentionCount(author.id)).toBe(0);
  });
});

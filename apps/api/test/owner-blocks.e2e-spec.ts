import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CounterAggregator } from '../src/modules/counters/counter-aggregator.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner decision 2026-09-29 (docs/OPEN_QUESTIONS.md OQ-028): any user can
 * block any other. While blocked: no messages either way, no follows
 * (existing ones removed), hidden from each other's People search,
 * profile flags; unblock restores everything.
 */
jest.setTimeout(120_000);

describe('User blocks (e2e, OQ-028)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  const token = `bk${randomUUID().replace(/-/g, '').slice(0, 8)}`;

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
      subscriptionStatus: 'none',
    });
    return { Authorization: `Bearer ${t}` };
  }

  async function attorney(username: string) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Att', last_name: username },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username.toLowerCase(),
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  async function client(username: string) {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: 'Cli', last_name: username },
    });
    await prisma.clientProfile.create({
      data: {
        user_id: u.id,
        state_code: 'NY',
        username,
        username_lower: username.toLowerCase(),
      },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  async function conversation(clientId: string, attorneyId: string) {
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'blocks_e2e' },
      create: {
        code: 'blocks_e2e',
        name_en: 'Blocks e2e',
        i18n_key: 'practice.blocks_e2e',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'blocks_e2e.leaf' },
      create: {
        code: 'blocks_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.blocks_e2e.leaf',
        sort: 0,
      },
      update: {},
    });
    const kase = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Blocked chat case',
        description: 'Details',
        practice_area_id: area.id,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    return prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: clientId,
        attorney_id: attorneyId,
        status: 'active',
        contacts_unlocked: true,
        participants: {
          create: [{ user_id: clientId }, { user_id: attorneyId }],
        },
      },
    });
  }

  it('block: removes follows, stops follows and messages both ways, hides from People; unblock restores', async () => {
    const att = await attorney(`${token}.att`);
    const cli = await client(`${token}.cli`);

    // A follow that the block will remove.
    expect(
      (await api().post(`/api/v1/attorneys/${att.id}/follow`).set(cli.auth))
        .status,
    ).toBe(204);

    // Block (client blocks attorney), idempotent.
    expect(
      (await api().put(`/api/v1/users/${att.id}/block`).set(cli.auth)).status,
    ).toBe(204);
    expect(
      (await api().put(`/api/v1/users/${att.id}/block`).set(cli.auth)).status,
    ).toBe(204);
    expect(
      await prisma.follow.count({
        where: { follower_id: cli.id, followee_id: att.id },
      }),
    ).toBe(0);

    // Listed.
    const list = await api().get('/api/v1/users/me/blocks').set(cli.auth);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        id: att.id,
        role: 'attorney',
        username: `${token}.att`,
      }),
    ]);

    // No follow while blocked.
    const refollow = await api()
      .post(`/api/v1/attorneys/${att.id}/follow`)
      .set(cli.auth);
    expect(refollow.status).toBe(403);
    expect(refollow.body.error.code).toBe('USER_BLOCKED');

    // No messages either way.
    const conv = await conversation(cli.id, att.id);
    for (const who of [cli.auth, att.auth]) {
      const r = await api()
        .post(`/api/v1/conversations/${conv.id}/messages`)
        .set(who)
        .send({ body: 'hello there', clientMessageId: randomUUID() });
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('USER_BLOCKED');
    }

    // Hidden from each other's People search.
    const fromClient = await api()
      .get('/api/v1/search/people')
      .query({ q: `${token}.att` })
      .set(cli.auth);
    expect(
      (fromClient.body.data as { attorney: { id: string } | null }[]).some(
        (i) => i.attorney?.id === att.id,
      ),
    ).toBe(false);
    const fromAttorney = await api()
      .get('/api/v1/search/people')
      .query({ q: `${token}.cli` })
      .set(att.auth);
    expect(
      (fromAttorney.body.data as { client: { id: string } | null }[]).some(
        (i) => i.client?.id === cli.id,
      ),
    ).toBe(false);

    // Profile flags.
    const seenByClient = await api()
      .get(`/api/v1/attorneys/${token}.att`)
      .set(cli.auth);
    expect(seenByClient.body.data).toMatchObject({
      isBlocked: true,
      hasBlockedMe: false,
    });
    const seenByAttorney = await api()
      .get(`/api/v1/clients/${token}.cli`)
      .set(att.auth);
    expect(seenByAttorney.body.data).toMatchObject({
      isBlocked: false,
      hasBlockedMe: true,
    });

    // Unblock restores.
    expect(
      (await api().delete(`/api/v1/users/${att.id}/block`).set(cli.auth))
        .status,
    ).toBe(204);
    expect(
      (await api().post(`/api/v1/attorneys/${att.id}/follow`).set(cli.auth))
        .status,
    ).toBe(204);
    const msg = await api()
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .set(cli.auth)
      .send({ body: 'hello again', clientMessageId: randomUUID() });
    expect(msg.status).toBe(201);
  });

  it('audit: a block fixes follower counters and stops comments, likes, saves, reviews and notifications', async () => {
    const att = await attorney(`${token}.aud`);
    const cli = await client(`${token}.audc`);
    const counters = app.get(CounterAggregator);
    const followers = async () =>
      (
        await prisma.attorneyProfile.findUniqueOrThrow({
          where: { user_id: att.id },
          select: { followers_count: true },
        })
      ).followers_count;
    expect(
      (await api().post(`/api/v1/attorneys/${att.id}/follow`).set(cli.auth))
        .status,
    ).toBe(204);
    await counters.flush();
    expect(await followers()).toBe(1);
    const post = await prisma.post.create({
      data: { author_id: att.id, body: 'Tenant rights after a lease ends' },
    });

    const before = await prisma.notification.count({
      where: { user_id: att.id },
    });
    // The attorney blocks the client: the follow and its count go.
    expect(
      (await api().put(`/api/v1/users/${cli.id}/block`).set(att.auth)).status,
    ).toBe(204);
    await counters.flush();
    expect(await followers()).toBe(0);

    const blocked = (r: {
      status: number;
      body: { error?: { code?: string } };
    }) => {
      expect(r.status).toBe(403);
      expect(r.body.error?.code).toBe('USER_BLOCKED');
    };
    blocked(
      await api()
        .post(`/api/v1/posts/${post.id}/comments`)
        .set(cli.auth)
        .send({ body: 'Hello there' }),
    );
    blocked(await api().post(`/api/v1/posts/${post.id}/like`).set(cli.auth));
    blocked(
      await api()
        .post('/api/v1/saved-items')
        .set(cli.auth)
        .send({ itemType: 'post', itemId: post.id }),
    );
    blocked(
      await api()
        .put(`/api/v1/attorneys/${att.id}/reviews/mine`)
        .set(cli.auth)
        .send({ rating: 1, body: 'Never answered my calls at all.' }),
    );
    // Nothing new reached the attorney from the blocked client.
    expect(
      await prisma.notification.count({ where: { user_id: att.id } }),
    ).toBe(before);
  });

  it('cannot block yourself; unknown user is 404', async () => {
    const cli = await client(`${token}.self`);
    expect(
      (await api().put(`/api/v1/users/${cli.id}/block`).set(cli.auth)).status,
    ).toBe(422);
    expect(
      (await api().put(`/api/v1/users/${randomUUID()}/block`).set(cli.auth))
        .status,
    ).toBe(404);
  });
});

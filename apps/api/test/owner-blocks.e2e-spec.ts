import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CounterAggregator } from '../src/modules/counters/counter-aggregator.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { shardContext } from '../src/sharding/shard-context';
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
    ).toBe(200);

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
    ).toBe(200);
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
    ).toBe(200);
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

  // CONTENT_MEDIA_VERIFY 17.11 №5 (probe P7: viewPost 200): a post by direct
  // link follows the feed's rule — nobody blocked either way sees it (404, as
  // on Instagram), also from a cached ETag (no 304); unblock shows it again.
  it("a blocked user opening the blocker's post by link gets 404, both ways, also with an ETag", async () => {
    const att = await attorney(`${token}.lnk`);
    const cli = await client(`${token}.lnkc`);
    const attPost = await prisma.post.create({
      data: { author_id: att.id, body: 'Deposit returns after moving out' },
    });
    const cliPost = await prisma.post.create({
      data: { author_id: cli.id, body: 'Looking for a tenant lawyer' },
    });
    const first = await api().get(`/api/v1/posts/${attPost.id}`).set(cli.auth);
    expect(first.status).toBe(200);
    const etag = first.headers.etag;
    expect(etag).toBeTruthy();

    expect(
      (await api().put(`/api/v1/users/${cli.id}/block`).set(att.auth)).status,
    ).toBe(204);
    const byLink = await api().get(`/api/v1/posts/${attPost.id}`).set(cli.auth);
    expect(byLink.status).toBe(404);
    expect(byLink.body.error?.code).toBe('POST_NOT_FOUND');
    expect(
      (
        await api()
          .get(`/api/v1/posts/${attPost.id}`)
          .set(cli.auth)
          .set('If-None-Match', etag)
      ).status,
    ).toBe(404);
    // The other way too (the feed hides both ways).
    expect(
      (await api().get(`/api/v1/posts/${cliPost.id}`).set(att.auth)).status,
    ).toBe(404);
    // The authors still see their own posts.
    expect(
      (await api().get(`/api/v1/posts/${attPost.id}`).set(att.auth)).status,
    ).toBe(200);

    expect(
      (await api().delete(`/api/v1/users/${cli.id}/block`).set(att.auth))
        .status,
    ).toBe(204);
    expect(
      (await api().get(`/api/v1/posts/${attPost.id}`).set(cli.auth)).status,
    ).toBe(200);
  });

  // Verify batch 7 (BL1, 2026-11-17): a block and a follow of the same two
  // people take one per-pair advisory lock. The test holds that lock in its
  // own transaction (as the other side of the race would), writes there,
  // and lets the API call wait behind it.
  const pairKey = (a: string, b: string) =>
    a < b ? `block-pair:${a}:${b}` : `block-pair:${b}:${a}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // KNOWN_ERRORS 215: the lock is the app's, on the primary database (this
  // transaction has no shard context, so it runs there, as the app's
  // `global()` lock does); the row the other side writes goes to its
  // owner's database, where the app reads it (UserBlock: the blocker's,
  // Follow: the follower's). In one database both are the same one.
  const ownerWrites = <T>(ownerId: string, fn: () => Promise<T>) =>
    shardContext.runForUser(ownerId, fn);

  it('BL1: a follow racing a block waits for it and is refused; no follow survives', async () => {
    const att = await attorney(`${token}.race1`);
    const cli = await client(`${token}.racec1`);
    let follow: Promise<request.Response> | undefined;
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${pairKey(cli.id, att.id)}, 0))`;
        follow = api()
          .post(`/api/v1/attorneys/${att.id}/follow`)
          .set(cli.auth)
          .then((r) => r);
        await sleep(2000);
        // The follow passed its first check and waits for the lock; the
        // block lands now, in the blocker's database (KNOWN_ERRORS 215).
        await ownerWrites(att.id, () =>
          prisma.userBlock.create({
            data: { blocker_id: att.id, blocked_id: cli.id },
          }),
        );
      },
      { timeout: 30_000 },
    );
    const res = await follow!;
    expect(res.status).toBe(403);
    expect(
      await prisma.follow.count({
        where: { follower_id: cli.id, followee_id: att.id },
      }),
    ).toBe(0);
  });

  it('BL1: a block racing a follow waits for it and removes that follow', async () => {
    const att = await attorney(`${token}.race2`);
    const cli = await client(`${token}.racec2`);
    let block: Promise<request.Response> | undefined;
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${pairKey(cli.id, att.id)}, 0))`;
        block = api()
          .put(`/api/v1/users/${att.id}/block`)
          .set(cli.auth)
          .then((r) => r);
        await sleep(2000);
        // The block waits for the lock; the follow lands now, in the
        // follower's database (KNOWN_ERRORS 215).
        await ownerWrites(cli.id, () =>
          prisma.follow.create({
            data: { follower_id: cli.id, followee_id: att.id },
          }),
        );
      },
      { timeout: 30_000 },
    );
    expect((await block!).status).toBe(204);
    expect(
      await prisma.follow.count({
        where: { follower_id: cli.id, followee_id: att.id },
      }),
    ).toBe(0);
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

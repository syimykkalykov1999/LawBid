import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/** Owner 2026-10-18 (Instagram Insights): POST /posts/events records
 * impressions and profile visits from a post (batch, one per viewer + post
 * + kind per 24 h, never the author's own); GET /posts/:id/insights shows
 * the numbers to the post's author only (an assistant with the "posts"
 * duty acts for the attorney; anyone else 404, an assistant without the
 * duty 403). */
jest.setTimeout(120_000);

type Auth = Record<string, string>;

describe('Post insights (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';

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
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
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

  const api = () => request(base);
  const bearer = (id: string, role: string): Auth => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function attorney(subscribed = false) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Ins', last_name: 'Ights' },
    });
    const username = `pi${u.id.slice(0, 10)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    if (subscribed) {
      await prisma.subscription.create({
        data: {
          user_id: u.id,
          status: 'active',
          price_cents: 39900,
          plan: 'monthly',
          assistant_seats: 2,
        },
      });
    }
    return { id: u.id, auth: bearer(u.id, 'attorney') };
  }

  async function client() {
    const tag = randomUUID().replace(/-/g, '').slice(0, 10);
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Vie',
        last_name: 'Wer',
        client_profile: {
          create: {
            state_code: 'NY',
            username: `pv${tag}`,
            username_lower: `pv${tag}`,
          },
        },
      },
    });
    return { id: u.id, auth: bearer(u.id, 'client') };
  }

  async function assistant(attorneyId: string, duties: string[]) {
    const u = await prisma.user.create({
      data: { role: 'assistant', first_name: 'As', last_name: 'Sistant' },
    });
    await prisma.assistantMembership.create({
      data: {
        attorney_id: attorneyId,
        assistant_user_id: u.id,
        phone_e164: `+1312555${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`,
        status: 'active',
        approval: 'attorney_added',
        duties,
      },
    });
    return { id: u.id, auth: bearer(u.id, 'assistant') };
  }

  const post = async (authorId: string) =>
    (await prisma.post.create({ data: { author_id: authorId, body: 'Hi' } }))
      .id;

  const events = (who: { auth: Auth }, list: unknown[]) =>
    api().post('/api/v1/posts/events').set(who.auth).send({ events: list });

  const insights = (who: { auth: Auth }, id: string, tzOffset?: unknown) =>
    api()
      .get(`/api/v1/posts/${id}/insights`)
      .query(tzOffset === undefined ? {} : { tzOffset })
      .set(who.auth);

  it('the author sees the numbers after events; the counts are deduped', async () => {
    const a = await attorney();
    const follower = await client();
    const stranger = await client();
    const p = await post(a.id);
    await prisma.follow.create({
      data: { follower_id: follower.id, followee_id: a.id },
    });

    const empty = await insights(a, p);
    expect(empty.status).toBe(200);
    expect(empty.body.data.totals).toEqual({
      impressions: 0,
      reach: 0,
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      reposts: 0,
      shares: 0,
      profileVisits: 0,
    });
    expect(empty.body.data.days).toHaveLength(1);

    const imp = { postId: p, kind: 'impression' };
    expect((await events(follower, [imp, imp])).status).toBe(204);
    expect((await events(follower, [imp])).status).toBe(204);
    expect(
      (
        await events(stranger, [
          imp,
          { postId: p, kind: 'profile_visit' },
          { postId: randomUUID(), kind: 'impression' },
        ])
      ).status,
    ).toBe(204);
    // The author's own impression is never counted.
    expect((await events(a, [imp])).status).toBe(204);
    // A reel view (its own endpoint) counts as a view and reaches the
    // same person once.
    expect(
      (await api().post(`/api/v1/posts/${p}/view`).set(follower.auth)).status,
    ).toBe(204);
    expect(
      (await api().post(`/api/v1/posts/${p}/like`).set(follower.auth)).status,
    ).toBe(204);
    expect(
      (await api().post(`/api/v1/posts/${p}/share`).set(stranger.auth)).status,
    ).toBe(204);
    await prisma.savedItem.create({
      data: { user_id: stranger.id, item_type: 'post', item_id: p },
    });
    await prisma.comment.create({
      data: { post_id: p, author_id: stranger.id, body: 'Nice' },
    });
    await prisma.comment.create({
      data: {
        post_id: p,
        author_id: stranger.id,
        body: 'Gone',
        deleted_at: new Date(),
      },
    });
    await prisma.postRepost.create({
      data: { post_id: p, user_id: follower.id },
    });

    const res = await insights(a, p, 180);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.postId).toBe(p);
    expect(d.totals).toEqual({
      impressions: 2,
      reach: 2,
      views: 1,
      likes: 1,
      comments: 1,
      saves: 1,
      reposts: 1,
      shares: 1,
      profileVisits: 1,
    });
    expect(d.interactions).toBe(5);
    expect(d.reachFollowers).toBe(1);
    expect(d.reachNonFollowers).toBe(1);
    expect(d.days).toHaveLength(1);
    const today = new Date(Date.now() + 180 * 60_000)
      .toISOString()
      .slice(0, 10);
    expect(d.days[0]).toEqual({ date: today, ...d.totals });

    // Older activity: totals keep it, the series starts 30 days back.
    const old = new Date(Date.now() - 40 * 86_400_000);
    await prisma.post.update({ where: { id: p }, data: { created_at: old } });
    await prisma.postViewEvent.create({
      data: {
        post_id: p,
        viewer_id: stranger.id,
        kind: 'impression',
        created_at: old,
      },
    });
    const older = (await insights(a, p)).body.data;
    expect(older.days).toHaveLength(30);
    expect(older.totals.impressions).toBe(3);
    const series = older.days as { impressions: number }[];
    expect(series.reduce((s, x) => s + x.impressions, 0)).toBe(2);
    // A post 2 days old has 3 days (today included).
    await prisma.post.update({
      where: { id: p },
      data: { created_at: new Date(Date.now() - 2 * 86_400_000) },
    });
    expect((await insights(a, p, 0)).body.data.days).toHaveLength(3);
  });

  it('nobody but the author sees them', async () => {
    const a = await attorney(true);
    const other = await attorney();
    const viewer = await client();
    const p = await post(a.id);

    expect((await insights(viewer, p)).status).toBe(404);
    expect((await insights(other, p)).status).toBe(404);
    expect((await insights(a, randomUUID())).status).toBe(404);
    expect((await insights(a, p, 9999)).status).toBe(400);

    const noDuty = await assistant(a.id, ['chats']);
    const r = await insights(noDuty, p);
    expect(r.status).toBe(403);
    expect(r.body.error?.code ?? r.body.code).toBe('ASSISTANT_NOT_ALLOWED');

    const withDuty = await assistant(a.id, ['posts']);
    expect((await insights(withDuty, p)).status).toBe(200);
    // An assistant browsing for the attorney adds no impressions.
    await events(withDuty, [{ postId: p, kind: 'impression' }]);
    // A deleted post is gone for the author too.
    expect((await insights(a, p)).body.data.totals.impressions).toBe(0);
    await prisma.post.update({
      where: { id: p },
      data: { deleted_at: new Date() },
    });
    expect((await insights(a, p)).status).toBe(404);
  });

  it('validates the batch', async () => {
    const v = await client();
    const id = randomUUID();
    expect((await events(v, [])).status).toBe(400);
    expect((await events(v, [{ postId: id, kind: 'view' }])).status).toBe(400);
    expect(
      (await events(v, [{ postId: 'x', kind: 'impression' }])).status,
    ).toBe(400);
    const many = Array.from({ length: 51 }, () => ({
      postId: randomUUID(),
      kind: 'impression',
    }));
    expect((await events(v, many)).status).toBe(400);
  });
});

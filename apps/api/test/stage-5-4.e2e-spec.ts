import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CounterAggregator } from '../src/modules/counters/counter-aggregator.service';
import { ensurePostPractices } from './support/post-practices';

/**
 * docs/05 §16 stage 5.4 acceptance: a repeated like creates no duplicate;
 * a reply to a reply attaches to the top-level parent; the post author
 * deletes someone's comment under their post, a stranger can't; a client
 * commenter is "Anna K." with no profile to open; saves and reports.
 */
jest.setTimeout(90_000);

describe('Likes, comments, saves, reports (e2e, docs/05 §4–§5, stage 5.4)', () => {
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
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(role: 'client' | 'attorney', verified = true) {
    const u = await prisma.user.create({ data: { role } });
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

  async function publishedPost(authorId: string) {
    return (
      await prisma.post.create({
        data: { author_id: authorId, body: 'Your rights #dui' },
      })
    ).id;
  }

  it('a repeated like creates no duplicate and the counter is exact', async () => {
    const att = await user('attorney');
    const fan = await user('client');
    const postId = await publishedPost(att.id);
    for (let i = 0; i < 3; i++) {
      expect(
        (await api().post(`/api/v1/posts/${postId}/like`).set(fan.auth)).status,
      ).toBe(204);
    }
    await app.get(CounterAggregator).flush();
    expect(await prisma.postLike.count({ where: { post_id: postId } })).toBe(1);
    const p = await api().get(`/api/v1/posts/${postId}`).set(fan.auth);
    expect(p.body.data).toMatchObject({ likeCount: 1, likedByMe: true });
    await api().delete(`/api/v1/posts/${postId}/like`).set(fan.auth);
    await app.get(CounterAggregator).flush();
    expect(
      (await api().get(`/api/v1/posts/${postId}`).set(fan.auth)).body.data
        .likeCount,
    ).toBe(0);
  });

  it('reply to a reply attaches to the top-level parent; client shown as "Anna K."', async () => {
    const att = await user('attorney');
    const anna = await user('client');
    await prisma.user.update({
      where: { id: anna.id },
      data: { first_name: 'Anna', last_name: 'Kowalski' },
    });
    const postId = await publishedPost(att.id);
    const top = await api()
      .post(`/api/v1/posts/${postId}/comments`)
      .set(anna.auth)
      .send({ body: 'Question?' });
    expect(top.status).toBe(201);
    expect(top.body.data.author).toMatchObject({
      kind: 'client',
      displayName: 'Anna K.',
      attorneyId: null,
    });
    const reply = await api()
      .post(`/api/v1/posts/${postId}/comments`)
      .set(att.auth)
      .send({ body: 'Answer', parentCommentId: top.body.data.id });
    const replyToReply = await api()
      .post(`/api/v1/posts/${postId}/comments`)
      .set(anna.auth)
      .send({ body: 'Thanks!', parentCommentId: reply.body.data.id });
    expect(replyToReply.body.data.parentCommentId).toBe(top.body.data.id);
    const handle = (
      await prisma.attorneyProfile.findUniqueOrThrow({
        where: { user_id: att.id },
      })
    ).username;
    expect(replyToReply.body.data.body).toBe(`@${handle} Thanks!`);
    const replies = await api()
      .get(`/api/v1/comments/${top.body.data.id}/replies`)
      .set(anna.auth);
    expect((replies.body.data as unknown[]).length).toBe(2);
  });

  it('the post author deletes a comment under their post; a stranger cannot', async () => {
    const att = await user('attorney');
    const writer = await user('client');
    const stranger = await user('client');
    const postId = await publishedPost(att.id);
    const c = await api()
      .post(`/api/v1/posts/${postId}/comments`)
      .set(writer.auth)
      .send({ body: 'Hi' });
    const id = c.body.data.id as string;
    expect(
      (await api().delete(`/api/v1/comments/${id}`).set(stranger.auth)).status,
    ).toBe(404);
    expect(
      (await api().delete(`/api/v1/comments/${id}`).set(att.auth)).status,
    ).toBe(200);
    const list = await api()
      .get(`/api/v1/posts/${postId}/comments`)
      .set(writer.auth);
    expect(list.body.data).toEqual([]);
  });

  it('saved post becomes "unavailable" after deletion; repeated report is ignored', async () => {
    const att = await user('attorney');
    const reader = await user('client');
    const postId = await publishedPost(att.id);
    const save = await api()
      .post('/api/v1/saved-items')
      .set(reader.auth)
      .send({ itemType: 'post', itemId: postId });
    expect([200, 201, 204]).toContain(save.status);
    await prisma.post.update({
      where: { id: postId },
      data: { deleted_at: new Date() },
    });
    const saved = await api().get('/api/v1/saved-items/posts').set(reader.auth);
    const row = (
      saved.body.data as { postId: string; available: boolean }[]
    ).find((r) => r.postId === postId);
    expect(row?.available).toBe(false);

    for (let i = 0; i < 2; i++) {
      const r = await api()
        .post('/api/v1/reports')
        .set(reader.auth)
        .send({ targetType: 'post', targetId: postId, reason: 'spam' });
      expect(r.status).toBe(204);
    }
    expect(
      await prisma.report.count({
        where: { reporter_id: reader.id, target_id: postId },
      }),
    ).toBe(1);
  });
});

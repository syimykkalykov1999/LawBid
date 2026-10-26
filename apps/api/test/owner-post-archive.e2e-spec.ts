import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/** Owner 2026-10-18: Instagram-like «Архивировать» (gone for everyone but
 * the author: feed, profile, search, tag page, reposts tab; in the
 * author's Settings → «Архив»; «Показать в профиле» restores it) and
 * «Выключить комментарии» (no new comments or replies, existing ones
 * hidden, back when turned on). Clients are authors too. */
jest.setTimeout(120_000);

describe('Post archive and comments switch (e2e)', () => {
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
    await ensurePostPractices(prisma);
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
  const auth = (id: string, role: 'attorney' | 'client') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function attorney(first: string) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: first, last_name: 'Arc' },
    });
    const username = `ar${u.id.slice(0, 10)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  async function client(first: string) {
    const tag = randomUUID().replace(/-/g, '').slice(0, 10);
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: first,
        last_name: 'Cli',
        phone_verified_at: new Date(),
        client_profile: {
          create: {
            state_code: 'NY',
            username: `ac${tag}`,
            username_lower: `ac${tag}`,
          },
        },
      },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  async function post(a: { auth: Record<string, string> }, body: string) {
    const made = await api()
      .post('/api/v1/posts')
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ title: body.slice(0, 40), practiceCode: 'family_law', body });
    expect(made.status).toBe(201);
    return made.body.data.id as string;
  }

  const ids = (res: { body: { data: { id: string }[] } }) =>
    res.body.data.map((p) => p.id);

  /** What a fresh viewer (no cached lists) sees of [id]. */
  async function seenBy(
    authorId: string,
    id: string,
    token: string,
    tag: string,
  ) {
    const v = await client('Look');
    await api().post(`/api/v1/attorneys/${authorId}/follow`).set(v.auth);
    const open = await api().get(`/api/v1/posts/${id}`).set(v.auth);
    const profile = await api()
      .get(`/api/v1/attorneys/${authorId}/posts`)
      .set(v.auth);
    const feed = await api().get('/api/v1/feed').set(v.auth);
    const search = await api()
      .get('/api/v1/search/posts')
      .query({ q: token })
      .set(v.auth);
    const tagged = await api()
      .get(`/api/v1/tags/${tag}/posts`)
      .query({ sort: 'new' })
      .set(v.auth);
    for (const r of [profile, feed, search, tagged]) {
      expect(r.status).toBe(200);
    }
    return {
      opens: open.status === 200,
      profile: ids(profile).includes(id),
      feed: ids(feed).includes(id),
      search: ids(search).includes(id),
      tag: ids(tagged).includes(id),
    };
  }

  it('archives for everyone but the author, lists it in the archive, restores it', async () => {
    const author = await attorney('Ana');
    const token = `arch${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const tag = `${token}t`;
    const older = await post(author, `Older one ${token} #${tag}`);
    await new Promise((r) => setTimeout(r, 20));
    const id = await post(author, `Archive me ${token} #${tag}`);
    await new Promise((r) => setTimeout(r, 20));
    const newer = await post(author, `Newer one ${token} #${tag}`);

    // A reposter's tab, a like and a save are kept through the archive.
    const fan = await attorney('Fan');
    expect(
      (await api().post(`/api/v1/posts/${id}/repost`).set(fan.auth)).status,
    ).toBe(204);
    expect(
      (await api().post(`/api/v1/posts/${id}/like`).set(fan.auth)).status,
    ).toBe(204);

    expect(await seenBy(author.id, id, token, tag)).toEqual({
      opens: true,
      profile: true,
      feed: true,
      search: true,
      tag: true,
    });

    // Only the author archives it.
    const foreign = await api()
      .post(`/api/v1/posts/${id}/archive`)
      .set(fan.auth);
    expect(foreign.status).toBe(404);

    const archived = await api()
      .post(`/api/v1/posts/${id}/archive`)
      .set(author.auth);
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedAt).toEqual(expect.any(String));
    expect(archived.body.data.likeCount).toBe(1);
    // Idempotent.
    expect(
      (await api().post(`/api/v1/posts/${id}/archive`).set(author.auth)).status,
    ).toBe(200);

    expect(await seenBy(author.id, id, token, tag)).toEqual({
      opens: false,
      profile: false,
      feed: false,
      search: false,
      tag: false,
    });
    const reposts = await api()
      .get(`/api/v1/users/${fan.id}/reposts`)
      .set((await client('Rep')).auth);
    expect(ids(reposts)).not.toContain(id);

    // The author still opens it, but not in the own profile list.
    const mine = await api().get(`/api/v1/posts/${id}`).set(author.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.data.archivedAt).toEqual(expect.any(String));
    const ownProfile = await api()
      .get(`/api/v1/attorneys/${author.id}/posts`)
      .set(author.auth);
    expect(ids(ownProfile)).toEqual(expect.arrayContaining([older, newer]));
    expect(ids(ownProfile)).not.toContain(id);

    // Settings → «Архив»: newest archived first, only the author's own.
    await new Promise((r) => setTimeout(r, 20));
    await api().post(`/api/v1/posts/${older}/archive`).set(author.auth);
    const archive = await api()
      .get('/api/v1/me/archived-posts')
      .set(author.auth);
    expect(archive.status).toBe(200);
    expect(ids(archive)).toEqual([older, id]);
    const othersArchive = await api()
      .get('/api/v1/me/archived-posts')
      .set(fan.auth);
    expect(ids(othersArchive)).toEqual([]);

    // «Показать в профиле»: back at its place by publish date.
    const restored = await api()
      .delete(`/api/v1/posts/${id}/archive`)
      .set(author.auth);
    expect(restored.status).toBe(200);
    expect(restored.body.data.archivedAt).toBeNull();
    await api().delete(`/api/v1/posts/${older}/archive`).set(author.auth);
    const back = await api()
      .get(`/api/v1/attorneys/${author.id}/posts`)
      .set((await client('Back')).auth);
    expect(ids(back).filter((x) => [older, id, newer].includes(x))).toEqual([
      newer,
      id,
      older,
    ]);
    expect(await seenBy(author.id, id, token, tag)).toEqual({
      opens: true,
      profile: true,
      feed: true,
      search: true,
      tag: true,
    });
    const afterRestore = await api()
      .get(`/api/v1/users/${fan.id}/reposts`)
      .set((await client('Rep2')).auth);
    expect(ids(afterRestore)).toContain(id);
    expect(
      (await api().get('/api/v1/me/archived-posts').set(author.auth)).body.data,
    ).toEqual([]);
  });

  it('turns comments off and on: refuses new comments and replies, hides and keeps the old ones', async () => {
    const author = await client('Cara');
    const id = await post(author, 'Comments switch test');
    const reader = await attorney('Rob');

    const first = await api()
      .post(`/api/v1/posts/${id}/comments`)
      .set(reader.auth)
      .send({ body: 'First!' });
    expect(first.status).toBe(201);
    const commentId = first.body.data.id as string;

    // Only the author switches it.
    expect(
      (
        await api()
          .patch(`/api/v1/posts/${id}/comments-setting`)
          .set(reader.auth)
          .send({ enabled: false })
      ).status,
    ).toBe(404);
    const off = await api()
      .patch(`/api/v1/posts/${id}/comments-setting`)
      .set(author.auth)
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.commentsEnabled).toBe(false);

    const refused = await api()
      .post(`/api/v1/posts/${id}/comments`)
      .set(reader.auth)
      .send({ body: 'Second' });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('COMMENTS_DISABLED');
    const reply = await api()
      .post(`/api/v1/posts/${id}/comments`)
      .set(reader.auth)
      .send({ body: 'A reply', parentCommentId: commentId });
    expect(reply.status).toBe(403);

    const hidden = await api()
      .get(`/api/v1/posts/${id}/comments`)
      .set(reader.auth);
    expect(hidden.status).toBe(200);
    expect(hidden.body.data).toEqual([]);
    const seen = await api().get(`/api/v1/posts/${id}`).set(reader.auth);
    expect(seen.body.data).toMatchObject({
      commentsEnabled: false,
      commentCount: 0,
    });

    const on = await api()
      .patch(`/api/v1/posts/${id}/comments-setting`)
      .set(author.auth)
      .send({ enabled: true });
    expect(on.body.data.commentsEnabled).toBe(true);
    const shown = await api()
      .get(`/api/v1/posts/${id}/comments`)
      .set(reader.auth);
    expect(ids(shown)).toEqual([commentId]);
    expect(
      (
        await api()
          .post(`/api/v1/posts/${id}/comments`)
          .set(reader.auth)
          .send({ body: 'Back again' })
      ).status,
    ).toBe(201);
  });
});

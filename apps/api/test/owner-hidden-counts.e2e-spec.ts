import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/** Owner 2026-10-15 / 16.11 (Instagram): the author hides the like / view
 * counter — everyone, the author too, gets 0 and the "hidden" flag; «Показать»
 * brings the numbers back for everyone. */
jest.setTimeout(120_000);

describe('Hidden counters (e2e)', () => {
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

  it('hides likes and views from everyone, the author too', async () => {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Hid', last_name: 'Den' },
    });
    const username = `hd${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const author = auth(u.id, 'attorney');
    const viewer = await prisma.user.create({ data: { role: 'client' } });
    const v = auth(viewer.id, 'client');
    const made = await api()
      .post('/api/v1/posts')
      .set(author)
      .set('Idempotency-Key', randomUUID())
      .send({ title: 'T', practiceCode: 'family_law', body: 'Counters test' });
    expect(made.status).toBe(201);
    const id = made.body.data.id as string;
    await prisma.post.update({
      where: { id },
      data: { like_count: 41, view_count: 99, save_count: 7, share_count: 3 },
    });

    const open = await api().get(`/api/v1/posts/${id}`).set(v);
    expect(open.body.data).toMatchObject({
      likeCount: 41,
      viewCount: 99,
      saveCount: 7,
      shareCount: 3,
      likesHidden: false,
      viewsHidden: false,
    });

    const patched = await api()
      .patch(`/api/v1/posts/${id}/counters`)
      .set(author)
      .send({ hideLikes: true, hideViews: true });
    expect(patched.status).toBe(200);

    const hidden = await api().get(`/api/v1/posts/${id}`).set(v);
    expect(hidden.body.data).toMatchObject({
      likeCount: 0,
      viewCount: 0,
      saveCount: 0,
      shareCount: 0,
      repostCount: 0,
      likesHidden: true,
      viewsHidden: true,
    });
    const mine = await api().get(`/api/v1/posts/${id}`).set(author);
    expect(mine.body.data).toMatchObject({
      likeCount: 0,
      viewCount: 0,
      saveCount: 0,
      shareCount: 0,
      repostCount: 0,
      likesHidden: true,
      viewsHidden: true,
    });

    // «Показать»: the numbers come back for everyone, the author too.
    const shown = await api()
      .patch(`/api/v1/posts/${id}/counters`)
      .set(author)
      .send({ hideLikes: false, hideViews: false });
    expect(shown.status).toBe(200);
    expect(shown.body.data).toMatchObject({
      likeCount: 41,
      viewCount: 99,
      saveCount: 7,
      shareCount: 3,
    });
    for (const who of [author, v]) {
      const back = await api().get(`/api/v1/posts/${id}`).set(who);
      expect(back.body.data).toMatchObject({
        likeCount: 41,
        viewCount: 99,
        saveCount: 7,
        shareCount: 3,
        likesHidden: false,
        viewsHidden: false,
      });
    }

    // The viewer's own setting is stored on the account.
    const me = await api()
      .patch('/api/v1/users/me')
      .set(v)
      .send({ hideLikeCounts: true });
    expect(me.status).toBe(200);
    expect(me.body.data.hideLikeCounts).toBe(true);
  });

  it('toggles on and off for every list; the cached answer moves at once', async () => {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Tog', last_name: 'Gle' },
    });
    const username = `tg${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const author = auth(u.id, 'attorney');
    const viewer = await prisma.user.create({ data: { role: 'client' } });
    const v = auth(viewer.id, 'client');
    const made = await api()
      .post('/api/v1/posts')
      .set(author)
      .set('Idempotency-Key', randomUUID())
      .send({ title: 'T', practiceCode: 'family_law', body: 'Toggle test' });
    expect(made.status).toBe(201);
    const id = made.body.data.id as string;
    await prisma.post.update({
      where: { id },
      data: { like_count: 5, view_count: 12 },
    });
    // The viewer liked it: the likers list is the other place a number
    // could leak from.
    await api().post(`/api/v1/posts/${id}/like`).set(v).expect(204);
    // A repost and a like from an attorney with a profile (the lists only
    // carry people with a profile): the reposters list is the third place.
    const fan = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Fan', last_name: 'Club' },
    });
    const fanName = `fn${fan.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: fan.id,
        username: fanName,
        username_lower: fanName,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.postRepost.create({ data: { post_id: id, user_id: fan.id } });
    await prisma.postLike.create({ data: { post_id: id, user_id: fan.id } });

    const before = await api().get(`/api/v1/posts/${id}`).set(v);
    expect(before.status).toBe(200);
    expect(before.body.data.likeCount).toBeGreaterThan(0);
    expect(before.body.data.repostCount).toBe(1);
    const etag = before.headers.etag as string | undefined;

    const hide = await api()
      .patch(`/api/v1/posts/${id}/counters`)
      .set(author)
      .send({ hideLikes: true, hideViews: true });
    expect(hide.status).toBe(200);
    // The author's own answer: no numbers either, flags on.
    expect(hide.body.data).toMatchObject({
      likesHidden: true,
      viewsHidden: true,
      likeCount: 0,
      viewCount: 0,
    });

    // The viewer's earlier version tag no longer matches (no stale 304).
    const again = await api()
      .get(`/api/v1/posts/${id}`)
      .set(v)
      .set('If-None-Match', etag ?? '"none"');
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({
      likeCount: 0,
      viewCount: 0,
      repostCount: 0,
      likesHidden: true,
      viewsHidden: true,
    });

    // The profile grid (signed-in viewer) never carries the numbers.
    const grid = await api().get(`/api/v1/attorneys/${u.id}/posts`).set(v);
    expect(grid.status).toBe(200);
    const tile = (
      grid.body.data as { id: string; likeCount: number; viewCount: number }[]
    ).find((x) => x.id === id);
    expect(tile).toMatchObject({ likeCount: 0, viewCount: 0 });
    // The author's own grid neither.
    const ownGrid = await api()
      .get(`/api/v1/attorneys/${u.id}/posts`)
      .set(author);
    expect(ownGrid.status).toBe(200);
    expect(
      (
        ownGrid.body.data as {
          id: string;
          likeCount: number;
          viewCount: number;
        }[]
      ).find((x) => x.id === id),
    ).toMatchObject({ likeCount: 0, viewCount: 0 });

    // Who liked: an empty list for everyone (the like row is there).
    const likers = await api().get(`/api/v1/posts/${id}/likes`).set(v);
    expect(likers.status).toBe(200);
    expect(likers.body.data).toHaveLength(0);
    expect(
      await prisma.postLike.count({
        where: { post_id: id, user_id: viewer.id },
      }),
    ).toBe(1);
    const own = await api().get(`/api/v1/posts/${id}/likes`).set(author);
    expect(own.status).toBe(200);
    expect(own.body.data).toHaveLength(0);
    for (const who of [author, v]) {
      const reposters = await api().get(`/api/v1/posts/${id}/reposts`).set(who);
      expect(reposters.status).toBe(200);
      expect(reposters.body.data).toHaveLength(0);
    }

    // Only the author may switch it.
    const foreign = await api()
      .patch(`/api/v1/posts/${id}/counters`)
      .set(v)
      .send({ hideLikes: false });
    expect(foreign.status).not.toBe(200);

    // Show again: the viewer and the author see the numbers and who liked.
    const show = await api()
      .patch(`/api/v1/posts/${id}/counters`)
      .set(author)
      .send({ hideLikes: false, hideViews: false });
    expect(show.status).toBe(200);
    const visible = await api().get(`/api/v1/posts/${id}`).set(v);
    expect(visible.body.data).toMatchObject({
      viewCount: 12,
      likesHidden: false,
      viewsHidden: false,
    });
    expect(visible.body.data.likeCount).toBeGreaterThan(0);
    const ownBack = await api().get(`/api/v1/posts/${id}`).set(author);
    expect(ownBack.body.data).toMatchObject({ viewCount: 12 });
    expect(ownBack.body.data.likeCount).toBeGreaterThan(0);
    const likersBack = await api().get(`/api/v1/posts/${id}/likes`).set(author);
    expect(likersBack.body.data).toHaveLength(1);
    expect(ownBack.body.data.repostCount).toBe(1);
    const repostersBack = await api()
      .get(`/api/v1/posts/${id}/reposts`)
      .set(author);
    expect(repostersBack.body.data).toHaveLength(1);

    // One switch leaves the other as it was.
    const onlyViews = await api()
      .patch(`/api/v1/posts/${id}/counters`)
      .set(author)
      .send({ hideViews: true });
    expect(onlyViews.body.data).toMatchObject({
      likesHidden: false,
      viewsHidden: true,
    });
  });
});

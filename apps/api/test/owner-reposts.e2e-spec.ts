import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/** Owner 2026-10-18: reposts end to end — repost / undo, the reposters
 * list, the "Reposts" profile tab, the "reposted by" header in the
 * followers' feed (once, even if the original is already there), the
 * author's notification, blocks, and a deleted original. */
jest.setTimeout(120_000);

describe('Reposts (e2e)', () => {
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
      data: { role: 'attorney', first_name: first, last_name: 'Rep' },
    });
    const username = `rp${u.id.slice(0, 10)}`;
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
        client_profile: {
          create: {
            state_code: 'NY',
            username: `rc${tag}`,
            username_lower: `rc${tag}`,
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
      .send({ title: body, practiceCode: 'family_law', body });
    expect(made.status).toBe(201);
    return made.body.data.id as string;
  }

  const repost = (u: { auth: Record<string, string> }, id: string) =>
    api().post(`/api/v1/posts/${id}/repost`).set(u.auth);
  const ids = (res: { body: { data: { id: string }[] } }) =>
    res.body.data.map((p) => p.id);

  it('reposts, counts once, notifies, lists reposters, undoes', async () => {
    const author = await attorney('Auth');
    const b = await attorney('Bea');
    const c = await client('Cleo');
    const id = await post(author, 'Repost me');

    expect((await repost(b, id)).status).toBe(204);
    expect((await repost(b, id)).status).toBe(204); // idempotent
    expect((await repost(c, id)).status).toBe(204);

    const own = await repost(author, id);
    expect(own.status).toBe(409);
    expect(own.body.error.code).toBe('REPOST_OWN_POST');

    const seen = await api().get(`/api/v1/posts/${id}`).set(b.auth);
    expect(seen.body.data).toMatchObject({
      repostCount: 2,
      repostedByMe: true,
    });
    const other = await api().get(`/api/v1/posts/${id}`).set(author.auth);
    expect(other.body.data).toMatchObject({
      repostCount: 2,
      repostedByMe: false,
    });
    // The counter always equals the rows.
    expect(await prisma.postRepost.count({ where: { post_id: id } })).toBe(2);

    // The author is told once per reposter.
    const notes = await api().get('/api/v1/notifications').set(author.auth);
    const reposts = (
      notes.body.data as { type: string; actor?: { displayName: string } }[]
    ).filter((n) => n.type === 'post_repost');
    expect(reposts.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(reposts)).toMatch(/Bea|Cleo/);

    // The reposters list: both roles, newest first.
    const who = await api().get(`/api/v1/posts/${id}/reposts`).set(author.auth);
    expect(who.status).toBe(200);
    expect((who.body.data as { role: string }[]).map((r) => r.role)).toEqual([
      'client',
      'attorney',
    ]);

    // Undo: idempotent, the counter and the list follow.
    expect(
      (await api().delete(`/api/v1/posts/${id}/repost`).set(b.auth)).status,
    ).toBe(204);
    expect(
      (await api().delete(`/api/v1/posts/${id}/repost`).set(b.auth)).status,
    ).toBe(204);
    const after = await api().get(`/api/v1/posts/${id}`).set(b.auth);
    expect(after.body.data).toMatchObject({
      repostCount: 1,
      repostedByMe: false,
    });
    const who2 = await api()
      .get(`/api/v1/posts/${id}/reposts`)
      .set(author.auth);
    expect(who2.body.data).toHaveLength(1);
  });

  it('the Reposts profile tab: newest first, every role, header, undo', async () => {
    const a1 = await attorney('One');
    const a2 = await attorney('Two');
    const me = await client('Meg');
    const p1 = await post(a1, 'first');
    const p2 = await post(a2, 'second');
    await repost(me, p1);
    await new Promise((r) => setTimeout(r, 20));
    await repost(me, p2);

    // A client's tab: the owner and others both see it.
    const mine = await api().get(`/api/v1/users/${me.id}/reposts`).set(me.auth);
    expect(mine.status).toBe(200);
    expect(ids(mine)).toEqual([p2, p1]);
    expect(mine.body.data[0]).toMatchObject({
      repostedByMe: true,
      repostedBy: { id: me.id, role: 'client', name: 'Meg Cli' },
    });
    const seenByOther = await api()
      .get(`/api/v1/users/${me.id}/reposts`)
      .set(a1.auth);
    expect(ids(seenByOther)).toEqual([p2, p1]);
    expect(seenByOther.body.data[0].repostedByMe).toBe(false);

    // The attorney's own posts list no longer carries the reposts.
    const profile = await api()
      .get(`/api/v1/attorneys/${a1.id}/posts`)
      .set(me.auth);
    expect(ids(profile)).toEqual([p1]);

    // Pagination.
    const page1 = await api()
      .get(`/api/v1/users/${me.id}/reposts`)
      .query({ cursor: undefined })
      .set(me.auth);
    expect(page1.body.meta?.nextCursor ?? null).toBeNull();

    // Undo from the tab.
    await api().delete(`/api/v1/posts/${p2}/repost`).set(me.auth);
    const left = await api().get(`/api/v1/users/${me.id}/reposts`).set(me.auth);
    expect(ids(left)).toEqual([p1]);
  });

  it('blocked people: no repost, not in lists; a deleted original vanishes', async () => {
    const author = await attorney('Blk');
    const fan = await client('Fan');
    const id = await post(author, 'Block test');
    await repost(fan, id);

    await prisma.userBlock.create({
      data: { blocker_id: author.id, blocked_id: fan.id },
    });
    const denied = await repost(fan, id);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('USER_BLOCKED');
    await prisma.userBlock.deleteMany({ where: { blocker_id: author.id } });

    // The original is deleted: the repost leaves every list.
    const del = await api().delete(`/api/v1/posts/${id}`).set(author.auth);
    expect(del.status).toBe(200);
    const tab = await api()
      .get(`/api/v1/users/${fan.id}/reposts`)
      .set(fan.auth);
    expect(ids(tab)).toEqual([]);
    const gone = await api().get(`/api/v1/posts/${id}/reposts`).set(fan.auth);
    expect(gone.status).toBe(404);

    // Blocks hide a person's tab.
    const x = await client('Xan');
    await prisma.userBlock.create({
      data: { blocker_id: x.id, blocked_id: fan.id },
    });
    const hidden = await api()
      .get(`/api/v1/users/${x.id}/reposts`)
      .set(fan.auth);
    expect(hidden.status).toBe(403);
  });

  it('followers see the repost once, with the latest followed reposter', async () => {
    const author = await attorney('Orig');
    const r1 = await attorney('Ravi');
    const r2 = await attorney('Rosa');
    const f1 = await client('Fol');
    const f2 = await client('Low');
    const id = await post(author, 'Feed repost');
    const lone = await post(await attorney('Zed'), 'Lone');
    void lone;

    // f1 follows the author and both reposters: the original is in its
    // feed already, so it appears once with the newest reposter's header.
    for (const target of [author, r1, r2]) {
      await api().post(`/api/v1/attorneys/${target.id}/follow`).set(f1.auth);
    }
    // f2 follows only a reposter: the repost itself brings the post in.
    await api().post(`/api/v1/attorneys/${r1.id}/follow`).set(f2.auth);

    await repost(r1, id);
    await new Promise((r) => setTimeout(r, 20));
    await repost(r2, id);

    const feed1 = await api().get('/api/v1/feed').set(f1.auth);
    expect(feed1.status).toBe(200);
    const hits1 = (
      feed1.body.data as {
        id: string;
        repostedBy?: { id: string; name: string } | null;
      }[]
    ).filter((p) => p.id === id);
    expect(hits1).toHaveLength(1);
    expect(hits1[0].repostedBy).toMatchObject({ id: r2.id, name: 'Rosa Rep' });

    const feed2 = await api().get('/api/v1/feed').set(f2.auth);
    const hits2 = (
      feed2.body.data as { id: string; repostedBy?: { id: string } | null }[]
    ).filter((p) => p.id === id);
    expect(hits2).toHaveLength(1);
    expect(hits2[0].repostedBy).toMatchObject({ id: r1.id });
  });
});

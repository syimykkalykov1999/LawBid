import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/** Owner 2026-10-20: stories end to end — post a photo / text story, the
 * tray, who may see it (everyone / followers / phone contacts / hidden
 * from / blocked), views and the viewers list, deleting, the archive and
 * the privacy settings. */
jest.setTimeout(120_000);

describe('Stories (e2e)', () => {
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
      data: { role: 'attorney', first_name: first, last_name: 'Story' },
    });
    const username = `st${u.id.slice(0, 10)}`;
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
            username: `sc${tag}`,
            username_lower: `sc${tag}`,
          },
        },
      },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  type Who = { id: string; auth: Record<string, string> };

  const follow = (follower: Who, followee: Who) =>
    prisma.follow.create({
      data: { follower_id: follower.id, followee_id: followee.id },
    });

  const text = (who: Who, body: Record<string, unknown> = {}) =>
    api()
      .post('/api/v1/stories')
      .set(who.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ kind: 'text', text: 'Hello court', ...body });

  const tray = async (who: Who) =>
    (await api().get('/api/v1/stories/tray').set(who.auth)).body.data as {
      user: { id: string };
      isMe: boolean;
      storyCount: number;
      unseenCount: number;
    }[];

  const ofUser = async (viewer: Who, author: Who) =>
    (await api().get(`/api/v1/stories/users/${author.id}`).set(viewer.auth))
      .body.data as { id: string; viewedByMe: boolean; canReply: boolean }[];

  it('posts a text story; followers see it in the tray and mark it seen', async () => {
    const a = await attorney('Ann');
    const c = await client('Cleo');
    const d = await client('Dan');
    await follow(c, a);

    const made = await text(a);
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({
      kind: 'text',
      text: 'Hello court',
      background: 'gold',
      audience: 'all',
      isMine: true,
      viewCount: 0,
    });
    const id = made.body.data.id as string;

    // The author's own bubble comes first, even before anyone follows.
    const mine = await tray(a);
    expect(mine[0]).toMatchObject({ isMe: true, storyCount: 1 });

    const seen = await tray(c);
    expect(seen.map((t) => t.user.id)).toContain(a.id);
    expect(seen.find((t) => t.user.id === a.id)).toMatchObject({
      storyCount: 1,
      unseenCount: 1,
    });
    // A stranger does not get a stranger's bubble…
    expect((await tray(d)).map((t) => t.user.id)).not.toContain(a.id);
    // …but can open the profile's story (audience: everyone).
    expect((await ofUser(d, a)).map((s) => s.id)).toContain(id);

    expect(
      (await api().post(`/api/v1/stories/${id}/view`).set(c.auth)).status,
    ).toBe(204);
    expect(
      (await api().post(`/api/v1/stories/${id}/view`).set(c.auth)).status,
    ).toBe(204);
    expect((await tray(c)).find((t) => t.user.id === a.id)?.unseenCount).toBe(
      0,
    );
    expect((await ofUser(c, a))[0].viewedByMe).toBe(true);

    // The author counts one view and sees who.
    const own = await ofUser(a, a);
    expect(own[0]).toMatchObject({ isMine: true, viewCount: 1 });
    const viewers = await api()
      .get(`/api/v1/stories/${id}/viewers`)
      .set(a.auth);
    expect(viewers.status).toBe(200);
    expect(viewers.body.data).toHaveLength(1);
    expect(viewers.body.data[0].user.id).toBe(c.id);
    // Nobody else reads the list.
    expect(
      (await api().get(`/api/v1/stories/${id}/viewers`).set(c.auth)).status,
    ).toBe(404);
  });

  it('honours the audience: followers, contacts, hidden-from, blocks', async () => {
    const a = await attorney('Audrey');
    const fan = await client('Fan');
    const contact = await client('Contact');
    const stranger = await client('Stranger');
    await follow(fan, a);

    const followersOnly = await text(a, { audience: 'followers' });
    const contactsOnly = await text(a, { audience: 'contacts' });
    expect(followersOnly.status).toBe(201);
    await prisma.contactMatch.create({
      data: { owner_id: a.id, matched_id: contact.id },
    });

    const ids = async (v: Who) => (await ofUser(v, a)).map((s) => s.id);
    expect(await ids(fan)).toEqual(
      expect.arrayContaining([followersOnly.body.data.id]),
    );
    expect(await ids(fan)).not.toContain(contactsOnly.body.data.id);
    expect(await ids(contact)).toEqual([contactsOnly.body.data.id]);
    expect(await ids(stranger)).toEqual([]);
    expect(
      (
        await api()
          .post(`/api/v1/stories/${followersOnly.body.data.id}/view`)
          .set(stranger.auth)
      ).status,
    ).toBe(404);

    // "Hide from": the fan loses everything, and can be shown again.
    expect(
      (await api().put(`/api/v1/stories/hidden/${fan.id}`).set(a.auth)).status,
    ).toBe(204);
    expect(await ids(fan)).toEqual([]);
    expect((await tray(fan)).map((t) => t.user.id)).not.toContain(a.id);
    const hidden = await api().get('/api/v1/stories/hidden').set(a.auth);
    expect((hidden.body.data as { id: string }[]).map((x) => x.id)).toEqual([
      fan.id,
    ]);
    await api().delete(`/api/v1/stories/hidden/${fan.id}`).set(a.auth);
    expect((await ids(fan)).length).toBeGreaterThan(0);

    // A block hides stories both ways.
    expect(
      (await api().put(`/api/v1/users/${a.id}/block`).set(fan.auth)).status,
    ).toBeLessThan(300);
    expect(await ids(fan)).toEqual([]);
    expect((await tray(fan)).map((t) => t.user.id)).not.toContain(a.id);
  });

  it('photo stories need the author’s clean photo; settings and replies', async () => {
    const a = await attorney('Pia');
    const other = await attorney('Other');
    const photo = async (owner: Who, purpose: 'post_image' | 'avatar') =>
      (
        await prisma.file.create({
          data: {
            owner_user_id: owner.id,
            purpose,
            s3_bucket: 'lawbid-e2e-media',
            s3_key: `story/${randomUUID()}.jpg`,
            mime: 'image/jpeg',
            size_bytes: 1000,
            sha256: 'a'.repeat(64),
            width: 1080,
            height: 1920,
            scan_status: 'clean',
          },
        })
      ).id;

    const mineOk = await photo(a, 'post_image');
    const ok = await api()
      .post('/api/v1/stories')
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        kind: 'photo',
        fileId: mineOk,
        text: 'Court today',
        overlays: [{ emoji: '⚖️', x: 0.5, y: 0.4, scale: 1.2, rotation: 0.1 }],
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.overlays).toHaveLength(1);
    expect(ok.body.data.text).toBe('Court today');

    const notMine = await api()
      .post('/api/v1/stories')
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ kind: 'photo', fileId: await photo(other, 'post_image') });
    expect(notMine.status).toBe(404);
    const wrongPurpose = await api()
      .post('/api/v1/stories')
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ kind: 'photo', fileId: await photo(a, 'avatar') });
    expect(wrongPurpose.status).toBe(409);
    expect(wrongPurpose.body.error.code).toBe('FILE_NOT_ATTACHABLE');

    expect((await text(a, { text: '   ' })).status).toBe(400);
    expect(
      (
        await text(a, {
          overlays: new Array(11).fill({
            emoji: 'x',
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
          }),
        })
      ).status,
    ).toBe(400);

    // Replies off → canReply false for the viewer.
    const v = await client('Vera');
    await follow(v, a);
    expect((await ofUser(v, a))[0].canReply).toBe(true);
    const set = await api()
      .patch('/api/v1/stories/settings')
      .set(a.auth)
      .send({ allowReplies: false, audience: 'followers' });
    expect(set.body.data).toMatchObject({
      allowReplies: false,
      audience: 'followers',
    });
    expect((await ofUser(v, a))[0].canReply).toBe(false);
    // New stories take the saved audience.
    const next = await text(a);
    expect(next.body.data.audience).toBe('followers');
  });

  it('deletes a story, keeps expired ones in the archive, caps live stories', async () => {
    const a = await attorney('Dora');
    const first = await text(a, { text: 'one' });
    const second = await text(a, { text: 'two' });
    await api().delete(`/api/v1/stories/${first.body.data.id}`).set(a.auth);
    expect((await ofUser(a, a)).map((s) => s.id)).toEqual([
      second.body.data.id,
    ]);
    expect(
      (await api().delete(`/api/v1/stories/${first.body.data.id}`).set(a.auth))
        .status,
    ).toBe(404);

    // 24 h later it is gone from the tray but stays in the archive.
    await prisma.story.update({
      where: { id: second.body.data.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    expect(await ofUser(a, a)).toEqual([]);
    const archive = await api().get('/api/v1/stories/archive').set(a.auth);
    expect((archive.body.data as { id: string }[]).map((x) => x.id)).toEqual([
      second.body.data.id,
    ]);

    // The default cap is 30 live stories at a time.
    for (let n = 0; n < 30; n += 1) {
      expect((await text(a, { text: `live ${n}` })).status).toBe(201);
    }
    const over = await text(a, { text: 'too many' });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('STORY_LIMIT_REACHED');
  });
});

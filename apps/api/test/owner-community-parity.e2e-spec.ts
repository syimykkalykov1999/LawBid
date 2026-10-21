import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-21 (inbox 26b/26c): groups and channels like Telegram,
 * through the owner's / admin's «Permissions» and «Manage» screens.
 */
jest.setTimeout(120_000);

describe('Groups and channels — Telegram parity (e2e)', () => {
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
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
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
  const tag = () => randomUUID().replace(/-/g, '').slice(0, 10);
  const auth = (id: string, role: 'attorney' | 'client') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  type Who = { id: string; auth: Record<string, string> };

  /** A verified client (phone + profile): may publish and comment. */
  async function client(first: string): Promise<Who> {
    const t = tag();
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: first,
        last_name: 'Par',
        phone_verified_at: new Date(),
        client_profile: {
          create: {
            state_code: 'NY',
            username: `cp${t}`,
            username_lower: `cp${t}`,
          },
        },
      },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  // ── channels ──────────────────────────────────────────────────────────

  async function channel(owner: Who, over: Record<string, unknown> = {}) {
    const res = await api()
      .post('/api/v1/channels')
      .set(owner.auth)
      .send({ title: 'Parity news', username: `p${tag()}x`, ...over })
      .expect(201);
    return res.body.data as { id: string; username: string };
  }

  const publish = (
    who: Who,
    channelId: string,
    body: Record<string, unknown> = { body: 'Hello' },
  ) =>
    api()
      .post(`/api/v1/channels/${channelId}/posts`)
      .set(who.auth)
      .set('Idempotency-Key', randomUUID())
      .send(body);

  const subscribe = (who: Who, channelId: string) =>
    api()
      .put(`/api/v1/channels/${channelId}/subscription`)
      .set(who.auth)
      .expect(200);

  describe('channel: who publishes (item 2)', () => {
    it('admins only by default; the owner opens it to every subscriber', async () => {
      const owner = await client('Olga');
      const reader = await client('Rita');
      const ch = await channel(owner);
      await subscribe(reader, ch.id);

      const view = await api()
        .get(`/api/v1/channels/${ch.id}`)
        .set(reader.auth)
        .expect(200);
      expect(view.body.data).toMatchObject({
        whoCanPost: 'admins',
        canPost: false,
      });
      await publish(reader, ch.id).expect(403);

      await api()
        .patch(`/api/v1/channels/${ch.id}`)
        .set(owner.auth)
        .send({ whoCanPost: 'all' })
        .expect(200);
      const open = await api()
        .get(`/api/v1/channels/${ch.id}`)
        .set(reader.auth)
        .expect(200);
      expect(open.body.data).toMatchObject({
        whoCanPost: 'all',
        canPost: true,
      });

      const post = await publish(reader, ch.id, { body: 'From a reader' });
      expect(post.status).toBe(201);
      expect(post.body.data.mine).toBe(true);
      const postId = post.body.data.id as string;

      // The author edits and deletes their own post; another reader cannot.
      const other = await client('Oleg');
      await subscribe(other, ch.id);
      await api()
        .patch(`/api/v1/channels/${ch.id}/posts/${postId}`)
        .set(other.auth)
        .send({ body: 'Hijack' })
        .expect(403);
      await api()
        .patch(`/api/v1/channels/${ch.id}/posts/${postId}`)
        .set(reader.auth)
        .send({ body: 'Edited by me' })
        .expect(200);
      const ownerView = await api()
        .get(`/api/v1/channels/${ch.id}/posts/${postId}`)
        .set(owner.auth)
        .expect(200);
      expect(ownerView.body.data.mine).toBe(false);
      await api()
        .delete(`/api/v1/channels/${ch.id}/posts/${postId}`)
        .set(reader.auth)
        .expect(204);

      // Not subscribed = not a poster, even when open to all.
      const stranger = await client('Stan');
      await publish(stranger, ch.id).expect(403);
    });

    it('only the owner changes who publishes', async () => {
      const owner = await client('Olga');
      const admin = await client('Adam');
      const ch = await channel(owner);
      const adminUser = await prisma.clientProfile.findUniqueOrThrow({
        where: { user_id: admin.id },
      });
      await api()
        .post(`/api/v1/channels/${ch.id}/admins`)
        .set(owner.auth)
        .send({ username: adminUser.username })
        .expect(201);
      await api()
        .patch(`/api/v1/channels/${ch.id}`)
        .set(admin.auth)
        .send({ whoCanPost: 'all' })
        .expect(403);
      await api()
        .patch(`/api/v1/channels/${ch.id}`)
        .set(admin.auth)
        .send({ whoCanPost: 'nobody' })
        .expect(400);
    });
  });

  describe('channel: reactions all / selected / off (item 3)', () => {
    const react = (who: Who, ch: string, post: string, emoji: string) =>
      api()
        .put(`/api/v1/channels/${ch}/posts/${post}/reaction`)
        .set(who.auth)
        .send({ emoji });

    it('all by default, then only the selected, then none', async () => {
      const owner = await client('Olga');
      const reader = await client('Rita');
      const ch = await channel(owner);
      await subscribe(reader, ch.id);
      const post = (await publish(owner, ch.id).expect(201)).body.data
        .id as string;

      // «All»: the whole palette, not only the old six.
      await react(reader, ch.id, post, '🎉').expect(200);
      const seen = await api()
        .get(`/api/v1/channels/${ch.id}`)
        .set(reader.auth)
        .expect(200);
      expect(seen.body.data.reactionsMode).toBe('all');

      // «Selected» needs at least one.
      await api()
        .patch(`/api/v1/channels/${ch.id}`)
        .set(owner.auth)
        .send({ reactionsMode: 'some', reactionsAllowed: [] })
        .expect(400);
      const some = await api()
        .patch(`/api/v1/channels/${ch.id}`)
        .set(owner.auth)
        .send({ reactionsMode: 'some', reactionsAllowed: ['🔥', '👍', '🔥'] })
        .expect(200);
      expect(some.body.data.reactionsAllowed).toEqual(['👍', '🔥']);
      await react(reader, ch.id, post, '🎉').expect(403);
      await react(reader, ch.id, post, '🔥').expect(200);

      // «Off»: nothing new; taking mine back still works.
      await api()
        .patch(`/api/v1/channels/${ch.id}`)
        .set(owner.auth)
        .send({ reactionsMode: 'off' })
        .expect(200);
      await react(reader, ch.id, post, '👍').expect(403);
      await api()
        .delete(`/api/v1/channels/${ch.id}/posts/${post}/reaction`)
        .set(reader.auth)
        .expect(200);
      // Not an emoji of the palette at all.
      await react(reader, ch.id, post, 'x').expect(400);
    });
  });
});

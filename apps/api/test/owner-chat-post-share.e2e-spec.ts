import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-21 (Instagram «Поделиться»): a post sent into a chat is a
 * `post` card — never masked (the link inside a locked chat would be), only
 * for a post the sender can see and whose author did not block them, and a
 * post deleted later stays as an unavailable card.
 */
jest.setTimeout(120_000);

describe('Post cards in chats (e2e)', () => {
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
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string, role: 'client' | 'attorney') => ({
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
      data: { role: 'attorney', first_name: first, last_name: 'Share' },
    });
    const name = `share_${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: name,
        username_lower: name,
        languages: ['en'],
        verification_status: 'verified',
        trust_badge: true,
      },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, username: name, auth: bearer(u.id, 'attorney') };
  }

  /** A case chat whose contacts are still locked (links get masked). */
  async function lockedChat() {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Cora', last_name: 'Client' },
    });
    const lawyer = await attorney('Otto');
    const conv = await prisma.conversation.create({
      data: {
        client_id: client.id,
        attorney_id: lawyer.id,
        status: 'active',
        contacts_unlocked: false,
        participants: {
          create: [{ user_id: client.id }, { user_id: lawyer.id }],
        },
      },
    });
    return {
      id: conv.id,
      client: { id: client.id, auth: bearer(client.id, 'client') },
      lawyer,
    };
  }

  const post = (authorId: string, extra: Record<string, unknown> = {}) =>
    prisma.post.create({
      data: {
        author_id: authorId,
        title: 'Five things about leases',
        body: 'Read your lease twice. https://lawbid.dev/post/1 call 555-0100',
        ...extra,
      },
    });

  const send = (
    id: string,
    auth: Record<string, string>,
    body: Record<string, unknown>,
  ) =>
    api()
      .post(`/api/v1/conversations/${id}/messages`)
      .set(auth)
      .send({ clientMessageId: randomUUID(), ...body });

  it('sends a post card that is never masked, and lists it', async () => {
    const c = await lockedChat();
    const author = await attorney('Pia');
    const p = await post(author.id);
    const sent = await send(c.id, c.client.auth, {
      type: 'post',
      postId: p.id,
    }).expect(201);
    expect(sent.body.data.type).toBe('post');
    expect(sent.body.data.contactMasked).toBe(false);
    expect(sent.body.data.body).toBe(p.id);
    expect(sent.body.data.post).toMatchObject({
      id: p.id,
      title: 'Five things about leases',
      isVideo: false,
      available: true,
      author: {
        id: author.id,
        username: author.username,
        firstName: 'Pia',
        verifiedBadge: true,
      },
    });
    expect(sent.body.data.post.excerpt).toContain('Read your lease twice.');

    // The attorney reads the same card in the list.
    const list = await api()
      .get(`/api/v1/conversations/${c.id}/messages`)
      .set(c.lawyer.auth)
      .expect(200);
    const card = (list.body.data as { type: string; post: unknown }[]).find(
      (m) => m.type === 'post',
    );
    expect(card?.post).toMatchObject({ id: p.id, available: true });

    // No postId → 400.
    await send(c.id, c.client.auth, { type: 'post' }).expect(400);
  });

  it('refuses a post the sender cannot see or whose author blocked them', async () => {
    const c = await lockedChat();
    const author = await attorney('Hal');
    const archived = await post(author.id, { archived_at: new Date() });
    const r1 = await send(c.id, c.client.auth, {
      type: 'post',
      postId: archived.id,
    }).expect(404);
    expect(r1.body.error.code).toBe('POST_NOT_FOUND');
    const hidden = await post(author.id, { status: 'hidden' });
    await send(c.id, c.client.auth, {
      type: 'post',
      postId: hidden.id,
    }).expect(404);
    await send(c.id, c.client.auth, {
      type: 'post',
      postId: randomUUID(),
    }).expect(404);
    const visible = await post(author.id);
    await prisma.userBlock.create({
      data: { blocker_id: author.id, blocked_id: c.client.id },
    });
    await send(c.id, c.client.auth, {
      type: 'post',
      postId: visible.id,
    }).expect(404);
    // An author shares their own post.
    await send(c.id, c.lawyer.auth, {
      type: 'post',
      postId: (await post(c.lawyer.id)).id,
    }).expect(201);
  });

  it('a post deleted later stays as an unavailable card', async () => {
    const c = await lockedChat();
    const author = await attorney('Dee');
    const p = await post(author.id);
    await send(c.id, c.lawyer.auth, { type: 'post', postId: p.id }).expect(201);
    await prisma.post.update({
      where: { id: p.id },
      data: { deleted_at: new Date() },
    });
    const list = await api()
      .get(`/api/v1/conversations/${c.id}/messages`)
      .set(c.client.auth)
      .expect(200);
    const card = (
      list.body.data as { type: string; post: Record<string, unknown> }[]
    ).find((m) => m.type === 'post');
    expect(card?.post).toEqual({
      id: p.id,
      author: null,
      title: null,
      excerpt: null,
      thumbnailUrl: null,
      isVideo: false,
      available: false,
    });
  });
});

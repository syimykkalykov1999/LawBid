import { randomUUID } from 'node:crypto';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Audit 17.11 (problem 4): the 1:1 catch-up after a long offline
 * (GET /conversations/:id/messages?afterId). Before: at most 100 messages
 * came back with nothing saying there were more, and edits / deletes for
 * everyone of older messages were only in the 5-minute socket event log.
 * Now: more than 100 → 409 SYNC_TOO_OLD (the app reloads the page, as
 * groups and Telegram's getDifference «too long»), and the changed older
 * messages come back with the new ones.
 */
jest.setTimeout(120_000);

describe('1:1 catch-up after a long offline (e2e, audit 17.11)', () => {
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

  async function chat() {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Cara', last_name: 'Catch' },
    });
    const attorney = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Abe', last_name: 'Up' },
    });
    const conv = await prisma.conversation.create({
      data: {
        client_id: client.id,
        attorney_id: attorney.id,
        status: 'active',
        contacts_unlocked: true,
        participants: {
          create: [{ user_id: client.id }, { user_id: attorney.id }],
        },
      },
    });
    return { id: conv.id, client, attorney };
  }

  let t = Date.now() - 10 * 60_000;
  const at = () => new Date((t += 10));
  async function put(convId: string, senderId: string, body: string) {
    return prisma.message.create({
      data: {
        conversation_id: convId,
        sender_id: senderId,
        type: 'text',
        body_original: body,
        body_display: body,
        client_message_id: randomUUID(),
        created_at: at(),
      },
    });
  }
  const after = (c: Awaited<ReturnType<typeof chat>>, afterId: string) =>
    api()
      .get(`/api/v1/conversations/${c.id}/messages`)
      .query({ afterId })
      .set(bearer(c.client.id, 'client'));

  it('more than the catch-up gives → 409 SYNC_TOO_OLD (the app reloads)', async () => {
    const c = await chat();
    const anchor = await put(c.id, c.attorney.id, 'anchor');
    for (let i = 0; i < 100; i += 1) await put(c.id, c.attorney.id, `m${i}`);
    const ok = await after(c, anchor.id).expect(200);
    expect((ok.body.data as unknown[]).length).toBe(100);
    await put(c.id, c.attorney.id, 'one too many');
    const tooMany = await after(c, anchor.id).expect(409);
    expect(tooMany.body.error.code).toBe('SYNC_TOO_OLD');
  });

  it('edits and deletes for everyone of older messages come back too', async () => {
    const c = await chat();
    const edited = await put(c.id, c.attorney.id, 'before');
    const revoked = await put(c.id, c.attorney.id, 'to revoke');
    const untouched = await put(c.id, c.attorney.id, 'as is');
    const anchor = await put(c.id, c.client.id, 'newest on the phone');
    // The phone goes offline; the attorney edits and deletes for everyone.
    await api()
      .patch(`/api/v1/conversations/${c.id}/messages/${edited.id}`)
      .set(bearer(c.attorney.id, 'attorney'))
      .send({ body: 'after' })
      .expect(200);
    await api()
      .delete(`/api/v1/conversations/${c.id}/messages/${revoked.id}`)
      .query({ scope: 'all' })
      .set(bearer(c.attorney.id, 'attorney'))
      .expect(204);
    const fresh = await put(c.id, c.attorney.id, 'new one');
    const res = await after(c, anchor.id).expect(200);
    const items = res.body.data as {
      id: string;
      body: string;
      editedAt?: string | null;
      revoked?: boolean;
    }[];
    const byId = new Map(items.map((m) => [m.id, m]));
    expect(byId.get(edited.id)?.body).toBe('after');
    expect(byId.has(revoked.id)).toBe(true);
    expect(byId.has(fresh.id)).toBe(true);
    expect(byId.has(untouched.id)).toBe(false);
    expect(byId.has(anchor.id)).toBe(false);
  });

  it('verify 17.11: a reaction made while offline comes back; a removed anchor is still a position', async () => {
    const c = await chat();
    const liked = await put(c.id, c.client.id, 'like me');
    const anchor = await put(c.id, c.client.id, 'newest on the phone');
    await api()
      .put(`/api/v1/conversations/${c.id}/messages/${liked.id}/reaction`)
      .set(bearer(c.attorney.id, 'attorney'))
      .send({ emoji: '👍' })
      .expect((r) => expect(r.status).toBeLessThan(300));
    const res = await after(c, anchor.id).expect(200);
    const got = (
      res.body.data as { id: string; reactions?: { emoji: string }[] }[]
    ).find((m) => m.id === liked.id);
    expect(got?.reactions?.map((r) => r.emoji)).toContain('👍');
    // A moderator removes the phone's newest message: still a position.
    await prisma.message.update({
      where: { id_conversation_id: { id: anchor.id, conversation_id: c.id } },
      data: { deleted_at: new Date() },
    });
    await put(c.id, c.attorney.id, 'after the removed one');
    const again = await after(c, anchor.id).expect(200);
    expect((again.body.data as unknown[]).length).toBeGreaterThan(0);
  });

  it('verify 17.11: a reaction REMOVED while offline comes back as the current set', async () => {
    const c = await chat();
    const liked = await put(c.id, c.client.id, 'like me');
    await api()
      .put(`/api/v1/conversations/${c.id}/messages/${liked.id}/reaction`)
      .set(bearer(c.attorney.id, 'attorney'))
      .send({ emoji: '👍' })
      .expect((r) => expect(r.status).toBeLessThan(300));
    // The phone saw the 👍 and its newest message is this one.
    const anchor = await put(c.id, c.client.id, 'newest on the phone');
    await api()
      .put(`/api/v1/conversations/${c.id}/messages/${liked.id}/reaction`)
      .set(bearer(c.attorney.id, 'attorney'))
      .send({ emoji: null })
      .expect((r) => expect(r.status).toBeLessThan(300));
    const res = await after(c, anchor.id).expect(200);
    const got = (
      res.body.data as { id: string; reactions?: { emoji: string }[] }[]
    ).find((m) => m.id === liked.id);
    expect(got).toBeDefined();
    expect(got?.reactions ?? []).toEqual([]);
  });
});

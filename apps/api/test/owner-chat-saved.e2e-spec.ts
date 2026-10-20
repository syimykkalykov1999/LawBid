import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-20: «Сохранённое» for chat messages and two new message
 * kinds — a shared attorney card (`contact`) and a place (`place`). Saving
 * is for members of the chat only; the list reads the messages through the
 * chat; tabs and search narrow it.
 */
jest.setTimeout(120_000);

describe('Saved chat messages, contact cards, places (e2e)', () => {
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
      data: { role: 'attorney', first_name: first, last_name: 'Saved' },
    });
    const name = `saved_${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: name,
        username_lower: name,
        languages: ['en'],
        verification_status: 'verified',
        firm_names: ['Saved & Partners'],
      },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, username: name, auth: bearer(u.id, 'attorney') };
  }

  async function chat() {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Cora', last_name: 'Client' },
    });
    const lawyer = await attorney('Otto');
    const conv = await prisma.conversation.create({
      data: {
        client_id: client.id,
        attorney_id: lawyer.id,
        status: 'active',
        contacts_unlocked: true,
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

  const send = (
    id: string,
    auth: Record<string, string>,
    body: Record<string, unknown>,
  ) =>
    api()
      .post(`/api/v1/conversations/${id}/messages`)
      .set(auth)
      .send({ clientMessageId: randomUUID(), ...body });

  it('shares an attorney card and a place', async () => {
    const c = await chat();
    const colleague = await attorney('Pia');
    const card = await send(c.id, c.client.auth, {
      type: 'contact',
      contactUserId: colleague.id,
    }).expect(201);
    expect(card.body.data.type).toBe('contact');
    expect(card.body.data.contact).toMatchObject({
      userId: colleague.id,
      username: colleague.username,
      displayName: 'Pia Saved',
      firmNames: ['Saved & Partners'],
    });
    // A client has no public card to share.
    await send(c.id, c.client.auth, {
      type: 'contact',
      contactUserId: c.client.id,
    }).expect(400);
    await send(c.id, c.client.auth, { type: 'contact' }).expect(400);

    const place = await send(c.id, c.lawyer.auth, {
      type: 'place',
      body: '350 5th Ave, New York, NY 10118',
    }).expect(201);
    expect(place.body.data.type).toBe('place');
    expect(place.body.data.body).toBe('350 5th Ave, New York, NY 10118');
    await send(c.id, c.lawyer.auth, {
      type: 'place',
      body: 'x'.repeat(201),
    }).expect(400);

    const list = await api()
      .get(`/api/v1/conversations/${c.id}/messages`)
      .set(c.client.auth)
      .expect(200);
    const rows = list.body.data as { type: string }[];
    const kinds = rows.map((m) => m.type);
    expect(kinds).toEqual(expect.arrayContaining(['contact', 'place']));
  });

  it('saves, lists by tab, searches and removes', async () => {
    const c = await chat();
    const plain = await send(c.id, c.client.auth, {
      body: 'Remember the retainer agreement',
    }).expect(201);
    const link = await send(c.id, c.lawyer.auth, {
      body: 'Read https://example.com/guide before Friday',
    }).expect(201);
    const place = await send(c.id, c.lawyer.auth, {
      type: 'place',
      body: '1 Main St, Newark, NJ',
    }).expect(201);
    const mine = c.client.auth;
    const id = (r: { body: { data: { id: string } } }) => r.body.data.id;

    for (const r of [plain, link, place]) {
      await api()
        .put(`/api/v1/saved-chat/${id(r)}`)
        .set(mine)
        .expect(204);
    }
    // Idempotent.
    await api()
      .put(`/api/v1/saved-chat/${id(plain)}`)
      .set(mine)
      .expect(204);

    const ids = await api().get('/api/v1/saved-chat/ids').set(mine).expect(200);
    expect(ids.body.data.ids).toHaveLength(3);

    const all = await api().get('/api/v1/saved-chat').set(mine).expect(200);
    const items = all.body.data as { message: { id: string }; mine: boolean }[];
    expect(items.map((i) => i.message.id)).toEqual([
      id(place),
      id(link),
      id(plain),
    ]);
    expect(items[2].mine).toBe(true);
    expect(all.body.data[0].mine).toBe(false);
    expect(all.body.data[0].chat.id).toBe(c.id);

    const links = await api()
      .get('/api/v1/saved-chat?tab=links')
      .set(mine)
      .expect(200);
    expect(links.body.data).toHaveLength(1);
    expect(links.body.data[0].message.id).toBe(id(link));
    const media = await api()
      .get('/api/v1/saved-chat?tab=media')
      .set(mine)
      .expect(200);
    expect(media.body.data).toHaveLength(0);

    const found = await api()
      .get('/api/v1/saved-chat?q=RETAINER')
      .set(mine)
      .expect(200);
    expect(found.body.data).toHaveLength(1);
    expect(found.body.data[0].message.id).toBe(id(plain));

    // The other side saved nothing.
    const theirs = await api()
      .get('/api/v1/saved-chat')
      .set(c.lawyer.auth)
      .expect(200);
    expect(theirs.body.data).toHaveLength(0);

    await api()
      .delete(`/api/v1/saved-chat/${id(plain)}`)
      .set(mine)
      .expect(204);
    await api()
      .delete(`/api/v1/saved-chat/${id(plain)}`)
      .set(mine)
      .expect(204);
    const left = await api().get('/api/v1/saved-chat/ids').set(mine);
    expect(left.body.data.ids).toHaveLength(2);
  });

  it('refuses a message of a chat the person is not in, and system lines', async () => {
    const c = await chat();
    const msg = await send(c.id, c.client.auth, { body: 'Private words' });
    const stranger = await attorney('Sam');
    await api()
      .put(`/api/v1/saved-chat/${msg.body.data.id as string}`)
      .set(stranger.auth)
      .expect(404);
    const system = await prisma.message.create({
      data: {
        conversation_id: c.id,
        type: 'system',
        body_original: 'case_closed',
        body_display: 'case_closed',
        client_message_id: randomUUID(),
      },
    });
    await api()
      .put(`/api/v1/saved-chat/${system.id}`)
      .set(c.client.auth)
      .expect(400);
  });
});

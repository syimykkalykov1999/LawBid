import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Row 110 (owner list, chat screens pack 3, Telegram / WhatsApp):
 * - GET /conversations/:id/messages?q= — search inside one chat;
 * - PATCH /conversations/:id/organize { unread } — «Mark as unread», taken
 *   off when the chat is read;
 * - GET /groups/:id/messages?q= — the same search inside a group.
 */
jest.setTimeout(120_000);

describe('Chat pack 3: in-chat search and mark as unread (e2e, row 110)', () => {
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
  const bearer = (id: string, role: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: `s-${id}`,
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function chat(attorneyId: string, clientId: string, texts: string[]) {
    const conv = await prisma.conversation.create({
      data: {
        attorney_id: attorneyId,
        client_id: clientId,
        status: 'active',
        contacts_unlocked: true,
        request_status: 'accepted',
        participants: {
          create: [{ user_id: attorneyId }, { user_id: clientId }],
        },
      },
    });
    const ids: string[] = [];
    let at = new Date();
    for (const [i, t] of texts.entries()) {
      at = new Date(Date.now() - (texts.length - i) * 1000);
      const m = await prisma.message.create({
        data: {
          conversation_id: conv.id,
          sender_id: clientId,
          type: 'text',
          body_original: t,
          body_display: t,
          client_message_id: `p3-${conv.id}-${i}`,
          created_at: at,
        },
      });
      ids.push(m.id);
    }
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { last_message_at: at, last_message_id: ids[ids.length - 1] },
    });
    return { id: conv.id, messages: ids };
  }

  it('finds only the messages of this chat that hold every word, newest first', async () => {
    const att = await prisma.user.create({ data: { role: 'attorney' } });
    const cli = await prisma.user.create({
      data: { role: 'client', first_name: 'Search', last_name: 'Inside' },
    });
    const c = await chat(att.id, cli.id, [
      'The invoice is attached',
      'Hello there',
      'Second invoice for Friday',
      'friday works for me',
    ]);
    const cli2 = await prisma.user.create({ data: { role: 'client' } });
    const other = await chat(att.id, cli2.id, ['another invoice elsewhere']);
    const auth = bearer(att.id, 'attorney');
    const find = async (id: string, q: string) =>
      (
        (
          await api()
            .get(`/api/v1/conversations/${id}/messages`)
            .query({ q })
            .set(auth)
            .expect(200)
        ).body as { data: { id: string }[] }
      ).data.map((m) => m.id);

    expect(await find(c.id, 'invoice')).toEqual([c.messages[2], c.messages[0]]);
    expect(await find(c.id, 'friday invoice')).toEqual([c.messages[2]]);
    expect(await find(c.id, 'nothing-like-this')).toEqual([]);
    expect(await find(other.id, 'invoice')).toEqual([other.messages[0]]);
    // Without q the page is the normal history.
    expect(await find(c.id, '')).toHaveLength(4);
    // Somebody else's chat stays closed.
    const stranger = await prisma.user.create({ data: { role: 'client' } });
    await api()
      .get(`/api/v1/conversations/${c.id}/messages`)
      .query({ q: 'invoice' })
      .set(bearer(stranger.id, 'client'))
      .expect(404);
  });

  it('marks a chat unread for me only; reading it takes the mark off', async () => {
    const att = await prisma.user.create({ data: { role: 'attorney' } });
    const cli = await prisma.user.create({ data: { role: 'client' } });
    const c = await chat(att.id, cli.id, ['one', 'two']);
    const me = bearer(att.id, 'attorney');
    const marked = await api()
      .patch(`/api/v1/conversations/${c.id}/organize`)
      .set(me)
      .send({ unread: true })
      .expect(200);
    expect(marked.body.data.markedUnread).toBe(true);
    const theirs = await api()
      .get(`/api/v1/conversations/${c.id}`)
      .set(bearer(cli.id, 'client'))
      .expect(200);
    expect(theirs.body.data.markedUnread).toBe(false);

    await api()
      .post(`/api/v1/conversations/${c.id}/read`)
      .set(me)
      .send({ lastReadMessageId: c.messages[1] })
      .expect(200);
    const after = await api()
      .get(`/api/v1/conversations/${c.id}`)
      .set(me)
      .expect(200);
    expect(after.body.data.markedUnread).toBe(false);

    // Marked again on a chat already read to the end: reading clears it too.
    await api()
      .patch(`/api/v1/conversations/${c.id}/organize`)
      .set(me)
      .send({ unread: true })
      .expect(200);
    await api()
      .post(`/api/v1/conversations/${c.id}/read`)
      .set(me)
      .send({ lastReadMessageId: c.messages[1] })
      .expect(200);
    const again = await api()
      .get(`/api/v1/conversations/${c.id}`)
      .set(me)
      .expect(200);
    expect(again.body.data.markedUnread).toBe(false);
  });

  it('searches inside a group the same way', async () => {
    const [owner, ann] = await Promise.all(
      ['Olga', 'Ann'].map((first) =>
        prisma.user.create({
          data: { role: 'client', first_name: first, last_name: 'Pack3' },
        }),
      ),
    );
    const g = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id, 'client'))
      .send({ title: 'Pack 3', type: 'closed', memberIds: [ann.id] })
      .expect(201);
    const id = g.body.data.id as string;
    const sent: string[] = [];
    for (const body of ['Court date moved', 'Lunch?', 'new court papers']) {
      const r = await api()
        .post(`/api/v1/groups/${id}/messages`)
        .set(bearer(owner.id, 'client'))
        .send({ clientMessageId: randomUUID(), type: 'text', body })
        .expect(201);
      sent.push(r.body.data.id as string);
    }
    const find = async (q: string) =>
      (
        (
          await api()
            .get(`/api/v1/groups/${id}/messages`)
            .query({ q })
            .set(bearer(owner.id, 'client'))
            .expect(200)
        ).body as { data: { id: string }[] }
      ).data.map((m) => m.id);
    expect(await find('COURT')).toEqual([sent[2], sent[0]]);
    expect(await find('court papers')).toEqual([sent[2]]);
    expect(await find('dinner')).toEqual([]);
  });
});

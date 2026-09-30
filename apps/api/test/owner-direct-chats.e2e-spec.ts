import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * OQ-043 (owner 2026-09-30): "Message" on a profile opens one direct chat
 * per attorney/client pair; the first messages are a request waiting in
 * the recipient's "Requests" (max 3, no "Seen"); a reply or Accept moves
 * it to the main list; Delete stops the requester; same-role and blocked
 * pairs are refused; contacts stay masked; calls stay closed.
 */
jest.setTimeout(120_000);

describe('Direct chats and message requests (e2e, OQ-043)', () => {
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
  const token = (id: string, role: 'client' | 'attorney') =>
    tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function person(role: 'client' | 'attorney', subscribed = true) {
    const u = await prisma.user.create({
      data: {
        role,
        first_name: role === 'client' ? 'Dina' : 'Rob',
        last_name: 'Direct',
      },
    });
    if (role === 'attorney') {
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username: `dm_${u.id.slice(0, 8)}`,
          username_lower: `dm_${u.id.slice(0, 8)}`,
          languages: ['en'],
          verification_status: 'verified',
        },
      });
      if (subscribed) {
        await prisma.subscription.create({
          data: { user_id: u.id, status: 'active', price_cents: 39900 },
        });
      }
    }
    return { id: u.id, auth: bearer(token(u.id, role)) };
  }

  const send = (auth: Record<string, string>, id: string, body: string) =>
    api()
      .post(`/api/v1/conversations/${id}/messages`)
      .set(auth)
      .send({ clientMessageId: randomUUID(), body });
  const ids = (res: request.Response) =>
    (res.body.data as { id: string }[]).map((c) => c.id);

  it('a client messages an attorney: request → accept by reply', async () => {
    const cli = await person('client');
    const att = await person('attorney');

    const open = await api()
      .post('/api/v1/conversations/direct')
      .set(cli.auth)
      .send({ userId: att.id })
      .expect(200);
    const convId = open.body.data.id as string;
    expect(open.body.data).toMatchObject({
      kind: 'direct',
      requestStatus: 'pending',
      requestedByMe: true,
      caseId: null,
      counterpart: { kind: 'attorney', displayName: 'Rob Direct' },
    });
    // The same pair → the same chat.
    const again = await api()
      .post('/api/v1/conversations/direct')
      .set(cli.auth)
      .send({ userId: att.id })
      .expect(200);
    expect(again.body.data.id).toBe(convId);

    // Up to 3 messages while pending; contacts are masked.
    const first = await send(cli.auth, convId, 'Hi, call me at 555 123 4567');
    expect(first.status).toBe(201);
    expect(first.body.data.contactMasked).toBe(true);
    await send(cli.auth, convId, 'Question about a DUI').expect(201);
    await send(cli.auth, convId, 'Thanks').expect(201);
    const fourth = await send(cli.auth, convId, 'Hello?');
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe('MESSAGE_REQUEST_LIMIT');

    // The attorney sees it only under Requests (the client is visible).
    const primary = await api().get('/api/v1/conversations').set(att.auth);
    expect(ids(primary)).not.toContain(convId);
    const requests = await api()
      .get('/api/v1/conversations?folder=requests')
      .set(att.auth);
    expect(ids(requests)).toContain(convId);
    const req = (
      requests.body.data as {
        id: string;
        counterpart: { displayName: string; id: string };
      }[]
    ).find((c) => c.id === convId)!;
    expect(req.counterpart).toMatchObject({
      displayName: 'Dina Direct',
      id: cli.id,
    });
    expect(
      (await api().get('/api/v1/conversations/requests/count').set(att.auth))
        .body.data.count,
    ).toBe(1);
    // The requester keeps it in their main list.
    expect(
      ids(await api().get('/api/v1/conversations').set(cli.auth)),
    ).toContain(convId);

    // No "Seen" for the requester while pending.
    const msgs = await api()
      .get(`/api/v1/conversations/${convId}/messages`)
      .set(att.auth);
    await api()
      .post(`/api/v1/conversations/${convId}/read`)
      .set(att.auth)
      .send({ lastReadMessageId: msgs.body.data[0].id })
      .expect(200);
    const mine = await api()
      .get(`/api/v1/conversations/${convId}`)
      .set(cli.auth);
    expect(mine.body.data.counterpartLastReadMessageId).toBeNull();

    // The attorney's reply accepts; calls stay closed (contacts locked).
    await send(att.auth, convId, 'Happy to help').expect(201);
    const after = await api()
      .get(`/api/v1/conversations/${convId}`)
      .set(cli.auth);
    expect(after.body.data.requestStatus).toBe('accepted');
    expect(after.body.data.counterpartLastReadMessageId).not.toBeNull();
    expect(
      ids(await api().get('/api/v1/conversations').set(att.auth)),
    ).toContain(convId);
    await send(cli.auth, convId, 'Great').expect(201);
    const call = await api()
      .post(`/api/v1/conversations/${convId}/calls`)
      .set(cli.auth);
    expect(call.body.error.code).toBe('CALL_NOT_ALLOWED');
  });

  it('delete stops the requester; accept works; wrong pairs are refused', async () => {
    const att = await person('attorney');
    const cli = await person('client');
    const open = await api()
      .post('/api/v1/conversations/direct')
      .set(att.auth)
      .send({ userId: cli.id })
      .expect(200);
    const convId = open.body.data.id as string;
    await send(att.auth, convId, 'Saw your post, can I help?').expect(201);
    await api()
      .post(`/api/v1/conversations/${convId}/request/decline`)
      .set(cli.auth)
      .expect(200);
    const refused = await send(att.auth, convId, 'Please reply');
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('MESSAGE_REQUEST_DECLINED');
    expect(
      ids(
        await api().get('/api/v1/conversations?folder=requests').set(cli.auth),
      ),
    ).not.toContain(convId);

    // Accept button.
    const cli2 = await person('client');
    const o2 = await api()
      .post('/api/v1/conversations/direct')
      .set(cli2.auth)
      .send({ userId: att.id })
      .expect(200);
    await send(cli2.auth, o2.body.data.id, 'Hello').expect(201);
    const acc = await api()
      .post(`/api/v1/conversations/${o2.body.data.id}/request/accept`)
      .set(att.auth)
      .expect(200);
    expect(acc.body.data.requestStatus).toBe('accepted');

    // Same role, self and blocked pairs.
    const att2 = await person('attorney');
    const same = await api()
      .post('/api/v1/conversations/direct')
      .set(att.auth)
      .send({ userId: att2.id });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe('DIRECT_CHAT_NOT_ALLOWED');
    const cli3 = await person('client');
    await prisma.userBlock.create({
      data: { blocker_id: cli3.id, blocked_id: att.id },
    });
    const blocked = await api()
      .post('/api/v1/conversations/direct')
      .set(att.auth)
      .send({ userId: cli3.id });
    expect(blocked.status).toBe(403);

    // An attorney without a subscription cannot write.
    const lapsed = await person('attorney', false);
    const o3 = await api()
      .post('/api/v1/conversations/direct')
      .set(lapsed.auth)
      .send({ userId: cli2.id })
      .expect(200);
    const noSub = await send(lapsed.auth, o3.body.data.id, 'Hi');
    expect(noSub.status).toBe(403);
    expect(noSub.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
  });
});

import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Groups WhatsApp parity: «Данные» of my group message — who has read it,
 * from the members' read marks (POST /groups/:id/read). Only the author
 * asks; a member who read a later message has read this one too; a member
 * who left is not counted.
 */
jest.setTimeout(120_000);

describe('Group message readers (e2e)', () => {
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
  const bearer = (id: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`,
  });
  const person = (first: string) =>
    prisma.user.create({
      data: { role: 'client', first_name: first, last_name: 'Seen' },
    });

  async function accept(userId: string, groupId: string) {
    const list = await api()
      .get('/api/v1/groups/invites')
      .set(bearer(userId))
      .expect(200);
    const invite = (list.body.data as { id: string; groupId: string }[]).find(
      (i) => i.groupId === groupId,
    );
    await api()
      .post(`/api/v1/groups/invites/${invite!.id}/accept`)
      .set(bearer(userId))
      .expect(200);
  }

  it('the author sees who read; a later read covers earlier messages', async () => {
    const [owner, ann, bob, cy] = await Promise.all([
      person('Olga'),
      person('Ann'),
      person('Bob'),
      person('Cy'),
    ]);
    const res = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Seen', type: 'closed', memberIds: [ann.id, bob.id] })
      .expect(201);
    const id = res.body.data.id as string;
    await accept(ann.id, id);
    await accept(bob.id, id);
    const send = async (body: string) =>
      (
        await api()
          .post(`/api/v1/groups/${id}/messages`)
          .set(bearer(owner.id))
          .send({ clientMessageId: randomUUID(), type: 'text', body })
          .expect(201)
      ).body.data.id as string;
    const first = await send('First');
    const second = await send('Second');
    const readers = (userId: string, messageId: string) =>
      api()
        .get(`/api/v1/groups/${id}/messages/${messageId}/readers`)
        .set(bearer(userId));

    const none = await readers(owner.id, first).expect(200);
    expect(none.body.data).toEqual({ readers: [], recipients: 2 });

    // Ann reads up to the second message: both are read by her.
    await api()
      .post(`/api/v1/groups/${id}/read`)
      .set(bearer(ann.id))
      .send({ lastReadMessageId: second })
      .expect(200);
    // Bob reads only the first.
    await api()
      .post(`/api/v1/groups/${id}/read`)
      .set(bearer(bob.id))
      .send({ lastReadMessageId: first })
      .expect(200);
    const ofFirst = await readers(owner.id, first).expect(200);
    expect(
      (ofFirst.body.data.readers as { userId: string }[])
        .map((p) => p.userId)
        .sort(),
    ).toEqual([ann.id, bob.id].sort());
    const ofSecond = await readers(owner.id, second).expect(200);
    expect(
      (ofSecond.body.data.readers as { userId: string }[]).map((p) => p.userId),
    ).toEqual([ann.id]);
    expect(ofSecond.body.data.recipients).toBe(2);

    // Only the author; strangers see nothing.
    await readers(ann.id, first).expect(403);
    await readers(cy.id, first).expect(404);

    // Bob leaves: he is no longer a recipient or a reader.
    await api().post(`/api/v1/groups/${id}/leave`).set(bearer(bob.id));
    const after = await readers(owner.id, first).expect(200);
    expect(after.body.data.recipients).toBe(1);
    expect(
      (after.body.data.readers as { userId: string }[]).map((p) => p.userId),
    ).toEqual([ann.id]);
  });
});

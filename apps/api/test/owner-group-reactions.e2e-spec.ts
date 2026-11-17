import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Groups WhatsApp parity: reactions on group messages, the 1:1 chat's
 * rule — one emoji per person (a new one replaces it, null removes it),
 * counts with «mine» per viewer in the page, nothing for strangers, none
 * on a service line, and a message deleted for everyone keeps none.
 */
jest.setTimeout(120_000);

describe('Group message reactions (e2e)', () => {
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
      data: { role: 'client', first_name: first, last_name: 'React' },
    });

  async function makeGroup() {
    const [owner, ann, cy] = await Promise.all([
      person('Olga'),
      person('Ann'),
      person('Cy'),
    ]);
    const res = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Reactions', type: 'closed', memberIds: [ann.id] })
      .expect(201);
    const id = res.body.data.id as string;
    const list = await api()
      .get('/api/v1/groups/invites')
      .set(bearer(ann.id))
      .expect(200);
    const invite = (list.body.data as { id: string; groupId: string }[]).find(
      (i) => i.groupId === id,
    );
    await api()
      .post(`/api/v1/groups/invites/${invite!.id}/accept`)
      .set(bearer(ann.id))
      .expect(200);
    return { owner, ann, cy, id };
  }

  it('one emoji per person, counts and «mine» per viewer, removed on delete', async () => {
    const { owner, ann, cy, id } = await makeGroup();
    const sent = await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(owner.id))
      .send({ clientMessageId: randomUUID(), type: 'text', body: 'Hi all' })
      .expect(201);
    const mid = sent.body.data.id as string;
    expect(sent.body.data.reactions).toEqual([]);
    const react = (userId: string, emoji: string | null) =>
      api()
        .put(`/api/v1/groups/${id}/messages/${mid}/reaction`)
        .set(bearer(userId))
        .send({ emoji });

    // A stranger cannot react; one emoji only.
    await react(cy.id, '👍').expect(404);
    await react(ann.id, 'ok').expect(400);

    const a = await react(ann.id, '👍').expect(200);
    expect(a.body.data.reactions).toEqual([
      { emoji: '👍', count: 1, mine: true },
    ]);
    // The author's view of the same message: not mine.
    await react(owner.id, '👍').expect(200);
    // A new emoji replaces the old one (still one row per person).
    const changed = await react(ann.id, '❤️').expect(200);
    expect(changed.body.data.reactions).toEqual([
      { emoji: '👍', count: 1, mine: false },
      { emoji: '❤️', count: 1, mine: true },
    ]);
    expect(
      await prisma.chatGroupMessageReaction.count({
        where: { message_id: mid },
      }),
    ).toBe(2);

    // The page carries the reactions for each viewer.
    const page = await api()
      .get(`/api/v1/groups/${id}/messages`)
      .set(bearer(owner.id))
      .expect(200);
    const inPage = (
      page.body.data as {
        id: string;
        reactions: { emoji: string; mine: boolean }[];
      }[]
    ).find((m) => m.id === mid);
    expect(inPage?.reactions).toEqual([
      { emoji: '👍', count: 1, mine: true },
      { emoji: '❤️', count: 1, mine: false },
    ]);

    // null removes mine only.
    const cleared = await react(owner.id, null).expect(200);
    expect(cleared.body.data.reactions).toEqual([
      { emoji: '❤️', count: 1, mine: false },
    ]);

    // A service line («created») cannot be reacted to.
    const sys = await prisma.chatGroupMessage.findFirst({
      where: { group_id: id, type: 'system' },
    });
    await api()
      .put(`/api/v1/groups/${id}/messages/${sys!.id}/reaction`)
      .set(bearer(ann.id))
      .send({ emoji: '👍' })
      .expect(403);

    // Deleted for everyone: the reactions go with it.
    await api()
      .delete(`/api/v1/groups/${id}/messages/${mid}`)
      .set(bearer(owner.id))
      .expect(204);
    expect(
      await prisma.chatGroupMessageReaction.count({
        where: { message_id: mid },
      }),
    ).toBe(0);
    await react(ann.id, '👍').expect(404);
  });
});

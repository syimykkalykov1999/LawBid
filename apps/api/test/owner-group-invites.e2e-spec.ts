/* eslint-disable @typescript-eslint/no-unsafe-call -- supertest bodies are untyped */
import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-21 (as in Instagram): nobody is put into a group. «Add»
 * sends an invitation; the person sees it in Requests, may look inside an
 * open group before answering, and joins only after «Accept». A declined
 * invitation can be sent again after a day.
 */
jest.setTimeout(120_000);

describe('Group invitations (e2e)', () => {
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
      data: { role: 'client', first_name: first, last_name: 'Inv' },
    });
  const invitesOf = async (id: string) =>
    (await api().get('/api/v1/groups/invites').set(bearer(id)).expect(200)).body
      .data as { id: string; groupId: string; title: string }[];

  async function setup(type: 'public' | 'closed' = 'public') {
    const [owner, ann, bob] = await Promise.all([
      person('Olga'),
      person('Ann'),
      person('Bob'),
    ]);
    const tag = randomUUID().slice(0, 8);
    const res = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({
        title: 'Firm',
        description: 'About us',
        type,
        memberIds: [ann.id],
        ...(type === 'public' ? { username: `inv_${tag}` } : {}),
      })
      .expect(201);
    return { owner, ann, bob, id: res.body.data.id as string, res };
  }

  it('creating a group only invites: the person is not inside until «Accept»', async () => {
    const { owner, ann, id, res } = await setup();
    expect(res.body.data.memberCount).toBe(1);
    expect(
      res.body.data.invited.map((p: { userId: string }) => p.userId),
    ).toEqual([ann.id]);
    // Not inside: the group is invisible in the list and a closed read is 404.
    const list = await api().get('/api/v1/groups').set(bearer(ann.id));
    expect(list.body.data.map((g: { id: string }) => g.id)).not.toContain(id);
    await api().get(`/api/v1/groups/${id}`).set(bearer(ann.id)).expect(404);
    const [inv] = await invitesOf(ann.id);
    expect(inv.groupId).toBe(id);
    expect(inv.title).toBe('Firm');

    const joined = await api()
      .post(`/api/v1/groups/invites/${inv.id}/accept`)
      .set(bearer(ann.id))
      .expect(200);
    expect(joined.body.data.status).toBe('joined');
    expect(await invitesOf(ann.id)).toEqual([]);
    const detail = await api()
      .get(`/api/v1/groups/${id}`)
      .set(bearer(owner.id))
      .expect(200);
    expect(detail.body.data.memberCount).toBe(2);
    expect(detail.body.data.invited).toEqual([]);
    // An answered invitation cannot be answered twice.
    await api()
      .post(`/api/v1/groups/invites/${inv.id}/accept`)
      .set(bearer(ann.id))
      .expect(404);
  });

  it('only the invited person answers; a decline keeps them out and a second invite waits a day', async () => {
    const { owner, ann, bob, id } = await setup();
    const [inv] = await invitesOf(ann.id);
    await api()
      .post(`/api/v1/groups/invites/${inv.id}/accept`)
      .set(bearer(bob.id))
      .expect(404);
    await api()
      .post(`/api/v1/groups/invites/${inv.id}/decline`)
      .set(bearer(ann.id))
      .expect(204);
    expect(await invitesOf(ann.id)).toEqual([]);
    await api().get(`/api/v1/groups/${id}`).set(bearer(ann.id)).expect(404);

    const again = await api()
      .post(`/api/v1/groups/${id}/members`)
      .set(bearer(owner.id))
      .send({ userIds: [ann.id] })
      .expect(200);
    expect(again.body.data.notAdded).toEqual([ann.id]);
    expect(await invitesOf(ann.id)).toEqual([]);

    await prisma.chatGroupInvite.updateMany({
      where: { group_id: id, invitee_id: ann.id },
      data: { responded_at: new Date(Date.now() - 25 * 3600 * 1000) },
    });
    const later = await api()
      .post(`/api/v1/groups/${id}/members`)
      .set(bearer(owner.id))
      .send({ userIds: [ann.id, bob.id] })
      .expect(200);
    expect(later.body.data.notAdded).toEqual([]);
    expect(await invitesOf(ann.id)).toHaveLength(1);
    expect(await invitesOf(bob.id)).toHaveLength(1);
    // The same person is never invited twice at once.
    await api()
      .post(`/api/v1/groups/${id}/members`)
      .set(bearer(owner.id))
      .send({ userIds: [bob.id] })
      .expect(200);
    expect(await invitesOf(bob.id)).toHaveLength(1);
  });

  it('an open group can be looked into before answering; a closed one shows only the card', async () => {
    const open = await setup('public');
    const msg = await api()
      .post(`/api/v1/groups/${open.id}/messages`)
      .set(bearer(open.owner.id))
      .send({ clientMessageId: randomUUID(), type: 'text', body: 'Hello all' })
      .expect(201);
    expect(msg.body.data.body).toBe('Hello all');
    const [inv] = await invitesOf(open.ann.id);
    const peek = await api()
      .get(`/api/v1/groups/invites/${inv.id}/preview`)
      .set(bearer(open.ann.id))
      .expect(200);
    expect(peek.body.data.readable).toBe(true);
    expect(peek.body.data.description).toBe('About us');
    expect(peek.body.data.members.length).toBeGreaterThanOrEqual(1);
    expect(
      peek.body.data.messages.map((m: { body: string }) => m.body),
    ).toContain('Hello all');
    // Looking is not joining.
    await api()
      .get(`/api/v1/groups/${open.id}/messages`)
      .set(bearer(open.ann.id))
      .expect(404);

    const closed = await setup('closed');
    const [cinv] = await invitesOf(closed.ann.id);
    const card = await api()
      .get(`/api/v1/groups/invites/${cinv.id}/preview`)
      .set(bearer(closed.ann.id))
      .expect(200);
    expect(card.body.data.readable).toBe(false);
    expect(card.body.data.members).toEqual([]);
    expect(card.body.data.messages).toEqual([]);
    expect(card.body.data.invite.title).toBe('Firm');
    // Someone else's card is not readable.
    await api()
      .get(`/api/v1/groups/invites/${cinv.id}/preview`)
      .set(bearer(closed.bob.id))
      .expect(404);
  });

  it('invitations count in Requests and leave it once answered', async () => {
    const { ann, bob, id, owner } = await setup();
    const count = async (u: string) =>
      (
        (
          await api()
            .get('/api/v1/conversations/requests/count')
            .set(bearer(u))
            .expect(200)
        ).body as { data: { count: number } }
      ).data.count;
    expect(await count(ann.id)).toBe(1);
    expect(await count(bob.id)).toBe(0);
    await api()
      .post(`/api/v1/groups/${id}/members`)
      .set(bearer(owner.id))
      .send({ userIds: [bob.id] })
      .expect(200);
    expect(await count(bob.id)).toBe(1);
    const [inv] = await invitesOf(ann.id);
    await api()
      .post(`/api/v1/groups/invites/${inv.id}/decline`)
      .set(bearer(ann.id))
      .expect(204);
    expect(await count(ann.id)).toBe(0);
  });

  it('a push «group invitation» is queued under the «Groups» category', async () => {
    const { ann } = await setup();
    const rows = await prisma.notification.findMany({
      where: { user_id: ann.id, type: 'group_invite' },
    });
    expect(rows).toHaveLength(1);
  });
});

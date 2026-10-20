import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-20: calls from a group chat (video / phone buttons in the
 * group header): the host rings chosen members, the rest of the group joins
 * from the chat, leaving the group drops a person out of the call.
 */
jest.setTimeout(120_000);

describe('Group chat calls (e2e)', () => {
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
  const token = (id: string) =>
    tokens.signAccessToken({
      sub: id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    });
  const auth = (id: string) => ({ Authorization: `Bearer ${token(id)}` });
  const person = (first: string) =>
    prisma.user.create({
      data: { role: 'client', first_name: first, last_name: 'Chat' },
    });

  it('starts from the group, rings chosen members, others join, leaving drops out', async () => {
    const [owner, ann, bob, cy, out] = await Promise.all([
      person('Olga'),
      person('Ann'),
      person('Bob'),
      person('Cy'),
      person('Out'),
    ]);
    const g = await api()
      .post('/api/v1/groups')
      .set(auth(owner.id))
      .send({
        title: 'Team',
        type: 'closed',
        memberIds: [ann.id, bob.id, cy.id],
      })
      .expect(201);
    const gid = g.body.data.id as string;

    // Nobody in the group: 404. A plain member may not start (admins only).
    await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(out.id))
      .send({})
      .expect(404);
    await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(ann.id))
      .send({})
      .expect(403);

    // Nothing running yet.
    const none = await api()
      .get(`/api/v1/groups/${gid}/call`)
      .set(auth(bob.id))
      .expect(200);
    expect(none.body.data).toBeNull();

    // The owner rings Ann (and the outsider is ignored).
    const started = await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(owner.id))
      .send({ video: false, userIds: [ann.id, out.id] })
      .expect(201);
    const call = started.body.data as {
      id: string;
      groupId: string;
      conversationId: string | null;
      status: string;
      group: boolean;
      participants: { userId: string; status: string }[];
    };
    expect(call.groupId).toBe(gid);
    expect(call.conversationId).toBeNull();
    expect(call.status).toBe('active');
    expect(call.group).toBe(true);
    expect(call.participants.map((p) => [p.userId, p.status]).sort()).toEqual(
      [
        [owner.id, 'joined'],
        [ann.id, 'invited'],
      ].sort(),
    );

    // Ann picks up; Bob (not rung) sees the call and joins; the outsider cannot.
    await api()
      .post(`/api/v1/calls/${call.id}/accept`)
      .set(auth(ann.id))
      .expect(200);
    const seen = await api()
      .get(`/api/v1/groups/${gid}/call`)
      .set(auth(bob.id))
      .expect(200);
    expect(seen.body.data.id).toBe(call.id);
    await api()
      .post(`/api/v1/calls/${call.id}/join`)
      .set(auth(out.id))
      .expect(404);
    const joined = await api()
      .post(`/api/v1/calls/${call.id}/join`)
      .set(auth(bob.id))
      .expect(200);
    expect(
      (
        joined.body as { data: { participants: { status: string }[] } }
      ).data.participants.filter(
        (p: { status: string }) => p.status === 'joined',
      ),
    ).toHaveLength(3);

    // A second start in the same group joins the running call.
    const again = await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(owner.id))
      .send({})
      .expect(201);
    expect(again.body.data.id).toBe(call.id);

    // Bob leaves the group: he is out of the call, the call goes on.
    await api()
      .post(`/api/v1/groups/${gid}/leave`)
      .set(auth(bob.id))
      .expect(204);
    await new Promise((r) => setTimeout(r, 300));
    const row = await prisma.callParticipant.findUniqueOrThrow({
      where: { call_id_user_id: { call_id: call.id, user_id: bob.id } },
    });
    expect(row.status).toBe('removed');
    expect(
      (await prisma.call.findUniqueOrThrow({ where: { id: call.id } })).status,
    ).toBe('active');

    // Hanging up: Ann leaves, the owner is alone -> the call ends.
    await api()
      .post(`/api/v1/calls/${call.id}/end`)
      .set(auth(ann.id))
      .send({})
      .expect(200);
    expect(
      (await prisma.call.findUniqueOrThrow({ where: { id: call.id } })).status,
    ).toBe('ended');
    const after = await api()
      .get(`/api/v1/groups/${gid}/call`)
      .set(auth(cy.id))
      .expect(200);
    expect(after.body.data).toBeNull();
  });
});

import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { acceptInvites } from './support/group-invites';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-21: the «Calls» tab — history (newest first, cursor, only my
 * calls) and the group calls running now in my groups.
 */
jest.setTimeout(120_000);

describe('Call history (e2e)', () => {
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

  it('lists my finished calls newest first with a cursor, and the running group calls', async () => {
    const [me, ann, bob, other] = await Promise.all([
      person('Mia'),
      person('Ann'),
      person('Bob'),
      person('Other'),
    ]);
    const t = (min: number) => new Date(Date.now() - min * 60_000);
    const mk = (
      caller: string,
      callee: string,
      status: 'ended' | 'missed' | 'declined' | 'ringing',
      min: number,
      extra: Record<string, unknown> = {},
    ) =>
      prisma.call.create({
        data: {
          caller_id: caller,
          callee_id: callee,
          status,
          created_at: t(min),
          ...extra,
        },
      });
    const out = await mk(me.id, ann.id, 'ended', 50, { duration_sec: 125 });
    const missed = await mk(ann.id, me.id, 'missed', 40, { video: true });
    const declined = await mk(me.id, bob.id, 'declined', 30);
    const live = await mk(bob.id, me.id, 'ringing', 20);
    await mk(ann.id, bob.id, 'ended', 10); // not mine

    const first = await api()
      .get('/api/v1/calls/history?limit=2')
      .set(auth(me.id))
      .expect(200);
    const ids1 = (first.body.data as { id: string }[]).map((x) => x.id);
    // Newest first; the ringing one is not history.
    expect(ids1).toEqual([declined.id, missed.id]);
    expect(first.body.meta.nextCursor).toEqual(expect.any(String));
    const d = first.body.data[0] as {
      outgoing: boolean;
      status: string;
      peer: { id: string; displayName: string };
    };
    expect(d.outgoing).toBe(true);
    expect(d.status).toBe('declined');
    expect(d.peer.id).toBe(bob.id);
    expect(d.peer.displayName).toBe('Bob Chat');
    const m = first.body.data[1] as { outgoing: boolean; video: boolean };
    expect(m.outgoing).toBe(false);
    expect(m.video).toBe(true);

    const second = await api()
      .get(
        `/api/v1/calls/history?limit=2&cursor=${first.body.meta.nextCursor as string}`,
      )
      .set(auth(me.id))
      .expect(200);
    expect((second.body.data as { id: string }[]).map((x) => x.id)).toEqual([
      out.id,
    ]);
    expect(second.body.meta.nextCursor).toBeNull();
    expect((second.body.data[0] as { durationSec: number }).durationSec).toBe(
      125,
    );
    expect(live.id).toBeDefined();

    // Somebody else sees none of mine; a bad cursor is a 400.
    const none = await api()
      .get('/api/v1/calls/history')
      .set(auth(other.id))
      .expect(200);
    expect(none.body.data).toEqual([]);
    await api()
      .get('/api/v1/calls/history?cursor=nope')
      .set(auth(me.id))
      .expect(400);
    await api().get('/api/v1/calls/history').expect(401);

    // A group call running in my group is listed for me, not for outsiders.
    const g = await api()
      .post('/api/v1/groups')
      .set(auth(me.id))
      .send({ title: 'Firm', type: 'closed', memberIds: [ann.id] })
      .expect(201);
    await acceptInvites(api, auth, g.body.data.id as string, [ann.id]);
    const gid = g.body.data.id as string;
    expect(
      (await api().get('/api/v1/calls/ongoing').set(auth(ann.id))).body.data,
    ).toEqual([]);
    const started = await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(me.id))
      .send({ video: false, userIds: [ann.id] })
      .expect(201);
    const onAnn = await api()
      .get('/api/v1/calls/ongoing')
      .set(auth(ann.id))
      .expect(200);
    expect(onAnn.body.data).toHaveLength(1);
    expect(onAnn.body.data[0]).toMatchObject({
      id: started.body.data.id,
      groupId: gid,
      groupTitle: 'Firm',
      video: false,
      joined: 1,
      mine: false,
    });
    const onMe = await api()
      .get('/api/v1/calls/ongoing')
      .set(auth(me.id))
      .expect(200);
    expect(onMe.body.data[0].mine).toBe(true);
    expect(
      (await api().get('/api/v1/calls/ongoing').set(auth(other.id))).body.data,
    ).toEqual([]);
  });

  it('deletes calls from my own list (a selection, then «Clear»); the other side keeps theirs', async () => {
    const [me, ann, other] = await Promise.all([
      person('Ida'),
      person('Ann'),
      person('Zed'),
    ]);
    const mk = (caller: string, callee: string, min: number) =>
      prisma.call.create({
        data: {
          caller_id: caller,
          callee_id: callee,
          status: 'ended',
          created_at: new Date(Date.now() - min * 60_000),
        },
      });
    const a = await mk(me.id, ann.id, 30);
    const b = await mk(ann.id, me.id, 20);
    const c = await mk(me.id, ann.id, 10);
    const notMine = await mk(ann.id, other.id, 5);
    const list = async (id: string) =>
      (
        (await api().get('/api/v1/calls/history').set(auth(id)).expect(200))
          .body.data as { id: string }[]
      ).map((x) => x.id);

    const hid = await api()
      .post('/api/v1/calls/history/hide')
      .set(auth(me.id))
      .send({ ids: [b.id, notMine.id] })
      .expect(200);
    // Somebody else's call is not touched.
    expect(hid.body.data.count).toBe(1);
    expect(await list(me.id)).toEqual([c.id, a.id]);
    expect(await list(ann.id)).toEqual([notMine.id, c.id, b.id, a.id]);
    await api()
      .post('/api/v1/calls/history/hide')
      .set(auth(me.id))
      .send({ ids: [] })
      .expect(400);

    const cleared = await api()
      .delete('/api/v1/calls/history')
      .set(auth(me.id))
      .expect(200);
    expect(cleared.body.data.count).toBe(2);
    expect(await list(me.id)).toEqual([]);
    expect(await list(ann.id)).toHaveLength(4);
    // A new call shows up again.
    const d = await mk(ann.id, me.id, 1);
    expect(await list(me.id)).toEqual([d.id]);
  });
});

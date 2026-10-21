import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-21 (inbox 20e/20f/20c, Telegram «Видеочат»): the call of a
 * channel — only its owner / admins start it, subscribers join and leave
 * freely, nobody is rung, the channel and its list row show the running call
 * with its people, the call is full at nine (mesh), admins end it for all.
 */
jest.setTimeout(120_000);

describe('Channel calls (e2e)', () => {
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
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const auth = (id: string) => ({
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
      data: { role: 'client', first_name: first, last_name: 'Chc' },
    });

  /** A channel of [owner] (plus admins), with these subscribers. */
  async function channel(
    ownerId: string,
    subscribers: string[],
    admins: string[] = [],
  ): Promise<string> {
    const ch = await prisma.channel.create({
      data: {
        owner_id: ownerId,
        title: 'Calls channel',
        username: `cc${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        admins: {
          create: [
            { user_id: ownerId, role: 'owner' },
            ...admins.map((user_id) => ({ user_id, role: 'admin' })),
          ],
        },
      },
    });
    for (const id of subscribers) {
      await api()
        .put(`/api/v1/channels/${ch.id}/subscription`)
        .set(auth(id))
        .expect((r) => expect([200, 201]).toContain(r.status));
    }
    return ch.id;
  }

  const status = async (id: string) =>
    (await prisma.call.findUniqueOrThrow({ where: { id } })).status;

  it('admins start, subscribers join freely, outsiders cannot; the channel shows it', async () => {
    const [owner, admin, sub, sub2, outsider] = await Promise.all([
      person('Own'),
      person('Adm'),
      person('Sub'),
      person('Sub2'),
      person('Out'),
    ]);
    const cid = await channel(owner.id, [sub.id, sub2.id], [admin.id]);

    // Nothing running yet.
    await api()
      .get(`/api/v1/channels/${cid}/call`)
      .set(auth(sub.id))
      .expect(404);
    // A subscriber may not start the channel's call.
    await api()
      .post(`/api/v1/channels/${cid}/calls`)
      .set(auth(sub.id))
      .send({})
      .expect(403);

    const started = await api()
      .post(`/api/v1/channels/${cid}/calls`)
      .set(auth(admin.id))
      .send({})
      .expect(201);
    const call = started.body.data as {
      id: string;
      channelId: string;
      hostId: string;
      participants: { userId: string; status: string }[];
    };
    expect(call.channelId).toBe(cid);
    expect(call.hostId).toBe(admin.id);
    // Nobody is rung: only the starter is in it.
    expect(call.participants).toHaveLength(1);
    expect(
      await prisma.callParticipant.count({
        where: { call_id: call.id, status: 'invited' },
      }),
    ).toBe(0);

    // Subscribers see it (the bar) and join; an outsider cannot.
    const seen = await api()
      .get(`/api/v1/channels/${cid}/call`)
      .set(auth(sub.id))
      .expect(200);
    expect(seen.body.data.id).toBe(call.id);
    await api()
      .get(`/api/v1/channels/${cid}/call`)
      .set(auth(outsider.id))
      .expect(403);
    await api()
      .post(`/api/v1/calls/${call.id}/join`)
      .set(auth(outsider.id))
      .expect(403);
    await api()
      .post(`/api/v1/calls/${call.id}/join`)
      .set(auth(sub.id))
      .expect(200);
    // «Start» by a subscriber while it runs = join.
    const again = await api()
      .post(`/api/v1/channels/${cid}/calls`)
      .set(auth(sub2.id))
      .send({})
      .expect(201);
    expect(again.body.data.id).toBe(call.id);

    // The channel and its row in the list carry the running call.
    const ch = await api()
      .get(`/api/v1/channels/${cid}`)
      .set(auth(sub.id))
      .expect(200);
    expect(ch.body.data.ongoingCall).toMatchObject({
      id: call.id,
      video: false,
      participantCount: 3,
    });
    expect(ch.body.data.ongoingCall.participants).toHaveLength(3);
    const list = await api()
      .get('/api/v1/channels?scope=subscribed')
      .set(auth(sub2.id))
      .expect(200);
    const row = (list.body.data as { id: string; ongoingCall: unknown }[]).find(
      (c) => c.id === cid,
    );
    expect(row?.ongoingCall).toMatchObject({ participantCount: 3 });
    // Not shown to someone who does not read the channel.
    const out = await api()
      .get(`/api/v1/channels/${cid}`)
      .set(auth(outsider.id))
      .expect(200);
    expect(out.body.data.ongoingCall).toBeNull();

    // A subscriber cannot end it for all; the host leaving keeps it going.
    await api()
      .post(`/api/v1/calls/${call.id}/end`)
      .set(auth(sub.id))
      .send({ forAll: true })
      .expect(403);
    await api()
      .post(`/api/v1/calls/${call.id}/end`)
      .set(auth(admin.id))
      .send({})
      .expect(200);
    expect(await status(call.id)).toBe('active');
    // No admin in it: no host among subscribers (Telegram).
    const left = await api()
      .get(`/api/v1/calls/${call.id}`)
      .set(auth(sub.id))
      .expect(200);
    expect(left.body.data.hostId).toBeNull();

    // The owner (not in the call) ends it for everyone.
    await api()
      .post(`/api/v1/calls/${call.id}/join`)
      .set(auth(owner.id))
      .expect(200);
    await api()
      .post(`/api/v1/calls/${call.id}/end`)
      .set(auth(owner.id))
      .send({ forAll: true })
      .expect(200);
    expect(await status(call.id)).toBe('ended');
    await api()
      .get(`/api/v1/channels/${cid}/call`)
      .set(auth(sub.id))
      .expect(404);
  });

  it('lives while anyone is in it: the last one out ends it', async () => {
    const [owner, sub] = await Promise.all([person('Own'), person('Sub')]);
    const cid = await channel(owner.id, [sub.id]);
    const started = await api()
      .post(`/api/v1/channels/${cid}/calls`)
      .set(auth(owner.id))
      .send({})
      .expect(201);
    const id = started.body.data.id as string;
    await api().post(`/api/v1/calls/${id}/join`).set(auth(sub.id)).expect(200);
    await api()
      .post(`/api/v1/calls/${id}/end`)
      .set(auth(sub.id))
      .send({})
      .expect(200);
    // The owner alone: still running (people may come in).
    expect(await status(id)).toBe('active');
    await api().post(`/api/v1/calls/${id}/join`).set(auth(sub.id)).expect(200);
    for (const u of [owner, sub]) {
      await api()
        .post(`/api/v1/calls/${id}/end`)
        .set(auth(u.id))
        .send({})
        .expect(200);
    }
    expect(await status(id)).toBe('ended');
  });

  it('is full at nine (mesh): the tenth gets 409 CALL_STATE_CONFLICT, the call goes on', async () => {
    const owner = await person('Own');
    const subs = await Promise.all(
      Array.from({ length: 9 }, (_, i) => person(`S${i}`)),
    );
    const cid = await channel(
      owner.id,
      subs.map((s) => s.id),
    );
    const started = await api()
      .post(`/api/v1/channels/${cid}/calls`)
      .set(auth(owner.id))
      .send({})
      .expect(201);
    const id = started.body.data.id as string;
    for (const s of subs.slice(0, 8)) {
      await api().post(`/api/v1/calls/${id}/join`).set(auth(s.id)).expect(200);
    }
    const full = await api()
      .post(`/api/v1/calls/${id}/join`)
      .set(auth(subs[8].id))
      .expect(409);
    expect(full.body.error.code).toBe('CALL_STATE_CONFLICT');
    expect(await status(id)).toBe('active');
  });

  it('ends when the channel is deleted', async () => {
    const [owner, sub] = await Promise.all([person('Own'), person('Sub')]);
    const cid = await channel(owner.id, [sub.id]);
    const started = await api()
      .post(`/api/v1/channels/${cid}/calls`)
      .set(auth(owner.id))
      .send({})
      .expect(201);
    const id = started.body.data.id as string;
    await api().post(`/api/v1/calls/${id}/join`).set(auth(sub.id)).expect(200);
    await prisma.channel.update({
      where: { id: cid },
      data: { deleted_at: new Date() },
    });
    await api().get(`/api/v1/calls/${id}`).set(auth(sub.id)).expect(200);
    expect(await status(id)).toBe('ended');
  });
});

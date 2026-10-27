import { randomUUID } from 'node:crypto';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { acceptInvites } from './support/group-invites';
import { rowsOnAnyDb } from './support/rows-on-any-db';
import { DisappearingSweepService } from '../src/modules/chat/disappearing-sweep.service';

/**
 * Owner 2026-10-21 (WhatsApp): disappearing messages in direct chats and
 * groups — a timer for new messages, a service line, `expires_at` on what is
 * sent afterwards, expired messages gone from the lists at once and marked
 * deleted by the sweep (so the 90-day legal retention applies).
 */
jest.setTimeout(180_000);

interface Msg {
  id: string;
  type: string;
  body: string;
  senderId: string | null;
  systemKind: string | null;
  systemText: string | null;
  expiresAt: string | null;
}

describe('Disappearing messages (e2e, owner 2026-10-21)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let sweep: DisappearingSweepService;
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
    sweep = app.get(DisappearingSweepService, { strict: false });
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
      data: { role: 'client', first_name: first, last_name: 'Vanish' },
    });
  const DAY = 86_400_000;

  async function direct() {
    const [a, b] = (await Promise.all([person('Ann'), person('Bob')])).sort(
      (x, y) => (x.id < y.id ? -1 : 1),
    );
    const conv = await prisma.conversation.create({
      data: {
        client_id: b.id,
        attorney_id: a.id,
        pair_kind: 'client_client',
        status: 'active',
        request_status: 'accepted',
        participants: { create: [{ user_id: a.id }, { user_id: b.id }] },
      },
    });
    return { id: conv.id, a, b };
  }

  const send = (id: string, uid: string, body: string) =>
    api()
      .post(`/api/v1/conversations/${id}/messages`)
      .set(bearer(uid))
      .send({ type: 'text', body, clientMessageId: randomUUID() });

  it('a direct chat: timer on, service line, expiresAt on new messages only', async () => {
    const { id, a, b } = await direct();
    const before = await send(id, a.id, 'before the timer').expect(201);
    expect(before.body.data.expiresAt).toBeNull();

    await api()
      .patch(`/api/v1/conversations/${id}/disappearing`)
      .set(bearer(a.id))
      .send({ afterS: 5 })
      .expect(400);
    const on = await api()
      .patch(`/api/v1/conversations/${id}/disappearing`)
      .set(bearer(b.id))
      .send({ afterS: 604_800 })
      .expect(200);
    expect(on.body.data.disappearAfterS).toBe(604_800);

    const after = await send(id, a.id, 'after the timer').expect(201);
    const created = new Date(after.body.data.createdAt).getTime();
    const expires = new Date(after.body.data.expiresAt).getTime();
    expect(expires - created).toBeGreaterThan(7 * DAY - 5_000);
    expect(expires - created).toBeLessThan(7 * DAY + 5_000);

    const list = await api()
      .get(`/api/v1/conversations/${id}/messages`)
      .set(bearer(a.id))
      .expect(200);
    const types = (list.body.data as Msg[]).map(
      (m: { type: string; body: string }) => `${m.type}:${m.body}`,
    );
    expect(types).toContain('system:disappear:604800');
    const line = (list.body.data as Msg[]).find((m) => m.type === 'system');
    expect(line?.senderId).toBe(b.id);
    expect(line?.expiresAt).toBeNull();

    // Off again: the timer stops, nothing already sent changes.
    const off = await api()
      .patch(`/api/v1/conversations/${id}/disappearing`)
      .set(bearer(a.id))
      .send({})
      .expect(200);
    expect(off.body.data.disappearAfterS).toBeNull();
    const plain = await send(id, a.id, 'timer is off').expect(201);
    expect(plain.body.data.expiresAt).toBeNull();
  });

  it('a case chat keeps its history', async () => {
    const client = await person('Cora');
    const attorney = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Otto', last_name: 'Vanish' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: attorney.id,
        username: `van_${attorney.id.slice(0, 8)}`,
        username_lower: `van_${attorney.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'vanish_e2e' },
      create: {
        code: 'vanish_e2e',
        name_en: 'Vanish',
        i18n_key: 'practice.vanish_e2e',
        sort: 0,
      },
      update: {},
    });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    const kase = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Vanish case',
        description: 'Details',
        practice_area_id: parent.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: client.id,
        attorney_id: attorney.id,
        status: 'active',
        participants: {
          create: [{ user_id: client.id }, { user_id: attorney.id }],
        },
      },
    });
    await api()
      .patch(`/api/v1/conversations/${conv.id}/disappearing`)
      .set(bearer(client.id))
      .send({ afterS: 86_400 })
      .expect(403);
  });

  it('the sweep marks expired messages deleted and the lists forget them', async () => {
    const { id, a, b } = await direct();
    await api()
      .patch(`/api/v1/conversations/${id}/disappearing`)
      .set(bearer(a.id))
      .send({ afterS: 86_400 })
      .expect(200);
    const keep = await send(id, a.id, 'stays a while').expect(201);
    const gone = await send(id, b.id, 'goes now').expect(201);
    await prisma.message.updateMany({
      where: { id: gone.body.data.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    // Before the sweep runs the list already hides it.
    const hidden = await api()
      .get(`/api/v1/conversations/${id}/messages`)
      .set(bearer(a.id))
      .expect(200);
    const ids = (hidden.body.data as Msg[]).map((m: { id: string }) => m.id);
    expect(ids).toContain(keep.body.data.id);
    expect(ids).not.toContain(gone.body.data.id);

    const res = await sweep.run();
    expect(res.messages).toBeGreaterThanOrEqual(1);
    const [row] = await rowsOnAnyDb(
      prisma,
      () =>
        prisma.$queryRaw<
          { deleted_at: Date | null; body_original: string }[]
        >`SELECT deleted_at, body_original FROM messages
        WHERE id = ${gone.body.data.id}::UUID`,
    );
    expect(row.deleted_at).not.toBeNull();
    // The text stays for the legal retention window (90 days).
    expect(row.body_original).toBe('goes now');
    const conv = await prisma.conversation.findUniqueOrThrow({
      where: { id },
    });
    expect(conv.last_message_id).toBe(keep.body.data.id);
    const kept = await prisma.message.findFirstOrThrow({
      where: { id: keep.body.data.id },
    });
    expect(kept.deleted_at).toBeNull();
  });

  it('a group: only people allowed to edit info switch it; the line and expiry follow', async () => {
    const [owner, ann] = await Promise.all([person('Olga'), person('Ann')]);
    const created = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Vanish', memberIds: [ann.id] })
      .expect(201);
    const gid = created.body.data.id as string;
    await acceptInvites(api, bearer, gid, [ann.id]);
    // «Edit group info» is admins-only by default: a member cannot.
    await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(bearer(ann.id))
      .send({ disappearAfterS: 86_400 })
      .expect(403);
    await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(bearer(owner.id))
      .send({ disappearAfterS: 5 })
      .expect(400);
    const on = await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(bearer(owner.id))
      .send({ disappearAfterS: 604_800 })
      .expect(200);
    expect(on.body.data.disappearAfterS).toBe(604_800);

    const sent = await api()
      .post(`/api/v1/groups/${gid}/messages`)
      .set(bearer(ann.id))
      .send({
        type: 'text',
        body: 'vanishing hello',
        clientMessageId: randomUUID(),
      })
      .expect(201);
    expect(sent.body.data.expiresAt).not.toBeNull();

    const list = await api()
      .get(`/api/v1/groups/${gid}/messages`)
      .set(bearer(ann.id))
      .expect(200);
    const line = (list.body.data as Msg[]).find(
      (m) => m.systemKind === 'disappearing',
    );
    expect(line?.systemText).toBe('604800');
    expect(line?.expiresAt).toBeNull();

    await prisma.chatGroupMessage.updateMany({
      where: { id: sent.body.data.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    const after = await api()
      .get(`/api/v1/groups/${gid}/messages`)
      .set(bearer(ann.id))
      .expect(200);
    expect(
      (after.body.data as Msg[]).map((m: { id: string }) => m.id),
    ).not.toContain(sent.body.data.id);

    await sweep.run();
    const [row] = await rowsOnAnyDb(
      prisma,
      () =>
        prisma.$queryRaw<
          { deleted_at: Date | null; body: string }[]
        >`SELECT deleted_at, body FROM chat_group_messages
        WHERE id = ${sent.body.data.id}::UUID`,
    );
    expect(row.deleted_at).not.toBeNull();
    expect(row.body).toBe('vanishing hello');
    const g = await prisma.chatGroup.findUniqueOrThrow({ where: { id: gid } });
    expect(g.last_message_id).not.toBe(sent.body.data.id);

    // Open «edit info» to everyone: a member may turn it off.
    await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(bearer(owner.id))
      .send({ whoCanEditInfo: 'all' })
      .expect(200);
    const off = await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(bearer(ann.id))
      .send({ disappearAfterS: 0 })
      .expect(200);
    expect(off.body.data.disappearAfterS).toBeNull();
  });
});

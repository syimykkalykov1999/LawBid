import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { leaseKey } from '../src/modules/groups/e2ee/group-e2ee.service';
import { acceptInvites } from './support/group-invites';
import { GroupMlsClient } from './support/group-mls-client';
import type { Http } from './support/mls-client';

/**
 * Group E2EE G1 (owner 26.11; docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md):
 * group chats end to end encrypted on the same MLS Delivery Service as the
 * chats. Real MLS clients (ts-mls) talk to the server over HTTP: the text is
 * encrypted on the sender's device and read on the others'; the server keeps
 * only ciphertext plus the clear metadata the design lists (topic, mentions,
 * reply), lets a device join by external commit only for live members, holds
 * one commit lease at a time, blocks sends until a removed member's devices
 * are out, and with the switch Выкл (the default) groups work as before.
 */
jest.setTimeout(240_000);

type Res = { status: number; body: { data?: unknown; error?: unknown } };
const code = (r: Res) => (r.body.error as { code?: string } | undefined)?.code;
const why = (r: Res) =>
  (r.body.error as { details?: { why?: string } } | undefined)?.details?.why;

describe('End-to-end encrypted group chats on MLS (e2e, group E2EE G1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
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
    redis = app.get(REDIS_CLIENT);
  });

  const clearConfig = async () => {
    await prisma.appConfig.deleteMany({
      where: { key: { startsWith: 'groups.e2ee_' } },
    });
    await dropAppConfigCache(redis);
  };

  afterAll(async () => {
    await clearConfig();
    await app.close();
  });

  beforeEach(clearConfig);

  const setConfig = async (key: string, value: unknown) => {
    await prisma.appConfig.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
    await dropAppConfigCache(redis);
  };

  const auth = (id: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`,
  });
  const api = () => request(base);
  const http = (id: string): Http => ({
    post: async (path, body) => {
      const r = await api()
        .post(path)
        .set(auth(id))
        .send(body as object);
      return { status: r.status, body: r.body as Res['body'] };
    },
    get: async (path) => {
      const r = await api().get(path).set(auth(id));
      return { status: r.status, body: r.body as Res['body'] };
    },
    del: async (path) => {
      const r = await api().delete(path).set(auth(id));
      return { status: r.status };
    },
  });
  const person = (first: string) =>
    prisma.user.create({
      data: { role: 'client', first_name: first, last_name: 'Mls' },
    });
  const device = async (userId: string) => {
    const d = new GroupMlsClient(http(userId), userId);
    await d.register();
    return d;
  };

  /** A private group of [names.length] people (the first is the owner). */
  async function group(n = 2) {
    const people = await Promise.all(
      ['Olga', 'Bob', 'Carol', 'Dan'].slice(0, n).map((x) => person(x)),
    );
    const [owner, ...rest] = people;
    const created = await api()
      .post('/api/v1/groups')
      .set(auth(owner.id))
      .send({ title: 'Encrypted', memberIds: rest.map((p) => p.id) })
      .expect(201);
    const gid = created.body.data.id as string;
    await acceptInvites(
      api,
      auth,
      gid,
      rest.map((p) => p.id),
    );
    return { gid, people };
  }

  /** Olga and Bob in an encrypted group (switch Вкл). */
  async function encrypted() {
    await setConfig('groups.e2ee_mode', 'on');
    const { gid, people } = await group(2);
    const [olga, bob] = people;
    const a = await device(olga.id);
    const b = await device(bob.id);
    expect((await a.gstate(gid)).state).toBe('pending');
    expect((await a.gcreate(gid)).status).toBe(201);
    expect((await a.gcommit(gid, [b.deviceId])).status).toBe(201);
    expect(await b.takeGroupWelcomes()).toEqual([gid]);
    return { gid, olga, bob, a, b };
  }

  const messages = async (gid: string, uid: string) => {
    const r = await api()
      .get(`/api/v1/groups/${gid}/messages`)
      .set(auth(uid))
      .expect(200);
    const d = r.body.data as
      { items: Record<string, unknown>[] } | Record<string, unknown>[];
    return Array.isArray(d) ? d : d.items;
  };
  const plain = (gid: string, uid: string) =>
    api().post(`/api/v1/groups/${gid}/messages`).set(auth(uid)).send({
      type: 'text',
      body: 'plain words',
      clientMessageId: randomUUID(),
    });

  it('Выкл (the default): groups write as before; no MLS group can be made', async () => {
    const { gid, people } = await group(2);
    const [olga] = people;
    const a = await device(olga.id);
    expect(await a.gstate(gid)).toMatchObject({
      state: 'off',
      reason: 'mode_off',
    });
    const made = await a.gcreate(gid);
    expect(made.status).toBe(409);
    expect(code(made)).toBe('E2EE_OFF');
    expect((await plain(gid, olga.id)).status).toBe(201);
    const detail = await api()
      .get(`/api/v1/groups/${gid}`)
      .set(auth(olga.id))
      .expect(200);
    expect(detail.body.data).toMatchObject({ e2ee: 'off', e2eeSince: null });
    // An MLS message into a group that is not encrypted is refused.
    const mls = await api()
      .post(`/api/v1/groups/${gid}/messages`)
      .set(auth(olga.id))
      .send({
        type: 'mls',
        clientMessageId: randomUUID(),
        ciphertext: Buffer.alloc(40, 1).toString('base64'),
        mlsEpoch: 0,
        mlsDeviceId: a.deviceId,
        frankingTag: Buffer.alloc(32, 1).toString('base64'),
      });
    expect(mls.status).toBe(400);
  });

  it('crypto round trip: members read, the database holds only ciphertext, metadata stays clear; plain words and polls are refused', async () => {
    const { gid, olga, bob, a, b } = await encrypted();
    // The switch line, and the group reads «on».
    const lines = await messages(gid, bob.id);
    expect(lines.some((m) => m.systemKind === 'e2ee_on')).toBe(true);
    const detail = await api()
      .get(`/api/v1/groups/${gid}`)
      .set(auth(bob.id))
      .expect(200);
    expect(detail.body.data.e2ee).toBe('on');

    const secret = `Privileged ${randomUUID()} — встреча в суде`;
    const sent = await a.gsend(gid, secret, { mentionIds: [bob.id] });
    expect(sent.status).toBe(201);
    const id = (sent.body.data as { id: string; type: string }).id;
    expect((sent.body.data as { type: string }).type).toBe('mls');
    const got = (await messages(gid, bob.id)).find((m) => m.id === id)!;
    expect(got).toMatchObject({ type: 'mls', body: '', mentionsMe: true });
    expect(await b.decrypt(gid, got.ciphertext as string)).toBe(secret);

    const needle = secret.split(' ')[1];
    const [hits] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT
        (SELECT count(*) FROM chat_group_messages
          WHERE group_id = ${gid}::UUID
            AND (body LIKE ${'%' + needle + '%'}
              OR position(convert_to(${needle}, 'UTF8') IN coalesce(ciphertext, ''::BYTEA)) > 0))
        + (SELECT count(*) FROM mls_commits
          WHERE conversation_id = ${gid}::UUID
            AND position(convert_to(${needle}, 'UTF8') IN data) > 0) AS n`;
    expect(Number(hits.n)).toBe(0);
    const row = await prisma.chatGroupMessage.findFirst({
      where: { id, group_id: gid },
    });
    expect(row).toMatchObject({
      type: 'mls',
      body: '',
      mls_epoch: 1,
      sender_device_id: a.deviceId,
      mention_ids: [bob.id],
    });
    // After the switch no plain words go in (design §5), nor a poll.
    const refused = await plain(gid, bob.id);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('E2EE_REQUIRED');
    const poll = await api()
      .post(`/api/v1/groups/${gid}/polls`)
      .set(auth(olga.id))
      .send({
        clientMessageId: randomUUID(),
        question: 'When?',
        options: ['Mon', 'Tue'],
        multiple: false,
        anonymous: false,
      });
    expect(poll.status).toBe(409);
    // The older messages stay readable as they were.
    expect(lines.length).toBeGreaterThan(0);
  });

  it('lease: one device commits at a time; others get no KeyPackage and no commit until it is released', async () => {
    const { gid, a, b, bob } = await encrypted();
    const bPad = await device(bob.id);
    const first = await a.lease(gid);
    expect((first.body.data as { granted: boolean }).granted).toBe(true);
    const second = await b.lease(gid);
    expect(second.body.data).toMatchObject({
      granted: false,
      holderDeviceId: a.deviceId,
    });
    expect((await b.gstate(gid)).leaseHolderDeviceId).toBe(a.deviceId);
    // Without the lease: no KeyPackage, no commit.
    const claim = await b.http.post(
      `/api/v1/e2ee/groups/${gid}/key-packages/claim`,
      { deviceId: b.deviceId, deviceIds: [bPad.deviceId] },
    );
    expect(claim.status).toBe(409);
    expect(why(claim)).toBe('lease_held');
    const blocked = await b.gcommit(gid, [], [], false);
    expect(blocked.status).toBe(409);
    expect(why(blocked)).toBe('lease_held');
    // Holder commits (a self-update): the lease goes, Bob may go on.
    expect((await a.gcommit(gid, [])).status).toBe(201);
    expect(await redis.get(leaseKey(gid))).toBeNull();
    await b.gcatchUp(gid);
    expect((await b.gcommit(gid, [bPad.deviceId])).status).toBe(201);
    await a.gcatchUp(gid);
    expect(await bPad.takeGroupWelcomes()).toEqual([gid]);
    const st = await a.gstate(gid);
    expect(
      st.devices.find((d) => d.deviceId === a.deviceId)?.lastCommitAt,
    ).not.toBeNull();
    expect(st.updateDays).toBe(7);
  });

  it('external commit: a member’s device joins by itself from the GroupInfo; a non-member or another device’s identity is refused', async () => {
    const { gid, olga, a, b } = await encrypted();
    // Carol is added to the group (invite accepted) and joins by herself.
    const carol = await person('Carol');
    await api()
      .post(`/api/v1/groups/${gid}/members`)
      .set(auth(olga.id))
      .send({ userIds: [carol.id] })
      .expect((r) => expect([200, 201]).toContain(r.status));
    await acceptInvites(api, auth, gid, [carol.id]);
    const c = await device(carol.id);
    const joined = await c.joinExternal(gid);
    expect(joined.status).toBe(201);
    await a.gcatchUp(gid);
    await b.gcatchUp(gid);
    const hi = await a.gsend(gid, 'hello Carol');
    expect(hi.status).toBe(201);
    const ct = (hi.body.data as { ciphertext: string }).ciphertext;
    expect(await c.decrypt(gid, ct)).toBe('hello Carol');
    expect(await b.decrypt(gid, ct)).toBe('hello Carol');

    // Not a member: the group does not exist for them.
    const stranger = await person('Eve');
    const e = await device(stranger.id);
    const out = await e.http.post(
      `/api/v1/e2ee/groups/${gid}/external-commit`,
      {
        deviceId: e.deviceId,
        epoch: 0,
        commit: Buffer.alloc(40, 1).toString('base64'),
      },
    );
    expect(out.status).toBe(404);
    expect(code(out)).toBe('GROUP_NOT_FOUND');
    // A device already in the group joins again only as a resync.
    const again = await c.joinExternal(gid);
    expect(again.status).toBe(400);
    expect(why(again)).toBe('already_in_group');
    // (A refused commit keeps its lease until it runs out; drop it here.)
    await redis.del(leaseKey(gid));
    // A member's commit naming another device's identity is refused.
    const cPad = await device(carol.id);
    const forged = await cPad.joinExternal(gid, {
      identity: `${carol.id}:${c.deviceId}`,
    });
    expect(forged.status).toBe(400);
    expect(why(forged)).toBe('not_this_device');
    await redis.del(leaseKey(gid));
  });

  it('removal: messages wait until the removed member’s devices are out; only they may be removed; the removed one cannot read on', async () => {
    const { gid, olga, bob, a, b } = await encrypted();
    const carol = await person('Carol');
    await api()
      .post(`/api/v1/groups/${gid}/members`)
      .set(auth(olga.id))
      .send({ userIds: [carol.id] })
      .expect((r) => expect([200, 201]).toContain(r.status));
    await acceptInvites(api, auth, gid, [carol.id]);
    const c = await device(carol.id);
    expect((await c.joinExternal(gid)).status).toBe(201);
    await a.gcatchUp(gid);
    await b.gcatchUp(gid);

    await api()
      .delete(`/api/v1/groups/${gid}/members/${bob.id}`)
      .set(auth(olga.id))
      .expect(200);
    expect((await a.gstate(gid)).removeDevices).toEqual([b.deviceId]);
    const early = await a.gsend(gid, 'too early');
    expect(early.status).toBe(409);
    expect(code(early)).toBe('E2EE_MEMBERSHIP_INVALID');
    expect(why(early)).toBe('remove_first');
    // A live member's device cannot be removed by a commit.
    const wrong = await a.gcommit(gid, [], [c.deviceId]);
    expect(wrong.status).toBe(400);
    expect(why(wrong)).toBe('still_a_member');
    // The failed send moved Olga's ratchet; a fresh state for the commit.
    const out = await a.gcommit(gid, [], [b.deviceId]);
    expect(out.status).toBe(201);
    await c.gcatchUp(gid);
    const after = await a.gsend(gid, 'after Bob left');
    expect(after.status).toBe(201);
    const ct = (after.body.data as { ciphertext: string }).ciphertext;
    expect(await c.decrypt(gid, ct)).toBe('after Bob left');
    await expect(b.decrypt(gid, ct)).rejects.toThrow();
    // Bob is no member: no state, no external commit.
    const bobState = await b.http.get(`/api/v1/e2ee/groups/${gid}`);
    expect(bobState.status).toBe(404);
  });

  it('Выкл after encryption: the encrypted group stays encrypted (MLS goes on, plain stays refused); public groups need groups.e2ee_public', async () => {
    const { gid, olga, a, b } = await encrypted();
    await setConfig('groups.e2ee_mode', 'off');
    expect((await a.gstate(gid)).state).toBe('on');
    const sent = await a.gsend(gid, 'still private');
    expect(sent.status).toBe(201);
    const ct = (sent.body.data as { ciphertext: string }).ciphertext;
    expect(await b.decrypt(gid, ct)).toBe('still private');
    expect((await plain(gid, olga.id)).status).toBe(409);

    await setConfig('groups.e2ee_mode', 'on');
    const owner = await person('Pam');
    const pub = await api()
      .post('/api/v1/groups')
      .set(auth(owner.id))
      .send({
        title: 'Public',
        memberIds: [],
        type: 'public',
        username: `pub_${randomUUID().slice(0, 8)}`,
      });
    if (pub.status === 201) {
      const p = await device(owner.id);
      expect(await p.gstate(pub.body.data.id as string)).toMatchObject({
        state: 'off',
        reason: 'public_group',
      });
      await setConfig('groups.e2ee_public', true);
      expect((await p.gstate(pub.body.data.id as string)).state).toBe(
        'pending',
      );
    }
  });
});

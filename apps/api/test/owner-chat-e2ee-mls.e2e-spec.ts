import type { AddressInfo, Server } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { RealtimePublisher } from '../src/modules/realtime/realtime-publisher.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { MlsDeviceClient, type Http } from './support/mls-client';
import { pushPreviewKid } from '../src/common/push-previews/push-previews';

/**
 * Item 25 (owner 25.11; docs/architecture/E2EE_MLS_PLAN_2026-11-25.md):
 * end-to-end encrypted chats on MLS (RFC 9420). Real MLS clients (ts-mls)
 * talk to the LawBid Delivery Service over HTTP: the text is encrypted on
 * the sender's device and decrypted on the others'; the server orders the
 * commits per epoch, hands out KeyPackages once, checks who is added and
 * removed, and stores ONLY ciphertext. The admin switch chat.e2ee_mode
 * (Выкл / Вкл / Авто) and its limits are honoured.
 */
jest.setTimeout(180_000);

type Res = { status: number; body: { data?: unknown; error?: unknown } };

describe('End-to-end encrypted chats on MLS (e2e, item 25)', () => {
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

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: { key: { startsWith: 'chat.e2ee_' } },
    });
    await dropAppConfigCache(redis);
    await app.close();
  });

  const setConfig = async (key: string, value: unknown) => {
    await prisma.appConfig.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
    await dropAppConfigCache(redis);
  };

  beforeEach(async () => {
    await prisma.appConfig.deleteMany({
      where: { key: { startsWith: 'chat.e2ee_' } },
    });
    await dropAppConfigCache(redis);
  });

  const bearer = (id: string, role: 'client' | 'attorney') =>
    `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`;

  const http = (auth: string): Http => ({
    post: async (path, body) => {
      const r = await request(base)
        .post(path)
        .set('Authorization', auth)
        .send(body as object);
      return { status: r.status, body: r.body as Res['body'] };
    },
    get: async (path) => {
      const r = await request(base).get(path).set('Authorization', auth);
      return { status: r.status, body: r.body as Res['body'] };
    },
    del: async (path) => {
      const r = await request(base).delete(path).set('Authorization', auth);
      return { status: r.status };
    },
  });

  async function attorney() {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Ann', last_name: 'Attorney' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: `mls_${u.id.slice(0, 8)}`,
        username_lower: `mls_${u.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, auth: bearer(u.id, 'attorney') };
  }

  /** A case chat between a client and an attorney, contacts unlocked. */
  async function caseChat(unlocked = true) {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Bob', last_name: 'Client' },
    });
    const att = await attorney();
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'mls_e2e' },
      create: {
        code: 'mls_e2e',
        name_en: 'MLS e2e',
        i18n_key: 'practice.mls',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'mls_e2e.leaf' },
      create: {
        code: 'mls_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.mlsleaf',
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
        title: 'MLS case',
        description: 'Details',
        practice_area_id: area.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: client.id,
        attorney_id: att.id,
        status: 'active',
        contacts_unlocked: unlocked,
        participants: {
          create: [{ user_id: client.id }, { user_id: att.id }],
        },
      },
    });
    return {
      id: conv.id,
      client: { id: client.id, auth: bearer(client.id, 'client') },
      attorney: att,
    };
  }

  async function messages(auth: string, convId: string) {
    const r = await request(base)
      .get(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', auth)
      .expect(200);
    const data = r.body.data as
      { items: Record<string, unknown>[] } | Record<string, unknown>[];
    return Array.isArray(data) ? data : data.items;
  }

  /** Alice (attorney) and Bob (client) in one encrypted chat. */
  async function encryptedPair() {
    const chat = await caseChat();
    const alice = new MlsDeviceClient(
      http(chat.attorney.auth),
      chat.attorney.id,
    );
    const bob = new MlsDeviceClient(http(chat.client.auth), chat.client.id);
    await alice.register();
    await bob.register();
    expect((await alice.state(chat.id)).state).toBe('pending');
    expect((await alice.createGroup(chat.id)).status).toBe(201);
    expect((await alice.commit(chat.id, [bob.deviceId])).status).toBe(201);
    expect(await bob.takeWelcomes()).toEqual([chat.id]);
    return { chat, alice, bob };
  }

  it('crypto round trip: the recipient reads the text, the database holds only ciphertext', async () => {
    const { chat, alice, bob } = await encryptedPair();
    const secret = `Privileged ${randomUUID()} — встреча в суде в 10:00`;
    const sent = await alice.send(chat.id, secret);
    expect(sent.status).toBe(201);
    const sentDto = sent.body.data as { id: string; type: string };
    expect(sentDto.type).toBe('mls');

    const list = await messages(chat.client.auth, chat.id);
    const got = list.find((m) => m.id === sentDto.id)!;
    expect(got.type).toBe('mls');
    expect(got.body).toBe('');
    expect(await bob.decrypt(chat.id, got.ciphertext as string)).toBe(secret);

    // The server never saw the words: no column of any message, MLS table
    // or search index holds them, in any encoding.
    const needle = secret.split(' ')[1]; // the unique uuid
    const [hits] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT
        (SELECT count(*) FROM messages
          WHERE conversation_id = ${chat.id}::UUID
            AND (body_original LIKE ${'%' + needle + '%'}
              OR body_display LIKE ${'%' + needle + '%'}
              OR position(convert_to(${needle}, 'UTF8') IN coalesce(ciphertext, ''::BYTEA)) > 0))
        + (SELECT count(*) FROM mls_commits
          WHERE position(convert_to(${needle}, 'UTF8') IN data) > 0)
        + (SELECT count(*) FROM mls_welcomes
          WHERE position(convert_to(${needle}, 'UTF8') IN data) > 0)
        + (SELECT count(*) FROM message_search_tokens
          WHERE message_id = ${sentDto.id}::UUID) AS n`;
    expect(Number(hits.n)).toBe(0);
    const row = await prisma.message.findFirst({ where: { id: sentDto.id } });
    expect(row?.type).toBe('mls');
    expect(row?.ciphertext?.length).toBeGreaterThan(16);
    expect(row?.mls_epoch).toBe(1);
  });

  it('multi-device: every device of a member is its own MLS member and reads', async () => {
    const { chat, alice, bob } = await encryptedPair();
    const bobWeb = new MlsDeviceClient(
      http(chat.client.auth),
      chat.client.id,
      'web',
    );
    await bobWeb.register();
    const st = await alice.state(chat.id);
    expect(
      st.devices.find((d) => d.deviceId === bobWeb.deviceId)?.inGroup,
    ).toBe(false);
    // Any device in the group adds the new one (Wire).
    expect((await bob.commit(chat.id, [bobWeb.deviceId])).status).toBe(201);
    await alice.catchUp(chat.id);
    expect(await bobWeb.takeWelcomes()).toEqual([chat.id]);

    const fromWeb = await bobWeb.send(chat.id, 'sent from the browser');
    expect(fromWeb.status).toBe(201);
    const c = (fromWeb.body.data as { ciphertext: string }).ciphertext;
    expect(await alice.decrypt(chat.id, c)).toBe('sent from the browser');
    expect(await bob.decrypt(chat.id, c)).toBe('sent from the browser');
  });

  it('rejoin: a device that cannot join from its Welcome is removed and added again from a new KeyPackage (RFC 9420 §12.4.3.1)', async () => {
    const { chat, alice, bob } = await encryptedPair();
    const bobWeb = new MlsDeviceClient(
      http(chat.client.auth),
      chat.client.id,
      'web',
    );
    await bobWeb.register(1);
    expect((await alice.commit(chat.id, [bobWeb.deviceId])).status).toBe(201);
    await bob.catchUp(chat.id);
    // The browser lost the private half of its KeyPackage: it cannot join.
    const rejoin = (deviceId: string, auth = chat.client.auth) =>
      request(base)
        .post(`/api/v1/e2ee/conversations/${chat.id}/rejoin`)
        .set('Authorization', auth)
        .send({ deviceId });
    expect((await rejoin(bobWeb.deviceId)).status).toBe(204);
    // Its Welcome of this chat is gone, and the members are asked to
    // remove its leaf first (no member could add it while it is there).
    const ws = await bobWeb.http.get(
      `/api/v1/e2ee/welcomes?deviceId=${bobWeb.deviceId}`,
    );
    expect(ws.body.data).toEqual([]);
    expect((await alice.state(chat.id)).removeDevices).toEqual([
      bobWeb.deviceId,
    ]);
    // Somebody else's device cannot be marked.
    expect((await rejoin(bobWeb.deviceId, chat.attorney.auth)).status).toBe(
      404,
    );
    expect((await alice.commit(chat.id, [], [bobWeb.deviceId])).status).toBe(
      201,
    );
    await bob.catchUp(chat.id);
    const st = await alice.state(chat.id);
    expect(st.removeDevices).toEqual([]);
    expect(
      st.devices.find((d) => d.deviceId === bobWeb.deviceId)?.inGroup,
    ).toBe(false);
    // Added again from a fresh KeyPackage: a new Welcome, and it reads.
    expect((await bobWeb.upload(1)).status).toBe(200);
    expect((await alice.commit(chat.id, [bobWeb.deviceId])).status).toBe(201);
    await bob.catchUp(chat.id);
    expect(await bobWeb.takeWelcomes()).toEqual([chat.id]);
    const sent = await alice.send(chat.id, 'back in the chat');
    const c = (sent.body.data as { ciphertext: string }).ciphertext;
    expect(await bobWeb.decrypt(chat.id, c)).toBe('back in the chat');
    // A device that is not in the group has nothing to mark.
    const pad = new MlsDeviceClient(http(chat.client.auth), chat.client.id);
    await pad.register(1);
    expect((await rejoin(pad.deviceId)).status).toBe(204);
    expect((await alice.state(chat.id)).removeDevices).toEqual([]);
  });

  it('a new device: its first upload (with the last-resort package) tells the person’s encrypted chats to add it', async () => {
    const { chat } = await encryptedPair();
    const publisher = app.get(RealtimePublisher);
    const spy = jest.spyOn(publisher, 'toUsers');
    try {
      const pad = new MlsDeviceClient(http(chat.client.auth), chat.client.id);
      await pad.register(1);
      // One-time packages alone (a top-up) announce nothing.
      expect(
        spy.mock.calls.some(
          (c) =>
            c[1] === 'e2ee:commit' &&
            (c[2] as { conversationId: string }).conversationId === chat.id,
        ),
      ).toBe(false);
      const last = await pad.makeKeyPackage();
      const up = await pad.http.post(
        `/api/v1/e2ee/devices/${pad.deviceId}/key-packages`,
        {
          keyPackages: [],
          lastResort: MlsDeviceClient.encodeKeyPackage(last.pub),
        },
      );
      expect(up.status).toBe(200);
      const told = spy.mock.calls.find(
        (c) =>
          c[1] === 'e2ee:commit' &&
          (c[2] as { conversationId: string }).conversationId === chat.id,
      );
      expect(told).toBeDefined();
      expect([...told![0]].sort()).toEqual(
        [chat.attorney.id, chat.client.id].sort(),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('add / remove a member moves the epoch; a removed device cannot read on, and messages wait until it is removed', async () => {
    const { chat, alice, bob } = await encryptedPair();
    // A colleague of the firm joins the chat (participant row), then leaves.
    const colleague = await attorney();
    await prisma.conversationParticipant.create({
      data: { conversation_id: chat.id, user_id: colleague.id },
    });
    const carl = new MlsDeviceClient(http(colleague.auth), colleague.id);
    await carl.register();
    expect((await alice.commit(chat.id, [carl.deviceId])).status).toBe(201);
    await bob.catchUp(chat.id);
    await carl.takeWelcomes();
    expect((await alice.state(chat.id)).epoch).toBe(2);
    const hello = await alice.send(chat.id, 'welcome Carl');
    const hc = (hello.body.data as { ciphertext: string }).ciphertext;
    expect(await carl.decrypt(chat.id, hc)).toBe('welcome Carl');
    expect(await bob.decrypt(chat.id, hc)).toBe('welcome Carl');

    // Carl leaves the chat: nobody may write until his device is removed.
    await prisma.conversationParticipant.delete({
      where: {
        conversation_id_user_id: {
          conversation_id: chat.id,
          user_id: colleague.id,
        },
      },
    });
    const st = await alice.state(chat.id);
    expect(st.removeDevices).toEqual([carl.deviceId]);
    const blocked = await alice.send(chat.id, 'too early');
    expect(blocked.status).toBe(409);
    expect((blocked.body.error as { code: string }).code).toBe(
      'E2EE_MEMBERSHIP_INVALID',
    );
    // The failed send moved Alice's local ratchet; she reloads her epoch.
    const removed = await alice.commit(chat.id, [], [carl.deviceId]);
    expect(removed.status).toBe(201);
    expect((removed.body.data as { epoch: number }).epoch).toBe(3);
    await bob.catchUp(chat.id);

    const after = await alice.send(chat.id, 'after Carl left');
    expect(after.status).toBe(201);
    const ac = (after.body.data as { ciphertext: string }).ciphertext;
    expect(await bob.decrypt(chat.id, ac)).toBe('after Carl left');
    await expect(carl.decrypt(chat.id, ac)).rejects.toThrow();
  });

  it('the Delivery Service keeps one order: a stale commit or message gets 409 E2EE_EPOCH_CONFLICT', async () => {
    const { chat, alice, bob } = await encryptedPair();
    const bobPad = new MlsDeviceClient(http(chat.client.auth), chat.client.id);
    await bobPad.register();
    const alicePad = new MlsDeviceClient(
      http(chat.attorney.auth),
      chat.attorney.id,
    );
    await alicePad.register();
    // Both commit in epoch 1 at once: exactly one wins.
    const [a, b] = await Promise.all([
      alice.commit(chat.id, [alicePad.deviceId]),
      bob.commit(chat.id, [bobPad.deviceId]),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect((loser.body.error as { code: string }).code).toBe(
      'E2EE_EPOCH_CONFLICT',
    );
    // A message encrypted in the old epoch is refused too.
    const late = a.status === 409 ? alice : bob;
    const stale = await late.send(chat.id, 'old epoch');
    expect(stale.status).toBe(409);
    expect((stale.body.error as { code: string }).code).toBe(
      'E2EE_EPOCH_CONFLICT',
    );
  });

  it('push previews (third pass M12): a phone key is registered, only public keys go to the other side, the sealed blobs wait for the push', async () => {
    const { chat, alice } = await encryptedPair();
    // Bob's phone registers its push token with its push-preview key.
    const chain = randomUUID();
    await prisma.session.create({
      data: {
        user_id: chat.client.id,
        session_chain_id: chain,
        device_id: 'bob-phone',
        platform: 'ios',
        refresh_hash: `hash-${randomUUID()}`,
        expires_at: new Date(Date.now() + 86_400_000),
      },
    });
    const bobPhone = `Bearer ${tokens.signAccessToken({
      sub: chat.client.id,
      role: 'client',
      sid: chain,
      verified: false,
      subscriptionStatus: 'none',
    })}`;
    const key = randomBytes(32).toString('base64');
    await request(base)
      .post('/api/v1/push-tokens')
      .set('Authorization', bobPhone)
      .send({ token: `fid-${randomUUID()}`, platform: 'ios', previewKey: key })
      .expect(204);
    const kid = pushPreviewKid(key);
    // Alice gets Bob's public key (and nothing else); Bob does not get his own.
    const forAlice = await request(base)
      .get(`/api/v1/e2ee/conversations/${chat.id}/push-keys`)
      .set('Authorization', chat.attorney.auth)
      .expect(200);
    expect(forAlice.body.data.keys).toEqual([{ kid, key }]);
    const forBob = await request(base)
      .get(`/api/v1/e2ee/conversations/${chat.id}/push-keys`)
      .set('Authorization', chat.client.auth)
      .expect(200);
    expect(forBob.body.data.keys).toEqual([]);
    // Alice's sealed preview travels with the MLS message and waits for the
    // push in Redis; the message row never holds it.
    const ct = randomBytes(80).toString('base64');
    const sent = await alice.send(chat.id, 'hi', {
      pushPreviews: [{ kid, ct }],
    });
    expect(sent.status).toBe(201);
    const id = (sent.body.data as { id: string }).id;
    expect(JSON.parse((await redis.get(`push:pp:${id}`))!)).toEqual({
      [kid]: ct,
    });
    // A malformed preview is refused like any bad field.
    const bad = await alice.send(chat.id, 'x', {
      pushPreviews: [{ kid: 'short', ct }],
    });
    expect(bad.status).toBe(400);
    // A key that is not 32 raw bytes is refused at registration.
    await request(base)
      .post('/api/v1/push-tokens')
      .set('Authorization', bobPhone)
      .send({
        token: `fid-${randomUUID()}`,
        platform: 'ios',
        previewKey: 'abc',
      })
      .expect(400);
  });

  it('KeyPackages: a device already in the group cannot be claimed (RFC 9750 §6.3 exhaustion)', async () => {
    const { chat, alice, bob } = await encryptedPair();
    const res = await alice.http.post(
      `/api/v1/e2ee/conversations/${chat.id}/key-packages/claim`,
      { deviceIds: [bob.deviceId] },
    );
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'E2EE_MEMBERSHIP_INVALID',
    );
  });

  it('KeyPackages: only for the device’s own identity; one claim takes one, the last resort stays', async () => {
    const chat = await caseChat();
    const alice = new MlsDeviceClient(
      http(chat.attorney.auth),
      chat.attorney.id,
    );
    const bob = new MlsDeviceClient(http(chat.client.auth), chat.client.id);
    await alice.register(0);
    await bob.register(1);
    // A package naming somebody else's device is refused.
    const forged = await alice.makeKeyPackage(
      `${chat.client.id}:${bob.deviceId}`,
    );
    const res = await alice.http.post(
      `/api/v1/e2ee/devices/${alice.deviceId}/key-packages`,
      { keyPackages: [MlsDeviceClient.encodeKeyPackage(forged.pub)] },
    );
    expect(res.status).toBe(400);
    // Bob: one one-time package + a last resort.
    const last = await bob.makeKeyPackage();
    const up = await bob.http.post(
      `/api/v1/e2ee/devices/${bob.deviceId}/key-packages`,
      {
        keyPackages: [],
        lastResort: MlsDeviceClient.encodeKeyPackage(last.pub),
      },
    );
    expect(up.status).toBe(200);
    expect(up.body.data).toMatchObject({ oneTime: 1, lastResort: true });
    const claim = () =>
      alice.http.post(
        `/api/v1/e2ee/conversations/${chat.id}/key-packages/claim`,
        {
          deviceIds: [bob.deviceId],
        },
      );
    const first = (await claim()).body.data as { keyPackage: string }[];
    const second = (await claim()).body.data as { keyPackage: string }[];
    const third = (await claim()).body.data as { keyPackage: string }[];
    expect(first[0].keyPackage).not.toBe(second[0].keyPackage);
    expect(second[0].keyPackage).toBe(third[0].keyPackage); // last resort
    const count = await bob.http.get(
      `/api/v1/e2ee/devices/${bob.deviceId}/key-packages/count`,
    );
    expect(count.body.data).toMatchObject({ oneTime: 0, lastResort: true });
  });

  it('Авто: a chat is encrypted only when every member has keys; locked case chats stay as before', async () => {
    const chat = await caseChat();
    const alice = new MlsDeviceClient(
      http(chat.attorney.auth),
      chat.attorney.id,
    );
    await alice.register();
    expect(await alice.state(chat.id)).toMatchObject({
      state: 'off',
      reason: 'devices_missing',
    });
    const early = await alice.createGroup(chat.id);
    expect(early.status).toBe(409);
    expect(
      ((early.body as { error?: { code: string } }).error ?? { code: '' }).code,
    ).toBe('E2EE_OFF');
    // Вкл: the chat may be encrypted even before the client has the app.
    await setConfig('chat.e2ee_mode', 'on');
    expect((await alice.state(chat.id)).state).toBe('pending');

    const locked = await caseChat(false);
    const lockedAlice = new MlsDeviceClient(
      http(locked.attorney.auth),
      locked.attorney.id,
    );
    await lockedAlice.register();
    expect(await lockedAlice.state(locked.id)).toMatchObject({
      state: 'off',
      reason: 'locked',
    });
  });

  it('Выкл: MLS messages are refused and the chat falls back to normal messages; on again, plain text is refused', async () => {
    const { chat, alice } = await encryptedPair();
    const plain = () =>
      request(base)
        .post(`/api/v1/conversations/${chat.id}/messages`)
        .set('Authorization', chat.client.auth)
        .send({ clientMessageId: randomUUID(), body: 'plain words' });
    // Encrypted chat, switch Авто: plain words are refused.
    const refused = await plain();
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('E2EE_REQUIRED');

    await setConfig('chat.e2ee_mode', 'off');
    const mls = await alice.send(chat.id, 'while off');
    expect(mls.status).toBe(409);
    expect((mls.body.error as { code: string }).code).toBe('E2EE_OFF');
    expect((await alice.state(chat.id)).state).toBe('off');
    // The fallback: the app writes as before.
    expect((await plain()).status).toBe(201);
  });

  it('device limit (chat.e2ee_max_devices) is the admin’s number', async () => {
    const chat = await caseChat();
    await setConfig('chat.e2ee_max_devices', 1);
    const one = new MlsDeviceClient(http(chat.client.auth), chat.client.id);
    await one.register(0);
    const two = new MlsDeviceClient(http(chat.client.auth), chat.client.id);
    await expect(two.register(0)).rejects.toThrow(/409/);
  });
});

import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/** Owner 2026-10-21 (inbox 22c / 27, Telegram): a subscriber's own
 * settings of a channel — pin, the Channels section's own archive, «read»
 * (unread count), mute until a moment (no channel_post notification until
 * then); and the Chats archive count leaves groups out. */
jest.setTimeout(120_000);

describe('Channel my settings (e2e)', () => {
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
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const auth = (id: string, role: 'attorney' | 'client') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  type Who = { id: string; auth: Record<string, string> };

  async function attorney(first: string): Promise<Who> {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: first, last_name: 'Chan' },
    });
    const username = `ms${u.id.slice(0, 10)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  async function client(first: string): Promise<Who> {
    const tag = randomUUID().replace(/-/g, '').slice(0, 10);
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: first,
        last_name: 'Cli',
        phone_verified_at: new Date(),
        client_profile: {
          create: {
            state_code: 'NY',
            username: `mc${tag}`,
            username_lower: `mc${tag}`,
          },
        },
      },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  const mkChannel = async (who: Who) =>
    (
      await api()
        .post('/api/v1/channels')
        .set(who.auth)
        .send({
          title: 'Settings news',
          username: `s${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        })
        .expect(201)
    ).body.data as { id: string };

  const publish = (who: Who, channelId: string, body: string) =>
    api()
      .post(`/api/v1/channels/${channelId}/posts`)
      .set(who.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ body })
      .expect(201);

  const mine = (who: Who, id: string, body: Record<string, unknown>) =>
    api().patch(`/api/v1/channels/${id}/me`).set(who.auth).send(body);

  const list = async (who: Who, query: string) =>
    (
      (await api().get(`/api/v1/channels?${query}`).set(who.auth).expect(200))
        .body.data as { id: string; pinned: boolean; archived: boolean }[]
    ).map((c) => c);

  const posts = async (who: Who, postId: string) =>
    (
      (await api().get('/api/v1/notifications').set(who.auth)).body.data as {
        type: string;
        payload: Record<string, string>;
      }[]
    ).some((n) => n.type === 'channel_post' && n.payload.postId === postId);

  const until = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 40; i += 1) {
      if (await check()) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  };

  it('pin, read and the section archive of a channel I follow', async () => {
    const owner = await attorney('Olga');
    const reader = await client('Rita');
    const stranger = await client('Sam');
    const a = await mkChannel(owner);
    const b = await mkChannel(owner);
    for (const id of [a.id, b.id]) {
      await api()
        .put(`/api/v1/channels/${id}/subscription`)
        .set(reader.auth)
        .expect(200);
    }
    await publish(owner, a.id, 'one');
    await publish(owner, a.id, 'two');

    const got = await api()
      .get(`/api/v1/channels/${a.id}`)
      .set(reader.auth)
      .expect(200);
    expect(got.body.data).toMatchObject({
      unreadCount: 2,
      pinned: false,
      archived: false,
      mutedUntil: null,
    });
    // The owner's own posts are never unread for them.
    const own = await api()
      .get(`/api/v1/channels/${a.id}`)
      .set(owner.auth)
      .expect(200);
    expect(own.body.data.unreadCount).toBe(0);

    // Pinned first (b has no posts, so it would be last otherwise).
    const pin = await mine(reader, b.id, { pinned: true }).expect(200);
    expect(pin.body.data.pinned).toBe(true);
    let subs = await list(reader, 'scope=subscribed');
    expect(subs.map((c) => c.id)).toEqual([b.id, a.id]);

    const read = await mine(reader, a.id, { read: true }).expect(200);
    expect(read.body.data.unreadCount).toBe(0);
    await publish(owner, a.id, 'three');
    const after = await api()
      .get(`/api/v1/channels/${a.id}`)
      .set(reader.auth)
      .expect(200);
    expect(after.body.data.unreadCount).toBe(1);

    // Archive: out of «subscribed», in the archive list only.
    const arch = await mine(reader, a.id, { archived: true }).expect(200);
    expect(arch.body.data.archived).toBe(true);
    subs = await list(reader, 'scope=subscribed');
    expect(subs.map((c) => c.id)).toEqual([b.id]);
    const archived = await list(reader, 'scope=subscribed&archived=true');
    expect(archived.map((c) => c.id)).toEqual([a.id]);
    expect(archived[0].archived).toBe(true);
    await mine(reader, a.id, { archived: false }).expect(200);
    subs = await list(reader, 'scope=subscribed');
    expect(subs.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());

    // «Mine»: the owner's archived channel leaves the managed list.
    await mine(owner, b.id, { archived: true }).expect(200);
    const managed = await list(owner, 'scope=managed');
    expect(managed.map((c) => c.id)).toEqual([a.id]);
    const ownerArchive = await list(owner, 'scope=managed&archived=true');
    expect(ownerArchive.map((c) => c.id)).toEqual([b.id]);

    // No subscription → 404; bad input → 400.
    await mine(stranger, a.id, { pinned: true }).expect(404);
    await mine(reader, a.id, { mutedUntil: 'soon' }).expect(400);
    await mine(reader, a.id, { pinned: 'yes' }).expect(400);
  });

  it('a timed mute stops channel_post notifications until its moment', async () => {
    const owner = await attorney('Omar');
    const loud = await client('Lou');
    const quiet = await client('Quinn');
    const ch = await mkChannel(owner);
    for (const who of [loud, quiet]) {
      await api()
        .put(`/api/v1/channels/${ch.id}/subscription`)
        .set(who.auth)
        .expect(200);
    }

    // 2 days ahead (the Telegram choices: 1 h / 8 h / 2 days / forever).
    const ahead = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    const muted = await mine(quiet, ch.id, { mutedUntil: ahead }).expect(200);
    expect(muted.body.data.isMuted).toBe(true);
    expect(new Date(muted.body.data.mutedUntil as string).toISOString()).toBe(
      ahead,
    );

    const p1 = (await publish(owner, ch.id, 'first')).body.data.id as string;
    expect(await until(() => posts(loud, p1))).toBe(true);
    expect(await posts(quiet, p1)).toBe(false);

    // The moment passed: notifications come again.
    const past = new Date(Date.now() - 1000).toISOString();
    const over = await mine(quiet, ch.id, { mutedUntil: past }).expect(200);
    expect(over.body.data.isMuted).toBe(false);
    const p2 = (await publish(owner, ch.id, 'second')).body.data.id as string;
    expect(await until(() => posts(quiet, p2))).toBe(true);

    // null unmutes; the old switch still mutes for good.
    await mine(quiet, ch.id, { mutedUntil: ahead }).expect(200);
    const unmuted = await mine(quiet, ch.id, { mutedUntil: null }).expect(200);
    expect(unmuted.body.data).toMatchObject({
      isMuted: false,
      mutedUntil: null,
    });
    const legacy = await api()
      .patch(`/api/v1/channels/${ch.id}/subscription`)
      .set(quiet.auth)
      .send({ muted: true })
      .expect(200);
    expect(legacy.body.data.isMuted).toBe(true);
    const p3 = (await publish(owner, ch.id, 'third')).body.data.id as string;
    expect(await until(() => posts(loud, p3))).toBe(true);
    expect(await posts(quiet, p3)).toBe(false);
    const off = await api()
      .patch(`/api/v1/channels/${ch.id}/subscription`)
      .set(quiet.auth)
      .send({ muted: false })
      .expect(200);
    expect(off.body.data.isMuted).toBe(false);
  });

  it('the Chats archive count leaves my archived groups out', async () => {
    const me = await client('Mia');
    const other = await client('Ned');
    const g = await api()
      .post('/api/v1/groups')
      .set(me.auth)
      .send({ title: 'Archived team', memberIds: [other.id] })
      .expect(201);
    const groupId = g.body.data.id as string;
    await prisma.chatGroup.update({
      where: { id: groupId },
      data: { last_message_at: new Date() },
    });
    await api()
      .patch(`/api/v1/groups/${groupId}/me`)
      .set(me.auth)
      .send({ archived: true })
      .expect(200);
    const counts = await api()
      .get('/api/v1/conversations/folders/counts')
      .set(me.auth)
      .expect(200);
    expect(counts.body.data.archived).toBe(0);
    const archivedGroups = await api()
      .get('/api/v1/groups?archived=true')
      .set(me.auth)
      .expect(200);
    expect(
      (archivedGroups.body.data as { id: string }[]).map((x) => x.id),
    ).toEqual([groupId]);
  });
});

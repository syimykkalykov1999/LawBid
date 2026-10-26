import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';

/** Owner 2026-10-20: channels end to end — create / edit, @username, only
 * admins post, subscribe / mute, views counted once, one reaction, comments
 * (on / off, delete by an admin), notifications to subscribers, moderation
 * by report, and the admin team. */
jest.setTimeout(120_000);

describe('Channels (e2e)', () => {
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

  type Who = { id: string; username: string; auth: Record<string, string> };

  async function attorney(first: string): Promise<Who> {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: first, last_name: 'Chan' },
    });
    const username = `ch${u.id.slice(0, 10)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    return { id: u.id, username, auth: auth(u.id, 'attorney') };
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
            username: `cc${tag}`,
            username_lower: `cc${tag}`,
          },
        },
      },
    });
    return { id: u.id, username: `cc${tag}`, auth: auth(u.id, 'client') };
  }

  const mkChannel = (who: Who, over: Record<string, unknown> = {}) =>
    api()
      .post('/api/v1/channels')
      .set(who.auth)
      .send({
        title: 'Immigration news',
        username: `n${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        description: 'Daily updates',
        ...over,
      });

  const publish = (who: Who, channelId: string, body = 'Hello subscribers') =>
    api()
      .post(`/api/v1/channels/${channelId}/posts`)
      .set(who.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ body });

  const until = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 40; i += 1) {
      if (await check()) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  };

  it('creates a channel with a unique @username; attorneys and clients', async () => {
    const owner = await attorney('Olga');
    const reader = await client('Rita');
    const name = `ch_${randomUUID().replace(/-/g, '').slice(0, 10)}`;

    const made = await mkChannel(owner, { username: `@${name.toUpperCase()}` });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({
      title: 'Immigration news',
      username: name,
      subscriberCount: 1,
      postCount: 0,
      myRole: 'owner',
      isSubscribed: true,
      commentsEnabled: true,
    });
    const id = made.body.data.id as string;

    expect((await mkChannel(owner, { username: name })).status).toBe(409);
    expect((await mkChannel(owner, { username: 'lawbid' })).status).toBe(400);
    expect((await mkChannel(owner, { username: 'a' })).status).toBe(400);
    // Owner 2026-10-21 (п.24): a client creates channels too; an account
    // that may not publish (no verified phone) still may not.
    expect((await mkChannel(reader)).status).toBe(201);
    await prisma.user.update({
      where: { id: reader.id },
      data: { phone_verified_at: null },
    });
    expect((await mkChannel(reader)).status).toBe(403);
    await prisma.user.update({
      where: { id: reader.id },
      data: { phone_verified_at: new Date() },
    });

    // By @username and by id.
    const byName = await api()
      .get(`/api/v1/channels/@${name}`)
      .set(reader.auth);
    expect(byName.body.data).toMatchObject({
      id,
      myRole: null,
      isSubscribed: false,
    });

    // Only the owner renames @username; admins edit the rest.
    const next = `${name}_x`;
    const renamed = await api()
      .patch(`/api/v1/channels/${id}`)
      .set(owner.auth)
      .send({ username: next, title: 'Updated', commentsEnabled: false });
    expect(renamed.body.data).toMatchObject({
      username: next,
      title: 'Updated',
      commentsEnabled: false,
    });
    expect(
      (
        await api()
          .patch(`/api/v1/channels/${id}`)
          .set(reader.auth)
          .send({ title: 'Hacked' })
      ).status,
    ).toBe(403);
  });

  // Owner 2026-10-22 (audit #4 §6): generous caps, set in the admin.
  it('channels per owner are capped by channels.max_owned', async () => {
    const redis = app.get<Redis>(REDIS_CLIENT);
    const owner = await attorney('Capped');
    await prisma.appConfig.upsert({
      where: { key: 'channels.max_owned' },
      create: { key: 'channels.max_owned', value: 1 },
      update: { value: 1 },
    });
    await dropAppConfigCache(redis);
    try {
      expect((await mkChannel(owner)).status).toBe(201);
      const second = await mkChannel(owner);
      expect(second.status).toBe(409);
      expect(second.body.error).toMatchObject({
        code: 'CHANNEL_LIMIT_REACHED',
        details: { max: 1 },
      });
    } finally {
      await prisma.appConfig.deleteMany({
        where: { key: 'channels.max_owned' },
      });
      await dropAppConfigCache(redis);
    }
  });

  it('subscribers read; only admins post; views count once; one reaction', async () => {
    const owner = await attorney('Pavel');
    const a = await client('Anna');
    const b = await client('Boris');
    const ch = (await mkChannel(owner)).body.data;

    expect((await publish(a, ch.id)).status).toBe(403);
    const p1 = await publish(owner, ch.id, 'First post');
    expect(p1.status).toBe(201);
    expect(p1.body.data).toMatchObject({
      body: 'First post',
      viewCount: 0,
      commentCount: 0,
    });
    expect((await publish(owner, ch.id, '   ')).status).toBe(400);

    const sub = await api()
      .put(`/api/v1/channels/${ch.id}/subscription`)
      .set(a.auth);
    expect(sub.body.data).toMatchObject({
      isSubscribed: true,
      subscriberCount: 2,
    });
    await api().put(`/api/v1/channels/${ch.id}/subscription`).set(a.auth);
    expect(
      (await api().get(`/api/v1/channels/${ch.id}`).set(a.auth)).body.data
        .subscriberCount,
    ).toBe(2);

    const feed = await api().get(`/api/v1/channels/${ch.id}/posts`).set(a.auth);
    expect((feed.body.data as { body: string }[]).map((x) => x.body)).toEqual([
      'First post',
    ]);
    const postId = p1.body.data.id as string;

    // Views: once per person, admins don't count.
    for (const who of [a, a, b, owner]) {
      expect(
        (
          await api()
            .post(`/api/v1/channels/${ch.id}/views`)
            .set(who.auth)
            .send({ postIds: [postId] })
        ).status,
      ).toBe(204);
    }
    const viewed = await api()
      .get(`/api/v1/channels/${ch.id}/posts/${postId}`)
      .set(a.auth);
    expect(viewed.body.data.viewCount).toBe(2);

    // Shares: one per person per 24 h counts.
    for (const who of [a, a, b]) {
      expect(
        (
          await api()
            .post(`/api/v1/channels/${ch.id}/posts/${postId}/share`)
            .set(who.auth)
        ).status,
      ).toBe(204);
    }
    const shared = await api()
      .get(`/api/v1/channels/${ch.id}/posts/${postId}`)
      .set(a.auth);
    expect(shared.body.data.shareCount).toBe(2);

    // One reaction per person; changing replaces; removing clears.
    const r1 = await api()
      .put(`/api/v1/channels/${ch.id}/posts/${postId}/reaction`)
      .set(a.auth)
      .send({ emoji: '👍' });
    expect(r1.body.data.myReaction).toBe('👍');
    await api()
      .put(`/api/v1/channels/${ch.id}/posts/${postId}/reaction`)
      .set(b.auth)
      .send({ emoji: '👍' });
    const r2 = await api()
      .put(`/api/v1/channels/${ch.id}/posts/${postId}/reaction`)
      .set(a.auth)
      .send({ emoji: '🔥' });
    expect(r2.body.data.reactions).toEqual(
      expect.arrayContaining([
        { emoji: '👍', count: 1 },
        { emoji: '🔥', count: 1 },
      ]),
    );
    expect(
      (
        await api()
          .put(`/api/v1/channels/${ch.id}/posts/${postId}/reaction`)
          .set(a.auth)
          .send({ emoji: '💩' })
      ).status,
    ).toBe(400);
    const r3 = await api()
      .delete(`/api/v1/channels/${ch.id}/posts/${postId}/reaction`)
      .set(a.auth);
    expect(r3.body.data.myReaction).toBeNull();

    // Edit and delete by an admin only.
    const edited = await api()
      .patch(`/api/v1/channels/${ch.id}/posts/${postId}`)
      .set(owner.auth)
      .send({ body: 'First post (edited)' });
    expect(edited.body.data.editedAt).not.toBeNull();
    expect(
      (
        await api()
          .delete(`/api/v1/channels/${ch.id}/posts/${postId}`)
          .set(a.auth)
      ).status,
    ).toBe(403);
    expect(
      (
        await api()
          .delete(`/api/v1/channels/${ch.id}/posts/${postId}`)
          .set(owner.auth)
      ).status,
    ).toBe(204);
    expect(
      (await api().get(`/api/v1/channels/${ch.id}`).set(a.auth)).body.data
        .postCount,
    ).toBe(0);

    // Unsubscribe.
    const un = await api()
      .delete(`/api/v1/channels/${ch.id}/subscription`)
      .set(a.auth);
    expect(un.body.data).toMatchObject({
      isSubscribed: false,
      subscriberCount: 1,
    });
  });

  it('keeps my pin, Archive and timed mute per channel (inbox 22c, 27)', async () => {
    const owner = await attorney('Pia');
    const reader = await client('Rita');
    const a = (await mkChannel(owner)).body.data;
    const b = (
      await mkChannel(owner, {
        title: 'Second',
        username: `s${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      })
    ).body.data;
    for (const ch of [a, b]) {
      await api()
        .put(`/api/v1/channels/${ch.id}/subscription`)
        .set(reader.auth);
    }
    const patch = (id: string, body: object) =>
      api()
        .patch(`/api/v1/channels/${id}/subscription`)
        .set(reader.auth)
        .send(body);
    const list = async (archived: boolean) =>
      (
        await api()
          .get(`/api/v1/channels?scope=subscribed&archived=${archived}`)
          .set(reader.auth)
      ).body.data as { id: string; isPinned: boolean; isArchived: boolean }[];

    // Archive: leaves the list, shows in the Archive, comes back.
    expect((await patch(a.id, { archived: true })).body.data.isArchived).toBe(
      true,
    );
    expect((await list(false)).map((c) => c.id)).toEqual([b.id]);
    expect((await list(true)).map((c) => c.id)).toEqual([a.id]);
    await patch(a.id, { archived: false });
    expect(await list(true)).toHaveLength(0);

    // Pin: the pinned channel goes first.
    await patch(a.id, { pinned: true });
    const pinned = await list(false);
    expect(pinned[0]).toMatchObject({ id: a.id, isPinned: true });

    // Timed mute: muted now, not muted once the moment has passed.
    const until = new Date(Date.now() + 3600_000).toISOString();
    const timed = await patch(a.id, { mutedUntil: until });
    expect(timed.body.data).toMatchObject({ isMuted: true, mutedUntil: until });
    const gone = await patch(a.id, {
      mutedUntil: new Date(Date.now() - 1000).toISOString(),
    });
    expect(gone.body.data.isMuted).toBe(false);
    await patch(a.id, { muted: true });
    expect((await patch(a.id, { muted: false })).body.data).toMatchObject({
      isMuted: false,
      mutedUntil: null,
    });
  });

  it('notifies subscribers who did not mute; comments follow the switch', async () => {
    const owner = await attorney('Nina');
    const loud = await client('Loud');
    const quiet = await client('Quiet');
    const ch = (await mkChannel(owner)).body.data;
    for (const who of [loud, quiet]) {
      await api().put(`/api/v1/channels/${ch.id}/subscription`).set(who.auth);
    }
    const muted = await api()
      .patch(`/api/v1/channels/${ch.id}/subscription`)
      .set(quiet.auth)
      .send({ muted: true });
    expect(muted.body.data.isMuted).toBe(true);

    const post = await publish(owner, ch.id, 'Breaking: new rule');
    const postId = post.body.data.id as string;

    const got = await until(async () => {
      const n = await api().get('/api/v1/notifications').set(loud.auth);
      return (n.body.data as { type: string }[]).some(
        (x) => x.type === 'channel_post',
      );
    });
    expect(got).toBe(true);
    const notes = await api().get('/api/v1/notifications').set(loud.auth);
    const note = (
      notes.body.data as { type: string; payload: Record<string, string> }[]
    ).find((x) => x.type === 'channel_post');
    expect(note?.payload).toMatchObject({
      channelId: ch.id,
      postId,
      channelTitle: 'Immigration news',
    });
    const quietNotes = await api().get('/api/v1/notifications').set(quiet.auth);
    expect(
      (quietNotes.body.data as { type: string }[]).some(
        (x) => x.type === 'channel_post',
      ),
    ).toBe(false);

    // Comments: a reader comments, an admin deletes, the switch closes them.
    const c1 = await api()
      .post(`/api/v1/channels/${ch.id}/posts/${postId}/comments`)
      .set(loud.auth)
      .send({ body: 'Thanks!' });
    expect(c1.status).toBe(201);
    const list = await api()
      .get(`/api/v1/channels/${ch.id}/posts/${postId}/comments`)
      .set(quiet.auth);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      body: 'Thanks!',
      canDelete: false,
    });
    expect(
      (
        await api()
          .get(`/api/v1/channels/${ch.id}/posts/${postId}`)
          .set(quiet.auth)
      ).body.data.commentCount,
    ).toBe(1);
    expect(
      (
        await api()
          .delete(
            `/api/v1/channels/${ch.id}/posts/${postId}/comments/${c1.body.data.id}`,
          )
          .set(quiet.auth)
      ).status,
    ).toBe(403);
    expect(
      (
        await api()
          .delete(
            `/api/v1/channels/${ch.id}/posts/${postId}/comments/${c1.body.data.id}`,
          )
          .set(owner.auth)
      ).status,
    ).toBe(204);
    await api()
      .patch(`/api/v1/channels/${ch.id}`)
      .set(owner.auth)
      .send({ commentsEnabled: false });
    expect(
      (
        await api()
          .post(`/api/v1/channels/${ch.id}/posts/${postId}/comments`)
          .set(loud.auth)
          .send({ body: 'Too late' })
      ).status,
    ).toBe(403);
  });

  it('manages the admin team, search, reports and bans', async () => {
    const owner = await attorney('Oscar');
    const helper = await attorney('Helen');
    const reader = await client('Rick');
    const ch = (await mkChannel(owner, { title: 'Zebra Law Digest' })).body
      .data;

    // Add an admin by @username; the admin posts; only the owner adds.
    const added = await api()
      .post(`/api/v1/channels/${ch.id}/admins`)
      .set(owner.auth)
      .send({ username: `@${helper.username}` });
    expect(added.status).toBe(201);
    expect(added.body.data).toHaveLength(2);
    expect((await publish(helper, ch.id, 'From the helper')).status).toBe(201);
    expect(
      (
        await api()
          .post(`/api/v1/channels/${ch.id}/admins`)
          .set(helper.auth)
          .send({ username: reader.username })
      ).status,
    ).toBe(403);
    expect(
      (
        await api()
          .delete(`/api/v1/channels/${ch.id}/admins/${owner.id}`)
          .set(helper.auth)
      ).status,
    ).toBe(403);
    expect(
      (
        await api()
          .delete(`/api/v1/channels/${ch.id}/admins/${helper.id}`)
          .set(owner.auth)
      ).status,
    ).toBe(204);
    expect((await publish(helper, ch.id)).status).toBe(403);

    // Search by title and @username; "mine" lists my channels.
    const found = await api()
      .get('/api/v1/channels?q=zebra law')
      .set(reader.auth);
    expect((found.body.data as { id: string }[]).map((x) => x.id)).toContain(
      ch.id,
    );
    const byName = await api()
      .get(`/api/v1/channels?q=${ch.username}`)
      .set(reader.auth);
    expect((byName.body.data as { id: string }[]).map((x) => x.id)).toContain(
      ch.id,
    );
    const managed = await api()
      .get('/api/v1/channels?scope=managed')
      .set(owner.auth);
    expect((managed.body.data as { id: string }[]).map((x) => x.id)).toContain(
      ch.id,
    );

    // Reports reach the moderation queue; moderation hides the channel
    // from search (hidden) and closes it (banned) for readers.
    const rep = await api()
      .post('/api/v1/reports')
      .set(reader.auth)
      .send({ targetType: 'channel', targetId: ch.id, reason: 'spam' });
    expect(rep.status).toBe(204);
    expect(
      await prisma.report.count({
        where: { target_type: 'channel', target_id: ch.id },
      }),
    ).toBe(1);

    await prisma.channel.update({
      where: { id: ch.id },
      data: { status: 'hidden' },
    });
    const hiddenSearch = await api()
      .get('/api/v1/channels?q=zebra law')
      .set(reader.auth);
    expect(
      (hiddenSearch.body.data as { id: string }[]).map((x) => x.id),
    ).not.toContain(ch.id);
    // Still readable by link, and status stays private to readers.
    const viaLink = await api()
      .get(`/api/v1/channels/${ch.id}`)
      .set(reader.auth);
    expect(viaLink.status).toBe(200);
    expect(viaLink.body.data.status).toBe('active');

    await prisma.channel.update({
      where: { id: ch.id },
      data: { status: 'banned' },
    });
    expect(
      (await api().get(`/api/v1/channels/${ch.id}`).set(reader.auth)).status,
    ).toBe(404);
    const asOwner = await api()
      .get(`/api/v1/channels/${ch.id}`)
      .set(owner.auth);
    expect(asOwner.body.data.status).toBe('banned');
    expect((await publish(owner, ch.id)).status).toBe(403);

    // Deleting is the owner's (a banned channel is invisible to others).
    expect(
      (await api().delete(`/api/v1/channels/${ch.id}`).set(helper.auth)).status,
    ).toBe(404);
    expect(
      (await api().delete(`/api/v1/channels/${ch.id}`).set(owner.auth)).status,
    ).toBe(204);
    expect(
      (await api().get(`/api/v1/channels/${ch.id}`).set(owner.auth)).status,
    ).toBe(404);
  });
});

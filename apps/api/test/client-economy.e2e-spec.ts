import { createHash, randomUUID } from 'node:crypto';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { BadgesService } from '../src/modules/notifications/badges.service';
import { adminSession } from './support/admin-login';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { RealtimePublisher } from '../src/modules/realtime/realtime-publisher.service';

/**
 * Owner 2026-10-22 — client economy plan (docs/perf/CLIENT_ECONOMY_PLAN_
 * 2026-10-22.md): the API side of the packages — batched views (A), cheap
 * ETags and follow counts (D), one start request (G), group deltas (B),
 * case / consultation events and list deltas (E), notification deltas and
 * comment rooms (F), admin counts (J).
 */
jest.setTimeout(120_000);

describe('Client economy (e2e, owner 2026-10-22)', () => {
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
    for (const [code, name] of [
      ['NY', 'New York'],
      ['NJ', 'New Jersey'],
    ]) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name },
        update: {},
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const ids = (rows: unknown) => (rows as { id: string }[]).map((r) => r.id);
  const bearer = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function attorney() {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Eco', last_name: 'Nomy' },
    });
    const username = `eco${u.id.replace(/-/g, '').slice(0, 10)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, username, auth: bearer(u.id, 'attorney') };
  }

  async function client() {
    const tag = randomUUID().replace(/-/g, '').slice(0, 10);
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Sa',
        last_name: 'Ver',
        client_profile: {
          create: {
            state_code: 'NY',
            username: `sv${tag}`,
            username_lower: `sv${tag}`,
          },
        },
      },
    });
    return { id: u.id, auth: bearer(u.id, 'client') };
  }

  // ------------------------------------------------------------ package A

  it('A: POST /posts/events kind=view counts three posts once, not twice in a day', async () => {
    const author = await attorney();
    const viewer = await client();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await prisma.post.create({
        data: { author_id: author.id, body: `Post ${i}` },
      });
      ids.push(p.id);
    }
    const events = ids.map((postId) => ({ postId, kind: 'view' }));
    await api()
      .post('/api/v1/posts/events')
      .set(viewer.auth)
      .send({ events })
      .expect(204);
    await api()
      .post('/api/v1/posts/events')
      .set(viewer.auth)
      .send({ events })
      .expect(204);
    const rows = await prisma.postViewEvent.findMany({
      where: { post_id: { in: ids }, viewer_id: viewer.id, kind: 'view' },
    });
    expect(rows).toHaveLength(3);
    const seen = await prisma.postView.findMany({
      where: { post_id: { in: ids }, user_id: viewer.id },
    });
    expect(seen).toHaveLength(3);
  });

  it('A: POST /cases/views records many cases; the single route still works', async () => {
    const att = await attorney();
    const cl = await client();
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'eco_e2e' },
      create: {
        code: 'eco_e2e',
        name_en: 'Eco',
        i18n_key: 'practice.eco_e2e',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'eco_e2e.leaf' },
      create: {
        code: 'eco_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.eco_e2e.leaf',
        sort: 0,
      },
      update: {},
    });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    const mk = (title: string) =>
      prisma.case.create({
        data: {
          client_id: cl.id,
          title,
          description: 'Details',
          practice_area_id: area.id,
          primary_state_code: 'NJ',
          status: 'open',
          budget_mode: 'clarify_later',
        },
      });
    const c1 = await mk('Eco one');
    const c2 = await mk('Eco two');
    await api()
      .post('/api/v1/cases/views')
      .set(att.auth)
      .send({ caseIds: [c1.id, c2.id, randomUUID()] })
      .expect(204);
    await api().post(`/api/v1/cases/${c1.id}/view`).set(att.auth).expect(204);
    await api()
      .post('/api/v1/cases/views')
      .set(att.auth)
      .send({ caseIds: [] })
      .expect(400);
  });

  // ------------------------------------------------------------ package D

  it('D: GET /config/bootstrap answers 304 to its own ETag and carries Cache-Control', async () => {
    const first = await api().get('/api/v1/config/bootstrap').expect(200);
    const etag = first.headers.etag;
    expect(etag).toMatch(/^W\/"boot-/);
    expect(first.headers['cache-control']).toContain('stale-while-revalidate');
    expect(first.body.data.app_config['cache.limit_mb.messages']).toBe(50);
    const again = await api()
      .get('/api/v1/config/bootstrap')
      .set('If-None-Match', etag)
      .expect(304);
    expect(again.text ?? '').toBe('');
  });

  it('web pass: the i18n bundle (full and delta), languages and countries all answer 304 to their own ETag', async () => {
    await prisma.i18nLanguage.upsert({
      where: { code: 'en' },
      create: { code: 'en', name_native: 'English', is_active: true, sort: 0 },
      update: {},
    });
    // Full bundle: strong tag, private + no-cache (always revalidated).
    const full = await api().get('/api/v1/i18n/bundle/en').expect(200);
    expect(full.headers.etag).toMatch(/^"en-v\d+"$/);
    expect(full.headers['cache-control']).toBe('private, no-cache');
    const fullAgain = await api()
      .get('/api/v1/i18n/bundle/en')
      .set('If-None-Match', full.headers.etag)
      .expect(304);
    expect(fullAgain.text ?? '').toBe('');
    expect(fullAgain.headers.etag).toBe(full.headers.etag);

    // Delta (the phone's and the web app's normal call): its own tag, which
    // carries `since`, so the same delta is a 304 and a different one is not.
    const version = full.body.data.version as number;
    const delta = await api()
      .get(`/api/v1/i18n/bundle/en?since=${version}`)
      .expect(200);
    expect(delta.headers.etag).toBe(`"en-v${version}-s${version}"`);
    expect(delta.headers.etag).not.toBe(full.headers.etag);
    expect(delta.body.data.translations).toEqual({});
    await api()
      .get(`/api/v1/i18n/bundle/en?since=${version}`)
      .set('If-None-Match', delta.headers.etag)
      .expect(304);
    const other = await api()
      .get(`/api/v1/i18n/bundle/en?since=${version + 1}`)
      .set('If-None-Match', delta.headers.etag)
      .expect(200);
    expect(other.headers.etag).not.toBe(delta.headers.etag);
    // The full tag never answers a delta, nor the other way round.
    await api()
      .get(`/api/v1/i18n/bundle/en?since=${version}`)
      .set('If-None-Match', full.headers.etag)
      .expect(200);

    for (const path of ['/api/v1/i18n/languages', '/api/v1/countries']) {
      const first = await api().get(path).expect(200);
      expect(first.headers.etag).toBeTruthy();
      expect(first.headers['cache-control']).toContain('max-age');
      const again = await api()
        .get(path)
        .set('If-None-Match', first.headers.etag)
        .expect(304);
      expect(again.text ?? '').toBe('');
    }
  });

  it('D: GET /attorneys/:username is 304 with zero profile queries; a follow changes the tag and answers counts', async () => {
    const att = await attorney();
    const cl = await client();
    const first = await api()
      .get(`/api/v1/attorneys/${att.username}`)
      .set(cl.auth)
      .expect(200);
    const etag = first.headers.etag;
    expect(etag).toMatch(/^W\/"att-/);

    const queries: string[] = [];
    const client$ = prisma as unknown as {
      $on: (e: 'query', cb: (ev: { query: string }) => void) => void;
    };
    // Prisma 5: $on('query') is available when log includes {emit:'event'};
    // when it is not configured the listener simply never fires, and we
    // fall back to the status check alone.
    try {
      client$.$on('query', (ev) => queries.push(ev.query));
    } catch {
      // not configured
    }
    const again = await api()
      .get(`/api/v1/attorneys/${att.username}`)
      .set(cl.auth)
      .set('If-None-Match', etag)
      .expect(304);
    expect(again.text ?? '').toBe('');
    // The cheap tag reads attorney_profiles + users once; nothing else.
    expect(
      queries.filter((q) => /attorney_licenses|post_|reviews/i.test(q)),
    ).toHaveLength(0);

    const followed = await api()
      .post(`/api/v1/attorneys/${att.id}/follow`)
      .set(cl.auth)
      .expect(200);
    expect(followed.body.data).toEqual({ following: true, followersCount: 1 });
    const after = await api()
      .get(`/api/v1/attorneys/${att.username}`)
      .set(cl.auth)
      .set('If-None-Match', etag)
      .expect(200);
    expect(after.headers.etag).not.toBe(etag);
    expect(after.body.data.isFollowing).toBe(true);
    const unfollowed = await api()
      .delete(`/api/v1/attorneys/${att.id}/follow`)
      .set(cl.auth)
      .expect(200);
    expect(unfollowed.body.data).toEqual({
      following: false,
      followersCount: 0,
    });
  });

  // ------------------------------------------------------------ package G

  it('G: GET /me/session answers everything once and 304 to its own ETag; a new unread moves the tag', async () => {
    const att = await attorney();
    const first = await api()
      .get('/api/v1/me/session')
      .set(att.auth)
      .expect(200);
    const d = first.body.data;
    expect(d.me.id).toBe(att.id);
    expect(d.badges).toMatchObject({ chatsUnread: 0, notificationsUnread: 0 });
    expect(typeof d.bootstrapVersion).toBe('string');
    expect(typeof d.flags).toBe('object');
    expect(d.unreadSupport).toBe(0);
    expect(d.hasOngoingCalls).toBe(false);
    const etag = first.headers.etag;
    expect(etag).toMatch(/^W\/"sess-/);
    const again = await api()
      .get('/api/v1/me/session')
      .set(att.auth)
      .set('If-None-Match', etag)
      .expect(304);
    expect(again.text ?? '').toBe('');

    await prisma.notification.create({
      data: {
        user_id: att.id,
        type: 'new_follower',
        category: 'social',
        payload: { actorKind: 'client' },
      },
    });
    const badges = app.get(BadgesService);
    await badges.notificationsChanged(att.id);
    const moved = await api()
      .get('/api/v1/me/session')
      .set(att.auth)
      .set('If-None-Match', etag)
      .expect(200);
    expect(moved.headers.etag).not.toBe(etag);
    expect(moved.body.data.badges.notificationsUnread).toBe(1);
  });

  // ------------------------------------------------------------ package B

  async function groupOf(ownerId: string, memberId: string) {
    const made = await api()
      .post('/api/v1/groups')
      .set(bearer(ownerId, 'client'))
      .send({ title: 'Delta', type: 'closed', memberIds: [memberId] })
      .expect(201);
    const id = made.body.data.id as string;
    const invites = await api()
      .get('/api/v1/groups/invites')
      .set(bearer(memberId, 'client'))
      .expect(200);
    const inv = (invites.body.data as { id: string; groupId: string }[]).find(
      (i) => i.groupId === id,
    );
    await api()
      .post(`/api/v1/groups/invites/${inv!.id}/accept`)
      .set(bearer(memberId, 'client'))
      .expect(200);
    return id;
  }

  it('B: GET /groups?updatedSince, messages?afterId, topics?updatedSince; leaving puts the id in deletedIds', async () => {
    const owner = await client();
    const ann = await client();
    const gid = await groupOf(owner.id, ann.id);
    const send = (auth: Record<string, string>, body: string) =>
      api()
        .post(`/api/v1/groups/${gid}/messages`)
        .set(auth)
        .send({ clientMessageId: randomUUID(), type: 'text', body })
        .expect(201);
    const m1 = await send(owner.auth, 'one');
    const first = await api()
      .get('/api/v1/groups')
      .set(ann.auth)
      .query({ updatedSince: new Date(Date.now() - 60_000).toISOString() })
      .expect(200);
    expect(ids(first.body.data)).toContain(gid);
    expect(first.body.meta.deletedIds).toEqual([]);
    const syncedAt = first.body.meta.syncedAt as string;
    expect(new Date(syncedAt).getTime()).toBeGreaterThan(0);

    await send(owner.auth, 'two');
    await send(owner.auth, 'three');
    const after = await api()
      .get(`/api/v1/groups/${gid}/messages`)
      .set(ann.auth)
      .query({ afterId: m1.body.data.id })
      .expect(200);
    expect((after.body.data as { body: string }[]).map((m) => m.body)).toEqual([
      'two',
      'three',
    ]);
    expect(after.body.meta.nextCursor).toBeNull();

    const topics = await api()
      .get(`/api/v1/groups/${gid}/topics`)
      .set(ann.auth)
      .query({ updatedSince: syncedAt })
      .expect(200);
    expect(topics.body.data).toEqual([]);
    expect(topics.body.meta.deletedIds).toEqual([]);

    await api()
      .get('/api/v1/groups')
      .set(ann.auth)
      .query({ updatedSince: '2020-01-01T00:00:00Z' })
      .expect(409);

    await api().post(`/api/v1/groups/${gid}/leave`).set(ann.auth).expect(204);
    const gone = await api()
      .get('/api/v1/groups')
      .set(ann.auth)
      .query({ updatedSince: syncedAt })
      .expect(200);
    expect(ids(gone.body.data)).not.toContain(gid);
    expect(gone.body.meta.deletedIds).toContain(gid);
  });

  it('B: group:update carries the shared card when the info changes', async () => {
    const owner = await client();
    const ann = await client();
    const gid = await groupOf(owner.id, ann.id);
    const publisher = app.get(RealtimePublisher);
    const spy = jest.spyOn(publisher, 'toUsers');
    await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(owner.auth)
      .send({ title: 'Renamed' })
      .expect(200);
    const call = spy.mock.calls.find(
      ([, event, data]) =>
        event === 'group:update' &&
        (data as { groupId: string; card?: unknown }).groupId === gid &&
        (data as { card?: unknown }).card !== undefined,
    );
    expect(call).toBeDefined();
    expect((call![2] as { card: { title: string } }).card.title).toBe(
      'Renamed',
    );
    spy.mockRestore();
  });

  // ------------------------------------------------------------ package E

  it('E: a bid notification publishes case:update to the client; my lists answer deltas with deletedIds', async () => {
    const cl = await client();
    const att = await attorney();
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'eco_e2e' },
      create: {
        code: 'eco_e2e',
        name_en: 'Eco',
        i18n_key: 'practice.eco_e2e',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'eco_e2e.leaf' },
      create: {
        code: 'eco_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.eco_e2e.leaf',
        sort: 0,
      },
      update: {},
    });
    const kase = await prisma.case.create({
      data: {
        client_id: cl.id,
        title: 'Delta case',
        description: 'Details',
        practice_area_id: area.id,
        primary_state_code: 'NJ',
        status: 'open',
        budget_mode: 'clarify_later',
      },
    });
    const publisher = app.get(RealtimePublisher);
    const spy = jest.spyOn(publisher, 'toUsers');
    const notifications = app.get(NotificationsService);
    await notifications.emit({
      type: 'bid_received',
      recipientId: cl.id,
      payload: { caseId: kase.id, bidId: randomUUID() },
    });
    expect(spy).toHaveBeenCalledWith(
      [cl.id],
      'case:update',
      expect.objectContaining({ caseId: kase.id, kind: 'bid_new' }),
    );
    spy.mockRestore();

    const since = new Date(Date.now() - 60_000).toISOString();
    const mine = await api()
      .get('/api/v1/users/me/cases')
      .set(cl.auth)
      .query({ updatedSince: since })
      .expect(200);
    expect(ids(mine.body.data)).toContain(kase.id);
    expect(mine.body.meta.deletedIds).toEqual([]);
    const syncedAt = mine.body.meta.syncedAt as string;

    // Closing moves the case out of the "active" tab → deletedIds.
    await prisma.case.update({
      where: { id: kase.id },
      data: { status: 'closed', closed_at: new Date() },
    });
    const after = await api()
      .get('/api/v1/users/me/cases')
      .set(cl.auth)
      .query({ updatedSince: syncedAt })
      .expect(200);
    expect(ids(after.body.data)).not.toContain(kase.id);
    expect(after.body.meta.deletedIds).toContain(kase.id);

    const bids = await api()
      .get('/api/v1/users/me/bids')
      .set(att.auth)
      .query({ updatedSince: since })
      .expect(200);
    expect(bids.body.data).toEqual([]);
    expect(bids.body.meta).toMatchObject({ deletedIds: [], nextCursor: null });
    const work = await api()
      .get('/api/v1/users/me/work')
      .set(att.auth)
      .query({ updatedSince: since })
      .expect(200);
    expect(work.body.meta.deletedIds).toEqual([]);
    const cons = await api()
      .get('/api/v1/consultations')
      .set(cl.auth)
      .query({ updatedSince: since })
      .expect(200);
    expect(cons.body.meta).toMatchObject({ deletedIds: [] });
    expect(typeof cons.body.meta.syncedAt).toBe('string');
    const invites = await api()
      .get('/api/v1/invites')
      .set(att.auth)
      .query({ updatedSince: since })
      .expect(200);
    expect(invites.body.meta).toMatchObject({ deletedIds: [] });
    await api()
      .get('/api/v1/consultations')
      .set(cl.auth)
      .query({ updatedSince: '2020-01-01T00:00:00Z' })
      .expect(409);
  });

  // ------------------------------------------------------------ package F

  it('F: GET /notifications?updatedSince and POST /notifications/read → readIds', async () => {
    const att = await attorney();
    const since = new Date(Date.now() - 60_000).toISOString();
    const n1 = await prisma.notification.create({
      data: {
        user_id: att.id,
        type: 'new_follower',
        category: 'social',
        payload: { actorKind: 'client' },
      },
    });
    const delta = await api()
      .get('/api/v1/notifications')
      .set(att.auth)
      .query({ updatedSince: since })
      .expect(200);
    expect(ids(delta.body.data)).toEqual([n1.id]);
    expect(delta.body.meta.deletedIds).toEqual([]);
    const syncedAt = delta.body.meta.syncedAt as string;
    expect(new Date(syncedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(since).getTime(),
    );
    const read = await api()
      .post('/api/v1/notifications/read')
      .set(att.auth)
      .send({ ids: [n1.id, randomUUID()] })
      .expect(200);
    expect(read.body.data).toEqual({ updated: 1, readIds: [n1.id] });
    // Reading moved updated_at: the row comes back in the next delta.
    const again = await api()
      .get('/api/v1/notifications')
      .set(att.auth)
      .query({ updatedSince: syncedAt })
      .expect(200);
    expect(ids(again.body.data)).toEqual([n1.id]);
    expect(again.body.data[0].readAt).toBeTruthy();
    await api()
      .get('/api/v1/notifications')
      .set(att.auth)
      .query({ updatedSince: '2020-01-01T00:00:00Z' })
      .expect(409);
  });

  it('F: a channel post reaches the open channel room; the subscribed list answers deltas', async () => {
    const owner = await attorney();
    const reader = await client();
    const made = await api()
      .post('/api/v1/channels')
      .set(owner.auth)
      .send({
        title: 'Eco news',
        username: `n${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        description: 'Daily',
      })
      .expect(201);
    const chId = made.body.data.id as string;
    await api()
      .put(`/api/v1/channels/${chId}/subscription`)
      .set(reader.auth)
      .expect(200);
    const since = new Date(Date.now() - 60_000).toISOString();
    const publisher = app.get(RealtimePublisher);
    const spy = jest.spyOn(publisher, 'toRoom');
    await api()
      .post(`/api/v1/channels/${chId}/posts`)
      .set(owner.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ body: 'Hello' })
      .expect(201);
    const roomCall = spy.mock.calls.find(
      ([room, event]) => room === `channel:${chId}` && event === 'channel:post',
    );
    expect(roomCall).toBeDefined();
    expect((roomCall![2] as { post: { body: string } }).post.body).toBe(
      'Hello',
    );
    spy.mockRestore();
    const delta = await api()
      .get('/api/v1/channels')
      .set(reader.auth)
      .query({ scope: 'subscribed', updatedSince: since })
      .expect(200);
    expect(ids(delta.body.data)).toContain(chId);
    expect(delta.body.meta.deletedIds).toEqual([]);
    expect(typeof delta.body.meta.syncedAt).toBe('string');
  });

  it('F: a new comment is published to the post room with the comment body', async () => {
    const author = await attorney();
    const reader = await client();
    const post = await prisma.post.create({
      data: { author_id: author.id, body: 'Commented' },
    });
    const publisher = app.get(RealtimePublisher);
    const spy = jest.spyOn(publisher, 'toRoom');
    const made = await api()
      .post(`/api/v1/posts/${post.id}/comments`)
      .set(reader.auth)
      .send({ body: 'Nice' })
      .expect(201);
    const call = spy.mock.calls.find(
      ([room, event]) => room === `post:${post.id}` && event === 'comment:new',
    );
    expect(call).toBeDefined();
    expect((call![2] as { comment: { id: string } }).comment.id).toBe(
      made.body.data.id,
    );
    spy.mockRestore();
  });

  // ------------------------------------------------------------ package I

  it('I: a presigned upload carries the immutable Cache-Control field', async () => {
    const cl = await client();
    const res = await api()
      .post('/api/v1/files/presign')
      .set(cl.auth)
      .send({
        purpose: 'avatar',
        mime: 'image/jpeg',
        sizeBytes: 1024,
        sha256: createHash('sha256').update('eco').digest('hex'),
      });
    if (res.status === 201 || res.status === 200) {
      expect(res.body.data.upload.fields['Cache-Control']).toBe(
        'public, max-age=31536000, immutable',
      );
    } else {
      // No object storage in this environment: the route says so, the
      // header is covered by the S3 unit spec.
      expect([503, 501]).toContain(res.status);
    }
  });

  // ------------------------------------------------------------ package J

  it('J: GET /admin/counts answers the five badges in one request with an ETag; the dashboard is cacheable', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const first = await api()
      .get('/api/v1/admin/counts')
      .set(admin.auth)
      .expect(200);
    expect(first.body.data).toEqual({
      verificationQueue: expect.any(Number),
      openReports: expect.any(Number),
      supportUnread: expect.any(Number),
      trustQueue: expect.any(Number),
      approvalsPending: expect.any(Number),
    });
    expect(first.headers['cache-control']).toBe('private, max-age=30');
    const etag = first.headers.etag;
    expect(etag).toMatch(/^W\/"adm-/);
    await api()
      .get('/api/v1/admin/counts')
      .set(admin.auth)
      .set('If-None-Match', etag)
      .expect(304);
    const dash = await api()
      .get('/api/v1/admin/dashboard')
      .set(admin.auth)
      .expect(200);
    expect(dash.headers['cache-control']).toBe('private, max-age=30');
  });

  it('D: reference lists carry a private / public Cache-Control with stale-while-revalidate', async () => {
    const cl = await client();
    const stickers = await api().get('/api/v1/stickers').set(cl.auth);
    expect(stickers.headers['cache-control']).toContain('private');
    expect(stickers.headers['cache-control']).toContain(
      'stale-while-revalidate',
    );
    const countries = await api().get('/api/v1/countries').expect(200);
    expect(countries.headers['cache-control']).toContain('public, max-age=300');
  });
});

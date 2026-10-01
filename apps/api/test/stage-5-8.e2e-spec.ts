import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PushDispatcher } from '../src/modules/notifications/push/push-dispatcher';
import { PUSH_SENDER } from '../src/modules/notifications/push/push.constants';
import { NotificationsRetentionJob } from '../src/jobs/handlers/notifications-retention.job';
import { ensurePostPractices } from './support/post-practices';

/**
 * docs/05 §16 stage 5.8 acceptance: `new_message` makes no list row but a
 * push; 5 likes of one post in an hour are one aggregated notification
 * without push; quiet hours defer a push; `system` can't be turned off;
 * the badge is the sum of unread and never counts `new_message` twice.
 */
jest.setTimeout(120_000);

describe('Notifications, push, badges (e2e, docs/05 §9-§10, stage 5.8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let notifications: NotificationsService;
  let dispatcher: PushDispatcher;
  let sent: { userId: string; title: string }[];
  let baseUrl = '';

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
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    await ensurePostPractices(prisma);
    tokens = app.get(TokenService);
    notifications = app.get(NotificationsService);
    dispatcher = app.get(PushDispatcher);
    const sender = app.get<{ send: (m: never) => Promise<void> }>(PUSH_SENDER);
    jest
      .spyOn(sender, 'send')
      .mockImplementation((m: { userId: string; title: string }) => {
        sent.push(m);
        return Promise.resolve();
      });
  });

  beforeEach(() => {
    sent = [];
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(role: 'client' | 'attorney') {
    const u = await prisma.user.create({
      data: { role, first_name: 'Sarah', last_name: 'Lee' },
    });
    if (role === 'attorney') {
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username: `att_${u.id.slice(0, 8)}`,
          username_lower: `att_${u.id.slice(0, 8)}`,
          languages: ['en'],
          verification_status: 'verified',
        },
      });
      // docs/06 §1.2: an active subscription (stage 6.7).
      await prisma.subscription.create({
        data: { user_id: u.id, status: 'active', price_cents: 39900 },
      });
    }
    const t = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${t}` } };
  }

  async function conversationBetween(client: string, attorney: string) {
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'notif_e2e' },
      create: { code: 'notif_e2e', name_en: 'N', i18n_key: 'n', sort: 0 },
      update: {},
    });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    const kase = await prisma.case.create({
      data: {
        client_id: client,
        title: 'Case',
        description: 'd',
        practice_area_id: parent.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    return prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: client,
        attorney_id: attorney,
        participants: {
          create: [{ user_id: client }, { user_id: attorney }],
        },
      },
    });
  }

  it('new_message: no list row, but a push (unless the chat is muted)', async () => {
    const client = await user('client');
    const att = await user('attorney');
    const conv = await conversationBetween(client.id, att.id);
    const r = await api()
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .set(att.auth)
      .send({ clientMessageId: randomUUID(), body: 'Hello there' });
    expect(r.status).toBe(201);
    expect(
      await prisma.notification.count({
        where: { user_id: client.id, type: 'new_message' },
      }),
    ).toBe(0);

    const job = {
      kind: 'message' as const,
      recipientId: client.id,
      conversationId: conv.id,
      messageId: r.body.data.id as string,
    };
    expect(await dispatcher.dispatch(job, 'j1')).toBe('sent');
    expect(sent.some((m) => m.userId === client.id)).toBe(true);

    await prisma.conversationParticipant.update({
      where: {
        conversation_id_user_id: {
          conversation_id: conv.id,
          user_id: client.id,
        },
      },
      data: { muted_until: new Date(Date.now() + 3600_000) },
    });
    expect(await dispatcher.dispatch(job, 'j2')).toBe('muted');
  });

  it('5 likes of one post in an hour: one aggregated row, no push', async () => {
    const author = await user('attorney');
    const post = await api()
      .post('/api/v1/posts')
      .set(author.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'A title',
        practiceCode: 'family_law',
        body: 'Know your rights',
      });
    const postId = post.body.data.id as string;
    for (let i = 0; i < 5; i++) {
      const fan = await user('client');
      expect(
        (await api().post(`/api/v1/posts/${postId}/like`).set(fan.auth)).status,
      ).toBe(204);
    }
    const rows = await prisma.notification.findMany({
      where: { user_id: author.id, type: 'post_like' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].aggregate_count).toBe(5);
    expect(
      await dispatcher.dispatch(
        { kind: 'notification', notificationId: rows[0].id, push: false },
        'j3',
      ),
    ).toBe('no_push');
    // The app's own push worker may drain other suites' jobs meanwhile:
    // only this author's pushes matter.
    expect(sent.filter((m) => m.userId === author.id)).toHaveLength(0);

    const list = await api().get('/api/v1/notifications').set(author.auth);
    expect(list.body.data[0]).toMatchObject({
      type: 'post_like',
      aggregateCount: 5,
      actor: { id: null, displayName: 'Sarah L.' },
    });
  });

  it('quiet hours defer the push; security_new_device is exempt', async () => {
    const u = await user('client');
    // A window covering the whole day except one minute: always "inside".
    const now = new Date();
    const end = new Date(now.getTime() - 60_000);
    const hhmm = (d: Date) => d.toISOString().slice(11, 16);
    const set = await api()
      .put('/api/v1/notification-settings/quiet-hours')
      .set(u.auth)
      .send({ start: hhmm(now), end: hhmm(end), timezone: 'UTC' });
    expect(set.status).toBe(200);

    const n = await notifications.emit({
      type: 'case_closed',
      recipientId: u.id,
      payload: { caseId: randomUUID() },
    });
    expect(
      await dispatcher.dispatch(
        { kind: 'notification', notificationId: n!.id, push: true },
        'j4',
      ),
    ).toBe('deferred');

    const sec = await notifications.emit({
      type: 'security_new_device',
      recipientId: u.id,
      payload: {},
    });
    expect(
      await dispatcher.dispatch(
        { kind: 'notification', notificationId: sec!.id, push: true },
        'j5',
      ),
    ).toBe('sent');
  });

  it('system can not be turned off', async () => {
    const u = await user('client');
    const r = await api()
      .put('/api/v1/notification-settings')
      .set(u.auth)
      .send({
        items: [{ category: 'system', pushEnabled: false, emailEnabled: true }],
      });
    expect(r.status).toBe(400);
    const ok = await api()
      .put('/api/v1/notification-settings')
      .set(u.auth)
      .send({
        items: [
          { category: 'social', pushEnabled: false, emailEnabled: false },
        ],
      });
    expect(ok.status).toBe(200);
    expect(
      (ok.body.data.categories as { category: string; pushEnabled: boolean }[])
        .filter((c) => ['system', 'social'].includes(c.category))
        .map((c) => [c.category, c.pushEnabled]),
    ).toEqual([
      ['social', false],
      ['system', true],
    ]);

    // Even a stored "off" row can't silence system.
    await prisma.notificationSetting.create({
      data: { user_id: u.id, category: 'system', push_enabled: false },
    });
    const n = await notifications.emit({
      type: 'verification_update',
      recipientId: u.id,
      payload: {},
    });
    expect(
      await dispatcher.dispatch(
        { kind: 'notification', notificationId: n!.id, push: true },
        'j6',
      ),
    ).toBe('sent');
  });

  it('badge = unread messages + unread notifications, new_message not twice', async () => {
    const client = await user('client');
    const att = await user('attorney');
    const conv = await conversationBetween(client.id, att.id);
    for (const body of ['one', 'two']) {
      await api()
        .post(`/api/v1/conversations/${conv.id}/messages`)
        .set(att.auth)
        .send({ clientMessageId: randomUUID(), body });
    }
    await notifications.emit({
      type: 'case_closed',
      recipientId: client.id,
      payload: { caseId: randomUUID() },
    });
    const b = await api().get('/api/v1/badges').set(client.auth);
    expect(b.body.data).toEqual({
      chatsUnread: 2,
      notificationsUnread: 1,
      total: 3,
    });

    const read = await api()
      .post('/api/v1/notifications/read')
      .set(client.auth)
      .send({ all: true });
    expect(read.body.data.updated).toBe(1);
    const after = await api().get('/api/v1/badges').set(client.auth);
    expect(after.body.data.total).toBe(2);
  });

  it('retention removes notifications older than retention_days', async () => {
    const u = await user('client');
    const old = await prisma.notification.create({
      data: {
        user_id: u.id,
        type: 'case_closed',
        category: 'cases',
        payload: {},
        created_at: new Date(Date.now() - 400 * 24 * 3600_000),
      },
    });
    await app.get(NotificationsRetentionJob).run();
    expect(
      await prisma.notification.findUnique({ where: { id: old.id } }),
    ).toBeNull();
  });
});

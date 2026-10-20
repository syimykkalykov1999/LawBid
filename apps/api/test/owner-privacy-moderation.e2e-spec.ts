import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ModerationAppealsService } from '../src/modules/moderation/moderation-appeals.service';
import type { AdminActor } from '../src/modules/admin-auth/admin-auth.decorators';

/**
 * Owner 2026-10-20: privacy settings (last seen / first message / calls:
 * everyone, contacts, nobody) and moderation transparency (my reports, the
 * author's notices and one appeal, the moderators' decision).
 */
jest.setTimeout(120_000);

describe('Privacy settings and moderation appeals (e2e, owner 2026-10-20)', () => {
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

  async function person(role: 'client' | 'attorney', name: string) {
    const u = await prisma.user.create({
      data: { role, first_name: name, last_name: 'Tester' },
    });
    if (role === 'attorney') {
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username: `pm_${u.id.slice(0, 8)}`,
          username_lower: `pm_${u.id.slice(0, 8)}`,
          languages: ['en'],
          verification_status: 'verified',
        },
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

  it('defaults to everyone; a change is stored and the old switch follows', async () => {
    const me = await person('client', 'Pia');
    const first = await api()
      .get('/api/v1/users/me/privacy')
      .set(me.auth)
      .expect(200);
    expect(first.body.data).toEqual({
      lastSeen: 'everyone',
      messageFrom: 'everyone',
      callFrom: 'everyone',
    });
    const put = await api()
      .put('/api/v1/users/me/privacy')
      .set(me.auth)
      .send({ lastSeen: 'nobody', messageFrom: 'contacts' })
      .expect(200);
    expect(put.body.data).toEqual({
      lastSeen: 'nobody',
      messageFrom: 'contacts',
      callFrom: 'everyone',
    });
    const flag = await api()
      .get('/api/v1/users/me/activity-status')
      .set(me.auth)
      .expect(200);
    expect(flag.body.data.showActivityStatus).toBe(false);
    // The old switch writes the new audience.
    await api()
      .put('/api/v1/users/me/activity-status')
      .set(me.auth)
      .send({ showActivityStatus: true })
      .expect(200);
    const back = await api()
      .get('/api/v1/users/me/privacy')
      .set(me.auth)
      .expect(200);
    expect(back.body.data.lastSeen).toBe('everyone');
    await api()
      .put('/api/v1/users/me/privacy')
      .set(me.auth)
      .send({ lastSeen: 'sometimes' })
      .expect(400);
  });

  it('"first message" nobody / contacts decides who may open a chat', async () => {
    const target = await person('attorney', 'Tara');
    const stranger = await person('client', 'Sam');
    const friend = await person('client', 'Fay');
    await api()
      .put('/api/v1/users/me/privacy')
      .set(target.auth)
      .send({ messageFrom: 'nobody' })
      .expect(200);
    const denied = await api()
      .post('/api/v1/conversations/direct')
      .set(stranger.auth)
      .send({ userId: target.id })
      .expect(403);
    expect(denied.body.error.code).toBe('PRIVACY_RESTRICTED');

    await api()
      .put('/api/v1/users/me/privacy')
      .set(target.auth)
      .send({ messageFrom: 'contacts' })
      .expect(200);
    await api()
      .post('/api/v1/conversations/direct')
      .set(stranger.auth)
      .send({ userId: target.id })
      .expect(403);
    // Tara has Fay in her phone book.
    await prisma.contactMatch.create({
      data: { owner_id: target.id, matched_id: friend.id },
    });
    await api()
      .post('/api/v1/conversations/direct')
      .set(friend.auth)
      .send({ userId: target.id })
      .expect(200);
    // An existing chat is never cut off by a later change.
    await api()
      .put('/api/v1/users/me/privacy')
      .set(target.auth)
      .send({ messageFrom: 'nobody' })
      .expect(200);
    await api()
      .post('/api/v1/conversations/direct')
      .set(friend.auth)
      .send({ userId: target.id })
      .expect(200);
  });

  it('last seen: hidden from non-contacts when set to contacts', async () => {
    const owner = await person('attorney', 'Olive');
    const contact = await person('client', 'Cleo');
    const stranger = await person('client', 'Stan');
    const seen = new Date();
    await prisma.user.update({
      where: { id: owner.id },
      data: { last_active_at: seen },
    });
    for (const p of [contact, stranger]) {
      await prisma.conversation.create({
        data: {
          client_id: p.id,
          attorney_id: owner.id,
          status: 'active',
          contacts_unlocked: true,
          request_status: 'accepted',
          last_message_at: new Date(),
          participants: { create: [{ user_id: p.id }, { user_id: owner.id }] },
        },
      });
    }
    await prisma.contactMatch.create({
      data: { owner_id: owner.id, matched_id: contact.id },
    });
    await api()
      .put('/api/v1/users/me/privacy')
      .set(owner.auth)
      .send({ lastSeen: 'contacts' })
      .expect(200);
    const lastSeenFor = async (viewer: { auth: Record<string, string> }) => {
      const res = await api()
        .get('/api/v1/conversations')
        .set(viewer.auth)
        .expect(200);
      const list = res.body.data as {
        counterpart: { id: string; lastSeenAt: string | null };
      }[];
      return list.find((c) => c.counterpart.id === owner.id)!.counterpart
        .lastSeenAt;
    };
    expect(await lastSeenFor(contact)).not.toBeNull();
    expect(await lastSeenFor(stranger)).toBeNull();
  });

  it('reports: "mine" shows the status; a decision on my post can be appealed once', async () => {
    const author = await person('attorney', 'Ann');
    const reporter = await person('client', 'Rex');
    const other = await person('client', 'Otto');
    const post = await prisma.post.create({
      data: {
        author_id: author.id,
        body: 'Offending text',
        status: 'hidden',
      },
    });
    await api()
      .post('/api/v1/reports')
      .set(reporter.auth)
      .send({ targetType: 'post', targetId: post.id, reason: 'nudity' })
      .expect(204);
    const mine = await api()
      .get('/api/v1/reports/mine')
      .set(reporter.auth)
      .expect(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({
      targetType: 'post',
      reason: 'nudity',
      status: 'open',
    });

    const admin = await prisma.user.create({
      data: { role: 'client', first_name: 'Mod', last_name: 'Erator' },
    });
    const action = await prisma.moderationAction.create({
      data: {
        admin_id: admin.id,
        target_type: 'post',
        target_id: post.id,
        action: 'hide',
        reason: 'Explicit image',
      },
    });

    const notices = await api()
      .get('/api/v1/moderation/notices')
      .set(author.auth)
      .expect(200);
    expect(notices.body.data[0]).toMatchObject({
      actionId: action.id,
      action: 'hide',
      reason: 'Explicit image',
      canAppeal: true,
      appealStatus: null,
    });
    // Somebody else cannot see or appeal it.
    expect(
      (
        await api()
          .get('/api/v1/moderation/notices')
          .set(other.auth)
          .expect(200)
      ).body.data,
    ).toHaveLength(0);
    await api()
      .post('/api/v1/moderation/appeals')
      .set(other.auth)
      .send({ actionId: action.id, message: 'not mine' })
      .expect(404);

    const filed = await api()
      .post('/api/v1/moderation/appeals')
      .set(author.auth)
      .send({ actionId: action.id, message: 'It is a court exhibit.' })
      .expect(201);
    expect(filed.body.data).toMatchObject({
      canAppeal: false,
      appealStatus: 'pending',
    });
    const again = await api()
      .post('/api/v1/moderation/appeals')
      .set(author.auth)
      .send({ actionId: action.id, message: 'again' })
      .expect(409);
    expect(again.body.error.code).toBe('APPEAL_NOT_ALLOWED');

    // The moderators' side: queue → accept → the post is back.
    const appeals = app.get(ModerationAppealsService);
    const queue = await appeals.queue({ status: 'pending' }, null);
    const item = queue.items.find((i) => i.targetId === post.id)!;
    expect(item).toMatchObject({ action: 'hide', message: expect.any(String) });
    const actor = {
      id: admin.id,
      adminRole: 'super_admin',
      sessionId: randomUUID(),
      justification: null,
      ip: null,
    } as unknown as AdminActor;
    await expect(appeals.decide(actor, item.id, true, 'Fine')).resolves.toBe(
      'accepted',
    );
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status,
    ).toBe('published');
    await expect(appeals.decide(actor, item.id, false, 'x')).rejects.toThrow();
    const after = await api()
      .get('/api/v1/moderation/notices')
      .set(author.auth)
      .expect(200);
    const hide = (
      after.body.data as { action: string; appealStatus: string | null }[]
    ).find((n) => n.action === 'hide')!;
    expect(hide.appealStatus).toBe('accepted');
    const notice = await prisma.notification.findFirst({
      where: { user_id: author.id },
      orderBy: { created_at: 'desc' },
    });
    expect(notice?.payload).toMatchObject({ action: 'appeal_accepted' });
    const journal = await appeals.journal({});
    expect(journal.items.some((j) => j.id === action.id)).toBe(true);
  });
});

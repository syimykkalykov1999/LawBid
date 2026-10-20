import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FilesService } from '../src/modules/files/files.service';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway';
import { PrivacySettingsService } from '../src/modules/privacy-settings/privacy-settings.service';
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
      photoFrom: 'everyone',
      aboutFrom: 'everyone',
      groupAddFrom: 'everyone',
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
      photoFrom: 'everyone',
      aboutFrom: 'everyone',
      groupAddFrom: 'everyone',
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

  it('"about" is hidden from non-contacts; "who adds me to groups" is enforced', async () => {
    const owner = await person('attorney', 'Olga');
    const friend = await person('client', 'Fred');
    const stranger = await person('client', 'Sam');
    const username = `pm_${owner.id.slice(0, 8)}`;
    await prisma.attorneyProfile.update({
      where: { user_id: owner.id },
      data: { bio: 'Criminal defence for 15 years.' },
    });
    await prisma.contactMatch.create({
      data: { owner_id: owner.id, matched_id: friend.id },
    });
    const bioFor = async (viewer: { auth: Record<string, string> }) =>
      (
        await api()
          .get(`/api/v1/attorneys/${username}`)
          .set(viewer.auth)
          .expect(200)
      ).body.data.bio as string | null;
    expect(await bioFor(stranger)).toBe('Criminal defence for 15 years.');
    const put = await api()
      .put('/api/v1/users/me/privacy')
      .set(owner.auth)
      .send({
        aboutFrom: 'contacts',
        photoFrom: 'nobody',
        groupAddFrom: 'contacts',
      })
      .expect(200);
    expect(put.body.data).toMatchObject({
      aboutFrom: 'contacts',
      photoFrom: 'nobody',
      groupAddFrom: 'contacts',
    });
    expect(await bioFor(stranger)).toBeNull();
    expect(await bioFor(friend)).toBe('Criminal defence for 15 years.');
    expect(await bioFor(owner)).toBe('Criminal defence for 15 years.');

    const privacy = app.get(PrivacySettingsService);
    await expect(
      privacy.assertAllowed(stranger.id, owner.id, 'group'),
    ).rejects.toMatchObject({ response: { code: 'PRIVACY_RESTRICTED' } });
    await expect(
      privacy.assertAllowed(friend.id, owner.id, 'group'),
    ).resolves.toBeUndefined();
    await expect(privacy.allows(stranger.id, owner.id, 'group')).resolves.toBe(
      false,
    );
  });

  it('presence: a watcher who is no longer allowed is dropped from the room', async () => {
    const owner = await person('client', 'Pia');
    const friend = await person('client', 'Finn');
    const stranger = await person('client', 'Sven');
    await prisma.user.updateMany({
      where: { id: { in: [owner.id, friend.id, stranger.id] } },
      data: { show_activity_status: true },
    });
    await prisma.contactMatch.create({
      data: { owner_id: owner.id, matched_id: friend.id },
    });
    await app
      .get(PrivacySettingsService)
      .update(owner.id, { lastSeen: 'contacts' });
    const sockets = [friend, stranger].map((p) => ({
      data: { user: { sub: p.id } },
      emit: jest.fn(),
      leave: jest.fn(),
    }));
    const gateway = app.get<{
      nsp: unknown;
      announce(id: string, online: boolean, at: Date | null): Promise<void>;
    }>(RealtimeGateway);
    gateway.nsp = {
      in: () => ({ fetchSockets: () => Promise.resolve(sockets) }),
    };
    await gateway.announce(owner.id, true, null);
    expect(sockets[0].emit).toHaveBeenCalledWith(
      'presence:update',
      expect.objectContaining({ userId: owner.id, online: true }),
    );
    expect(sockets[0].leave).not.toHaveBeenCalled();
    expect(sockets[1].emit).not.toHaveBeenCalled();
    expect(sockets[1].leave).toHaveBeenCalledWith(`presence:${owner.id}`);
  });

  it('appeals: two moderators at once restore and notify only once', async () => {
    const author = await person('attorney', 'Ada');
    const post = await prisma.post.create({
      data: { author_id: author.id, body: 'Text', status: 'hidden' },
    });
    const admin = await prisma.user.create({
      data: { role: 'client', first_name: 'Mod', last_name: 'Two' },
    });
    const action = await prisma.moderationAction.create({
      data: {
        admin_id: admin.id,
        target_type: 'post',
        target_id: post.id,
        action: 'hide',
        reason: 'x',
      },
    });
    await api()
      .post('/api/v1/moderation/appeals')
      .set(author.auth)
      .send({ actionId: action.id, message: 'Please look again.' })
      .expect(201);
    const appeals = app.get(ModerationAppealsService);
    const item = (await appeals.queue({ status: 'pending' }, null)).items.find(
      (i) => i.targetId === post.id,
    )!;
    const actor = {
      id: admin.id,
      adminRole: 'super_admin',
      sessionId: randomUUID(),
      justification: null,
      ip: null,
    } as unknown as AdminActor;
    const results = await Promise.allSettled([
      appeals.decide(actor, item.id, true, 'A'),
      appeals.decide(actor, item.id, true, 'B'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const notices = await prisma.notification.findMany({
      where: { user_id: author.id, type: 'moderation_notice' },
    });
    expect(
      notices.filter(
        (n) => (n.payload as { action?: string }).action === 'appeal_accepted',
      ),
    ).toHaveLength(1);
    expect(
      await prisma.moderationAction.count({
        where: { target_id: post.id, action: 'restore' },
      }),
    ).toBe(1);
  });

  it('a hidden profile photo is not served to non-contacts anywhere (posts)', async () => {
    const owner = await person('attorney', 'Vera');
    const friend = await person('client', 'Ford');
    const stranger = await person('client', 'Stan');
    const avatar = await prisma.file.create({
      data: {
        owner_user_id: owner.id,
        purpose: 'avatar',
        s3_bucket: process.env.S3_BUCKET_MEDIA ?? 'lawbid-media',
        s3_key: `avatars/${owner.id}/${randomUUID()}.jpg`,
        mime: 'image/jpeg',
        size_bytes: 10n,
        sha256: 'c'.repeat(64),
        width: 512,
        height: 512,
        scan_status: 'clean',
      },
    });
    await prisma.user.update({
      where: { id: owner.id },
      data: { avatar_file_id: avatar.id },
    });
    await prisma.contactMatch.create({
      data: { owner_id: owner.id, matched_id: friend.id },
    });
    const post = await prisma.post.create({
      data: { author_id: owner.id, body: 'Hello', status: 'published' },
    });
    // The test storage is not configured: serve a fixed link for the file.
    const link = jest
      .spyOn(
        FilesService.prototype as unknown as {
          mediaUrlOf: () => Promise<string | null>;
        },
        'mediaUrlOf',
      )
      .mockResolvedValue('https://media.test/a.jpg');
    const avatarSeenBy = async (viewer: { auth: Record<string, string> }) => {
      const res = await api()
        .get(`/api/v1/posts/${post.id}`)
        .set(viewer.auth)
        .expect(200);
      return (res.body.data.author?.avatarUrl ?? null) as string | null;
    };
    expect(await avatarSeenBy(stranger)).not.toBeNull();
    await api()
      .put('/api/v1/users/me/privacy')
      .set(owner.auth)
      .send({ photoFrom: 'contacts' })
      .expect(200);
    expect(await avatarSeenBy(stranger)).toBeNull();
    expect(await avatarSeenBy(friend)).not.toBeNull();
    expect(await avatarSeenBy(owner)).not.toBeNull();
    link.mockRestore();
  });
});

import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { acceptInvites } from './support/group-invites';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-21: the Notifications switches (own ones for groups and
 * channels) persist, and calls of one group can be muted for me alone.
 */
jest.setTimeout(120_000);

describe('Mute calls and notification switches (e2e)', () => {
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
      data: { role: 'client', first_name: first, last_name: 'Disc' },
    });
  const settings = (id: string) =>
    api().get('/api/v1/notification-settings').set(bearer(id)).expect(200);

  it('groups and channels have their own switches that persist', async () => {
    const me = await person('Sw');
    const before = await settings(me.id);
    const cats = (
      before.body.data.categories as {
        category: string;
        pushEnabled: boolean;
      }[]
    ).map((c) => c.category);
    expect(cats).toEqual(
      expect.arrayContaining(['groups', 'channels', 'calls']),
    );
    await api()
      .put('/api/v1/notification-settings')
      .set(bearer(me.id))
      .send({
        items: [
          { category: 'groups', pushEnabled: false, emailEnabled: false },
          { category: 'calls', pushEnabled: false, emailEnabled: false },
        ],
      })
      .expect(200);
    const after = await settings(me.id);
    const by = Object.fromEntries(
      (
        after.body.data.categories as {
          category: string;
          pushEnabled: boolean;
        }[]
      ).map((c) => [c.category, c.pushEnabled]),
    );
    expect(by.groups).toBe(false);
    expect(by.calls).toBe(false);
    expect(by.channels).toBe(true);
    expect(by.messages).toBe(true);
  });

  it('a member can mute the calls of one group, and the answer says so', async () => {
    const [owner, ann] = await Promise.all([person('Own'), person('Ann')]);
    const created = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Calls', type: 'private', memberIds: [ann.id] })
      .expect(201);
    await acceptInvites(api, bearer, created.body.data.id as string, [ann.id]);
    const id = created.body.data.id as string;
    expect(created.body.data.callsMuted).toBe(false);
    const res = await api()
      .patch(`/api/v1/groups/${id}/me`)
      .set(bearer(ann.id))
      .send({ callsMuted: true })
      .expect(200);
    expect(res.body.data.callsMuted).toBe(true);
    // Messages stay unmuted, and it is mine alone.
    expect(res.body.data.mutedUntil).toBeNull();
    const mine = await prisma.chatGroupMember.findUnique({
      where: { group_id_user_id: { group_id: id, user_id: owner.id } },
    });
    expect(mine?.calls_muted).toBe(false);
    const back = await api()
      .patch(`/api/v1/groups/${id}/me`)
      .set(bearer(ann.id))
      .send({ callsMuted: false })
      .expect(200);
    expect(back.body.data.callsMuted).toBe(false);
  });
});

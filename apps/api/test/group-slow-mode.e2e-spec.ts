import { randomUUID } from 'node:crypto';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { acceptInvites } from './support/group-invites';

/**
 * Owner 2026-11-02 (Telegram «Медленный режим»): in a group with slow mode a
 * member who is not an admin sends one message per N seconds (429 with the
 * wait left), admins are never slowed, only people allowed to edit the info
 * set it, a retry of a stored message is not counted, off again = free.
 */
jest.setTimeout(180_000);

describe('Group slow mode (e2e)', () => {
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
      data: { role: 'client', first_name: first, last_name: 'Slow' },
    });
  const say = (gid: string, uid: string, body: string, cmid = randomUUID()) =>
    api()
      .post(`/api/v1/groups/${gid}/messages`)
      .set(bearer(uid))
      .send({ type: 'text', body, clientMessageId: cmid });

  async function group() {
    const [owner, ann] = await Promise.all([person('Olga'), person('Ann')]);
    const created = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Slow', memberIds: [ann.id] })
      .expect(201);
    const gid = created.body.data.id as string;
    await acceptInvites(api, bearer, gid, [ann.id]);
    return { gid, owner, ann };
  }

  it('only people who may edit the info set it, and only allowed values', async () => {
    const { gid, owner, ann } = await group();
    await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(bearer(ann.id))
      .send({ slowModeS: 30 })
      .expect(403);
    await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(bearer(owner.id))
      .send({ slowModeS: 7 })
      .expect(400);
    const on = await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(bearer(owner.id))
      .send({ slowModeS: 30 })
      .expect(200);
    expect(on.body.data.slowModeS).toBe(30);
    const off = await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(bearer(owner.id))
      .send({ slowModeS: 0 })
      .expect(200);
    expect(off.body.data.slowModeS).toBeNull();
  });

  it('a member waits between messages, an admin does not, a retry is free', async () => {
    const { gid, owner, ann } = await group();
    await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(bearer(owner.id))
      .send({ slowModeS: 60 })
      .expect(200);
    const cmid = randomUUID();
    await say(gid, ann.id, 'first', cmid).expect(201);
    // The same message sent again (a retry) comes back, not blocked.
    await say(gid, ann.id, 'first', cmid).expect(201);
    const blocked = await say(gid, ann.id, 'second').expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.details.kind).toBe('group_slow_mode');
    expect(blocked.body.error.details.retryAfterS).toBeGreaterThan(0);
    expect(blocked.body.error.details.retryAfterS).toBeLessThanOrEqual(60);
    // The admin is never slowed.
    await say(gid, owner.id, 'one').expect(201);
    await say(gid, owner.id, 'two').expect(201);
    // Switched off: the member writes again at once.
    await api()
      .patch(`/api/v1/groups/${gid}`)
      .set(bearer(owner.id))
      .send({ slowModeS: null })
      .expect(200);
    await say(gid, ann.id, 'third').expect(201);
  });

  it('a shortened pause frees people at once, and a poll counts as a message', async () => {
    const { gid, owner, ann } = await group();
    const patch = (slowModeS: number) =>
      api()
        .patch(`/api/v1/groups/${gid}`)
        .set(bearer(owner.id))
        .send({ slowModeS })
        .expect(200);
    await patch(3600);
    await say(gid, ann.id, 'first').expect(201);
    // A poll during the pause is refused like a text.
    const poll = () =>
      api()
        .post(`/api/v1/groups/${gid}/polls`)
        .set(bearer(ann.id))
        .send({
          question: 'Q?',
          options: ['a', 'b'],
          multiple: false,
          anonymous: false,
          clientMessageId: randomUUID(),
        });
    await poll().expect(429);
    // 20 s passed and the admin shortens the pause to 10 s: free at once.
    await app
      .get<{ set: (...a: unknown[]) => Promise<unknown> }>(REDIS_CLIENT)
      .set(
        `group:slow:${gid}:${ann.id}`,
        String(Date.now() - 20_000),
        'EX',
        60,
      );
    await patch(10);
    await poll().expect(201);
    // The poll took the slot: a text right after is refused.
    await say(gid, ann.id, 'again').expect(429);
  });
});

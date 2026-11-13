import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminSessionService } from '../src/modules/admin-auth/admin-session.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Row 72 (failover test 2026-11-13, /data/lt/results/NOTES.md «FAILOVER»):
 * a Redis restart without data signed every admin out (~4 % 401 for the
 * rest of the run), because admin sessions lived only in Redis. Prod
 * ElastiCache runs one node without a replica or snapshots, so a node
 * replacement would do the same. The session row in Postgres is now the
 * truth and Redis the hot copy. Here every `adm:*` key is dropped (what a
 * replaced node holds: nothing) and the admin must stay signed in, while a
 * logout, a «sign out everywhere», the idle window and the absolute end
 * still hold.
 */
jest.setTimeout(180_000);

type Body = { error?: { code?: string } };

describe('Admin sessions survive a Redis data loss (row 72)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let sessions: AdminSessionService;
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
    redis = app.get<Redis>(REDIS_CLIENT);
    sessions = app.get(AdminSessionService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const me = (s: AdminSession) =>
    api().get('/api/v1/admin/auth/me').set(s.auth);
  const jtiOf = (s: AdminSession) =>
    (
      JSON.parse(
        Buffer.from(s.accessToken.split('.')[1], 'base64url').toString(),
      ) as { jti: string }
    ).jti;

  /** Admins signed in by this suite (other suites may share the Redis). */
  const mine: AdminSession[] = [];
  const signIn = async () => {
    const s = await adminSession(base, prisma, 'support');
    mine.push(s);
    return s;
  };

  /** What a replaced Redis node holds: none of the admin session keys. */
  async function loseRedisSessions(): Promise<void> {
    const keys = mine.flatMap((s) => [
      `adm:sess:${jtiOf(s)}`,
      `adm:sess:meta:${jtiOf(s)}`,
      `adm:stepup:${jtiOf(s)}`,
      `adm:sess:user:${s.userId}`,
    ]);
    if (keys.length > 0) await redis.del(...keys);
  }

  it('sign-in writes the session row', async () => {
    const s = await signIn();
    const row = await prisma.adminSession.findUniqueOrThrow({
      where: { jti: jtiOf(s) },
    });
    expect(row.user_id).toBe(s.userId);
    expect(row.revoked_at).toBeNull();
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(
      8 * 3600 * 1000,
    );
  });

  it('a Redis data loss does not sign the admin out; Redis gets the session back', async () => {
    const s = await signIn();
    await me(s).expect(200);
    await loseRedisSessions();
    expect(await redis.exists(`adm:sess:${jtiOf(s)}`)).toBe(0);
    await me(s).expect(200);
    expect(await redis.get(`adm:sess:${jtiOf(s)}`)).toBe(s.userId);
    // The super admin's list of live sessions still shows it.
    const live = await sessions.listForUsers([s.userId]);
    expect(live.map((x) => x.sessionId)).toContain(jtiOf(s));
    // A background poll (does not extend the idle window) after a loss.
    await loseRedisSessions();
    await me(s).set('x-background', '1').expect(200);
  });

  it('a logged-out session stays out after a Redis data loss', async () => {
    const s = await signIn();
    await api().post('/api/v1/admin/auth/logout').set(s.auth).expect(200);
    await loseRedisSessions();
    const r = await me(s).expect(401);
    expect((r.body as Body).error?.code).toBe('AUTH_SESSION_REVOKED');
    const row = await prisma.adminSession.findUniqueOrThrow({
      where: { jti: jtiOf(s) },
    });
    expect(row.revoked_at).not.toBeNull();
  });

  it('«sign out everywhere» holds after a Redis data loss', async () => {
    const s = await signIn();
    await me(s).expect(200);
    expect(await sessions.revokeAllForUser(s.userId)).toBeGreaterThan(0);
    await loseRedisSessions();
    await me(s).expect(401);
    expect(await sessions.listForUsers([s.userId])).toEqual([]);
  });

  it('the idle window and the absolute end still hold without Redis keys', async () => {
    const idle = await signIn();
    await prisma.adminSession.update({
      where: { jti: jtiOf(idle) },
      data: { last_seen_at: new Date(Date.now() - 31 * 60 * 1000) },
    });
    const ended = await signIn();
    await prisma.adminSession.update({
      where: { jti: jtiOf(ended) },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    await loseRedisSessions();
    await me(idle).expect(401);
    await me(ended).expect(401);
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerErrorInterceptor, Logger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import type Redis from 'ioredis';

/**
 * docs/01_FOUNDATION_AUTH.md §15, stage 1.4 acceptance criteria — the
 * four required e2e scenarios, run against a REAL PostgreSQL and REAL
 * Redis (not FakeRedis/a stubbed PrismaService, unlike test/app.e2e-
 * spec.ts's stage 1.2 plumbing test): this stage's whole point is
 * Redis-backed atomicity (the OTP Lua script, the reuse-detection
 * chain revoke) and real relational state (Session/User rows), neither
 * of which a fake proves anything about. Requires DATABASE_URL/REDIS_URL
 * pointed at a real, migrated instance — see docs/CHANGELOG.md stage
 * 1.4's "Verification note" for how this was actually run in the
 * sandbox (no persistent services between tool calls, so this suite and
 * its infra are started together in one shot).
 *
 * NODE_ENV=test + OTP_DEV_FIXED_CODE=true (envSchema permits the fixed
 * code under NODE_ENV=test specifically for this reason) gives every
 * OTP request the deterministic code '000000' — mock SMS/email
 * providers never expose the real generated code anywhere (not even
 * logs), so there is no other way to drive this flow from outside.
 *
 * Every full login/lockout/refresh scenario below drives the flow
 * through channel='phone', not 'email' (docs/CHANGELOG.md, stage 1.4
 * verification note): MockSmsProvider has zero I/O (it only logs),
 * while MockEmailProvider genuinely dials SMTP_HOST:SMTP_PORT (Mailhog
 * in a real docker-compose environment) — this sandbox has no SMTP
 * server to point it at. AuthService/OtpService/SessionService treat
 * 'phone' and 'email' identically (same generic `channel` parameter
 * throughout, same Redis keyspace shape); only the leaf SmsProvider/
 * EmailProvider implementations differ, and those are reviewed, not
 * exercised, here. Scenario 1 includes a structural check that an
 * email-shaped identifier is accepted by DTO validation and routed
 * correctly, without requiring the SMTP-dependent /otp/request step.
 */
describe('Auth (e2e) — stage 1.4 acceptance criteria', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const FIXED_CODE = '000000';
  const WRONG_CODE = '999999';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    app.useGlobalInterceptors(new LoggerErrorInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.init();
    // One real listener for the suite: supertest reuses a listening
    // server instead of an ephemeral one per request, which avoided
    // intermittent ECONNRESET under load.
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function otpLogin(identifier: string) {
    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier })
      .expect(200);
    return api()
      .post('/api/v1/auth/otp/verify')
      .send({
        channel: 'phone',
        identifier,
        code: FIXED_CODE,
        deviceInfo: { deviceId: 'seed-device' },
      });
  }

  async function findUserIdByPhone(identifier: string): Promise<string> {
    const row = await prisma.userIdentifier.findUnique({
      where: {
        provider_provider_uid: { provider: 'phone', provider_uid: identifier },
      },
    });
    return row!.user_id;
  }

  // -----------------------------------------------------------------
  // Scenario 1: successful login by phone (fully exercised) and
  // structural acceptance of the email channel (DTO validation +
  // routing, without the SMTP-dependent send step — see file doc).
  // -----------------------------------------------------------------
  describe('scenario 1: successful OTP login', () => {
    it('logs in a brand-new user by phone and returns tokens + isNewUser', async () => {
      const res = await otpLogin('+12025551001');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        accessTokenExpiresIn: expect.any(Number),
        isNewUser: true,
      });
    });

    it('a second login by the same phone identifier returns isNewUser: false', async () => {
      const identifier = '+12025551002';
      await otpLogin(identifier);
      const second = await otpLogin(identifier);
      expect(second.body.data.isNewUser).toBe(false);
    });

    it('accepts a well-formed email identifier at validation/routing (email-provider send is out of scope here, see file doc)', async () => {
      const res = await api().post('/api/v1/auth/otp/verify').send({
        channel: 'email',
        identifier: 'scenario1-structural@example.com',
        code: FIXED_CODE,
      });
      // No prior /otp/request means no code was ever stored — expired,
      // NOT a 400 validation error, proves the email-shaped identifier
      // passed OtpVerifyDto's @IsEmail branch and reached OtpService.
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_OTP_EXPIRED');
    });

    it('rejects a malformed identifier with VALIDATION_ERROR before touching OtpService at all', async () => {
      const res = await api().post('/api/v1/auth/otp/verify').send({
        channel: 'phone',
        identifier: 'not-a-phone-number',
        code: FIXED_CODE,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // -----------------------------------------------------------------
  // Scenario 2: 5 wrong codes -> lockout; a fresh request does NOT
  // reset the attempt counter.
  // -----------------------------------------------------------------
  describe('scenario 2: OTP lockout survives a fresh code request', () => {
    it('locks after 5 wrong attempts and stays locked even for the correct code after a fresh /otp/request', async () => {
      const identifier = '+12025552001';
      await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'phone', identifier })
        .expect(200);

      let lastStatus = 0;
      for (let i = 0; i < 5; i += 1) {
        const res = await api()
          .post('/api/v1/auth/otp/verify')
          .send({ channel: 'phone', identifier, code: WRONG_CODE });
        lastStatus = res.status;
        if (i < 4) {
          expect(res.status).toBe(401);
          expect(res.body.error.code).toBe('AUTH_OTP_INVALID');
        }
      }
      // 5th wrong attempt trips the lock (OTP_MAX_ATTEMPTS=5).
      expect(lastStatus).toBe(423);

      // A fresh request must still return the identical 200 shape
      // (anti-enumeration) but must NOT clear the lock/attempts state.
      await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'phone', identifier })
        .expect(200);

      const stillLocked = await api()
        .post('/api/v1/auth/otp/verify')
        .send({ channel: 'phone', identifier, code: FIXED_CODE }); // even the CORRECT code
      expect(stillLocked.status).toBe(423);
      expect(stillLocked.body.error.code).toBe('AUTH_OTP_LOCKED');
    });
  });

  // -----------------------------------------------------------------
  // Scenario 3: refresh-token reuse revokes the whole chain, including
  // the newest (legitimately rotated-to) token.
  // -----------------------------------------------------------------
  describe('scenario 3: refresh-token reuse detection', () => {
    // Reuse detection touches Redis and the database in one request; on a
    // saturated CI runner the first call could meet a not-yet-ready
    // dependency and answer 503. Start only once /health/ready says 200.
    beforeAll(async () => {
      const until = Date.now() + 30_000;
      for (;;) {
        const r = await api().get('/health/ready');
        if (r.status === 200 || Date.now() > until) break;
        await new Promise((res) => setTimeout(res, 500));
      }
    });

    it('revokes the whole chain on reuse, and the newest token from that chain also fails afterward', async () => {
      const identifier = '+12025553001';
      const login = await otpLogin(identifier);
      const refreshToken1 = login.body.data.refreshToken as string;

      // Legitimate rotation: refreshToken1 -> refreshToken2, bound to
      // device-A.
      const rotated = await api()
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: refreshToken1,
          deviceInfo: { deviceId: 'device-A' },
        });
      expect(rotated.status).toBe(201);
      const refreshToken2 = rotated.body.data.refreshToken as string;

      // Attacker replays the OLD (already-rotated-away) token once the 10 s
      // replay cache of the rotation is gone (S14-3: inside it an idempotent
      // retry gets the same child pair) — genuine reuse detection. The
      // grace window is also over: inside it a missing cache answers a
      // retryable 503, never a chain-ending 401 (review R-64), so the
      // rotated row is moved back past the window instead of waiting 10 s.
      await redis.del(
        ...(await redis.keys('auth:refresh-replay:*')),
        'auth:refresh-replay:none',
      );
      await prisma.session.updateMany({
        where: {
          user_id: await findUserIdByPhone(identifier),
          revoked_reason: 'rotated',
        },
        data: { updated_at: new Date(Date.now() - 60 * 60 * 1000) },
      });
      const replay = await api()
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: refreshToken1,
          deviceInfo: { deviceId: 'device-B-attacker' },
        });
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('AUTH_REFRESH_REUSE_DETECTED');

      // The newest, legitimately-issued token from that same chain must
      // ALSO be dead now — the whole chain was revoked, not just the
      // reused row.
      const newestNowDead = await api()
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: refreshToken2,
          deviceInfo: { deviceId: 'device-A' },
        });
      expect(newestNowDead.status).toBe(401);
      expect(newestNowDead.body.error.code).toBe('AUTH_REFRESH_INVALID');
    });

    it('S14-3: a retry of the just-rotated token inside the window gets the SAME child pair (idempotent) and the chain lives on', async () => {
      const identifier = '+12025553002';
      const login = await otpLogin(identifier);
      const refreshToken1 = login.body.data.refreshToken as string;

      const rotated = await api()
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: refreshToken1,
          deviceInfo: { deviceId: 'device-same' },
        });
      expect(rotated.status).toBe(201);
      const refreshToken2 = rotated.body.data.refreshToken as string;

      // A client that never saw the first answer retries the OLD token: the
      // same child comes back (no device-id guessing, no chain revoke).
      const retry = await api()
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: refreshToken1,
          deviceInfo: { deviceId: 'whatever' },
        });
      expect(retry.status).toBe(201);
      expect(retry.body.data.refreshToken).toBe(refreshToken2);

      const stillGood = await api()
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: refreshToken2,
          deviceInfo: { deviceId: 'device-same' },
        });
      expect(stillGood.status).toBe(201);
    });

    it('S14-3: two parallel refreshes with one live token fork nothing — exactly one child is live', async () => {
      const identifier = '+12025553003';
      const login = await otpLogin(identifier);
      const refreshToken1 = login.body.data.refreshToken as string;
      const both = await Promise.all(
        [1, 2].map(() =>
          api()
            .post('/api/v1/auth/refresh')
            .send({ refreshToken: refreshToken1 }),
        ),
      );
      // The winner rotates; the loser is handed the same pair (or a plain
      // 401 invalid) — never a second, different valid child.
      const ok = both.filter((r) => r.status === 201);
      expect(ok.length).toBeGreaterThanOrEqual(1);
      const tokens = new Set(ok.map((r) => r.body.data.refreshToken as string));
      expect(tokens.size).toBe(1);
      for (const r of both.filter((x) => x.status !== 201)) {
        expect(r.body.error.code).toBe('AUTH_REFRESH_INVALID');
      }
      const userId = await findUserIdByPhone(identifier);
      expect(
        await prisma.session.count({
          where: { user_id: userId, revoked_at: null },
        }),
      ).toBe(1);
    });
  });

  // -----------------------------------------------------------------
  // Scenario 4: suspended/deleted user rejected at VERIFY, while
  // /otp/request keeps returning the identical 200.
  // -----------------------------------------------------------------
  describe('scenario 4: suspended/deleted accounts', () => {
    it('rejects a suspended account at verify with ACCOUNT_SUSPENDED, while otp/request still returns 200', async () => {
      const identifier = '+12025554001';
      await otpLogin(identifier); // create the account first
      const userId = await findUserIdByPhone(identifier);
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'suspended' },
      });

      await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'phone', identifier })
        .expect(200);
      const verify = await api()
        .post('/api/v1/auth/otp/verify')
        .send({ channel: 'phone', identifier, code: FIXED_CODE });
      expect(verify.status).toBe(403);
      expect(verify.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('rejects a deleted account at verify with ACCOUNT_DELETED, while otp/request still returns 200', async () => {
      const identifier = '+12025554002';
      await otpLogin(identifier);
      const userId = await findUserIdByPhone(identifier);
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'deleted' },
      });

      await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'phone', identifier })
        .expect(200);
      const verify = await api()
        .post('/api/v1/auth/otp/verify')
        .send({ channel: 'phone', identifier, code: FIXED_CODE });
      expect(verify.status).toBe(403);
      expect(verify.body.error.code).toBe('ACCOUNT_DELETED');
    });

    it('a deletion_pending account is auto-cancelled by a successful login', async () => {
      const identifier = '+12025554003';
      await otpLogin(identifier);
      const userId = await findUserIdByPhone(identifier);
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'deletion_pending', deletion_requested_at: new Date() },
      });

      const relogin = await otpLogin(identifier);
      expect(relogin.status).toBe(201); // not rejected — login cancels the pending deletion

      const reloaded = await prisma.user.findUnique({ where: { id: userId } });
      expect(reloaded?.status).toBe('active');
      expect(reloaded?.deletion_requested_at).toBeNull();
    });
  });
});

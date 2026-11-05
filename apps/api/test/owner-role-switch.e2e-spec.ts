import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { attachCleanAvatar } from './support/clean-avatar';

/**
 * Owner 2026-11-05: Settings → Account «Сменить профиль». The same account
 * switches between the attorney and the client profile: both profiles are
 * kept, verification comes back with the attorney profile, the switch is
 * confirmed by a reauth token, limited per day, audited and off by default.
 */
jest.setTimeout(60_000);

describe('Role switch (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let flags: FeatureFlagsService;
  let baseUrl = '';
  let phoneSeq = 0;

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
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    flags = app.get(FeatureFlagsService);
    for (const [code, name] of [
      ['NY', 'New York'],
      ['CA', 'California'],
    ] as const) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name, is_active: true },
        update: { is_active: true },
      });
    }
  });

  afterAll(async () => {
    await setFlag(false);
    await setLimit(2);
    await app.close();
  });

  beforeEach(async () => {
    await setFlag(true);
    await setLimit(10);
  });

  const api = () => request(baseUrl);

  async function setFlag(enabled: boolean): Promise<void> {
    await prisma.featureFlag.upsert({
      where: { key: 'role_switch' },
      update: { enabled },
      create: { key: 'role_switch', enabled, description: 'role_switch' },
    });
    await flags.invalidate();
  }

  async function setLimit(value: number): Promise<void> {
    const key = 'account.role_switch_per_day';
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await redis.del('config:app_config');
  }

  function nextPhone(): string {
    phoneSeq += 1;
    return `+1202555${String(8100 + phoneSeq).padStart(4, '0')}`;
  }

  async function signIn(phone: string): Promise<{
    auth: Record<string, string>;
    refreshToken: string;
  }> {
    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier: phone })
      .expect(200);
    const res = await api()
      .post('/api/v1/auth/otp/verify')
      .send({
        channel: 'phone',
        identifier: phone,
        code: '000000',
        deviceInfo: { deviceId: 'role-switch-e2e' },
      })
      .expect(201);
    const data = res.body.data as { accessToken: string; refreshToken: string };
    return {
      auth: { Authorization: `Bearer ${data.accessToken}` },
      refreshToken: data.refreshToken,
    };
  }

  /** A single-use token; the app gets it with the password or a passkey. */
  async function reauth(
    auth: Record<string, string>,
    phone: string,
  ): Promise<string> {
    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier: phone })
      .expect(200);
    const res = await api()
      .post('/api/v1/auth/reauth')
      .set(auth)
      .send({ method: 'otp', identifier: phone, code: '000000' })
      .expect(201);
    return res.body.data.reauthToken as string;
  }

  async function onboarded(role: 'client' | 'attorney') {
    const phone = nextPhone();
    const { auth, refreshToken } = await signIn(phone);
    await api()
      .post('/api/v1/users/me/consents')
      .set(auth)
      .send({
        consents: ['age_18', 'terms', 'privacy', 'disclaimer'].map((type) => ({
          type,
          granted: true,
        })),
      })
      .expect(201);
    const me = await api()
      .post('/api/v1/users/me/role')
      .set(auth)
      .send({ role })
      .expect(200);
    const userId = me.body.data.id as string;
    await prisma.user.update({
      where: { id: userId },
      data: { email: `switch${phoneSeq}@example.com` },
    });
    const profile =
      role === 'client'
        ? { firstName: 'Sam', lastName: 'Client', stateCode: 'NY' }
        : {
            firstName: 'Sam',
            lastName: `Lawyer${phoneSeq}`,
            licensedStates: ['NY'],
          };
    await api()
      .patch('/api/v1/users/me/onboarding')
      .set(auth)
      .send({ currentStep: 'push', profile })
      .expect(200);
    if (role === 'attorney') await attachCleanAvatar(prisma, userId);
    await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(200);
    return { auth, refreshToken, userId, phone };
  }

  async function switchTo(
    who: { auth: Record<string, string>; phone: string },
    role: 'client' | 'attorney',
  ) {
    return api()
      .post('/api/v1/users/me/role/switch')
      .set(who.auth)
      .set('X-Reauth-Token', await reauth(who.auth, who.phone))
      .send({ role });
  }

  it('flag off (the default): both routes answer 404', async () => {
    await setFlag(false);
    const who = await onboarded('client');
    await api().get('/api/v1/users/me/role/switch').set(who.auth).expect(404);
    await api()
      .post('/api/v1/users/me/role/switch')
      .set(who.auth)
      .send({ role: 'attorney' })
      .expect(404);
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: who.userId },
    });
    expect(row.role).toBe('client');
  });

  it('needs a reauth token; a token works only once', async () => {
    const who = await onboarded('client');
    const bare = await api()
      .post('/api/v1/users/me/role/switch')
      .set(who.auth)
      .send({ role: 'attorney' })
      .expect(403);
    expect(bare.body.error.code).toBe('REAUTH_REQUIRED');
    const token = await reauth(who.auth, who.phone);
    await api()
      .post('/api/v1/users/me/role/switch')
      .set(who.auth)
      .set('X-Reauth-Token', token)
      .send({ role: 'attorney' })
      .expect(200);
    const replay = await api()
      .post('/api/v1/users/me/role/switch')
      .set(who.auth)
      .set('X-Reauth-Token', token)
      .send({ role: 'client' })
      .expect(401);
    expect(replay.body.error.code).toBe('REAUTH_INVALID');
  });

  it('attorney → client → attorney: both profiles and verification are kept', async () => {
    const who = await onboarded('attorney');
    await prisma.attorneyProfile.update({
      where: { user_id: who.userId },
      data: { verification_status: 'verified', verified_at: new Date() },
    });
    const before = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: who.userId },
    });
    const preview = await api()
      .get('/api/v1/users/me/role/switch')
      .set(who.auth)
      .expect(200);
    expect(preview.body.data).toEqual({
      from: 'attorney',
      to: 'client',
      allowed: true,
      blockers: [],
      needsOnboarding: true,
      retryAfterSeconds: 0,
    });

    // First time as a client: the short onboarding opens at the profile.
    const asClient = (await switchTo(who, 'client')).body.data;
    expect(asClient.role).toBe('client');
    expect(asClient.onboarding).toMatchObject({
      currentStep: 'profile',
      completedAt: null,
    });
    expect(asClient.missing).toContain('state');

    // The attorney profile is hidden while the client profile is active.
    await api()
      .get(`/api/v1/attorneys/${before.username}`)
      .set(who.auth)
      .expect(404);

    // A refreshed token carries the new role.
    const refreshed = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: who.refreshToken })
      .expect((r) => expect([200, 201]).toContain(r.status));
    const payload = JSON.parse(
      Buffer.from(
        (refreshed.body.data.accessToken as string).split('.')[1],
        'base64url',
      ).toString(),
    ) as { role: string };
    expect(payload.role).toBe('client');
    const auth = {
      Authorization: `Bearer ${refreshed.body.data.accessToken as string}`,
    };

    await api()
      .patch('/api/v1/users/me/onboarding')
      .set(auth)
      .send({ currentStep: 'push', profile: { stateCode: 'CA' } })
      .expect(200);
    await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(200);

    // Back: no new verification, the profile is listed again.
    const back = (await switchTo({ auth, phone: who.phone }, 'attorney')).body
      .data;
    expect(back.role).toBe('attorney');
    expect(back.onboarding.completedAt).not.toBeNull();
    const after = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: who.userId },
    });
    expect(after.verification_status).toBe('verified');
    expect(after.username).toBe(before.username);
    await api()
      .get(`/api/v1/attorneys/${before.username}`)
      .set(auth)
      .expect(200);
    const client = await prisma.clientProfile.findUniqueOrThrow({
      where: { user_id: who.userId },
    });
    expect(client.state_code).toBe('CA');

    const log = await prisma.authEvent.findMany({
      where: { user_id: who.userId, event_type: 'role_switched' },
      orderBy: { created_at: 'asc' },
    });
    expect(log.map((e) => e.meta)).toEqual([
      { from: 'attorney', to: 'client' },
      { from: 'client', to: 'attorney' },
    ]);
  });

  it('client → attorney: an unverified attorney gets no verified status', async () => {
    const who = await onboarded('client');
    const data = (await switchTo(who, 'attorney')).body.data;
    expect(data.role).toBe('attorney');
    expect(data.onboarding.completedAt).toBeNull();
    expect(data.missing).toContain('licensed_states');
    const row = await prisma.attorneyProfile.findUnique({
      where: { user_id: who.userId },
    });
    expect(row?.verification_status ?? 'unverified').toBe('unverified');
    await prisma.clientProfile.findUniqueOrThrow({
      where: { user_id: who.userId },
    });
  });

  it('going back from the unfinished onboarding deletes nothing and is not counted', async () => {
    const who = await onboarded('client');
    await setLimit(1);
    await switchTo(who, 'attorney');
    const refreshed = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: who.refreshToken })
      .expect((r) => expect([200, 201]).toContain(r.status));
    const auth = {
      Authorization: `Bearer ${refreshed.body.data.accessToken as string}`,
    };
    const back = await api()
      .post('/api/v1/users/me/role')
      .set(auth)
      .send({ role: 'client' })
      .expect(200);
    expect(back.body.data.role).toBe('client');
    expect(back.body.data.onboarding.completedAt).not.toBeNull();
    expect(back.body.data.profile.stateCode).toBe('NY');
  });

  it('assistants on the team block the switch, with the reason', async () => {
    const who = await onboarded('attorney');
    await prisma.assistantMembership.create({
      data: {
        attorney_id: who.userId,
        status: 'active',
        approval: 'attorney_added',
      },
    });
    const preview = await api()
      .get('/api/v1/users/me/role/switch')
      .set(who.auth)
      .expect(200);
    expect(preview.body.data).toMatchObject({
      allowed: false,
      blockers: ['assistants'],
    });
    const res = await switchTo(who, 'client');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROLE_SWITCH_BLOCKED');
  });

  it('an assistant account never switches', async () => {
    const who = await onboarded('client');
    await prisma.user.update({
      where: { id: who.userId },
      data: { role: 'assistant' },
    });
    const res = await api()
      .get('/api/v1/users/me/role/switch')
      .set(who.auth)
      .expect(403);
    expect(res.body.error.code).toBe('ROLE_SWITCH_NOT_ALLOWED');
  });

  it('the daily limit refuses with the time left', async () => {
    await setLimit(1);
    const who = await onboarded('client');
    expect((await switchTo(who, 'attorney')).status).toBe(200);
    await prisma.onboardingState.update({
      where: { user_id: who.userId },
      data: { completed_at: new Date() },
    });
    const second = await switchTo(who, 'client');
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('RATE_LIMITED');
    expect(second.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerErrorInterceptor, Logger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * docs/01_FOUNDATION_AUTH.md §15 stage 1.7, server side of the acceptance
 * checklist: role chosen once, onboarding step resumes, client can't
 * finish without BOTH verified contacts, attorney needs a verified phone,
 * POST /cases stub returns CLIENT_CONTACTS_INCOMPLETE (item 9). Same real
 * CockroachDB/Redis setup and fixed OTP as auth.e2e-spec.ts.
 */
describe('Onboarding (e2e) — stage 1.7 server side', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    prisma = app.get(PrismaService);
    // The per-run e2e database is migrated but not seeded.
    for (const [code, sort] of [
      ['en', 0],
      ['ru', 1],
    ] as const) {
      await prisma.i18nLanguage.upsert({
        where: { code },
        create: { code, name_native: code, is_active: true, sort },
        update: {},
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function login(phone: string): Promise<string> {
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
        deviceInfo: { deviceId: 'onboarding-e2e' },
      })
      .expect(201);
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  }

  async function grantRequiredConsents(token: string): Promise<void> {
    await api()
      .post('/api/v1/users/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        consents: ['age_18', 'terms', 'privacy', 'disclaimer'].map((type) => ({
          type,
          granted: true,
        })),
      })
      .expect(201);
  }

  it('client: full flow, resume, contact gate, POST /cases stub', async () => {
    const token = await login('+12025557001');
    const auth = { Authorization: `Bearer ${token}` };

    const fresh = await api().get('/api/v1/users/me').set(auth).expect(200);
    expect(fresh.body.data.phoneVerified).toBe(true);
    expect(fresh.body.data.missing).toEqual(['consents', 'role', 'name']);

    // No role yet -> cannot create a case.
    await api().post('/api/v1/cases').set(auth).expect(403);

    await grantRequiredConsents(token);
    await api()
      .patch('/api/v1/users/me')
      .set(auth)
      .send({
        firstName: 'Jane',
        lastName: 'Doe',
        uiLanguage: 'ru',
        theme: 'dark',
      })
      .expect(200);
    await api()
      .post('/api/v1/users/me/role')
      .set(auth)
      .send({ role: 'client' })
      .expect(200);

    const again = await api()
      .post('/api/v1/users/me/role')
      .set(auth)
      .send({ role: 'attorney' })
      .expect(409);
    expect(again.body.error.code).toBe('ROLE_ALREADY_SET');

    // Step position + data survive "closing the app" (item 4).
    await api()
      .patch('/api/v1/users/me/onboarding')
      .set(auth)
      .send({ currentStep: 'contacts', data: { stateCode: 'NY' } })
      .expect(200);
    const resumed = await api().get('/api/v1/users/me').set(auth).expect(200);
    expect(resumed.body.data).toMatchObject({
      uiLanguage: 'ru',
      theme: 'dark',
      role: 'client',
      onboarding: { currentStep: 'contacts', data: { stateCode: 'NY' } },
      missing: ['email_verified'],
    });

    const blocked = await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(403);
    expect(blocked.body.error.code).toBe('CLIENT_CONTACTS_INCOMPLETE');

    const noCase = await api().post('/api/v1/cases').set(auth).expect(403);
    expect(noCase.body.error.code).toBe('CLIENT_CONTACTS_INCOMPLETE');

    // Email verification itself is covered by contacts/verify; the SMTP
    // send step isn't runnable here (see auth.e2e-spec.ts file doc).
    const userId = fresh.body.data.id as string;
    await prisma.user.update({
      where: { id: userId },
      data: { email: 'jane.doe@example.com', email_verified_at: new Date() },
    });

    const done = await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(200);
    expect(done.body.data.onboarding.completedAt).toEqual(expect.any(String));
    expect(done.body.data.missing).toEqual([]);

    const stub = await api().post('/api/v1/cases').set(auth).expect(501);
    expect(stub.body.error.code).toBe('NOT_IMPLEMENTED');
  });

  it('attorney: completes with a verified phone, no email needed', async () => {
    const token = await login('+12025557002');
    const auth = { Authorization: `Bearer ${token}` };
    await grantRequiredConsents(token);
    await api()
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ firstName: 'John', lastName: 'Roe' })
      .expect(200);
    await api()
      .post('/api/v1/users/me/role')
      .set(auth)
      .send({ role: 'attorney' })
      .expect(200);
    await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(200);
    const res = await api().post('/api/v1/cases').set(auth).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects an unknown step, a non-selectable role and an inactive language', async () => {
    const token = await login('+12025557003');
    const auth = { Authorization: `Bearer ${token}` };
    await api()
      .patch('/api/v1/users/me/onboarding')
      .set(auth)
      .send({ currentStep: 'nope' })
      .expect(400);
    await api()
      .post('/api/v1/users/me/role')
      .set(auth)
      .send({ role: 'admin' })
      .expect(400);
    await api()
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ uiLanguage: 'zz' })
      .expect(400);
  });
});

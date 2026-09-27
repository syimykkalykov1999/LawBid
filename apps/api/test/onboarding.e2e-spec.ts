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
    // One real listener for the suite: supertest reuses a listening
    // server instead of an ephemeral one per request, which avoided
    // intermittent ECONNRESET under load.
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    // The per-run e2e database is migrated but not seeded.
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
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
      missing: ['email_verified', 'state'],
    });

    // The profile step persists into client_profiles (§11 3A).
    await api()
      .patch('/api/v1/users/me/onboarding')
      .set(auth)
      .send({ currentStep: 'contacts', profile: { stateCode: 'NY' } })
      .expect(200);

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
      .patch('/api/v1/users/me/onboarding')
      .set(auth)
      .send({ currentStep: 'push', profile: { licensedStates: ['NY'] } })
      .expect(200);
    await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(200);
    const res = await api().post('/api/v1/cases').set(auth).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('first contact of a type needs no reauth; changing a verified one does', async () => {
    const token = await login('+12025557004');
    const auth = { Authorization: `Bearer ${token}` };
    const me = await api().get('/api/v1/users/me').set(auth).expect(200);

    // Phone is verified by the phone login -> changing it needs reauth.
    const change = await api()
      .post('/api/v1/users/me/contacts/request')
      .set(auth)
      .send({ type: 'phone', value: '+12025557005' })
      .expect(403);
    expect(change.body.error.code).toBe('REAUTH_REQUIRED');

    // No verified phone yet -> adding one is allowed without reauth.
    await prisma.user.update({
      where: { id: me.body.data.id as string },
      data: { phone_verified_at: null },
    });
    await api()
      .post('/api/v1/users/me/contacts/request')
      .set(auth)
      .send({ type: 'phone', value: '+12025557006' })
      .expect(201);
  });

  it('bootstrap legal documents carry an id for consents.documentId', async () => {
    await prisma.legalDocument.upsert({
      where: {
        doc_type_version_locale: {
          doc_type: 'terms',
          version: 'e2e',
          locale: 'en',
        },
      },
      create: {
        doc_type: 'terms',
        version: 'e2e',
        locale: 'en',
        content_md: 'Terms',
        is_current: true,
        published_at: new Date(),
      },
      update: {},
    });
    const res = await api().get('/api/v1/config/bootstrap').expect(200);
    const docs = res.body.data.legal_documents as { id: string }[];
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].id).toEqual(expect.any(String));
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

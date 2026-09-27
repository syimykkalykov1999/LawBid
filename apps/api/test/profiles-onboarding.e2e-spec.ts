import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerErrorInterceptor, Logger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * docs/01_FOUNDATION_AUTH.md §11 steps 3A/3B + docs/02 §4.C: the
 * onboarding profile step persists into client_profiles /
 * attorney_profiles (one transaction with names + step), completion
 * refuses a client without a state / an attorney without licensed states,
 * GET /users/me returns the profile, attorneys get a unique generated
 * username that skips reserved words. Plus Settings → Account (§10.3):
 * GET /users/me/identifiers and a reauth-gated phone change that retires
 * the old phone as a sign-in method. Real CockroachDB/Redis, fixed OTP.
 */
// Each scenario makes 10-20 round trips to a real (shared) CockroachDB;
// the 5 s default is too tight when parallel suites load the cluster.
jest.setTimeout(30_000);

describe('Profiles onboarding (e2e) — client_profiles / attorney_profiles', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let phoneSeq = 0;
  let baseUrl = '';

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
    // One server bound explicitly to 127.0.0.1 for the whole suite (instead
    // of supertest's per-request ephemeral listen on all interfaces): with
    // several e2e runs on the machine, a request to a just-freed ephemeral
    // port could otherwise reach another process.
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as Server;
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    // The per-run e2e database is migrated but not seeded.
    for (const [code, name, active] of [
      ['NY', 'New York', true],
      ['CA', 'California', true],
      ['TX', 'Texas', true],
      ['DC', 'District of Columbia', true],
      ['ZQ', 'Inactive test state', false],
    ] as const) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name, is_active: active },
        update: { is_active: active },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  function nextPhone(): string {
    phoneSeq += 1;
    return `+1202555${String(7100 + phoneSeq).padStart(4, '0')}`;
  }

  async function login(phone: string): Promise<Record<string, string>> {
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
        deviceInfo: { deviceId: 'profiles-e2e' },
      })
      .expect(201);
    const token = (res.body as { data: { accessToken: string } }).data
      .accessToken;
    return { Authorization: `Bearer ${token}` };
  }

  /** consents + role → ready for the profile step. */
  async function onboardedTo(
    role: 'client' | 'attorney',
  ): Promise<{ auth: Record<string, string>; userId: string; phone: string }> {
    const phone = nextPhone();
    const auth = await login(phone);
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
    return { auth, userId: me.body.data.id as string, phone };
  }

  function saveProfile(
    auth: Record<string, string>,
    profile: Record<string, unknown>,
    currentStep = 'push',
  ) {
    return api()
      .patch('/api/v1/users/me/onboarding')
      .set(auth)
      .send({ currentStep, profile });
  }

  async function verifyEmail(userId: string, email: string): Promise<void> {
    // SMTP delivery isn't runnable here (see onboarding.e2e-spec.ts).
    await prisma.user.update({
      where: { id: userId },
      data: { email, email_verified_at: new Date() },
    });
  }

  it('client: profile step writes client_profiles; GET /users/me returns it; completion succeeds', async () => {
    const { auth, userId } = await onboardedTo('client');

    const before = await api().get('/api/v1/users/me').set(auth).expect(200);
    expect(before.body.data.profile).toBeNull();
    expect(before.body.data.missing).toEqual(
      expect.arrayContaining(['name', 'email_verified', 'state']),
    );

    const saved = await saveProfile(auth, {
      firstName: '  Jane ',
      lastName: 'Client',
      stateCode: 'ny',
      languages: ['en', 'ES'],
      contactMethod: 'sms',
      contactNote: 'Weekday evenings after 6pm',
    }).expect(200);
    expect(saved.body.data).toMatchObject({
      firstName: 'Jane',
      lastName: 'Client',
      onboarding: { currentStep: 'push' },
      profile: {
        stateCode: 'NY',
        languages: ['en', 'es'],
        contactMethod: 'sms',
        contactNote: 'Weekday evenings after 6pm',
      },
    });
    expect(saved.body.data.missing).toEqual(['email_verified']);

    const row = await prisma.clientProfile.findUniqueOrThrow({
      where: { user_id: userId },
    });
    expect(row).toMatchObject({
      state_code: 'NY',
      preferred_languages: ['en', 'es'],
      preferred_contact_method: 'sms',
      preferred_contact_note: 'Weekday evenings after 6pm',
    });

    // A later partial save updates only what it sends; clearing works.
    await saveProfile(auth, { stateCode: 'DC', contactMethod: null }).expect(
      200,
    );
    const updated = await prisma.clientProfile.findUniqueOrThrow({
      where: { user_id: userId },
    });
    expect(updated).toMatchObject({
      state_code: 'DC',
      preferred_languages: ['en', 'es'],
      preferred_contact_method: null,
    });

    const contacts = await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(403);
    expect(contacts.body.error.code).toBe('CLIENT_CONTACTS_INCOMPLETE');

    await verifyEmail(userId, `client.${userId.slice(0, 8)}@example.com`);
    const done = await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(200);
    expect(done.body.data.missing).toEqual([]);
    expect(done.body.data.onboarding.completedAt).toEqual(expect.any(String));

    const me = await api().get('/api/v1/users/me').set(auth).expect(200);
    expect(me.body.data.profile).toEqual({
      stateCode: 'DC',
      languages: ['en', 'es'],
      contactMethod: null,
      contactNote: 'Weekday evenings after 6pm',
    });
  });

  it('client without a state cannot complete: ONBOARDING_INCOMPLETE with missing "state"', async () => {
    const { auth, userId } = await onboardedTo('client');
    await api()
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ firstName: 'No', lastName: 'State' })
      .expect(200);
    await verifyEmail(userId, `nostate.${userId.slice(0, 8)}@example.com`);

    const res = await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(403);
    expect(res.body.error.code).toBe('ONBOARDING_INCOMPLETE');
    expect(res.body.error.details.missing).toEqual(['state']);
    expect(
      await prisma.clientProfile.findUnique({ where: { user_id: userId } }),
    ).toBeNull();

    // First client save must carry the state (state_code is NOT NULL).
    const noState = await saveProfile(auth, { languages: ['en'] }).expect(400);
    expect(noState.body.error.code).toBe('VALIDATION_ERROR');
    expect(noState.body.error.details).toMatchObject({ field: 'stateCode' });
  });

  it('rejects invalid profile input (unknown/inactive state, ISO codes, lengths, other role fields)', async () => {
    const { auth, userId } = await onboardedTo('client');

    const unknown = await saveProfile(auth, { stateCode: 'ZZ' }).expect(400);
    expect(unknown.body.error.code).toBe('VALIDATION_ERROR');
    expect(unknown.body.error.details).toEqual({ states: ['ZZ'] });
    await saveProfile(auth, { stateCode: 'ZQ' }).expect(400);
    await saveProfile(auth, { stateCode: 'NYC' }).expect(400);
    await saveProfile(auth, { stateCode: 'NY', languages: ['xx'] }).expect(400);
    await saveProfile(auth, { stateCode: 'NY', languages: ['english'] }).expect(
      400,
    );
    await saveProfile(auth, {
      stateCode: 'NY',
      contactNote: 'x'.repeat(201),
    }).expect(400);
    await saveProfile(auth, { stateCode: 'NY', contactMethod: 'fax' }).expect(
      400,
    );
    const foreign = await saveProfile(auth, {
      stateCode: 'NY',
      bio: 'I am a client',
    }).expect(400);
    expect(foreign.body.error.details).toEqual({ fields: ['bio'] });

    // Nothing was written by any rejected request.
    expect(
      await prisma.clientProfile.findUnique({ where: { user_id: userId } }),
    ).toBeNull();
    const me = await api().get('/api/v1/users/me').set(auth).expect(200);
    expect(me.body.data.onboarding.currentStep).not.toBe('push');

    // Exactly 200 characters is fine.
    await saveProfile(auth, {
      stateCode: 'NY',
      contactNote: 'y'.repeat(200),
    }).expect(200);
  });

  it('attorney: attorney_profiles with generated unique username, bio/firm/languages, licensed states', async () => {
    const first = await onboardedTo('attorney');
    const bio = 'b'.repeat(300);
    const saved = await saveProfile(first.auth, {
      firstName: 'Avery',
      lastName: 'Quill',
      bio,
      firmName: 'Quill & Partners LLP',
      languages: ['en', 'fr'],
      licensedStates: ['ca', 'NY'],
    }).expect(200);
    expect(saved.body.data.profile).toEqual({
      username: 'avery.quill',
      bio,
      firmName: 'Quill & Partners LLP',
      languages: ['en', 'fr'],
      licensedStates: ['CA', 'NY'],
      verificationStatus: 'unverified',
    });
    expect(saved.body.data.missing).toEqual([]);

    const row = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: first.userId },
    });
    expect(row).toMatchObject({
      username: 'avery.quill',
      username_lower: 'avery.quill',
      bio,
      firm_name: 'Quill & Partners LLP',
      languages: ['en', 'fr'],
    });

    // Re-saving keeps the username (generated once; editing is stage 3.6).
    await saveProfile(first.auth, { bio: 'Updated bio', firmName: '' }).expect(
      200,
    );
    const resaved = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: first.userId },
    });
    expect(resaved).toMatchObject({
      username: 'avery.quill',
      bio: 'Updated bio',
      firm_name: null,
    });

    // Same name → numeric suffix.
    const second = await onboardedTo('attorney');
    const dup = await saveProfile(second.auth, {
      firstName: 'Avery',
      lastName: 'QUILL',
      licensedStates: ['TX'],
    }).expect(200);
    expect(dup.body.data.profile.username).toBe('avery.quill2');

    const done = await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(first.auth)
      .expect(200);
    expect(done.body.data.profile).toMatchObject({
      username: 'avery.quill',
      licensedStates: ['CA', 'NY'],
    });
  });

  it('attorney validation: bio > 300, client-only fields, unknown licensed state', async () => {
    const { auth, userId } = await onboardedTo('attorney');
    await saveProfile(auth, {
      firstName: 'Val',
      lastName: 'Idator',
      bio: 'b'.repeat(301),
    }).expect(400);
    const foreign = await saveProfile(auth, {
      firstName: 'Val',
      lastName: 'Idator',
      stateCode: 'NY',
      contactNote: 'x',
    }).expect(400);
    expect(foreign.body.error.details).toEqual({
      fields: ['stateCode', 'contactNote'],
    });
    const badState = await saveProfile(auth, {
      licensedStates: ['NY', 'ZZ'],
    }).expect(400);
    expect(badState.body.error.details).toEqual({ states: ['ZZ'] });
    expect(
      await prisma.attorneyProfile.findUnique({ where: { user_id: userId } }),
    ).toBeNull();
  });

  it('attorney username skips app_config profile.reserved_usernames', async () => {
    const { auth } = await onboardedTo('attorney');
    // usernameBase('Support', null) = 'support', reserved by default.
    const res = await saveProfile(auth, {
      firstName: 'Support',
      licensedStates: ['NY'],
    }).expect(200);
    expect(res.body.data.profile.username).toMatch(/^support\d+$/);
  });

  it('attorney without licensed states: completion fails, but the attorney_profiles row is upserted', async () => {
    const { auth, userId } = await onboardedTo('attorney');
    await api()
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ firstName: 'Nolic', lastName: 'Ense' })
      .expect(200);
    // A raw `data` payload can't smuggle in unvalidated licensed states.
    await api()
      .patch('/api/v1/users/me/onboarding')
      .set(auth)
      .send({ currentStep: 'tour', data: { licensedStates: ['ZZ'] } })
      .expect(200);

    const res = await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(403);
    expect(res.body.error.code).toBe('ONBOARDING_INCOMPLETE');
    expect(res.body.error.details.missing).toEqual(['licensed_states']);
    const row = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: userId },
    });
    expect(row.username).toBe('nolic.ense');

    await saveProfile(auth, { licensedStates: ['TX'] }, 'tour').expect(200);
    await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(200);
  });

  it('completion migrates the legacy free-form data.profile into client_profiles', async () => {
    const { auth, userId } = await onboardedTo('client');
    await api()
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ firstName: 'Old', lastName: 'Build' })
      .expect(200);
    await api()
      .patch('/api/v1/users/me/onboarding')
      .set(auth)
      .send({
        currentStep: 'tour',
        data: {
          profile: {
            state: 'tx',
            languages: ['es', 'zz'],
            contactMethod: 'chat',
            contactTime: 'Mornings',
          },
        },
      })
      .expect(200);
    await verifyEmail(userId, `legacy.${userId.slice(0, 8)}@example.com`);

    const done = await api()
      .post('/api/v1/users/me/onboarding/complete')
      .set(auth)
      .expect(200);
    expect(done.body.data.profile).toEqual({
      stateCode: 'TX',
      languages: ['es'],
      contactMethod: 'in_app_chat',
      contactNote: 'Mornings',
    });
  });

  it('Settings → Account: lists identifiers; changing the phone needs reauth + code and retires the old one', async () => {
    const { auth, userId, phone } = await onboardedTo('client');
    await verifyEmail(userId, `acct.${userId.slice(0, 8)}@example.com`);

    const list = await api()
      .get('/api/v1/users/me/identifiers')
      .set(auth)
      .expect(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        provider: 'phone',
        value: phone,
        verified: true,
        isPrimaryContact: true,
      }),
    ]);

    const newPhone = nextPhone();
    const noReauth = await api()
      .post('/api/v1/users/me/contacts/request')
      .set(auth)
      .send({ type: 'phone', value: newPhone })
      .expect(403);
    expect(noReauth.body.error.code).toBe('REAUTH_REQUIRED');

    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier: phone })
      .expect(200);
    const reauth = await api()
      .post('/api/v1/auth/reauth')
      .set(auth)
      .send({ method: 'otp', identifier: phone, code: '000000' })
      .expect(201);
    const reauthToken = reauth.body.data.reauthToken as string;

    await api()
      .post('/api/v1/users/me/contacts/request')
      .set(auth)
      .set('X-Reauth-Token', reauthToken)
      .send({ type: 'phone', value: newPhone })
      .expect(201);
    await api()
      .post('/api/v1/users/me/contacts/verify')
      .set(auth)
      .send({ type: 'phone', value: newPhone, code: '000000' })
      .expect(201);

    const after = await api()
      .get('/api/v1/users/me/identifiers')
      .set(auth)
      .expect(200);
    const phones = (
      after.body.data as { provider: string; value: string }[]
    ).filter((i) => i.provider === 'phone');
    expect(phones).toEqual([
      expect.objectContaining({ value: newPhone, isPrimaryContact: true }),
    ]);
    const me = await api().get('/api/v1/users/me').set(auth).expect(200);
    expect(me.body.data.phone).toBe(newPhone);

    // Linking an ADDITIONAL phone sign-in method via POST /auth/identifiers
    // (email delivery isn't runnable here, see onboarding.e2e-spec.ts).
    const extra = nextPhone();
    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier: extra })
      .expect(200);
    await api()
      .post('/api/v1/auth/identifiers')
      .set(auth)
      .send({ provider: 'phone', identifier: extra, code: '000000' })
      .expect(201);
    const withExtra = await api()
      .get('/api/v1/users/me/identifiers')
      .set(auth)
      .expect(200);
    expect(withExtra.body.data).toEqual([
      expect.objectContaining({ value: newPhone, isPrimaryContact: true }),
      expect.objectContaining({ value: extra, isPrimaryContact: false }),
    ]);
  });
});

import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
} from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { randomInt, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { StateRegistryService } from '../src/modules/verification/services/state-registry.service';
import {
  AUTO_APPROVED_NOTE,
  SELF_ATTESTED_NOTE,
} from '../src/modules/verification/services/verification-checks.service';
import { adminSession } from './support/admin-login';

// audit_log.seq (hash chain) is a BigInt, which JSON.stringify refuses.
const bigintSafe = (_k: string, v: unknown) =>
  typeof v === 'bigint' ? v.toString() : v;

/**
 * Owner 2026-10-05 ("добавляю API ключи по штатам — приложение начинает
 * проверку"): a state's registry is switched on in the admin with a key;
 * from then on self-attested licenses of that state are looked up. A match
 * is recorded, a difference flags the license for an admin but never
 * rejects or blocks the attorney; with self-attestation off a match
 * approves without a verifier. A fake registry runs on 127.0.0.1.
 */
jest.setTimeout(90_000);

type Body = { data: Record<string, unknown> };
const STATE = 'WY';
const API_KEY = ['test', 'registry', 'e2e', '4242'].join('-');

describe('State bar registries (e2e, owner 2026-10-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let registries: StateRegistryService;
  let baseUrl = '';
  let fake: HttpServer;
  let fakeUrl = '';
  const seen: { url: string; key: string | undefined }[] = [];
  let phoneSeq = 0;
  const api = () => request(baseUrl);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    fake = createServer((req: IncomingMessage, res) => {
      const num = decodeURIComponent((req.url ?? '').split('/').pop() ?? '');
      seen.push({
        url: req.url ?? '',
        key: req.headers['x-api-key'] as string,
      });
      const rec = (status: string, first: string, last: string) => ({
        data: { status, person: { first, last } },
      });
      const body = num.startsWith('OK')
        ? rec('Active', 'Kim', 'Wexler')
        : num.startsWith('MM')
          ? rec('Active', 'Jimmy', 'McGill')
          : num.startsWith('IN')
            ? rec('Suspended', 'Kim', 'Wexler')
            : null;
      res.statusCode = body ? 200 : 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body ?? { error: 'not found' }));
    });
    await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
    fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;

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
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    registries = app.get(StateRegistryService);
    // These suites test registries/self-attestation, not ID + selfie (owner
    // 2026-10-28 made those required by default; covered in verification.e2e).
    await setConfig('verification.require_identity', false);
    await prisma.state.upsert({
      where: { code: STATE },
      create: { code: STATE, name: 'Wyoming' },
      update: {},
    });
    await prisma.stateBarRegistry.deleteMany({ where: { state_code: STATE } });
    registries.invalidate();
  });

  afterAll(async () => {
    await prisma.stateBarRegistry.deleteMany({ where: { state_code: STATE } });
    await setConfig('verification.self_attestation_auto_approve', true);
    await app.close();
    await new Promise((r) => fake.close(r));
  });

  beforeEach(async () => {
    const redis = app.get<Redis>(REDIS_CLIENT);
    const keys = await redis.keys('throttle*');
    if (keys.length > 0) await redis.del(...keys);
  });

  async function setConfig(key: string, value: boolean): Promise<void> {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await app.get<Redis>(REDIS_CLIENT).del('config:app_config');
  }

  async function attorney() {
    phoneSeq += 1;
    const phone = `+1415555${String(9100 + phoneSeq).padStart(4, '0')}`;
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
        deviceInfo: { deviceId: 'registries-e2e' },
      })
      .expect(201);
    const auth = {
      Authorization: `Bearer ${(res.body as { data: { accessToken: string } }).data.accessToken}`,
    };
    const me = await api().get('/api/v1/users/me').set(auth).expect(200);
    const userId = (me.body as { data: { id: string } }).data.id;
    const username = `wreg_${randomUUID().slice(0, 8)}`;
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'attorney', first_name: 'Kim', last_name: 'Wexler' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: userId,
        username,
        username_lower: username.toLowerCase(),
        verification_status: 'unverified',
        languages: ['en'],
      },
    });
    return { auth, userId };
  }

  /** Submits a draft with one license of [STATE]. */
  async function submit(prefix: string) {
    const a = await attorney();
    const draft = await api()
      .post('/api/v1/verification/requests')
      .set(a.auth)
      .expect(201);
    const requestId = (draft.body as Body).data.id as string;
    // Digits only after the prefix: a state without its own format needs at
    // least 3 digits, and random hex sometimes has fewer (a 1-in-30 flake).
    const bar = `${prefix}${String(randomInt(10_000_000, 99_999_999))}`;
    await api()
      .post(`/api/v1/verification/requests/${requestId}/licenses`)
      .set(a.auth)
      .send({ stateCode: STATE, barNumber: bar })
      .expect(201);
    const sent = await api()
      .post(`/api/v1/verification/requests/${requestId}/submit`)
      .set(a.auth)
      .send({ attestation: true })
      .expect(200);
    const license = await prisma.attorneyLicense.findFirstOrThrow({
      where: { attorney_id: a.userId },
    });
    return {
      ...a,
      requestId,
      status: (sent.body as Body).data.status as string,
      license,
    };
  }

  it('admin switches a state on with a key (step-up), tests it, and it runs', async () => {
    const admin = await adminSession(baseUrl, prisma, 'super_admin');
    const overview = await api()
      .get('/api/v1/admin/verification/registries')
      .set(admin.auth)
      .expect(200);
    const data = (overview.body as Body).data as {
      secretsEnabled: boolean;
      adapterTypes: { type: string }[];
      items: { stateCode: string; adapter: string; enabled: boolean }[];
    };
    expect(data.secretsEnabled).toBe(true);
    expect(data.adapterTypes.map((t) => t.type)).toEqual([
      'manual',
      'ny_open_data',
      'socrata',
      'generic_rest',
    ]);
    expect(data.items.find((i) => i.stateCode === STATE)).toMatchObject({
      adapter: 'manual',
      enabled: false,
    });

    const body = {
      adapter: 'generic_rest',
      enabled: true,
      config: {
        urlTemplate: `${fakeUrl}/lic/{bar_number}`,
        authType: 'header',
        authName: 'X-API-Key',
        recordPath: 'data',
        statusPath: 'status',
        firstNamePath: 'person.first',
        lastNamePath: 'person.last',
        activeValues: 'Active',
      },
      secret: API_KEY,
    };
    const refused = await api()
      .put(`/api/v1/admin/verification/registries/${STATE}`)
      .set(admin.auth)
      .send(body);
    expect(refused.status).toBe(403);
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(admin.auth)
      .send({ code: totpCode(admin.totpSecret, Date.now() + 30_000) })
      .expect(200);
    const saved = await api()
      .put(`/api/v1/admin/verification/registries/${STATE}`)
      .set(admin.auth)
      .send(body)
      .expect(200);
    const savedData = (saved.body as Body).data;
    expect(savedData).toMatchObject({
      enabled: true,
      hasSecret: true,
      secretMasked: '••••4242',
    });
    expect(JSON.stringify(saved.body)).not.toContain(API_KEY);
    const row = await prisma.stateBarRegistry.findUniqueOrThrow({
      where: { state_code: STATE },
    });
    expect(row.secret_enc).not.toContain(API_KEY);

    const tested = await api()
      .post(`/api/v1/admin/verification/registries/${STATE}/test`)
      .set(admin.auth)
      .send({ barNumber: 'OK1', firstName: 'Kim', lastName: 'Wexler' })
      .expect(200);
    expect((tested.body as Body).data.result).toBe('pass');
    expect(seen.at(-1)).toEqual({ url: '/lic/OK1', key: API_KEY });

    const audit = await prisma.auditLog.findMany({
      where: {
        admin_id: admin.userId,
        action: { startsWith: 'verification.registry' },
      },
      orderBy: { created_at: 'asc' },
    });
    expect(audit.map((r) => r.action)).toEqual([
      'verification.registry_save',
      'verification.registry_test',
    ]);
    expect(JSON.stringify(audit, bigintSafe)).not.toContain(API_KEY);
  });

  it('self-attestation: approved at once; a match leaves no flag', async () => {
    await setConfig('verification.self_attestation_auto_approve', true);
    registries.invalidate();
    const r = await submit('OK');
    expect(r.status).toBe('approved');
    expect(r.license.license_status).toBe('verified');
    expect(r.license.registry_flag).toBeNull();
    expect(r.license.auto_check_result).toMatchObject({
      result: 'pass',
      lookupProvider: 'auto',
    });
    const check = await prisma.verificationCheck.findFirstOrThrow({
      where: { request_id: r.requestId, check_type: 'bar_lookup' },
    });
    expect(check.result).toBe('pass');
    expect(check.details).toMatchObject({
      provider: expect.stringContaining('generic_rest') as unknown,
      stateCode: STATE,
      raw: expect.stringContaining('Wexler') as unknown,
    });
    const req = await prisma.verificationRequest.findUniqueOrThrow({
      where: { id: r.requestId },
    });
    expect(req.admin_note).toBe(SELF_ATTESTED_NOTE);
  });

  it.each([
    ['MM', 'name_mismatch'],
    ['NO', 'not_found'],
    ['IN', 'not_active'],
  ])(
    'self-attestation: %s → still verified, flagged %s for an admin',
    async (prefix, flag) => {
      await setConfig('verification.self_attestation_auto_approve', true);
      const r = await submit(prefix);
      expect(r.status).toBe('approved');
      expect(r.license.license_status).toBe('verified');
      expect(r.license.registry_flag).toBe(flag);
      expect(r.license.registry_flagged_at).toBeInstanceOf(Date);
    },
  );

  it('admin sees the flags, re-runs a check and clears a flag', async () => {
    await setConfig('verification.self_attestation_auto_approve', true);
    const r = await submit('MM');
    const verifier = await adminSession(baseUrl, prisma, 'super_admin');
    const list = await api()
      .get('/api/v1/admin/verification/registry-flags')
      .set(verifier.auth)
      .expect(200);
    const item = (list.body as { data: Record<string, unknown>[] }).data.find(
      (i) => (i.license as { id: string }).id === r.license.id,
    );
    expect(item).toMatchObject({
      license: { registryFlag: 'name_mismatch', status: 'verified' },
      latestRequestId: r.requestId,
    });

    // The registry was fixed: the re-check clears the flag by itself.
    await prisma.user.update({
      where: { id: r.userId },
      data: { first_name: 'Jimmy', last_name: 'McGill' },
    });
    const rerun = await api()
      .post(
        `/api/v1/admin/verification/licenses/${r.license.id}/registry-check`,
      )
      .set(verifier.auth)
      .expect(200);
    expect((rerun.body as Body).data).toMatchObject({
      result: 'pass',
      license: { registryFlag: null, status: 'verified' },
    });

    const r2 = await submit('NO');
    const cleared = await api()
      .post(
        `/api/v1/admin/verification/licenses/${r2.license.id}/registry-flag/clear`,
      )
      .set(verifier.auth)
      .expect(200);
    expect((cleared.body as Body).data).toMatchObject({ registryFlag: null });
  });

  it('self-attestation off: a registry match approves without a verifier', async () => {
    await setConfig('verification.self_attestation_auto_approve', false);
    const ok = await submit('OK');
    expect(ok.status).toBe('approved');
    const okReq = await prisma.verificationRequest.findUniqueOrThrow({
      where: { id: ok.requestId },
    });
    expect(okReq.status).toBe('approved');
    expect(okReq.admin_note).toBe(AUTO_APPROVED_NOTE);

    // Not found: waits for a verifier, nothing is rejected.
    const miss = await submit('NO');
    expect(miss.status).toBe('submitted');
    expect(miss.license.license_status).toBe('pending');
  });

  it('switched off: no lookup at all', async () => {
    await prisma.stateBarRegistry.update({
      where: { state_code: STATE },
      data: { enabled: false },
    });
    registries.invalidate();
    await setConfig('verification.self_attestation_auto_approve', true);
    const before = seen.length;
    const r = await submit('MM');
    expect(r.status).toBe('approved');
    expect(r.license.registry_flag).toBeNull();
    expect(seen.length).toBe(before);
  });
});

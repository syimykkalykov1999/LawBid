import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SecretsService } from '../src/common/secrets/secrets.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-01 — Admin → Integrations & API keys: super_admin only,
 * a fresh 2FA code before any change, values write-only (masked), a new
 * version waits as pending until activated, the running code reads the
 * active one at once (no restart), rollback and removal fall back.
 */
jest.setTimeout(120_000);

describe('Admin integrations & API keys (e2e, owner 2026-10-01)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let secrets: SecretsService;
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
    secrets = app.get(SecretsService);
    tokens = app.get(TokenService);
    // Each run starts without saved TURN keys.
    await prisma.integrationCredential.deleteMany({
      where: { provider: 'turn' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const SECRET_1 = 'turn-shared-secret-number-one-0001';
  const SECRET_2 = 'turn-shared-secret-number-two-0002';

  it('the whole cycle: step-up → save → activate → live → edit → rollback → remove', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const overview = async () =>
      (
        (
          await api()
            .get('/api/v1/admin/integrations')
            .set(admin.auth)
            .expect(200)
        ).body as { data: { storageEnabled: boolean } }
      ).data;
    expect((await overview()).storageEnabled).toBe(true);

    // No change without a fresh 2FA code.
    const refused = await api()
      .post('/api/v1/admin/integrations/turn/versions')
      .set(admin.auth)
      .send({
        values: { urls: 'turn:turn.example.com:3478', secret: SECRET_1 },
      });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('ADMIN_STEP_UP_REQUIRED');
    // A wrong code is refused.
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(admin.auth)
      .send({ code: '000000' })
      .expect(403);
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(admin.auth)
      .send({ code: totpCode(admin.totpSecret, Date.now() + 30_000) })
      .expect(200);

    // A bad format is refused before anything is stored.
    const bad = await api()
      .post('/api/v1/admin/integrations/turn/versions')
      .set(admin.auth)
      .send({ values: { urls: 'http://nope', secret: SECRET_1 } });
    expect(bad.status).toBe(400);

    const v1 = await api()
      .post('/api/v1/admin/integrations/turn/versions')
      .set(admin.auth)
      .send({
        values: { urls: 'turn:turn.example.com:3478', secret: SECRET_1 },
      })
      .expect(201);
    expect(v1.body.data).toMatchObject({ version: 1, status: 'pending' });
    // Write-only: the secret never comes back, only ••••last4.
    expect(JSON.stringify(v1.body)).not.toContain(SECRET_1);
    expect(v1.body.data.masked.secret).toBe('••••0001');
    // Stored encrypted.
    const row = await prisma.integrationCredential.findFirstOrThrow({
      where: { provider: 'turn', version: 1 },
    });
    expect(row.secret_enc).not.toContain(SECRET_1);
    // Pending is not live yet.
    expect((await secrets.get('turn'))?.fields.secret).not.toBe(SECRET_1);

    await api()
      .post('/api/v1/admin/integrations/turn/versions/1/activate')
      .set(admin.auth)
      .send({})
      .expect(200);
    const live = await secrets.get('turn');
    expect(live).toMatchObject({ source: 'db', version: 1 });
    expect(live?.fields.secret).toBe(SECRET_1);

    // Edit: change only the URLs, keep the secret by leaving it blank.
    await api()
      .post('/api/v1/admin/integrations/turn/versions')
      .set(admin.auth)
      .send({ values: { urls: 'turns:turn2.example.com:5349', secret: '' } })
      .expect(201);
    await api()
      .post('/api/v1/admin/integrations/turn/versions/2/activate')
      .set(admin.auth)
      .send({})
      .expect(200);
    expect((await secrets.get('turn'))?.fields).toMatchObject({
      urls: 'turns:turn2.example.com:5349',
      secret: SECRET_1,
    });

    // A third version with a new secret, then roll back to v2.
    await api()
      .post('/api/v1/admin/integrations/turn/versions')
      .set(admin.auth)
      .send({ values: { urls: '', secret: SECRET_2 } })
      .expect(201);
    await api()
      .post('/api/v1/admin/integrations/turn/versions/3/activate')
      .set(admin.auth)
      .send({})
      .expect(200);
    expect((await secrets.get('turn'))?.fields.secret).toBe(SECRET_2);
    await api()
      .post('/api/v1/admin/integrations/turn/rollback')
      .set(admin.auth)
      .expect(200);
    expect((await secrets.get('turn'))?.version).toBe(2);

    // Remove needs the id typed; then the server env is the source again.
    await api()
      .delete('/api/v1/admin/integrations/turn')
      .set(admin.auth)
      .send({ confirm: 'nope' })
      .expect(400);
    await api()
      .delete('/api/v1/admin/integrations/turn')
      .set(admin.auth)
      .send({ confirm: 'turn' })
      .expect(204);
    expect((await secrets.get('turn'))?.source ?? 'none').not.toBe('db');

    // Every change is in the audit log, without the secret.
    const audit = await prisma.auditLog.findMany({
      where: { admin_id: admin.userId, target_type: 'integration' },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'integration.create_version',
        'integration.activate',
        'integration.rollback',
        'integration.delete',
      ]),
    );
    expect(JSON.stringify(audit)).not.toContain(SECRET_1);
    expect(JSON.stringify(audit)).not.toContain(SECRET_2);
  });

  it('a stripe key needs a passed test before it goes live', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(admin.auth)
      .send({ code: totpCode(admin.totpSecret, Date.now() + 30_000) })
      .expect(200);
    await prisma.integrationCredential.deleteMany({
      where: { provider: 'stripe' },
    });
    await api()
      .post('/api/v1/admin/integrations/stripe/versions')
      .set(admin.auth)
      .send({
        values: {
          secretKey: 'sk_test_abcdefghijklmnop',
          webhookSecret: 'whsec_abcdefghijklmnop',
          priceId: 'price_123',
        },
      })
      .expect(201);
    const res = await api()
      .post('/api/v1/admin/integrations/stripe/versions/1/activate')
      .set(admin.auth)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INTEGRATION_CONFLICT');
    await prisma.integrationCredential.deleteMany({
      where: { provider: 'stripe' },
    });
  });

  it('only super admins; app users never reach it', async () => {
    const support = await adminSession(base, prisma, 'support');
    await api().get('/api/v1/admin/integrations').set(support.auth).expect(403);
    const user = await prisma.user.create({ data: { role: 'client' } });
    const t = tokens.signAccessToken({
      sub: user.id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    });
    const res = await api()
      .get('/api/v1/admin/integrations')
      .set({ Authorization: `Bearer ${t}` });
    expect([401, 403]).toContain(res.status);
  });
});

import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { AttorneyTrustService } from '../src/modules/attorney-trust/attorney-trust.service';
import { LicenseExpiryJob } from '../src/jobs/handlers/license-expiry.job';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-24: attorney license expiry. Reminders at 60/30/7 days; on
 * the date the badge hides and the admin sees «требует продления», but the
 * account keeps working; after the grace period the license expires.
 */
jest.setTimeout(120_000);

const DAY = 86_400_000;
const day = (offset: number) =>
  new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    ) +
      offset * DAY,
  );

describe('License expiry (e2e, owner 2026-10-24)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tokens: TokenService;
  let trust: AttorneyTrustService;
  let job: LicenseExpiryJob;
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
    tokens = app.get(TokenService);
    trust = app.get(AttorneyTrustService);
    job = app.get(LicenseExpiryJob, { strict: false });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    // Only the registry match is required for the badge in this suite.
    for (const [key, value] of [
      ['trust.require_registry', true],
      ['trust.require_identity', false],
      ['trust.require_documents', false],
      ['verification.license_expiry_grace_days', 14],
    ] as const) {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
    await redis.del('config:app_config');
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: {
        key: {
          in: [
            'trust.require_registry',
            'trust.require_identity',
            'trust.require_documents',
            'verification.license_expiry_grace_days',
          ],
        },
      },
    });
    await redis.del('config:app_config');
    await app.close();
  });

  const api = () => request(base);

  async function badgedAttorney(expiresInDays: number) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Kim', last_name: 'Wexler' },
    });
    const username = `le_${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const license = await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: 'NJ',
        bar_number: `E-${randomUUID().slice(0, 12)}`,
        license_status: 'verified',
        expires_at: day(400),
        expires_source: 'attorney',
        auto_check_result: {
          result: 'pass',
          name: 'KIM WEXLER',
          lookupProvider: 'e2e',
        },
      },
    });
    await trust.recompute(u.id);
    // The date moves AFTER the badge was granted (the nightly job reacts).
    await prisma.attorneyLicense.update({
      where: { id: license.id },
      data: { expires_at: day(expiresInDays) },
    });
    const auth = {
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: u.id,
        role: 'attorney',
        sid: randomUUID(),
        verified: true,
        subscriptionStatus: 'none',
      })}`,
    };
    return { id: u.id, licenseId: license.id, auth };
  }

  const profile = (id: string) =>
    prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: id },
      select: { trust_badge: true, verification_status: true },
    });

  const notices = async (id: string) =>
    (
      await prisma.notification.findMany({
        where: { user_id: id, type: 'verification_update' },
        select: { payload: true },
      })
    ).map((n) => (n.payload as { kind?: string }).kind);

  it('a valid license keeps the badge', async () => {
    const a = await badgedAttorney(200);
    expect((await profile(a.id)).trust_badge).toBe(true);
  });

  it('reminds at the 60-day threshold once, in-app', async () => {
    const a = await badgedAttorney(55);
    await job.run();
    await job.run();
    const kinds = (await notices(a.id)).filter((k) => k === 'license_expiring');
    expect(kinds).toHaveLength(1);
    const n = await prisma.notification.findFirstOrThrow({
      where: {
        user_id: a.id,
        type: 'verification_update',
        payload: { path: ['kind'], equals: 'license_expiring' },
      },
    });
    expect(n.payload).toMatchObject({ thresholdDays: 60, daysLeft: 55 });
  });

  it('on the date the badge hides, the admin sees renewal_due, the account is not blocked; a new date brings the badge back', async () => {
    const a = await badgedAttorney(-3);
    expect((await profile(a.id)).trust_badge).toBe(true); // not recomputed yet
    await job.run();
    const after = await profile(a.id);
    expect(after.trust_badge).toBe(false);
    expect(after.verification_status).toBe('verified'); // not blocked
    expect(await notices(a.id)).toContain('license_renewal_due');
    const lic = await prisma.attorneyLicense.findUniqueOrThrow({
      where: { id: a.licenseId },
    });
    expect(lic.license_status).toBe('verified'); // grace period running
    // Still allowed to work: the trust gates stay open for bids.
    const me = await api().get('/api/v1/trust/me').set(a.auth).expect(200);
    expect(me.body.data.canBid).toBe(true);

    const admin = await adminSession(base, prisma, 'verifier');
    // Setting the same past date keeps it «требует продления».
    const same = await api()
      .post(`/api/v1/admin/verification/licenses/${a.licenseId}/expiry`)
      .set(admin.auth)
      .send({ expiresAt: day(-3).toISOString().slice(0, 10) })
      .expect(200);
    expect(same.body.data).toMatchObject({
      status: 'verified',
      expiresSource: 'admin',
      renewalState: 'renewal_due',
      graceEndsAt: day(11).toISOString().slice(0, 10),
    });
    expect((await profile(a.id)).trust_badge).toBe(false);
    // Renewed: the badge returns at once.
    const renewed = await api()
      .post(`/api/v1/admin/verification/licenses/${a.licenseId}/expiry`)
      .set(admin.auth)
      .send({ expiresAt: day(400).toISOString().slice(0, 10) })
      .expect(200);
    expect(renewed.body.data.renewalState).toBe('ok');
    expect((await profile(a.id)).trust_badge).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'verification.license_expiry_set',
          target_id: a.licenseId,
        },
      }),
    ).toBe(2);
  });

  it('after the grace period the license expires and the profile loses verified', async () => {
    const a = await badgedAttorney(-20);
    await job.run();
    const lic = await prisma.attorneyLicense.findUniqueOrThrow({
      where: { id: a.licenseId },
    });
    expect(lic.license_status).toBe('expired');
    const after = await profile(a.id);
    expect(after.trust_badge).toBe(false);
    expect(after.verification_status).toBe('unverified');
    expect(await notices(a.id)).toEqual(
      expect.arrayContaining(['license_expired', 'profile_unverified']),
    );
    // An expired license is renewed through a new verification, not by date.
    const admin = await adminSession(base, prisma, 'verifier');
    await api()
      .post(`/api/v1/admin/verification/licenses/${a.licenseId}/expiry`)
      .set(admin.auth)
      .send({ expiresAt: day(400).toISOString().slice(0, 10) })
      .expect(409);
  });

  it('the admin date is validated', async () => {
    const a = await badgedAttorney(100);
    const admin = await adminSession(base, prisma, 'verifier');
    await api()
      .post(`/api/v1/admin/verification/licenses/${a.licenseId}/expiry`)
      .set(admin.auth)
      .send({ expiresAt: 'tomorrow' })
      .expect(400);
    const cleared = await api()
      .post(`/api/v1/admin/verification/licenses/${a.licenseId}/expiry`)
      .set(admin.auth)
      .send({ expiresAt: null })
      .expect(200);
    expect(cleared.body.data).toMatchObject({
      expiresAt: null,
      expiresSource: null,
      renewalState: null,
    });
  });
});

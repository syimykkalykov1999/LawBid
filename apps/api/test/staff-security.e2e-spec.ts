import { randomUUID } from 'node:crypto';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StaffAnomalyService } from '../src/modules/staff-security/staff-anomaly.service';
import { utcDay } from '../src/modules/staff-security/staff-security.util';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Staff package T11 (data security) in the real API: the mass-work workspace
 * sees a masked phone / e-mail, reveals one at a time (audited, 20 a day),
 * cannot export, is bound to its device / network / country, and its card
 * opening is counted for the daily report. The owner never meets any of it,
 * and with every switch off the API answers as before.
 */
jest.setTimeout(180_000);

const SWITCHES = [
  'staff.masking_enabled',
  'staff.export_block_enabled',
  'staff.session_binding_enforce_enabled',
  'staff.anomalies_enabled',
  'staff.watermark_enabled',
];

describe('Staff data security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let base = '';
  let target: { id: string; phone: string; email: string };

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
    const tail = String(Math.floor(Math.random() * 9000) + 1000);
    const email = `person-${randomUUID().slice(0, 8)}@lawbid-e2e.test`;
    const phone = `+1415555${tail}`;
    const u = await prisma.user.create({
      data: {
        role: 'client',
        status: 'active',
        email,
        phone_e164: phone,
        first_name: 'Pat',
        last_name: 'Person',
      },
    });
    target = { id: u.id, phone, email };
  });

  afterAll(async () => {
    await setSwitches({});
    await prisma.appConfig.deleteMany({
      where: { key: 'admin.country_allowlist' },
    });
    await redis.del('config:app_config');
    await app.close();
  });

  const api = () => request(base);

  async function setSwitches(on: Record<string, boolean | number>) {
    for (const key of SWITCHES) await put(key, on[key] ?? false);
    for (const [k, v] of Object.entries(on)) {
      if (typeof v === 'number') await put(k, v);
    }
    await redis.del('config:app_config'); // bypass the cache
  }
  async function put(key: string, value: unknown) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }

  async function worker(
    workspace: 'mass' | 'finance' = 'mass',
  ): Promise<AdminSession> {
    const s = await adminSession(base, prisma, 'support', undefined, {
      users: 'view',
      support: 'manage',
      exports: 'view',
      outreach: 'view',
    });
    await prisma.adminProfile.update({
      where: { user_id: s.userId },
      data: { workspace },
    });
    return s;
  }

  const getUser = (a: AdminSession, headers: Record<string, string> = {}) =>
    api()
      .get(`/api/v1/admin/users/${target.id}/contacts`)
      .set(a.auth)
      .set({ 'X-Justification': 'support check of the profile', ...headers });

  const jti = (a: AdminSession) =>
    (
      JSON.parse(
        Buffer.from(a.accessToken.split('.')[1], 'base64url').toString(),
      ) as { jti: string }
    ).jti;

  it('off (the default): the mass worker sees the real phone, reveal and the watermark are closed, nothing is counted', async () => {
    await setSwitches({});
    const w = await worker();
    const r = await getUser(w).expect(200);
    expect(r.body.data.phone).toBe(target.phone);
    expect(r.body.data.email).toBe(target.email);
    await api()
      .post('/api/v1/admin/pii/reveal')
      .set(w.auth)
      .send({ targetType: 'user', targetId: target.id, field: 'phone' })
      .expect(404);
    const wm = await api()
      .get('/api/v1/admin/pii/watermark')
      .set(w.auth)
      .expect(200);
    expect(wm.body.data).toEqual({ enabled: false, text: '' });
    const ex = await api()
      .get('/api/v1/admin/outreach/leads/export.csv')
      .set(w.auth);
    expect(ex.body?.error?.code).not.toBe('STAFF_EXPORT_BLOCKED');
  });

  it('masking on: the mass worker sees a partial mask; reveal gives the value once, with an audit row; the list stays masked', async () => {
    await setSwitches({ 'staff.masking_enabled': true });
    const w = await worker();
    const owner = await adminSession(base, prisma, 'super_admin');

    const masked = await getUser(w).expect(200);
    expect(masked.body.data.phone).toMatch(/^\+1 \*\*\* \*\* \d\d$/);
    expect(masked.body.data.email).toBe(
      `${target.email[0]}***@${target.email.split('@')[1]}`,
    );
    expect(JSON.stringify(masked.body)).not.toContain(target.phone);

    const full = await getUser(owner).expect(200);
    expect(full.body.data.phone).toBe(target.phone);

    const rev = await api()
      .post('/api/v1/admin/pii/reveal')
      .set(w.auth)
      .send({ targetType: 'user', targetId: target.id, field: 'phone' })
      .expect(200);
    expect(rev.body.data).toEqual({
      field: 'phone',
      value: target.phone,
      remainingToday: 19,
    });
    const audit = await prisma.auditLog.findMany({
      where: { admin_id: w.userId, action: 'admin.pii_reveal' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      target_type: 'user',
      target_id: target.id,
    });
    expect(JSON.stringify(audit[0].after)).not.toContain(target.phone);

    // The next read is masked again: nothing was unlocked for good.
    const again = await getUser(w).expect(200);
    expect(again.body.data.phone).toMatch(/\*\*\*/);
  });

  it('the 21st reveal of the day is refused with 429 STAFF_REVEAL_LIMIT', async () => {
    await setSwitches({ 'staff.masking_enabled': true });
    const w = await worker();
    const body = { targetType: 'user', targetId: target.id, field: 'email' };
    for (let i = 0; i < 20; i++) {
      await api()
        .post('/api/v1/admin/pii/reveal')
        .set(w.auth)
        .send(body)
        .expect(200);
    }
    const over = await api()
      .post('/api/v1/admin/pii/reveal')
      .set(w.auth)
      .send(body)
      .expect(429);
    expect(over.body.error.code).toBe('STAFF_REVEAL_LIMIT');
  });

  it('exports: 403 + audit for the mass workspace; owner and finance unchanged; off = unchanged', async () => {
    await setSwitches({ 'staff.export_block_enabled': true });
    const w = await worker();
    const blocked = await api()
      .get('/api/v1/admin/export/users')
      .set(w.auth)
      .expect(403);
    expect(blocked.body.error.code).toBe('STAFF_EXPORT_BLOCKED');
    const csv = await api()
      .get('/api/v1/admin/outreach/leads/export.csv')
      .set(w.auth)
      .expect(403);
    expect(csv.body.error.code).toBe('STAFF_EXPORT_BLOCKED');
    expect(
      await prisma.auditLog.count({
        where: { admin_id: w.userId, action: 'admin.export_blocked' },
      }),
    ).toBe(2);

    const owner = await adminSession(base, prisma, 'super_admin');
    const fin = await worker('finance');
    for (const who of [owner, fin]) {
      const r = await api()
        .get('/api/v1/admin/outreach/leads/export.csv')
        .set(who.auth);
      expect(r.body?.error?.code).not.toBe('STAFF_EXPORT_BLOCKED');
    }
    expect(
      await prisma.auditLog.count({
        where: { admin_id: owner.userId, action: 'admin.export_blocked' },
      }),
    ).toBe(0);
  });

  it('session rules on: another device and a changed address end the session; the country list works; the owner is exempt', async () => {
    await setSwitches({ 'staff.session_binding_enforce_enabled': true });
    // device
    const a = await worker();
    await redis.hset(`adm:sess:meta:${jti(a)}`, 'fp', 'deadbeefdeadbeef');
    const dev = await getUser(a, {
      'User-Agent': 'Mozilla/5.0 Firefox/130',
    }).expect(401);
    expect(dev.body.error.code).toBe('ADMIN_DEVICE_CHANGED');
    // the session is gone: the next request must sign in again
    const gone = await getUser(a).expect(401);
    expect(gone.body.error.code).toBe('AUTH_SESSION_REVOKED');
    expect(
      await prisma.auditLog.count({
        where: { admin_id: a.userId, action: 'admin.session_device_changed' },
      }),
    ).toBe(1);
    // network address
    const b = await worker();
    await redis.hset(`adm:sess:meta:${jti(b)}`, 'ip', '198.51.100.1');
    const ip = await getUser(b).expect(401);
    expect(ip.body.error.code).toBe('ADMIN_IP_CHANGED');
    // country: empty list = no check
    const c = await worker();
    await getUser(c, { 'CF-IPCountry': 'RU' }).expect(200);
    await put('admin.country_allowlist', ['US', 'KG']);
    await redis.del('config:app_config');
    await getUser(c, { 'CF-IPCountry': 'KG' }).expect(200);
    const ru = await getUser(c, { 'CF-IPCountry': 'RU' }).expect(403);
    expect(ru.body.error.code).toBe('ADMIN_COUNTRY_NOT_ALLOWED');
    // the owner meets none of it
    const owner = await adminSession(base, prisma, 'super_admin');
    await redis.hset(
      `adm:sess:meta:${jti(owner)}`,
      'ip',
      '198.51.100.1',
      'fp',
      'deadbeefdeadbeef',
    );
    await getUser(owner, { 'CF-IPCountry': 'RU', 'User-Agent': 'x' }).expect(
      200,
    );
    // off again: a bound mismatch is ignored
    await setSwitches({});
    const d = await worker();
    await redis.hset(
      `adm:sess:meta:${jti(d)}`,
      'ip',
      '198.51.100.1',
      'fp',
      'deadbeefdeadbeef',
    );
    await getUser(d, { 'CF-IPCountry': 'RU' }).expect(200);
  });

  it('detector on: opened cards are counted and the daily job writes a staff_anomalies row', async () => {
    await setSwitches({
      'staff.anomalies_enabled': true,
      'staff.cards_per_minute': 5,
    });
    const w = await worker();
    for (let i = 0; i < 7; i++) await getUser(w).expect(200);
    const svc = app.get(StaffAnomalyService);
    const day = utcDay();
    // the counter is fire-and-forget: wait for it
    let seen = 0;
    for (let i = 0; i < 40 && seen < 7; i++) {
      seen =
        (await redis
          .hget(`staff:sec:${day}`, `${w.userId}:opened`)
          .then(Number)) || 0;
      if (seen < 7) await new Promise((r) => setTimeout(r, 100));
    }
    expect(seen).toBe(7);
    const r = await svc.computeDay(day);
    expect(r.rows).toBeGreaterThanOrEqual(1);
    const row = await prisma.staffAnomaly.findFirst({
      where: { admin_id: w.userId, rule: 'cards_burst' },
    });
    expect(row).not.toBeNull();
    expect(r.digest).toContain('сотр.');
  });

  it('watermark: names the admin only while on, only for the mass workspace', async () => {
    await setSwitches({ 'staff.watermark_enabled': true });
    const w = await worker();
    const wm = await api()
      .get('/api/v1/admin/pii/watermark')
      .set(w.auth)
      .expect(200);
    expect(wm.body.data.enabled).toBe(true);
    expect(wm.body.data.text).toContain(w.userId.slice(0, 8));
    const owner = await adminSession(base, prisma, 'super_admin');
    const own = await api()
      .get('/api/v1/admin/pii/watermark')
      .set(owner.auth)
      .expect(200);
    expect(own.body.data).toEqual({ enabled: false, text: '' });
  });
});

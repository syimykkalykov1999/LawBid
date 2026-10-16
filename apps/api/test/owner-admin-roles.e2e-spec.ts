import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Owner 2026-10-16: roles for other admins — presets, grantable money /
 * budget limits / audit log, «без персональных данных», one-time invite
 * link (72 h). Keys and admin management stay closed (404) to everyone but
 * the super admin.
 */
jest.setTimeout(120_000);

describe('Admin roles, presets and invite links (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base = '';
  const tag = randomUUID().slice(0, 8);

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
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);

  async function stepUp(a: AdminSession) {
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(a.auth)
      .send({ code: totpCode(a.totpSecret, Date.now() + 30_000) })
      .expect(200);
  }

  /** Invite → open the link → pick a login/password → sign in. */
  async function invite(
    owner: AdminSession,
    body: Record<string, unknown>,
    login: string,
  ) {
    const created = await api()
      .post('/api/v1/admin/admins/invites')
      .set(owner.auth)
      .send(body)
      .expect(201);
    const { admin, invite: link } = created.body.data as {
      admin: {
        id: string;
        email: string;
        noPii: boolean;
        permissions: Record<string, string>;
        role: string;
      };
      invite: { token: string; url: string | null; expiresAt: string };
    };
    const password = 'Str0ng-pass-2026!';
    await api()
      .post('/api/v1/admin/auth/invite/accept')
      .send({ token: link.token, login, password })
      .expect(200);
    const signed = await api()
      .post('/api/v1/admin/auth/login/password')
      .send({ login, password })
      .expect(200);
    const session = (
      signed.body.data as { session: { accessToken: string } | null }
    ).session;
    if (!session) throw new Error('expected a session (no 2FA yet)');
    return {
      admin,
      link,
      auth: { Authorization: `Bearer ${session.accessToken}` },
    };
  }

  it('lists the five presets', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    const res = await api()
      .get('/api/v1/admin/admins/presets')
      .set(owner.auth)
      .expect(200);
    const keys = (res.body.data as { key: string }[]).map((p) => p.key);
    expect(keys).toEqual([
      'owner',
      'accountant',
      'moderator',
      'support',
      'viewer',
    ]);
  });

  it('accountant by invite: sees money without people, cannot change money, never keys or admins', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    // A person with personal data to look for.
    const person = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Maria',
        last_name: 'Gonzalez',
        email: `maria-${tag}@example.com`,
        status: 'active',
      },
    });
    await stepUp(owner);
    const acc = await invite(
      owner,
      { email: `acc-${tag}@lawbid-e2e.test`, preset: 'accountant' },
      `acc.${tag}`,
    );
    expect(acc.admin.noPii).toBe(true);
    expect(acc.admin.permissions).toMatchObject({
      money: 'view',
      economy: 'view',
      budget_limits: 'manage',
      users: 'view',
    });
    expect(acc.link.expiresAt).toBeTruthy();
    const hours =
      (new Date(acc.link.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(71.5);
    expect(hours).toBeLessThanOrEqual(72);

    // Money: read yes, write no.
    await api().get('/api/v1/admin/billing/payments').set(acc.auth).expect(200);
    await api().get('/api/v1/admin/treasury').set(acc.auth).expect(200);
    await api()
      .post('/api/v1/admin/billing/refunds')
      .set(acc.auth)
      .send({})
      .expect(404);
    // Treasury writes stay the owner's even if money were manage.
    await api()
      .post('/api/v1/admin/treasury/run')
      .set(acc.auth)
      .send({})
      .expect(404);
    // Budget caps: their own switch.
    await api().get('/api/v1/admin/config/budgets').set(acc.auth).expect(200);
    await api().get('/api/v1/admin/config').set(acc.auth).expect(404);
    // Closed for everyone but the owner.
    for (const path of [
      '/api/v1/admin/integrations',
      '/api/v1/admin/admins',
      '/api/v1/admin/sessions',
      '/api/v1/admin/audit-log',
      '/api/v1/admin/export/users',
      '/api/v1/admin/data-requests',
    ]) {
      await api().get(path).set(acc.auth).expect(404);
    }
    // People are masked.
    const users = await api()
      .get('/api/v1/admin/users')
      .query({ q: person.id, limit: 5 })
      .set(acc.auth)
      .expect(200);
    const row = (
      users.body.data as { id: string; firstName: string; email: string }[]
    ).find((u) => u.id === person.id);
    expect(row).toBeDefined();
    expect(row?.firstName).toBe('M.');
    expect(row?.email).toBe('m•••@•••');
    expect(JSON.stringify(users.body)).not.toContain('Gonzalez');
    expect(JSON.stringify(users.body)).not.toContain('example.com');
    // The owner still sees the real data.
    const ownerView = await api()
      .get('/api/v1/admin/users')
      .query({ q: person.id, limit: 5 })
      .set(owner.auth)
      .expect(200);
    expect(JSON.stringify(ownerView.body)).toContain('Gonzalez');
  });

  it('the invite link is single use and re-issuing ends the old link', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    await stepUp(owner);
    const created = await api()
      .post('/api/v1/admin/admins/invites')
      .set(owner.auth)
      .send({ email: `re-${tag}@lawbid-e2e.test`, preset: 'support' })
      .expect(201);
    const { admin, invite: first } = created.body.data;
    const peek = await api()
      .get(`/api/v1/admin/auth/invite/${first.token}`)
      .expect(200);
    expect(peek.body.data.email).toBe(`re-${tag}@lawbid-e2e.test`);

    const again = await api()
      .post(`/api/v1/admin/admins/${admin.id}/invite`)
      .set(owner.auth)
      .expect(200);
    const second = again.body.data.invite;
    expect(second.token).not.toBe(first.token);
    await api().get(`/api/v1/admin/auth/invite/${first.token}`).expect(404);

    // A weak password does not spend the link.
    await api()
      .post('/api/v1/admin/auth/invite/accept')
      .send({ token: second.token, login: `re.${tag}`, password: 'short' })
      .expect(400);
    await api()
      .post('/api/v1/admin/auth/invite/accept')
      .send({
        token: second.token,
        login: `re.${tag}`,
        password: 'Str0ng-pass-2026!',
      })
      .expect(200);
    await api()
      .post('/api/v1/admin/auth/invite/accept')
      .send({
        token: second.token,
        login: `re2.${tag}`,
        password: 'Str0ng-pass-2026!',
      })
      .expect(404);
    await api().get(`/api/v1/admin/auth/invite/${second.token}`).expect(404);
  });

  it('inviting needs a fresh step-up, a known preset and a manager right', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    const body = { email: `x-${tag}@lawbid-e2e.test`, preset: 'moderator' };
    await api()
      .post('/api/v1/admin/admins/invites')
      .set(owner.auth)
      .send(body)
      .expect(403);
    await stepUp(owner);
    await api()
      .post('/api/v1/admin/admins/invites')
      .set(owner.auth)
      .send({ ...body, preset: 'nope' })
      .expect(400);
    await api()
      .post('/api/v1/admin/admins/invites')
      .set(owner.auth)
      .send({ email: `y-${tag}@lawbid-e2e.test` })
      .expect(400);
    // A plain moderator is not a manager: the section does not exist for them.
    const mod = await adminSession(base, prisma, 'moderator');
    await api()
      .post('/api/v1/admin/admins/invites')
      .set(mod.auth)
      .send(body)
      .expect(404);
    await api().get('/api/v1/admin/admins/presets').set(mod.auth).expect(404);
  });

  it('a manager (deputy) cannot hand out money, the audit log or the no-PII flag', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    const deputy = await adminSession(base, prisma, 'support', undefined, {
      users: 'manage',
      support: 'manage',
      manage_admins: true,
    });
    const target = await adminSession(base, prisma, 'support');
    for (const perms of [{ money: 'view' }, { audit: 'view' }]) {
      await api()
        .patch(`/api/v1/admin/admins/${target.userId}/permissions`)
        .set(deputy.auth)
        .send({ permissions: perms })
        .expect(403);
    }
    await api()
      .patch(`/api/v1/admin/admins/${target.userId}/permissions`)
      .set(deputy.auth)
      .send({ permissions: { support: 'view' }, noPii: true })
      .expect(403);
    // The owner can.
    await api()
      .patch(`/api/v1/admin/admins/${target.userId}/permissions`)
      .set(owner.auth)
      .send({ permissions: { support: 'view', money: 'view' }, noPii: true })
      .expect(200);
  });

  it('keys and admin management stay 404 for every preset', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    await stepUp(owner);
    for (const preset of ['moderator', 'support', 'viewer']) {
      const a = await invite(
        owner,
        { email: `${preset}-${tag}@lawbid-e2e.test`, preset },
        `${preset}.${tag}`,
      );
      for (const path of [
        '/api/v1/admin/integrations',
        '/api/v1/admin/admins',
        '/api/v1/admin/sessions',
      ]) {
        await api().get(path).set(a.auth).expect(404);
      }
    }
  });

  it('the audit log opens by toggle and then shows everybody’s rows', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    await stepUp(owner);
    const mod = await invite(
      owner,
      { email: `aud-${tag}@lawbid-e2e.test`, preset: 'moderator' },
      `aud.${tag}`,
    );
    await api().get('/api/v1/admin/audit-log').set(mod.auth).expect(404);
    await api()
      .patch(`/api/v1/admin/admins/${mod.admin.id}/permissions`)
      .set(owner.auth)
      .send({ permissions: { ...mod.admin.permissions, audit: 'view' } })
      .expect(200);
    const log = await api()
      .get('/api/v1/admin/audit-log')
      .query({ action: 'admins.', limit: 50 })
      .set(mod.auth)
      .expect(200);
    const rows = (log.body.data.items ?? log.body.data) as {
      adminId: string;
    }[];
    // Rows written by the owner (not the viewer) are visible.
    expect(rows.some((r) => r.adminId === owner.userId)).toBe(true);
  });
});

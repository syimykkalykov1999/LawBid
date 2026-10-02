import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { AdminAuthService } from '../src/modules/admin-auth/admin-auth.service';
import { adminSession, adminSignIn } from './support/admin-login';

jest.setTimeout(60_000);

interface Body {
  data: Record<string, unknown>;
  meta?: { nextCursor: string | null };
  error?: { code: string; details?: Record<string, unknown> };
}

/**
 * docs/06 stage 6.2 acceptance: "токен мобильного приложения не работает
 * на /admin/* и наоборот; роль без права получает 403; каждое действие
 * есть в audit_log". Owner 2026-10-02: login + password (or the emailed
 * code) signs in on its own, two-factor is optional (an admin who turned
 * it on is asked for the code), access works by per-area toggles, and an
 * admin the super admin allowed can manage other admins within their own
 * access.
 */
describe('stage 6.2 — admin auth, RBAC, audit, admins, dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tokens: TokenService;
  let baseUrl = '';
  const api = () => request(baseUrl);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app as NestExpressApplication);
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port.port}`;
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const mobileToken = (sub: string, role: string) =>
    `Bearer ${tokens.signAccessToken({
      sub,
      role,
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`;

  const actions = async (adminId: string) =>
    (
      await prisma.auditLog.findMany({
        where: { admin_id: adminId },
        orderBy: { created_at: 'asc' },
      })
    ).map((r) => r.action);

  const startAndVerify = async (email: string) => {
    await api()
      .post('/api/v1/admin/auth/login/start')
      .send({ email })
      .expect(204);
    const v = await api()
      .post('/api/v1/admin/auth/login/verify')
      .send({ email, code: '000000' })
      .expect(200);
    return (v.body as Body).data as {
      ticket: string | null;
      session: { accessToken: string } | null;
    };
  };

  it('signs in with the email code, turns two-factor on, then needs the authenticator; every step is audited', async () => {
    const s = await adminSession(baseUrl, prisma, 'moderator');
    expect(s.recoveryCodes).toHaveLength(10);
    expect(s.recoveryCodes[0]).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);

    const me = await api().get('/api/v1/admin/auth/me').set(s.auth).expect(200);
    expect((me.body as Body).data).toMatchObject({
      email: s.email,
      role: 'moderator',
      totpEnabled: true,
    });

    // The email code is single-use.
    const reuse = await api()
      .post('/api/v1/admin/auth/login/verify')
      .send({ email: s.email, code: '000000' })
      .expect(401);
    expect((reuse.body as Body).error?.code).toBe('AUTH_OTP_EXPIRED');

    // Second sign-in: two-factor is on now, so a ticket instead of a session.
    const second = await startAndVerify(s.email);
    expect(second.ticket).toEqual(expect.any(String));
    expect(second.session).toBeNull();
    const again = await adminSignIn(baseUrl, s.email, s.totpSecret);
    await api().get('/api/v1/admin/dashboard').set(again.auth).expect(200);

    expect(await actions(s.userId)).toEqual([
      'admin.login',
      'admin.totp_enrolled',
      'admin.login',
    ]);
  });

  it('refuses a mobile token on /admin/* and an admin token on the mobile API', async () => {
    const s = await adminSession(baseUrl, prisma, 'super_admin');
    const asMobile = await api()
      .get('/api/v1/admin/dashboard')
      .set('Authorization', mobileToken(s.userId, 'admin'))
      .expect(401);
    expect((asMobile.body as Body).error?.code).toBe('UNAUTHORIZED');
    const asAdmin = await api().get('/api/v1/users/me').set(s.auth).expect(401);
    expect((asAdmin.body as Body).error?.code).toBe('UNAUTHORIZED');
    await api().get('/api/v1/admin/dashboard').expect(401);
  });

  it('with two-factor on, the first factor opens nothing: wrong TOTP burns the ticket after 5 tries', async () => {
    const s = await adminSession(baseUrl, prisma, 'support');
    const before = await actions(s.userId);
    const { ticket } = await startAndVerify(s.email);
    expect(ticket).toEqual(expect.any(String));
    const secret = s.totpSecret;

    // The ticket is not a session.
    await api()
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${ticket}`)
      .expect(401);

    const wrong = totpCode(secret) === '000000' ? '111111' : '000000';
    for (let i = 1; i <= 4; i++) {
      const r = await api()
        .post('/api/v1/admin/auth/totp')
        .send({ ticket, code: wrong })
        .expect(401);
      expect((r.body as Body).error?.code).toBe('ADMIN_TOTP_INVALID');
      expect((r.body as Body).error?.details?.remainingAttempts).toBe(5 - i);
    }
    const burned = await api()
      .post('/api/v1/admin/auth/totp')
      .send({ ticket, code: wrong })
      .expect(401);
    expect((burned.body as Body).error?.code).toBe('ADMIN_TICKET_INVALID');
    // Even the right code is refused now.
    await api()
      .post('/api/v1/admin/auth/totp')
      .send({ ticket, code: totpCode(secret, Date.now() + 30_000) })
      .expect(401);
    expect(await actions(s.userId)).toEqual(before);
  });

  it('two-factor is optional: login + password signs in at once, and only an admin who turned it on gets a ticket', async () => {
    const s = await adminSession(baseUrl, prisma, 'support');
    const root = await adminSession(baseUrl, prisma, 'super_admin');
    const svc = app.get(AdminAuthService);
    const login = `opt.${randomUUID().slice(0, 6)}`;
    await svc.setCredentialsFor(
      {
        id: root.userId,
        adminRole: 'super_admin',
        ip: null,
        sessionId: 'x',
        justification: null,
      },
      s.userId,
      { login, password: 'Strong-pass-2026!' },
    );
    // Turn two-factor off again (the helper enrolled it) → straight session.
    await prisma.adminCredential.update({
      where: { user_id: s.userId },
      data: { totp_enabled_at: null, recovery_codes_hash: [] },
    });
    const plain = await api()
      .post('/api/v1/admin/auth/login/password')
      .send({ login, password: 'Strong-pass-2026!' })
      .expect(200);
    const d = (plain.body as Body).data as {
      ticket: string | null;
      session: { accessToken: string; admin: { totpEnabled: boolean } } | null;
    };
    expect(d.ticket).toBeNull();
    expect(d.session?.admin.totpEnabled).toBe(false);
    const auth = { Authorization: `Bearer ${d.session!.accessToken}` };
    await api().get('/api/v1/admin/dashboard').set(auth).expect(200);

    const wrong = await api()
      .post('/api/v1/admin/auth/login/password')
      .send({ login, password: 'Wrong-pass-2026!' })
      .expect(401);
    expect((wrong.body as Body).error?.code).toBe('ADMIN_CREDENTIALS_INVALID');

    // Turn it on in the profile: the next sign-in needs the code.
    const begin = await api()
      .post('/api/v1/admin/auth/2fa/begin')
      .set(auth)
      .expect(200);
    const secret = (begin.body as { data: { secret: string } }).data.secret;
    await api()
      .post('/api/v1/admin/auth/2fa/enable')
      .set(auth)
      .send({ code: totpCode(secret) })
      .expect(200);
    const guarded = await api()
      .post('/api/v1/admin/auth/login/password')
      .send({ login, password: 'Strong-pass-2026!' })
      .expect(200);
    const g = (guarded.body as Body).data as {
      ticket: string | null;
      session: unknown;
    };
    expect(g.ticket).toEqual(expect.any(String));
    expect(g.session).toBeNull();
    const done = await api()
      .post('/api/v1/admin/auth/totp')
      .send({ ticket: g.ticket, code: totpCode(secret, Date.now() + 30_000) })
      .expect(200);
    expect(
      (done.body as { data: { accessToken: string } }).data.accessToken,
    ).toEqual(expect.any(String));

    // …and off again with a current code.
    await api()
      .post('/api/v1/admin/auth/2fa/disable')
      .set(auth)
      .send({ code: totpCode(secret, Date.now() - 30_000) })
      .expect(200);
    const me = await api().get('/api/v1/admin/auth/me').set(auth).expect(200);
    expect((me.body as Body).data).toMatchObject({ totpEnabled: false });
  });

  it('only the super admin changes their own login and password', async () => {
    const mod = await adminSession(baseUrl, prisma, 'moderator');
    await api()
      .put('/api/v1/admin/auth/me/credentials')
      .set(mod.auth)
      .send({ newPassword: 'Another-pass-2026!' })
      .expect(403);
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    const login = `boss.${randomUUID().slice(0, 6)}`;
    await api()
      .put('/api/v1/admin/auth/me/credentials')
      .set(sup.auth)
      .send({ newLogin: login, newPassword: 'Strong-pass-2026!' })
      .expect(200);
    await api()
      .post('/api/v1/admin/auth/login/password')
      .send({ login, password: 'Strong-pass-2026!' })
      .expect(200);
  });

  it('an admin the super admin allowed manages other admins, only within their own access', async () => {
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    const email = `mgr-${randomUUID().slice(0, 8)}@lawbid-e2e.test`;
    const created = await api()
      .post('/api/v1/admin/admins')
      .set(sup.auth)
      .send({
        email,
        role: 'support',
        permissions: { users: 'manage', support: 'view' },
        canManageAdmins: true,
      })
      .expect(201);
    const mgrId = (created.body as Body).data.id as string;
    expect((created.body as Body).data).toMatchObject({
      canManageAdmins: true,
    });
    const mgr = await adminSession(baseUrl, prisma, 'support', {
      userId: mgrId,
      email,
    });
    // An admin without the right cannot even list admins.
    const plain = await adminSession(baseUrl, prisma, 'support');
    await api().get('/api/v1/admin/admins').set(plain.auth).expect(403);
    await api().get('/api/v1/admin/admins').set(mgr.auth).expect(200);

    // Creates inside their own access…
    const staffEmail = `staff-${randomUUID().slice(0, 8)}@lawbid-e2e.test`;
    const staff = await api()
      .post('/api/v1/admin/admins')
      .set(mgr.auth)
      .send({
        email: staffEmail,
        role: 'support',
        permissions: { users: 'view' },
      })
      .expect(201);
    const staffId = (staff.body as Body).data.id as string;
    // …but never more, a super admin, or the manager right.
    const beyond = [
      {
        email: `b1-${randomUUID().slice(0, 6)}@lawbid-e2e.test`,
        role: 'support',
        permissions: { cases: 'view' },
      },
      {
        email: `b2-${randomUUID().slice(0, 6)}@lawbid-e2e.test`,
        role: 'support',
        permissions: { support: 'manage' },
      },
      {
        email: `b3-${randomUUID().slice(0, 6)}@lawbid-e2e.test`,
        role: 'super_admin',
      },
      {
        email: `b4-${randomUUID().slice(0, 6)}@lawbid-e2e.test`,
        role: 'support',
        canManageAdmins: true,
      },
    ];
    for (const body of beyond) {
      await api()
        .post('/api/v1/admin/admins')
        .set(mgr.auth)
        .send(body)
        .expect(403);
    }

    // Toggles: only what they hold; the manager right and roles stay with the super admin.
    await api()
      .patch(`/api/v1/admin/admins/${staffId}/permissions`)
      .set(mgr.auth)
      .send({ permissions: { users: 'manage', support: 'view' } })
      .expect(200);
    await api()
      .patch(`/api/v1/admin/admins/${staffId}/permissions`)
      .set(mgr.auth)
      .send({ permissions: { cases: 'manage' } })
      .expect(403);
    await api()
      .patch(`/api/v1/admin/admins/${staffId}/permissions`)
      .set(mgr.auth)
      .send({ permissions: {}, canManageAdmins: true })
      .expect(403);
    await api()
      .patch(`/api/v1/admin/admins/${staffId}/role`)
      .set(mgr.auth)
      .send({ role: 'moderator' })
      .expect(403);

    // They cannot touch the super admin, themselves, or another manager.
    await api()
      .post(`/api/v1/admin/admins/${sup.userId}/disable`)
      .set(mgr.auth)
      .expect(403);
    await api()
      .delete(`/api/v1/admin/admins/${mgrId}`)
      .set(mgr.auth)
      .expect(403);
    await api()
      .patch(`/api/v1/admin/admins/${sup.userId}/permissions`)
      .set(mgr.auth)
      .send({ permissions: {} })
      .expect(403);

    // Money, keys, audit log and sessions stay closed whatever else they hold.
    for (const path of [
      '/api/v1/admin/billing/payments',
      '/api/v1/admin/integrations',
      '/api/v1/admin/audit-log',
      '/api/v1/admin/sessions',
    ]) {
      const r = await api().get(path).set(mgr.auth);
      expect(`${path} ${r.status}`).toBe(`${path} 403`);
    }

    // They set the new colleague's login and password (fresh confirmation first).
    const colleagueLogin = `staff.${randomUUID().slice(0, 6)}`;
    await api()
      .put(`/api/v1/admin/admins/${staffId}/credentials`)
      .set(mgr.auth)
      .send({ login: colleagueLogin, password: 'Strong-pass-2026!' })
      .expect(403);
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(mgr.auth)
      .send({ code: totpCode(mgr.totpSecret, Date.now() - 30_000) })
      .expect(200);
    await api()
      .put(`/api/v1/admin/admins/${staffId}/credentials`)
      .set(mgr.auth)
      .send({ login: colleagueLogin, password: 'Strong-pass-2026!' })
      .expect(200);
    await api()
      .post('/api/v1/admin/auth/login/password')
      .send({ login: colleagueLogin, password: 'Strong-pass-2026!' })
      .expect(200);

    // They remove the colleague: the account is closed and the login is dead.
    await api()
      .delete(`/api/v1/admin/admins/${staffId}`)
      .set(mgr.auth)
      .expect(204);
    await api()
      .post('/api/v1/admin/auth/login/password')
      .send({ login: colleagueLogin, password: 'Strong-pass-2026!' })
      .expect(401);
    const list = await api()
      .get('/api/v1/admin/admins')
      .set(sup.auth)
      .expect(200);
    const ids = (
      (list.body as Body).data as unknown as Array<{ id: string }>
    ).map((r) => r.id);
    expect(ids).not.toContain(staffId);
  });

  it('does not reveal whether an email is an admin (login/start always 204)', async () => {
    await api()
      .post('/api/v1/admin/auth/login/start')
      .send({ email: `nobody-${randomUUID().slice(0, 6)}@lawbid-e2e.test` })
      .expect(204);
    const client = await prisma.user.create({
      data: {
        role: 'client',
        email: `client-${randomUUID().slice(0, 6)}@lawbid-e2e.test`,
      },
    });
    await api()
      .post('/api/v1/admin/auth/login/start')
      .send({ email: client.email })
      .expect(204);
    const r = await api()
      .post('/api/v1/admin/auth/login/verify')
      .send({ email: client.email, code: '000000' })
      .expect(401);
    expect((r.body as Body).error?.code).toBe('AUTH_OTP_INVALID');
  });

  it('recovery code signs in once, then is spent', async () => {
    const s = await adminSession(baseUrl, prisma, 'finance');
    const code = s.recoveryCodes[3];
    const ok = await api()
      .post('/api/v1/admin/auth/recovery')
      .send({
        ticket: (await startAndVerify(s.email)).ticket,
        recoveryCode: code.toLowerCase(),
      })
      .expect(200);
    expect((ok.body as Body).data.recoveryCodes).toBeUndefined();
    const reused = await api()
      .post('/api/v1/admin/auth/recovery')
      .send({
        ticket: (await startAndVerify(s.email)).ticket,
        recoveryCode: code,
      })
      .expect(401);
    expect((reused.body as Body).error?.code).toBe(
      'ADMIN_RECOVERY_CODE_INVALID',
    );
    expect(await actions(s.userId)).toContain('admin.recovery_code_used');
    const cred = await prisma.adminCredential.findUniqueOrThrow({
      where: { user_id: s.userId },
    });
    expect(cred.recovery_codes_hash).toHaveLength(9);
  });

  it('applies the §2.2 matrix server-side (403 for a role without the right)', async () => {
    const moderator = await adminSession(baseUrl, prisma, 'moderator');
    const finance = await adminSession(baseUrl, prisma, 'finance');
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    const cells: Array<[string, Record<string, string>, number]> = [
      ['/api/v1/admin/dashboard', moderator.auth, 200],
      ['/api/v1/admin/dashboard', finance.auth, 200],
      ['/api/v1/admin/admins', moderator.auth, 403],
      ['/api/v1/admin/admins', finance.auth, 403],
      ['/api/v1/admin/admins', sup.auth, 200],
      ['/api/v1/admin/verification/requests', moderator.auth, 403],
      ['/api/v1/admin/verification/requests', sup.auth, 200],
      ['/api/v1/admin/i18n/export?lang=en', moderator.auth, 403],
      ['/api/v1/admin/audit-log', finance.auth, 403],
      ['/api/v1/admin/audit-log', sup.auth, 200],
      ['/api/v1/admin/billing/payments', finance.auth, 403],
    ];
    for (const [path, auth, status] of cells) {
      const r = await api().get(path).set(auth);
      expect(`${path} ${r.status}`).toBe(`${path} ${status}`);
    }
  });

  it('super_admin manages administrators; each action is in audit_log with before/after; disabling ends sessions', async () => {
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    const email = `new-${randomUUID().slice(0, 8)}@lawbid-e2e.test`;
    const created = await api()
      .post('/api/v1/admin/admins')
      .set(sup.auth)
      .send({ email, role: 'verifier' })
      .expect(201);
    const id = (created.body as Body).data.id as string;
    expect((created.body as Body).data).toMatchObject({
      email,
      role: 'verifier',
      status: 'active',
      totpEnabled: false,
    });
    const dup = await api()
      .post('/api/v1/admin/admins')
      .set(sup.auth)
      .send({ email, role: 'support' })
      .expect(409);
    expect((dup.body as Body).error?.code).toBe('ADMIN_EMAIL_TAKEN');

    // The new admin signs in (enrolls TOTP) and can use its role.
    const fresh = await adminSession(baseUrl, prisma, 'verifier', {
      userId: id,
      email,
    });
    await api()
      .get('/api/v1/admin/verification/requests')
      .set(fresh.auth)
      .expect(200);

    // Role change → sessions revoked; new role applies on the next sign-in.
    await api()
      .patch(`/api/v1/admin/admins/${id}/role`)
      .set(sup.auth)
      .send({ role: 'support' })
      .expect(200);
    const revoked = await api()
      .get('/api/v1/admin/dashboard')
      .set(fresh.auth)
      .expect(401);
    expect((revoked.body as Body).error?.code).toBe('AUTH_SESSION_REVOKED');
    // The role is a label: access follows the per-area toggles, so the
    // verification toggle still opens the queue…
    const relogin = await adminSignIn(baseUrl, email, fresh.totpSecret);
    await api()
      .get('/api/v1/admin/verification/requests')
      .set(relogin.auth)
      .expect(200);
    // …and taking the toggle away applies at once, on the live session.
    await api()
      .patch(`/api/v1/admin/admins/${id}/permissions`)
      .set(sup.auth)
      .send({ permissions: { dashboard: 'view' } })
      .expect(200);
    await api()
      .get('/api/v1/admin/verification/requests')
      .set(relogin.auth)
      .expect(403);

    // Disable → 401 on the live session; sign-in impossible; enable restores.
    await api()
      .post(`/api/v1/admin/admins/${id}/disable`)
      .set(sup.auth)
      .expect(200);
    await api().get('/api/v1/admin/dashboard').set(relogin.auth).expect(401);
    await api()
      .post('/api/v1/admin/auth/login/start')
      .send({ email })
      .expect(204);
    await api()
      .post('/api/v1/admin/auth/login/verify')
      .send({ email, code: '000000' })
      .expect(401);
    await api()
      .post(`/api/v1/admin/admins/${id}/enable`)
      .set(sup.auth)
      .expect(200);

    // Reset 2FA → next sign-in enrolls again (new secret, new codes).
    await api()
      .post(`/api/v1/admin/admins/${id}/reset-2fa`)
      .set(sup.auth)
      .expect(200);
    const reenrolled = await adminSession(baseUrl, prisma, 'support', {
      userId: id,
      email,
    });
    expect(reenrolled.totpSecret).not.toBe(fresh.totpSecret);
    expect(reenrolled.recoveryCodes).toHaveLength(10);

    // Self-protection.
    await api()
      .post(`/api/v1/admin/admins/${sup.userId}/disable`)
      .set(sup.auth)
      .expect(403);

    const rows = await prisma.auditLog.findMany({
      where: { admin_id: sup.userId, action: { startsWith: 'admins.' } },
      orderBy: { created_at: 'asc' },
    });
    expect(rows.map((r) => r.action)).toEqual([
      'admins.create',
      'admins.set_role',
      'admins.set_permissions',
      'admins.disable',
      'admins.enable',
      'admins.reset_2fa',
    ]);
    expect(rows[1]).toMatchObject({
      target_id: id,
      before: { role: 'verifier' },
      after: { role: 'support' },
    });
    expect(rows[3].ip).toBeTruthy();
  });

  it('auto-audits mutating admin requests, failed ones with outcome=failed (security review); logout: a row', async () => {
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    await api()
      .post('/api/v1/admin/i18n/import?mode=dry-run')
      .set(sup.auth)
      .expect(400);
    const rejected = await prisma.auditLog.findFirst({
      where: { admin_id: sup.userId, action: 'admin.post admin/i18n/import' },
    });
    expect(rejected?.after).toEqual({ outcome: 'failed', status: 400 });
    await api().post('/api/v1/admin/auth/logout').set(sup.auth).expect(200);
    await api().get('/api/v1/admin/auth/me').set(sup.auth).expect(401);
    expect(await actions(sup.userId)).toContain('admin.logout');
  });

  it('dashboard returns every §2.3.1 number and is cached for the team', async () => {
    await redis.del('adm:dashboard');
    const s = await adminSession(baseUrl, prisma, 'support');
    const r = await api()
      .get('/api/v1/admin/dashboard')
      .set(s.auth)
      .expect(200);
    const d = (r.body as Body).data;
    expect(d.newUsers).toEqual({
      clients24h: expect.any(Number),
      attorneys24h: expect.any(Number),
      clients7d: expect.any(Number),
      attorneys7d: expect.any(Number),
    });
    expect(d.verification).toMatchObject({ queueSize: expect.any(Number) });
    // Money is closed for everyone but the super admin: no revenue figure.
    expect(d.subscriptions).toMatchObject({
      trialing: expect.any(Number),
      active: expect.any(Number),
      pastDue: expect.any(Number),
      revenueEstimateUsd: null,
    });
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    const full = await api()
      .get('/api/v1/admin/dashboard')
      .set(sup.auth)
      .expect(200);
    expect(
      ((full.body as Body).data.subscriptions as Record<string, unknown>)
        .revenueEstimateUsd,
    ).toEqual(expect.any(Number));
    for (const k of [
      'openCases',
      'bids24h',
      'openReports',
      'openDisputes',
      'openContactIssues',
    ]) {
      expect(typeof d[k]).toBe('number');
    }
    const again = await api()
      .get('/api/v1/admin/dashboard')
      .set(s.auth)
      .expect(200);
    expect((again.body as Body).data.computedAt).toBe(d.computedAt);
    expect(await redis.ttl('adm:dashboard')).toBeGreaterThan(0);
  });

  it('audit log: only the super admin reads it (filters, paging); other admins get 403', async () => {
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    const mod = await adminSession(baseUrl, prisma, 'moderator');
    await api()
      .get(`/api/v1/admin/audit-log?adminId=${sup.userId}`)
      .set(mod.auth)
      .expect(403);

    const all = await api()
      .get(
        `/api/v1/admin/audit-log?adminId=${mod.userId}&action=admin.&limit=1`,
      )
      .set(sup.auth)
      .expect(200);
    const page = all.body as {
      data: Array<{ id: string; adminId: string; adminEmail: string }>;
      meta: { nextCursor: string | null };
    };
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toMatchObject({
      adminId: mod.userId,
      adminEmail: mod.email,
    });
    expect(page.meta.nextCursor).toEqual(expect.any(String));
    const next = await api()
      .get(
        `/api/v1/admin/audit-log?adminId=${mod.userId}&cursor=${encodeURIComponent(page.meta.nextCursor!)}`,
      )
      .set(sup.auth)
      .expect(200);
    const nextIds = (next.body as { data: Array<{ id: string }> }).data.map(
      (r) => r.id,
    );
    expect(nextIds).not.toContain(page.data[0].id);
    await api()
      .get('/api/v1/admin/audit-log?cursor=garbage')
      .set(sup.auth)
      .expect(400);
  });

  it('idle timeout: a session whose Redis key expired is refused', async () => {
    const s = await adminSession(baseUrl, prisma, 'support');
    const keys = await redis.keys('adm:sess:*');
    for (const k of keys) {
      if ((await redis.type(k)) !== 'string') continue;
      if ((await redis.get(k)) === s.userId) await redis.del(k);
    }
    const r = await api().get('/api/v1/admin/auth/me').set(s.auth).expect(401);
    expect((r.body as Body).error?.code).toBe('AUTH_SESSION_REVOKED');
  });
});

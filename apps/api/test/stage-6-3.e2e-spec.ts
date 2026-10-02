import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminSession, OPS_RIGHTS } from './support/admin-login';

jest.setTimeout(90_000);

interface Body {
  data: Record<string, unknown>;
  error?: { code: string; details?: Record<string, unknown> };
}

/**
 * docs/06 stage 6.3 acceptance (users part): search, card, contacts need
 * a reason and are audited, revoke sessions, warn, suspend / restore per
 * §3.4 (sessions revoked, client open cases archived + bids rejected,
 * attorney profile suspended + bids withdrawn), §2.2 matrix.
 */
describe('stage 6.3 — admin users and sanctions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl = '';
  let practiceAreaId = '';
  const api = () => request(baseUrl);
  let phoneSeq = 1000 + Math.floor(Math.random() * 8000);
  const nextPhone = () => `+1202599${phoneSeq++}`;

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
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_admin_users_leaf' },
      create: {
        code: 'e2e_admin_users_leaf',
        name_en: 'E2E admin users',
        i18n_key: 'practice.e2e_admin_users_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
  });

  afterAll(async () => {
    await app.close();
  });

  /** A real mobile session (OTP) so revocation is observable. */
  async function signIn(phone: string): Promise<Record<string, string>> {
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
        deviceInfo: { deviceId: 'admin-users-e2e', deviceName: 'Pixel 8' },
      })
      .expect(201);
    return {
      Authorization: `Bearer ${(res.body as { data: { accessToken: string } }).data.accessToken}`,
    };
  }

  async function client(opts: { first?: string; last?: string } = {}) {
    const phone = nextPhone();
    const auth = await signIn(phone);
    const me = await api().get('/api/v1/users/me').set(auth).expect(200);
    const id = (me.body as Body).data.id as string;
    await prisma.user.update({
      where: { id },
      data: {
        role: 'client',
        first_name: opts.first ?? 'Casey',
        last_name: opts.last ?? `Client${phone.slice(-4)}`,
        email: `casey-${phone.slice(-4)}@lawbid-e2e.test`,
        client_profile: {
          create: { state_code: 'NJ', preferred_languages: ['en'] },
        },
      },
    });
    return { id, auth, phone };
  }

  async function attorney(username = `att_${randomUUID().slice(0, 8)}`) {
    const u = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: 'Avery',
        last_name: 'Attorney',
        attorney_profile: {
          create: {
            username,
            username_lower: username.toLowerCase(),
            languages: ['en'],
            verification_status: 'verified',
            verified_at: new Date(),
          },
        },
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: 'NJ',
        bar_number: `NJ-${randomUUID()}`,
        license_status: 'verified',
      },
    });
    return u;
  }

  async function kase(
    clientId: string,
    status: 'open' | 'in_progress' = 'open',
  ) {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: `Ticket ${randomUUID().slice(0, 6)}`,
        description: 'Got a ticket on the turnpike last week driving home.',
        practice_area_id: practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status,
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    return c.id;
  }

  async function bid(caseId: string, attorneyId: string) {
    return prisma.bid.create({
      data: {
        case_id: caseId,
        attorney_id: attorneyId,
        fee_type: 'fixed',
        amount_cents: 60_000,
        message: 'Happy to help.',
        start_availability: 'immediately',
        turn: 'client',
      },
    });
  }

  it('searches by name, email, phone, @username and id; filters; matrix', async () => {
    const support = await adminSession(baseUrl, prisma, 'support');
    // No users toggle at all: the area is closed.
    const verifier = await adminSession(
      baseUrl,
      prisma,
      'verifier',
      undefined,
      {
        verification: 'manage',
      },
    );
    const c = await client({ first: 'Zelda', last: 'Searchable' });
    const a = await attorney('zelda_esq');

    const ids = (r: request.Response) =>
      (r.body as { data: Array<{ id: string }> }).data.map((x) => x.id);

    const byName = await api()
      .get('/api/v1/admin/users?q=zelda%20sear')
      .set(support.auth)
      .expect(200);
    expect(ids(byName)).toEqual([c.id]);
    const byEmail = await api()
      .get(
        `/api/v1/admin/users?q=${encodeURIComponent(`CASEY-${c.phone.slice(-4)}@lawbid-e2e.test`)}`,
      )
      .set(support.auth)
      .expect(200);
    expect(ids(byEmail)).toEqual([c.id]);
    const byPhone = await api()
      .get(
        `/api/v1/admin/users?q=${encodeURIComponent(`(202) 599-${c.phone.slice(-4)}`)}`,
      )
      .set(support.auth)
      .expect(200);
    expect(ids(byPhone)).toEqual([c.id]);
    const byUsername = await api()
      .get('/api/v1/admin/users?q=%40Zelda_')
      .set(support.auth)
      .expect(200);
    expect(
      (byUsername.body as { data: Array<{ id: string; username: string }> })
        .data,
    ).toEqual([expect.objectContaining({ id: a.id, username: 'zelda_esq' })]);
    const byIdWrongRole = await api()
      .get(`/api/v1/admin/users?q=${a.id}&role=client`)
      .set(support.auth)
      .expect(200);
    expect(ids(byIdWrongRole)).toEqual([]);
    const byId = await api()
      .get(`/api/v1/admin/users?q=${a.id}&role=attorney&status=active`)
      .set(support.auth)
      .expect(200);
    expect(ids(byId)).toEqual([a.id]);

    await api()
      .get('/api/v1/admin/users?q=zelda')
      .set(verifier.auth)
      .expect(403);
    await api().get('/api/v1/admin/users?q=zelda').set(c.auth).expect(401);
  });

  it('card shows profile, sessions, cases/bids and subscription; contacts need a reason and are audited', async () => {
    const support = await adminSession(baseUrl, prisma, 'support');
    const c = await client();
    const a = await attorney();
    const caseId = await kase(c.id);
    await bid(caseId, a.id);
    await prisma.subscription.create({
      data: { user_id: a.id, status: 'active', price_cents: 39_900 },
    });

    const card = await api()
      .get(`/api/v1/admin/users/${c.id}`)
      .set(support.auth)
      .expect(200);
    const d = (card.body as Body).data;
    expect(d).toMatchObject({
      id: c.id,
      role: 'client',
      status: 'active',
      hasEmail: true,
      hasPhone: true,
      client: { stateCode: 'NJ' },
      attorney: null,
    });
    expect(d.sessions).toEqual([
      expect.objectContaining({ deviceName: 'Pixel 8' }),
    ]);
    expect((d.cases as Array<{ id: string }>).map((x) => x.id)).toEqual([
      caseId,
    ]);
    expect(JSON.stringify(d)).not.toContain(c.phone);

    const acard = await api()
      .get(`/api/v1/admin/users/${a.id}`)
      .set(support.auth)
      .expect(200);
    const ad = (acard.body as Body).data;
    expect(ad.attorney).toMatchObject({
      verificationStatus: 'verified',
      licenses: ['NJ:verified'],
      subscription: { status: 'active' },
    });
    expect((ad.bids as Array<{ caseId: string }>)[0].caseId).toBe(caseId);

    const noReason = await api()
      .get(`/api/v1/admin/users/${c.id}/contacts`)
      .set(support.auth)
      .expect(400);
    expect((noReason.body as Body).error?.code).toBe('JUSTIFICATION_REQUIRED');
    const contacts = await api()
      .get(`/api/v1/admin/users/${c.id}/contacts`)
      .set(support.auth)
      .set('X-Justification', 'Support ticket #4711: user asks to change phone')
      .expect(200);
    expect((contacts.body as Body).data).toMatchObject({ phone: c.phone });
    const audit = await prisma.auditLog.findFirst({
      where: { admin_id: support.userId, target_id: c.id },
      orderBy: { created_at: 'desc' },
    });
    expect(audit).toMatchObject({
      action: 'admin.get admin/users/:id/contacts',
      target_type: 'users',
      justification: 'Support ticket #4711: user asks to change phone',
    });
    await api()
      .get(`/api/v1/admin/users/${randomUUID()}`)
      .set(support.auth)
      .expect(404);
  });

  it('only an admin with users:manage revokes sessions and warns (moderation_notice)', async () => {
    const support = await adminSession(baseUrl, prisma, 'support'); // users: view
    const moderator = await adminSession(
      baseUrl,
      prisma,
      'moderator',
      undefined,
      OPS_RIGHTS,
    );
    const c = await client();
    await api().get('/api/v1/users/me').set(c.auth).expect(200);
    await api()
      .post(`/api/v1/admin/users/${c.id}/sessions/revoke`)
      .set(support.auth)
      .expect(403);
    const r = await api()
      .post(`/api/v1/admin/users/${c.id}/sessions/revoke`)
      .set(moderator.auth)
      .expect(200);
    expect((r.body as Body).data).toMatchObject({ revokedSessions: 1 });
    const dead = await api().get('/api/v1/users/me').set(c.auth).expect(401);
    expect((dead.body as Body).error?.code).toBe('AUTH_SESSION_REVOKED');

    await api()
      .post(`/api/v1/admin/users/${c.id}/warn`)
      .set(support.auth)
      .send({ reason: 'Spam in bids' })
      .expect(403);
    await api()
      .post(`/api/v1/admin/users/${c.id}/warn`)
      .set(moderator.auth)
      .send({ reason: 'Rude messages to attorneys' })
      .expect(200);
    const notice = await prisma.notification.findFirst({
      where: { user_id: c.id, type: 'moderation_notice' },
    });
    expect(notice).toBeTruthy();
    expect(JSON.stringify(notice?.payload)).not.toContain('Rude');
    expect(
      await prisma.moderationAction.count({
        where: { target_type: 'user', target_id: c.id, action: 'warn' },
      }),
    ).toBe(1);
    const card = await api()
      .get(`/api/v1/admin/users/${c.id}`)
      .set(moderator.auth)
      .expect(200);
    expect((card.body as Body).data.warnings).toBe(1);
    expect(
      (
        await prisma.auditLog.findMany({
          where: { target_id: c.id, action: { startsWith: 'users.' } },
          orderBy: { created_at: 'asc' },
        })
      ).map((x) => x.action),
    ).toEqual(['users.sessions_revoked', 'users.warn']);
  });

  it('changes the phone on request: old number out, sessions signed out, user told, audited', async () => {
    const moderator = await adminSession(baseUrl, prisma, 'moderator');
    const boss = await adminSession(baseUrl, prisma, 'super_admin');
    const c = await client();
    const other = await client();
    const fresh = nextPhone();
    // Only a super admin; the number must be free; a reason is required.
    await api()
      .post(`/api/v1/admin/users/${c.id}/phone`)
      .set(moderator.auth)
      .send({ phone: fresh, reason: 'Lost phone, ID checked' })
      .expect(403);
    await api()
      .post(`/api/v1/admin/users/${c.id}/phone`)
      .set(boss.auth)
      .send({ phone: other.phone, reason: 'x' })
      .expect(409);
    await api()
      .post(`/api/v1/admin/users/${c.id}/phone`)
      .set(boss.auth)
      .send({ phone: fresh })
      .expect(400);
    const r = await api()
      .post(`/api/v1/admin/users/${c.id}/phone`)
      .set(boss.auth)
      .send({ phone: fresh, reason: 'Lost phone, ID checked' })
      .expect(200);
    expect((r.body as Body).data).toMatchObject({
      phone: fresh,
      revokedSessions: 1,
    });
    await api().get('/api/v1/users/me').set(c.auth).expect(401);
    // The new number signs in to the same account; the old one doesn't.
    const again = await signIn(fresh);
    const me = await api().get('/api/v1/users/me').set(again).expect(200);
    expect((me.body as Body).data.id).toBe(c.id);
    expect(
      await prisma.userIdentifier.count({
        where: { provider: 'phone', provider_uid: c.phone },
      }),
    ).toBe(0);
    expect(
      await prisma.notification.count({
        where: { user_id: c.id, type: 'security_phone_changed' },
      }),
    ).toBe(1);
    const log = await prisma.auditLog.findFirst({
      where: { target_id: c.id, action: 'users.phone_changed' },
    });
    expect(JSON.stringify(log?.after)).toContain('Lost phone');
    expect(JSON.stringify(log)).not.toContain(fresh);
  });

  it('suspends a client per §3.4: sessions revoked, login blocked, open cases archived + bids rejected, in_progress kept; restore keeps the archive', async () => {
    const moderator = await adminSession(
      baseUrl,
      prisma,
      'moderator',
      undefined,
      OPS_RIGHTS,
    );
    const c = await client();
    const a = await attorney();
    const open1 = await kase(c.id);
    const open2 = await kase(c.id);
    const busy = await kase(c.id, 'in_progress');
    const b = await bid(open1, a.id);

    const r = await api()
      .post(`/api/v1/admin/users/${c.id}/suspend`)
      .set(moderator.auth)
      .send({ reason: 'Fake cases' })
      .expect(200);
    expect((r.body as Body).data).toMatchObject({
      status: 'suspended',
      revokedSessions: 1,
      archivedCases: 2,
    });
    await api().get('/api/v1/users/me').set(c.auth).expect(401);
    // Sign-in is refused (docs/01 §10 ACCOUNT_SUSPENDED).
    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier: c.phone })
      .expect(200);
    const blocked = await api()
      .post('/api/v1/auth/otp/verify')
      .send({
        channel: 'phone',
        identifier: c.phone,
        code: '000000',
        deviceInfo: { deviceId: 'admin-users-e2e' },
      })
      .expect(403);
    expect((blocked.body as Body).error?.code).toBe('ACCOUNT_SUSPENDED');

    const statuses = async () =>
      Object.fromEntries(
        (
          await prisma.case.findMany({
            where: { id: { in: [open1, open2, busy] } },
            select: { id: true, status: true },
          })
        ).map((x) => [x.id, x.status]),
      );
    expect(await statuses()).toEqual({
      [open1]: 'archived',
      [open2]: 'archived',
      [busy]: 'in_progress',
    });
    expect(
      (await prisma.bid.findUniqueOrThrow({ where: { id: b.id } })).status,
    ).toBe('rejected_auto');
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: c.id } }),
    ).toMatchObject({ status: 'suspended', suspended_reason: 'Fake cases' });

    const again = await api()
      .post(`/api/v1/admin/users/${c.id}/suspend`)
      .set(moderator.auth)
      .send({ reason: 'twice' })
      .expect(409);
    expect((again.body as Body).error?.code).toBe('ACCOUNT_SUSPENDED');

    await api()
      .post(`/api/v1/admin/users/${c.id}/restore`)
      .set(moderator.auth)
      .expect(200);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: c.id } }),
    ).toMatchObject({ status: 'active', suspended_reason: null });
    expect(await statuses()).toMatchObject({
      [open1]: 'archived',
      [open2]: 'archived',
    });
    await api()
      .post(`/api/v1/admin/users/${c.id}/restore`)
      .set(moderator.auth)
      .expect(409);

    const rows = await prisma.auditLog.findMany({
      where: { target_id: c.id, action: { startsWith: 'users.' } },
      orderBy: { created_at: 'asc' },
    });
    expect(rows.map((x) => x.action)).toEqual([
      'users.suspend',
      'users.restore',
    ]);
    expect(rows[0]).toMatchObject({
      before: { status: 'active' },
      after: expect.objectContaining({
        status: 'suspended',
        reason: 'Fake cases',
      }),
    });
  });

  it('suspends an attorney with the file-03 §2.5 effects; admins are out of reach', async () => {
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    const other = await adminSession(baseUrl, prisma, 'support');
    const c = await client();
    const a = await attorney();
    const b = await bid(await kase(c.id), a.id);

    const r = await api()
      .post(`/api/v1/admin/users/${a.id}/suspend`)
      .set(sup.auth)
      .send({ reason: 'Impersonation' })
      .expect(200);
    expect((r.body as Body).data).toMatchObject({
      status: 'suspended',
      withdrawnBids: 1,
    });
    expect(
      (
        await prisma.attorneyProfile.findUniqueOrThrow({
          where: { user_id: a.id },
        })
      ).verification_status,
    ).toBe('suspended');
    expect(
      (await prisma.bid.findUniqueOrThrow({ where: { id: b.id } })).status,
    ).toBe('withdrawn');
    await api()
      .post(`/api/v1/admin/users/${a.id}/restore`)
      .set(sup.auth)
      .expect(200);
    expect(
      (
        await prisma.attorneyProfile.findUniqueOrThrow({
          where: { user_id: a.id },
        })
      ).verification_status,
    ).toBe('verified');

    await api()
      .post(`/api/v1/admin/users/${other.userId}/suspend`)
      .set(sup.auth)
      .send({ reason: 'nope' })
      .expect(403);
  });
});

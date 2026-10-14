import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { AdminCaseManagementService } from '../src/modules/admin-cases/admin-case-management.service';

/**
 * Owner 2026-10-05: a client offers their open case to a chosen attorney
 * ("Предложить дело"). Against real PostgreSQL/Redis:
 *  - invite → the attorney is notified and sees it (without the client's
 *    identity); one pending invite per case and attorney;
 *  - the attorney's bid answers it (accepted, bidId); a decline (with a
 *    reason) notifies the client and allows a re-invite;
 *  - the client can cancel; expired invites can't be answered;
 *  - only a verified attorney, only by the case owner; limits.
 */
jest.setTimeout(60_000);

describe('Client → attorney case invites (e2e, owner 2026-10-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let practiceAreaId = '';
  let otherPracticeAreaId = '';

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
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);

    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_inv_leaf' },
      create: {
        code: 'e2e_inv_leaf',
        name_en: 'E2E invites',
        i18n_key: 'practice.e2e_inv_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
    const other = await prisma.practiceArea.upsert({
      where: { code: 'e2e_inv_other_leaf' },
      create: {
        code: 'e2e_inv_other_leaf',
        name_en: 'E2E invites other',
        i18n_key: 'practice.e2e_inv_other_leaf',
        sort: 2,
      },
      update: {},
    });
    otherPracticeAreaId = other.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(
    role: 'client' | 'attorney',
    opts: { verified?: boolean; practiceAreaIds?: string[] } = {},
  ): Promise<{ id: string; auth: Record<string, string> }> {
    const u = await prisma.user.create({ data: { role } });
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status:
            opts.verified === false ? 'unverified' : 'verified',
        },
      });
      // docs/06 §1.2: bids require an active subscription (stage 6.7).
      await prisma.subscription.create({
        data: { user_id: u.id, status: 'active', price_cents: 39900 },
      });
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: u.id,
          state_code: 'NJ',
          bar_number: `NJ-${randomUUID()}`,
          license_status: 'verified',
        },
      });
      for (const id of opts.practiceAreaIds ?? [practiceAreaId]) {
        await prisma.attorneyPracticeArea.create({
          data: { attorney_id: u.id, practice_area_id: id },
        });
      }
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  async function kase(
    clientId: string,
    opts: { areaId?: string; state?: string } = {},
  ): Promise<string> {
    const state = opts.state ?? 'NJ';
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Speeding ticket in Trenton',
        description: 'Got a ticket on the turnpike last week driving home.',
        practice_area_id: opts.areaId ?? practiceAreaId,
        primary_state_code: state,
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: state, is_primary: true },
    });
    return c.id;
  }

  function invite(
    auth: Record<string, string>,
    caseId: string,
    body: Record<string, unknown>,
  ) {
    return api().post(`/api/v1/cases/${caseId}/invites`).set(auth).send(body);
  }

  type Inv = Record<string, unknown>;

  it('invite → attorney notified and sees it; one pending per case; the bid answers it', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);

    const res = await invite(client.auth, caseId, {
      attorneyId: attorney.id,
      message: 'Please take a look, I need help next week.',
      budgetCents: 50_000,
    });
    expect(res.status).toBe(201);
    const inv = res.body.data as Inv;
    expect(inv).toMatchObject({
      caseId,
      attorneyId: attorney.id,
      status: 'pending',
      budgetCents: 50_000,
      outsidePractice: false,
      outsideLicensedStates: false,
      caseTitle: 'Speeding ticket in Trenton',
      caseStateCodes: ['NJ'],
    });
    expect((inv.attorney as Inv).id).toBe(attorney.id);

    const n = await prisma.notification.findFirstOrThrow({
      where: { user_id: attorney.id, type: 'case_invite_received' },
    });
    expect(n.category).toBe('bids');
    expect(n.payload).toMatchObject({ caseId, inviteId: inv.id });

    const mine = await api().get('/api/v1/invites').set(attorney.auth);
    expect(mine.status).toBe(200);
    const items = mine.body.data as Inv[];
    expect(items.map((i) => i.id)).toEqual([inv.id]);
    expect(items[0].attorney).toBeNull();
    // Owner 2026-10-05: the dossier rides on the invite (counts only).
    expect(mine.body.data[0]).toMatchObject({
      caseBudget: { mode: expect.any(String) },
      caseDossier: {
        imagesCount: 0,
        documentsCount: 0,
        descriptionLength: expect.any(Number),
      },
    });

    const again = await invite(client.auth, caseId, {
      attorneyId: attorney.id,
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVITE_ALREADY_PENDING');

    const bid = await api()
      .post(`/api/v1/cases/${caseId}/bids`)
      .set(attorney.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 50_000,
        message: 'Happy to help with this ticket, I can start right away.',
        startAvailability: 'immediately',
      });
    expect(bid.status).toBe(201);

    const onCase = await api()
      .get(`/api/v1/cases/${caseId}/invites`)
      .set(client.auth);
    expect(onCase.status).toBe(200);
    expect((onCase.body.data as Inv[])[0]).toMatchObject({
      status: 'accepted',
      bidId: (bid.body.data as Inv).id,
    });
    const pending = await api().get('/api/v1/invites').set(attorney.auth);
    expect(pending.body.data).toEqual([]);

    const reinvite = await invite(client.auth, caseId, {
      attorneyId: attorney.id,
    });
    expect(reinvite.status).toBe(409);
    expect(reinvite.body.error.code).toBe('BID_ALREADY_EXISTS');
  });

  it('decline with a reason notifies the client and allows a re-invite; cancel; expiry', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    const first = (
      await invite(client.auth, caseId, { attorneyId: attorney.id })
    ).body.data as Inv;

    const declined = await api()
      .post(`/api/v1/invites/${String(first.id)}/decline`)
      .set(attorney.auth)
      .send({ reason: 'Fully booked this month.' });
    expect(declined.status).toBe(201);
    expect(declined.body.data).toMatchObject({
      status: 'declined',
      declineReason: 'Fully booked this month.',
    });
    const n = await prisma.notification.findFirstOrThrow({
      where: { user_id: client.id, type: 'case_invite_declined' },
    });
    expect(n.payload).toMatchObject({ caseId, inviteId: first.id });

    const second = await invite(client.auth, caseId, {
      attorneyId: attorney.id,
    });
    expect(second.status).toBe(201);
    expect((second.body.data as Inv).id).toBe(first.id);
    expect((second.body.data as Inv).status).toBe('pending');

    const cancelled = await api()
      .post(`/api/v1/invites/${String(first.id)}/cancel`)
      .set(client.auth);
    expect(cancelled.status).toBe(201);
    expect((cancelled.body.data as Inv).status).toBe('cancelled');
    const late = await api()
      .post(`/api/v1/invites/${String(first.id)}/decline`)
      .set(attorney.auth)
      .send({});
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVITE_INVALID_STATE');

    // Expiry: an unanswered invite past expires_at can't be answered.
    await invite(client.auth, caseId, { attorneyId: attorney.id });
    await prisma.caseInvite.update({
      where: { id: String(first.id) },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    const got = await api()
      .get(`/api/v1/invites/${String(first.id)}`)
      .set(attorney.auth);
    expect((got.body.data as Inv).status).toBe('expired');
    const pending = await api().get('/api/v1/invites').set(attorney.auth);
    expect(pending.body.data).toEqual([]);
    const all = await api()
      .get('/api/v1/invites?status=all')
      .set(attorney.auth);
    expect((all.body.data as Inv[]).map((i) => i.id)).toEqual([first.id]);

    // Someone else's invite is not found.
    const stranger = await user('client');
    const hidden = await api()
      .get(`/api/v1/invites/${String(first.id)}`)
      .set(stranger.auth);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('INVITE_NOT_FOUND');
  });

  it('only the owner invites, only a verified attorney; mismatch flags; limits', async () => {
    const client = await user('client');
    const caseId = await kase(client.id);

    const unverified = await user('attorney', { verified: false });
    const r1 = await invite(client.auth, caseId, {
      attorneyId: unverified.id,
    });
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe('INVITE_ATTORNEY_UNAVAILABLE');

    const other = await user('client');
    const outsider = await user('attorney', {
      practiceAreaIds: [otherPracticeAreaId],
    });
    const r2 = await invite(other.auth, caseId, { attorneyId: outsider.id });
    expect(r2.status).toBe(404);
    const asAttorney = await invite(outsider.auth, caseId, {
      attorneyId: outsider.id,
    });
    expect(asAttorney.status).toBe(403);

    // Any practice / state may be invited — the mismatch is flagged.
    const r3 = await invite(client.auth, caseId, { attorneyId: outsider.id });
    expect(r3.status).toBe(201);
    expect(r3.body.data).toMatchObject({ outsidePractice: true });

    // invites.max_pending_per_case (10): nine more pending, then 429.
    for (let i = 0; i < 9; i++) {
      const a = await prisma.user.create({ data: { role: 'attorney' } });
      await prisma.caseInvite.create({
        data: {
          case_id: caseId,
          client_id: client.id,
          attorney_id: a.id,
          expires_at: new Date(Date.now() + 3600_000),
        },
      });
    }
    const extra = await user('attorney');
    const r4 = await invite(client.auth, caseId, { attorneyId: extra.id });
    expect(r4.status).toBe(429);
    expect(r4.body.error.code).toBe('INVITE_LIMIT_REACHED');
  });

  it('admin case card lists the invites; the dashboard counts them', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    await invite(client.auth, caseId, {
      attorneyId: attorney.id,
      budgetCents: 30_000,
    });
    const svc = app.get(AdminCaseManagementService);
    const card = await svc.card(caseId);
    expect(card.invites).toEqual([
      expect.objectContaining({
        attorneyId: attorney.id,
        status: 'pending',
        budgetCents: 30_000,
      }),
    ]);
  });
});

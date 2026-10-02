import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { adminSession, OPS_RIGHTS } from './support/admin-login';

jest.setTimeout(120_000);

interface Body {
  data: Record<string, unknown>;
  error?: { code: string };
}

/**
 * docs/06 stage 6.5 acceptance: a dispute decision moves the case to
 * `closed` or `in_progress` with a journal event and notifications; after
 * 3 confirmed "Не могу связаться" reports the client is suspended; every
 * package prepared for a government request is in `data_access_log`.
 */
describe('stage 6.5 — disputes, contact issues, data requests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let practiceAreaId = '';
  const api = () => request(baseUrl);
  let phoneSeq = 1000 + Math.floor(Math.random() * 8000);
  const nextPhone = () => `+1202598${phoneSeq++}`;

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
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    practiceAreaId = (
      await prisma.practiceArea.upsert({
        where: { code: 'e2e_admin_cases_leaf' },
        create: {
          code: 'e2e_admin_cases_leaf',
          name_en: 'E2E admin cases',
          i18n_key: 'practice.e2e_admin_cases_leaf',
          sort: 1,
        },
        update: {},
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

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
        deviceInfo: { deviceId: 'admin-cases-e2e' },
      })
      .expect(201);
    return {
      Authorization: `Bearer ${(res.body as { data: { accessToken: string } }).data.accessToken}`,
    };
  }

  async function client() {
    const phone = nextPhone();
    const auth = await signIn(phone);
    const me = await api().get('/api/v1/users/me').set(auth).expect(200);
    const id = (me.body as Body).data.id as string;
    await prisma.user.update({
      where: { id },
      data: { role: 'client', first_name: 'Chris', last_name: 'Client' },
    });
    return { id, auth };
  }

  async function attorney() {
    const username = `att_${randomUUID().slice(0, 8)}`;
    const u = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: 'Avery',
        last_name: 'Attorney',
        attorney_profile: {
          create: {
            username,
            username_lower: username,
            languages: ['en'],
            verification_status: 'verified',
          },
        },
      },
    });
    const auth = {
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: u.id,
        role: 'attorney',
        sid: randomUUID(),
        verified: true,
        subscriptionStatus: 'active',
      })}`,
    };
    return { id: u.id, auth };
  }

  /** A case with an accepted bid in [status]. */
  async function caseWithBid(
    clientId: string,
    attorneyId: string,
    status: 'in_progress' | 'pending_completion' | 'open',
  ) {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: `Case ${randomUUID().slice(0, 6)}`,
        description: 'Something happened and I need a lawyer to sort it out.',
        practice_area_id: practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status,
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    const bid = await prisma.bid.create({
      data: {
        case_id: c.id,
        attorney_id: attorneyId,
        fee_type: 'fixed',
        amount_cents: 50_000,
        message: 'I can help.',
        start_availability: 'immediately',
        turn: 'client',
        status: status === 'open' ? 'active' : 'accepted',
      },
    });
    if (status !== 'open') {
      await prisma.case.update({
        where: { id: c.id },
        data: { accepted_bid_id: bid.id },
      });
      await prisma.contactDisclosure.create({
        data: {
          case_id: c.id,
          bid_id: bid.id,
          client_id: clientId,
          attorney_id: attorneyId,
          fields: ['phone'],
        },
      });
    }
    return { caseId: c.id, bidId: bid.id };
  }

  it('dispute queue + decision: closed with journal event and notifications; back to in_progress', async () => {
    const support = await adminSession(
      baseUrl,
      prisma,
      'support',
      undefined,
      OPS_RIGHTS,
    );
    const verifier = await adminSession(baseUrl, prisma, 'verifier');
    const c = await client();
    const a = await attorney();
    const { caseId } = await caseWithBid(c.id, a.id, 'pending_completion');
    // The attorney disputes through the mobile API (file 04 §10.1).
    const disputed = await api()
      .post(`/api/v1/cases/${caseId}/dispute`)
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'The attorney never filed the motion.' })
      .expect(200);
    expect((disputed.body as Body).data.status).toBe('disputed');
    const dispute = await prisma.caseDispute.findFirstOrThrow({
      where: { case_id: caseId },
    });

    await api()
      .get('/api/v1/admin/case-disputes')
      .set(verifier.auth)
      .expect(403);
    const queue = await api()
      .get('/api/v1/admin/case-disputes')
      .set(support.auth)
      .expect(200);
    const row = (
      queue.body as { data: Array<Record<string, unknown>> }
    ).data.find((d) => d.id === dispute.id);
    expect(row).toMatchObject({
      status: 'open',
      reason: 'The attorney never filed the motion.',
      openedByRole: 'attorney',
      case: expect.objectContaining({ id: caseId, status: 'disputed' }),
    });
    const card = await api()
      .get(`/api/v1/admin/case-disputes/${dispute.id}`)
      .set(support.auth)
      .expect(200);
    const journal = (card.body as Body).data.journal as Array<{
      eventType: string;
    }>;
    expect(journal.map((j) => j.eventType)).toContain('disputed');

    const before = await prisma.notification.count({
      where: { user_id: { in: [c.id, a.id] }, type: 'case_closed' },
    });
    const resolved = await api()
      .post(`/api/v1/admin/case-disputes/${dispute.id}/resolve`)
      .set(support.auth)
      .send({
        decision: 'closed',
        note: 'Work was delivered per the chat history.',
      })
      .expect(200);
    expect((resolved.body as Body).data.status).toBe('closed');
    expect(
      (
        await prisma.caseJournal.findMany({
          where: { case_id: caseId },
          orderBy: { created_at: 'asc' },
        })
      ).map((j) => j.event_type),
    ).toContain('dispute_resolved');
    expect(
      await prisma.notification.count({
        where: { user_id: { in: [c.id, a.id] }, type: 'case_closed' },
      }),
    ).toBe(before + 2);
    const resolvedQ = await api()
      .get('/api/v1/admin/case-disputes?status=resolved')
      .set(support.auth)
      .expect(200);
    expect(
      (resolvedQ.body as { data: Array<{ id: string }> }).data.map((d) => d.id),
    ).toContain(dispute.id);

    // Second dispute on another case → back to work.
    const c2 = await client();
    const { caseId: case2 } = await caseWithBid(
      c2.id,
      a.id,
      'pending_completion',
    );
    await api()
      .post(`/api/v1/cases/${case2}/dispute`)
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'Not finished yet, still waiting for documents.' })
      .expect(200);
    const d2 = await prisma.caseDispute.findFirstOrThrow({
      where: { case_id: case2 },
    });
    const back = await api()
      .post(`/api/v1/admin/case-disputes/${d2.id}/resolve`)
      .set(support.auth)
      .send({
        decision: 'in_progress',
        note: 'Attorney to finish within a week.',
      })
      .expect(200);
    expect((back.body as Body).data.status).toBe('in_progress');
    expect(
      await prisma.notification.count({
        where: {
          user_id: { in: [c2.id, a.id] },
          type: 'case_updated',
          payload: { path: ['disputeId'], equals: d2.id },
        },
      }),
    ).toBe(2);
  });

  it('"Не могу связаться": queue, card with disclosure and history; the 3rd confirmed report suspends the client (sessions revoked, open cases archived)', async () => {
    const support = await adminSession(baseUrl, prisma, 'support');
    const c = await client();
    const openCase = await caseWithBid(c.id, (await attorney()).id, 'open');
    const reports: string[] = [];
    for (let i = 0; i < 3; i++) {
      const a = await attorney();
      const { caseId, bidId } = await caseWithBid(c.id, a.id, 'in_progress');
      const r = await prisma.contactIssueReport.create({
        data: {
          case_id: caseId,
          bid_id: bidId,
          attorney_id: a.id,
          client_id: c.id,
          issue_type: 'no_answer',
          note: 'No reply for a week',
        },
      });
      reports.push(r.id);
    }
    const queue = await api()
      .get('/api/v1/admin/contact-issues')
      .set(support.auth)
      .expect(200);
    const mine = (
      queue.body as { data: Array<Record<string, unknown>> }
    ).data.filter((r) => reports.includes(r.id as string));
    expect(mine).toHaveLength(3);
    expect(mine[0]).toMatchObject({
      status: 'open',
      issueType: 'no_answer',
      clientConfirmedReports: 0,
      suspendThreshold: 3,
    });
    const card = await api()
      .get(`/api/v1/admin/contact-issues/${reports[0]}`)
      .set(support.auth)
      .expect(200);
    expect((card.body as Body).data).toMatchObject({
      disclosedFields: ['phone'],
    });
    expect(((card.body as Body).data.clientHistory as unknown[]).length).toBe(
      2,
    );

    await api().get('/api/v1/users/me').set(c.auth).expect(200);
    for (const [i, id] of reports.entries()) {
      const r = await api()
        .post(`/api/v1/admin/contact-issues/${id}/resolve`)
        .set(support.auth)
        .send({ decision: 'confirmed', note: 'Attorney showed call logs.' })
        .expect(200);
      expect((r.body as Body).data).toMatchObject({
        confirmedReports: i + 1,
        clientSuspended: i === 2,
      });
    }
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: c.id } }),
    ).toMatchObject({ status: 'suspended' });
    // §3.4 effects: sessions gone, open cases archived, in_progress kept.
    await api().get('/api/v1/users/me').set(c.auth).expect(401);
    expect(
      (await prisma.case.findUniqueOrThrow({ where: { id: openCase.caseId } }))
        .status,
    ).toBe('archived');
    expect(
      await prisma.case.count({
        where: { client_id: c.id, status: 'in_progress' },
      }),
    ).toBe(3);
    const confirmedQ = await api()
      .get('/api/v1/admin/contact-issues?status=confirmed')
      .set(support.auth)
      .expect(200);
    expect(
      (
        confirmedQ.body as {
          data: Array<{ id: string; clientConfirmedReports: number }>;
        }
      ).data.find((r) => r.id === reports[0]),
    ).toMatchObject({ clientConfirmedReports: 3 });
  });

  it('government data requests: register, package within scope (justified, every entity logged), status; super_admin only', async () => {
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    const support = await adminSession(baseUrl, prisma, 'support');
    const c = await client();
    const a = await attorney();
    const { caseId, bidId } = await caseWithBid(c.id, a.id, 'in_progress');

    await api()
      .get('/api/v1/admin/data-requests')
      .set(support.auth)
      .expect(403);
    const created = await api()
      .post('/api/v1/admin/data-requests')
      .set(sup.auth)
      .send({
        requestType: 'subpoena',
        referenceNumber: 'SDNY-2026-0042',
        agency: 'U.S. District Court, S.D.N.Y.',
        receivedAt: new Date().toISOString(),
        scope:
          'Account holder profile, contact details and case records for the named person.',
      })
      .expect(201);
    const id = (created.body as Body).data.id as string;
    expect((created.body as Body).data).toMatchObject({
      status: 'received',
      accessCount: 0,
    });

    const noReason = await api()
      .post(`/api/v1/admin/data-requests/${id}/package`)
      .set(sup.auth)
      .send({ userId: c.id, sections: ['profile', 'contacts', 'cases'] })
      .expect(400);
    expect((noReason.body as Body).error?.code).toBe('JUSTIFICATION_REQUIRED');

    const pkg = await api()
      .post(`/api/v1/admin/data-requests/${id}/package`)
      .set(sup.auth)
      .set(
        'X-Justification',
        'Subpoena SDNY-2026-0042, items 1-3 of the schedule',
      )
      .send({
        userId: c.id,
        sections: [
          'profile',
          'contacts',
          'cases',
          'bids',
          'contact_disclosures',
        ],
      })
      .expect(200);
    const p = (pkg.body as Body).data;
    expect(p).toMatchObject({
      requestId: id,
      referenceNumber: 'SDNY-2026-0042',
      loggedEntities: 4,
    });
    const data = p.data as Record<string, unknown>;
    expect((data.profile as { id: string }).id).toBe(c.id);
    expect((data.contacts as { phone: string }).phone).toMatch(/^\+1202598/);
    expect((data.cases as Array<{ id: string }>).map((x) => x.id)).toEqual([
      caseId,
    ]);
    expect((data.bids as Array<{ id: string }>).map((x) => x.id)).toEqual([
      bidId,
    ]);
    expect(data.messages).toBeUndefined();

    const logs = await prisma.dataAccessLog.findMany({
      where: { request_id: id },
    });
    expect(logs.map((l) => `${l.entity_type}:${l.entity_id}`).sort()).toEqual(
      [
        `user:${c.id}`,
        `case:${caseId}`,
        `bid:${bidId}`,
        ...(
          await prisma.contactDisclosure.findMany({ where: { bid_id: bidId } })
        ).map((d) => `contact_disclosure:${d.id}`),
      ].sort(),
    );
    expect(logs.every((l) => l.admin_id === sup.userId)).toBe(true);

    const card = await api()
      .get(`/api/v1/admin/data-requests/${id}`)
      .set(sup.auth)
      .expect(200);
    expect((card.body as Body).data).toMatchObject({
      status: 'in_progress',
      accessCount: 4,
    });
    expect(((card.body as Body).data.accessLog as unknown[]).length).toBe(4);

    await api()
      .patch(`/api/v1/admin/data-requests/${id}/status`)
      .set(sup.auth)
      .send({ status: 'fulfilled', notes: 'Sent by certified mail.' })
      .expect(200);
    const list = await api()
      .get('/api/v1/admin/data-requests')
      .set(sup.auth)
      .expect(200);
    expect(
      (list.body as { data: Array<Record<string, unknown>> }).data.find(
        (r) => r.id === id,
      ),
    ).toMatchObject({ status: 'fulfilled', notes: 'Sent by certified mail.' });
    expect(
      (await prisma.dataAccessRequest.findUniqueOrThrow({ where: { id } }))
        .closed_at,
    ).toBeTruthy();

    const audit = await prisma.auditLog.findMany({
      where: { admin_id: sup.userId, target_id: id },
      orderBy: { created_at: 'asc' },
    });
    expect(audit.map((r) => r.action)).toEqual([
      'data_request.create',
      'data_request.package',
      'data_request.status',
    ]);
    expect(audit[1].justification).toBe(
      'Subpoena SDNY-2026-0042, items 1-3 of the schedule',
    );
  });
});

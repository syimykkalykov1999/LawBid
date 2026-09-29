import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { adminSession } from './support/admin-login';
import { SubscriptionAccessService } from '../src/modules/subscriptions/subscription-access.service';

/**
 * docs/04_CASES_BIDS.md §16 stage 4.5 acceptance (integration + concurrency),
 * against real CockroachDB/Redis:
 *  - two parallel accepts of different bids on one case: exactly one wins,
 *    the other gets CASE_INVALID_STATE;
 *  - afterwards the other bids are rejected_auto, the case is in_progress
 *    and gone from the attorney feed; the journal has bid_accepted,
 *    contacts_disclosed and bid_rejected; one contact_disclosures row;
 *  - contacts are refused without an active subscription and returned once
 *    it is back, without a second disclosure row (§8.3);
 *  - an attorney who lost the license is BID_ATTORNEY_INACTIVE, the bid is
 *    withdrawn, the case stays open (§7 step 2);
 *  - the 3rd confirmed "can't reach" report suspends the client (§8.4).
 */
jest.setTimeout(60_000);

describe('Bid acceptance and client contacts (e2e, docs/04 §7–§8, stage 4.5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let practiceAreaId = '';

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
      where: { code: 'e2e_accept_leaf' },
      create: {
        code: 'e2e_accept_leaf',
        name_en: 'E2E accept',
        i18n_key: 'practice.e2e_accept_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
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
    opts: { areaId?: string } = {},
  ): Promise<string> {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Speeding ticket in Trenton',
        description: 'Got a ticket on the turnpike last week driving home.',
        practice_area_id: opts.areaId ?? practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    return c.id;
  }

  function bidBody(overrides: Record<string, unknown> = {}) {
    return {
      feeType: 'fixed',
      amountCents: 60_000,
      message: 'I handle NJ speeding tickets every week, happy to help.',
      startAvailability: 'immediately',
      ...overrides,
    };
  }

  function postBid(
    auth: Record<string, string>,
    caseId: string,
    body: Record<string, unknown>,
    key: string | null = randomUUID(),
  ) {
    const req = api().post(`/api/v1/cases/${caseId}/bids`).set(auth);
    if (key !== null) req.set('Idempotency-Key', key);
    return req.send(body);
  }

  async function withClientContacts(clientId: string): Promise<void> {
    await prisma.user.update({
      where: { id: clientId },
      data: {
        first_name: 'Dana',
        last_name: 'Client',
        phone_e164: `+1201${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
        email: `client_${clientId.slice(0, 8)}@example.com`,
      },
    });
  }

  async function bidOn(
    auth: Record<string, string>,
    caseId: string,
  ): Promise<string> {
    const res = await postBid(auth, caseId, bidBody());
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  const accept = (auth: Record<string, string>, bidId: string) =>
    api()
      .post(`/api/v1/bids/${bidId}/accept`)
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send({});

  async function acceptedCase() {
    const client = await user('client');
    await withClientContacts(client.id);
    const winner = await user('attorney');
    const caseId = await kase(client.id);
    const bidId = await bidOn(winner.auth, caseId);
    const res = await accept(client.auth, bidId);
    expect(res.status).toBe(200);
    return { client, winner, caseId, bidId };
  }

  it('two parallel accepts on one case: exactly one wins, the rest is consistent', async () => {
    const client = await user('client');
    await withClientContacts(client.id);
    const a1 = await user('attorney');
    const a2 = await user('attorney');
    const a3 = await user('attorney');
    const caseId = await kase(client.id);
    const b1 = await bidOn(a1.auth, caseId);
    const b2 = await bidOn(a2.auth, caseId);
    const b3 = await bidOn(a3.auth, caseId);

    const [r1, r2] = await Promise.all([
      accept(client.auth, b1),
      accept(client.auth, b2),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error.code).toBe('CASE_INVALID_STATE');
    const winnerBid = r1.status === 200 ? b1 : b2;

    const kaseRow = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
    });
    expect(kaseRow.status).toBe('in_progress');
    expect(kaseRow.accepted_bid_id).toBe(winnerBid);

    const bids = await prisma.bid.findMany({ where: { case_id: caseId } });
    for (const b of bids) {
      expect(b.status).toBe(b.id === winnerBid ? 'accepted' : 'rejected_auto');
    }
    const pending = await prisma.bidOffer.count({
      where: { bid_id: { in: [b1, b2, b3] }, status: 'pending' },
    });
    expect(pending).toBe(0);

    expect(
      await prisma.contactDisclosure.count({ where: { case_id: caseId } }),
    ).toBe(1);
    const convo = await prisma.conversation.findFirstOrThrow({
      where: { case_id: caseId, bid_id: winnerBid },
    });
    expect(convo).toMatchObject({ status: 'active', contacts_unlocked: true });

    const events = (
      await prisma.caseJournal.findMany({
        where: { case_id: caseId },
        select: { event_type: true },
      })
    ).map((e) => e.event_type as string);
    expect(events).toContain('bid_accepted');
    expect(events).toContain('contacts_disclosed');
    expect(events.filter((e) => e === 'bid_rejected')).toHaveLength(2);

    // Gone from every attorney's feed (status is no longer `open`).
    const feed = await api().get('/api/v1/cases').set(a3.auth);
    expect(feed.status).toBe(200);
    expect(
      (feed.body.data as { id: string }[]).some((c) => c.id === caseId),
    ).toBe(false);
  });

  it('contacts: only the accepted attorney, gated by subscription, no second disclosure row', async () => {
    const { client, winner, caseId } = await acceptedCase();

    const ok = await api()
      .get(`/api/v1/cases/${caseId}/contacts`)
      .set(winner.auth);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      firstName: 'Dana',
      lastName: 'Client',
    });
    expect(ok.body.data.phone ?? ok.body.data.phoneE164).toBeTruthy();

    const stranger = await user('attorney');
    const denied = await api()
      .get(`/api/v1/cases/${caseId}/contacts`)
      .set(stranger.auth);
    expect([403, 404]).toContain(denied.status);
    expect(JSON.stringify(denied.body)).not.toContain('Dana');

    // Subscription lapses (docs/06 §1.2).
    await prisma.subscription.update({
      where: { user_id: winner.id },
      data: { status: 'expired' },
    });
    await app.get(SubscriptionAccessService).invalidate(winner.id);
    const locked = await api()
      .get(`/api/v1/cases/${caseId}/contacts`)
      .set(winner.auth);
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(JSON.stringify(locked.body)).not.toContain('Dana');

    await prisma.subscription.update({
      where: { user_id: winner.id },
      data: { status: 'active' },
    });
    await app.get(SubscriptionAccessService).invalidate(winner.id);
    const again = await api()
      .get(`/api/v1/cases/${caseId}/contacts`)
      .set(winner.auth);
    expect(again.status).toBe(200);
    expect(
      await prisma.contactDisclosure.count({ where: { case_id: caseId } }),
    ).toBe(1);
    expect(client.id).toBeTruthy();
  });

  it('an attorney who lost the license: BID_ATTORNEY_INACTIVE, bid withdrawn, case stays open', async () => {
    const client = await user('client');
    await withClientContacts(client.id);
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    const bidId = await bidOn(attorney.auth, caseId);
    await prisma.attorneyLicense.updateMany({
      where: { attorney_id: attorney.id },
      data: { license_status: 'expired' },
    });

    const res = await accept(client.auth, bidId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BID_ATTORNEY_INACTIVE');
    expect(
      (await prisma.bid.findUniqueOrThrow({ where: { id: bidId } })).status,
    ).toBe('withdrawn');
    expect(
      (await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).status,
    ).toBe('open');
    expect(
      await prisma.contactDisclosure.count({ where: { case_id: caseId } }),
    ).toBe(0);
  });

  it('the 3rd confirmed "can\'t reach" report suspends the client', async () => {
    const { client, winner, caseId, bidId } = await acceptedCase();
    for (let i = 0; i < 2; i++) {
      await prisma.contactIssueReport.create({
        data: {
          case_id: caseId,
          bid_id: bidId,
          client_id: client.id,
          attorney_id: winner.id,
          issue_type: 'no_answer',
          status: 'confirmed',
        },
      });
    }
    const report = await api()
      .post(`/api/v1/cases/${caseId}/contact-issues`)
      .set(winner.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ issueType: 'phone_invalid', note: 'Number is disconnected.' });
    expect(report.status).toBe(201);

    const adminAuth = (await adminSession(baseUrl, prisma, 'support')).auth;
    const resolved = await api()
      .post(`/api/v1/admin/contact-issues/${report.body.data.id}/resolve`)
      .set(adminAuth)
      .send({ decision: 'confirmed', note: 'Verified: number disconnected.' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data).toMatchObject({
      confirmedReports: 3,
      clientSuspended: true,
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: client.id } }))
        .status,
    ).toBe('suspended');
  });
});

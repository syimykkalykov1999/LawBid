import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { BidSubscriptionLapseJob } from '../src/jobs/handlers/bid-subscription-lapse.job';
import { BidsService } from '../src/modules/bids/bids.service';
import { SubscriptionAccessService } from '../src/modules/subscriptions/subscription-access.service';

/**
 * docs/04_CASES_BIDS.md §16 stage 4.4 acceptance, against real
 * CockroachDB/Redis:
 *  - a second bid by the same attorney on a case is rejected
 *    (BID_ALREADY_EXISTS), even after the first is withdrawn;
 *  - a bid without an active subscription/trial is SUBSCRIPTION_REQUIRED;
 *  - acting out of turn is BID_NOT_YOUR_TURN;
 *  - a 6th counter-offer is impossible (BID_MAX_ROUNDS_REACHED);
 *  - declining on the 5th round is failed_negotiation +
 *    negotiation_failed to both sides;
 *  - counter-offers are unavailable for free_consultation bids;
 *  - the subscription-lapse job withdraws an attorney's active bids.
 */
jest.setTimeout(60_000);

describe('Bids and negotiation (e2e, docs/04 §5–§6, stage 4.4)', () => {
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
      where: { code: 'e2e_bids_leaf' },
      create: {
        code: 'e2e_bids_leaf',
        name_en: 'E2E bids',
        i18n_key: 'practice.e2e_bids_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
    const other = await prisma.practiceArea.upsert({
      where: { code: 'e2e_bids_other_leaf' },
      create: {
        code: 'e2e_bids_other_leaf',
        name_en: 'E2E bids other',
        i18n_key: 'practice.e2e_bids_other_leaf',
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

  it('creates a bid: client notified, journal written; a second bid by the same attorney is rejected even after withdraw', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);

    const res = await postBid(attorney.auth, caseId, bidBody());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      caseId,
      attorneyId: attorney.id,
      status: 'active',
      feeType: 'fixed',
      amountCents: 60_000,
      roundCount: 0,
      turn: 'client',
    });
    expect(res.body.data.offers).toHaveLength(1);
    expect(res.body.data.offers[0]).toMatchObject({
      roundNo: 0,
      fromRole: 'attorney',
      amountCents: 60_000,
      status: 'pending',
    });
    const bidId = res.body.data.id as string;

    const updatedCase = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
    });
    expect(updatedCase.bids_count).toBe(1);

    const journalRow = await prisma.caseJournal.findFirstOrThrow({
      where: { case_id: caseId, event_type: 'bid_placed' },
    });
    expect(journalRow).toMatchObject({
      attorney_id: attorney.id,
      actor_user_id: attorney.id,
      actor_role: 'attorney',
    });

    const notif = await prisma.notification.findFirstOrThrow({
      where: { user_id: client.id, type: 'bid_received' },
    });
    expect(notif.category).toBe('bids');
    expect(notif.payload).toMatchObject({ bidId, caseId });

    // A second attempt is rejected outright.
    const dup = await postBid(attorney.auth, caseId, bidBody());
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('BID_ALREADY_EXISTS');

    // Withdraw, then try again: still rejected (§5.1 "После withdrawn
    // повторный бид ... невозможен").
    const withdraw = await api()
      .post(`/api/v1/bids/${bidId}/withdraw`)
      .set(attorney.auth);
    expect(withdraw.status).toBe(201);
    expect(withdraw.body.data.status).toBe('withdrawn');

    const afterWithdrawNotif = await prisma.notification.findFirstOrThrow({
      where: { user_id: client.id, type: 'bid_rejected' },
    });
    expect(afterWithdrawNotif.payload).toMatchObject({
      bidId,
      reason: 'withdrawn',
    });

    const again = await postBid(attorney.auth, caseId, bidBody());
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('BID_ALREADY_EXISTS');
  });

  it('requires Idempotency-Key, validates fields, and denies an ineligible attorney (CASE_NOT_FOUND, deny by default)', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);

    const noKey = await postBid(attorney.auth, caseId, bidBody(), null);
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const shortMessage = await postBid(
      attorney.auth,
      caseId,
      bidBody({ message: 'too short' }),
    );
    expect(shortMessage.status).toBe(400);
    expect(shortMessage.body.error.code).toBe('VALIDATION_ERROR');

    // Wrong practice area: not eligible to see or bid on this case.
    const wrongPractice = await user('attorney', {
      practiceAreaIds: [otherPracticeAreaId],
    });
    const denied = await postBid(wrongPractice.auth, caseId, bidBody());
    expect(denied.status).toBe(404);
    expect(denied.body.error.code).toBe('CASE_NOT_FOUND');

    // A client can't bid.
    const asClient = await postBid(client.auth, caseId, bidBody());
    expect(asClient.status).toBe(403);
    expect(asClient.body.error.code).toBe('FORBIDDEN');
  });

  it('SUBSCRIPTION_REQUIRED: a participant without an active subscription cannot bid', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    // Grants "attorney_participant" access (docs/04 §9.2's conversation,
    // built directly here — chat is file 05) without needing `verified`,
    // so the eligibility gate (CaseAccessPolicy) passes while the
    // subscription gate (SubscriptionAccessService, docs/06 §1.2) still
    // fails: the subscription is canceled.
    await prisma.conversation.create({
      data: {
        case_id: caseId,
        attorney_id: attorney.id,
        client_id: client.id,
        status: 'pre_acceptance',
      },
    });
    await prisma.subscription.update({
      where: { user_id: attorney.id },
      data: { status: 'canceled' },
    });
    await app.get(SubscriptionAccessService).invalidate(attorney.id);

    const res = await postBid(attorney.auth, caseId, bidBody());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(await prisma.bid.count({ where: { case_id: caseId } })).toBe(0);
  });

  it('turn-taking: acting out of turn is BID_NOT_YOUR_TURN; free_consultation cannot be countered', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    const bidId = (await postBid(attorney.auth, caseId, bidBody())).body.data
      .id as string;

    // round 0: it's the client's turn. The attorney may not act.
    const attorneyCounters = await api()
      .post(`/api/v1/bids/${bidId}/counter`)
      .set(attorney.auth)
      .send({ amountCents: 55_000 });
    expect(attorneyCounters.status).toBe(409);
    expect(attorneyCounters.body.error.code).toBe('BID_NOT_YOUR_TURN');

    const clientCounters = await api()
      .post(`/api/v1/bids/${bidId}/counter`)
      .set(client.auth)
      .send({ amountCents: 45_000, message: 'Can you do 450?' });
    expect(clientCounters.status).toBe(201);
    expect(clientCounters.body.data).toMatchObject({
      roundCount: 1,
      turn: 'attorney',
      amountCents: 45_000,
    });
    expect(clientCounters.body.data.offers).toHaveLength(2);

    const attorneyNotif = await prisma.notification.findFirstOrThrow({
      where: { user_id: attorney.id, type: 'offer_countered' },
    });
    expect(attorneyNotif.payload).toMatchObject({ bidId, byRole: 'client' });

    // Not the client's turn any more.
    const clientAgain = await api()
      .post(`/api/v1/bids/${bidId}/counter`)
      .set(client.auth)
      .send({ amountCents: 40_000 });
    expect(clientAgain.status).toBe(409);
    expect(clientAgain.body.error.code).toBe('BID_NOT_YOUR_TURN');

    // free_consultation: no counters at all, only accept/decline. A fresh
    // attorney (the first already has an active bid on this case, and a
    // second by the same attorney is BID_ALREADY_EXISTS).
    const attorney2 = await user('attorney');
    const freeBidId = (
      await postBid(
        attorney2.auth,
        caseId,
        bidBody({ feeType: 'free_consultation', amountCents: undefined }),
      )
    ).body.data.id as string;
    const freeCounter = await api()
      .post(`/api/v1/bids/${freeBidId}/counter`)
      .set(client.auth)
      .send({ amountCents: 10_000 });
    expect(freeCounter.status).toBe(409);
    expect(freeCounter.body.error.code).toBe('BID_COUNTER_NOT_ALLOWED');
  });

  it('5-round limit: a 6th counter is impossible; declining the 5th round is failed_negotiation, notifying both sides', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    const bidId = (await postBid(attorney.auth, caseId, bidBody())).body.data
      .id as string;

    let turn: 'client' | 'attorney' = 'client';
    for (let round = 1; round <= 5; round++) {
      const actor = turn === 'client' ? client : attorney;
      const res = await api()
        .post(`/api/v1/bids/${bidId}/counter`)
        .set(actor.auth)
        .send({ amountCents: 60_000 - round * 1000 });
      expect(res.status).toBe(201);
      expect(res.body.data.roundCount).toBe(round);
      turn = turn === 'client' ? 'attorney' : 'client';
    }
    // round_count is now 5. Round 1 is always the client's (the initial
    // turn after bid creation, §5.1), so with an odd cap of 5 rounds the
    // 5th is always made by the client and it is always the ATTORNEY's
    // turn next — the client can never be "out of turn but under the
    // cap" at exactly round 5.
    const sixthByClient = await api()
      .post(`/api/v1/bids/${bidId}/counter`)
      .set(client.auth)
      .send({ amountCents: 40_000 });
    expect(sixthByClient.status).toBe(409);
    expect(sixthByClient.body.error.code).toBe('BID_NOT_YOUR_TURN');

    const sixth = await api()
      .post(`/api/v1/bids/${bidId}/counter`)
      .set(attorney.auth)
      .send({ amountCents: 50_000 });
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe('BID_MAX_ROUNDS_REACHED');

    // §6.2: the attorney received the 5th (client's) offer, so *it*
    // withdraws to end the negotiation as failed (not "decline", which is
    // client-only).
    const withdraw = await api()
      .post(`/api/v1/bids/${bidId}/withdraw`)
      .set(attorney.auth);
    expect(withdraw.status).toBe(201);
    expect(withdraw.body.data.status).toBe('failed_negotiation');

    const journalRow = await prisma.caseJournal.findFirstOrThrow({
      where: { case_id: caseId, event_type: 'negotiation_failed' },
    });
    expect(journalRow.attorney_id).toBe(attorney.id);

    const notifs = await prisma.notification.findMany({
      where: { type: 'negotiation_failed' },
    });
    const recipients = notifs.map((n) => n.user_id).sort();
    expect(recipients).toEqual([attorney.id, client.id].sort());
  });

  it('declining before the 5th round is a plain rejection, not failed_negotiation', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    const bidId = (await postBid(attorney.auth, caseId, bidBody())).body.data
      .id as string;

    const decline = await api()
      .post(`/api/v1/bids/${bidId}/decline`)
      .set(client.auth);
    expect(decline.status).toBe(201);
    expect(decline.body.data.status).toBe('rejected_by_client');

    const notif = await prisma.notification.findFirstOrThrow({
      where: { user_id: attorney.id, type: 'bid_rejected' },
    });
    expect(notif.payload).toMatchObject({
      bidId,
      reason: 'rejected_by_client',
    });

    // Final state: nothing more can happen to this bid.
    const again = await api()
      .post(`/api/v1/bids/${bidId}/withdraw`)
      .set(attorney.auth);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('BID_INVALID_STATE');
  });

  it('GET /bids/:id: only the two participants can read it, with full offer history', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const stranger = await user('attorney', {
      practiceAreaIds: [otherPracticeAreaId],
    });
    const caseId = await kase(client.id);
    const bidId = (await postBid(attorney.auth, caseId, bidBody())).body.data
      .id as string;
    await api()
      .post(`/api/v1/bids/${bidId}/counter`)
      .set(client.auth)
      .send({ amountCents: 45_000 });

    const asClient = await api().get(`/api/v1/bids/${bidId}`).set(client.auth);
    expect(asClient.status).toBe(200);
    expect(asClient.body.data.offers).toHaveLength(2);

    const asAttorney = await api()
      .get(`/api/v1/bids/${bidId}`)
      .set(attorney.auth);
    expect(asAttorney.status).toBe(200);

    const asStranger = await api()
      .get(`/api/v1/bids/${bidId}`)
      .set(stranger.auth);
    expect(asStranger.status).toBe(404);
  });

  it("withdrawActiveBidsForAttorney withdraws every active bid and notifies each case's client", async () => {
    const attorney = await user('attorney');
    const clientA = await user('client');
    const clientB = await user('client');
    const caseA = await kase(clientA.id);
    const caseB = await kase(clientB.id);
    const bidA = (await postBid(attorney.auth, caseA, bidBody())).body.data
      .id as string;
    const bidB = (await postBid(attorney.auth, caseB, bidBody())).body.data
      .id as string;

    const withdrawn = await app
      .get(BidsService)
      .withdrawActiveBidsForAttorney(attorney.id);
    expect(withdrawn).toBe(2);

    for (const id of [bidA, bidB]) {
      expect(
        (await prisma.bid.findUniqueOrThrow({ where: { id } })).status,
      ).toBe('withdrawn');
    }
    const notifs = await prisma.notification.findMany({
      where: {
        type: 'bid_rejected',
        user_id: { in: [clientA.id, clientB.id] },
      },
    });
    expect(notifs).toHaveLength(2);
    expect(
      notifs.every(
        (n) => (n.payload as { reason: string }).reason === 'withdrawn',
      ),
    ).toBe(true);

    // Idempotent: nothing left to withdraw.
    expect(
      await app.get(BidsService).withdrawActiveBidsForAttorney(attorney.id),
    ).toBe(0);
  });

  it('BidSubscriptionLapseJob withdraws active bids of an attorney whose profile lapsed, and is idempotent', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    const bidId = (await postBid(attorney.auth, caseId, bidBody())).body.data
      .id as string;

    // docs/06 §1.2: the subscription lapses (expired after the grace period).
    await prisma.subscription.update({
      where: { user_id: attorney.id },
      data: { status: 'expired' },
    });
    await app.get(SubscriptionAccessService).invalidate(attorney.id);

    const job = app.get(BidSubscriptionLapseJob);
    const result = await job.run();
    expect(result.bidsWithdrawn).toBeGreaterThanOrEqual(1);
    expect(
      (await prisma.bid.findUniqueOrThrow({ where: { id: bidId } })).status,
    ).toBe('withdrawn');

    const again = await job.run();
    expect(again.bidsWithdrawn).toBe(0);
  });
});

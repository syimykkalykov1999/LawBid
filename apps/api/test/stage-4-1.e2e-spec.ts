import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { withTxRetry } from '../src/prisma/tx-retry.util';
import { CaseStateMachine } from '../src/modules/cases/domain/case-state-machine';
import { BidStateMachine } from '../src/modules/bids/domain/bid-state-machine';
import { CaseJournalService } from '../src/modules/journal/case-journal.service';
import { CaseAccessPolicy } from '../src/modules/cases/policies/case-access.policy';
import { SubscriptionAccessService } from '../src/modules/subscriptions/subscription-access.service';

/**
 * docs/04_CASES_BIDS.md §16 stage 4.1 acceptance against CockroachDB:
 * - a case change and its case_journal row commit or roll back together;
 * - the hash chain verifies (also under concurrent appends as lawbid_app),
 *   and tampering (edit / delete) is detected;
 * - lawbid_app cannot UPDATE/DELETE case_journal (docs/02 §6.2);
 * - BidStateMachine + OfferStatus through a full negotiation and accept;
 * - CaseAccessPolicy's single-case §4.1/§5.4 SQL.
 */
describe('Stage 4.1 — state machines, journal, access policy (e2e)', () => {
  jest.setTimeout(60_000);
  const root = new PrismaClient();
  const prisma = new PrismaService();
  const appRole = (() => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    url.username = 'lawbid_app';
    url.password = '';
    return new PrismaClient({ datasourceUrl: url.toString() });
  })();
  // The services only use the transaction client they are handed (and
  // `this.prisma` for verifyChain), so the lawbid_app client can stand in.
  const appPrisma = appRole as unknown as PrismaService;

  const cases = new CaseStateMachine();
  const bids = new BidStateMachine();
  const journal = new CaseJournalService(prisma);
  const policy = new CaseAccessPolicy(prisma);
  // docs/06 stage 6.7: the gate reads `subscriptions` and caches in
  // Redis; this suite only needs the direct (uncached) verdict.
  const subscriptions = new SubscriptionAccessService(prisma, {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve('OK'),
    del: () => Promise.resolve(1),
  } as never);

  let clientId: string;
  let otherClientId: string;
  const leaf: Record<string, string> = {};

  async function upsertLeaf(code: string): Promise<string> {
    const cat = code.split('.')[0];
    const parent = await root.practiceArea.upsert({
      where: { code: cat },
      create: { code: cat, name_en: cat, i18n_key: `practice.${cat}`, sort: 0 },
      update: {},
    });
    const row = await root.practiceArea.upsert({
      where: { code },
      create: {
        code,
        parent_id: parent.id,
        name_en: code,
        i18n_key: `practice.${code}`,
        sort: 0,
      },
      update: {},
    });
    return row.id;
  }

  async function newCase(
    area = 'traffic_tickets.speeding',
    states: string[] = ['NJ'],
  ): Promise<string> {
    const c = await root.case.create({
      data: {
        client_id: clientId,
        title: 'Speeding ticket',
        description: 'Got a ticket on the turnpike',
        practice_area_id: leaf[area],
        primary_state_code: states[0],
        budget_mode: 'clarify_later',
      },
    });
    await root.caseState.createMany({
      data: states.map((s, i) => ({
        case_id: c.id,
        state_code: s,
        is_primary: i === 0,
      })),
    });
    return c.id;
  }

  async function newAttorney(opts: {
    verified?: boolean;
    licenses?: [string, 'verified' | 'pending'][];
    areas?: string[];
  }): Promise<string> {
    const u = await root.user.create({ data: { role: 'attorney' } });
    const handle = `att${randomUUID().slice(0, 8)}`;
    await root.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: opts.verified === false ? 'pending' : 'verified',
      },
    });
    // docs/06 §1.2: an active subscription (stage 6.7).
    await root.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    for (const [state, status] of opts.licenses ?? [['NJ', 'verified']]) {
      await root.attorneyLicense.create({
        data: {
          attorney_id: u.id,
          state_code: state,
          bar_number: `${state}-${randomUUID()}`,
          license_status: status,
        },
      });
    }
    for (const area of opts.areas ?? ['traffic_tickets.speeding']) {
      await root.attorneyPracticeArea.create({
        data: { attorney_id: u.id, practice_area_id: leaf[area] },
      });
    }
    return u.id;
  }

  async function newBid(caseId: string, attorneyId: string): Promise<string> {
    const bid = await root.bid.create({
      data: {
        case_id: caseId,
        attorney_id: attorneyId,
        fee_type: 'fixed',
        amount_cents: 60_000,
        message: 'I handle NJ speeding tickets every week.',
        start_availability: 'immediately',
        round_count: 0,
        turn: 'client',
      },
    });
    await root.bidOffer.create({
      data: {
        bid_id: bid.id,
        round_no: 0,
        from_role: 'attorney',
        fee_type: 'fixed',
        amount_cents: 60_000,
        status: 'pending',
      },
    });
    return bid.id;
  }

  const clientActor = () => ({ userId: clientId, role: 'client' as const });

  beforeAll(async () => {
    for (const [code, name] of [
      ['NJ', 'New Jersey'],
      ['NY', 'New York'],
    ]) {
      await root.state.upsert({
        where: { code },
        create: { code, name },
        update: {},
      });
    }
    for (const code of [
      'traffic_tickets.speeding',
      'dui_and_dwi.first_offense_dui',
      'general_practice.general_practice',
      'general_practice.not_sure_or_other',
    ]) {
      leaf[code] = await upsertLeaf(code);
    }
    clientId = (await root.user.create({ data: { role: 'client' } })).id;
    otherClientId = (await root.user.create({ data: { role: 'client' } })).id;
  });

  afterAll(async () => {
    await Promise.all([
      root.$disconnect(),
      prisma.$disconnect(),
      appRole.$disconnect(),
    ]);
  });

  describe('journal row shares the case change transaction', () => {
    it('rolls back together with the case change', async () => {
      const caseId = await newCase();
      await expect(
        withTxRetry(prisma, async (tx) => {
          const { plan } = await cases.apply(tx, {
            caseId,
            action: 'client_close',
          });
          await journal.append(tx, {
            caseId,
            clientId,
            actor: clientActor(),
            event: plan.event,
            payload: { from: plan.from, to: plan.to },
          });
          throw new Error('boom after both writes');
        }),
      ).rejects.toThrow('boom');
      const c = await root.case.findUniqueOrThrow({ where: { id: caseId } });
      expect(c.status).toBe('open');
      expect(c.closed_at).toBeNull();
      expect(await root.caseJournal.count({ where: { case_id: caseId } })).toBe(
        0,
      );
    });

    it('commits together, and a forbidden transition writes nothing', async () => {
      const caseId = await newCase();
      await withTxRetry(prisma, async (tx) => {
        const { plan } = await cases.apply(tx, {
          caseId,
          action: 'client_close',
        });
        await journal.append(tx, {
          caseId,
          clientId,
          actor: clientActor(),
          event: plan.event,
          payload: { from: plan.from, to: plan.to },
        });
      });
      const c = await root.case.findUniqueOrThrow({ where: { id: caseId } });
      expect(c.status).toBe('closed');
      expect(c.closed_at).not.toBeNull();
      const rows = await root.caseJournal.findMany({
        where: { case_id: caseId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        event_type: 'closed',
        actor_user_id: clientId,
        actor_role: 'client',
        prev_hash: null,
      });
      expect(rows[0].retain_until.getUTCFullYear()).toBe(
        rows[0].created_at.getUTCFullYear() + 5,
      );

      await expect(
        withTxRetry(prisma, (tx) =>
          cases.apply(tx, { caseId, action: 'client_restore' }),
        ),
      ).rejects.toMatchObject({ response: { code: 'CASE_INVALID_STATE' } });
      expect(await journal.verifyChain(caseId)).toEqual({
        valid: true,
        checked: 1,
      });
    });

    it('client_delete soft-deletes; the case is then gone for the machine', async () => {
      const caseId = await newCase();
      await withTxRetry(prisma, (tx) =>
        cases.apply(tx, { caseId, action: 'client_delete' }),
      );
      expect(
        (await root.case.findUniqueOrThrow({ where: { id: caseId } }))
          .deleted_at,
      ).not.toBeNull();
      await expect(
        withTxRetry(prisma, (tx) =>
          cases.apply(tx, { caseId, action: 'client_edit' }),
        ),
      ).rejects.toMatchObject({ response: { code: 'CASE_NOT_FOUND' } });
    });
  });

  describe('hash chain', () => {
    let caseId: string;

    it('stays linear under concurrent appends made as lawbid_app', async () => {
      caseId = await newCase();
      const n = 8;
      await Promise.all(
        Array.from({ length: n }, (_, i) =>
          withTxRetry(appPrisma, (tx) =>
            journal.append(tx, {
              caseId,
              clientId,
              actor: clientActor(),
              event: 'updated',
              payload: { i, nested: { b: [1, 2], a: 'x' } },
            }),
          ),
        ),
      );
      const rows = await root.caseJournal.findMany({
        where: { case_id: caseId },
        orderBy: { created_at: 'asc' },
      });
      expect(rows).toHaveLength(n);
      expect(rows.filter((r) => r.prev_hash === null)).toHaveLength(1);
      expect(new Set(rows.map((r) => r.prev_hash)).size).toBe(n);
      expect(await journal.verifyChain(caseId)).toEqual({
        valid: true,
        checked: n,
      });
      expect(await journal.verifyChain(caseId, appRole)).toEqual({
        valid: true,
        checked: n,
      });
    });

    it('detects an edited row', async () => {
      const rows = await root.caseJournal.findMany({
        where: { case_id: caseId },
        orderBy: { created_at: 'asc' },
      });
      await root.$executeRaw`
        UPDATE case_journal SET payload = '{"i": 999}'::JSONB
        WHERE id = ${rows[3].id}::UUID`;
      expect(await journal.verifyChain(caseId)).toEqual({
        valid: false,
        checked: 3,
        brokenAt: { id: rows[3].id, reason: 'hash_mismatch' },
      });
    });

    it('detects a deleted row', async () => {
      const other = await newCase();
      for (const event of ['created', 'updated', 'closed'] as const) {
        await withTxRetry(prisma, (tx) =>
          journal.append(tx, {
            caseId: other,
            clientId,
            actor: clientActor(),
            event,
            payload: { event },
          }),
        );
      }
      const rows = await root.caseJournal.findMany({
        where: { case_id: other },
        orderBy: { created_at: 'asc' },
      });
      await root.caseJournal.delete({ where: { id: rows[1].id } });
      expect(await journal.verifyChain(other)).toMatchObject({
        valid: false,
        brokenAt: { id: rows[2].id, reason: 'link_mismatch' },
      });
    });

    it('lawbid_app cannot UPDATE or DELETE case_journal (docs/02 §6.2)', async () => {
      const row = await root.caseJournal.findFirstOrThrow({
        where: { case_id: caseId },
      });
      await expect(
        appRole.caseJournal.update({
          where: { id: row.id },
          data: { payload: { forged: true } },
        }),
      ).rejects.toThrow(/privilege/i);
      await expect(
        appRole.caseJournal.delete({ where: { id: row.id } }),
      ).rejects.toThrow(/privilege/i);
      await expect(
        appRole.$executeRaw`UPDATE case_journal SET row_hash = 'x' WHERE id = ${row.id}::UUID`,
      ).rejects.toThrow(/privilege/i);
      await expect(
        appRole.$executeRaw`DELETE FROM case_journal WHERE case_id = ${caseId}::UUID`,
      ).rejects.toThrow(/privilege/i);
      expect(await root.caseJournal.count({ where: { case_id: caseId } })).toBe(
        8,
      );
    });
  });

  describe('BidStateMachine + offers through a negotiation and accept (§6–§7)', () => {
    it('counter, counter, accept; the other bid is auto-rejected; journal chain valid', async () => {
      const caseId = await newCase();
      const a1 = await newAttorney({});
      const a2 = await newAttorney({});
      const bid1 = await newBid(caseId, a1);
      const bid2 = await newBid(caseId, a2);

      await withTxRetry(prisma, async (tx) => {
        const { plan } = await bids.apply(tx, {
          bidId: bid1,
          action: 'counter',
          by: 'client',
          amountCents: 45_000,
        });
        await journal.append(tx, {
          caseId,
          clientId,
          actor: clientActor(),
          attorneyId: a1,
          event: plan.event,
          payload: { bidId: bid1, amountCents: 45_000, round: 1 },
        });
      });
      // Not the client's turn any more.
      await expect(
        withTxRetry(prisma, (tx) =>
          bids.apply(tx, { bidId: bid1, action: 'accept', by: 'client' }),
        ),
      ).rejects.toMatchObject({ response: { code: 'BID_NOT_YOUR_TURN' } });
      await withTxRetry(prisma, (tx) =>
        bids.apply(tx, {
          bidId: bid1,
          action: 'counter',
          by: 'attorney',
          amountCents: 50_000,
          message: 'Meet in the middle',
        }),
      );

      await withTxRetry(prisma, async (tx) => {
        const accepted = await bids.apply(tx, {
          bidId: bid1,
          action: 'accept',
          by: 'client',
        });
        const moved = await cases.apply(tx, {
          caseId,
          action: 'accept_bid',
          acceptedBidId: bid1,
        });
        const rejected = await bids.applyToActive(
          tx,
          { caseId, exceptBidId: bid1 },
          'auto_reject',
        );
        await journal.append(tx, {
          caseId,
          clientId,
          actor: clientActor(),
          attorneyId: a1,
          event: accepted.plan.event,
          payload: {
            bidId: bid1,
            amountCents: accepted.bid.amount_cents,
            caseTo: moved.plan.to,
          },
        });
        for (const r of rejected) {
          await journal.append(tx, {
            caseId,
            clientId,
            actor: { userId: null, role: null },
            attorneyId: r.attorney_id,
            event: r.plan.event,
            payload: { bidId: r.id, reason: 'another_bid_accepted' },
          });
        }
      });

      const c = await root.case.findUniqueOrThrow({ where: { id: caseId } });
      expect(c).toMatchObject({ status: 'in_progress', accepted_bid_id: bid1 });
      const b1 = await root.bid.findUniqueOrThrow({ where: { id: bid1 } });
      expect(b1).toMatchObject({
        status: 'accepted',
        round_count: 2,
        turn: 'client',
        amount_cents: 50_000,
      });
      expect(b1.decided_at).not.toBeNull();
      const offers = await root.bidOffer.findMany({
        where: { bid_id: bid1 },
        orderBy: { round_no: 'asc' },
      });
      expect(
        offers.map((o) => [o.round_no, o.from_role, o.amount_cents, o.status]),
      ).toEqual([
        [0, 'attorney', 60_000, 'countered'],
        [1, 'client', 45_000, 'countered'],
        [2, 'attorney', 50_000, 'accepted'],
      ]);
      expect(
        (await root.bid.findUniqueOrThrow({ where: { id: bid2 } })).status,
      ).toBe('rejected_auto');
      expect(
        (await root.bidOffer.findFirstOrThrow({ where: { bid_id: bid2 } }))
          .status,
      ).toBe('superseded');

      const rows = await root.caseJournal.findMany({
        where: { case_id: caseId },
        orderBy: { created_at: 'asc' },
      });
      expect(rows.map((r) => [r.event_type, r.attorney_id])).toEqual([
        ['offer_made', a1],
        ['bid_accepted', a1],
        ['bid_rejected', a2],
      ]);
      expect(await journal.verifyChain(caseId)).toEqual({
        valid: true,
        checked: 3,
      });

      // Final statuses stay final.
      await expect(
        withTxRetry(prisma, (tx) =>
          bids.apply(tx, { bidId: bid2, action: 'withdraw', by: 'attorney' }),
        ),
      ).rejects.toMatchObject({ response: { code: 'BID_INVALID_STATE' } });
    });
  });

  describe('CaseAccessPolicy (deny by default, §4.1 / §5.4)', () => {
    it('owner vs other client', async () => {
      const caseId = await newCase();
      expect(
        await policy.decide({ userId: clientId, role: 'client' }, caseId),
      ).toEqual({
        kind: 'owner',
        clientIdentityVisible: true,
      });
      expect(
        await policy.decide({ userId: otherClientId, role: 'client' }, caseId),
      ).toBeNull();
    });

    it('attorney visibility follows licenses, practice, verification and status', async () => {
      const njSpeeding = await newCase('traffic_tickets.speeding', ['NJ']);
      const nyPlusNj = await newCase('traffic_tickets.speeding', ['NY', 'NJ']);
      const nySpeeding = await newCase('traffic_tickets.speeding', ['NY']);
      const njDui = await newCase('dui_and_dwi.first_offense_dui', ['NJ']);
      const njNotSure = await newCase('general_practice.not_sure_or_other', [
        'NJ',
      ]);

      const att = await newAttorney({
        licenses: [
          ['NJ', 'verified'],
          ['NY', 'pending'],
        ],
      });
      const generalist = await newAttorney({
        areas: ['general_practice.general_practice'],
      });
      const unverified = await newAttorney({ verified: false });
      const v = (id: string) => ({ userId: id, role: 'attorney' });
      const prospect = {
        kind: 'attorney_prospect',
        clientIdentityVisible: false,
        inPractice: true,
      };
      // Owner 2026-09-30: other practices are visible (and biddable) in
      // licensed states, marked as outside the attorney's practices.
      const outside = { ...prospect, inPractice: false };

      expect(await policy.decide(v(att), njSpeeding)).toEqual(prospect);
      expect(await policy.decide(v(att), nyPlusNj)).toEqual(prospect);
      expect(await policy.decide(v(att), nySpeeding)).toBeNull(); // pending NY license
      expect(await policy.decide(v(att), njDui)).toEqual(outside); // other practice
      expect(await policy.decide(v(att), njNotSure)).toEqual(outside);
      expect(await policy.decide(v(generalist), njNotSure)).toEqual(prospect); // §4.1 exception
      expect(await policy.decide(v(generalist), njSpeeding)).toEqual(outside);
      expect(await policy.decide(v(unverified), njSpeeding)).toBeNull();
      await expect(
        policy.assertCanView(v(unverified), njDui),
      ).rejects.toMatchObject({
        response: { code: 'CASE_NOT_FOUND' },
      });

      // Participant access survives the case leaving `open`; deletion ends it.
      const bidId = await newBid(njDui, att);
      await root.case.update({
        where: { id: njDui },
        data: { status: 'in_progress' },
      });
      expect(await policy.decide(v(att), njDui)).toEqual({
        kind: 'attorney_participant',
        clientIdentityVisible: false,
        inPractice: false,
      });
      await root.case.update({
        where: { id: njSpeeding },
        data: { status: 'closed' },
      });
      expect(await policy.decide(v(att), njSpeeding)).toBeNull();
      await root.case.update({
        where: { id: njDui },
        data: { deleted_at: new Date() },
      });
      expect(await policy.decide(v(att), njDui)).toBeNull();
      expect(bidId).toBeTruthy();
    });

    it('SubscriptionAccessService (docs/06 §1.2): active row is active, canceled or missing is not', async () => {
      const active = await newAttorney({});
      expect(await subscriptions.isActive(active)).toBe(true);
      const canceled = await newAttorney({});
      await root.subscription.update({
        where: { user_id: canceled },
        data: { status: 'canceled' },
      });
      expect(await subscriptions.isActive(canceled)).toBe(false);
      expect(await subscriptions.isActive(clientId)).toBe(false);
    });
  });
});

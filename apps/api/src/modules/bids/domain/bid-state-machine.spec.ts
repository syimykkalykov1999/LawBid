import { ConflictException } from '@nestjs/common';
import type { BidStatus, FeeType, PartyRole, Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  BID_ACTIONS,
  BidStateMachine,
  INITIAL_BID_STATE,
  MAX_COUNTER_ROUNDS,
  planBidTransition,
  type BidAction,
  type BidSnapshot,
} from './bid-state-machine';

const STATUSES: BidStatus[] = [
  'active',
  'accepted',
  'rejected_by_client',
  'rejected_auto',
  'withdrawn',
  'failed_negotiation',
];
const FEES: FeeType[] = ['fixed', 'hourly', 'free_consultation'];
const ACTORS: (PartyRole | 'system')[] = ['client', 'attorney', 'system'];
const TURNS: PartyRole[] = ['client', 'attorney'];
const ROUNDS = [0, 1, 2, 3, 4, 5];
const now = new Date('2026-09-27T12:00:00.000Z');

type Outcome =
  | { kind: 'programming_error' }
  | { kind: 'conflict'; code: ErrorCode }
  | { kind: 'ok'; to: BidStatus; event: string };

/**
 * docs/04 §2, §5.3, §6.1–§6.3, §7 written as a plain decision list,
 * independently of the machine.
 */
function expected(
  status: BidStatus,
  action: BidAction,
  by: PartyRole | 'system',
  turn: PartyRole,
  round: number,
  fee: FeeType,
): Outcome {
  const actors: Record<BidAction, (PartyRole | 'system')[]> = {
    counter: ['client', 'attorney'],
    accept: ['client', 'attorney'],
    decline: ['client'],
    withdraw: ['attorney'],
    system_withdraw: ['system'],
    auto_reject: ['system'],
  };
  if (!actors[action].includes(by)) return { kind: 'programming_error' };
  if (status !== 'active') {
    return { kind: 'conflict', code: ErrorCode.BID_INVALID_STATE };
  }
  const mine = turn === by;
  switch (action) {
    case 'counter':
      if (!mine) return { kind: 'conflict', code: ErrorCode.BID_NOT_YOUR_TURN };
      if (fee === 'free_consultation') {
        return { kind: 'conflict', code: ErrorCode.BID_COUNTER_NOT_ALLOWED };
      }
      if (round === 5) {
        return { kind: 'conflict', code: ErrorCode.BID_MAX_ROUNDS_REACHED };
      }
      return { kind: 'ok', to: 'active', event: 'offer_made' };
    case 'accept':
      if (!mine) return { kind: 'conflict', code: ErrorCode.BID_NOT_YOUR_TURN };
      return { kind: 'ok', to: 'accepted', event: 'bid_accepted' };
    case 'decline':
      return round === 5 && mine
        ? { kind: 'ok', to: 'failed_negotiation', event: 'negotiation_failed' }
        : { kind: 'ok', to: 'rejected_by_client', event: 'bid_rejected' };
    case 'withdraw':
      return round === 5 && mine
        ? { kind: 'ok', to: 'failed_negotiation', event: 'negotiation_failed' }
        : { kind: 'ok', to: 'withdrawn', event: 'bid_withdrawn' };
    case 'system_withdraw':
      return { kind: 'ok', to: 'withdrawn', event: 'bid_withdrawn' };
    case 'auto_reject':
      return { kind: 'ok', to: 'rejected_auto', event: 'bid_rejected' };
  }
}

function actual(
  bid: BidSnapshot,
  action: BidAction,
  by: PartyRole | 'system',
): Outcome {
  try {
    const p = planBidTransition(bid, action, by, now);
    return { kind: 'ok', to: p.to, event: p.event };
  } catch (e) {
    if (e instanceof ConflictException) {
      return {
        kind: 'conflict',
        code: (e.getResponse() as { code: ErrorCode }).code,
      };
    }
    return { kind: 'programming_error' };
  }
}

describe('BidStateMachine (docs/04 §5–§7)', () => {
  it('matches §6.3 for every status × action × actor × turn × round × fee', () => {
    const mismatches: string[] = [];
    let n = 0;
    for (const status of STATUSES)
      for (const action of BID_ACTIONS)
        for (const by of ACTORS)
          for (const turn of TURNS)
            for (const round of ROUNDS)
              for (const fee of FEES) {
                n++;
                const bid = { status, turn, round_count: round, fee_type: fee };
                const want = expected(status, action, by, turn, round, fee);
                const got = actual(bid, action, by);
                if (JSON.stringify(want) !== JSON.stringify(got)) {
                  mismatches.push(
                    `${status}/${action}/${by}/turn=${turn}/r=${round}/${fee}: want ${JSON.stringify(want)} got ${JSON.stringify(got)}`,
                  );
                }
              }
    expect(n).toBe(6 * 6 * 3 * 2 * 6 * 3);
    expect(mismatches).toEqual([]);
  });

  // Hand-picked rows of §6.3 with their full effect.
  const active = (
    turn: PartyRole,
    round_count = 0,
    fee_type: FeeType = 'fixed',
  ): BidSnapshot => ({ status: 'active', turn, round_count, fee_type });

  it.each<
    [
      string,
      BidSnapshot,
      BidAction,
      PartyRole | 'system',
      Partial<ReturnType<typeof planBidTransition>>,
    ]
  >([
    [
      'client counters round 0 → round 1, attorney to move',
      active('client', 0),
      'counter',
      'client',
      {
        to: 'active',
        data: { round_count: 1, turn: 'attorney' },
        pendingOfferTo: 'countered',
        newOffer: { round_no: 1, from_role: 'client' },
      },
    ],
    [
      'attorney counters round 4 → round 5',
      active('attorney', 4),
      'counter',
      'attorney',
      {
        data: { round_count: 5, turn: 'client' },
        newOffer: { round_no: 5, from_role: 'attorney' },
      },
    ],
    [
      'client accepts the attorney offer',
      active('client', 2),
      'accept',
      'client',
      {
        to: 'accepted',
        data: { status: 'accepted', decided_at: now },
        pendingOfferTo: 'accepted',
      },
    ],
    [
      'attorney accepts the binding client counter (§6.1)',
      active('attorney', 3),
      'accept',
      'attorney',
      { to: 'accepted', pendingOfferTo: 'accepted' },
    ],
    [
      'free consultation can be accepted',
      active('client', 0, 'free_consultation'),
      'accept',
      'client',
      { to: 'accepted' },
    ],
    [
      'client declines before round 5 → rejected_by_client',
      active('client', 4),
      'decline',
      'client',
      {
        to: 'rejected_by_client',
        event: 'bid_rejected',
        pendingOfferTo: 'declined',
      },
    ],
    [
      'client declines after the 5th counter on their turn → failed_negotiation (§6.2)',
      active('client', 5),
      'decline',
      'client',
      { to: 'failed_negotiation', event: 'negotiation_failed' },
    ],
    [
      'attorney withdraws after the 5th counter on their turn → failed_negotiation',
      active('attorney', 5),
      'withdraw',
      'attorney',
      {
        to: 'failed_negotiation',
        event: 'negotiation_failed',
        pendingOfferTo: 'declined',
      },
    ],
    [
      'attorney withdraws at round 5 while waiting for the client → withdrawn',
      active('client', 5),
      'withdraw',
      'attorney',
      { to: 'withdrawn', event: 'bid_withdrawn' },
    ],
    [
      'another bid accepted → rejected_auto, offer superseded (§7 step 5)',
      active('attorney', 2),
      'auto_reject',
      'system',
      { to: 'rejected_auto', pendingOfferTo: 'superseded' },
    ],
    [
      'subscription lapsed → withdrawn, offer superseded (§2)',
      active('client', 5),
      'system_withdraw',
      'system',
      { to: 'withdrawn', event: 'bid_withdrawn', pendingOfferTo: 'superseded' },
    ],
  ])('%s', (_label, bid, action, by, want) => {
    expect(planBidTransition(bid, action, by, now)).toMatchObject(want);
  });

  it('a new bid starts active, round 0, client to move (§5.1)', () => {
    expect(INITIAL_BID_STATE).toEqual({
      status: 'active',
      round_count: 0,
      turn: 'client',
    });
    expect(MAX_COUNTER_ROUNDS).toBe(5);
  });

  describe('apply (guarded write in the caller transaction)', () => {
    const bidRow = {
      id: 'b1',
      case_id: 'c1',
      attorney_id: 'a1',
      status: 'active' as BidStatus,
      turn: 'client' as PartyRole,
      round_count: 1,
      fee_type: 'fixed' as FeeType,
      amount_cents: 50_000,
    };
    function fakeTx(
      opts: {
        bidCount?: number;
        offerCount?: number;
        bid?: object | null;
      } = {},
    ) {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'b1' }]),
        bid: {
          findUnique: jest
            .fn()
            .mockResolvedValue(opts.bid === undefined ? bidRow : opts.bid),
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: opts.bidCount ?? 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(bidRow),
          findMany: jest
            .fn()
            .mockResolvedValue([bidRow, { ...bidRow, id: 'b2' }]),
        },
        bidOffer: {
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: opts.offerCount ?? 1 }),
          create: jest.fn().mockResolvedValue({}),
        },
      };
      return { tx, client: tx as unknown as Prisma.TransactionClient };
    }
    const machine = new BidStateMachine();

    it('counter: locks the bid row, CAS-updates it, closes the pending offer, adds the next one', async () => {
      const { tx, client } = fakeTx();
      const { plan } = await machine.apply(client, {
        bidId: 'b1',
        action: 'counter',
        by: 'client',
        amountCents: 40_000,
        message: 'Can you do 400?',
        now,
      });
      expect(plan.event).toBe('offer_made');
      const sql = (tx.$queryRaw.mock.calls[0][0] as string[]).join('?');
      expect(sql).toMatch(/FOR UPDATE/);
      expect(tx.bid.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', status: 'active', round_count: 1, turn: 'client' },
        data: { round_count: 2, turn: 'attorney', amount_cents: 40_000 },
      });
      expect(tx.bidOffer.updateMany).toHaveBeenCalledWith({
        where: { bid_id: 'b1', round_no: 1, status: 'pending' },
        data: { status: 'countered' },
      });
      expect(tx.bidOffer.create).toHaveBeenCalledWith({
        data: {
          bid_id: 'b1',
          round_no: 2,
          from_role: 'client',
          fee_type: 'fixed',
          amount_cents: 40_000,
          message: 'Can you do 400?',
          status: 'pending',
          created_at: now,
        },
      });
    });

    it('counter without a valid amount is a programming error', async () => {
      const { client } = fakeTx();
      await expect(
        machine.apply(client, {
          bidId: 'b1',
          action: 'counter',
          by: 'client',
          amountCents: 0,
        }),
      ).rejects.toThrow(/amountCents/);
    });

    it('wrong turn → BID_NOT_YOUR_TURN and nothing written', async () => {
      const { tx, client } = fakeTx();
      await expect(
        machine.apply(client, {
          bidId: 'b1',
          action: 'accept',
          by: 'attorney',
        }),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.BID_NOT_YOUR_TURN },
      });
      expect(tx.bid.updateMany).not.toHaveBeenCalled();
    });

    it('lost race → BID_INVALID_STATE', async () => {
      const { client } = fakeTx({ bidCount: 0 });
      await expect(
        machine.apply(client, { bidId: 'b1', action: 'decline', by: 'client' }),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.BID_INVALID_STATE },
      });
    });

    it('missing pending offer breaks the §6.1 invariant loudly', async () => {
      const { client } = fakeTx({ offerCount: 0 });
      await expect(
        machine.apply(client, { bidId: 'b1', action: 'accept', by: 'client' }),
      ).rejects.toThrow(/no pending offer/);
    });

    it('unknown bid → 404', async () => {
      const { client } = fakeTx({ bid: null });
      await expect(
        machine.apply(client, { bidId: 'b1', action: 'accept', by: 'client' }),
      ).rejects.toMatchObject({ response: { code: ErrorCode.NOT_FOUND } });
    });

    it('system actions do not take row locks', async () => {
      const { tx, client } = fakeTx();
      await machine.apply(client, {
        bidId: 'b1',
        action: 'auto_reject',
        by: 'system',
      });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('applyToActive rejects every other active bid of a case and supersedes their offers', async () => {
      const { tx, client } = fakeTx({ bidCount: 2 });
      const res = await machine.applyToActive(
        client,
        { caseId: 'c1', exceptBidId: 'b0' },
        'auto_reject',
        now,
      );
      expect(res.map((r) => [r.id, r.plan.to])).toEqual([
        ['b1', 'rejected_auto'],
        ['b2', 'rejected_auto'],
      ]);
      expect(tx.bid.findMany).toHaveBeenCalledWith({
        where: { status: 'active', case_id: 'c1', id: { not: 'b0' } },
      });
      expect(tx.bid.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['b1', 'b2'] }, status: 'active' },
        data: { status: 'rejected_auto', decided_at: now },
      });
      expect(tx.bidOffer.updateMany).toHaveBeenCalledWith({
        where: { bid_id: { in: ['b1', 'b2'] }, status: 'pending' },
        data: { status: 'superseded' },
      });
    });

    it('applyToActive needs a scope and reports concurrent changes', async () => {
      const { client } = fakeTx({ bidCount: 1 });
      await expect(
        machine.applyToActive(client, {}, 'auto_reject'),
      ).rejects.toThrow(/caseId or attorneyId/);
      await expect(
        machine.applyToActive(client, { attorneyId: 'a1' }, 'system_withdraw'),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.BID_INVALID_STATE },
      });
    });
  });
});

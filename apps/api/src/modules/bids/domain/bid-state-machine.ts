import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Bid,
  BidStatus,
  CaseJournalEvent,
  OfferStatus,
  PartyRole,
  Prisma,
} from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { assertOfferTransition } from '../../negotiations/domain/offer-state-machine';

/**
 * docs/04_CASES_BIDS.md §5–§7 — bid statuses and the negotiation (§6.3
 * table). Every bid change goes through this machine (.cursorrules:
 * "изменения бидов через BidStateMachine"); the bid_offers status step
 * that goes with it (OfferStateMachine) is written here too, so a bid and
 * its negotiation history can never disagree.
 *
 * `planBidTransition` is pure and unit-tested exhaustively.
 * `BidStateMachine.apply` does the guarded write inside the caller's
 * transaction; the caller appends `plan.event` to case_journal via
 * CaseJournalService.append() in the same transaction.
 */
export type BidAction =
  // §6.3: counter-offer by the party whose turn it is.
  | 'counter'
  // §6.3 / §7: accept the other party's latest offer (your turn).
  | 'accept'
  // §6.3: client rejects the bid.
  | 'decline'
  // §5.3 / §6.3: attorney withdraws the bid.
  | 'withdraw'
  // §2 subscription lapsed / §7 step 2 BID_ATTORNEY_INACTIVE: the system
  // withdraws the attorney's active bid.
  | 'system_withdraw'
  // §7 step 5 another bid accepted; §3.5 case closed/deleted; §10.2 case
  // archived.
  | 'auto_reject';

/** Who may perform the action: a party, or the system. */
export const BID_ACTION_ACTORS: Readonly<
  Record<BidAction, readonly (PartyRole | 'system')[]>
> = {
  counter: ['client', 'attorney'],
  accept: ['client', 'attorney'],
  decline: ['client'],
  withdraw: ['attorney'],
  system_withdraw: ['system'],
  auto_reject: ['system'],
};

export const BID_ACTIONS = Object.keys(BID_ACTION_ACTORS) as BidAction[];

/** §6.1: at most 5 counter-offers per bid (bids.round_count ≤ 5). */
export const MAX_COUNTER_ROUNDS = 5;

/** Only `active` bids can change; every other status is final (§5–§7). */
export const BID_FINAL_STATUSES: readonly BidStatus[] = [
  'accepted',
  'rejected_by_client',
  'rejected_auto',
  'withdrawn',
  'failed_negotiation',
];

/** §5.1: a new bid is active, round 0, the client's turn. */
export const INITIAL_BID_STATE = {
  status: 'active',
  round_count: 0,
  turn: 'client',
} as const satisfies Pick<Bid, 'status' | 'round_count' | 'turn'>;

export type BidSnapshot = Pick<
  Bid,
  'status' | 'turn' | 'round_count' | 'fee_type'
>;

export interface BidTransitionPlan {
  action: BidAction;
  from: BidStatus;
  to: BidStatus;
  event: CaseJournalEvent;
  /** Column updates of the bid (without the caller's new amount). */
  data: Prisma.BidUncheckedUpdateManyInput;
  /** What happens to the pending offer (round_no = round_count). */
  pendingOfferTo: OfferStatus;
  /** counter only: the new pending offer's round and author. */
  newOffer?: { round_no: number; from_role: PartyRole };
}

function conflict(
  code: ErrorCode,
  message: string,
  details: Record<string, unknown>,
): ConflictException {
  return new ConflictException({ code, message, details });
}

function otherParty(role: PartyRole): PartyRole {
  return role === 'client' ? 'attorney' : 'client';
}

/**
 * Pure: validates `action` by `by` on `bid` and returns the resulting
 * status, journal event and column changes. Throws 409 with
 * BID_INVALID_STATE / BID_NOT_YOUR_TURN / BID_MAX_ROUNDS_REACHED /
 * BID_COUNTER_NOT_ALLOWED.
 */
export function planBidTransition(
  bid: BidSnapshot,
  action: BidAction,
  by: PartyRole | 'system',
  now: Date,
): BidTransitionPlan {
  if (!BID_ACTION_ACTORS[action].includes(by)) {
    // Who may call what is the access policy's job; reaching here with the
    // wrong actor is a programming error, not a user-facing state.
    throw new Error(`bid action ${action} cannot be performed by ${by}`);
  }
  const details = { action, status: bid.status };
  if (bid.status !== 'active') {
    throw conflict(
      ErrorCode.BID_INVALID_STATE,
      'This bid can no longer be changed.',
      details,
    );
  }
  const yourTurn = by !== 'system' && bid.turn === by;
  const lastRound = bid.round_count >= MAX_COUNTER_ROUNDS;

  switch (action) {
    case 'counter': {
      if (!yourTurn) throw notYourTurn(details);
      if (bid.fee_type === 'free_consultation') {
        throw conflict(
          ErrorCode.BID_COUNTER_NOT_ALLOWED,
          'A free consultation can only be accepted or declined.',
          details,
        );
      }
      if (lastRound) {
        throw conflict(
          ErrorCode.BID_MAX_ROUNDS_REACHED,
          'The maximum number of counter-offers has been reached.',
          details,
        );
      }
      const party = by;
      return {
        action,
        from: 'active',
        to: 'active',
        event: 'offer_made',
        data: {
          round_count: bid.round_count + 1,
          turn: otherParty(party),
        },
        pendingOfferTo: 'countered',
        newOffer: { round_no: bid.round_count + 1, from_role: party },
      };
    }
    case 'accept':
      if (!yourTurn) throw notYourTurn(details);
      return {
        action,
        from: 'active',
        to: 'accepted',
        event: 'bid_accepted',
        data: { status: 'accepted', decided_at: now },
        pendingOfferTo: 'accepted',
      };
    case 'decline':
    case 'withdraw': {
      // §6.2: after the 5th counter-offer the receiving party can only
      // accept or reject; rejecting then is failed_negotiation.
      const failed = lastRound && yourTurn;
      const to: BidStatus = failed
        ? 'failed_negotiation'
        : action === 'decline'
          ? 'rejected_by_client'
          : 'withdrawn';
      const event: CaseJournalEvent = failed
        ? 'negotiation_failed'
        : action === 'decline'
          ? 'bid_rejected'
          : 'bid_withdrawn';
      return {
        action,
        from: 'active',
        to,
        event,
        data: { status: to, decided_at: now },
        pendingOfferTo: 'declined',
      };
    }
    case 'system_withdraw':
      return {
        action,
        from: 'active',
        to: 'withdrawn',
        event: 'bid_withdrawn',
        data: { status: 'withdrawn', decided_at: now },
        pendingOfferTo: 'superseded',
      };
    case 'auto_reject':
      return {
        action,
        from: 'active',
        to: 'rejected_auto',
        event: 'bid_rejected',
        data: { status: 'rejected_auto', decided_at: now },
        pendingOfferTo: 'superseded',
      };
  }
}

function notYourTurn(details: Record<string, unknown>): ConflictException {
  return conflict(
    ErrorCode.BID_NOT_YOUR_TURN,
    "It is the other party's turn.",
    details,
  );
}

export function bidNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Bid not found.',
  });
}

export interface ApplyBidActionInput {
  bidId: string;
  action: BidAction;
  by: PartyRole | 'system';
  now?: Date;
  /** counter only: the new amount in cents (§6.1: only the amount is
   * negotiated, the fee type stays). */
  amountCents?: number;
  /** counter only: optional note (≤500 chars, validated by the DTO). */
  message?: string | null;
}

/** Negotiation operations lock the bid row (§6.3 "SELECT ... FOR UPDATE по
 * бид-строке"); system actions rely on the compare-and-set below. */
const LOCKING_ACTIONS: ReadonlySet<BidAction> = new Set([
  'counter',
  'accept',
  'decline',
  'withdraw',
]);

export interface BulkBidResult {
  id: string;
  case_id: string;
  attorney_id: string;
  plan: BidTransitionPlan;
}

@Injectable()
export class BidStateMachine {
  async apply(
    tx: Prisma.TransactionClient,
    input: ApplyBidActionInput,
  ): Promise<{ bid: Bid; plan: BidTransitionPlan }> {
    const now = input.now ?? new Date();
    if (LOCKING_ACTIONS.has(input.action)) {
      await tx.$queryRaw`SELECT id FROM bids WHERE id = ${input.bidId}::UUID FOR UPDATE`;
    }
    const bid = await tx.bid.findUnique({ where: { id: input.bidId } });
    if (!bid) throw bidNotFound();
    const plan = planBidTransition(bid, input.action, input.by, now);

    const data: Prisma.BidUncheckedUpdateManyInput = { ...plan.data };
    if (plan.newOffer) {
      const amount = input.amountCents;
      if (amount === undefined || !Number.isInteger(amount) || amount <= 0) {
        throw new Error('counter needs a positive integer amountCents');
      }
      data.amount_cents = amount;
    }
    const { count } = await tx.bid.updateMany({
      where: {
        id: bid.id,
        status: 'active',
        round_count: bid.round_count,
        turn: bid.turn,
      },
      data,
    });
    if (count !== 1) {
      throw conflict(
        ErrorCode.BID_INVALID_STATE,
        'This bid was changed concurrently.',
        { action: input.action, status: bid.status },
      );
    }
    await this.closePendingOffer(
      tx,
      bid.id,
      bid.round_count,
      plan.pendingOfferTo,
    );
    if (plan.newOffer) {
      await tx.bidOffer.create({
        data: {
          bid_id: bid.id,
          round_no: plan.newOffer.round_no,
          from_role: plan.newOffer.from_role,
          fee_type: bid.fee_type,
          amount_cents: data.amount_cents as number,
          message: input.message ?? null,
          status: 'pending',
          created_at: now,
        },
      });
    }
    const updated = await tx.bid.findUniqueOrThrow({ where: { id: bid.id } });
    return { bid: updated, plan };
  }

  /**
   * System transition of every active bid matching `where` (a case's
   * other bids on accept/close/delete/archive, or an attorney's bids when
   * the subscription lapses). Returns the affected bids so the caller can
   * journal and notify each.
   */
  async applyToActive(
    tx: Prisma.TransactionClient,
    where: { caseId?: string; attorneyId?: string; exceptBidId?: string },
    action: 'auto_reject' | 'system_withdraw',
    now: Date = new Date(),
  ): Promise<BulkBidResult[]> {
    if (!where.caseId && !where.attorneyId) {
      throw new Error('applyToActive needs caseId or attorneyId');
    }
    const filter: Prisma.BidWhereInput = {
      status: 'active',
      ...(where.caseId ? { case_id: where.caseId } : {}),
      ...(where.attorneyId ? { attorney_id: where.attorneyId } : {}),
      ...(where.exceptBidId ? { id: { not: where.exceptBidId } } : {}),
    };
    const bids = await tx.bid.findMany({ where: filter });
    if (bids.length === 0) return [];
    const results = bids.map((b) => ({
      id: b.id,
      case_id: b.case_id,
      attorney_id: b.attorney_id,
      plan: planBidTransition(b, action, 'system', now),
    }));
    const { count } = await tx.bid.updateMany({
      where: { id: { in: bids.map((b) => b.id) }, status: 'active' },
      data: results[0].plan.data,
    });
    if (count !== bids.length) {
      throw conflict(
        ErrorCode.BID_INVALID_STATE,
        'Bids were changed concurrently.',
        { action },
      );
    }
    assertOfferTransition('pending', results[0].plan.pendingOfferTo);
    await tx.bidOffer.updateMany({
      where: { bid_id: { in: bids.map((b) => b.id) }, status: 'pending' },
      data: { status: results[0].plan.pendingOfferTo },
    });
    return results;
  }

  private async closePendingOffer(
    tx: Prisma.TransactionClient,
    bidId: string,
    roundNo: number,
    to: OfferStatus,
  ): Promise<void> {
    assertOfferTransition('pending', to);
    const { count } = await tx.bidOffer.updateMany({
      where: { bid_id: bidId, round_no: roundNo, status: 'pending' },
      data: { status: to },
    });
    if (count !== 1) {
      // §6.1 invariant: exactly one pending offer, round_no = round_count.
      throw new Error(`bid ${bidId}: no pending offer for round ${roundNo}`);
    }
  }
}

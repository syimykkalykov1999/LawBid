import { Injectable } from '@nestjs/common';
import type { OfferStatus } from '@prisma/client';

/**
 * docs/02_DATABASE.md §4.D bid_offers: append-only except the single
 * `pending -> accepted | declined | countered | superseded` step, and
 * docs/04_CASES_BIDS.md §6.3 / §7 for when each happens:
 *  - accepted:   the bid is accepted on this offer (§7 step 3);
 *  - declined:   the receiving party rejects/withdraws (§6.2, §6.3);
 *  - countered:  a counter-offer replaces it (§6.3 counter);
 *  - superseded: the bid ends for another reason — another bid accepted,
 *    case closed/archived/deleted, attorney withdrawn by the system (§7
 *    step 5, §3.5, §10.2, §2).
 * Every other status is final. Only one offer per bid is pending: the one
 * with round_no = bids.round_count.
 */
export const OFFER_TRANSITIONS: Readonly<
  Record<OfferStatus, readonly OfferStatus[]>
> = {
  pending: ['accepted', 'declined', 'countered', 'superseded'],
  accepted: [],
  declined: [],
  countered: [],
  superseded: [],
};

export const OFFER_STATUSES = Object.keys(OFFER_TRANSITIONS) as OfferStatus[];

export function canTransitionOffer(
  from: OfferStatus,
  to: OfferStatus,
): boolean {
  return OFFER_TRANSITIONS[from].includes(to);
}

export function assertOfferTransition(
  from: OfferStatus,
  to: OfferStatus,
): void {
  if (!canTransitionOffer(from, to)) {
    throw new Error(`bid_offers: ${from} -> ${to} is not allowed`);
  }
}

/** Injectable face of the offer table for services that negotiate. */
@Injectable()
export class OfferStateMachine {
  canTransition(from: OfferStatus, to: OfferStatus): boolean {
    return canTransitionOffer(from, to);
  }

  assertTransition(from: OfferStatus, to: OfferStatus): void {
    assertOfferTransition(from, to);
  }
}

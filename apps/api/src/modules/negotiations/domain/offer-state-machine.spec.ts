import type { OfferStatus } from '@prisma/client';
import {
  OFFER_STATUSES,
  OfferStateMachine,
  assertOfferTransition,
  canTransitionOffer,
} from './offer-state-machine';

// docs/02 §4.D: bid_offers change only pending -> accepted / declined /
// countered / superseded.
const ALLOWED = new Set([
  'pending->accepted',
  'pending->declined',
  'pending->countered',
  'pending->superseded',
]);

describe('OfferStateMachine (docs/02 §4.D, docs/04 §6.3)', () => {
  const pairs = OFFER_STATUSES.flatMap((from) =>
    OFFER_STATUSES.map((to) => [from, to] as [OfferStatus, OfferStatus]),
  );

  it('covers all 5 × 5 pairs', () => {
    expect(OFFER_STATUSES.sort()).toEqual(
      ['accepted', 'countered', 'declined', 'pending', 'superseded'].sort(),
    );
    expect(pairs).toHaveLength(25);
  });

  it.each(pairs)('%s -> %s', (from, to) => {
    const allowed = ALLOWED.has(`${from}->${to}`);
    expect(canTransitionOffer(from, to)).toBe(allowed);
    expect(new OfferStateMachine().canTransition(from, to)).toBe(allowed);
    if (allowed) {
      expect(() => assertOfferTransition(from, to)).not.toThrow();
    } else {
      expect(() => assertOfferTransition(from, to)).toThrow(/not allowed/);
    }
  });
});

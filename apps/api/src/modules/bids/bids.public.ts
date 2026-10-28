/**
 * The bids module's public face for other modules (architecture rule:
 * src/architecture/module-boundaries.spec.ts — other modules import only
 * files at a module's root). Deal record 2026-10-27.
 */
export {
  AttorneyInactive,
  BidAcceptanceService,
} from './acceptance/bid-acceptance.service';
export { bidNotFound, planBidTransition } from './domain/bid-state-machine';
export {
  describePaymentTerms,
  isValidPaymentTerms,
  normalizePaymentTerms,
  paymentTermsProblems,
  PAYMENT_TERMS_TYPES,
  type InstallmentPeriod,
  type PaymentTerms,
  type PaymentTermsType,
} from './domain/payment-terms';
export { PaymentTermsDto } from './dto/bid-requests.dto';
export { paymentTermsOf } from './bids.service';

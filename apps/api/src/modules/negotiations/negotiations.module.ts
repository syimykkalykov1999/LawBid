import { Module } from '@nestjs/common';
import { OfferStateMachine } from './domain/offer-state-machine';

/** docs/04 §6 negotiation (stage 4.1: offer status table; 4.4: API). */
@Module({
  providers: [OfferStateMachine],
  exports: [OfferStateMachine],
})
export class NegotiationsModule {}

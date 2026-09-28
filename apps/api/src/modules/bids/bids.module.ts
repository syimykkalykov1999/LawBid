import { Module } from '@nestjs/common';
import { BidStateMachine } from './domain/bid-state-machine';

/** docs/04 §5–§7 bids (stage 4.1: state machine; 4.4/4.5: API). */
@Module({
  providers: [BidStateMachine],
  exports: [BidStateMachine],
})
export class BidsModule {}

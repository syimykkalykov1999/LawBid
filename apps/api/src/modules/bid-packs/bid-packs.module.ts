import { Module } from '@nestjs/common';
import {
  AdminBidPacksController,
  BidPacksController,
} from './bid-packs.controller';
import { BidPacksService } from './bid-packs.service';

/** The service alone — imported by bids (spending), billing (the payment
 * webhook) and the HTTP module below. Uses the global PAYMENT_PROVIDER. */
@Module({
  providers: [BidPacksService],
  exports: [BidPacksService],
})
export class BidPacksCoreModule {}

@Module({
  imports: [BidPacksCoreModule],
  controllers: [BidPacksController, AdminBidPacksController],
})
export class BidPacksModule {}

import { Module } from '@nestjs/common';
import {
  AdminBidPacksController,
  BidPacksController,
} from './bid-packs.controller';
import { BidPacksService } from './bid-packs.service';
import { PayLinkModule } from '../billing/pay-link.module';

/** The service alone — imported by bids (spending), billing (the payment
 * webhook) and the HTTP module below. Uses the global PAYMENT_PROVIDER. */
import { LedgerModule } from '../ledger/ledger.public';
@Module({
  // Owner 2026-10-22: the card page's links.
  imports: [PayLinkModule, LedgerModule],
  providers: [BidPacksService],
  exports: [BidPacksService],
})
export class BidPacksCoreModule {}

@Module({
  imports: [BidPacksCoreModule],
  controllers: [BidPacksController, AdminBidPacksController],
})
export class BidPacksModule {}

import { Module } from '@nestjs/common';
import { LedgerPostingService } from './ledger-posting.service';
import { LedgerReconcileService } from './ledger-reconcile.service';
import { LedgerStripeService } from './ledger-stripe.service';
import { LedgerService } from './ledger.service';

/**
 * The double-entry money ledger (docs/architecture/MONEY_LEDGER.md). Money
 * modules import this and call LedgerPostingService with their own
 * transaction client; the nightly `ledger.reconcile` job uses
 * LedgerReconcileService. Needs the global Prisma / Redis / Secrets / Logger.
 */
@Module({
  providers: [
    LedgerService,
    LedgerPostingService,
    LedgerStripeService,
    LedgerReconcileService,
  ],
  exports: [LedgerPostingService, LedgerReconcileService],
})
export class LedgerModule {}

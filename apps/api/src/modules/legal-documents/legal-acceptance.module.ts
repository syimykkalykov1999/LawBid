import { Module } from '@nestjs/common';
import { LegalAcceptedGuard } from './legal-acceptance.guard';
import { LegalAcceptanceService } from './legal-acceptance.service';

/** PrismaModule is global, so this module has no imports and can be
 * pulled into users / cases / bids without cycles. */
@Module({
  providers: [LegalAcceptanceService, LegalAcceptedGuard],
  exports: [LegalAcceptanceService, LegalAcceptedGuard],
})
export class LegalAcceptanceModule {}

import { Module } from '@nestjs/common';
import { PayLinkService } from './pay-link.service';

/** Owner 2026-10-22: the card page's signed links, shared by every module
 * that sells something (billing, Boost, stars, offer packs, client plan,
 * gold badge) without importing each other. Stateless. */
@Module({
  providers: [PayLinkService],
  exports: [PayLinkService],
})
export class PayLinkModule {}

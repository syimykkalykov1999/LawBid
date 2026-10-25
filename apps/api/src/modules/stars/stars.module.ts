import { Module } from '@nestjs/common';
import { PayLinkModule } from '../billing/pay-link.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrivacySettingsModule } from '../privacy-settings/privacy-settings.module';
import { AdminStarsController, StarsController } from './stars.controller';
import { StarsService } from './stars.service';
import { StarterCatalogService } from './starter-catalog.service';

/** The service alone — imported by stickers (paid packs), chat (gifts) and
 * billing (the payment webhook). Uses the global PAYMENT_PROVIDER. */
import { LedgerModule } from '../ledger/ledger.public';
@Module({
  imports: [
    BlocksModule,
    FilesModule,
    NotificationsModule,
    PrivacySettingsModule,
    // Owner 2026-10-22: the card page's links.
    PayLinkModule,
    LedgerModule,
  ],
  providers: [StarsService],
  exports: [StarsService],
})
export class StarsCoreModule {}

@Module({
  imports: [StarsCoreModule, FilesModule],
  providers: [StarterCatalogService],
  controllers: [StarsController, AdminStarsController],
})
export class StarsModule {}

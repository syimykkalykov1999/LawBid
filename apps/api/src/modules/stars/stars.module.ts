import { Module } from '@nestjs/common';
import { BlocksModule } from '../blocks/blocks.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminStarsController, StarsController } from './stars.controller';
import { StarsService } from './stars.service';

/** The service alone — imported by stickers (paid packs), chat (gifts) and
 * billing (the payment webhook). Uses the global PAYMENT_PROVIDER. */
@Module({
  imports: [BlocksModule, FilesModule, NotificationsModule],
  providers: [StarsService],
  exports: [StarsService],
})
export class StarsCoreModule {}

@Module({
  imports: [StarsCoreModule],
  controllers: [StarsController, AdminStarsController],
})
export class StarsModule {}

import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { ChatModule } from '../chat/chat.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

/** OQ-041: in-app audio calls. */
@Module({
  imports: [
    UsageLimitsModule,
    BlocksModule,
    ChatModule,
    FilesModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}

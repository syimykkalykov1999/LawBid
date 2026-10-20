import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { ChatSystemModule } from '../chat/chat-system.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ConsultationRemindersJob } from './consultation-reminders.job';
import { ConsultationsService } from './consultations.service';

/** The service and the sweep, without the controller (the worker uses it). */
@Module({
  imports: [
    BlocksModule,
    FeatureFlagsModule,
    ChatSystemModule,
    FilesModule,
    NotificationsModule,
    SubscriptionsModule,
    UsageLimitsModule,
  ],
  providers: [ConsultationsService, ConsultationRemindersJob],
  exports: [ConsultationsService, ConsultationRemindersJob],
})
export class ConsultationsCoreModule {}

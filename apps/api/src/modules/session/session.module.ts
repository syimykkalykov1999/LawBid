import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

/** Owner 2026-10-22 (client economy plan, package G): GET /me/session. */
@Module({
  imports: [UsersModule, NotificationsModule, FeatureFlagsModule],
  controllers: [SessionController],
  providers: [SessionService],
})
export class SessionModule {}

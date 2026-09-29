import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AuthModule } from '../auth/auth.module';
import { CaseLifecycleModule } from '../cases/lifecycle/case-lifecycle.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VerificationModule } from '../verification/verification.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/** docs/06 §2.3 item 3 + §3.4 (stage 6.3): the "Пользователи" section. */
@Module({
  imports: [
    AdminAccessModule,
    AuthModule,
    CaseLifecycleModule,
    VerificationModule,
    NotificationsModule,
    FilesModule,
  ],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
  // docs/06 §3.2: the moderation queue applies the same §3.4 sanctions.
  exports: [AdminUsersService],
})
export class AdminUsersModule {}

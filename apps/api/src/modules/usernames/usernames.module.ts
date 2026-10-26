import { Module } from '@nestjs/common';
import { AppSettingsModule } from '../../common/app-settings/app-settings.module';
import { UsernamePolicyService } from './username-policy.service';
import { UsernamesController } from './usernames.controller';

/** Owner 2026-10-20: one @username namespace for people, channels, groups. */
@Module({
  imports: [AppSettingsModule],
  controllers: [UsernamesController],
  providers: [UsernamePolicyService],
  exports: [UsernamePolicyService],
})
export class UsernamesModule {}

import { Module } from '@nestjs/common';
import { PrivacySettingsController } from './privacy-settings.controller';
import { PrivacySettingsService } from './privacy-settings.service';

/** Owner 2026-10-20: audiences for last seen, new chats and calls. */
@Module({
  controllers: [PrivacySettingsController],
  providers: [PrivacySettingsService],
  exports: [PrivacySettingsService],
})
export class PrivacySettingsModule {}

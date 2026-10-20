import { Module } from '@nestjs/common';
import { PrivacySettingsModule } from '../privacy-settings/privacy-settings.module';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

/** Owner 2026-10-01: online / last seen (chats) + its privacy switch. */
@Module({
  imports: [PrivacySettingsModule],
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}

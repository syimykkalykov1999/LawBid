import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { ContactsSyncController } from './contacts-sync.controller';
import { ContactsSyncService } from './contacts-sync.service';

/** Owner 2026-10-13: contacts sync (hashes only). */
@Module({
  imports: [UsageLimitsModule, FilesModule],
  controllers: [ContactsSyncController],
  providers: [ContactsSyncService],
})
export class ContactsSyncModule {}

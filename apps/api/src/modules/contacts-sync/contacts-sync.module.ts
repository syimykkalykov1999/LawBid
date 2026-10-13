import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FollowsModule } from '../follows/follows.module';
import { ContactsSyncController } from './contacts-sync.controller';
import { ContactsSyncService } from './contacts-sync.service';

/** Owner 2026-10-13: contacts sync (hashes only). */
@Module({
  imports: [UsageLimitsModule, BlocksModule, FollowsModule],
  controllers: [ContactsSyncController],
  providers: [ContactsSyncService],
})
export class ContactsSyncModule {}

import { Global, Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { BidTeamService } from './bid-team.service';

/**
 * Firms audit 16.11 (PR-5): the firm's team on a bid. Global like
 * PrismaModule: the chat, the case access policy (provided directly in
 * several modules), the workspace, bids and firms all read it, and it
 * depends on nothing but the database and the flags.
 */
@Global()
@Module({
  imports: [FeatureFlagsModule],
  providers: [BidTeamService],
  exports: [BidTeamService],
})
export class BidTeamModule {}

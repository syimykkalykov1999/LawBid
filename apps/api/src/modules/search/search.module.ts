import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { CasesModule } from '../cases/cases.module';
import { FollowsModule } from '../follows/follows.module';
import { PostsModule } from '../posts/posts.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { PostgresSearchProvider } from './postgres-search.provider';
import { SearchController } from './search.controller';
import { SearchLogService } from './search-log.service';
import { SearchSynonymsService } from './search-synonyms.service';
import { SEARCH_PROVIDER } from './search.provider';
import { SearchService } from './search.service';

/** docs/05 §7 search (stage 5.6). */
@Module({
  imports: [
    UsageLimitsModule,
    CasesModule,
    FollowsModule,
    PostsModule,
    // OQ-026: client rows of People search.
    ProfilesModule,
    // OQ-028: blocked users drop out of People.
    BlocksModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchSynonymsService,
    SearchLogService,
    { provide: SEARCH_PROVIDER, useClass: PostgresSearchProvider },
  ],
  exports: [SearchSynonymsService, SearchLogService],
})
export class SearchModule {}

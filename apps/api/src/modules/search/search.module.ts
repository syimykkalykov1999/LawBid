import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { CasesModule } from '../cases/cases.module';
import { FollowsModule } from '../follows/follows.module';
import { PostsModule } from '../posts/posts.module';
import { CockroachSearchProvider } from './cockroach-search.provider';
import { SearchController } from './search.controller';
import { SEARCH_PROVIDER } from './search.provider';
import { SearchService } from './search.service';

/** docs/05 §7 search (stage 5.6). */
@Module({
  imports: [UsageLimitsModule, CasesModule, FollowsModule, PostsModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    { provide: SEARCH_PROVIDER, useClass: CockroachSearchProvider },
  ],
})
export class SearchModule {}

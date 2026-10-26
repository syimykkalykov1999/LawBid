import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { CasesModule } from '../cases/cases.module';
import { FollowsModule } from '../follows/follows.module';
import { PostsModule } from '../posts/posts.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { OPENSEARCH_CLIENT_PROVIDER } from './engine/opensearch.client';
import { OpenSearchProvider } from './engine/opensearch-search.provider';
import { SearchDocsLoader } from './engine/search-docs.loader';
import { PostgresSearchProvider } from './postgres-search.provider';
import { SearchIndexerService } from './search-indexer.service';
import { SearchReindexService } from './search-reindex.service';
import { SwitchingSearchProvider } from './search-switch.provider';
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
    // Owner 2026-10-24 (search-ready): Postgres and the engine behind the
    // `search.engine` switch; SearchService talks to the switch.
    PostgresSearchProvider,
    OpenSearchProvider,
    OPENSEARCH_CLIENT_PROVIDER,
    SearchDocsLoader,
    SearchIndexerService,
    SearchReindexService,
    SwitchingSearchProvider,
    { provide: SEARCH_PROVIDER, useExisting: SwitchingSearchProvider },
  ],
  exports: [
    SearchSynonymsService,
    SearchLogService,
    SEARCH_PROVIDER,
    SearchIndexerService,
    SearchReindexService,
  ],
})
export class SearchModule {}

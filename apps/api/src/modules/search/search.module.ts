import { Module } from '@nestjs/common';
import { SEARCH_REINDEX_PORT } from '../../common/search/search-reindex.port';
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

/**
 * Pack C (round 2 #22, 25.11): the search parts with state of their own —
 * the engine client (its connections), the indexer (its pause after
 * failures), the synonyms (their one-time starter import), the search log —
 * live here, provided ONCE. SearchModule and JobsModule import this module
 * instead of listing the classes again (JobsModule used to build a second
 * copy of each inside the API process).
 */
@Module({
  providers: [
    SearchSynonymsService,
    SearchLogService,
    OPENSEARCH_CLIENT_PROVIDER,
    SearchDocsLoader,
    SearchIndexerService,
    SearchReindexService,
    // infra «Авто» drives the reindex through this token (no module import).
    { provide: SEARCH_REINDEX_PORT, useExisting: SearchReindexService },
  ],
  exports: [
    SearchSynonymsService,
    SearchLogService,
    OPENSEARCH_CLIENT_PROVIDER.provide,
    SearchDocsLoader,
    SearchIndexerService,
    SearchReindexService,
    SEARCH_REINDEX_PORT,
  ],
})
export class SearchCoreModule {}

/** docs/05 §7 search (stage 5.6). */
@Module({
  imports: [
    SearchCoreModule,
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
    // Owner 2026-10-24 (search-ready): Postgres and the engine behind the
    // `search.engine` switch; SearchService talks to the switch.
    PostgresSearchProvider,
    OpenSearchProvider,
    SwitchingSearchProvider,
    { provide: SEARCH_PROVIDER, useExisting: SwitchingSearchProvider },
  ],
  exports: [SearchCoreModule, SEARCH_PROVIDER],
})
export class SearchModule {}

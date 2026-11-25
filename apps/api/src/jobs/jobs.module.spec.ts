import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AnalyticsCoreModule } from '../modules/analytics/analytics.module';
import { AnalyticsService } from '../modules/analytics/analytics.service';
import { OpenSearchClient } from '../modules/search/engine/opensearch.client';
import { SearchIndexerService } from '../modules/search/search-indexer.service';
import { SearchSynonymsService } from '../modules/search/search-synonyms.service';
import { SearchCoreModule } from '../modules/search/search.module';
import { S3StorageService } from '../modules/files/storage/s3-storage.service';
import { StorageCoreModule } from '../modules/storage/storage.module';
import { JobsModule } from './jobs.module';

/** The token a provider entry registers (a class or `{ provide }`). */
function tokenOf(p: unknown): unknown {
  return typeof p === 'function' ? p : (p as { provide?: unknown }).provide;
}

/**
 * Pack C (round 2 #22, 25.11): JobsModule listed ~20 services that their
 * own modules already provide, so the API process ran a second instance of
 * each (a second OpenSearch client and S3 client with their own
 * connections, the indexer's pause state split in two, the starter synonyms
 * imported twice, DAU touches on a copy without the consent check).
 */
describe('JobsModule provides no second copy of a stateful service', () => {
  const jobs = JobsModule.register({ mode: 'api' });
  const own = new Set((jobs.providers ?? []).map(tokenOf));
  const imported = new Set(jobs.imports ?? []);

  it.each([
    ['AnalyticsService', AnalyticsService, AnalyticsCoreModule],
    ['SearchSynonymsService', SearchSynonymsService, SearchCoreModule],
    ['SearchIndexerService', SearchIndexerService, SearchCoreModule],
    ['the OpenSearch client', OpenSearchClient, SearchCoreModule],
    ['S3StorageService', S3StorageService, StorageCoreModule],
  ])('%s comes from its owner module, exported once', (_n, token, owner) => {
    expect(own.has(token)).toBe(false);
    expect(imported.has(owner)).toBe(true);
    const exported = (Reflect.getMetadata(MODULE_METADATA.EXPORTS, owner) ??
      []) as unknown[];
    expect(exported).toContain(token);
  });
});

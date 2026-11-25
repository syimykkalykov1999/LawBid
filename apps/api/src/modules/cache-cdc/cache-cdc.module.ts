import { Module } from '@nestjs/common';
import { CacheCdcService } from './cache-cdc.service';

/**
 * C2: cache invalidation from the database change log. Imported by the
 * worker only (jobs/worker.module.ts): one reader per replication slot,
 * never one per API task. Redis, settings and the logger are global there.
 */
@Module({
  providers: [CacheCdcService],
  exports: [CacheCdcService],
})
export class CacheCdcModule {}

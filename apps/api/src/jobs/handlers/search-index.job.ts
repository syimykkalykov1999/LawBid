import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { SearchIndexerService } from '../../modules/search/search-indexer.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { withJobLock } from './job-lock';

/**
 * Owner 2026-10-24 (search-ready): `search.index`, every minute. While
 * `search.engine` = postgres it only empties the (normally empty) outbox.
 * Otherwise it fills the engine once (resumable) and drains the outbox.
 * One runner at a time (Redis lock); a long first fill simply continues on
 * the next minute from its checkpoint.
 */
@Injectable()
export class SearchIndexJob {
  constructor(
    private readonly indexer: SearchIndexerService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  run(): Promise<unknown> {
    return withJobLock(this.redis, 'search.index', 55_000, () =>
      this.indexer.tick(),
    );
  }
}

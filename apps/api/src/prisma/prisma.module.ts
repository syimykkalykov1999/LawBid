import { Global, Module } from '@nestjs/common';
import { ShardMapSync } from '../sharding/shard-map-sync';
import { ShardStatsService } from '../sharding/shard-stats';
import { PrismaReadService } from './prisma-read.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaReadService,
    // Shard-ready steps 3 and 4: shard_map cache invalidation over Redis and
    // the "sharded query without shard context" log counter.
    ShardMapSync,
    ShardStatsService,
  ],
  exports: [PrismaService, PrismaReadService],
})
export class PrismaModule {}

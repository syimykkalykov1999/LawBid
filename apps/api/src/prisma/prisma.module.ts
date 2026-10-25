import { Global, Module } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  UserDirectory,
  userCardCacheTtlSeconds,
  userDirectory,
} from '../sharding/user-directory';
import { CrossFamilyOutbox } from '../sharding/outbox/cross-family-outbox';
import { ShardMapSync } from '../sharding/shard-map-sync';
import { ShardStatsService } from '../sharding/shard-stats';
import { ReplicaAdminService } from './replica-admin.service';
import { PrismaReadService } from './prisma-read.service';
import { PrismaService, routingOf } from './prisma.service';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaReadService,
    // Owner 2026-10-24: admin button for the read replica (off until tapped).
    ReplicaAdminService,
    // Shard-ready steps 3 and 4: shard_map cache invalidation over Redis and
    // the "sharded query without shard context" log counter.
    ShardMapSync,
    ShardStatsService,
    // Shard-ready step 7: transactional outbox for cross-family writes.
    CrossFamilyOutbox,
    // Shard-ready step 6: batched user loader (+ short Redis cache of the
    // public card when several physical databases exist).
    {
      provide: UserDirectory,
      inject: [PrismaService, { token: REDIS_CLIENT, optional: true }],
      useFactory: (prisma: PrismaService, redis?: Redis) => {
        const d = userDirectory(prisma);
        const dbs = 1 + (routingOf(prisma)?.shardDatabaseKeys().length ?? 0);
        d.attachCache(redis ?? null, userCardCacheTtlSeconds(dbs));
        return d;
      },
    },
  ],
  exports: [
    PrismaService,
    PrismaReadService,
    ReplicaAdminService,
    UserDirectory,
    CrossFamilyOutbox,
  ],
})
export class PrismaModule {}

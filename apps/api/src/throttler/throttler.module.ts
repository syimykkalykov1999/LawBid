import { Module } from '@nestjs/common';
import { ThrottlerModule as NestThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorageService } from './redis-throttler-storage.service';

@Module({
  providers: [RedisThrottlerStorageService],
  exports: [RedisThrottlerStorageService],
})
class RedisThrottlerStorageModule {}

@Module({
  imports: [
    NestThrottlerModule.forRootAsync({
      imports: [RedisThrottlerStorageModule],
      inject: [RedisThrottlerStorageService],
      useFactory: (storage: RedisThrottlerStorageService) => ({
        // THROTTLE_LIMIT raises the per-minute limit on a dev machine, where
        // the admin panel, the emulator and tests share one account's bucket.
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: Number(process.env.THROTTLE_LIMIT) || 100,
          },
        ],
        storage,
      }),
    }),
  ],
  exports: [NestThrottlerModule],
})
export class ThrottlerModule {}

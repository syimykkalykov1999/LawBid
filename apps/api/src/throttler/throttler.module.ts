import { Module } from '@nestjs/common';
import { ThrottlerModule as NestThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorageService } from './redis-throttler-storage.service';
import { userThrottleLimit } from './throttle-limits';

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
        // the emulator and tests share one account's bucket. Signed-in
        // admins get their own, higher limit in UserThrottlerGuard.
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: userThrottleLimit(),
          },
        ],
        storage,
      }),
    }),
  ],
  exports: [NestThrottlerModule],
})
export class ThrottlerModule {}

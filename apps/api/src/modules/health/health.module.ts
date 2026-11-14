import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DbLostWatchdog } from './db-lost-watchdog.service';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';

/** PrismaModule and RedisModule are @Global(), so the indicators can
 * inject PrismaService / REDIS_CLIENT without importing them here.
 * Perf batch 2: DbLostWatchdog restarts a task cut off from the database
 * (see its doc comment for the liveness / readiness choice). */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RedisHealthIndicator, DbLostWatchdog],
})
export class HealthModule {}

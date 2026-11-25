import { Module } from '@nestjs/common';
import { PartitionService } from './partition.service';

/**
 * Holes re-check (25.11, item 17): PartitionService provided ONCE. JobsModule
 * (`db.partitions`) and AdminOpsModule (Система → Здоровье системы) each
 * listed it, so the API process held two instances, each with its own
 * lifecycle (OnModuleDestroy). Its dependencies (Prisma, config, app
 * settings, Redis) are global modules. jobs.module.spec.ts fails on a copy.
 */
@Module({
  providers: [PartitionService],
  exports: [PartitionService],
})
export class PartitionCoreModule {}

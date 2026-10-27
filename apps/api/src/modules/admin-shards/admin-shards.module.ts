import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminShardsController } from './admin-shards.controller';

/** Shard-ready step 10: Система → «Здоровье системы» → Разделить базу. */
@Module({
  imports: [AdminAccessModule],
  controllers: [AdminShardsController],
})
export class AdminShardsModule {}

import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { SearchModule } from '../search/search.module';
import { AdminSearchController } from './admin-search.controller';
import { AdminSearchService } from './admin-search.service';

/** Owner 2026-10-15: Поиск → Синонимы, запросы без результатов. */
@Module({
  imports: [AdminAccessModule, SearchModule],
  controllers: [AdminSearchController],
  providers: [AdminSearchService],
})
export class AdminSearchModule {}

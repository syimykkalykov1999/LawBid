import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { PartnersCoreModule } from '../partners/partners.module';
import { AdminDemoController } from './admin-demo.controller';
import { DemoActivityInterceptor } from './demo-activity.interceptor';
import { DemoDatabaseService } from './demo-database.service';
import { DemoService } from './demo.service';
import { DemoController } from './demo.controller';

/** The demo world's keeper alone — the worker imports it for the sweep. */
@Module({
  imports: [PartnersCoreModule],
  providers: [DemoDatabaseService, DemoService, S3StorageService],
  exports: [DemoDatabaseService, DemoService],
})
export class DemoCoreModule {}

/** Owner 2026-10-05 («Продвижение»): demo accounts for bloggers — app and
 * admin endpoints, plus the activity interceptor. */
@Module({
  imports: [DemoCoreModule, AdminAccessModule],
  controllers: [DemoController, AdminDemoController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: DemoActivityInterceptor }],
})
export class DemoModule {}

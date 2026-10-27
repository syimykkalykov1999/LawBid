import { Module } from '@nestjs/common';
import { StaffAiModule } from '../staff-ai/staff-ai.module';
import { StaffAppealsModule } from '../staff-appeals/staff-appeals.module';
import { StaffDeskModule } from '../staff-desk/staff-desk.module';
import { StaffHomeModule } from '../staff-home/staff-home.module';
import { StaffNavModule } from '../staff-nav/staff-nav.module';
import { StaffPieceworkModule } from '../staff-piecework/staff-piecework.module';
import { StaffRatingModule } from '../staff-rating/staff-rating.module';
import { StaffSecurityModule } from '../staff-security/staff-security.module';
import { WorkLeaseModule } from '../work-lease/work-lease.module';
import { StaffCoreModule } from './staff-core.module';
import { StaffDeskReadController } from './staff-desk-read.controller';
import { StaffSettingsController } from './staff-settings.controller';

/**
 * Staff package «Админка и сотрудники» (docs/architecture/
 * ADMIN_STAFF_PACKAGE_PLAN_2026-10-27.md): the umbrella AppModule imports.
 * Each sub-module belongs to one task (T3…T12) and fills only its own
 * folder; this list and the job registrations are T1's. Everything is off
 * by default (`staff.*_enabled`).
 */
@Module({
  imports: [
    StaffCoreModule,
    WorkLeaseModule,
    StaffDeskModule,
    StaffRatingModule,
    StaffAppealsModule,
    StaffPieceworkModule,
    StaffNavModule,
    StaffHomeModule,
    StaffSecurityModule,
    StaffAiModule,
  ],
  controllers: [StaffSettingsController, StaffDeskReadController],
})
export class StaffModule {}

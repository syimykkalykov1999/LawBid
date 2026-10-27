import { Global, Module } from '@nestjs/common';
import { StaffRetentionJob } from '../../jobs/handlers/staff-retention.job';
import { StaffSettingsService } from './staff-settings.service';

/**
 * Staff package T1: the core every staff module stands on — the typed
 * settings reader (all switches off by default) and the journal retention
 * job. Global, so the staff modules and jobs inject StaffSettingsService
 * without importing it; imported by StaffModule (API) and JobsModule
 * (API + worker).
 */
@Global()
@Module({
  providers: [StaffSettingsService, StaffRetentionJob],
  exports: [StaffSettingsService, StaffRetentionJob],
})
export class StaffCoreModule {}

import { Global, Module } from '@nestjs/common';
import { LEASE_GOLDEN } from '../work-lease/lease-golden';
import { GoldenTasksService } from './golden-tasks.service';
import { StaffDeskController } from './staff-desk.controller';

/**
 * Staff package (T4): the desk (`admin/desk/heartbeat`) and the queue
 * hookups (golden tasks for the lease engine). Core part (providers),
 * imported by StaffModule (API); everything stays a no-op while its switch
 * is off. Global so the lease engine finds LEASE_GOLDEN without an import.
 */
@Global()
@Module({
  providers: [
    GoldenTasksService,
    { provide: LEASE_GOLDEN, useExisting: GoldenTasksService },
  ],
  exports: [GoldenTasksService, LEASE_GOLDEN],
})
export class StaffDeskCoreModule {}

/** Staff package (T4): the admin routes of staff-desk (API only). */
@Module({
  imports: [StaffDeskCoreModule],
  controllers: [StaffDeskController],
})
export class StaffDeskModule {}

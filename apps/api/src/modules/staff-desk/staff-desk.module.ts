import { Module } from '@nestjs/common';
import { StaffDeskController } from './staff-desk.controller';

/**
 * Staff package (T4): the desk (`admin/desk/me`, `next`, `team`) and the queue hookups.
 * Core part (providers), imported by
 * StaffModule (API) and JobsModule (API + worker). T1 registered the
 * stubs; everything stays a no-op while its switch is off.
 */
@Module({
  providers: [],
})
export class StaffDeskCoreModule {}

/** Staff package (T4): the admin routes of staff-desk (API only). */
@Module({
  imports: [StaffDeskCoreModule],
  controllers: [StaffDeskController],
})
export class StaffDeskModule {}

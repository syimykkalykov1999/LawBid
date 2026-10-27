import { Module } from '@nestjs/common';
import { StaffNavController } from './staff-nav.controller';

/**
 * Staff package (T8): pinned pages of the admin menu.
 * Core part (providers), imported by
 * StaffModule (API) and JobsModule (API + worker). T1 registered the
 * stubs; everything stays a no-op while its switch is off.
 */
@Module({
  providers: [],
})
export class StaffNavCoreModule {}

/** Staff package (T8): the admin routes of staff-nav (API only). */
@Module({
  imports: [StaffNavCoreModule],
  controllers: [StaffNavController],
})
export class StaffNavModule {}

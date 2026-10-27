import { Global, Module } from '@nestjs/common';
import { StaffLeaseSweepJob } from '../../jobs/handlers/staff-lease-sweep.job';
import { StaffCountersFlushJob } from '../../jobs/handlers/staff-counters-flush.job';
import { LEASE_PORT } from '../staff-core/lease.port';
import { LeaseTeamService } from './lease-team.service';
import { LeaseService } from './lease.service';
import { StaffEventsPublisher } from './staff-events.publisher';
import { StaffPresenceService } from './staff-presence.service';
import { StaffGateway } from './staff.gateway';
import {
  DeskStatusController,
  WorkLeaseController,
} from './work-lease.controller';

/**
 * Staff package (T3): routing leases («Следующий», release / skip / done,
 * presence on the socket `/staff`). Core part (the engine, presence, the
 * event publisher, the cron jobs, the port binding), imported by
 * StaffModule (API) and JobsModule (API + worker). Everything is a no-op
 * while its switch is off. Global so any module can inject LEASE_PORT
 * without an import.
 */
@Global()
@Module({
  providers: [
    StaffLeaseSweepJob,
    StaffCountersFlushJob,
    StaffPresenceService,
    StaffEventsPublisher,
    LeaseService,
    { provide: LEASE_PORT, useExisting: LeaseService },
  ],
  exports: [
    StaffLeaseSweepJob,
    StaffCountersFlushJob,
    StaffPresenceService,
    StaffEventsPublisher,
    LeaseService,
    LEASE_PORT,
  ],
})
export class WorkLeaseCoreModule {}

/** Staff package (T3): the admin routes of work-lease and the `/staff`
 * socket namespace (API only, never in the worker). */
@Module({
  imports: [WorkLeaseCoreModule],
  controllers: [WorkLeaseController, DeskStatusController],
  providers: [StaffGateway, LeaseTeamService],
})
export class WorkLeaseModule {}

import { Global, Module } from '@nestjs/common';
import { StaffLeaseSweepJob } from '../../jobs/handlers/staff-lease-sweep.job';
import { StaffCountersFlushJob } from '../../jobs/handlers/staff-counters-flush.job';
import { LEASE_PORT, NoopLeasePort } from '../staff-core/lease.port';
import { StaffGateway } from './staff.gateway';
import { WorkLeaseController } from './work-lease.controller';

/**
 * Staff package (T3): routing leases («Следующий», release / skip / done, presence on the socket `/staff`).
 * Core part (providers, the cron jobs, the port binding), imported by
 * StaffModule (API) and JobsModule (API + worker). T1 registered the
 * stubs; everything stays a no-op while its switch is off. Global so any module can inject LEASE_PORT without an import.
 */
@Global()
@Module({
  providers: [
    StaffLeaseSweepJob,
    StaffCountersFlushJob,
    { provide: LEASE_PORT, useClass: NoopLeasePort },
  ],
  exports: [StaffLeaseSweepJob, StaffCountersFlushJob, LEASE_PORT],
})
export class WorkLeaseCoreModule {}

/** Staff package (T3): the admin routes of work-lease and the `/staff`
 * socket namespace (API only, never in the worker). */
@Module({
  imports: [WorkLeaseCoreModule],
  controllers: [WorkLeaseController],
  providers: [StaffGateway],
})
export class WorkLeaseModule {}

import { Prisma } from '../generated/prisma/client';
import { throwIfJobStopped } from '../common/queues/job-signal';

/**
 * Batch D (14.11): a cron job whose lock was lost or that ran past its time
 * limit (`common/queues/job-signal.ts`) stops at its next database call —
 * the BullMQ "Cancelling jobs" pattern applied in one place for every
 * handler. Outside a cron job, and after the job settled, it is a no-op
 * (one AsyncLocalStorage read). The check runs BEFORE the query is sent, so
 * nothing half-written reaches the database; an open transaction rolls back.
 */
export function jobStopExtension() {
  return Prisma.defineExtension({
    name: 'job-stop',
    query: {
      async $allOperations({ args, query }) {
        throwIfJobStopped();
        return (await query(args)) as unknown;
      },
    },
  });
}

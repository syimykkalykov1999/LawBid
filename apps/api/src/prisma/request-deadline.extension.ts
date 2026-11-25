import { Prisma } from '../generated/prisma/client';
import { throwIfDeadlinePassed } from '../common/resilience/request-deadline';

/** Operations that only read. A write is never stopped half-way. */
const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** A model read, or hand-written SQL that reads (`$queryRaw` and its
 * unescaped twin); `$executeRaw` is a write and is never stopped. */
function isRead(operation: string): boolean {
  return READ_OPERATIONS.has(operation) || operation.startsWith('$queryRaw');
}

/**
 * Stage 2 SRE (Б5): a read of a request whose app already gave up (its
 * `X-Request-Timeout-Ms` passed, or it hung up) stops before it is sent —
 * SRE Book ch. 22 «Cancellation propagation», the same one-place check as
 * `jobStopExtension` for cron jobs. Outside a deadline scope (no header,
 * writes, cron jobs) it is one AsyncLocalStorage read.
 */
export function requestDeadlineExtension() {
  return Prisma.defineExtension({
    name: 'request-deadline',
    query: {
      async $allOperations({ operation, args, query }) {
        if (isRead(operation)) throwIfDeadlinePassed();
        return (await query(args)) as unknown;
      },
    },
  });
}

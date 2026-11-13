/**
 * Owner row 83 (13.11): a background job enqueued by a demo account must run
 * in the demo world too. Before this, `FileScanRunner.enqueueScan` added
 * `{ fileId }` from a demo request, the worker ran it outside
 * `demoContext`, PrismaService picked the MAIN database, found no such row
 * and the demo upload stayed «pending» forever. The same held for every
 * queue except the four fanouts that carried `data.demo` by hand.
 *
 * Proven mechanism, nothing invented: BullMQ's own context propagation
 * (the `telemetry` option of every Queue and Worker, docs.bullmq.io
 * "Telemetry", bullmq 5.x/6.x `utils.trace`). At `add` / `addBulk` /
 * `upsertJobScheduler` BullMQ asks `contextManager.getMetadata()` of the
 * active context and stores the string with the job (`opts.telemetry.
 * metadata`, Redis field `tm`); the worker reads it back with
 * `fromMetadata()` and runs the processor (and the job's own complete /
 * fail / retry bookkeeping) inside `contextManager.with(ctx, …)`. That is
 * exactly how OpenTelemetry trace context crosses the queue
 * (bullmq-otel, MIT), and how multi-tenant apps carry the tenant id into
 * jobs. Here the "context" is one boolean: the demo flag of
 * `demoContext` (AsyncLocalStorage).
 *
 *  - Non-demo jobs store nothing (empty metadata is skipped by BullMQ), so
 *    their job data, options and idempotent job ids are byte-for-byte the
 *    same as before.
 *  - A consumed job runs in demo ONLY when its own metadata says so: the
 *    consumer span ignores whatever context the worker loop happens to be
 *    in, so one demo job can never leak demo into the next job.
 *  - Cron lanes get no propagation at all: system cron is never demo, even
 *    if `runNow` were reached from a demo request.
 *  - Outbound integrations keep refusing: the job now runs where
 *    `demoContext.isDemo()` is true, so the existing demo guards
 *    (Stripe/Bunny proxies, e-mail/SMS no-ops, push queue, cost guard) apply
 *    to the job exactly as to the request.
 *
 * No tracing is done: spans are no-ops (no allocation beyond one object).
 */
import type { ContextManager, Span, Telemetry, Tracer } from 'bullmq';
import { CRON_LANES } from '../../jobs/jobs.constants';
import { demoContext } from '../demo/demo-context';

/** BullMQ `SpanKind.CONSUMER` — a literal, so specs that mock 'bullmq'
 * need no enum. */
const SPAN_KIND_CONSUMER = 4;

/** The metadata string stored with a demo job (Redis field `tm`). */
export const DEMO_JOB_METADATA = 'lawbid-demo:1';

/** Queues whose jobs are never demo (system cron lanes, jobs.constants). */
export const NEVER_DEMO_QUEUES: ReadonlySet<string> = new Set(CRON_LANES);

type DemoCtx = boolean;

const contextManager: ContextManager<DemoCtx> = {
  active: () => demoContext.isDemo(),
  root: () => false,
  with<A extends (...args: unknown[]) => unknown>(
    ctx: DemoCtx,
    fn: A,
  ): ReturnType<A> {
    return demoContext.run(ctx === true, fn) as ReturnType<A>;
  },
  getMetadata: (ctx) => (ctx === true ? DEMO_JOB_METADATA : ''),
  fromMetadata: (_active, metadata) => metadata === DEMO_JOB_METADATA,
};

function noopSpan(kind: number | undefined, parent: DemoCtx | undefined) {
  const span: Span<DemoCtx> = {
    // A consumed job: its own metadata decides, never the worker loop's
    // current context (no metadata = a real-world job).
    setSpanOnContext: (ctx) =>
      kind === SPAN_KIND_CONSUMER ? parent === true : ctx,
    setAttribute: () => undefined,
    setAttributes: () => undefined,
    addEvent: () => undefined,
    recordException: () => undefined,
    end: () => undefined,
  };
  return span;
}

const tracer: Tracer<DemoCtx> = {
  startSpan: (_name, options, parent) => noopSpan(options?.kind, parent),
};

/** THE BullMQ `telemetry` option carrying the demo flag through jobs. */
export const demoJobTelemetry: Telemetry<DemoCtx> = { tracer, contextManager };

/** The telemetry option of queue [queueName] (none for cron lanes). */
export function demoTelemetryFor(queueName: string): Telemetry | undefined {
  return NEVER_DEMO_QUEUES.has(queueName) ? undefined : demoJobTelemetry;
}

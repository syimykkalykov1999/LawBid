import { SpanKind, trace, withDetachedContext } from 'bullmq';
import { demoContext } from '../demo/demo-context';
import {
  bullOptions,
  closeSharedProducers,
} from '../../redis/redis-connection';
import {
  DEMO_JOB_METADATA,
  NEVER_DEMO_QUEUES,
  demoJobTelemetry,
  demoTelemetryFor,
} from './demo-job-context';
import { CRON_LANES } from '../../jobs/jobs.constants';

/**
 * Owner row 83: the demo flag crosses the queue through BullMQ's own
 * telemetry hooks. The flow below calls BullMQ's real `trace` exactly the
 * way `Queue.add` (PRODUCER, callback with 2 args -> metadata stored) and
 * `Worker.processJob` (CONSUMER, metadata of the job) do.
 */

/** What `Queue.add` stores with the job when called in this context. */
function metadataOfAdd(): Promise<string | undefined> {
  return trace(
    demoJobTelemetry,
    SpanKind.PRODUCER,
    'files',
    'add',
    'files.files.scan',
    (_span, dst) => Promise.resolve(dst),
  );
}

/** Whether the processor of a job with [metadata] sees the demo world. */
function processedInDemo(metadata: string | undefined): Promise<boolean> {
  return trace(
    demoJobTelemetry,
    SpanKind.CONSUMER,
    'files',
    'process',
    'files',
    async () => {
      await new Promise((r) => setImmediate(r)); // across an await, too
      return demoContext.isDemo();
    },
    metadata,
  );
}

describe('demo job context (BullMQ telemetry propagation)', () => {
  afterAll(() => closeSharedProducers());

  it('a job added in a demo request carries the flag; a normal one carries nothing', async () => {
    await expect(demoContext.runDemo(metadataOfAdd)).resolves.toBe(
      DEMO_JOB_METADATA,
    );
    // Empty metadata: BullMQ stores no telemetry at all, so a real-world
    // job's options and its idempotent job id stay exactly as before.
    await expect(metadataOfAdd()).resolves.toBe('');
    await expect(demoContext.run(false, metadataOfAdd)).resolves.toBe('');
  });

  it('the worker runs a demo job in the demo world and a normal job outside it', async () => {
    await expect(processedInDemo(DEMO_JOB_METADATA)).resolves.toBe(true);
    await expect(processedInDemo(undefined)).resolves.toBe(false);
    await expect(processedInDemo('')).resolves.toBe(false);
    await expect(processedInDemo('some-otel-trace')).resolves.toBe(false);
  });

  it('a normal job never inherits demo from the worker loop it runs in', async () => {
    // e.g. the next job fetched while the previous (demo) job completed.
    await expect(
      demoContext.runDemo(() => processedInDemo(undefined)),
    ).resolves.toBe(false);
  });

  it('end to end: add in demo -> process -> demo; add outside -> process -> real', async () => {
    const demoMeta = await demoContext.runDemo(metadataOfAdd);
    const realMeta = await metadataOfAdd();
    await expect(processedInDemo(demoMeta)).resolves.toBe(true);
    await expect(processedInDemo(realMeta || undefined)).resolves.toBe(false);
  });

  it('retries keep the flag: the fail bookkeeping inside the job still sees demo', async () => {
    // Job.moveToFailed runs an INTERNAL span inside the consumer span and
    // stores its metadata as the retried job's `tm`.
    const retryMeta = await trace(
      demoJobTelemetry,
      SpanKind.CONSUMER,
      'files',
      'process',
      'files',
      () =>
        trace(
          demoJobTelemetry,
          SpanKind.INTERNAL,
          'files',
          'retry',
          'files',
          (_span, dst) => Promise.resolve(dst),
        ),
      DEMO_JOB_METADATA,
    );
    expect(retryMeta).toBe(DEMO_JOB_METADATA);
  });

  it('the stalled checker loop is detached from any demo context', () => {
    const seen = demoContext.runDemo(() =>
      withDetachedContext(demoJobTelemetry, () => demoContext.isDemo()),
    );
    expect(seen).toBe(false);
  });

  it('every queue and worker gets the propagation through bullOptions, cron lanes never', () => {
    for (const name of ['files', 'push', 'data-export', 'media-moderation']) {
      expect(demoTelemetryFor(name)).toBe(demoJobTelemetry);
      expect(bullOptions(name, 'redis://h:1', {}, {}).telemetry).toBe(
        demoJobTelemetry,
      );
      expect(
        bullOptions(name, 'redis://h:1', { worker: true }, {}).telemetry,
      ).toBe(demoJobTelemetry);
    }
    for (const lane of CRON_LANES) {
      expect(NEVER_DEMO_QUEUES.has(lane)).toBe(true);
      expect(demoTelemetryFor(lane)).toBeUndefined();
      expect('telemetry' in bullOptions(lane, 'redis://h:1', {}, {})).toBe(
        false,
      );
    }
  });
});

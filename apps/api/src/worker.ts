// Tracing must be wired before any instrumented module is required.
import { startTelemetry } from './telemetry/otel';

startTelemetry('worker');

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './jobs/worker.module';

/**
 * Dedicated background-job process (docs/06_PRODUCTION.md §6, ECS service
 * `worker`): `node dist/src/worker.js`. Runs the BullMQ `cron` queue
 * scheduler + worker (src/jobs). Until it is deployed, the API process
 * runs the same jobs itself (JOBS_ENABLED, default true); once it is, set
 * JOBS_ENABLED=false on the API service.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // SIGTERM from ECS: close the worker gracefully (in-flight job finishes).
  app.enableShutdownHooks();
}

void bootstrap();

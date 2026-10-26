// Tracing must be wired before any instrumented module is required.
import { startTelemetry } from './telemetry/otel';

startTelemetry('worker');

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { captureKeyEnv, scrubKeyEnv } from './common/secrets/key-holder';
import { unwrapKmsWrappedKeys } from './common/secrets/kms-env';
import { Logger } from 'nestjs-pino';
import { scrubSentryEvent } from './app.setup';
import { WorkerModule } from './jobs/worker.module';
import { startSentry } from './telemetry/sentry';

/**
 * Dedicated background-job process (docs/06_PRODUCTION.md §6, ECS service
 * `worker`): `node dist/src/worker.js`. Runs the BullMQ `cron` queue
 * scheduler + worker (src/jobs). Until it is deployed, the API process
 * runs the same jobs itself (JOBS_ENABLED, default true); once it is, set
 * JOBS_ENABLED=false on the API service.
 */
async function bootstrap(): Promise<void> {
  // KMS-wrapped MESSAGE_ENC_KEYS / SECRETS_MASTER_KEYS entries → plaintext
  // in memory, before any module reads the config.
  await unwrapKmsWrappedKeys();
  captureKeyEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // S3-3: every cipher has read its keys; drop them from process.env.
  scrubKeyEnv();
  // Audit 2026-10-02: job failures reach Sentry too (same DSN and scrubbing).
  await startSentry(app, app.get(ConfigService), scrubSentryEvent).catch(
    () => false,
  );
  // SIGTERM from ECS: close the worker gracefully (in-flight job finishes).
  app.enableShutdownHooks();
}

void bootstrap();

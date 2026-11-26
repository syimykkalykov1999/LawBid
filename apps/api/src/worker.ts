// Tracing must be wired before any instrumented module is required.
import { warmCjkFonts } from './common/pdf-fonts/pdf-fonts';
import { startTelemetry } from './telemetry/otel';

startTelemetry('worker');

import { installProcessGuards, runEntrypoint } from './common/process-guards';

installProcessGuards();

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { installOutboundAgents } from './common/http/outbound-agent';
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
  // THIRD_PASS_A O1 (26.11): the same outbound agents as the API (main.ts).
  // In prod the push queue runs HERE (API: JOBS_ENABLED=false), so without
  // this every FCM push used Node's default agent (HTTP/1.1, 4 s keep-alive,
  // a new TLS handshake per burst) and fcmDispatcher() was undefined; the
  // Bunny / Cloudflare / Stripe calls of jobs paid the same.
  installOutboundAgents();
  captureKeyEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
    abortOnError: false, // a start-up error must reach runEntrypoint, not process.abort()
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
  // CJK PDF fonts (case-history export runs here): background, sha256-checked.
  void warmCjkFonts();
}

void runEntrypoint('worker', bootstrap);

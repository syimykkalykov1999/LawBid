// Tracing must be wired before any instrumented module is required.
import { startTelemetry } from './telemetry/otel';

startTelemetry('api');

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { unwrapKmsWrappedKeys } from './common/secrets/kms-env';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

/** ALB idle_timeout in infra/modules/alb/main.tf — keep the two in sync. */
const ALB_IDLE_TIMEOUT_S = 300;

async function bootstrap(): Promise<void> {
  // KMS-wrapped MESSAGE_ENC_KEYS / SECRETS_MASTER_KEYS entries → plaintext
  // in memory, before any module reads the config.
  await unwrapKmsWrappedKeys();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // needed later for Stripe webhook signature verification (docs/06_PRODUCTION.md §1.5)
    bufferLogs: true,
  });

  // Logger, shutdown hooks, trust proxy, helmet, validation, global
  // prefix and (non-production only) Swagger — see app.setup.ts.
  configureApp(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // docs/06 §4.1 (stage 6.1): server-side request timeouts.
  //
  // Keep-alive rule (AWS ALB docs): the TARGET's keep-alive timeout must be
  // LONGER than the ALB idle_timeout (300 s, infra/modules/alb/main.tf).
  // Otherwise Node closes an idle socket the ALB still thinks is open, the
  // ALB reuses it and the user gets a random 502. The two values are a pair:
  // change ALB_IDLE_TIMEOUT_S together with idle_timeout in the ALB module.
  // headersTimeout sits just above keepAliveTimeout (classic Node pairing);
  // slow-header clients are still cut off by requestTimeout, which bounds
  // the whole request including its headers.
  const server = app.getHttpServer();
  const requestTimeout = app
    .get(ConfigService)
    .getOrThrow<number>('REQUEST_TIMEOUT_MS');
  server.requestTimeout = requestTimeout;
  server.keepAliveTimeout = (ALB_IDLE_TIMEOUT_S + 10) * 1000; // 310 s
  server.headersTimeout = server.keepAliveTimeout + 1_000; // 311 s
}

void bootstrap();

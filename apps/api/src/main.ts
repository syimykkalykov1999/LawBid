// Tracing must be wired before any instrumented module is required.
import { startTelemetry } from './telemetry/otel';

startTelemetry('api');

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // needed later for Stripe webhook signature verification (docs/06_PRODUCTION.md §1.5)
    bufferLogs: true,
  });

  // Logger, shutdown hooks, trust proxy, helmet, validation, global
  // prefix and (non-production only) Swagger — see app.setup.ts.
  configureApp(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // docs/06 §4.1 (stage 6.1): server-side request timeouts (the ALB idle
  // timeout stays above keepAliveTimeout, so it never races the API).
  const server = app.getHttpServer();
  const requestTimeout = app
    .get(ConfigService)
    .getOrThrow<number>('REQUEST_TIMEOUT_MS');
  server.requestTimeout = requestTimeout;
  server.headersTimeout = Math.min(requestTimeout, 15_000);
  server.keepAliveTimeout = 65_000;
}

void bootstrap();

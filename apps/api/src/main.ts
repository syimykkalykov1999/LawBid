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
}

void bootstrap();

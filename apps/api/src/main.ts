import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi/openapi.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // needed later for Stripe webhook signature verification (docs/06_PRODUCTION.md §1.5)
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  // Every per-IP limit (ThrottlerGuard, OTP per-IP) keys on req.ip. Behind
  // the AWS ALB (docs/06_PRODUCTION.md) the socket address is the ALB's,
  // so without this every user would share ONE per-IP budget. Set
  // TRUST_PROXY_HOPS=1 in staging/production (exactly one ALB in front);
  // 0 locally. Never higher than the real proxy count, or clients can
  // spoof X-Forwarded-For to dodge per-IP limits.
  app.set(
    'trust proxy',
    app.get(ConfigService).getOrThrow<number>('TRUST_PROXY_HOPS'),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1', {
    exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
  });

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();

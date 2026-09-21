import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // needed later for Stripe webhook signature verification (docs/06_PRODUCTION.md §1.5)
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

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

  const config = new DocumentBuilder()
    .setTitle('LawBid API')
    .setDescription(
      'LawBid — US legal-services marketplace. See docs/01_FOUNDATION_AUTH.md §7 for response/error format conventions.',
    )
    .setVersion('0.1.0-stage-1.2')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();

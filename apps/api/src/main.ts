import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api/v1', {
    exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
  });

  const config = new DocumentBuilder()
    .setTitle('LawBid API')
    .setDescription(
      'LawBid — US legal-services marketplace. See /docs/01_FOUNDATION_AUTH.md section 7 for response/error format conventions.',
    )
    .setVersion('0.1.0-stage-1.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();

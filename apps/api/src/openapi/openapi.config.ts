import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

// Single source for the Swagger document, shared by main.ts (/docs) and
// the export script that feeds packages/api-contract (.cursorrules:
// "Любой эндпоинт документируется в OpenAPI; после изменения регенерируй
// Dart-клиент"). DTO schemas come from the @nestjs/swagger CLI plugin in
// nest-cli.json, so the document is only complete from a `nest build`.
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('LawBid API')
    .setDescription(
      'LawBid — US legal-services marketplace. See docs/01_FOUNDATION_AUTH.md §7 for response/error format conventions.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

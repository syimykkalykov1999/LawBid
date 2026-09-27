import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

/** Server-relative base of every versioned route (app.setup.ts
 * GLOBAL_PREFIX). Duplicated rather than imported: app.setup.ts imports
 * this file. */
export const OPENAPI_BASE_PATH = '/api/v1';

/** operationId = the handler's method name (`verifyOtp`), which becomes
 * the generated Dart method name; the tag (one per controller) already
 * names the client class. Nest's default `AuthController_verifyOtp`
 * guarantees uniqueness, so buildOpenApiDocument re-checks it. */
export function operationIdFor(_controllerKey: string, methodKey: string) {
  return methodKey;
}

// Single source for the Swagger document, shared by main.ts (/docs) and
// the export script that feeds packages/api-contract (.cursorrules:
// "Любой эндпоинт документируется в OpenAPI; после изменения регенерируй
// Dart-клиент"). DTO schemas come from the @nestjs/swagger CLI plugin in
// nest-cli.json, so the document is only complete from a `nest build`.
//
// Paths are documented WITHOUT the /api/v1 global prefix, which is the
// document's server URL instead: generated clients (packages/api-contract/
// dart) resolve paths against the app's configured base URL, which already
// ends in /api/v1 (apps/mobile app_environment.dart). The unprefixed health
// probes override the server per operation.
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('LawBid API')
    .setDescription(
      'LawBid — US legal-services marketplace. Every 2xx JSON body is the envelope {data, meta?: {nextCursor}} and every error is {error: {code, message, details?, requestId}} with `code` from the ErrorCode enum — docs/01_FOUNDATION_AUTH.md §7.',
    )
    .setVersion('0.1.0')
    .addServer(OPENAPI_BASE_PATH)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    ignoreGlobalPrefix: true,
    operationIdFactory: operationIdFor,
  });
  const seen = new Map<string, string>();
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of ['get', 'put', 'post', 'delete', 'patch'] as const) {
      const id = item[method]?.operationId;
      if (!id) continue;
      const where = `${method.toUpperCase()} ${path}`;
      const other = seen.get(id);
      if (other) {
        throw new Error(
          `Duplicate operationId "${id}" (${other} and ${where}): rename one handler method.`,
        );
      }
      seen.set(id, where);
    }
  }
  // Operation-level (not path-level) servers: some generators iterate a
  // path item's keys as HTTP methods.
  for (const [path, item] of Object.entries(document.paths)) {
    if (!path.startsWith('/health/') || !item.get) continue;
    item.get.servers = [{ url: '/' }];
  }
  return document;
}

import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { buildOpenApiDocument } from './openapi.config';

// `npm run openapi:export` (runs `nest build` first, from apps/api): writes the OpenAPI
// document to packages/api-contract/openapi.json. Boots the full app, so
// DATABASE_URL/REDIS_URL must be reachable (dev docker compose or CI).
async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1', {
    exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
  });
  const document = buildOpenApiDocument(app);
  // DevModule's routes exist only under NODE_ENV=development; they are
  // not part of the client contract.
  for (const path of Object.keys(document.paths)) {
    if (path.startsWith('/dev/')) delete document.paths[path];
  }
  delete document.components?.schemas?.DevEchoDto;
  const out = join(process.cwd(), '../../packages/api-contract/openapi.json');
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

// Explicit exit: open Redis/Prisma handles can outlive app.close() and
// keep a one-shot CLI script alive.
exportOpenApi().then(
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
  },
);

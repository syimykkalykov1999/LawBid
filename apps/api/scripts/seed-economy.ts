// Owner 2026-10-20: fills the starter catalog of gifts and sticker packs
// (the API does it by itself on its first start; this is for a local DB):
//   npm run seed:economy --workspace apps/api
// Needs DATABASE_URL, Redis and the S3/MinIO keys of apps/api/.env; one
// admin user (or any user) must exist. Safe to repeat: it runs once.
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { StarterCatalogService } from '../src/modules/stars/starter-catalog.service';

async function main(): Promise<void> {
  process.env.SKIP_STARTER_CATALOG = '1'; // the explicit run below is the one
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const result = await app.get(StarterCatalogService).run();
  console.log(JSON.stringify(result));
  await app.close();
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

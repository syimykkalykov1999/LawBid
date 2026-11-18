import { NestFactory } from '@nestjs/core';
import { unwrapKmsWrappedKeys } from '../common/secrets/kms-env';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { S3StorageService } from '../modules/files/storage/s3-storage.service';
import {
  parseSignatureBackfillArgs,
  runSignatureBackfill,
} from '../modules/files/signature-image-backfill';

// CONTENT_MEDIA_VERIFY 17.11 №7 (src/modules/files/signature-image.ts):
// drawn signature pictures of old case signatures, from the database to the
// private documents bucket. `npm run signatures:backfill --workspace apps/api
// -- <flags>` (after `nest build`), or in production as a one-off ECS task:
//   scripts/deploy/prod-admin-ecs.sh <image tag> signatures "<flags>"
//   (no flags)   DRY RUN: counts the rows without an object, writes nothing
//   --apply      store them and fill image_key (step 1)
//   --clear      with --apply: empty image_png of rows whose object exists
//                (step 2 — only in the release AFTER the one that added
//                image_key, so no server still reads the bytes)
//   --limit=N    stop after N rows (try --limit=20 first)
//   --batch=N    rows per database page (default 100, at most 1000)
// Safe to stop and run again; nothing is deleted; prints counts and ids only.
async function run(): Promise<number> {
  await unwrapKmsWrappedKeys();
  const opts = parseSignatureBackfillArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const summary = await runSignatureBackfill(
      {
        prisma: app.get(PrismaService),
        storage: app.get(S3StorageService),
      },
      { ...opts, log: (line) => process.stdout.write(`${line}\n`) },
    );
    process.stdout.write(
      `${opts.apply ? 'done' : 'dry-run'}: ${JSON.stringify(summary)}\n`,
    );
    return summary.failed > 0 ? 1 : 0;
  } finally {
    await app.close();
  }
}

run().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : 'failed'}\n`);
    process.exit(1);
  },
);

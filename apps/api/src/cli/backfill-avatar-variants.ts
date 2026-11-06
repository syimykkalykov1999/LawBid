import { NestFactory } from '@nestjs/core';
import { unwrapKmsWrappedKeys } from '../common/secrets/kms-env';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AppSettingsService } from '../common/app-settings/app-settings.service';
import { S3StorageService } from '../modules/files/storage/s3-storage.service';
import { ImageProcessor } from '../modules/files/processing/image-processor';
import {
  parseAvatarBackfillArgs,
  runAvatarBackfill,
} from '../modules/files/processing/avatar-backfill';

// R-405 (owner 2026-11-04): sized variants for avatars stored before the
// scan job made them. `npm run avatars:backfill --workspace apps/api -- <flags>`
// (after `nest build`), or in production as a one-off ECS task:
//   scripts/deploy/prod-admin-ecs.sh <image tag> avatars "<flags>"
//   (no flags)   DRY RUN: counts the avatars without variants, writes nothing
//   --apply      make them: 1024 px square main + 256 px preview (+ AVIF twins
//                when `images.avif_enabled`), fill width/height/mime/size/sha256/blurhash
//   --all        every clean avatar, not only the never-processed ones; an
//                avatar whose 256 px object already exists is skipped …
//   --force      … unless forced (after a quality change, say)
//   --limit=N    stop after N stored objects (try --limit=20 first)
//   --batch=N    rows per database page (default 100)
// Safe to stop and run again (a processed avatar leaves the selection);
// nothing is deleted; prints counts and opaque file ids only.
async function run(): Promise<number> {
  await unwrapKmsWrappedKeys();
  const opts = parseAvatarBackfillArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const summary = await runAvatarBackfill(
      {
        prisma: app.get(PrismaService),
        storage: app.get(S3StorageService),
        images: app.get(ImageProcessor),
        settings: app.get(AppSettingsService),
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

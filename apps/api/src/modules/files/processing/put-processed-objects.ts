import type { File } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { avifKey, variantKey } from '../files.policy';
import type { ImageProcessor } from './image-processor';
import type { S3StorageService } from '../storage/s3-storage.service';

export type ProcessedFile = Awaited<ReturnType<ImageProcessor['process']>>;

/**
 * Writes what [ImageProcessor] made next to [file]'s object: the sized
 * variants (`<key>_w256`, `_w320`, `_w1080`), their AVIF twins (best
 * effort) and, last, the main object itself. The order matters: a reader
 * who sees the new main already finds its variants. Shared by the scan job
 * (FileScanProcessor) and the avatar backfill (R-405, `avatars:backfill`).
 *
 * Owner 2026-11-08 (R2 speed): the variants and their twins go up at once
 * (one round trip to Cloudflare R2 instead of one per object, like the
 * parallel parts of @aws-sdk/lib-storage); only the main waits for them.
 */
export async function putProcessedObjects(
  storage: Pick<S3StorageService, 'put'>,
  logger: Pick<PinoLogger, 'warn'>,
  file: Pick<File, 'id' | 's3_bucket' | 's3_key'>,
  processed: ProcessedFile,
): Promise<void> {
  await Promise.all([
    ...[...processed.variants].map(([px, img]) =>
      storage.put(
        file.s3_bucket,
        variantKey(file.s3_key, px),
        img.data,
        img.mime,
      ),
    ),
    putAvifTwins(storage, logger, file, processed),
  ]);
  const main = processed.main;
  if (main) {
    await storage.put(file.s3_bucket, file.s3_key, main.data, main.mime);
  }
}

/** Owner 2026-10-25: the AVIF twins (`images.avif_enabled`). A failure
 * only costs the smaller file — the WebP/JPEG stays what is served. */
async function putAvifTwins(
  storage: Pick<S3StorageService, 'put'>,
  logger: Pick<PinoLogger, 'warn'>,
  file: Pick<File, 'id' | 's3_bucket' | 's3_key'>,
  processed: ProcessedFile,
): Promise<void> {
  try {
    const twins: Promise<void>[] = [];
    if (processed.main?.avif) {
      twins.push(
        storage.put(
          file.s3_bucket,
          avifKey(file.s3_key),
          processed.main.avif.data,
          processed.main.avif.mime,
        ),
      );
    }
    for (const [px, img] of processed.variants) {
      if (!img.avif) continue;
      twins.push(
        storage.put(
          file.s3_bucket,
          avifKey(variantKey(file.s3_key, px)),
          img.avif.data,
          img.avif.mime,
        ),
      );
    }
    await Promise.all(twins);
  } catch (err) {
    logger.warn({ fileId: file.id, err }, 'AVIF twins not stored');
  }
}

import type { File } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { avifKey, variantKey } from '../files.policy';
import type { ImageProcessor } from './image-processor';
import type { S3StorageService } from '../storage/s3-storage.service';

export type ProcessedFile = Awaited<ReturnType<ImageProcessor['process']>>;

/**
 * Writes what [ImageProcessor] made next to [file]'s object: the sized
 * variants (`<key>_w256`, `_w320`, `_w1080`), their AVIF twins (best
 * effort) and the main object itself. Shared by the scan job
 * (FileScanProcessor) and the avatar backfill (R-405, `avatars:backfill`).
 *
 * Owner 2026-11-08 (R2 speed): the variants and their twins go up at once
 * (like the parallel parts of @aws-sdk/lib-storage).
 *
 * Without [opts.original] (the backfill: the file is already `clean` and
 * served) the main goes LAST, so a reader who sees the new main already
 * finds its variants. With it (the scan job: the row is still `pending`, no
 * key of it is handed to anyone) the main goes up together with the rest —
 * owner 2026-11-09 («фото обрабатываются долго»): one round trip to R2
 * instead of two. If any object fails, the upload ([opts.original]) is put
 * back under the main key, so the retried job reads the upload again and
 * never re-encodes an already processed picture.
 */
export async function putProcessedObjects(
  storage: Pick<S3StorageService, 'put'>,
  logger: Pick<PinoLogger, 'warn'>,
  file: Pick<File, 'id' | 's3_bucket' | 's3_key'>,
  processed: ProcessedFile,
  opts: { original?: { data: Buffer; mime: string } } = {},
): Promise<void> {
  const derived = [
    ...[...processed.variants].map(([px, img]) =>
      storage.put(
        file.s3_bucket,
        variantKey(file.s3_key, px),
        img.data,
        img.mime,
      ),
    ),
    putAvifTwins(storage, logger, file, processed),
  ];
  const main = processed.main;
  const original = opts.original;
  if (!main) {
    await Promise.all(derived);
    return;
  }
  if (!original) {
    await Promise.all(derived);
    await storage.put(file.s3_bucket, file.s3_key, main.data, main.mime);
    return;
  }
  const mainPut = storage.put(
    file.s3_bucket,
    file.s3_key,
    main.data,
    main.mime,
  );
  const results = await Promise.allSettled([mainPut, ...derived]);
  const failed = results.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  );
  if (!failed) return;
  if (results[0].status === 'fulfilled') {
    try {
      await storage.put(
        file.s3_bucket,
        file.s3_key,
        original.data,
        original.mime,
      );
    } catch (err) {
      logger.warn(
        { fileId: file.id, err },
        'The upload could not be put back after a failed store',
      );
    }
  }
  throw failed.reason;
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

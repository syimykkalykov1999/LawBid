import { videoDimensions } from '../processing/video-dimensions';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { File } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../prisma/prisma.service';
import { S3StorageService } from '../storage/s3-storage.service';
import {
  ClamdTooLargeError,
  VIRUS_SCANNER,
  type VirusScanner,
} from '../scanning/virus-scanner';
import { ImageProcessor } from '../processing/image-processor';
import { dangerousContent } from '../content-guard';
import { detectMime } from '../magic-bytes';
import { computeBlurhash } from '../processing/blurhash';
import { putProcessedObjects } from '../processing/put-processed-objects';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import {
  DEDUP_PROFILE,
  derivedKeys,
  purposesOfProfile,
  FILE_MIME,
} from '../files.policy';
import {
  avifSince,
  imageQuality,
  type ImageFormat,
} from '../processing/image-processor';
import { MediaModerationQueue } from '../../media-moderation/media-moderation.queue';
import { ReadBudget, SCAN_READ_BUDGET_MB } from '../read-budget';

export type ScanOutcome =
  | 'clean'
  | 'deduplicated'
  | 'infected'
  | 'failed'
  | 'skipped:not-pending'
  | 'skipped:no-scanner';

/**
 * `files.scan` job (docs/03 §2.2 "запускает антивирус-скан (`scan_status`)"):
 * pending → clean | infected | failed.
 * - infected: the S3 object is deleted, the row stays `infected` (it can
 *   never be attached — FilesService.assertAttachable);
 * - clean: HEIC → JPEG and avatar processing (ImageProcessor) replace the
 *   object BEFORE the row turns clean, so nothing unprocessed is ever
 *   attachable; size/sha256/mime/width/height describe the stored object;
 * - an image that can't be decoded → failed, object deleted;
 * - scanner/S3 errors → thrown for a BullMQ retry; on the last attempt
 *   the file becomes `failed`.
 * No scanner (staging/production without CLAMAV_HOST) → the file stays
 * `pending` and is never attachable.
 */
/** Owner 2026-11-08: a check at least this slow writes where its time
 * went (`files_scan_slow`: read, scan, process, store in ms). */
const SCAN_SLOW_MS = 1500;

@Injectable()
export class FileScanProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly images: ImageProcessor,
    @Inject(VIRUS_SCANNER) private readonly scanner: VirusScanner | null,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
    // Owner 2026-10-22 (audit #4 §5): clean public pictures go on to the
    // image moderation check (post photos, avatars, review photos).
    @Optional() private readonly moderation?: MediaModerationQueue,
  ) {
    this.logger.setContext(FileScanProcessor.name);
  }

  /** Audit 2026-11-08 (L6): bytes of whole files this worker holds at once. */
  private readonly readBudget = new ReadBudget(SCAN_READ_BUDGET_MB);

  async run(fileId: string, finalAttempt: boolean): Promise<ScanOutcome> {
    const started = Date.now();
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.scan_status !== 'pending') return 'skipped:not-pending';
    // The job holds the whole file from the read to the end: it waits until
    // its megabytes fit the worker's budget.
    return this.readBudget.run(Number(file.size_bytes), () =>
      this.scanPending(file, finalAttempt, started),
    );
  }

  private async scanPending(
    file: File,
    finalAttempt: boolean,
    started: number,
  ): Promise<ScanOutcome> {
    const fileId = file.id;
    const laps: Record<string, number> = {};
    const lap = (name: string) => {
      laps[name] = Date.now() - started;
    };
    // R-252: confirmed without reading the file (flag `files_confirm_light`):
    // the checks `confirm` left are done first, before the dedup can look at
    // the hash.
    let held: Buffer | null = null;
    if (file.source_sha256 === null) {
      const checked = await this.finishLightConfirm(file, finalAttempt);
      if (typeof checked === 'string') return checked;
      held = checked;
      file.source_sha256 = file.sha256;
    }
    if (await this.deduplicate(file)) {
      await this.moderation?.enqueueFile(file.id, file.purpose);
      return 'deduplicated';
    }
    if (!this.scanner) {
      this.logger.warn(
        { fileId, alert: 'no_virus_scanner' },
        'No virus scanner configured (CLAMAV_HOST); file stays pending',
      );
      return 'skipped:no-scanner';
    }

    let data: Buffer;
    try {
      data = held ?? (await this.storage.read(file.s3_bucket, file.s3_key));
      lap('read');
      const verdict = await this.scanner.scan(data);
      lap('scan');
      if (verdict.infected) {
        await this.storage.remove(file.s3_bucket, [file.s3_key]);
        await this.setStatus(fileId, 'infected');
        this.logger.warn(
          { fileId, signature: verdict.signature, scanner: this.scanner.name },
          'Infected upload removed',
        );
        return 'infected';
      }
    } catch (err) {
      if (!finalAttempt && !(err instanceof ClamdTooLargeError)) throw err;
      this.logger.error(
        { fileId, err },
        'File scan failed on the last attempt',
      );
      // Too big for clamd: never scanned, so do not keep the object either.
      if (err instanceof ClamdTooLargeError) {
        await this.storage
          .remove(file.s3_bucket, [file.s3_key])
          .catch(() => undefined);
      }
      await this.setStatus(fileId, 'failed');
      return 'failed';
    }

    const mime = detectMime(data, file.mime);
    let processed;
    try {
      if (!mime) throw new Error('unrecognised content');
      processed = await this.images.process({
        data,
        mime,
        avatar: file.purpose === 'avatar',
        postImage:
          file.purpose === 'post_image' ||
          file.purpose === 'review_photo' ||
          file.purpose === 'case_photo' ||
          file.purpose === 'case_attachment' ||
          // OQ-047: chat photos get previews; documents pass through.
          file.purpose === 'chat_attachment' ||
          file.purpose === 'support_attachment' ||
          // Owner 2026-11-12: AI images are re-encoded too, so no EXIF /
          // GPS of the owner's photo is ever stored or sent to the AI.
          file.purpose === 'ai_attachment',
        format: await this.imageFormat(),
        quality: await imageQuality(this.settings),
      });
    } catch (err) {
      // Undecodable image: permanent, retrying won't help.
      this.logger.warn({ fileId, err }, 'Uploaded image cannot be processed');
      await this.storage.remove(file.s3_bucket, [file.s3_key]);
      await this.setStatus(fileId, 'failed');
      return 'failed';
    }

    try {
      const main = processed.main;
      lap('process');
      // Owner 2026-11-09 («фото обрабатываются долго»): the row is still
      // pending, so the main is stored together with its variants (one trip
      // to R2), and the placeholder for the app (never blocks) is made from
      // the smallest picture meanwhile — the same 32 px look, a fraction of
      // the decoding.
      const smallest = [...processed.variants].sort(([a], [b]) => a - b)[0];
      const [blurhash, stored] = await Promise.all([
        main ? computeBlurhash((smallest?.[1] ?? main).data) : null,
        putProcessedObjects(this.storage, this.logger, file, processed, {
          original: { data, mime: mime ?? file.mime },
        }),
      ]);
      lap('store');
      await this.prisma.file.updateMany({
        where: { id: fileId, scan_status: 'pending' },
        data: {
          scan_status: 'clean',
          avif_twins: stored.avifTwins,
          ...(blurhash ? { blurhash } : {}),
          // Owner 2026-10-18: videos get their shown size too (the app
          // draws the bubble at that shape before the video loads).
          ...(mime === FILE_MIME.mp4 || mime === FILE_MIME.mov
            ? (videoDimensions(data) ?? { width: null, height: null })
            : { width: processed.width, height: processed.height }),
          ...(main
            ? {
                mime: main.mime,
                size_bytes: BigInt(main.data.length),
                sha256: createHash('sha256').update(main.data).digest('hex'),
              }
            : {}),
        },
      });
      await this.moderation?.enqueueFile(fileId, file.purpose);
      // Owner 2026-11-08 (R2 speed): where a slow check spends its time.
      const totalMs = Date.now() - started;
      if (totalMs >= SCAN_SLOW_MS) {
        this.logger.warn(
          {
            metric: 'files_scan_slow',
            fileId,
            purpose: file.purpose,
            store: this.storage.isPublicStoreBucket(file.s3_bucket)
              ? 'r2'
              : 'aws',
            sizeBytes: Number(file.size_bytes),
            totalMs,
            laps,
          },
          'slow file check',
        );
      }
      return 'clean';
    } catch (err) {
      if (!finalAttempt) throw err;
      this.logger.error({ fileId, err }, 'Storing processed file failed');
      await this.setStatus(fileId, 'failed');
      return 'failed';
    }
  }

  /**
   * The size was checked at `confirm`; here the phone's hash is proven and the
   * inside of the container is looked at, the same refusals `confirm` makes
   * for a small file. A refused file is removed and ends `failed`, which the
   * app shows as not attachable. Returns the bytes for the scan, or the end.
   */
  private async finishLightConfirm(
    file: File,
    finalAttempt: boolean,
  ): Promise<Buffer | ScanOutcome> {
    let data: Buffer;
    try {
      data = await this.storage.read(file.s3_bucket, file.s3_key);
    } catch (err) {
      if (!finalAttempt) throw err;
      this.logger.error({ fileId: file.id, err }, 'Light confirm: no bytes');
      await this.setStatus(file.id, 'failed');
      return 'failed';
    }
    const sha256 = createHash('sha256').update(data).digest('hex');
    const mime = detectMime(data, file.mime);
    const refused =
      sha256 !== file.sha256
        ? 'checksum'
        : !mime
          ? 'unrecognised content'
          : dangerousContent(data, mime);
    if (refused) {
      this.logger.warn(
        { fileId: file.id, reason: refused },
        'Upload refused after a light confirm',
      );
      await this.storage
        .remove(file.s3_bucket, [file.s3_key])
        .catch(() => undefined);
      await this.setStatus(file.id, 'failed');
      return 'failed';
    }
    await this.prisma.file.updateMany({
      where: { id: file.id, scan_status: 'pending' },
      data: { source_sha256: sha256 },
    });
    return data;
  }

  /**
   * Owner 2026-10-05 (storage like Telegram): the same bytes uploaded
   * again (same bucket, same processing) reuse the object already stored
   * and scanned — the new upload is removed and the row points at the
   * existing object, its previews and its dimensions. `storage.dedup` off
   * keeps every copy. Identity documents, exports and video never share.
   */
  private async deduplicate(file: File): Promise<boolean> {
    const profile = DEDUP_PROFILE[file.purpose];
    if (!profile || !file.source_sha256 || !this.settings) return false;
    if (!(await this.settings.boolean('storage.dedup'))) return false;
    // An object stored before AVIF was switched on has no AVIF twin; a
    // new row sharing it would be served a missing file.
    const since = await avifSince(this.settings);
    const twin = await this.prisma.file.findFirst({
      where: {
        id: { not: file.id },
        s3_bucket: file.s3_bucket,
        source_sha256: file.source_sha256,
        purpose: { in: purposesOfProfile(profile) },
        scan_status: 'clean',
        deleted_at: null,
        s3_key: { not: file.s3_key },
        ...(since ? { created_at: { gte: since } } : {}),
      },
      orderBy: { created_at: 'asc' },
    });
    if (!twin) return false;
    const { count } = await this.prisma.file.updateMany({
      where: { id: file.id, scan_status: 'pending' },
      data: {
        s3_key: twin.s3_key,
        mime: twin.mime,
        size_bytes: twin.size_bytes,
        sha256: twin.sha256,
        width: twin.width,
        height: twin.height,
        blurhash: twin.blurhash,
        avif_twins: twin.avif_twins,
        scan_status: 'clean',
      },
    });
    if (count === 0) return false;
    // The fresh upload is no longer used by anyone (its key was unique).
    try {
      await this.storage.remove(file.s3_bucket, [
        file.s3_key,
        ...derivedKeys(file.s3_key),
      ]);
    } catch (err) {
      this.logger.warn(
        { fileId: file.id, err },
        'Duplicate upload not removed',
      );
    }
    return true;
  }

  private async imageFormat(): Promise<ImageFormat> {
    if (!this.settings) return 'jpeg';
    return (await this.settings.string('storage.image_format')) === 'jpeg'
      ? 'jpeg'
      : 'webp';
  }

  private async setStatus(
    fileId: string,
    status: 'infected' | 'failed',
  ): Promise<void> {
    await this.prisma.file.updateMany({
      where: { id: fileId, scan_status: 'pending' },
      data: { scan_status: status },
    });
  }
}

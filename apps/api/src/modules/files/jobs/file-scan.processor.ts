import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../prisma/prisma.service';
import { S3StorageService } from '../storage/s3-storage.service';
import { VIRUS_SCANNER, type VirusScanner } from '../scanning/virus-scanner';
import { ImageProcessor } from '../processing/image-processor';
import { detectMime } from '../magic-bytes';
import { variantKey } from '../files.policy';

export type ScanOutcome =
  | 'clean'
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
@Injectable()
export class FileScanProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly images: ImageProcessor,
    @Inject(VIRUS_SCANNER) private readonly scanner: VirusScanner | null,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FileScanProcessor.name);
  }

  async run(fileId: string, finalAttempt: boolean): Promise<ScanOutcome> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.scan_status !== 'pending') return 'skipped:not-pending';
    if (!this.scanner) {
      this.logger.warn(
        { fileId, alert: 'no_virus_scanner' },
        'No virus scanner configured (CLAMAV_HOST); file stays pending',
      );
      return 'skipped:no-scanner';
    }

    let data: Buffer;
    try {
      data = await this.storage.read(file.s3_bucket, file.s3_key);
      const verdict = await this.scanner.scan(data);
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
      if (!finalAttempt) throw err;
      this.logger.error(
        { fileId, err },
        'File scan failed on the last attempt',
      );
      await this.setStatus(fileId, 'failed');
      return 'failed';
    }

    const mime = detectMime(data);
    let processed;
    try {
      if (!mime) throw new Error('unrecognised content');
      processed = await this.images.process({
        data,
        mime,
        avatar: file.purpose === 'avatar',
        postImage: file.purpose === 'post_image',
      });
    } catch (err) {
      // Undecodable image: permanent, retrying won't help.
      this.logger.warn({ fileId, err }, 'Uploaded image cannot be processed');
      await this.storage.remove(file.s3_bucket, [file.s3_key]);
      await this.setStatus(fileId, 'failed');
      return 'failed';
    }

    try {
      for (const [px, img] of processed.variants) {
        await this.storage.put(
          file.s3_bucket,
          variantKey(file.s3_key, px),
          img.data,
          img.mime,
        );
      }
      const main = processed.main;
      if (main) {
        await this.storage.put(
          file.s3_bucket,
          file.s3_key,
          main.data,
          main.mime,
        );
      }
      await this.prisma.file.updateMany({
        where: { id: fileId, scan_status: 'pending' },
        data: {
          scan_status: 'clean',
          width: processed.width,
          height: processed.height,
          ...(main
            ? {
                mime: main.mime,
                size_bytes: BigInt(main.data.length),
                sha256: createHash('sha256').update(main.data).digest('hex'),
              }
            : {}),
        },
      });
      return 'clean';
    } catch (err) {
      if (!finalAttempt) throw err;
      this.logger.error({ fileId, err }, 'Storing processed file failed');
      await this.setStatus(fileId, 'failed');
      return 'failed';
    }
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

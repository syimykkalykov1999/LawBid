import { videoDimensions } from '../processing/video-dimensions';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { File } from '../../../generated/prisma/client';
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
import {
  putAvifTwins,
  putProcessedObjects,
} from '../processing/put-processed-objects';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import {
  DEDUP_PROFILE,
  derivedKeys,
  purposesOfProfile,
  FILE_MIME,
  MB,
  voiceM4aKey,
} from '../files.policy';
import {
  avifSince,
  imageQuality,
  type ImageFormat,
} from '../processing/image-processor';
import { MediaModerationQueue } from '../../media-moderation/media-moderation.queue';
import { ReadBudget, SCAN_READ_BUDGET_MB } from '../read-budget';
import { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import { ScanHandoff } from './scan-handoff';
import { readUploadLimits } from '../upload-limits';
import {
  FfmpegUnavailableError,
  needsVoiceTranscode,
  VoiceTranscoder,
} from '../processing/voice-transcode';

/** files.scan_skipped: over the antivirus size limit (R1). */
export const SCAN_SKIPPED_TOO_LARGE = 'too_large';
/** Purposes sized by their own setting instead of «Загрузки и файлы». */
const SIZE_SETTINGS = [
  'files.max_size_mb',
  'files.sticker_max_size_mb',
  'files.document_template_max_size_mb',
] as const;

export type ScanOutcome =
  | 'clean'
  | 'deduplicated'
  | 'infected'
  | 'failed'
  | 'skipped:too-large'
  | 'skipped:not-pending'
  | 'skipped:no-scanner'
  // Audit 17.11 (problem 13): the scanner was down on the last attempt;
  // the file stays pending and is checked again later (FileScanRunner).
  | 'deferred:scanner-down';

/** Audit 17.11 (problem 13): defaults of the scanner-outage retry. */
export const SCAN_OUTAGE_DEFAULTS = {
  'files.scan_outage_retry_minutes': 5,
  'files.scan_outage_retry_hours': 24,
} as const;

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
 *   the file becomes `failed` — unless the scanner itself was down
 *   (audit 17.11): then it stays pending and is checked again later;
 * - media batch A (R1): a file over the scanner's size limit is NEVER
 *   deleted. Like ClamAV's own «exceeds max» heuristic and Gmail's «this
 *   file was not scanned», it is kept and set aside: `failed` (never
 *   attachable) with `scan_skipped = 'too_large'`, counted on the admin's
 *   «Хранилище» page and left alone by the storage cleanup.
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
    // Owner row 106: the bytes `confirm` already read, and the `file:ready`
    // push that replaces the app's polling of the scan.
    @Optional() private readonly handoff?: ScanHandoff,
    @Optional() private readonly realtime?: RealtimePublisher,
    // Owner row 146: the AAC/M4A copy of a browser (WebM/Opus) voice note.
    @Optional() private readonly voice?: VoiceTranscoder,
  ) {
    this.logger.setContext(FileScanProcessor.name);
  }

  /** Audit 2026-11-08 (L6): bytes of whole files this worker holds at once. */
  private readonly readBudget = new ReadBudget(SCAN_READ_BUDGET_MB);

  /** Audit 17.11 (problem 13): ms until a file the scanner could not check
   * is tried again (`files.scan_outage_retry_minutes`, at least 1 min). */
  async outageRetryDelayMs(): Promise<number> {
    const min = await this.setting('files.scan_outage_retry_minutes');
    return Math.max(1, min) * 60_000;
  }

  private async withinOutageWindow(file: File): Promise<boolean> {
    const hours = await this.setting('files.scan_outage_retry_hours');
    const at =
      file.created_at instanceof Date ? file.created_at.getTime() : NaN;
    if (hours <= 0 || !Number.isFinite(at)) return false;
    return Date.now() - at < hours * 3_600_000;
  }

  private async setting(
    key: keyof typeof SCAN_OUTAGE_DEFAULTS,
  ): Promise<number> {
    try {
      const n = await this.settings?.number(key);
      if (typeof n === 'number' && Number.isFinite(n)) return n;
    } catch {
      // settings unreadable: the default below
    }
    return SCAN_OUTAGE_DEFAULTS[key];
  }

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
      this.ready(file, 'clean');
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

    // R1: over what clamd accepts → not even read; kept and set aside.
    const scanMax = this.scanner.maxBytes ?? 0;
    if (scanMax > 0 && Number(file.size_bytes) > scanMax) {
      return this.setAsideTooLarge(file, scanMax);
    }

    let data: Buffer;
    let scanning = false;
    try {
      data =
        held ??
        (await this.handoff?.take(file)) ??
        (await this.storage.read(file.s3_bucket, file.s3_key));
      lap('read');
      scanning = true;
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
      // R1 (audit 13.11): clamd said «size limit exceeded». Before, the
      // object was deleted here — a person's file lost after a successful
      // upload. It is kept and set aside instead (permanent: no retry).
      if (err instanceof ClamdTooLargeError) {
        return this.setAsideTooLarge(file, scanMax);
      }
      if (!finalAttempt) throw err;
      // Audit 17.11 (problem 13): the scan itself could not run (clamd down
      // or restarting). Before, every upload of those minutes ended
      // `failed` for good; now it stays pending and is checked again every
      // `files.scan_outage_retry_minutes` for `files.scan_outage_retry_hours`
      // after the upload (0 = as before).
      if (scanning && (await this.withinOutageWindow(file))) {
        this.logger.warn(
          { fileId, err, alert: 'virus_scanner_down' },
          'Virus scanner unavailable; the file is checked again later',
        );
        return 'deferred:scanner-down';
      }
      this.logger.error(
        { fileId, err },
        'File scan failed on the last attempt',
      );
      await this.setStatus(fileId, 'failed');
      return 'failed';
    }

    const mime = detectMime(data, file.mime);
    let processed;
    // M4 (owner 24.11; Meta 2022: costly copies off the send path): the AVIF
    // twins (×2.7 the encode time) are made right after the file turned
    // clean, so the sender's message never waits for them.
    const quality = await imageQuality(this.settings);
    let input: Parameters<ImageProcessor['process']>[0] | undefined;
    try {
      if (!mime) throw new Error('unrecognised content');
      input = {
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
        quality,
        keepSmallOriginal: await this.keepSmallOriginals(),
        // Media check 14.11: images kept at their size lose EXIF/GPS too
        // (a sticker is public on the CDN).
        stripMetadata:
          file.purpose === 'sticker' || file.purpose === 'task_attachment',
      };
      processed = await this.images.process({
        ...input,
        quality: { ...quality, avif: null },
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
      // Owner row 146: the copy is stored before the row turns clean, so a
      // voice message is never sent with a copy still to come.
      const voiceM4a =
        mime && needsVoiceTranscode(file.purpose, mime)
          ? await this.storeVoiceCopy(file, data, finalAttempt)
          : undefined;
      if (voiceM4a !== undefined) lap('voice');
      await this.prisma.file.updateMany({
        where: { id: fileId, scan_status: 'pending' },
        data: {
          scan_status: 'clean',
          avif_twins: stored.avifTwins,
          ...(voiceM4a !== undefined ? { voice_m4a: voiceM4a } : {}),
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
      this.ready(file, 'clean');
      await this.moderation?.enqueueFile(fileId, file.purpose);
      if (main && quality.avif && input) {
        await this.addAvifTwins(file, input);
        lap('avif');
      }
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
   * M4: the AVIF twins of a file that is already clean (and served as
   * WebP/JPEG meanwhile), from the same upload bytes, so they match the
   * pixels of the stored copies. Best effort: a failure only keeps the
   * WebP/JPEG links (`avif_twins` stays false), never the file.
   */
  private async addAvifTwins(
    file: File,
    input: Parameters<ImageProcessor['process']>[0],
  ): Promise<void> {
    try {
      const withTwins = await this.images.process(input);
      if (!(await putAvifTwins(this.storage, this.logger, file, withTwins))) {
        return;
      }
      await this.prisma.file.updateMany({
        where: { id: file.id, scan_status: 'clean' },
        data: { avif_twins: true },
      });
    } catch (err) {
      this.logger.warn({ fileId: file.id, err }, 'AVIF twins not made');
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
    // Final pass 18.11 (FO9): a browser voice note needs its iPhone copy;
    // a twin without one (switch off then, ffmpeg failed, or a sticker with
    // the same bytes) is not reused — this note is processed and gets it.
    if (
      !twin.voice_m4a &&
      needsVoiceTranscode(file.purpose, twin.mime ?? file.mime)
    ) {
      return false;
    }
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
        voice_m4a: twin.voice_m4a,
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

  /**
   * Owner row 146: the AAC/M4A copy of a browser voice note, written next to
   * the original (`<key>.m4a`). True once it is stored. The original stays
   * as it is whatever happens here: switch off, no ffmpeg in the image, a
   * note ffmpeg cannot read or a timeout → false (the note is still clean
   * and plays everywhere but on the iPhone). Only storing the ready copy is
   * retried (throws), and on the last attempt it gives up the same way.
   */
  private async storeVoiceCopy(
    file: File,
    data: Buffer,
    finalAttempt: boolean,
  ): Promise<boolean> {
    if (!this.voice || !this.settings) return false;
    if (!(await this.settings.boolean('media.voice_transcode_enabled'))) {
      return false;
    }
    const [bitrateKbps, sampleRateHz, timeoutSec] = await Promise.all([
      this.settings.number('media.voice_bitrate_kbps'),
      this.settings.number('media.voice_sample_rate_hz'),
      this.settings.number('media.voice_transcode_timeout_sec'),
    ]);
    let copy: Buffer;
    try {
      copy = await this.voice.toM4a(data, {
        bitrateKbps,
        sampleRateHz,
        timeoutMs: timeoutSec * 1000,
      });
    } catch (err) {
      const missing = err instanceof FfmpegUnavailableError;
      this.logger.warn(
        {
          fileId: file.id,
          alert: missing
            ? 'voice_transcode_unavailable'
            : 'voice_transcode_failed',
          err,
        },
        missing
          ? 'No ffmpeg in the image (WITH_FFMPEG=1): WebM voice note kept without an AAC copy'
          : 'WebM voice note could not be transcoded: kept without an AAC copy',
      );
      return false;
    }
    try {
      await this.storage.put(
        file.s3_bucket,
        voiceM4aKey(file.s3_key),
        copy,
        FILE_MIME.m4a,
      );
      return true;
    } catch (err) {
      if (!finalAttempt) throw err;
      this.logger.warn(
        { fileId: file.id, alert: 'voice_transcode_failed', err },
        'AAC copy of a voice note not stored on the last attempt',
      );
      return false;
    }
  }

  /** Owner row 106: `images.keep_small_originals` (see ImageProcessor). */
  private async keepSmallOriginals(): Promise<boolean> {
    if (!this.settings) return false;
    try {
      return await this.settings.boolean('images.keep_small_originals');
    } catch {
      return false;
    }
  }

  /**
   * Owner row 106 (media audit 13.11, batch F item 14): the owner's app
   * hears at once that the check of an upload ended (`file:ready`) instead
   * of asking every 700 ms. Best effort: the app still asks now and then.
   */
  private ready(
    file: Pick<File, 'id' | 'owner_user_id'>,
    scanStatus: 'clean' | 'infected' | 'failed',
  ): void {
    this.realtime?.toUsers([file.owner_user_id], 'file:ready', {
      fileId: file.id,
      scanStatus,
    });
  }

  /**
   * R1: too big for the antivirus. The object stays where it is; the row
   * turns `failed` (never attachable, so nothing unscanned reaches anybody)
   * and says why, for the admin («Хранилище» → «Не проверены антивирусом»).
   * The alert names the admin's largest upload limit read live, so a limit
   * raised above the scanner's shows up at once.
   */
  private async setAsideTooLarge(
    file: File,
    scanMaxBytes: number,
  ): Promise<ScanOutcome> {
    await this.prisma.file.updateMany({
      where: { id: file.id, scan_status: 'pending' },
      data: { scan_status: 'failed', scan_skipped: SCAN_SKIPPED_TOO_LARGE },
    });
    // The uploader's app stops waiting at once (row 106, `file:ready`).
    this.ready(file, 'failed');
    this.logger.warn(
      {
        alert: 'scan_skipped_too_large',
        fileId: file.id,
        purpose: file.purpose,
        sizeBytes: Number(file.size_bytes),
        scannerMaxMb: scanMaxBytes ? Math.round(scanMaxBytes / MB) : null,
        largestUploadMb: await this.largestUploadMb(),
      },
      'File over the antivirus size limit: kept, not scanned, set aside',
    );
    return 'skipped:too-large';
  }

  /** The biggest MB per file an admin has set anywhere (upload places and
   * the purposes sized by their own setting), read live. */
  private async largestUploadMb(): Promise<number | null> {
    if (!this.settings) return null;
    try {
      const limits = await readUploadLimits(this.settings);
      const own = await Promise.all(
        SIZE_SETTINGS.map((k) => this.settings!.number(k)),
      );
      return Math.max(...Object.values(limits).map((l) => l.fileMb), ...own);
    } catch {
      return null;
    }
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
    const done = await this.prisma.file.updateMany({
      where: { id: fileId, scan_status: 'pending' },
      data: { scan_status: status },
    });
    if (!this.realtime || !(done?.count > 0)) return;
    const row = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, owner_user_id: true },
    });
    if (row) this.ready(row, status);
  }
}

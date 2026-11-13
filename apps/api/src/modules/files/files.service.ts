import { imageFormatContext } from './processing/image-format-context';
import { avifSince } from './processing/image-processor';
import {
  BLOCKING_STATUSES,
  isModeratedPurpose,
} from '../media-moderation/media-moderation.constants';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import {
  Prisma,
  type File,
  type FilePurpose,
} from '../../generated/prisma/client';
import type Redis from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { RateLimitService } from '../auth/services/rate-limit.service';
import { S3StorageService } from './storage/s3-storage.service';
import { FileScanRunner } from './jobs/file-scan.runner';
import { detectMime } from './magic-bytes';
import { dangerousContent } from './content-guard';
import {
  PURPOSE_PLACES,
  UPLOAD_LIMITS_KEY,
  placeMimes,
  sanitizeUploadLimits,
  type PlaceLimits,
  type UploadLimits,
  type UploadPlace,
} from './upload-limits';
import {
  MB,
  MEDIA_SIGNED_URL_TTL_SEC,
  CONFIRM_PREFIX_BYTES,
  LIGHT_CONFIRM_MIN_BYTES,
  PRESIGN_TTL_SEC,
  PURPOSE_RULES,
  mayUsePublicStore,
  UPLOAD_INTENT_TTL_SEC,
  newFileKey,
  stagingKey,
  storedKey,
  variantKey,
  avifKey,
  AVIF_PURPOSES,
  type FileMime,
  isImageMime,
  DEDUP_PROFILE,
  purposesOfProfile,
} from './files.policy';
import {
  CONFIRM_READ_BUDGET_MB,
  CONFIRM_READ_MAX_WAITING,
  ReadBudget,
} from './read-budget';
import type {
  FileDto,
  MultipartCompleteDto,
  MultipartPlanDto,
  PresignFileDto,
  PresignedFileDto,
} from './dto/files.dto';
import {
  MIN_MULTIPART_BYTES,
  MULTIPART_TTL_SEC,
  PART_URL_TTL_SEC,
  missingParts,
  partsComplete,
  planFromUploaded,
} from './multipart';
import {
  PENDING_UPLOADS_KEY,
  leftoverUploadMember,
  multipartKey,
  pendingUploadMember,
} from './storage/pending-uploads';

/** Owner 2026-10-05: uploads that never count against a user's storage
 * cap — a profile photo, identity documents, exports, admin templates. */
const QUOTA_FREE_PURPOSES: readonly FilePurpose[] = [
  'avatar',
  'verification_document',
  'verification_selfie',
  'data_export',
  'document_template',
  // Owner 2026-10-18: a user at their quota can still write to support.
  'support_attachment',
];

interface UploadIntent {
  userId: string;
  purpose: FilePurpose;
  mime: FileMime;
  size: number;
  sha256: string;
  bucket: string;
  key: string;
}

const intentKey = (fileId: string): string => `files:upload:${fileId}`;
export { multipartKey };

/**
 * Direct-to-S3 uploads (docs/03 §2.2, §11 stage 3.2):
 * 1. presign — validates purpose/type/size, per-user rate limit, global
 *    CostGuard `storage` budget; returns a POST policy that only accepts
 *    exactly the declared size and Content-Type at one key (5 minutes);
 * 2. confirm — the server reads the object back and checks size, SHA-256
 *    and the REAL type by magic bytes; any mismatch deletes the object;
 *    a match creates the `files` row (scan_status=pending) and queues
 *    the antivirus scan (FileScanProcessor);
 * 3. attach — other modules call assertAttachable(): only the owner's
 *    `clean` file of the right purpose passes.
 */
import { SecretsService } from '../../common/secrets/secrets.service';
import { viewerContext } from '../../common/viewer/viewer-context';
import { PrivacySettingsService } from '../privacy-settings/privacy-settings.service';
import { demoContext } from '../../common/demo/demo-context';
import { FileAccessService } from './file-access.service';
import { HeavyHittersService } from '../../common/heavy-hitters/heavy-hitters.service';
import { DEMO_SETTINGS_KEY, parseDemoSettings } from '../demo/demo.settings';
export interface SignedAttachment {
  url: string;
  previewUrl: string | null;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  /** Drawn while the photo loads (images only). */
  blurhash: string | null;
}

/** Links of one post photo; `blurhash` is the loading placeholder. */
export interface PostImageLinks {
  url: string;
  previewUrl: string;
  mediumUrl: string;
  blurhash: string | null;
}

/** Owner 2026-11-08: a confirm at least this slow writes where its time
 * went (`files_confirm_slow`: head, copy, read, put, db, enqueue in ms). */
const CONFIRM_SLOW_MS = 500;

@Injectable()
export class FilesService {
  /** Audit 2026-11-08 (L6): bytes of whole-file confirm reads in flight. */
  private readonly readBudget = new ReadBudget(
    CONFIRM_READ_BUDGET_MB,
    CONFIRM_READ_MAX_WAITING,
  );

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly storage: S3StorageService,
    private readonly settings: AppSettingsService,
    private readonly costGuard: CostGuardService,
    private readonly rateLimit: RateLimitService,
    private readonly config: ConfigService,
    private readonly scans: FileScanRunner,
    private readonly logger: PinoLogger,
    private readonly flags: FeatureFlagsService,
    @Optional() private readonly secrets?: SecretsService,
    @Optional() private readonly entitlements?: EntitlementsService,
    // Owner 2026-10-20: a hidden profile photo is not served to the viewer.
    @Optional() private readonly privacy?: PrivacySettingsService,
    // Security & legal pass 2026-10-24: who opened a confidential file.
    @Optional() private readonly access?: FileAccessService,
    // WP-G: who uploads the most bytes (admin «Масштаб»).
    @Optional() private readonly heavy?: HeavyHittersService,
  ) {
    this.logger.setContext(FilesService.name);
  }

  /** [byAdmin]: an upload from the admin panel (stickers, support replies,
   * document templates). Owner 2026-11-12 («нигде с лимитами не
   * ограничивай меня»): no hourly upload count and no storage quota for
   * admins; type and size rules still apply. */
  async presign(
    userId: string,
    dto: PresignFileDto,
    { byAdmin = false }: { byAdmin?: boolean } = {},
  ): Promise<PresignedFileDto> {
    if (
      dto.purpose === 'post_video' &&
      !(await this.flags.isEnabled('video_posts', false))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Video posts are not available yet.',
      });
    }
    // Owner 2026-10-05 (plan builder): video posts are a plan term.
    if (
      dto.purpose === 'post_video' &&
      this.entitlements &&
      !(await this.entitlements.has(userId, 'video_posts'))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan does not include video posts.',
      });
    }
    const rule = PURPOSE_RULES[dto.purpose];
    const allowed = await this.allowedMimes(dto.purpose);
    const mime = allowed.find((m) => m === dto.mime);
    if (!mime) {
      throw new BadRequestException({
        code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
        message: 'This file type is not allowed here.',
        details: { allowed },
      });
    }
    const maxBytes = await this.maxBytes(dto.purpose);
    if (dto.sizeBytes > maxBytes) {
      throw this.tooLarge(maxBytes);
    }
    // 503 if S3 is off. Owner 2026-10-24: public media goes to R2 (a
    // presigned PUT) only when the switch is on AND this app can do a PUT;
    // an older app keeps getting the AWS POST. Private kinds: AWS always.
    // Owner 2026-11-08: with `media.public_store` = r2, public media goes to
    // R2 or waits — it never lands in AWS (an app that cannot PUT is asked
    // to update).
    if (mayUsePublicStore(dto.purpose)) {
      const store = await this.storage.publicStoreState();
      if (store === 'r2_unavailable') throw this.publicStoreDown();
      if (store === 'r2' && !dto.supportsPut) {
        throw new HttpException(
          {
            code: ErrorCode.APP_UPDATE_REQUIRED,
            message: 'Update the app to upload photos.',
          },
          426,
        );
      }
    }
    const resolved = await this.storage.resolveBucket(rule.bucket);
    const bucket =
      rule.bucket === 'media' &&
      this.storage.isPublicStoreBucket(resolved) &&
      !mayUsePublicStore(dto.purpose)
        ? this.storage.awsBucket('media')
        : resolved;
    const counted = !byAdmin && !QUOTA_FREE_PURPOSES.includes(dto.purpose);
    if (counted) {
      await this.assertQuota(userId, dto.sizeBytes);
    }

    const limit = byAdmin
      ? { allowed: true, retryAfterSeconds: 0 }
      : await this.rateLimit.consumeFixedWindow(
          ['files-presign', 'user', userId],
          this.config.getOrThrow<number>(
            'FILES_PRESIGN_LIMIT_PER_USER_PER_HOUR',
          ),
          3600,
        );
    if (!limit.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many uploads. Try again later.',
          details: { retryAfterSeconds: limit.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const reused = await this.reuseOwnFile(userId, dto, bucket, allowed);
    if (reused) return reused;
    if (counted) {
      await this.reserveDailyUpload(userId, dto.sizeBytes);
    }
    await this.costGuard.consume('storage', 1, { userId });
    // Owner 2026-10-05 (demo mode): a demo account may upload a little
    // (settings demo.program.uploadQuotaMb) under its own key prefix, so
    // the demo world's objects are easy to find and delete.
    await this.assertDemoQuota(userId, dto.sizeBytes);

    const fileId = randomUUID();
    // D-c1 (2026-11-09): the link writes only under `staging/`; the object
    // the row points at is the copy `confirm` makes outside it (storedKey).
    const key = stagingKey(
      demoKeyPrefix() +
        newFileKey({ purpose: dto.purpose, ownerId: userId, fileId }),
    );
    const target = {
      bucket,
      key,
      contentType: dto.mime,
      size: dto.sizeBytes,
      expiresSec: PRESIGN_TTL_SEC,
    };
    const upload = this.storage.isPublicStoreBucket(bucket)
      ? await this.storage.presignPut(target)
      : await this.storage.presignPost(target);
    const intent: UploadIntent = {
      userId,
      purpose: dto.purpose,
      mime,
      size: dto.sizeBytes,
      sha256: dto.sha256,
      bucket,
      key,
    };
    await this.redis.set(
      intentKey(fileId),
      JSON.stringify(intent),
      'EX',
      UPLOAD_INTENT_TTL_SEC,
    );
    // Owner 2026-10-05: an upload never confirmed is removed from S3 by
    // the storage cleanup once the intent has expired.
    await this.redis.zadd(
      PENDING_UPLOADS_KEY,
      Date.now() + (UPLOAD_INTENT_TTL_SEC + 600) * 1000,
      pendingUploadMember(fileId, bucket, key),
    );
    return {
      fileId,
      upload,
      expiresAt: new Date(Date.now() + PRESIGN_TTL_SEC * 1000).toISOString(),
    };
  }

  /**
   * R-254 (flag `files_reuse_own`): this user already stored these bytes, so
   * nothing is uploaded; a new row points at the object, as the storage dedup
   * does.
   *
   * ONLY the user's own files, by `owner_user_id`. A hash is not proof of
   * having a file: anyone who learned the hash of someone else's document
   * could otherwise get that document without ever holding it. The bytes of a
   * proven hash only (`source_sha256`, empty until proven), same bucket (so a
   * private file never lands among public ones), same processing, and only
   * purposes with no image moderation: a moderated picture goes the usual way
   * and gets its own check. Identity documents and video have no profile.
   */
  private async reuseOwnFile(
    userId: string,
    dto: PresignFileDto,
    bucket: string,
    allowed: readonly string[],
  ): Promise<PresignedFileDto | null> {
    const profile = DEDUP_PROFILE[dto.purpose];
    // Owner 2026-11-08: a profile photo picked again (the same bytes) is not
    // uploaded and checked a second time. Other moderated pictures still go
    // the usual way; a reused avatar needs a passed verdict (below).
    const moderated = isModeratedPurpose(dto.purpose);
    if (
      !dto.acceptsExisting ||
      !profile ||
      (moderated && dto.purpose !== 'avatar') ||
      !(await this.flags.isEnabled('files_reuse_own', true)) ||
      !(await this.settings.boolean('storage.dedup'))
    ) {
      return null;
    }
    const since = await avifSince(this.settings);
    const own = await this.prisma.file.findFirst({
      where: {
        owner_user_id: userId,
        s3_bucket: bucket,
        source_sha256: dto.sha256,
        purpose: { in: purposesOfProfile(profile) },
        scan_status: 'clean',
        deleted_at: null,
        ...(since ? { created_at: { gte: since } } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
    if (
      !own ||
      own.owner_user_id !== userId ||
      !allowed.includes(own.mime) ||
      (await this.mediaBlocked(own.id))
    ) {
      return null;
    }
    // A moderated picture is reused only with a finished, passed verdict of
    // the same bytes; the copy carries that verdict, so a later take-down of
    // the picture finds it as well. Anything else is uploaded and checked.
    const verdict = moderated
      ? await this.prisma.mediaModerationCheck.findUnique({
          where: { file_id: own.id },
        })
      : null;
    if (
      moderated &&
      !(
        verdict &&
        (verdict.status === 'clean' || verdict.decision === 'approved') &&
        verdict.content_sha256 !== null
      )
    ) {
      return null;
    }
    const fileId = randomUUID();
    await this.prisma.file.create({
      data: {
        id: fileId,
        owner_user_id: userId,
        purpose: dto.purpose,
        s3_bucket: own.s3_bucket,
        s3_key: own.s3_key,
        mime: own.mime,
        size_bytes: own.size_bytes,
        sha256: own.sha256,
        source_sha256: own.source_sha256,
        width: own.width,
        height: own.height,
        blurhash: own.blurhash,
        avif_twins: own.avif_twins,
        scan_status: 'clean',
      },
    });
    if (verdict) {
      await this.prisma.mediaModerationCheck.create({
        data: {
          file_id: fileId,
          owner_user_id: userId,
          purpose: dto.purpose,
          content_sha256: verdict.content_sha256,
          status: verdict.status,
          csam_status: verdict.csam_status,
          provider: verdict.provider,
          labels: verdict.labels ?? [],
          max_confidence: verdict.max_confidence,
          top_label: verdict.top_label,
          decision: verdict.decision,
          checked_at: verdict.checked_at,
        },
      });
    }
    return {
      fileId,
      upload: { url: '', fields: {} },
      expiresAt: new Date().toISOString(),
      existing: true,
    };
  }

  private async multipartIntent(
    userId: string,
    fileId: string,
  ): Promise<UploadIntent> {
    if (!(await this.flags.isEnabled('files_multipart', false))) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Resumable uploads are not available yet.',
      });
    }
    const raw = await this.redis.get(intentKey(fileId));
    const intent = raw ? (JSON.parse(raw) as UploadIntent) : null;
    if (!intent || intent.userId !== userId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'File not found.',
      });
    }
    return intent;
  }

  /**
   * Resumable upload, step 1 (and every resume): the part links still to be
   * sent. The first call starts the S3 multipart upload and keeps the upload
   * alive for 24 h instead of 1 h; later calls list what S3 already has.
   */
  async multipartPlan(
    userId: string,
    fileId: string,
  ): Promise<MultipartPlanDto> {
    const intent = await this.multipartIntent(userId, fileId);
    if (intent.size < MIN_MULTIPART_BYTES) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This file is small enough for a single upload.',
      });
    }
    const limit = await this.rateLimit.consumeFixedWindow(
      ['files-multipart', 'user', userId],
      600,
      3600,
    );
    if (!limit.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests. Try again later.',
          details: { retryAfterSeconds: limit.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    let uploadId = await this.redis.get(multipartKey(fileId));
    if (!uploadId) {
      const started = await this.storage.startMultipart({
        bucket: intent.bucket,
        key: intent.key,
        contentType: intent.mime,
      });
      const won = await this.redis.set(
        multipartKey(fileId),
        started,
        'EX',
        MULTIPART_TTL_SEC,
        'NX',
      );
      uploadId = started;
      if (won !== 'OK') {
        // A parallel request started one first: use that, drop ours.
        const theirs = await this.redis.get(multipartKey(fileId));
        if (theirs && theirs !== started) {
          await this.storage.abortMultipart(intent.bucket, intent.key, started);
          uploadId = theirs;
        }
      }
    }
    // Keep the upload (and its cleanup record) alive for the longer window.
    await this.redis.expire(intentKey(fileId), MULTIPART_TTL_SEC);
    await this.redis.expire(multipartKey(fileId), MULTIPART_TTL_SEC);
    await this.redis.zadd(
      PENDING_UPLOADS_KEY,
      Date.now() + (MULTIPART_TTL_SEC + 600) * 1000,
      pendingUploadMember(fileId, intent.bucket, intent.key),
    );
    const uploaded = await this.storage.listParts(
      intent.bucket,
      intent.key,
      uploadId,
    );
    const plan = planFromUploaded(intent.size, uploaded);
    const todo = missingParts(plan, uploaded);
    const parts = await Promise.all(
      todo.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignPart({
          bucket: intent.bucket,
          key: intent.key,
          uploadId: uploadId,
          partNumber,
          expiresSec: PART_URL_TTL_SEC,
        }),
      })),
    );
    return {
      partSizeBytes: plan.partSizeBytes,
      partCount: plan.partCount,
      uploadedParts: uploaded.map((p) => p.partNumber),
      parts,
      expiresAt: new Date(Date.now() + PART_URL_TTL_SEC * 1000).toISOString(),
    };
  }

  /** Resumable upload, last step: assemble the parts (then `confirm`). */
  async multipartComplete(
    userId: string,
    fileId: string,
  ): Promise<MultipartCompleteDto> {
    const intent = await this.multipartIntent(userId, fileId);
    const uploadId = await this.redis.get(multipartKey(fileId));
    if (!uploadId) {
      // A retry after a successful completion: the object is there.
      const head = await this.storage.head(intent.bucket, intent.key);
      if (head && head.size === intent.size) return { sizeBytes: head.size };
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_UPLOADED,
        message: 'Start the resumable upload first.',
      });
    }
    const uploaded = await this.storage.listParts(
      intent.bucket,
      intent.key,
      uploadId,
    );
    const plan = planFromUploaded(intent.size, uploaded);
    if (!partsComplete(plan, intent.size, uploaded)) {
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_UPLOADED,
        message: 'Some parts are missing or have a wrong size.',
        details: { missingParts: missingParts(plan, uploaded) },
      });
    }
    await this.storage.completeMultipart(
      intent.bucket,
      intent.key,
      uploadId,
      uploaded,
    );
    await this.redis.del(multipartKey(fileId));
    return { sizeBytes: intent.size };
  }

  async confirm(userId: string, fileId: string): Promise<FileDto> {
    const raw = await this.redis.get(intentKey(fileId));
    const intent = raw ? (JSON.parse(raw) as UploadIntent) : null;
    if (!intent || intent.userId !== userId) {
      // Already confirmed (a retry) → same answer; anything else → 404.
      return this.get(userId, fileId);
    }

    // Owner 2026-11-08 (R2 speed): where a slow confirm spends its time.
    const started = Date.now();
    const laps: Record<string, number> = {};
    const lap = (name: string) => {
      laps[name] = Date.now() - started;
    };
    // Owner 2026-11-09 («фото обрабатываются долго»): a file under the light
    // threshold is read whole anyway, so the HEAD and the server-side copy
    // (≈0.6 s on R2, measured on prod) are skipped: ONE ranged GET of the
    // upload (never more than the size the link allowed, plus one byte to see
    // a longer object), the checks below on those bytes, then a PUT of
    // exactly the checked bytes to the server key (M3 holds: what is stored
    // is what was checked, nothing a link can still write is ever read
    // again). Flag `files_confirm_direct`; off = HEAD + copy as before.
    const maxBytes = await this.maxBytes(intent.purpose);
    const direct =
      intent.size < LIGHT_CONFIRM_MIN_BYTES &&
      (await this.flags.isEnabled('files_confirm_direct', true));
    const key = storedKey(intent.key, randomUUID().slice(0, 8));
    // The content checks, on the whole file or (light confirm) on its start.
    const checkData = async (
      data: Buffer,
      isPrefix: boolean,
    ): Promise<{ sha256: string | null; detected: string }> => {
      let sha256: string | null = null;
      if (!isPrefix) {
        sha256 = createHash('sha256').update(data).digest('hex');
        if (data.length !== intent.size || sha256 !== intent.sha256) {
          await this.reject(fileId, intent, key);
          throw this.checksumMismatch();
        }
      }
      const detected = detectMime(data, intent.mime);
      if (
        detected === null ||
        detected !== intent.mime ||
        !(await this.allowedMimes(intent.purpose)).includes(detected)
      ) {
        await this.reject(fileId, intent, key);
        throw new BadRequestException({
          code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
          message: 'The file content does not match an allowed type.',
          details: { declared: intent.mime, detected },
        });
      }
      // Owner 2026-10-07: no program, macro or script hidden inside an
      // allowed document (APK in a .docx, a macro, PDF JavaScript).
      const danger = isPrefix ? null : dangerousContent(data, detected);
      if (danger) {
        await this.reject(fileId, intent, key);
        throw new BadRequestException({
          code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
          message: 'The file contains content that is not allowed.',
          details: { declared: intent.mime, detected, reason: danger },
        });
      }
      return { sha256, detected };
    };
    let size: number;
    let checked: { sha256: string | null; detected: string };
    let directData: Buffer | null = null;
    if (direct) {
      // Security audit 2026-11-08 (L6): a whole-file read holds its bytes
      // until the checks are done; the read budget caps how many megabytes
      // all confirms of this process hold at once.
      const read = await this.readBudget.run(
        Math.min(intent.size, maxBytes) + 1,
        async () => {
          const got = await this.storage.readUpTo(
            intent.bucket,
            intent.key,
            Math.min(intent.size, maxBytes) + 1,
          );
          lap('read');
          if (!got) return null;
          if (got.length > maxBytes) {
            await this.reject(fileId, intent);
            throw this.tooLarge(maxBytes);
          }
          return { got, ...(await checkData(got, false)) };
        },
      );
      if (!read) return this.notUploaded(userId, fileId);
      size = read.got.length;
      directData = read.got;
      checked = { sha256: read.sha256, detected: read.detected };
    } else {
      const head = await this.storage.head(intent.bucket, intent.key);
      lap('head');
      if (!head) return this.notUploaded(userId, fileId);
      size = head.size;
      if (head.size > maxBytes) {
        await this.reject(fileId, intent);
        throw this.tooLarge(maxBytes);
      }
      if (head.size !== intent.size) {
        await this.reject(fileId, intent);
        throw this.checksumMismatch();
      }
      // Security audit 2026-11-08 (M3): the presigned link of this upload
      // can still overwrite intent.key until it expires. Everything below —
      // the type, the hash, the content check, the scan, every download —
      // uses a server-side copy at a key no link can write, so bytes swapped
      // in after the checks never reach anyone. The copy is done by S3 / R2.
      // L5: the copy gets the bucket's real Cache-Control; the staging object
      // was written `no-store`.
      if (
        !(await this.storage.copy(intent.bucket, intent.key, key, {
          contentType: intent.mime,
          cacheControl: this.storage.cacheControlFor(intent.bucket),
        }))
      ) {
        return this.notUploaded(userId, fileId);
      }
      lap('copy');
      // R-252: a big file is not read into the API's memory here. The start
      // of the file settles its type at once; the checksum and the look
      // inside the container move to the scan worker, which holds the file
      // anyway. The file stays `pending`, and only `clean` files can be
      // attached. A start the prefix cannot settle goes the full way.
      let prefix: Buffer | null = null;
      if (
        head.size >= LIGHT_CONFIRM_MIN_BYTES &&
        (await this.flags.isEnabled('files_confirm_light', true))
      ) {
        const start = await this.storage.readStart(
          intent.bucket,
          key,
          CONFIRM_PREFIX_BYTES,
        );
        if (detectMime(start, intent.mime) !== null) prefix = start;
      }
      if (prefix) {
        lap('read');
        checked = await checkData(prefix, true);
      } else {
        checked = await this.readBudget.run(head.size, async () => {
          const whole = await this.storage.read(intent.bucket, key);
          lap('read');
          return checkData(whole, false);
        });
      }
    }
    const { sha256, detected } = checked;
    if (directData) {
      // The checked bytes, and only they, go to the key no link can write
      // (put sets the bucket's Cache-Control).
      await this.storage.put(intent.bucket, key, directData, detected);
      lap('put');
    }

    try {
      await this.prisma.file.create({
        data: {
          id: fileId,
          owner_user_id: userId,
          purpose: intent.purpose,
          s3_bucket: intent.bucket,
          s3_key: key,
          mime: detected,
          size_bytes: BigInt(size),
          // Light confirm: `sha256` is what the phone claimed, unproven until
          // the worker checks it. An empty `source_sha256` is what tells the
          // worker so, and it keeps the row out of the storage dedup: a false
          // hash must never point this row at someone else's object.
          sha256: sha256 ?? intent.sha256,
          source_sha256: sha256,
        },
      });
    } catch (err) {
      // A concurrent confirm of the same upload won the insert: its row
      // points at its own copy, so this one is dropped.
      await this.dropObjects(fileId, intent.bucket, [key]);
      if (!(
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      )) {
        throw err;
      }
      return this.get(userId, fileId);
    }
    this.heavy?.upload(userId, size);
    await this.redis.del(intentKey(fileId));
    await this.redis.zrem(
      PENDING_UPLOADS_KEY,
      pendingUploadMember(fileId, intent.bucket, intent.key),
    );
    // M3: the uploaded object is no longer needed (it was never handed out,
    // so there is no edge copy to purge). Whatever its link writes there
    // before it expires is deleted again by the storage cleanup.
    // Owner 2026-11-08: that cleanup also covers a failed delete, so the
    // answer does not wait for one more trip to R2.
    lap('db');
    await this.redis.zadd(
      PENDING_UPLOADS_KEY,
      Date.now() + (PRESIGN_TTL_SEC + 600) * 1000,
      leftoverUploadMember(fileId, intent.bucket, intent.key),
    );
    void this.dropObjects(fileId, intent.bucket, [intent.key]);
    await this.scans.enqueueScan(fileId, userId);
    lap('enqueue');
    const answer = await this.get(userId, fileId);
    const totalMs = Date.now() - started;
    if (totalMs >= CONFIRM_SLOW_MS) {
      this.logger.warn(
        {
          metric: 'files_confirm_slow',
          fileId,
          purpose: intent.purpose,
          store: this.storage.isPublicStoreBucket(intent.bucket) ? 'r2' : 'aws',
          sizeBytes: size,
          path: direct ? 'direct' : 'copy',
          totalMs,
          laps,
        },
        'slow file confirm',
      );
    }
    return answer;
  }

  /** Owner 2026-11-08: R2 is selected but not ready — a temporary 503 the
   * app's queue retries (after `retryAfterSeconds`), never an AWS upload. */
  private publicStoreDown(): HttpException {
    this.logger.warn(
      { alert: 'r2_public_upload_waiting' },
      'Public upload refused while R2 is not ready (media.public_store = r2)',
    );
    return new HttpException(
      {
        code: ErrorCode.FILE_STORAGE_UNAVAILABLE,
        message: 'Photo storage is busy. Try again shortly.',
        details: { retryAfterSeconds: 30 },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /** No object at the upload key: a retry of a confirm that already
   * finished gets its row; otherwise the file was never uploaded. */
  private async notUploaded(userId: string, fileId: string): Promise<FileDto> {
    const done = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (done && done.owner_user_id === userId) return this.toDto(done);
    throw new ConflictException({
      code: ErrorCode.FILE_NOT_UPLOADED,
      message: 'Upload the file before confirming it.',
    });
  }

  /** Best effort: a leftover object is only storage, never a wrong answer.
   * These objects were never handed out, so no edge cache is purged. */
  private async dropObjects(
    fileId: string,
    bucket: string,
    keys: string[],
  ): Promise<void> {
    try {
      await this.storage.remove(bucket, keys, { purgeEdge: false });
    } catch (err) {
      this.logger.error({ err, fileId }, 'Could not delete an upload copy');
    }
  }

  /** Owner-only view (deny by default: someone else's id is a 404). */
  async get(userId: string, fileId: string): Promise<FileDto> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.owner_user_id !== userId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'File not found.',
      });
    }
    return this.toDto(file);
  }

  /**
   * The only way another module may reference a file (avatar, verification
   * documents, post photos): it must belong to [userId], have one of
   * [purposes] and be `clean` — pending/infected/failed never pass.
   */
  async assertAttachable(
    userId: string,
    fileId: string,
    purposes: readonly FilePurpose[],
    // Row 69 (KE 123): a caller inside a transaction passes it, so this read
    // does not take a second pool connection while the transaction holds one.
    db: Pick<Prisma.TransactionClient, 'file'> = this.prisma,
  ): Promise<File> {
    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file || file.owner_user_id !== userId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'File not found.',
      });
    }
    if (!purposes.includes(file.purpose) || file.scan_status !== 'clean') {
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_ATTACHABLE,
        message: 'This file cannot be attached.',
        details: { purpose: file.purpose, scanStatus: file.scan_status },
      });
    }
    // Owner 2026-10-22 (audit #4 §5): a picture the image moderation hid
    // can't be posted anywhere else either.
    if (
      isModeratedPurpose(file.purpose) &&
      (await this.mediaBlocked(file.id))
    ) {
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_ATTACHABLE,
        message: 'This picture breaks the community rules.',
        details: { purpose: file.purpose, moderation: 'rejected' },
      });
    }
    return file;
  }

  /** Owner 2026-10-22: the image moderation hid this picture and no
   * moderator approved it (media_moderation_checks, one indexed row). */
  private async mediaBlocked(fileId: string): Promise<boolean> {
    const check = await this.prisma.mediaModerationCheck.findUnique({
      where: { file_id: fileId },
      select: { status: true, decision: true },
    });
    return (
      !!check &&
      (BLOCKING_STATUSES as readonly string[]).includes(check.status) &&
      check.decision !== 'approved'
    );
  }

  /** Signed link to a clean avatar/post image, null otherwise. */
  async mediaUrl(fileId: string | null): Promise<string | null> {
    if (!fileId) return null;
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    return file ? this.mediaUrlOf(file) : null;
  }

  /** [mediaUrl] for several files in one query (fileId → link; files with
   * no public link are left out). */
  async mediaUrlsMany(
    fileIds: (string | null | undefined)[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(fileIds.filter((x): x is string => !!x))];
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    const rows = await this.prisma.file.findMany({
      where: { id: { in: ids } },
    });
    for (const f of rows) {
      const url = await this.mediaUrlOf(f);
      if (url) out.set(f.id, url);
    }
    return out;
  }

  /** docs/03 §4.1 / OQ-012: true when [fileId] is [ownerId]'s own live
   * avatar that passed the antivirus scan (what onboarding requires of an
   * attorney). No storage call — the DB row is the source of truth. */
  async isCleanAvatar(
    fileId: string | null,
    ownerId: string,
  ): Promise<boolean> {
    if (!fileId) return false;
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    return (
      file !== null &&
      file.owner_user_id === ownerId &&
      file.purpose === 'avatar' &&
      file.scan_status === 'clean' &&
      file.deleted_at === null
    );
  }

  /**
   * Public avatar links (docs/03 §4.1 photo, §6: the attorney photo is
   * public profile content). Only a clean `avatar` file in the media
   * bucket is ever signed here — verification documents/selfies can never
   * come out of this path. `url256` is the square 256 px variant the scan
   * job stores next to every processed avatar.
   */
  async avatarUrls(
    fileId: string | null,
  ): Promise<{ url: string | null; url256: string | null }> {
    const none = { url: null, url256: null };
    if (!fileId) return none;
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.purpose !== 'avatar') return none;
    if ((await this.photoHiddenFrom([file.id])).has(file.id)) return none;
    const url = await this.mediaUrlOf(file);
    if (!url) return none;
    return { url, url256: await this.avatarPreviewLink(file, url) };
  }

  /**
   * Owner 2026-10-20: of these avatar files, the ones whose owner keeps
   * the photo from the current viewer ("who sees my photo": contacts /
   * nobody). One place for every card and list; no viewer (jobs, admin)
   * hides nothing.
   */
  private async photoHiddenFrom(fileIds: string[]): Promise<Set<string>> {
    const viewer = viewerContext.viewerId();
    if (!viewer || !this.privacy || fileIds.length === 0) return new Set();
    const owners = await this.prisma.user.findMany({
      where: { avatar_file_id: { in: fileIds } },
      select: { id: true, avatar_file_id: true },
    });
    const visible = await this.privacy.visibleTo(
      viewer,
      owners.map((o) => o.id),
      'photo_from',
    );
    return new Set(
      owners
        .filter((o) => !visible.has(o.id) && o.avatar_file_id)
        .map((o) => o.avatar_file_id as string),
    );
  }

  /** [avatarUrls] for a whole page in one query (lists of posts,
   * comments, chats, follows, notifications — no N+1). */
  async avatarUrlsMany(
    fileIds: (string | null | undefined)[],
  ): Promise<Map<string, { url: string | null; url256: string | null }>> {
    const ids = [...new Set(fileIds.filter((x): x is string => !!x))];
    const out = new Map<
      string,
      { url: string | null; url256: string | null }
    >();
    if (ids.length === 0) return out;
    const all = await this.prisma.file.findMany({
      where: { id: { in: ids }, purpose: 'avatar' },
    });
    const hidden = await this.photoHiddenFrom(all.map((f) => f.id));
    const files = all.filter((f) => !hidden.has(f.id));
    await Promise.all(
      files.map(async (file) => {
        const url = await this.mediaUrlOf(file);
        if (!url) return;
        out.set(file.id, {
          url,
          url256: await this.avatarPreviewLink(file, url),
        });
      }),
    );
    return out;
  }

  /**
   * docs/03 §2.2: verification files are viewed ONLY by verifier /
   * super_admin through links living `verification.signed_url_ttl_sec`
   * (300 s). Callers (verifier API, stage 3.4) must check the role and
   * write the audit_log row for every view; nothing app-facing calls this.
   */
  async verificationFileUrl(
    fileId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (
      !file ||
      (file.purpose !== 'verification_document' &&
        file.purpose !== 'verification_selfie') ||
      file.scan_status !== 'clean'
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'File not found.',
      });
    }
    const ttl = await this.settings.number('verification.signed_url_ttl_sec');
    return {
      url: await this.storage.signedGetUrl(file.s3_bucket, file.s3_key, ttl),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  /**
   * docs/05 §3.2 post photos: main (≤ 2048 px), 320 px preview and
   * 1080 px medium links for clean `post_image` files, keyed by file id.
   * Signing is local (no S3 round trip); one DB read for the batch. With
   * MEDIA_CDN_BASE_URL set the links are CloudFront URLs (docs/06 §6.1).
   */
  async postImageUrls(fileIds: string[]): Promise<Map<string, PostImageLinks>> {
    const out = new Map<string, PostImageLinks>();
    if (fileIds.length === 0) return out;
    const files = await this.prisma.file.findMany({
      // Owner 2026-10-01: review photos share the post-photo variants.
      where: {
        id: { in: fileIds },
        purpose: { in: ['post_image', 'review_photo'] },
      },
    });
    for (const file of files) {
      const url = await this.mediaUrlOf(file);
      if (!url) continue;
      const sign = (px: number) => this.imageLink(file, px);
      out.set(file.id, {
        url,
        previewUrl: await sign(320),
        mediumUrl: await sign(1080),
        blurhash: file.blurhash,
      });
    }
    return out;
  }

  /** Owner 2026-10-01: public links of clean sticker images. */
  async stickerUrls(fileIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (fileIds.length === 0) return out;
    const files = await this.prisma.file.findMany({
      where: { id: { in: fileIds }, purpose: 'sticker' },
    });
    for (const file of files) {
      const url = await this.mediaUrlOf(file);
      if (url) out.set(file.id, url);
    }
    return out;
  }

  /**
   * Security & legal pass 2026-10-24: how long a link to a confidential
   * file lives (`files.confidential_url_ttl_sec`, default 15 min instead of
   * the 1 h of public media). The app asks for a new link at every open and
   * every caller re-checks access first, so removed access ends here.
   */
  private async confidentialTtl(): Promise<number> {
    try {
      const n = await this.settings.number('files.confidential_url_ttl_sec');
      return Number.isFinite(n) ? Math.min(Math.max(n, 60), 3600) : 900;
    } catch {
      return 900;
    }
  }

  /** Journal row for every confidential file handed to somebody other than
   * its owner (best effort, never awaited by the caller). */
  private noteViews(
    files: { id: string; owner_user_id: string; purpose: string }[],
  ): void {
    if (!this.access || files.length === 0) return;
    void this.access.recordViews(files);
  }

  /**
   * OQ-031: short-lived signed links for clean case photos (documents
   * bucket — never the CDN), in [fileIds] order. The caller decides who
   * may see them (case owner / accepted attorney).
   */
  async casePhotoUrls(fileIds: string[]): Promise<
    {
      fileId: string;
      url: string;
      previewUrl: string;
      mime: string;
      sizeBytes: number;
      blurhash: string | null;
    }[]
  > {
    if (fileIds.length === 0 || !this.storage.configured) return [];
    const files = await this.prisma.file.findMany({
      where: {
        id: { in: fileIds },
        // OQ-034: documents (PDF, Word) sit next to the photos.
        purpose: { in: ['case_photo', 'case_attachment'] },
        scan_status: 'clean',
        deleted_at: null,
      },
    });
    const ttl = await this.confidentialTtl();
    this.noteViews(files);
    const byId = new Map(files.map((f) => [f.id, f]));
    const out: {
      fileId: string;
      url: string;
      previewUrl: string;
      mime: string;
      sizeBytes: number;
      blurhash: string | null;
    }[] = [];
    for (const id of fileIds) {
      const f = byId.get(id);
      if (!f) continue;
      const url = await this.storage.signedGetUrl(f.s3_bucket, f.s3_key, ttl);
      out.push({
        fileId: f.id,
        url,
        // Documents have no image preview: the app shows a file tile.
        previewUrl: isImageMime(f.mime)
          ? await this.storage.signedGetUrl(
              f.s3_bucket,
              variantKey(f.s3_key, 320),
              ttl,
            )
          : url,
        mime: f.mime,
        sizeBytes: Number(f.size_bytes),
        // R-248: drawn while the picture loads (images only).
        blurhash: isImageMime(f.mime) ? f.blurhash : null,
      });
    }
    return out;
  }

  /** OQ-048: short signed links to the documents of tasks. */
  async taskFileUrls(
    fileIds: string[],
  ): Promise<Map<string, { url: string; mime: string }>> {
    const out = new Map<string, { url: string; mime: string }>();
    if (fileIds.length === 0 || !this.storage.configured) return out;
    const files = await this.prisma.file.findMany({
      where: {
        id: { in: fileIds },
        purpose: 'task_attachment',
        scan_status: 'clean',
        deleted_at: null,
      },
      select: {
        id: true,
        s3_bucket: true,
        s3_key: true,
        mime: true,
        owner_user_id: true,
        purpose: true,
      },
    });
    const ttl = await this.confidentialTtl();
    this.noteViews(files);
    for (const f of files) {
      out.set(f.id, {
        url: await this.storage.signedGetUrl(f.s3_bucket, f.s3_key, ttl),
        mime: f.mime,
      });
    }
    return out;
  }

  /**
   * OQ-047: short signed links to clean chat attachments (documents
   * bucket), with a 320 px preview for photos. The caller has checked
   * chat membership.
   */
  async attachmentUrls(
    fileIds: string[],
  ): Promise<Map<string, SignedAttachment>> {
    return this.signedAttachments('chat_attachment', fileIds);
  }

  /**
   * Owner 2026-10-18 (OQ-055): short signed links to clean support
   * attachments (documents bucket), a 320 px preview for photos; documents
   * are saved under the sender's file name. The caller has checked that
   * the viewer is the ticket's user or support staff.
   */
  async supportAttachmentUrls(
    files: { fileId: string; name: string }[],
  ): Promise<Map<string, SignedAttachment>> {
    return this.signedAttachments(
      'support_attachment',
      files.map((f) => f.fileId),
      new Map(files.map((f) => [f.fileId, f.name])),
    );
  }

  private async signedAttachments(
    purpose: FilePurpose,
    fileIds: string[],
    names?: ReadonlyMap<string, string>,
  ): Promise<Map<string, SignedAttachment>> {
    const out = new Map<string, SignedAttachment>();
    if (fileIds.length === 0 || !this.storage.configured) return out;
    const files = await this.prisma.file.findMany({
      where: {
        id: { in: fileIds },
        purpose,
        scan_status: 'clean',
        deleted_at: null,
      },
    });
    const ttl = await this.confidentialTtl();
    this.noteViews(files);
    for (const f of files) {
      out.set(f.id, {
        url: await this.storage.signedGetUrl(
          f.s3_bucket,
          f.s3_key,
          ttl,
          // Photos and videos play inline; documents save under the name.
          isImageMime(f.mime) || f.mime.startsWith('video/')
            ? undefined
            : names?.get(f.id),
        ),
        previewUrl: isImageMime(f.mime)
          ? await this.storage.signedGetUrl(
              f.s3_bucket,
              variantKey(f.s3_key, 320),
              ttl,
            )
          : null,
        mime: f.mime,
        sizeBytes: Number(f.size_bytes),
        width: f.width,
        height: f.height,
        blurhash: isImageMime(f.mime) ? f.blurhash : null,
      });
    }
    return out;
  }

  /**
   * Owner 2026-10-05: signed download links to clean post documents
   * (documents bucket, never the CDN). The caller has checked that the
   * viewer may see the post.
   */
  async postAttachmentUrls(
    files: { fileId: string; fileName: string }[],
  ): Promise<Map<string, { url: string; mime: string; sizeBytes: number }>> {
    const out = new Map<
      string,
      { url: string; mime: string; sizeBytes: number }
    >();
    if (files.length === 0 || !this.storage.configured) return out;
    const names = new Map(files.map((f) => [f.fileId, f.fileName]));
    const rows = await this.prisma.file.findMany({
      where: {
        id: { in: [...names.keys()] },
        purpose: 'post_attachment',
        scan_status: 'clean',
        deleted_at: null,
      },
    });
    for (const f of rows) {
      out.set(f.id, {
        url: await this.storage.signedGetUrl(
          f.s3_bucket,
          f.s3_key,
          MEDIA_SIGNED_URL_TTL_SEC,
          names.get(f.id),
        ),
        mime: f.mime,
        sizeBytes: Number(f.size_bytes),
      });
    }
    return out;
  }

  /**
   * Owner 2026-10-05: a signed download link to a clean document template
   * (documents bucket, saved under [fileName]); null when not available.
   */
  async documentTemplateUrl(
    fileId: string,
    fileName: string,
  ): Promise<string | null> {
    if (!this.storage.configured) return null;
    const f = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        purpose: 'document_template',
        scan_status: 'clean',
        deleted_at: null,
      },
      select: { s3_bucket: true, s3_key: true },
    });
    if (!f) return null;
    return this.storage.signedGetUrl(
      f.s3_bucket,
      f.s3_key,
      MEDIA_SIGNED_URL_TTL_SEC,
      fileName,
    );
  }

  /**
   * Owner 2026-10-05: a private copy of a clean file for [userId] under
   * another purpose (a document template → the user's chat or case
   * attachment). Same bytes as an already-scanned file, so the copy is
   * clean at once; the target purpose's types, size limit, upload rate
   * limit (only when the bytes are really copied) and storage budget
   * still apply.
   */
  /**
   * Owner 2026-10-22 (security audit #3, finding 8; defence in depth): may
   * [userId] read [file]? Every caller of copyForUser checks its source
   * first; this keeps a future caller from copying any file id it is
   * handed. Readable = the user's own file, or one shown where the user
   * may look: a message of a chat they take part in, a message of a group
   * they are still in, a live channel post (channels are public), or a
   * published document template. Anything else is a 404 (deny by default,
   * never a hint the file exists).
   */
  async assertReadable(
    userId: string,
    file: Pick<File, 'id' | 'owner_user_id'>,
  ): Promise<void> {
    if (file.owner_user_id === userId) return;
    const id = file.id;
    const [chat, group, channel, template] = await Promise.all([
      this.prisma.message.findFirst({
        where: {
          file_id: id,
          deleted_at: null,
          conversation: {
            OR: [{ client_id: userId }, { attorney_id: userId }],
          },
        },
        select: { id: true },
      }),
      this.prisma.chatGroupMessage.findFirst({
        where: {
          file_id: id,
          deleted_at: null,
          group: {
            deleted_at: null,
            members: { some: { user_id: userId, left_at: null } },
          },
        },
        select: { id: true },
      }),
      this.prisma.channelPost.findFirst({
        where: {
          media_file_ids: { has: id },
          status: 'active',
          deleted_at: null,
          channel: { deleted_at: null, status: { not: 'banned' } },
        },
        select: { id: true },
      }),
      this.prisma.documentTemplate.findFirst({
        where: { file_id: id, is_published: true, deleted_at: null },
        select: { id: true },
      }),
    ]);
    if (chat || group || channel || template) return;
    throw new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'File not found.',
    });
  }

  async copyForUser(
    sourceFileId: string,
    userId: string,
    purpose: FilePurpose,
  ): Promise<FileDto> {
    const src = await this.prisma.file.findUnique({
      where: { id: sourceFileId },
    });
    if (!src || src.deleted_at !== null || src.scan_status !== 'clean') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'File not found.',
      });
    }
    await this.assertReadable(userId, src);
    const rule = PURPOSE_RULES[purpose];
    const allowed = await this.allowedMimes(purpose);
    if (!allowed.includes(src.mime as FileMime)) {
      throw new BadRequestException({
        code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
        message: 'This file type is not allowed here.',
        details: { allowed },
      });
    }
    const maxBytes = await this.maxBytes(purpose);
    if (Number(src.size_bytes) > maxBytes) throw this.tooLarge(maxBytes);
    // Owner 2026-10-24: bytes of a PRIVATE file (documents bucket) are never
    // copied to R2, even when the new purpose is a public one.
    const srcPrivate = PURPOSE_RULES[src.purpose].bucket === 'documents';
    if (
      !srcPrivate &&
      mayUsePublicStore(purpose) &&
      (await this.storage.publicStoreState()) === 'r2_unavailable'
    ) {
      throw this.publicStoreDown();
    }
    const resolved = await this.storage.resolveBucket(rule.bucket);
    const bucket =
      (srcPrivate || !mayUsePublicStore(purpose)) &&
      this.storage.isPublicStoreBucket(resolved)
        ? this.storage.awsBucket(rule.bucket)
        : resolved;
    if (!QUOTA_FREE_PURPOSES.includes(purpose)) {
      await this.assertQuota(userId, Number(src.size_bytes));
    }
    const fileId = randomUUID();
    // Owner 2026-10-05 (storage like Telegram): the same bytes in the same
    // bucket are not copied — the new row points at the stored object
    // (FileReleaseService removes it only when no live row uses it).
    if (bucket === src.s3_bucket) {
      await this.prisma.file.create({
        data: {
          id: fileId,
          owner_user_id: userId,
          purpose,
          s3_bucket: src.s3_bucket,
          s3_key: src.s3_key,
          mime: src.mime,
          size_bytes: src.size_bytes,
          sha256: src.sha256,
          source_sha256: src.source_sha256 ?? src.sha256,
          width: src.width,
          height: src.height,
          avif_twins: src.avif_twins,
          scan_status: 'clean',
        },
      });
      return this.get(userId, fileId);
    }
    // Owner 2026-10-21: only a real copy counts as an upload (forwarding
    // one file into many chats used to hit the upload limit).
    const limit = await this.rateLimit.consumeFixedWindow(
      ['files-presign', 'user', userId],
      this.config.getOrThrow<number>('FILES_PRESIGN_LIMIT_PER_USER_PER_HOUR'),
      3600,
    );
    if (!limit.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many uploads. Try again later.',
          details: { retryAfterSeconds: limit.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!QUOTA_FREE_PURPOSES.includes(purpose)) {
      await this.reserveDailyUpload(userId, Number(src.size_bytes));
    }
    await this.costGuard.consume('storage');
    const data = await this.storage.read(src.s3_bucket, src.s3_key);
    const key =
      demoKeyPrefix() + newFileKey({ purpose, ownerId: userId, fileId });
    await this.storage.put(bucket, key, data, src.mime);
    const sha256 = createHash('sha256').update(data).digest('hex');
    await this.prisma.file.create({
      data: {
        id: fileId,
        owner_user_id: userId,
        purpose,
        s3_bucket: bucket,
        s3_key: key,
        mime: src.mime,
        size_bytes: BigInt(data.length),
        sha256,
        source_sha256: src.source_sha256 ?? sha256,
        scan_status: 'clean',
      },
    });
    return this.get(userId, fileId);
  }

  /**
   * Owner 2026-10-20 (case tools): a file the server itself made (an
   * invoice, a signed PDF, a document built from a template) saved as a
   * clean file of [userId] — there is nothing to scan: the bytes never
   * came from outside. The global storage budget still applies; the user's
   * own storage cap does not (a document the app produced for them).
   */
  async storeGenerated(
    userId: string,
    purpose: FilePurpose,
    data: Buffer,
    mime: FileMime,
    /**
     * C-c11 (2026-11-09): `sealed` = a record nobody may delete or rewrite
     * (the signed deal-record PDF). With S3 Object Lock on the documents
     * bucket (Terraform documents_object_lock → env
     * S3_OBJECT_LOCK_RETENTION_DAYS) the object gets a COMPLIANCE retention
     * of that many days; without it the file is stored as any other.
     *
     * Sweep A-c1: `fixedId` (a name-based id) makes the file one per
     * subject — a second store of the same id fails on the primary key.
     */
    opts: { sealed?: boolean; fixedId?: string } = {},
  ): Promise<File> {
    const rule = PURPOSE_RULES[purpose];
    const fileId = opts.fixedId ?? randomUUID();
    if (
      mayUsePublicStore(purpose) &&
      (await this.storage.publicStoreState()) === 'r2_unavailable'
    ) {
      throw this.publicStoreDown();
    }
    const resolved = await this.storage.resolveBucket(rule.bucket);
    const bucket =
      !mayUsePublicStore(purpose) && this.storage.isPublicStoreBucket(resolved)
        ? this.storage.awsBucket(rule.bucket)
        : resolved;
    await this.costGuard.consume('storage');
    const key =
      demoKeyPrefix() + newFileKey({ purpose, ownerId: userId, fileId });
    const retainDays = opts.sealed ? this.objectLockRetentionDays() : 0;
    await this.storage.put(
      bucket,
      key,
      data,
      mime,
      retainDays > 0
        ? { retainUntil: new Date(Date.now() + retainDays * 86_400_000) }
        : undefined,
    );
    const sha256 = createHash('sha256').update(data).digest('hex');
    return this.prisma.file.create({
      data: {
        id: fileId,
        owner_user_id: userId,
        purpose,
        s3_bucket: bucket,
        s3_key: key,
        mime,
        size_bytes: BigInt(data.length),
        sha256,
        source_sha256: sha256,
        scan_status: 'clean',
      },
    });
  }

  /** C-c11: days of Object Lock retention for sealed records; 0 = the
   * documents bucket has no Object Lock (local, MinIO, R2, or the Terraform
   * switch off). */
  objectLockRetentionDays(): number {
    const raw = this.config.get<string>('S3_OBJECT_LOCK_RETENTION_DAYS');
    const days = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(days) && days > 0 ? days : 0;
  }

  /** The bytes of a live, clean file (server-side reads: hashing a PDF
   * before it is signed, merging it into the signed copy). */
  async readClean(fileId: string): Promise<{ file: File; data: Buffer }> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.deleted_at !== null || file.scan_status !== 'clean') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'File not found.',
      });
    }
    return { file, data: await this.storage.read(file.s3_bucket, file.s3_key) };
  }

  /**
   * OQ-040: short signed links to clean voice notes (documents bucket,
   * never the CDN). The caller has already checked chat membership.
   */
  async voiceUrls(fileIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (fileIds.length === 0 || !this.storage.configured) return out;
    const files = await this.prisma.file.findMany({
      where: {
        id: { in: fileIds },
        purpose: 'chat_voice',
        scan_status: 'clean',
        deleted_at: null,
      },
      select: { id: true, s3_bucket: true, s3_key: true },
    });
    for (const f of files) {
      out.set(
        f.id,
        await this.storage.signedGetUrl(
          f.s3_bucket,
          f.s3_key,
          MEDIA_SIGNED_URL_TTL_SEC,
        ),
      );
    }
    return out;
  }

  /** docs/06 §6.1: media (avatars, post images) come from CloudFront in
   * deployed environments (`MEDIA_CDN_BASE_URL`, private bucket behind an
   * origin access control); dev/e2e without a CDN keep short-lived signed
   * S3 links. Documents never take this path. */
  private async mediaLink(bucket: string, key: string): Promise<string> {
    // Owner 2026-10-24: an object stored in R2 is served from its own
    // public domain (the AWS CDN base below does not hold it). The keys are
    // loaded first: a fresh instance must not answer a CloudFront link for it.
    await this.storage.ready();
    const r2 = this.storage.publicObjectUrl(bucket, key);
    if (r2) return r2;
    // Owner 2026-10-01: the CDN can be set in Admin → Integrations → Storage.
    const cdn =
      (await this.secrets?.field('storage', 'cdnBaseUrl')) ??
      this.config.get<string>('MEDIA_CDN_BASE_URL');
    if (cdn) return cdn + '/' + key;
    return this.storage.signedGetUrl(bucket, key, MEDIA_SIGNED_URL_TTL_SEC);
  }

  /** Link of an image of [file] (px = a variant, none = the main
   * object). Owner 2026-10-25: the AVIF twin only when the switch is on,
   * the client sent `X-Image-Formats: avif` and the file was uploaded
   * after `images.avif_since` (older files have no twin). */
  private async imageLink(file: File, px?: number): Promise<string> {
    const key = px === undefined ? file.s3_key : variantKey(file.s3_key, px);
    if (
      AVIF_PURPOSES.has(file.purpose) &&
      isImageMime(file.mime) &&
      imageFormatContext.wantsAvif()
    ) {
      const since = await avifSince(this.settings);
      // Owner 2026-11-09: only a file whose every twin is stored (an AVIF
      // no smaller than the WebP is not kept, and its link would be a 404).
      if (since && file.created_at >= since && file.avif_twins) {
        return this.mediaLink(file.s3_bucket, avifKey(key));
      }
    }
    return this.mediaLink(file.s3_bucket, key);
  }

  /**
   * Owner 2026-10-26 («аватарки иногда не показываются»): the 256 px
   * preview of a clean avatar, or the full picture when the file has no
   * preview. Every list (chats, groups, comments, notifications, pushes)
   * shows `url256 ?? null`; a file without a width (no processed
   * variants) used to give null there — the avatar vanished from every
   * list while the profile, which uses `url`, still showed it.
   */
  private async avatarPreviewLink(file: File, url: string): Promise<string> {
    return file.width !== null ? this.imageLink(file, 256) : url;
  }

  private async mediaUrlOf(file: File): Promise<string | null> {
    if (
      file.deleted_at !== null ||
      file.scan_status !== 'clean' ||
      PURPOSE_RULES[file.purpose].bucket !== 'media' ||
      !this.storage.configured
    ) {
      return null;
    }
    return this.imageLink(file);
  }

  private async toDto(file: File): Promise<FileDto> {
    return {
      id: file.id,
      purpose: file.purpose,
      mime: file.mime,
      sizeBytes: Number(file.size_bytes),
      width: file.width,
      height: file.height,
      scanStatus: file.scan_status,
      url: await this.mediaUrlOf(file),
      createdAt: file.created_at.toISOString(),
    };
  }

  /**
   * Owner 2026-10-05: bytes of [userId]'s live files and their cap
   * (users.storage_quota_mb set by an admin, else storage.user_quota_mb;
   * 0 = no cap → null). Avatars, identity documents and exports are free.
   */
  async usage(
    userId: string,
  ): Promise<{ usedBytes: number; quotaBytes: number | null }> {
    const [user, agg, fallback] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { storage_quota_mb: true },
      }),
      this.prisma.file.aggregate({
        where: {
          owner_user_id: userId,
          deleted_at: null,
          purpose: { notIn: [...QUOTA_FREE_PURPOSES] },
        },
        _sum: { size_bytes: true },
      }),
      this.settings.number('storage.user_quota_mb'),
    ]);
    const mb = user?.storage_quota_mb ?? fallback;
    return {
      usedBytes: Number(agg._sum.size_bytes ?? 0n),
      quotaBytes: mb > 0 ? mb * MB : null,
    };
  }

  /**
   * Owner 2026-10-05: bytes of files sent in [conversationId] and the
   * per-chat cap (storage.chat_quota_mb; 0 = no cap → null).
   */
  async chatUsage(
    conversationId: string,
  ): Promise<{ usedBytes: number; quotaBytes: number | null }> {
    const [rows, mb] = await Promise.all([
      this.prisma.$queryRaw<{ bytes: bigint | null }[]>`
        SELECT sum(f.size_bytes)::INT8 AS bytes
        FROM messages m JOIN files f ON f.id = m.file_id
        WHERE m.conversation_id = ${conversationId}::UUID
          AND f.deleted_at IS NULL`,
      this.settings.number('storage.chat_quota_mb'),
    ]);
    return {
      usedBytes: Number(rows[0]?.bytes ?? 0n),
      quotaBytes: mb > 0 ? mb * MB : null,
    };
  }

  /** Throws CHAT_STORAGE_FULL when [fileId] would push the chat over its
   * cap (the file itself is already uploaded; it is just not sent). */
  async assertChatRoom(conversationId: string, fileId: string): Promise<void> {
    const [{ usedBytes, quotaBytes }, file] = await Promise.all([
      this.chatUsage(conversationId),
      this.prisma.file.findUnique({
        where: { id: fileId },
        select: { size_bytes: true },
      }),
    ]);
    const size = Number(file?.size_bytes ?? 0n);
    if (quotaBytes !== null && usedBytes + size > quotaBytes) {
      throw new BadRequestException({
        code: ErrorCode.CHAT_STORAGE_FULL,
        message: 'This chat has no room for more files.',
        details: { quotaBytes, usedBytes },
      });
    }
  }

  /**
   * 2026-10-24 (abuse batch B, item 5): bytes one person may upload per UTC
   * day (`storage.daily_upload_mb_per_user`, 0 = off). The stored-bytes
   * quota cannot see an upload-delete-upload loop, which still costs S3
   * PUTs, a virus scan and image moderation. Counted when the upload is
   * issued (presign), so abandoned uploads count too; the Redis counter
   * `upload:bytes:{user}:{utc day}` lives 26 h. A refused request gives
   * its bytes back. Redis down: the upload goes on (the stored quota and
   * CostGuard still apply) and the failure is logged.
   */
  private async reserveDailyUpload(
    userId: string,
    bytes: number,
  ): Promise<void> {
    const limitMb = await this.settings.number(
      'storage.daily_upload_mb_per_user',
    );
    if (limitMb <= 0 || bytes <= 0) return;
    const limitBytes = limitMb * MB;
    const now = new Date();
    const day = now.toISOString().slice(0, 10).replace(/-/g, '');
    const key = `upload:bytes:${userId}:${day}`;
    let total: number;
    try {
      total = await this.redis.incrby(key, bytes);
      if (total === bytes) await this.redis.expire(key, 26 * 3600);
    } catch (err) {
      this.logger.error(
        { err, userId, alert: 'daily_upload_cap_unavailable' },
        'Daily upload counter unreachable: cap skipped',
      );
      return;
    }
    if (total <= limitBytes) return;
    await this.redis.decrby(key, bytes).catch(() => undefined);
    const midnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    );
    this.logger.warn(
      {
        userId,
        limitBytes,
        usedBytes: total - bytes,
        alert: 'daily_upload_cap',
      },
      'Daily upload cap reached',
    );
    throw new HttpException(
      {
        code: ErrorCode.DAILY_UPLOAD_LIMIT_EXCEEDED,
        message: 'You reached today’s upload limit. Try again tomorrow.',
        details: {
          limitBytes,
          usedBytes: Math.max(0, total - bytes),
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((midnight - now.getTime()) / 1000),
          ),
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async assertQuota(userId: string, addBytes: number): Promise<void> {
    const { usedBytes, quotaBytes } = await this.usage(userId);
    if (quotaBytes !== null && usedBytes + addBytes > quotaBytes) {
      throw new BadRequestException({
        code: ErrorCode.STORAGE_QUOTA_EXCEEDED,
        message: 'Your file storage is full.',
        details: { quotaBytes, usedBytes },
      });
    }
  }

  /** Owner 2026-10-07 (bug 17): the admin's upload limits, inside the
   * hard ceilings and safe format lists of upload-limits.ts. */
  async uploadLimits(): Promise<UploadLimits> {
    return sanitizeUploadLimits(await this.settings.raw(UPLOAD_LIMITS_KEY));
  }

  async placeLimits(place: UploadPlace): Promise<PlaceLimits> {
    return (await this.uploadLimits())[place];
  }

  /**
   * A file attached to [place] must be of a format that is on there and
   * not bigger than its MB per file (a post photo was checked at upload
   * against the wider of post and reel; this is the exact place).
   */
  async assertFitsPlace(
    place: UploadPlace,
    file: { id: string; mime: string; size_bytes: bigint | number },
  ): Promise<void> {
    const limits = await this.placeLimits(place);
    if (!placeMimes(limits).includes(file.mime as FileMime)) {
      throw new BadRequestException({
        code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
        message: 'This file type is not allowed here.',
        details: { fileId: file.id, allowed: limits.formats },
      });
    }
    if (limits.fileMb > 0 && Number(file.size_bytes) > limits.fileMb * MB) {
      throw this.tooLarge(limits.fileMb * MB);
    }
  }

  /** Types a purpose accepts now: its safe set, narrowed by the formats
   * the admin turned on for its places. */
  private async allowedMimes(purpose: FilePurpose): Promise<FileMime[]> {
    const rule = PURPOSE_RULES[purpose];
    const places = PURPOSE_PLACES[purpose];
    if (!places) return [...rule.mimes];
    const limits = await this.uploadLimits();
    const on = new Set(places.flatMap((p) => placeMimes(limits[p])));
    return rule.mimes.filter((m) => on.has(m));
  }

  private async maxBytes(purpose: FilePurpose): Promise<number> {
    const places = PURPOSE_PLACES[purpose];
    if (places) {
      const limits = await this.uploadLimits();
      return Math.max(...places.map((p) => limits[p].fileMb)) * MB;
    }
    return (
      (await this.settings.number(
        PURPOSE_RULES[purpose].sizeSetting ?? 'files.max_size_mb',
      )) * MB
    );
  }

  /** Mismatching upload: delete the object and forget the intent — the
   * client must presign again. */
  private async reject(
    fileId: string,
    intent: UploadIntent,
    copyKey?: string,
  ): Promise<void> {
    await this.redis.del(intentKey(fileId));
    try {
      await this.storage.remove(
        intent.bucket,
        copyKey ? [intent.key, copyKey] : [intent.key],
      );
    } catch (err) {
      this.logger.error({ err, fileId }, 'Could not delete a rejected upload');
    }
  }

  private tooLarge(maxBytes: number): BadRequestException {
    return new BadRequestException({
      code: ErrorCode.FILE_TOO_LARGE,
      message: 'The file is too large.',
      details: { maxBytes },
    });
  }

  private checksumMismatch(): BadRequestException {
    return new BadRequestException({
      code: ErrorCode.FILE_CHECKSUM_MISMATCH,
      message:
        'The uploaded file does not match the declared size or checksum.',
    });
  }
  /** Demo accounts: total uploads capped by `demo.program.uploadQuotaMb`. */
  private async assertDemoQuota(
    userId: string,
    sizeBytes: number,
  ): Promise<void> {
    if (!demoContext.isDemo()) return;
    const row = await this.prisma.appConfig.findUnique({
      where: { key: DEMO_SETTINGS_KEY },
    });
    const quota = parseDemoSettings(row?.value).uploadQuotaMb * 1024 * 1024;
    const used = await this.prisma.file.aggregate({
      where: { owner_user_id: userId },
      _sum: { size_bytes: true },
    });
    const total = Number(used._sum.size_bytes ?? 0) + sizeBytes;
    if (total > quota) {
      throw new HttpException(
        {
          code: ErrorCode.FILE_TOO_LARGE,
          message: 'The demo account has used its upload space.',
          details: { quotaBytes: quota, demo: true },
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
  }
}

function demoKeyPrefix(): string {
  return demoContext.isDemo() ? 'demo/' : '';
}

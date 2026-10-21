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
import { Prisma, type File, type FilePurpose } from '@prisma/client';
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
  PRESIGN_TTL_SEC,
  PURPOSE_RULES,
  UPLOAD_INTENT_TTL_SEC,
  variantKey,
  type FileMime,
  isImageMime,
} from './files.policy';
import type {
  FileDto,
  PresignFileDto,
  PresignedFileDto,
} from './dto/files.dto';
import {
  PENDING_UPLOADS_KEY,
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
import { DEMO_SETTINGS_KEY, parseDemoSettings } from '../demo/demo.settings';
export interface SignedAttachment {
  url: string;
  previewUrl: string | null;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

@Injectable()
export class FilesService {
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
  ) {
    this.logger.setContext(FilesService.name);
  }

  async presign(
    userId: string,
    dto: PresignFileDto,
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
    const bucket = this.storage.bucket(rule.bucket); // 503 if S3 is off
    if (!QUOTA_FREE_PURPOSES.includes(dto.purpose)) {
      await this.assertQuota(userId, dto.sizeBytes);
    }

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
    await this.costGuard.consume('storage');
    // Owner 2026-10-05 (demo mode): a demo account may upload a little
    // (settings demo.program.uploadQuotaMb) under its own key prefix, so
    // the demo world's objects are easy to find and delete.
    await this.assertDemoQuota(userId, dto.sizeBytes);

    const fileId = randomUUID();
    const key = `${demoKeyPrefix()}${dto.purpose}/${userId}/${fileId}`;
    const upload = await this.storage.presignPost({
      bucket,
      key,
      contentType: dto.mime,
      size: dto.sizeBytes,
      expiresSec: PRESIGN_TTL_SEC,
    });
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

  async confirm(userId: string, fileId: string): Promise<FileDto> {
    const raw = await this.redis.get(intentKey(fileId));
    const intent = raw ? (JSON.parse(raw) as UploadIntent) : null;
    if (!intent || intent.userId !== userId) {
      // Already confirmed (a retry) → same answer; anything else → 404.
      return this.get(userId, fileId);
    }

    const head = await this.storage.head(intent.bucket, intent.key);
    if (!head) {
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_UPLOADED,
        message: 'Upload the file before confirming it.',
      });
    }
    const maxBytes = await this.maxBytes(intent.purpose);
    if (head.size > maxBytes) {
      await this.reject(fileId, intent);
      throw this.tooLarge(maxBytes);
    }
    if (head.size !== intent.size) {
      await this.reject(fileId, intent);
      throw this.checksumMismatch();
    }
    const data = await this.storage.read(intent.bucket, intent.key);
    const sha256 = createHash('sha256').update(data).digest('hex');
    if (data.length !== intent.size || sha256 !== intent.sha256) {
      await this.reject(fileId, intent);
      throw this.checksumMismatch();
    }
    const detected = detectMime(data, intent.mime);
    if (
      detected === null ||
      detected !== intent.mime ||
      !(await this.allowedMimes(intent.purpose)).includes(detected)
    ) {
      await this.reject(fileId, intent);
      throw new BadRequestException({
        code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
        message: 'The file content does not match an allowed type.',
        details: { declared: intent.mime, detected },
      });
    }
    // Owner 2026-10-07: no program, macro or script hidden inside an
    // allowed document (APK in a .docx, a macro, PDF JavaScript).
    const danger = dangerousContent(data, detected);
    if (danger) {
      await this.reject(fileId, intent);
      throw new BadRequestException({
        code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
        message: 'The file contains content that is not allowed.',
        details: { declared: intent.mime, detected, reason: danger },
      });
    }

    try {
      await this.prisma.file.create({
        data: {
          id: fileId,
          owner_user_id: userId,
          purpose: intent.purpose,
          s3_bucket: intent.bucket,
          s3_key: intent.key,
          mime: detected,
          size_bytes: BigInt(data.length),
          sha256,
          source_sha256: sha256,
        },
      });
    } catch (err) {
      // A concurrent confirm of the same upload won the insert.
      if (!(
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      )) {
        throw err;
      }
    }
    await this.redis.del(intentKey(fileId));
    await this.redis.zrem(
      PENDING_UPLOADS_KEY,
      pendingUploadMember(fileId, intent.bucket, intent.key),
    );
    await this.scans.enqueueScan(fileId);
    return this.get(userId, fileId);
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
  ): Promise<File> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
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
    return file;
  }

  /** Signed link to a clean avatar/post image, null otherwise. */
  async mediaUrl(fileId: string | null): Promise<string | null> {
    if (!fileId) return null;
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    return file ? this.mediaUrlOf(file) : null;
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
    const url256 =
      file.width !== null
        ? await this.mediaLink(file.s3_bucket, variantKey(file.s3_key, 256))
        : null;
    return { url, url256 };
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
        const url256 =
          file.width !== null
            ? await this.mediaLink(file.s3_bucket, variantKey(file.s3_key, 256))
            : null;
        out.set(file.id, { url, url256 });
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
  async postImageUrls(
    fileIds: string[],
  ): Promise<
    Map<string, { url: string; previewUrl: string; mediumUrl: string }>
  > {
    const out = new Map<
      string,
      { url: string; previewUrl: string; mediumUrl: string }
    >();
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
      const sign = (px: number) =>
        this.mediaLink(file.s3_bucket, variantKey(file.s3_key, px));
      out.set(file.id, {
        url,
        previewUrl: await sign(320),
        mediumUrl: await sign(1080),
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
    const byId = new Map(files.map((f) => [f.id, f]));
    const out: {
      fileId: string;
      url: string;
      previewUrl: string;
      mime: string;
      sizeBytes: number;
    }[] = [];
    for (const id of fileIds) {
      const f = byId.get(id);
      if (!f) continue;
      const url = await this.storage.signedGetUrl(
        f.s3_bucket,
        f.s3_key,
        MEDIA_SIGNED_URL_TTL_SEC,
      );
      out.push({
        fileId: f.id,
        url,
        // Documents have no image preview: the app shows a file tile.
        previewUrl: isImageMime(f.mime)
          ? await this.storage.signedGetUrl(
              f.s3_bucket,
              variantKey(f.s3_key, 320),
              MEDIA_SIGNED_URL_TTL_SEC,
            )
          : url,
        mime: f.mime,
        sizeBytes: Number(f.size_bytes),
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
      select: { id: true, s3_bucket: true, s3_key: true, mime: true },
    });
    for (const f of files) {
      out.set(f.id, {
        url: await this.storage.signedGetUrl(
          f.s3_bucket,
          f.s3_key,
          MEDIA_SIGNED_URL_TTL_SEC,
        ),
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
    for (const f of files) {
      out.set(f.id, {
        url: await this.storage.signedGetUrl(
          f.s3_bucket,
          f.s3_key,
          MEDIA_SIGNED_URL_TTL_SEC,
          // Photos and videos play inline; documents save under the name.
          isImageMime(f.mime) || f.mime.startsWith('video/')
            ? undefined
            : names?.get(f.id),
        ),
        previewUrl: isImageMime(f.mime)
          ? await this.storage.signedGetUrl(
              f.s3_bucket,
              variantKey(f.s3_key, 320),
              MEDIA_SIGNED_URL_TTL_SEC,
            )
          : null,
        mime: f.mime,
        sizeBytes: Number(f.size_bytes),
        width: f.width,
        height: f.height,
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
    const bucket = this.storage.bucket(rule.bucket);
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
    await this.costGuard.consume('storage');
    const data = await this.storage.read(src.s3_bucket, src.s3_key);
    const key = `${demoKeyPrefix()}${purpose}/${userId}/${fileId}`;
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
  ): Promise<File> {
    const rule = PURPOSE_RULES[purpose];
    const fileId = randomUUID();
    const bucket = this.storage.bucket(rule.bucket);
    await this.costGuard.consume('storage');
    const key = `${demoKeyPrefix()}${purpose}/${userId}/${fileId}`;
    await this.storage.put(bucket, key, data, mime);
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
    // Owner 2026-10-01: the CDN can be set in Admin → Integrations → Storage.
    const cdn =
      (await this.secrets?.field('storage', 'cdnBaseUrl')) ??
      this.config.get<string>('MEDIA_CDN_BASE_URL');
    if (cdn) return cdn + '/' + key;
    return this.storage.signedGetUrl(bucket, key, MEDIA_SIGNED_URL_TTL_SEC);
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
    return this.mediaLink(file.s3_bucket, file.s3_key);
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
  private async reject(fileId: string, intent: UploadIntent): Promise<void> {
    await this.redis.del(intentKey(fileId));
    try {
      await this.storage.remove(intent.bucket, [intent.key]);
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

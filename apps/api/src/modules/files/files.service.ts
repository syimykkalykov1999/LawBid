import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type File, type FilePurpose } from '@prisma/client';
import type Redis from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { RateLimitService } from '../auth/services/rate-limit.service';
import { S3StorageService } from './storage/s3-storage.service';
import { FileScanRunner } from './jobs/file-scan.runner';
import { detectMime } from './magic-bytes';
import {
  MB,
  MEDIA_SIGNED_URL_TTL_SEC,
  PRESIGN_TTL_SEC,
  PURPOSE_RULES,
  UPLOAD_INTENT_TTL_SEC,
  type FileMime,
} from './files.policy';
import type {
  FileDto,
  PresignFileDto,
  PresignedFileDto,
} from './dto/files.dto';

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
  ) {
    this.logger.setContext(FilesService.name);
  }

  async presign(
    userId: string,
    dto: PresignFileDto,
  ): Promise<PresignedFileDto> {
    const rule = PURPOSE_RULES[dto.purpose];
    const mime = rule.mimes.find((m) => m === dto.mime);
    if (!mime) {
      throw new BadRequestException({
        code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
        message: 'This file type is not allowed here.',
        details: { allowed: rule.mimes },
      });
    }
    const maxBytes = await this.maxBytes(dto.purpose);
    if (dto.sizeBytes > maxBytes) {
      throw this.tooLarge(maxBytes);
    }
    const bucket = this.storage.bucket(rule.bucket); // 503 if S3 is off

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

    const fileId = randomUUID();
    const key = `${dto.purpose}/${userId}/${fileId}`;
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
    const detected = detectMime(data);
    if (
      detected === null ||
      detected !== intent.mime ||
      !PURPOSE_RULES[intent.purpose].mimes.includes(detected)
    ) {
      await this.reject(fileId, intent);
      throw new BadRequestException({
        code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
        message: 'The file content does not match an allowed type.',
        details: { declared: intent.mime, detected },
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

  private async mediaUrlOf(file: File): Promise<string | null> {
    if (
      file.deleted_at !== null ||
      file.scan_status !== 'clean' ||
      PURPOSE_RULES[file.purpose].bucket !== 'media' ||
      !this.storage.configured
    ) {
      return null;
    }
    return this.storage.signedGetUrl(
      file.s3_bucket,
      file.s3_key,
      MEDIA_SIGNED_URL_TTL_SEC,
    );
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

  private async maxBytes(purpose: FilePurpose): Promise<number> {
    return (
      (await this.settings.number(PURPOSE_RULES[purpose].sizeSetting)) * MB
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
}

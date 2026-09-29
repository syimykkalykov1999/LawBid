import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { File } from '@prisma/client';
import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import { FilesService } from './files.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { S3StorageService } from './storage/s3-storage.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import type { RateLimitService } from '../auth/services/rate-limit.service';
import type { FileScanRunner } from './jobs/file-scan.runner';

const SHA = 'a'.repeat(64);

function make(
  overrides: { allowed?: boolean; file?: Partial<File> | null } = {},
) {
  const file =
    overrides.file === null
      ? null
      : ({
          id: 'f1',
          owner_user_id: 'u1',
          purpose: 'avatar',
          scan_status: 'clean',
          s3_bucket: 'media',
          s3_key: 'avatar/u1/f1',
          deleted_at: null,
          ...overrides.file,
        } as File);
  const deps = {
    prisma: { file: { findUnique: jest.fn().mockResolvedValue(file) } },
    redis: { set: jest.fn().mockResolvedValue('OK') },
    storage: {
      bucket: jest.fn((k: string) => `lawbid-${k}`),
      presignPost: jest
        .fn()
        .mockResolvedValue({ url: 'http://s3/b', fields: { key: 'k' } }),
      signedGetUrl: jest.fn().mockResolvedValue('http://signed'),
      configured: true,
    },
    settings: {
      number: jest.fn((key: string) =>
        Promise.resolve(key === 'files.avatar_max_size_mb' ? 5 : 10),
      ),
    },
    costGuard: { consume: jest.fn().mockResolvedValue(undefined) },
    rateLimit: {
      consumeFixedWindow: jest.fn().mockResolvedValue({
        allowed: overrides.allowed ?? true,
        remaining: 0,
        retryAfterSeconds: 1200,
      }),
    },
    config: { getOrThrow: jest.fn().mockReturnValue(60) },
    scans: { enqueueScan: jest.fn() },
    logger: { setContext: jest.fn(), error: jest.fn() },
    flags: { isEnabled: jest.fn().mockResolvedValue(false) },
  };
  const service = new FilesService(
    deps.prisma as unknown as PrismaService,
    deps.redis as unknown as Redis,
    deps.storage as unknown as S3StorageService,
    deps.settings as unknown as AppSettingsService,
    deps.costGuard as unknown as CostGuardService,
    deps.rateLimit as unknown as RateLimitService,
    deps.config as unknown as ConfigService,
    deps.scans as unknown as FileScanRunner,
    deps.logger as unknown as PinoLogger,
    deps.flags as never,
  );
  return { service, deps };
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: HttpException) => (e.getResponse() as { code: string }).code,
  );

describe('FilesService', () => {
  describe('presign', () => {
    it('issues an exact-size, exact-type POST policy for the purpose bucket and consumes budgets', async () => {
      const { service, deps } = make();
      const res = await service.presign('u1', {
        purpose: 'verification_document',
        mime: 'application/pdf',
        sizeBytes: 1234,
        sha256: SHA,
      });
      expect(deps.storage.presignPost).toHaveBeenCalledWith({
        bucket: 'lawbid-documents',
        key: `verification_document/u1/${res.fileId}`,
        contentType: 'application/pdf',
        size: 1234,
        expiresSec: 300,
      });
      expect(deps.rateLimit.consumeFixedWindow).toHaveBeenCalledWith(
        ['files-presign', 'user', 'u1'],
        60,
        3600,
      );
      expect(deps.costGuard.consume).toHaveBeenCalledWith('storage');
      const [key, value, , ttl] = deps.redis.set.mock.calls[0] as [
        string,
        string,
        string,
        number,
      ];
      expect(key).toBe(`files:upload:${res.fileId}`);
      expect(JSON.parse(value)).toMatchObject({
        userId: 'u1',
        sha256: SHA,
        size: 1234,
      });
      expect(ttl).toBe(3600);
    });

    it('refuses types outside the purpose allow-list before spending budget', async () => {
      const { service, deps } = make();
      expect(
        await code(
          service.presign('u1', {
            purpose: 'avatar',
            mime: 'application/pdf',
            sizeBytes: 1,
            sha256: SHA,
          }),
        ),
      ).toBe('FILE_TYPE_NOT_ALLOWED');
      expect(deps.costGuard.consume).not.toHaveBeenCalled();
    });

    it('uses files.avatar_max_size_mb for avatars and files.max_size_mb otherwise', async () => {
      const { service } = make();
      expect(
        await code(
          service.presign('u1', {
            purpose: 'avatar',
            mime: 'image/jpeg',
            sizeBytes: 5 * 1024 * 1024 + 1,
            sha256: SHA,
          }),
        ),
      ).toBe('FILE_TOO_LARGE');
      expect(
        await code(
          service.presign('u1', {
            purpose: 'post_image',
            mime: 'image/jpeg',
            sizeBytes: 5 * 1024 * 1024 + 1,
            sha256: SHA,
          }),
        ),
      ).toBe('resolved');
    });

    it('rate-limits per user (429 RATE_LIMITED with retryAfterSeconds) without consuming budget', async () => {
      const { service, deps } = make({ allowed: false });
      const err = await service
        .presign('u1', {
          purpose: 'post_image',
          mime: 'image/png',
          sizeBytes: 10,
          sha256: SHA,
        })
        .catch((e: HttpException) => e);
      expect((err as HttpException).getStatus()).toBe(429);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: 'RATE_LIMITED',
        details: { retryAfterSeconds: 1200 },
      });
      expect(deps.costGuard.consume).not.toHaveBeenCalled();
    });
  });

  describe('assertAttachable', () => {
    it.each(['pending', 'infected', 'failed'] as const)(
      'refuses a %s file',
      async (scan_status) => {
        const { service } = make({ file: { scan_status } });
        expect(
          await code(service.assertAttachable('u1', 'f1', ['avatar'])),
        ).toBe('FILE_NOT_ATTACHABLE');
      },
    );

    it('refuses a file of another purpose and hides other users files', async () => {
      const { service } = make({ file: { purpose: 'verification_selfie' } });
      expect(await code(service.assertAttachable('u1', 'f1', ['avatar']))).toBe(
        'FILE_NOT_ATTACHABLE',
      );
      expect(
        await code(
          service.assertAttachable('u2', 'f1', ['verification_selfie']),
        ),
      ).toBe('NOT_FOUND');
    });

    it('accepts the owner clean file of the right purpose', async () => {
      const { service } = make();
      await expect(
        service.assertAttachable('u1', 'f1', ['avatar']),
      ).resolves.toMatchObject({ id: 'f1' });
    });
  });

  describe('links', () => {
    it('serves media links only for clean media files', async () => {
      expect(await make().service.mediaUrl('f1')).toBe('http://signed');
      expect(
        await make({ file: { scan_status: 'pending' } }).service.mediaUrl('f1'),
      ).toBeNull();
      expect(
        await make({
          file: { purpose: 'verification_document' },
        }).service.mediaUrl('f1'),
      ).toBeNull();
      expect(await make().service.mediaUrl(null)).toBeNull();
    });

    it('isCleanAvatar: own, clean, live avatar only', async () => {
      expect(await make().service.isCleanAvatar('f1', 'u1')).toBe(true);
      expect(await make().service.isCleanAvatar('f1', 'u2')).toBe(false);
      expect(await make().service.isCleanAvatar(null, 'u1')).toBe(false);
      expect(
        await make({ file: { scan_status: 'pending' } }).service.isCleanAvatar(
          'f1',
          'u1',
        ),
      ).toBe(false);
      expect(
        await make({ file: { purpose: 'post_image' } }).service.isCleanAvatar(
          'f1',
          'u1',
        ),
      ).toBe(false);
      expect(
        await make({ file: { deleted_at: new Date() } }).service.isCleanAvatar(
          'f1',
          'u1',
        ),
      ).toBe(false);
    });

    it('signs public avatar links (main + 256 px) only for clean avatars', async () => {
      const { service, deps } = make({ file: { width: 1024 } });
      expect(await service.avatarUrls('f1')).toEqual({
        url: 'http://signed',
        url256: 'http://signed',
      });
      expect(deps.storage.signedGetUrl).toHaveBeenCalledWith(
        'media',
        'avatar/u1/f1_w256',
        3600,
      );
      const none = { url: null, url256: null };
      expect(
        await make({
          file: { purpose: 'verification_selfie', s3_bucket: 'media' },
        }).service.avatarUrls('f1'),
      ).toEqual(none);
      expect(
        await make({ file: { scan_status: 'pending' } }).service.avatarUrls(
          'f1',
        ),
      ).toEqual(none);
      expect(await make().service.avatarUrls(null)).toEqual(none);
      expect(
        await make({ file: { width: null } }).service.avatarUrls('f1'),
      ).toEqual({ url: 'http://signed', url256: null });
    });

    it('signs verification files with verification.signed_url_ttl_sec, never media', async () => {
      const { service, deps } = make({
        file: { purpose: 'verification_selfie', s3_bucket: 'docs' },
      });
      deps.settings.number.mockResolvedValue(300);
      const res = await service.verificationFileUrl('f1');
      expect(res.url).toBe('http://signed');
      expect(deps.storage.signedGetUrl).toHaveBeenCalledWith(
        'docs',
        'avatar/u1/f1',
        300,
      );
      expect(await code(make().service.verificationFileUrl('f1'))).toBe(
        'NOT_FOUND',
      );
    });
  });
});

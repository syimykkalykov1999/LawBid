import { createHash } from 'node:crypto';
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
  overrides: {
    allowed?: boolean;
    file?: Partial<File> | null;
    usedBytes?: bigint;
    quotaMb?: number | null;
  } = {},
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
    prisma: {
      file: {
        findUnique: jest.fn().mockResolvedValue(file),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { size_bytes: overrides.usedBytes ?? 0n },
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ storage_quota_mb: overrides.quotaMb ?? null }),
      },
    },
    redis: {
      set: jest.fn().mockResolvedValue('OK'),
      zadd: jest.fn().mockResolvedValue(1),
    },
    storage: {
      bucket: jest.fn((k: string) => `lawbid-${k}`),
      presignPost: jest
        .fn()
        .mockResolvedValue({ url: 'http://s3/b', fields: { key: 'k' } }),
      signedGetUrl: jest.fn().mockResolvedValue('http://signed'),
      configured: true,
    },
    settings: {
      number: jest.fn(() => Promise.resolve(10)),
      // Owner 2026-10-07 (bug 17): «Загрузки и файлы» (unset = defaults).
      raw: jest.fn().mockResolvedValue(undefined),
    },
    costGuard: { consume: jest.fn().mockResolvedValue(undefined) },
    rateLimit: {
      consumeFixedWindow: jest.fn().mockResolvedValue({
        allowed: overrides.allowed ?? true,
        remaining: 0,
        retryAfterSeconds: 1200,
      }),
    },
    config: {
      getOrThrow: jest.fn().mockReturnValue(60),
      // MEDIA_CDN_BASE_URL unset: links stay signed S3 (dev/e2e).
      get: jest.fn().mockReturnValue(undefined),
    },
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
      // Tracked so the storage cleanup can remove it if never confirmed.
      expect(deps.redis.zadd).toHaveBeenCalledWith(
        'files:pending',
        expect.any(Number),
        `${res.fileId}|lawbid-documents|verification_document/u1/${res.fileId}`,
      );
    });

    it('refuses an upload past the storage cap (personal over default), never for avatars', async () => {
      const full = make({ usedBytes: BigInt(10 * 1024 * 1024) });
      expect(
        await code(
          full.service.presign('u1', {
            purpose: 'post_image',
            mime: 'image/png',
            sizeBytes: 10,
            sha256: SHA,
          }),
        ),
      ).toBe('STORAGE_QUOTA_EXCEEDED');
      expect(full.deps.costGuard.consume).not.toHaveBeenCalled();
      expect(
        await code(
          full.service.presign('u1', {
            purpose: 'avatar',
            mime: 'image/png',
            sizeBytes: 10,
            sha256: SHA,
          }),
        ),
      ).toBe('resolved');
      const raised = make({
        usedBytes: BigInt(10 * 1024 * 1024),
        quotaMb: 20,
      });
      expect(
        await code(
          raised.service.presign('u1', {
            purpose: 'post_image',
            mime: 'image/png',
            sizeBytes: 10,
            sha256: SHA,
          }),
        ),
      ).toBe('resolved');
      const unlimited = make({
        usedBytes: BigInt(10 * 1024 * 1024),
        quotaMb: 0,
      });
      expect(
        await code(
          unlimited.service.presign('u1', {
            purpose: 'post_image',
            mime: 'image/png',
            sizeBytes: 10,
            sha256: SHA,
          }),
        ),
      ).toBe('resolved');
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

    it('accepts browser voice formats (audio/webm, audio/mp4) for chat_voice only', async () => {
      const { service } = make();
      for (const mime of ['audio/mp4', 'audio/webm']) {
        expect(
          await code(
            service.presign('u1', {
              purpose: 'chat_voice',
              mime,
              sizeBytes: 1000,
              sha256: SHA,
            }),
          ),
        ).toBe('resolved');
        for (const purpose of ['chat_attachment', 'avatar'] as const) {
          expect(
            await code(
              service.presign('u1', {
                purpose,
                mime,
                sizeBytes: 1,
                sha256: SHA,
              }),
            ),
          ).toBe('FILE_TYPE_NOT_ALLOWED');
        }
      }
      // Same size limit as before (files.max_size_mb = 10 here).
      expect(
        await code(
          service.presign('u1', {
            purpose: 'chat_voice',
            mime: 'audio/webm',
            sizeBytes: 10 * 1024 * 1024 + 1,
            sha256: SHA,
          }),
        ),
      ).toBe('FILE_TOO_LARGE');
    });

    it('uses the admin MB per file: avatar 5 by default, posts 10', async () => {
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

    it('follows the formats the admin turned on for the place', async () => {
      const { service, deps } = make();
      deps.settings.raw.mockResolvedValue({
        post: { formats: ['png'] },
        reel: { formats: ['png'] },
      });
      const jpeg = {
        purpose: 'post_image' as const,
        mime: 'image/jpeg',
        sizeBytes: 1,
        sha256: SHA,
      };
      expect(await code(service.presign('u1', jpeg))).toBe(
        'FILE_TYPE_NOT_ALLOWED',
      );
      expect(
        await code(service.presign('u1', { ...jpeg, mime: 'image/png' })),
      ).toBe('resolved');
    });

    it('an unsafe format in the setting never lets a program in', async () => {
      const { service, deps } = make();
      deps.settings.raw.mockResolvedValue({
        chat: { formats: ['apk', 'exe', 'zip', 'js', 'pdf'], fileMb: 25 },
      });
      expect(
        await code(
          service.presign('u1', {
            purpose: 'chat_attachment',
            mime: 'application/vnd.android.package-archive',
            sizeBytes: 1,
            sha256: SHA,
          }),
        ),
      ).toBe('FILE_TYPE_NOT_ALLOWED');
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
  describe('confirm (voice container must match the declared type)', () => {
    const m4a = (): Buffer => {
      const b = Buffer.alloc(32);
      b.writeUInt32BE(16, 0);
      b.write('ftyp', 4, 'latin1');
      b.write('M4A ', 8, 'latin1');
      return b;
    };
    const setup = (declared: string, data: Buffer) => {
      const { service, deps } = make();
      const sha = createHash('sha256').update(data).digest('hex');
      const intent = {
        userId: 'u1',
        purpose: 'chat_voice',
        mime: declared,
        size: data.length,
        sha256: sha,
        bucket: 'lawbid-documents',
        key: 'chat_voice/u1/f1',
      };
      const remove = jest.fn().mockResolvedValue(undefined);
      const create = jest.fn().mockResolvedValue({});
      Object.assign(deps.redis, {
        get: jest.fn().mockResolvedValue(JSON.stringify(intent)),
        del: jest.fn().mockResolvedValue(1),
        zrem: jest.fn().mockResolvedValue(1),
      });
      Object.assign(deps.storage, {
        head: jest.fn().mockResolvedValue({ size: data.length }),
        read: jest.fn().mockResolvedValue(data),
        remove,
      });
      Object.assign(deps.prisma.file, { create });
      return { service, deps, remove, create };
    };

    it('rejects WebM bytes declared as audio/mp4 and m4a bytes declared as audio/webm', async () => {
      const webm = Buffer.from([
        0x1a,
        0x45,
        0xdf,
        0xa3,
        0x87,
        0x42,
        0x82,
        0x84,
        ...Buffer.from('webm'),
        0xa3,
        0x86,
        ...Buffer.from('A_OPUS'),
      ]);
      for (const [declared, data] of [
        ['audio/mp4', webm],
        ['audio/webm', m4a()],
        ['audio/webm', Buffer.from('not audio at all')],
      ] as const) {
        const { service, remove, create } = setup(declared, data);
        expect(await code(service.confirm('u1', 'f1'))).toBe(
          'FILE_TYPE_NOT_ALLOWED',
        );
        expect(remove).toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
      }
    });

    it('accepts WebM declared as audio/webm and queues the antivirus scan', async () => {
      const webm = Buffer.from([
        0x1a,
        0x45,
        0xdf,
        0xa3,
        0x87,
        0x42,
        0x82,
        0x84,
        ...Buffer.from('webm'),
        0xa3,
        0x86,
        ...Buffer.from('A_OPUS'),
      ]);
      const { service, deps, create } = setup('audio/webm', webm);
      deps.prisma.file.findUnique.mockResolvedValue({
        id: 'f1',
        owner_user_id: 'u1',
        purpose: 'chat_voice',
        mime: 'audio/webm',
        size_bytes: BigInt(webm.length),
        scan_status: 'pending',
        s3_bucket: 'lawbid-documents',
        s3_key: 'chat_voice/u1/f1',
        deleted_at: null,
        created_at: new Date(),
      });
      await service.confirm('u1', 'f1');
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ mime: 'audio/webm' }),
      });
      expect(deps.scans.enqueueScan).toHaveBeenCalledWith('f1');
    });
  });
});

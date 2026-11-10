import { imageFormatContext } from './processing/image-format-context';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma, type File } from '@prisma/client';
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
    /** The public-media switch is on: `media` resolves to the R2 bucket. */
    r2?: boolean;
    /** Owner 2026-11-08: R2 selected but not ready (health check fails). */
    r2Down?: boolean;
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
  const counters = new Map<string, number>();
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
      // Owner 2026-10-22: no image moderation verdict for the file.
      mediaModerationCheck: { findUnique: jest.fn().mockResolvedValue(null) },
    },
    redis: {
      set: jest.fn().mockResolvedValue('OK'),
      zadd: jest.fn().mockResolvedValue(1),
      // 2026-10-24: the per-day upload counter (one tiny in-memory Redis).
      incrby: jest.fn((k: string, n: number) => {
        counters.set(k, (counters.get(k) ?? 0) + n);
        return Promise.resolve(counters.get(k)!);
      }),
      decrby: jest.fn((k: string, n: number) => {
        counters.set(k, (counters.get(k) ?? 0) - n);
        return Promise.resolve(counters.get(k)!);
      }),
      expire: jest.fn().mockResolvedValue(1),
    },
    storage: {
      bucket: jest.fn((k: string) => `lawbid-${k}`),
      resolveBucket: jest.fn((k: string) =>
        Promise.resolve(
          overrides.r2 && k === 'media' ? 'lawbid-r2' : `lawbid-${k}`,
        ),
      ),
      awsBucket: jest.fn((k: string) => `lawbid-${k}`),
      publicStoreState: jest.fn(() =>
        Promise.resolve(
          overrides.r2Down ? 'r2_unavailable' : overrides.r2 ? 'r2' : 'aws',
        ),
      ),
      ready: jest.fn().mockResolvedValue(true),
      isPublicStoreBucket: jest.fn((b: string) => b === 'lawbid-r2'),
      publicObjectUrl: jest.fn((b: string, k: string) =>
        b === 'lawbid-r2' ? `https://media.example/${k}` : null,
      ),
      presignPut: jest.fn().mockResolvedValue({
        url: 'https://r2/put',
        fields: {},
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
      }),
      presignPost: jest
        .fn()
        .mockResolvedValue({ url: 'http://s3/b', fields: { key: 'k' } }),
      signedGetUrl: jest.fn().mockResolvedValue('http://signed'),
      // M3 (2026-11-08): confirm copies the upload to a server-owned key.
      copy: jest.fn().mockResolvedValue(true),
      // L5 (2026-11-08): the copy gets the bucket's real Cache-Control.
      cacheControlFor: jest.fn((b: string) =>
        b === 'lawbid-documents' ? 'private, max-age=300' : 'public, immutable',
      ),
      remove: jest.fn().mockResolvedValue(undefined),
      configured: true,
    },
    settings: {
      number: jest.fn<Promise<number>, [string]>(() => Promise.resolve(10)),
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
    logger: { setContext: jest.fn(), error: jest.fn(), warn: jest.fn() },
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
  describe('daily upload cap (2026-10-24, storage.daily_upload_mb_per_user)', () => {
    const MBYTES = 1024 * 1024;
    const png = (sizeBytes: number) => ({
      purpose: 'post_image' as const,
      mime: 'image/png' as const,
      sizeBytes,
      sha256: SHA,
    });
    const withCap = (capMb: number) => {
      const m = make();
      m.deps.settings.number.mockImplementation((key: string) =>
        Promise.resolve(
          key === 'storage.daily_upload_mb_per_user' ? capMb : 10_000,
        ),
      );
      return m;
    };

    it('lets uploads through until the day total passes the cap, then 429', async () => {
      const { service } = withCap(3);
      expect(await code(service.presign('u1', png(2 * MBYTES)))).toBe(
        'resolved',
      );
      expect(await code(service.presign('u1', png(1 * MBYTES)))).toBe(
        'resolved',
      );
      expect(await code(service.presign('u1', png(1)))).toBe(
        'DAILY_UPLOAD_LIMIT_EXCEEDED',
      );
    });

    it('a refused request gives its bytes back and keeps the budget', async () => {
      const { service, deps } = withCap(3);
      await service.presign('u1', png(2 * MBYTES));
      expect(await code(service.presign('u1', png(2 * MBYTES)))).toBe(
        'DAILY_UPLOAD_LIMIT_EXCEEDED',
      );
      expect(deps.redis.decrby).toHaveBeenCalledTimes(1);
      expect(await code(service.presign('u1', png(1 * MBYTES)))).toBe(
        'resolved',
      );
    });

    it('is per person', async () => {
      const { service } = withCap(1);
      await service.presign('u1', png(1 * MBYTES));
      expect(await code(service.presign('u2', png(1 * MBYTES)))).toBe(
        'resolved',
      );
    });

    it('0 switches it off', async () => {
      const { service, deps } = withCap(0);
      expect(await code(service.presign('u1', png(5 * MBYTES)))).toBe(
        'resolved',
      );
      expect(deps.redis.incrby).not.toHaveBeenCalled();
    });

    it('does not count an avatar (quota-free purpose)', async () => {
      const { service, deps } = withCap(1);
      await service.presign('u1', {
        purpose: 'avatar',
        mime: 'image/png',
        sizeBytes: 1000,
        sha256: SHA,
      });
      expect(deps.redis.incrby).not.toHaveBeenCalled();
    });

    it('answers 429 with the limit, usage and seconds to midnight UTC', async () => {
      const { service } = withCap(1);
      await service.presign('u1', png(1 * MBYTES));
      const err = (await service
        .presign('u1', png(10))
        .catch((e: unknown) => e)) as HttpException;
      expect(err.getStatus()).toBe(429);
      const body = err.getResponse() as {
        details: {
          limitBytes: number;
          usedBytes: number;
          retryAfterSeconds: number;
        };
      };
      expect(body.details.limitBytes).toBe(MBYTES);
      expect(body.details.usedBytes).toBe(MBYTES);
      expect(body.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(body.details.retryAfterSeconds).toBeLessThanOrEqual(86_400);
    });

    it('Redis down: the upload goes on and the failure is logged', async () => {
      const { service, deps } = withCap(1);
      deps.redis.incrby.mockRejectedValueOnce(new Error('down'));
      expect(await code(service.presign('u1', png(5 * MBYTES)))).toBe(
        'resolved',
      );
      expect(deps.logger.error).toHaveBeenCalled();
    });
  });

  describe('presign with Cloudflare R2 (owner 2026-10-24)', () => {
    const photo = {
      purpose: 'post_image' as const,
      mime: 'image/jpeg',
      sizeBytes: 500,
      sha256: SHA,
    };

    it('switch off: public media is a normal POST to the AWS media bucket', async () => {
      const { service, deps } = make();
      await service.presign('u1', { ...photo, supportsPut: true });
      expect(deps.storage.presignPost).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'lawbid-media' }),
      );
      expect(deps.storage.presignPut).not.toHaveBeenCalled();
    });

    it('switch on + app supports PUT: a presigned PUT to the R2 bucket', async () => {
      const { service, deps } = make({ r2: true });
      const res = await service.presign('u1', { ...photo, supportsPut: true });
      expect(deps.storage.presignPut).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 'lawbid-r2',
          size: 500,
          contentType: 'image/jpeg',
          // D-c1: the link writes under staging/ only.
          key: expect.stringMatching(/^staging\/post_image\//),
        }),
      );
      expect(deps.storage.presignPost).not.toHaveBeenCalled();
      expect(res.upload.method).toBe('PUT');
      const [, value] = deps.redis.set.mock.calls[0] as [string, string];
      expect(JSON.parse(value)).toMatchObject({ bucket: 'lawbid-r2' });
    });

    it('switch on but an older app (no PUT): asked to update, never AWS', async () => {
      const { service, deps } = make({ r2: true });
      await expect(service.presign('u1', photo)).rejects.toMatchObject({
        status: 426,
      });
      expect(deps.storage.presignPost).not.toHaveBeenCalled();
      expect(deps.storage.presignPut).not.toHaveBeenCalled();
    });

    // Owner 2026-11-08: public data never goes to AWS once the switch is r2.
    it.each(['avatar', 'post_image', 'review_photo', 'sticker'] as const)(
      'R2 selected but down: %s waits (503, retry later) and nothing goes to AWS',
      async (purpose) => {
        const { service, deps } = make({ r2Down: true });
        const mime = purpose === 'sticker' ? 'image/png' : 'image/jpeg';
        await expect(
          service.presign('u1', {
            purpose,
            mime,
            sizeBytes: 500,
            sha256: SHA,
            supportsPut: true,
          }),
        ).rejects.toMatchObject({
          status: 503,
          response: {
            code: 'FILE_STORAGE_UNAVAILABLE',
            details: { retryAfterSeconds: 30 },
          },
        });
        expect(deps.storage.presignPost).not.toHaveBeenCalled();
        expect(deps.storage.presignPut).not.toHaveBeenCalled();
        expect(deps.redis.set).not.toHaveBeenCalled();
        expect(deps.logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ alert: 'r2_public_upload_waiting' }),
          expect.any(String),
        );
      },
    );

    it('R2 back: the same upload goes to R2', async () => {
      const down = make({ r2Down: true });
      await expect(
        down.service.presign('u1', { ...photo, supportsPut: true }),
      ).rejects.toMatchObject({ status: 503 });
      const { service, deps } = make({ r2: true });
      await service.presign('u1', { ...photo, supportsPut: true });
      expect(deps.storage.presignPut).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'lawbid-r2' }),
      );
    });

    it('R2 down: private files still go to AWS as before', async () => {
      const { service, deps } = make({ r2Down: true });
      await service.presign('u1', {
        purpose: 'chat_attachment',
        mime: 'image/jpeg',
        sizeBytes: 500,
        sha256: SHA,
        supportsPut: true,
      });
      expect(deps.storage.presignPost).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'lawbid-documents' }),
      );
    });

    it.each([
      'chat_attachment',
      'chat_voice',
      'case_photo',
      'case_attachment',
      'verification_document',
      'verification_selfie',
      'support_attachment',
      'task_attachment',
    ] as const)('switch on: %s stays private on AWS', async (purpose) => {
      const { service, deps } = make({ r2: true });
      const mime = purpose === 'chat_voice' ? 'audio/mp4' : 'image/jpeg';
      await service.presign('u1', {
        purpose,
        mime,
        sizeBytes: 500,
        sha256: SHA,
        supportsPut: true,
      });
      expect(deps.storage.presignPut).not.toHaveBeenCalled();
      expect(deps.storage.presignPost).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'lawbid-documents' }),
      );
    });
  });

  describe('R2 links and server-made files (owner 2026-11-04)', () => {
    it('loads the R2 keys before answering a link: a fresh instance gives the R2 address', async () => {
      const { service, deps } = make({
        file: { purpose: 'avatar', s3_bucket: 'lawbid-r2', s3_key: 'avatar/k' },
      });
      const order: string[] = [];
      deps.storage.ready.mockImplementation(() => {
        order.push('ready');
        return Promise.resolve(true);
      });
      deps.storage.publicObjectUrl.mockImplementation(
        (b: string, k: string) => {
          order.push('url');
          return b === 'lawbid-r2' ? `https://media.example/${k}` : null;
        },
      );
      expect(await service.mediaUrl('f1')).toBe(
        'https://media.example/avatar/k',
      );
      expect(order.slice(0, 2)).toEqual(['ready', 'url']);
    });
  });

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
        // D-c1: the link writes under staging/ only.
        key: expect.stringMatching(
          new RegExp(
            `^staging/verification_document/s0/\\d{4}/\\d{2}/${res.fileId}$`,
          ),
        ),
        contentType: 'application/pdf',
        size: 1234,
        expiresSec: 300,
      });
      expect(deps.rateLimit.consumeFixedWindow).toHaveBeenCalledWith(
        ['files-presign', 'user', 'u1'],
        60,
        3600,
      );
      expect(deps.costGuard.consume).toHaveBeenCalledWith('storage', 1, {
        userId: expect.any(String),
      });
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
        expect.stringMatching(
          new RegExp(
            `^${res.fileId}\\|lawbid-documents\\|staging/verification_document/s0/\\d{4}/\\d{2}/${res.fileId}$`,
          ),
        ),
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

  describe('assertReadable (security audit #3, finding 8)', () => {
    const none = () => jest.fn().mockResolvedValue(null);
    const withSources = (hit?: string) => {
      const { service, deps } = make();
      const prisma = deps.prisma as unknown as Record<
        string,
        { findFirst: jest.Mock }
      >;
      for (const model of [
        'message',
        'chatGroupMessage',
        'channelPost',
        'documentTemplate',
      ]) {
        prisma[model] = {
          findFirst:
            model === hit ? jest.fn().mockResolvedValue({ id: 'x' }) : none(),
        };
      }
      return { service, prisma };
    };
    const theirs = { id: 'f1', owner_user_id: 'someone-else' };

    it('the owner reads their own file without any lookup', async () => {
      const { service, prisma } = withSources();
      await service.assertReadable('u1', { id: 'f1', owner_user_id: 'u1' });
      expect(prisma.message.findFirst).not.toHaveBeenCalled();
    });

    it('someone else’s file shown nowhere the user may look is a 404', async () => {
      const { service } = withSources();
      expect(await code(service.assertReadable('u1', theirs))).toBe(
        'NOT_FOUND',
      );
    });

    it.each(['message', 'chatGroupMessage', 'channelPost', 'documentTemplate'])(
      'a file shown in a readable %s passes',
      async (hit) => {
        const { service } = withSources(hit);
        await expect(
          service.assertReadable('u1', theirs),
        ).resolves.toBeUndefined();
      },
    );

    it('a chat message counts only in a chat the user takes part in', async () => {
      const { service, prisma } = withSources();
      await code(service.assertReadable('u1', theirs));
      expect(prisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            file_id: 'f1',
            conversation: {
              OR: [{ client_id: 'u1' }, { attorney_id: 'u1' }],
            },
          }),
        }),
      );
    });

    it('copyForUser refuses a file the user cannot read', async () => {
      const { service } = withSources();
      expect(
        await code(service.copyForUser('f1', 'u2', 'chat_attachment')),
      ).toBe('NOT_FOUND');
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

    describe('AVIF twins (owner 2026-10-25)', () => {
      const withSettings = (
        on: boolean,
        since: string,
        created: Date,
        twins = true,
      ) => {
        const m = make({
          file: {
            width: 1024,
            mime: 'image/webp',
            created_at: created,
            avif_twins: twins,
          },
        });
        (m.deps.settings as Record<string, unknown>).boolean = jest.fn(() =>
          Promise.resolve(on),
        );
        (m.deps.settings as Record<string, unknown>).string = jest.fn(() =>
          Promise.resolve(since),
        );
        return m;
      };
      const asAvifClient = <T>(fn: () => Promise<T>) =>
        imageFormatContext.run(true, fn);
      const since = '2026-10-25T00:00:00Z';
      const after = new Date('2026-10-26T00:00:00Z');

      it('serves the .avif twin to a client that asked, after the since time', async () => {
        const { service, deps } = withSettings(true, since, after);
        await asAvifClient(() => service.avatarUrls('f1'));
        expect(deps.storage.signedGetUrl).toHaveBeenCalledWith(
          'media',
          'avatar/u1/f1.avif',
          3600,
        );
        expect(deps.storage.signedGetUrl).toHaveBeenCalledWith(
          'media',
          'avatar/u1/f1_w256.avif',
          3600,
        );
      });

      // Owner 2026-11-09: an AVIF that came out no smaller than the WebP is
      // not stored; such a file must never be linked as .avif (404).
      it('a file whose AVIF twins were not stored keeps WebP links', async () => {
        const { service, deps } = withSettings(true, since, after, false);
        await asAvifClient(() => service.avatarUrls('f1'));
        const keys = deps.storage.signedGetUrl.mock.calls.map(
          (c: unknown[]) => c[1],
        );
        expect(keys).toContain('avatar/u1/f1');
        expect(keys.some((k: unknown) => String(k).endsWith('.avif'))).toBe(
          false,
        );
      });

      it('keeps WebP/JPEG links when: no opt-in, switch off, empty since, or an older file', async () => {
        const cases: Array<[boolean, string, Date, boolean]> = [
          [true, since, after, false],
          [false, since, after, true],
          [true, '', after, true],
          [true, since, new Date('2026-10-01T00:00:00Z'), true],
        ];
        for (const [on, s, created, optIn] of cases) {
          const { service, deps } = withSettings(on, s, created);
          await (optIn
            ? asAvifClient(() => service.avatarUrls('f1'))
            : service.avatarUrls('f1'));
          const keys = deps.storage.signedGetUrl.mock.calls.map(
            (c: unknown[]) => c[1],
          );
          expect(keys.some((k: unknown) => String(k).endsWith('.avif'))).toBe(
            false,
          );
        }
      });
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
      // Owner 2026-10-26: a file without a preview gives the full picture
      // as its preview — lists (`url256 ?? null`) never lose the avatar.
      expect(
        await make({ file: { width: null } }).service.avatarUrls('f1'),
      ).toEqual({ url: 'http://signed', url256: 'http://signed' });
    });

    it('avatarUrlsMany: a file without a preview lists its full picture', async () => {
      const { service, deps } = make({ file: { width: null } });
      (deps.prisma.file as unknown as { findMany: jest.Mock }).findMany = jest
        .fn()
        .mockResolvedValue([
          {
            id: 'f1',
            purpose: 'avatar',
            s3_bucket: 'media',
            s3_key: 'avatar/u1/f1',
            mime: 'image/jpeg',
            width: null,
            scan_status: 'clean',
            deleted_at: null,
            created_at: new Date(),
          },
        ]);
      const out = await service.avatarUrlsMany(['f1']);
      expect(out.get('f1')).toEqual({
        url: 'http://signed',
        url256: 'http://signed',
      });
      expect(deps.storage.signedGetUrl).not.toHaveBeenCalledWith(
        'media',
        'avatar/u1/f1_w256',
        expect.anything(),
      );
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
      expect(deps.scans.enqueueScan).toHaveBeenCalledWith('f1', 'u1');
    });
  });
});

describe('reusing a stored file (R-254, files_reuse_own)', () => {
  const HASH = 'a'.repeat(64);
  type Row = Record<string, unknown>;
  const row = (over: Row = {}): Row => ({
    id: 'mine',
    owner_user_id: 'me',
    s3_bucket: 'lawbid-documents',
    s3_key: 'chat_attachment/me/mine',
    source_sha256: HASH,
    sha256: HASH,
    purpose: 'chat_attachment',
    scan_status: 'clean',
    deleted_at: null,
    mime: 'application/pdf',
    size_bytes: BigInt(1000),
    width: null,
    height: null,
    blurhash: null,
    ...over,
  });
  /** A real look at the rows by the query's own filter: a test that only
   * read the `where` could pass while the filter was wrong. */
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && 'in' in v
        ? (v as { in: unknown[] }).in.includes(r[k])
        : r[k] === v,
    );
  const setup = (
    rows: Row[],
    opts: { flag?: boolean; dedup?: boolean } = {},
  ) => {
    const { service, deps } = make();
    const create = jest.fn().mockResolvedValue({});
    const flagOn = opts.flag ?? true;
    Object.assign(deps.flags, {
      isEnabled: jest.fn((k: string) =>
        Promise.resolve(k === 'files_reuse_own' && flagOn),
      ),
    });
    Object.assign(deps.settings, {
      boolean: jest.fn((k: string) =>
        Promise.resolve(k === 'storage.dedup' ? (opts.dedup ?? true) : false),
      ),
    });
    Object.assign(deps.prisma.file, {
      create,
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
      ),
    });
    return { service, deps, create };
  };
  const dto = (over: Record<string, unknown> = {}) =>
    ({
      purpose: 'chat_attachment',
      mime: 'application/pdf',
      sizeBytes: 1000,
      sha256: HASH,
      acceptsExisting: true,
      ...over,
    }) as never;

  it('my own stored file: a new clean row, no upload', async () => {
    const t = setup([row()]);
    const out = await t.service.presign('me', dto());
    expect(out.existing).toBe(true);
    expect(out.upload.url).toBe('');
    const data = (t.create.mock.calls[0] as [{ data: Row }])[0].data;
    expect(data.owner_user_id).toBe('me');
    expect(data.s3_key).toBe('chat_attachment/me/mine');
    expect(data.scan_status).toBe('clean');
    expect(data.id).not.toBe('mine');
  });

  it("SECURITY: the same hash in someone else's file gives nothing", async () => {
    const t = setup([
      row({ id: 'theirs', owner_user_id: 'victim', s3_key: 'victim/secret' }),
    ]);
    const out = await t.service.presign('me', dto());
    expect(out.existing).toBeUndefined();
    expect(out.upload.url).not.toBe('');
    expect(JSON.stringify(out)).not.toContain('victim');
    const made = t.create.mock.calls as [{ data: Row }][];
    expect(made.some(([c]) => c.data.s3_key === 'victim/secret')).toBe(false);
  });

  it('SECURITY: the owner filter is in the query itself', async () => {
    const t = setup([]);
    await t.service.presign('me', dto());
    const q = (
      (t.deps.prisma.file as unknown as { findFirst: jest.Mock }).findFirst.mock
        .calls as [{ where: Row }][]
    )[0][0];
    expect(q.where.owner_user_id).toBe('me');
    expect(q.where.scan_status).toBe('clean');
    expect(q.where.deleted_at).toBeNull();
  });

  const refused: [string, Row][] = [
    ['deleted', { deleted_at: new Date() }],
    ['not scanned yet', { scan_status: 'pending' }],
    ['infected', { scan_status: 'infected' }],
    ['hash not proven (light confirm)', { source_sha256: null }],
    ['in another bucket', { s3_bucket: 'lawbid-media' }],
    ['another processing', { purpose: 'avatar' }],
    ['a type no longer allowed', { mime: 'application/x-msdownload' }],
  ];
  it.each(refused)('my file that is %s is not reused', async (_, over) => {
    const t = setup([row(over)]);
    expect((await t.service.presign('me', dto())).existing).toBeUndefined();
  });

  it('a file blocked by moderation is not reused', async () => {
    const t = setup([row()]);
    Object.assign(t.deps.prisma.mediaModerationCheck, {
      findUnique: jest
        .fn()
        .mockResolvedValue({ status: 'hidden', decision: null }),
    });
    expect((await t.service.presign('me', dto())).existing).toBeUndefined();
  });

  it.each([
    ['post photos', 'post_image', 'image/jpeg'],
    ['review photos', 'review_photo', 'image/jpeg'],
  ])(
    '%s go the usual way, to get their moderation',
    async (_, purpose, mime) => {
      const t = setup([row({ purpose, mime, s3_bucket: 'lawbid-media' })]);
      const out = await t.service.presign('me', dto({ purpose, mime }));
      expect(out.existing).toBeUndefined();
    },
  );

  describe('a profile photo picked again (owner 2026-11-08)', () => {
    const avatarRow = () =>
      row({
        purpose: 'avatar',
        mime: 'image/jpeg',
        s3_bucket: 'lawbid-media',
        s3_key: 'avatar/me/mine',
      });
    const withVerdict = (
      t: ReturnType<typeof setup>,
      verdict: Record<string, unknown> | null,
    ) => {
      const create = jest.fn().mockResolvedValue({});
      Object.assign(t.deps.prisma.mediaModerationCheck, {
        findUnique: jest.fn().mockResolvedValue(verdict),
        create,
      });
      return create;
    };
    const passed = {
      status: 'clean',
      decision: null,
      content_sha256: HASH,
      csam_status: 'no_match',
      provider: 'rekognition',
      labels: [],
      max_confidence: null,
      top_label: null,
      checked_at: new Date('2026-11-08T10:00:00Z'),
    };

    it('reuses my avatar that passed moderation, with its verdict', async () => {
      const t = setup([avatarRow()]);
      const verdicts = withVerdict(t, passed);
      const out = await t.service.presign(
        'me',
        dto({ purpose: 'avatar', mime: 'image/jpeg' }),
      );
      expect(out.existing).toBe(true);
      const made = (t.create.mock.calls[0] as [{ data: Row }])[0].data;
      expect(made.s3_key).toBe('avatar/me/mine');
      const copy = (verdicts.mock.calls[0] as [{ data: Row }])[0].data;
      expect(copy.file_id).toBe(made.id);
      expect(copy.status).toBe('clean');
      expect(copy.content_sha256).toBe(HASH);
    });

    it.each([
      ['not checked yet', null],
      ['still pending', { ...passed, status: 'pending' }],
      ['flagged', { ...passed, status: 'flagged' }],
    ])('an avatar %s is uploaded and checked again', async (_, verdict) => {
      const t = setup([avatarRow()]);
      withVerdict(t, verdict);
      const out = await t.service.presign(
        'me',
        dto({ purpose: 'avatar', mime: 'image/jpeg' }),
      );
      expect(out.existing).toBeUndefined();
      expect(t.create).not.toHaveBeenCalled();
    });
  });

  it.each([['identity documents', 'verification_document', 'application/pdf']])(
    '%s are never shared',
    async (_, purpose, mime) => {
      const t = setup([row({ purpose, mime })]);
      const out = await t.service.presign('me', dto({ purpose, mime }));
      expect(out.existing).toBeUndefined();
    },
  );

  it('an older app (no acceptsExisting), the flag off, or dedup off: upload', async () => {
    for (const t of [
      { s: setup([row()]), d: dto({ acceptsExisting: undefined }) },
      { s: setup([row()], { flag: false }), d: dto() },
      { s: setup([row()], { dedup: false }), d: dto() },
    ]) {
      expect((await t.s.service.presign('me', t.d)).existing).toBeUndefined();
    }
  });
});

describe('confirm without reading a big file (R-252, files_confirm_light)', () => {
  const MIB = 1024 * 1024;
  const pdfStart = Buffer.concat([
    Buffer.from('%PDF-1.7'),
    Buffer.alloc(1000, 0x20),
  ]);
  const setup = (opts: {
    flag: boolean;
    size: number;
    start?: Buffer;
    full?: Buffer;
    mime?: string;
  }) => {
    const { service, deps } = make();
    const intent = {
      userId: 'u1',
      purpose: 'chat_attachment',
      mime: opts.mime ?? 'application/pdf',
      size: opts.size,
      sha256: 'claimed-hash',
      bucket: 'lawbid-documents',
      key: 'chat_attachment/u1/f1',
    };
    const read = jest.fn().mockResolvedValue(opts.full ?? pdfStart);
    const readStart = jest.fn().mockResolvedValue(opts.start ?? pdfStart);
    const create = jest.fn().mockResolvedValue({});
    Object.assign(deps.flags, {
      isEnabled: jest.fn((k: string) =>
        Promise.resolve(k === 'files_confirm_light' && opts.flag),
      ),
    });
    Object.assign(deps.redis, {
      get: jest.fn().mockResolvedValue(JSON.stringify(intent)),
      del: jest.fn().mockResolvedValue(1),
      zrem: jest.fn().mockResolvedValue(1),
    });
    Object.assign(deps.storage, {
      head: jest.fn().mockResolvedValue({ size: opts.size }),
      read,
      readStart,
      remove: jest.fn().mockResolvedValue(undefined),
    });
    Object.assign(deps.prisma.file, { create });
    return { service, read, readStart, create };
  };

  it('a big file: only its start is read; the row waits for the worker', async () => {
    const t = setup({ flag: true, size: 50 * MIB });
    await t.service.confirm('u1', 'f1').catch(() => undefined);
    expect(t.read).not.toHaveBeenCalled();
    expect(t.readStart).toHaveBeenCalledTimes(1);
    const row = (
      t.create.mock.calls[0] as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(row.size_bytes).toBe(BigInt(50 * MIB));
    expect(row.sha256).toBe('claimed-hash');
    expect(row.source_sha256).toBeNull();
  });

  it('flag off: the whole file is read, as before', async () => {
    const t = setup({ flag: false, size: pdfStart.length });
    await t.service.confirm('u1', 'f1').catch(() => undefined);
    expect(t.read).toHaveBeenCalledTimes(1);
    expect(t.readStart).not.toHaveBeenCalled();
  });

  it('a small file stays on the full path with the flag on', async () => {
    const t = setup({ flag: true, size: MIB, full: pdfStart });
    await t.service.confirm('u1', 'f1').catch(() => undefined);
    expect(t.readStart).not.toHaveBeenCalled();
    expect(t.read).toHaveBeenCalledTimes(1);
  });

  it('the start shows another type: refused at once', async () => {
    const t = setup({
      flag: true,
      size: 50 * MIB,
      start: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]),
    });
    await expect(t.service.confirm('u1', 'f1')).rejects.toMatchObject({
      response: { code: 'FILE_TYPE_NOT_ALLOWED' },
    });
    expect(t.create).not.toHaveBeenCalled();
  });

  it('a start the prefix cannot settle goes the full way', async () => {
    const t = setup({
      flag: true,
      size: 50 * MIB,
      start: Buffer.alloc(100, 0),
      full: Buffer.alloc(100, 0),
    });
    await expect(t.service.confirm('u1', 'f1')).rejects.toBeDefined();
    expect(t.read).toHaveBeenCalledTimes(1);
    expect(t.create).not.toHaveBeenCalled();
  });
});

describe('confirm keeps a copy no upload link can write (security audit 2026-11-08, M3)', () => {
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.7\n'),
    Buffer.alloc(200, 0x20),
  ]);
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  // D-c1: the link wrote under staging/; the copy lives outside it.
  const FINAL_KEY = 'chat_attachment/s0/2026/11/f1';
  const UPLOAD_KEY = `staging/${FINAL_KEY}`;
  const setup = (opts: { data?: Buffer; claimed?: string } = {}) => {
    const { service, deps } = make();
    const data = opts.data ?? pdf;
    const intent = {
      userId: 'u1',
      purpose: 'chat_attachment',
      mime: 'application/pdf',
      size: data.length,
      sha256: opts.claimed ?? sha(data),
      bucket: 'lawbid-documents',
      key: UPLOAD_KEY,
    };
    const create = jest.fn().mockResolvedValue({});
    Object.assign(deps.redis, {
      get: jest.fn().mockResolvedValue(JSON.stringify(intent)),
      del: jest.fn().mockResolvedValue(1),
      zrem: jest.fn().mockResolvedValue(1),
    });
    const head = jest
      .fn<Promise<{ size: number } | null>, unknown[]>()
      .mockResolvedValue({ size: data.length });
    const read = jest.fn().mockResolvedValue(data);
    Object.assign(deps.storage, { head, read });
    Object.assign(deps.prisma.file, { create });
    deps.prisma.file.findUnique.mockResolvedValue({
      id: 'f1',
      owner_user_id: 'u1',
      purpose: 'chat_attachment',
      mime: 'application/pdf',
      size_bytes: BigInt(data.length),
      scan_status: 'pending',
      s3_bucket: 'lawbid-documents',
      s3_key: `${UPLOAD_KEY}_sabc`,
      deleted_at: null,
      created_at: new Date(),
    });
    return { service, deps, create, head, read };
  };
  const copiedKey = (deps: ReturnType<typeof make>['deps']): string =>
    (deps.storage.copy.mock.calls[0] as string[])[2];

  // Security audit 2026-11-08 (L6): the whole-file read of confirm goes
  // through the process's byte budget, so parallel confirms can't take
  // the memory.
  it('the whole-file read waits for the read budget', async () => {
    const { service, read } = setup();
    const budget = (
      service as unknown as {
        readBudget: { run: (b: number, w: () => Promise<unknown>) => unknown };
      }
    ).readBudget;
    const run = jest.spyOn(budget, 'run');
    await service.confirm('u1', 'f1');
    expect(run).toHaveBeenCalledWith(pdf.length, expect.any(Function));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('checks and stores the copy, then drops the upload key', async () => {
    const { service, deps, create, read } = setup();
    await service.confirm('u1', 'f1');
    expect(deps.storage.copy).toHaveBeenCalledWith(
      'lawbid-documents',
      UPLOAD_KEY,
      expect.stringMatching(new RegExp(`^${FINAL_KEY}_s[0-9a-f]{8}$`)),
      // L5: the staging object was `no-store`; the stored copy gets the
      // bucket's own Cache-Control and the checked type.
      { contentType: 'application/pdf', cacheControl: 'private, max-age=300' },
    );
    const key = copiedKey(deps);
    expect(key.startsWith('staging/')).toBe(false);
    expect(read).toHaveBeenCalledWith('lawbid-documents', key);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ s3_key: key }),
    });
    expect(deps.storage.remove).toHaveBeenCalledWith(
      'lawbid-documents',
      [UPLOAD_KEY],
      { purgeEdge: false },
    );
    // What the link may still write there is swept after it expires.
    expect(deps.redis.zadd).toHaveBeenCalledWith(
      'files:pending',
      expect.any(Number),
      `f1|lawbid-documents|${UPLOAD_KEY}|after_confirm`,
    );
    expect(deps.scans.enqueueScan).toHaveBeenCalledWith('f1', 'u1');
  });

  it('a mismatch deletes the upload and the copy', async () => {
    const { service, deps, create } = setup({ claimed: 'b'.repeat(64) });
    expect(await code(service.confirm('u1', 'f1'))).toBe(
      'FILE_CHECKSUM_MISMATCH',
    );
    expect(deps.storage.remove).toHaveBeenCalledWith('lawbid-documents', [
      UPLOAD_KEY,
      copiedKey(deps),
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it('a parallel confirm that lost the insert drops only its own copy', async () => {
    const { service, deps, create } = setup();
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await service.confirm('u1', 'f1');
    expect(deps.storage.remove).toHaveBeenCalledWith(
      'lawbid-documents',
      [copiedKey(deps)],
      { purgeEdge: false },
    );
    expect(deps.scans.enqueueScan).not.toHaveBeenCalled();
  });

  it('a retry after the upload key is gone gets the finished row', async () => {
    const { service, deps, head } = setup();
    head.mockResolvedValue(null);
    expect(await code(service.confirm('u1', 'f1'))).toBe('resolved');
    deps.prisma.file.findUnique.mockResolvedValue(null);
    expect(await code(service.confirm('u1', 'f1'))).toBe('FILE_NOT_UPLOADED');
  });

  it('the object vanishing before the copy is "not uploaded"', async () => {
    const { service, deps, create } = setup();
    deps.storage.copy.mockResolvedValue(false);
    deps.prisma.file.findUnique.mockResolvedValue(null);
    expect(await code(service.confirm('u1', 'f1'))).toBe('FILE_NOT_UPLOADED');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('confirm of a small upload with one read (owner 2026-11-09, files_confirm_direct)', () => {
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(300, 0x11),
  ]);
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const UPLOAD_KEY = 'post_image/s0/2026/11/f1';
  const setup = (
    opts: { stored?: Buffer | null; claimed?: string; flag?: boolean } = {},
  ) => {
    const { service, deps } = make();
    const intent = {
      userId: 'u1',
      purpose: 'post_image',
      mime: 'image/jpeg',
      size: jpeg.length,
      sha256: opts.claimed ?? sha(jpeg),
      bucket: 'lawbid-media',
      key: UPLOAD_KEY,
    };
    const create = jest.fn().mockResolvedValue({});
    Object.assign(deps.flags, {
      isEnabled: jest.fn((k: string) =>
        Promise.resolve(k === 'files_confirm_direct' && (opts.flag ?? true)),
      ),
    });
    Object.assign(deps.redis, {
      get: jest.fn().mockResolvedValue(JSON.stringify(intent)),
      del: jest.fn().mockResolvedValue(1),
      zrem: jest.fn().mockResolvedValue(1),
    });
    const storage = {
      readUpTo: jest
        .fn()
        .mockResolvedValue(opts.stored === undefined ? jpeg : opts.stored),
      head: jest.fn().mockResolvedValue({ size: jpeg.length }),
      read: jest.fn().mockResolvedValue(jpeg),
      put: jest.fn().mockResolvedValue(undefined),
    };
    Object.assign(deps.storage, storage);
    Object.assign(deps.prisma.file, { create });
    deps.prisma.file.findUnique.mockResolvedValue({
      id: 'f1',
      owner_user_id: 'u1',
      purpose: 'post_image',
      mime: 'image/jpeg',
      size_bytes: BigInt(jpeg.length),
      scan_status: 'pending',
      s3_bucket: 'lawbid-media',
      s3_key: `${UPLOAD_KEY}_sabc`,
      deleted_at: null,
      created_at: new Date(),
    });
    return { service, deps, storage, create };
  };

  it('one ranged read, no HEAD and no copy; the checked bytes go to the server key', async () => {
    const { service, deps, storage, create } = setup();
    await service.confirm('u1', 'f1');
    expect(storage.readUpTo).toHaveBeenCalledWith(
      'lawbid-media',
      UPLOAD_KEY,
      jpeg.length + 1,
    );
    expect(storage.head).not.toHaveBeenCalled();
    expect(deps.storage.copy).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
    const [bucket, key, body, mime] = storage.put.mock.calls[0] as [
      string,
      string,
      Buffer,
      string,
    ];
    expect([bucket, mime]).toEqual(['lawbid-media', 'image/jpeg']);
    expect(key).toMatch(new RegExp(`^${UPLOAD_KEY}_s[0-9a-f]{8}$`));
    expect(body.equals(jpeg)).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        s3_key: key,
        source_sha256: sha(jpeg),
        size_bytes: BigInt(jpeg.length),
      }),
    });
    expect(deps.scans.enqueueScan).toHaveBeenCalledWith('f1', 'u1');
  });

  it('a false hash or a longer object is refused and nothing is stored', async () => {
    for (const t of [
      setup({ claimed: 'b'.repeat(64) }),
      setup({ stored: Buffer.concat([jpeg, Buffer.from([0])]) }),
    ]) {
      expect(await code(t.service.confirm('u1', 'f1'))).toBe(
        'FILE_CHECKSUM_MISMATCH',
      );
      expect(t.storage.put).not.toHaveBeenCalled();
      expect(t.create).not.toHaveBeenCalled();
    }
  });

  it('another type inside is refused before anything is stored', async () => {
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.7'),
      Buffer.alloc(jpeg.length - 8, 0x20),
    ]);
    const t = setup({ stored: pdf, claimed: sha(pdf) });
    expect(await code(t.service.confirm('u1', 'f1'))).toBe(
      'FILE_TYPE_NOT_ALLOWED',
    );
    expect(t.storage.put).not.toHaveBeenCalled();
  });

  it('no object: "not uploaded"', async () => {
    const t = setup({ stored: null });
    t.deps.prisma.file.findUnique.mockResolvedValue(null);
    expect(await code(t.service.confirm('u1', 'f1'))).toBe('FILE_NOT_UPLOADED');
    expect(t.storage.put).not.toHaveBeenCalled();
  });

  it('flag off: HEAD and the copy, as before', async () => {
    const t = setup({ flag: false });
    await t.service.confirm('u1', 'f1');
    expect(t.storage.readUpTo).not.toHaveBeenCalled();
    expect(t.storage.head).toHaveBeenCalled();
    expect(t.deps.storage.copy).toHaveBeenCalled();
    expect(t.storage.put).not.toHaveBeenCalled();
  });
});

describe('confidential file links (security & legal pass 2026-10-24)', () => {
  function withFiles(ttl: number) {
    const { service, deps } = make();
    (deps.settings as unknown as { number: unknown }).number = jest.fn(
      (key: string) =>
        Promise.resolve(key === 'files.confidential_url_ttl_sec' ? ttl : 10),
    );
    const rows = [
      {
        id: 'c1',
        owner_user_id: 'owner',
        purpose: 'chat_attachment',
        s3_bucket: 'documents',
        s3_key: 'chat/owner/c1',
        mime: 'application/pdf',
        size_bytes: 10n,
        width: null,
        height: null,
      },
    ];
    (deps.prisma.file as unknown as Record<string, unknown>).findMany = jest
      .fn()
      .mockResolvedValue(rows);
    return { service, deps };
  }

  const ttlOf = (deps: ReturnType<typeof make>['deps']): unknown =>
    (deps.storage.signedGetUrl.mock.calls[0] as unknown[])[2];

  it('chat documents are signed for files.confidential_url_ttl_sec, not for an hour', async () => {
    const { service, deps } = withFiles(900);
    await service.attachmentUrls(['c1']);
    expect(ttlOf(deps)).toBe(900);
  });

  it('the setting is clamped to 60..3600 seconds', async () => {
    const low = withFiles(5);
    await low.service.attachmentUrls(['c1']);
    expect(ttlOf(low.deps)).toBe(60);
    const high = withFiles(999999);
    await high.service.attachmentUrls(['c1']);
    expect(ttlOf(high.deps)).toBe(3600);
  });

  it('reports each opened file to the access journal', async () => {
    const { deps } = withFiles(900);
    const access = { recordViews: jest.fn().mockResolvedValue(undefined) };
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
      undefined,
      undefined,
      undefined,
      access as never,
    );
    await service.attachmentUrls(['c1']);
    expect(access.recordViews).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'c1', owner_user_id: 'owner' }),
    ]);
  });
});

/**
 * C-c11 (2026-11-09): with S3 Object Lock on the documents bucket
 * (Terraform documents_object_lock → env S3_OBJECT_LOCK_RETENTION_DAYS)
 * the sealed deal-record PDF is written with a COMPLIANCE retention; any
 * other generated file, and every file while the switch is off, is not.
 */
describe('storeGenerated({ sealed }) and Object Lock (C-c11)', () => {
  const pdf = Buffer.from('%PDF-1.7\nsealed\n');
  const withLockDays = (days: string | undefined) => {
    const { service, deps } = make();
    deps.config.get.mockImplementation((k: string) =>
      k === 'S3_OBJECT_LOCK_RETENTION_DAYS' ? days : undefined,
    );
    Object.assign(deps.storage, {
      put: jest.fn().mockResolvedValue(undefined),
    });
    Object.assign(deps.prisma.file, {
      create: jest.fn().mockResolvedValue({ id: 'f' }),
    });
    return { service, deps };
  };
  const lockArg = (deps: ReturnType<typeof make>['deps']): unknown =>
    (deps.storage as unknown as { put: jest.Mock }).put.mock.calls[0][4];

  it('a sealed record gets COMPLIANCE retention of the configured days', async () => {
    const { service, deps } = withLockDays('2555');
    const before = Date.now();
    await service.storeGenerated(
      'u1',
      'case_attachment',
      pdf,
      'application/pdf',
      {
        sealed: true,
      },
    );
    const lock = lockArg(deps) as { retainUntil: Date };
    const days = (lock.retainUntil.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(2554.9);
    expect(days).toBeLessThan(2555.1);
  });

  it('an ordinary generated file is never locked', async () => {
    const { service, deps } = withLockDays('2555');
    await service.storeGenerated(
      'u1',
      'case_attachment',
      pdf,
      'application/pdf',
    );
    expect(lockArg(deps)).toBeUndefined();
  });

  it('switch off (no env): a sealed record is stored as any other file', async () => {
    const { service, deps } = withLockDays(undefined);
    await service.storeGenerated(
      'u1',
      'case_attachment',
      pdf,
      'application/pdf',
      {
        sealed: true,
      },
    );
    expect(lockArg(deps)).toBeUndefined();
    expect(service.objectLockRetentionDays()).toBe(0);
  });
});

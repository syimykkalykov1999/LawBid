import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { File } from '@prisma/client';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';

export const scanHandoffKey = (fileId: string) => `files:scan:bytes:${fileId}`;

/**
 * Owner row 106 (media audit 13.11, batch F item 14): a small upload that
 * `confirm` already read whole (the direct path) is handed to the scan
 * worker through Redis, so the worker does not read the same bytes from
 * R2 / S3 a second time (≈0.3–0.6 s per photo on R2, measured 08.11).
 *
 * Best effort on both sides: nothing stored (switch off, too big, Redis
 * down) or nothing found (expired, another worker took it) = the worker
 * reads the object as before. The worker trusts the bytes only when their
 * length and SHA-256 are the ones `confirm` wrote to the row.
 *
 * Admin: `files.scan_handoff_max_kb` (0 = off) and `files.scan_handoff_ttl_s`.
 */
@Injectable()
export class ScanHandoff {
  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  /** `confirm`: keeps [data] for the worker (never throws). */
  async stash(fileId: string, data: Buffer): Promise<boolean> {
    const redis = this.redis;
    if (!redis || !this.settings || redis.status !== 'ready') return false;
    try {
      const [maxKb, ttl] = await Promise.all([
        this.settings.number('files.scan_handoff_max_kb'),
        this.settings.number('files.scan_handoff_ttl_s'),
      ]);
      if (!(maxKb > 0) || data.length > maxKb * 1024 || !(ttl > 0)) {
        return false;
      }
      await redis.set(scanHandoffKey(fileId), data, 'EX', Math.round(ttl));
      return true;
    } catch {
      return false;
    }
  }

  /** The worker: the bytes `confirm` kept for [file], once (null = read
   * the object). */
  async take(
    file: Pick<File, 'id' | 'size_bytes' | 'source_sha256'>,
  ): Promise<Buffer | null> {
    const redis = this.redis;
    if (!redis || redis.status !== 'ready') return null;
    let data: Buffer | null;
    try {
      data = await redis.getdelBuffer(scanHandoffKey(file.id));
    } catch {
      return null;
    }
    if (!data || !file.source_sha256) return null;
    if (BigInt(data.length) !== file.size_bytes) return null;
    const sha256 = createHash('sha256').update(data).digest('hex');
    return sha256 === file.source_sha256 ? data : null;
  }
}

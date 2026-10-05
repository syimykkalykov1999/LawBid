import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../prisma/prisma.service';
import { ALL_VARIANT_PX, variantKey } from '../files.policy';
import { S3StorageService } from './s3-storage.service';

/** Why a file row was deleted (files.deleted_reason). */
export type FileDeleteReason =
  'orphan' | 'released' | 'account_deleted' | 'task_purged' | 'expired';

/** S3 DeleteObjects takes at most 1000 keys; a file is up to 4 objects. */
const KEYS_PER_CALL = 1000;
/** Rows looked up per query (IN lists stay small). */
const CHUNK = 200;

/**
 * Owner 2026-10-05 (storage like Telegram): files are stored once and
 * shared — identical uploads point at one S3 object (FileScanProcessor
 * dedup, FilesService.copyForUser). So an object may only be removed when
 * no live file row uses it any more: reference counting by query on
 * (s3_bucket, s3_key), no counter to drift.
 *
 * Every path that removes files (account anonymization, the task archive
 * purge, the orphan cleanup) goes through here, so a shared object never
 * disappears from under another user, and the size variants (`_w256`,
 * `_w320`, `_w1080`) always go with their object.
 */
@Injectable()
export class FileReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FileReleaseService.name);
  }

  /** Marks [fileIds] deleted and removes the objects nobody else uses.
   * Idempotent: already deleted rows keep their first reason. */
  async release(
    fileIds: string[],
    reason: FileDeleteReason,
    now: Date = new Date(),
  ): Promise<{ released: number; removedObjects: number }> {
    const ids = [...new Set(fileIds)];
    if (ids.length === 0) return { released: 0, removedObjects: 0 };
    let released = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { count } = await this.prisma.file.updateMany({
        where: { id: { in: ids.slice(i, i + CHUNK) }, deleted_at: null },
        data: { deleted_at: now, deleted_reason: reason },
      });
      released += count;
    }
    const removedObjects = await this.purge(ids, now);
    return { released, removedObjects };
  }

  /**
   * For deleted, not yet purged rows among [fileIds]: removes each S3
   * object (with its variants) unless a live row still points at it, and
   * marks the rows purged — the object now belongs to the live rows only.
   * Returns how many objects were removed.
   */
  async purge(fileIds: string[], now: Date = new Date()): Promise<number> {
    const ids = [...new Set(fileIds)];
    let removed = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      removed += await this.purgeChunk(ids.slice(i, i + CHUNK), now);
    }
    return removed;
  }

  private async purgeChunk(ids: string[], now: Date): Promise<number> {
    const rows = await this.prisma.file.findMany({
      where: { id: { in: ids }, deleted_at: { not: null }, purged_at: null },
      select: { id: true, s3_bucket: true, s3_key: true },
    });
    if (rows.length === 0) return 0;
    const live = await this.prisma.file.findMany({
      where: {
        deleted_at: null,
        OR: rows.map((r) => ({ s3_bucket: r.s3_bucket, s3_key: r.s3_key })),
      },
      select: { s3_bucket: true, s3_key: true },
    });
    const kept = new Set(live.map((r) => `${r.s3_bucket}\n${r.s3_key}`));
    const byBucket = new Map<string, Set<string>>();
    for (const r of rows) {
      if (kept.has(`${r.s3_bucket}\n${r.s3_key}`)) continue;
      const keys = byBucket.get(r.s3_bucket) ?? new Set<string>();
      keys.add(r.s3_key);
      byBucket.set(r.s3_bucket, keys);
    }
    let removed = 0;
    // A bucket that fails (S3 down, permissions) keeps its rows unpurged
    // for the next run; one bad bucket never stops the others.
    const failed = new Set<string>();
    if (this.storage.configured) {
      for (const [bucket, keys] of byBucket) {
        const objects = [...keys].flatMap((k) => [
          k,
          ...ALL_VARIANT_PX.map((px) => variantKey(k, px)),
        ]);
        try {
          for (let i = 0; i < objects.length; i += KEYS_PER_CALL) {
            await this.storage.remove(
              bucket,
              objects.slice(i, i + KEYS_PER_CALL),
            );
          }
          removed += keys.size;
        } catch (err) {
          // No such bucket: nothing of it can be left to remove.
          if (!isNoSuchBucket(err)) {
            failed.add(bucket);
            this.logger.error({ err, bucket }, 'storage objects not removed');
          }
        }
      }
    }
    const done = rows.filter((r) => !failed.has(r.s3_bucket));
    if (done.length > 0) {
      await this.prisma.file.updateMany({
        where: { id: { in: done.map((r) => r.id) }, purged_at: null },
        data: { purged_at: now },
      });
    }
    if (removed > 0) {
      this.logger.info(
        { removed, rows: rows.length },
        'storage objects removed',
      );
    }
    return removed;
  }
}

/** S3 / MinIO "NoSuchBucket" (the bucket is gone or never existed). */
export function isNoSuchBucket(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    ((err as { name?: string }).name === 'NoSuchBucket' ||
      (err as { Code?: string }).Code === 'NoSuchBucket')
  );
}

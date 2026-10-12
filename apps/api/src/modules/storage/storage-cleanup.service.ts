import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { withJobLock } from '../../jobs/handlers/job-lock';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { CLEANUP_EXEMPT_PURPOSES } from '../files/files.policy';
import {
  FileReleaseService,
  isNoSuchBucket,
} from '../files/storage/file-release.service';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { PENDING_UPLOADS_KEY } from '../files/storage/pending-uploads';

/**
 * Every place a file id is kept (`table.column`, arrays marked `[]`). The
 * cleanup treats a file as used while any of these points at it (`{}` is
 * a JSON array of ids).
 * storage-cleanup.service.spec.ts fails when a new relation to `files`
 * appears in schema.prisma without being added here.
 */
export const FILE_REFERENCES = [
  'users.avatar_file_id',
  'verification_documents.file_id',
  'data_export_jobs.file_id',
  'post_media.file_id',
  'post_attachments.file_id',
  'case_photos.file_id',
  'messages.file_id',
  'stickers.file_id',
  'document_templates.file_id',
  'attorney_tasks.file_ids[]',
  'reviews.photo_ids[]',
  'client_reviews.photo_ids[]',
  'client_verifications.document_file_ids{}',
] as const;

const BATCH = 500;
const MAX_BATCHES = 20;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LAST_RUN_KEY = 'storage:cleanup:last';

export interface CleanupResult {
  pendingUploadsRemoved: number;
  orphansFound: number;
  deletedPostMedia: number;
  restored: number;
  objectsRemoved: number;
  rowsRemoved: number;
}

const EMPTY: CleanupResult = {
  pendingUploadsRemoved: 0,
  orphansFound: 0,
  deletedPostMedia: 0,
  restored: 0,
  objectsRemoved: 0,
  rowsRemoved: 0,
};

/**
 * Owner 2026-10-05 (storage like Telegram): nothing nobody uses stays in
 * storage. Hourly (`storage.gc`), while `storage.auto_cleanup` is on:
 * 1. presigned uploads never confirmed → the S3 object is removed (no
 *    files row exists, so nothing else would ever find it);
 * 2. files nothing points at (FILE_REFERENCES) older than
 *    `storage.orphan_grace_hours` — uploaded but never sent, replaced
 *    avatars, infected / broken uploads — are set aside (deleted_at,
 *    reason `orphan`): they stop being attachable at once;
 * 3. photos and documents of posts deleted more than
 *    `storage.deleted_posts_media_days` ago are set aside too (`released`);
 * 4. after `storage.purge_after_days` the set-aside files are checked once
 *    more (a restored post gets its photos back) and their objects removed
 *    through FileReleaseService (shared objects stay for the other rows);
 *    orphan rows are then deleted, so the table does not grow forever.
 *    Rows other paths deleted without removing the object (older code)
 *    are purged the same way.
 * Identity documents, data exports and video are never touched
 * (CLEANUP_EXEMPT_PURPOSES). S3 versioning keeps a recovery copy of a
 * removed object (documents 90 days, media 30 days).
 */
@Injectable()
export class StorageCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly release: FileReleaseService,
    private readonly storage: S3StorageService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StorageCleanupService.name);
  }

  /** The cron entry: nothing while the switch is off. */
  async run(now: Date = new Date()): Promise<CleanupResult | null> {
    if (!(await this.settings.boolean('storage.auto_cleanup'))) return null;
    return this.runNow(now);
  }

  /** Also the admin's «Очистить сейчас» (runs whatever the switch says).
   * One run at a time across all API / worker instances. */
  async runNow(now: Date = new Date()): Promise<CleanupResult> {
    const out = await withJobLock(this.redis, 'storage.gc', 30 * 60_000, () =>
      this.cleanup(now),
    );
    return out ?? { ...EMPTY };
  }

  /** The last run (for the admin page), null before the first one. */
  async lastRun(): Promise<(CleanupResult & { at: string }) | null> {
    const raw = await this.redis.get(LAST_RUN_KEY);
    return raw ? (JSON.parse(raw) as CleanupResult & { at: string }) : null;
  }

  private async cleanup(now: Date): Promise<CleanupResult> {
    const [graceHours, purgeDays, postDays] = await Promise.all([
      this.settings.number('storage.orphan_grace_hours'),
      this.settings.number('storage.purge_after_days'),
      this.settings.number('storage.deleted_posts_media_days'),
    ]);
    const graceCutoff = new Date(
      now.getTime() - Math.max(1, graceHours) * HOUR_MS,
    );
    const purgeCutoff = new Date(
      now.getTime() - Math.max(0, purgeDays) * DAY_MS,
    );
    const postCutoff = new Date(now.getTime() - Math.max(1, postDays) * DAY_MS);
    const result: CleanupResult = { ...EMPTY };

    result.pendingUploadsRemoved = await this.sweepPendingUploads(now);

    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const ids = await this.unused(
        Prisma.sql`f.deleted_at IS NULL AND f.created_at < ${graceCutoff}`,
        postCutoff,
      );
      if (ids.length === 0) break;
      // Still listed by a deleted post → `released`; the rest are orphans.
      const byPost = new Set(await this.onPosts(ids));
      result.orphansFound += await this.setAside(
        ids.filter((id) => !byPost.has(id)),
        'orphan',
        now,
      );
      result.deletedPostMedia += await this.setAside(
        [...byPost],
        'released',
        now,
      );
      if (ids.length < BATCH) break;
    }

    const seen = new Set<string>();
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const due = await this.prisma.file.findMany({
        where: { deleted_at: { lt: purgeCutoff }, purged_at: null },
        select: { id: true, deleted_reason: true },
        orderBy: { deleted_at: 'asc' },
        take: BATCH,
      });
      // Rows whose bucket failed stay unpurged; never loop over them.
      if (due.every((f) => seen.has(f.id))) break;
      for (const f of due) seen.add(f.id);
      // What this cleanup set aside is checked once more before removal.
      const ours = due
        .filter(
          (f) =>
            f.deleted_reason === 'orphan' || f.deleted_reason === 'released',
        )
        .map((f) => f.id);
      const stillUnused = new Set(
        ours.length
          ? await this.unused(
              Prisma.sql`f.id = ANY(${ours}::UUID[])`,
              postCutoff,
            )
          : [],
      );
      const back = new Set(ours.filter((id) => !stillUnused.has(id)));
      if (back.size) {
        const { count } = await this.prisma.file.updateMany({
          where: { id: { in: [...back] }, purged_at: null },
          data: { deleted_at: null, deleted_reason: null },
        });
        result.restored += count;
      }
      result.objectsRemoved += await this.release.purge(
        due.map((f) => f.id).filter((id) => !back.has(id)),
        now,
      );
      result.rowsRemoved += await this.dropRows(
        due
          .filter((f) => f.deleted_reason === 'orphan' && stillUnused.has(f.id))
          .map((f) => f.id),
      );
      if (due.length < BATCH) break;
    }

    if (Object.values(result).some((n) => n > 0)) {
      this.logger.info(result, 'storage cleanup');
    }
    await this.redis.set(
      LAST_RUN_KEY,
      JSON.stringify({ at: now.toISOString(), ...result }),
    );
    return result;
  }

  /**
   * Files matching [where] that nothing uses: no reference in
   * FILE_REFERENCES, except a post deleted before [postCutoff] (its photos
   * and documents count as unused). Never the exempt purposes.
   */
  private async unused(where: Prisma.Sql, postCutoff: Date): Promise<string[]> {
    const exempt = [...CLEANUP_EXEMPT_PURPOSES];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT f.id::TEXT AS id
      FROM files f
      WHERE ${where}
        AND f.purpose::TEXT <> ALL(${exempt}::TEXT[])
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.avatar_file_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM verification_documents v WHERE v.file_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM data_export_jobs e WHERE e.file_id = f.id)
        AND NOT EXISTS (
          SELECT 1 FROM post_media pm JOIN posts p ON p.id = pm.post_id
          WHERE pm.file_id = f.id
            AND (p.deleted_at IS NULL OR p.deleted_at >= ${postCutoff}))
        AND NOT EXISTS (
          SELECT 1 FROM post_attachments pa JOIN posts p ON p.id = pa.post_id
          WHERE pa.file_id = f.id
            AND (p.deleted_at IS NULL OR p.deleted_at >= ${postCutoff}))
        AND NOT EXISTS (SELECT 1 FROM case_photos cp WHERE cp.file_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.file_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM stickers s WHERE s.file_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM document_templates d WHERE d.file_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM attorney_tasks t WHERE t.file_ids @> ARRAY[f.id])
        AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.photo_ids @> ARRAY[f.id])
        AND NOT EXISTS (SELECT 1 FROM client_reviews cr WHERE cr.photo_ids @> ARRAY[f.id])
        AND NOT EXISTS (
          SELECT 1 FROM client_verifications cv
          WHERE cv.document_file_ids @> jsonb_build_array(f.id::TEXT))
      ORDER BY f.created_at
      LIMIT ${BATCH}`;
    return rows.map((r) => r.id);
  }

  /** Among [ids], the files a (deleted) post still lists. */
  private async onPosts(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT file_id::TEXT AS id FROM post_media
      WHERE file_id = ANY(${ids}::UUID[])
      UNION
      SELECT file_id::TEXT AS id FROM post_attachments
      WHERE file_id = ANY(${ids}::UUID[])`;
    return rows.map((r) => r.id);
  }

  private async setAside(
    ids: string[],
    reason: 'orphan' | 'released',
    now: Date,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const { count } = await this.prisma.file.updateMany({
      where: { id: { in: ids }, deleted_at: null },
      data: { deleted_at: now, deleted_reason: reason },
    });
    return count;
  }

  /** Purged orphan rows go for good (nothing references them); a row a
   * reference appeared on in the meantime stays (the FK refuses). */
  private async dropRows(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    try {
      const { count } = await this.prisma.file.deleteMany({
        where: { id: { in: ids }, purged_at: { not: null } },
      });
      return count;
    } catch (err) {
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== 'P2003'
      ) {
        throw err;
      }
      let n = 0;
      for (const id of ids) {
        try {
          n += (
            await this.prisma.file.deleteMany({
              where: { id, purged_at: { not: null } },
            })
          ).count;
        } catch {
          // still referenced: the row stays
        }
      }
      return n;
    }
  }

  /** Presigned uploads that were never confirmed: their objects would
   * otherwise stay in S3 forever with no row pointing at them. */
  private async sweepPendingUploads(now: Date): Promise<number> {
    let removed = 0;
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const members = await this.redis.zrangebyscore(
        PENDING_UPLOADS_KEY,
        0,
        now.getTime(),
        'LIMIT',
        0,
        BATCH,
      );
      if (members.length === 0) break;
      const parsed = members.map((m) => {
        const [id, bucket, key] = m.split('|');
        return { id, bucket, key };
      });
      const confirmed = new Set(
        (
          await this.prisma.file.findMany({
            // Any row, deleted ones too: its object is then the
            // release path's business, never this sweep's.
            where: withDeleted({ id: { in: parsed.map((p) => p.id) } }),
            select: { id: true },
          })
        ).map((f) => f.id),
      );
      const byBucket = new Map<string, string[]>();
      const kept = new Set<string>();
      for (const p of parsed) {
        if (confirmed.has(p.id) || !p.bucket || !p.key) continue;
        byBucket.set(p.bucket, [...(byBucket.get(p.bucket) ?? []), p.key]);
      }
      if (this.storage.configured) {
        for (const [bucket, keys] of byBucket) {
          try {
            await this.storage.remove(bucket, keys);
            removed += keys.length;
          } catch (err) {
            if (isNoSuchBucket(err)) continue;
            // Kept in the set: the next run tries again.
            this.logger.error({ err, bucket }, 'abandoned uploads not removed');
            for (const p of parsed) if (p.bucket === bucket) kept.add(p.id);
          }
        }
      }
      const done = members.filter((m) => !kept.has(m.split('|')[0]));
      if (done.length > 0) await this.redis.zrem(PENDING_UPLOADS_KEY, ...done);
      // A failing bucket stays for the next run instead of looping here.
      if (members.length < BATCH || kept.size > 0) break;
    }
    return removed;
  }
}

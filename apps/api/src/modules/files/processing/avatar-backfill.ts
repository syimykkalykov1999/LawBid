import type { File } from '@prisma/client';
import { createHash } from 'node:crypto';
import { computeBlurhash } from './blurhash';
import { imageQuality, type ImageFormat } from './image-processor';
import type { ImageProcessor } from './image-processor';
import { putProcessedObjects } from './put-processed-objects';
import { detectMime } from '../magic-bytes';
import { isImageMime, variantKey, AVATAR_VARIANT_PX } from '../files.policy';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import type { S3StorageService } from '../storage/s3-storage.service';

/**
 * R-405 (owner 2026-11-04, «аватарки мыльные»): makes the sized variants
 * of avatars that were stored before the scan job produced them (`width`
 * NULL — the app and every list fell back to the raw upload, often a
 * 3–4 MB phone photo, or showed letters). Reuses the very same pipeline as
 * a fresh upload (ImageProcessor → putProcessedObjects), so an old avatar
 * ends up byte-for-byte like a new one: a 1024 px square main object and
 * the 256 px preview, EXIF stripped, immutable Cache-Control, AVIF twins
 * when the switch is on.
 *
 * Dry run by default; `apply` writes. Idempotent: a processed avatar gets
 * its width and leaves the default selection; `all` walks every clean
 * avatar and skips those whose 256 px object already exists (`force`
 * rewrites them, e.g. after a quality change). Rows sharing one stored
 * object (Telegram-like dedup) are updated together and processed once.
 */
export interface AvatarBackfillOptions {
  apply: boolean;
  all: boolean;
  force: boolean;
  /** 0 = no limit. */
  limit: number;
  batch: number;
  log: (line: string) => void;
}

export interface AvatarBackfillSummary {
  candidates: number;
  objects: number;
  processed: number;
  skipped: number;
  failed: number;
  rowsUpdated: number;
}

type Row = Pick<
  File,
  'id' | 's3_bucket' | 's3_key' | 'mime' | 'width' | 'created_at'
>;

export interface AvatarBackfillDeps {
  prisma: {
    file: {
      findMany(args: {
        where: Record<string, unknown>;
        orderBy: { id: 'asc' };
        take: number;
        select: Record<string, true>;
      }): Promise<Row[]>;
      updateMany(args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }): Promise<{ count: number }>;
    };
  };
  storage: Pick<S3StorageService, 'read' | 'put' | 'head'>;
  images: Pick<ImageProcessor, 'process'>;
  settings?: Pick<AppSettingsService, 'string' | 'number' | 'boolean'>;
}

export function parseAvatarBackfillArgs(
  argv: readonly string[],
): Omit<AvatarBackfillOptions, 'log'> {
  const num = (name: string, fallback: number): number => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    const v = hit ? Number(hit.slice(name.length + 3)) : NaN;
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
  };
  const known = /^--(apply|all|force|limit=\d+|batch=\d+)$/;
  const bad = argv.find((a) => !known.test(a));
  if (bad) throw new Error(`unknown argument: ${bad}`);
  return {
    apply: argv.includes('--apply'),
    all: argv.includes('--all'),
    force: argv.includes('--force'),
    limit: num('limit', 0),
    batch: Math.max(1, num('batch', 100)),
  };
}

export async function runAvatarBackfill(
  deps: AvatarBackfillDeps,
  opts: AvatarBackfillOptions,
): Promise<AvatarBackfillSummary> {
  const sum: AvatarBackfillSummary = {
    candidates: 0,
    objects: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
    rowsUpdated: 0,
  };
  const format: ImageFormat =
    deps.settings &&
    (await deps.settings.string('storage.image_format')) === 'jpeg'
      ? 'jpeg'
      : 'webp';
  const quality = await imageQuality(
    deps.settings as AppSettingsService | undefined,
  );
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const rows: Row[] = await deps.prisma.file.findMany({
      where: {
        purpose: 'avatar',
        scan_status: 'clean',
        deleted_at: null,
        ...(opts.all ? {} : { width: null }),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: opts.batch,
      select: {
        id: true,
        s3_bucket: true,
        s3_key: true,
        mime: true,
        width: true,
        created_at: true,
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    for (const row of rows) {
      sum.candidates += 1;
      const objectId = `${row.s3_bucket}/${row.s3_key}`;
      if (seen.has(objectId)) continue;
      seen.add(objectId);
      if (opts.limit > 0 && sum.objects >= opts.limit) continue;
      sum.objects += 1;
      if (!opts.apply) continue;
      try {
        const outcome = await regenerate(deps, row, format, quality, opts);
        sum[outcome.kind] += 1;
        sum.rowsUpdated += outcome.rows;
        opts.log(
          `${row.id}: ${outcome.kind}${outcome.why ? ` (${outcome.why})` : ''}`,
        );
      } catch (err) {
        sum.failed += 1;
        opts.log(
          `${row.id}: failed (${err instanceof Error ? err.message : String(err)})`,
        );
      }
    }
    if (opts.limit > 0 && sum.objects >= opts.limit) break;
  }
  return sum;
}

async function regenerate(
  deps: AvatarBackfillDeps,
  row: Row,
  format: ImageFormat,
  quality: Awaited<ReturnType<typeof imageQuality>>,
  opts: AvatarBackfillOptions,
): Promise<{ kind: 'processed' | 'skipped'; rows: number; why?: string }> {
  if (opts.all && !opts.force && row.width !== null) {
    const preview = await deps.storage.head(
      row.s3_bucket,
      variantKey(row.s3_key, AVATAR_VARIANT_PX[0]),
    );
    if (preview) return { kind: 'skipped', rows: 0, why: 'variants exist' };
  }
  const data = await deps.storage.read(row.s3_bucket, row.s3_key);
  const mime = detectMime(data, row.mime);
  if (!mime || !isImageMime(mime)) {
    return { kind: 'skipped', rows: 0, why: 'not an image' };
  }
  const processed = await deps.images.process({
    data,
    mime,
    avatar: true,
    format,
    quality,
  });
  const main = processed.main;
  if (!main) return { kind: 'skipped', rows: 0, why: 'nothing produced' };
  const blurhash = await computeBlurhash(main.data);
  const stored = await putProcessedObjects(
    deps.storage,
    {
      warn: (obj: unknown, msg?: string) =>
        opts.log(`${row.id}: ${msg ?? ''} ${JSON.stringify(obj)}`),
    },
    row,
    processed,
  );
  // Every row pointing at this object (dedup twins) describes the new bytes.
  const { count } = await deps.prisma.file.updateMany({
    where: {
      s3_bucket: row.s3_bucket,
      s3_key: row.s3_key,
      purpose: 'avatar',
      deleted_at: null,
    },
    data: {
      width: processed.width,
      height: processed.height,
      mime: main.mime,
      size_bytes: BigInt(main.data.length),
      sha256: createHash('sha256').update(main.data).digest('hex'),
      avif_twins: stored.avifTwins,
      ...(blurhash ? { blurhash } : {}),
    },
  });
  return { kind: 'processed', rows: count };
}

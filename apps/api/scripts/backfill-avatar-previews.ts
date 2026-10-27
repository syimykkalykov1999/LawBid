// Owner 2026-10-26 («аватарки собеседников иногда не показываются»): every
// list (chats, groups, comments, notifications, pushes) links to an
// avatar's 256 px preview (`<key>_w256`). Avatars written by the demo
// world and the demo seed before this date had no preview, so those links
// were 404s and the lists showed letters. This writes the missing previews
// (a 256 px square cut from the stored picture). Real uploads always got
// theirs from the scan job; they are only checked.
//
//   npm run media:avatar-previews --workspace apps/api            DRY RUN: counts only
//   npm run media:avatar-previews --workspace apps/api -- --apply write the missing previews
//
// Safe to run again: a preview that exists is skipped. Env: DATABASE_URL,
// S3_REGION [, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY].
// Prints counts, never values.
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import {
  AVATAR_VARIANT_PX,
  variantKey,
} from '../src/modules/files/files.policy';

const APPLY = process.argv.includes('--apply');
const PAGE = 500;

async function exists(s3: S3Client, bucket: string, key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw e;
  }
}

async function main(): Promise<void> {
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint,
    forcePathStyle: endpoint !== undefined,
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
  const prisma = new PrismaClient();
  let checked = 0;
  let missing = 0;
  let written = 0;
  let cursor: string | undefined;
  try {
    for (;;) {
      const rows = await prisma.file.findMany({
        where: {
          purpose: 'avatar',
          scan_status: 'clean',
          deleted_at: null,
          width: { not: null },
        },
        select: { id: true, s3_bucket: true, s3_key: true },
        orderBy: { id: 'asc' },
        take: PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;
      for (const f of rows) {
        checked += 1;
        for (const px of AVATAR_VARIANT_PX) {
          const key = variantKey(f.s3_key, px);
          if (await exists(s3, f.s3_bucket, key)) continue;
          missing += 1;
          if (!APPLY) continue;
          const obj = await s3.send(
            new GetObjectCommand({ Bucket: f.s3_bucket, Key: f.s3_key }),
          );
          const bytes = Buffer.from(await obj.Body!.transformToByteArray());
          const preview = await sharp(bytes)
            .rotate()
            .resize(px, px, { fit: 'cover' })
            .jpeg({ quality: 85 })
            .toBuffer();
          await s3.send(
            new PutObjectCommand({
              Bucket: f.s3_bucket,
              Key: key,
              Body: preview,
              ContentType: 'image/jpeg',
              CacheControl: 'public, max-age=31536000, immutable',
            }),
          );
          written += 1;
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(
    JSON.stringify({ apply: APPLY, avatarsChecked: checked, missing, written }),
  );
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'failed');
  process.exitCode = 1;
});

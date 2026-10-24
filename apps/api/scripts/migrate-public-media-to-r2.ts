// Owner 2026-10-24: copies the existing PUBLIC media (avatars, post and
// review photos, stickers) from the AWS media bucket to Cloudflare R2 and
// points the database rows at R2. Private files (the documents bucket)
// are never touched: only purposes whose rule says `media` are selected.
// Design and rollback: docs/architecture/R2_PUBLIC_MEDIA.md.
//
//   npm run media:migrate-r2 --workspace apps/api                 DRY RUN (default): counts only
//   npm run media:migrate-r2 --workspace apps/api -- --apply       copy to R2, then switch the rows
//   ... -- --apply --delete-source   later (after a soak period): delete the AWS copies of
//                                    keys whose rows all point at R2
//   ... -- --rollback                dry run of the way back (R2 -> AWS)
//   ... -- --rollback --apply        copy back what is missing in AWS, point the rows at AWS
//     --limit=N        stop after N keys (try a small batch first)
//
// Safe to stop and run again: a key already copied is skipped, rows are
// switched only after the copy was verified by size, nothing is deleted
// without --delete-source.
//
// Env: DATABASE_URL, S3_REGION, S3_BUCKET_MEDIA [, S3_ACCESS_KEY_ID,
// S3_SECRET_ACCESS_KEY], CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID,
// CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET. Prints counts, never values.
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { FilePurpose, PrismaClient } from '@prisma/client';
import {
  ALL_VARIANT_PX,
  PURPOSE_RULES,
  variantKey,
} from '../src/modules/files/files.policy';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DELETE_SOURCE = args.includes('--delete-source');
const LIMIT = Number(
  args.find((a) => a.startsWith('--limit='))?.slice('--limit='.length) ??
    Number.POSITIVE_INFINITY,
);
const PAGE = 500;

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

/** Purposes stored in the public (media) bucket, from the single source of truth. */
export function publicPurposes(): FilePurpose[] {
  return (Object.keys(PURPOSE_RULES) as FilePurpose[]).filter(
    (p) => PURPOSE_RULES[p].bucket === 'media',
  );
}

interface Side {
  client: S3Client;
  bucket: string;
}

async function head(
  s: Side,
  key: string,
): Promise<{ size: number; type?: string; cache?: string } | null> {
  try {
    const r = await s.client.send(
      new HeadObjectCommand({ Bucket: s.bucket, Key: key }),
    );
    return {
      size: Number(r.ContentLength ?? 0),
      type: r.ContentType,
      cache: r.CacheControl,
    };
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw e;
  }
}

/** Copies one object; true when it exists at the destination afterwards. */
async function copyObject(
  from: Side,
  to: Side,
  key: string,
  mustExist: boolean,
): Promise<boolean> {
  const src = await head(from, key);
  if (!src) {
    if (mustExist) throw new Error(`missing in source: ${key}`);
    return false;
  }
  const have = await head(to, key);
  if (have && have.size === src.size) return true;
  const got = await from.client.send(
    new GetObjectCommand({ Bucket: from.bucket, Key: key }),
  );
  const body = Buffer.from(await got.Body!.transformToByteArray());
  await to.client.send(
    new PutObjectCommand({
      Bucket: to.bucket,
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: src.type,
      CacheControl: src.cache ?? 'public, max-age=31536000, immutable',
    }),
  );
  const after = await head(to, key);
  if (!after || after.size !== src.size) {
    throw new Error(`size check failed after copy: ${key}`);
  }
  return true;
}

async function main(): Promise<void> {
  const awsBucket = need('S3_BUCKET_MEDIA');
  const r2Bucket = need('CLOUDFLARE_R2_BUCKET');
  if (awsBucket === r2Bucket) {
    throw new Error('The R2 bucket must have a different name from AWS media');
  }
  const aws: Side = {
    bucket: awsBucket,
    client: new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    }),
  };
  const r2: Side = {
    bucket: r2Bucket,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${need('CLOUDFLARE_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: need('CLOUDFLARE_R2_ACCESS_KEY_ID'),
        secretAccessKey: need('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
  };
  const [from, to] = ROLLBACK ? [r2, aws] : [aws, r2];
  const prisma = new PrismaClient();
  const purposes = publicPurposes();
  // Belt and braces: no private purpose can be in this list.
  if (purposes.some((p) => PURPOSE_RULES[p].bucket !== 'media')) {
    throw new Error('refusing: a non-media purpose in the list');
  }
  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'} ${ROLLBACK ? 'rollback R2 -> AWS' : 'AWS -> R2'}; purposes: ${purposes.join(', ')}`,
  );

  let cursor: string | undefined;
  let keys = 0;
  let copied = 0;
  let objects = 0;
  let bytes = 0n;
  let switched = 0;
  let sourceDeleted = 0;
  try {
    for (;;) {
      const page = await prisma.file.groupBy({
        by: ['s3_key'],
        where: {
          s3_bucket: from.bucket,
          purpose: { in: purposes },
          scan_status: 'clean',
          deleted_at: null,
          ...(cursor ? { s3_key: { gt: cursor } } : {}),
        },
        _sum: { size_bytes: true },
        orderBy: { s3_key: 'asc' },
        take: PAGE,
      });
      if (page.length === 0) break;
      for (const row of page) {
        if (keys >= LIMIT) break;
        keys++;
        bytes += row._sum.size_bytes ?? 0n;
        if (!APPLY) continue;
        const key = row.s3_key;
        await copyObject(from, to, key, true);
        objects++;
        for (const px of ALL_VARIANT_PX) {
          if (await copyObject(from, to, variantKey(key, px), false)) {
            objects++;
          }
        }
        copied++;
        const res = await prisma.file.updateMany({
          where: { s3_bucket: from.bucket, s3_key: key },
          data: { s3_bucket: to.bucket },
        });
        switched += res.count;
        if (copied % 100 === 0) console.log(`  ... ${copied} keys`);
      }
      cursor = page[page.length - 1].s3_key;
      if (keys >= LIMIT) break;
    }

    if (DELETE_SOURCE && APPLY && !ROLLBACK) {
      // Only keys no row points at in AWS any more are removed from AWS.
      let after: string | undefined;
      for (;;) {
        const page = await prisma.file.groupBy({
          by: ['s3_key'],
          where: {
            s3_bucket: r2.bucket,
            purpose: { in: purposes },
            ...(after ? { s3_key: { gt: after } } : {}),
          },
          orderBy: { s3_key: 'asc' },
          take: PAGE,
        });
        if (page.length === 0) break;
        const stillAws = await prisma.file.findMany({
          where: {
            s3_bucket: aws.bucket,
            s3_key: { in: page.map((p) => p.s3_key) },
          },
          select: { s3_key: true },
        });
        const keep = new Set(stillAws.map((r) => r.s3_key));
        const doomed = page
          .map((p) => p.s3_key)
          .filter((k) => !keep.has(k))
          .flatMap((k) => [
            k,
            ...ALL_VARIANT_PX.map((px) => variantKey(k, px)),
          ]);
        for (let i = 0; i < doomed.length; i += 1000) {
          await aws.client.send(
            new DeleteObjectsCommand({
              Bucket: aws.bucket,
              Delete: {
                Objects: doomed.slice(i, i + 1000).map((Key) => ({ Key })),
                Quiet: true,
              },
            }),
          );
        }
        sourceDeleted += doomed.length;
        after = page[page.length - 1].s3_key;
      }
    } else if (DELETE_SOURCE) {
      console.log(
        '--delete-source needs --apply and is not used with --rollback',
      );
    }
  } finally {
    await prisma.$disconnect();
    aws.client.destroy();
    r2.client.destroy();
  }

  console.log(
    `keys ${keys}, ${(Number(bytes) / 1024 / 1024).toFixed(1)} MB (main files)` +
      (APPLY
        ? `; copied ${copied} keys / ${objects} objects, rows switched ${switched}, source objects deleted ${sourceDeleted}`
        : '; nothing changed (add --apply)'),
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

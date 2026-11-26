import { storeSignatureImage } from './signature-image';
import type { S3StorageService } from './storage/s3-storage.service';
import type { SecretOmittingClient } from '../../prisma/secret-columns';

/**
 * CONTENT_MEDIA_VERIFY 17.11 №7, step 1 backfill: copies the bytes of old
 * case signatures (`image_png`, no `image_key`) to objects in the private
 * documents bucket, a page at a time in id order (resumable: a done row
 * leaves the selection). Same shape as the avatar backfill (R-405): dry run
 * by default, `apply` writes; `clear` (step 2, the release after) empties
 * `image_png` of rows whose object is stored and readable.
 * Every write is guarded (`image_key IS NULL` / the same key), so a rerun or
 * a second runner changes nothing twice.
 */
export interface SignatureBackfillOptions {
  apply: boolean;
  clear: boolean;
  /** 0 = no limit. */
  limit: number;
  batch: number;
  log: (line: string) => void;
}

export interface SignatureBackfillSummary {
  candidates: number;
  stored: number;
  cleared: number;
  failed: number;
}

interface Row {
  id: string;
  request_id: string;
  image_png: Uint8Array | null;
  image_key: string | null;
}

export interface SignatureBackfillDeps {
  prisma: {
    caseSignature: Pick<
      SecretOmittingClient['caseSignature'],
      'findMany' | 'updateMany'
    >;
  };
  storage: Pick<S3StorageService, 'put' | 'head' | 'awsBucket'>;
}

export function parseSignatureBackfillArgs(
  argv: readonly string[],
): Omit<SignatureBackfillOptions, 'log'> {
  const num = (name: string, fallback: number): number => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    const v = hit ? Number(hit.slice(name.length + 3)) : NaN;
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
  };
  const known = /^--(apply|clear|limit=\d+|batch=\d+)$/;
  const bad = argv.filter((a) => !known.test(a));
  if (bad.length) throw new Error(`unknown argument: ${bad.join(' ')}`);
  return {
    apply: argv.includes('--apply'),
    clear: argv.includes('--clear'),
    limit: num('limit', 0),
    batch: Math.max(1, Math.min(num('batch', 100), 1000)),
  };
}

export async function runSignatureBackfill(
  deps: SignatureBackfillDeps,
  opts: SignatureBackfillOptions,
): Promise<SignatureBackfillSummary> {
  const sum: SignatureBackfillSummary = {
    candidates: 0,
    stored: 0,
    cleared: 0,
    failed: 0,
  };
  const where = opts.clear
    ? { image_key: { not: null }, image_png: { not: null } }
    : { image_key: null, image_png: { not: null } };
  const bucket = deps.storage.awsBucket('documents');
  let after: string | null = null;
  for (;;) {
    const rows: Row[] = await deps.prisma.caseSignature.findMany({
      where: after ? { ...where, id: { gt: after } } : where,
      orderBy: { id: 'asc' },
      take: opts.batch,
      select: { id: true, request_id: true, image_png: true, image_key: true },
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      after = r.id;
      if (opts.limit > 0 && sum.candidates >= opts.limit) return sum;
      sum.candidates++;
      if (!opts.apply) continue;
      try {
        if (opts.clear) {
          // Only when the object is really there.
          if (!r.image_key || !(await deps.storage.head(bucket, r.image_key))) {
            sum.failed++;
            opts.log(`skip ${r.id}: object missing, bytes kept`);
            continue;
          }
          const { count } = await deps.prisma.caseSignature.updateMany({
            where: { id: r.id, image_key: r.image_key },
            data: { image_png: null },
          });
          sum.cleared += count;
        } else {
          const key = await storeSignatureImage(
            deps.storage,
            r.request_id,
            Buffer.from(r.image_png!),
          );
          const { count } = await deps.prisma.caseSignature.updateMany({
            where: { id: r.id, image_key: null },
            data: { image_key: key },
          });
          sum.stored += count;
        }
      } catch (e) {
        sum.failed++;
        opts.log(`fail ${r.id}: ${e instanceof Error ? e.message : 'error'}`);
      }
    }
    if (rows.length < opts.batch) break;
  }
  return sum;
}

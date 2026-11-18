import { randomUUID } from 'node:crypto';
import type { S3StorageService } from './storage/s3-storage.service';

/**
 * CONTENT_MEDIA_VERIFY 17.11 №7: the drawn signature picture of a case
 * signature lived in the database (`case_signatures.image_png`, bytea),
 * against the rule «the database keeps keys, the bytes live in storage».
 * It now goes to the private documents bucket (AWS, encrypted, never the
 * public CDN or R2 — the same bucket as the signed PDFs and case files),
 * and the row keeps only `image_key`.
 *
 * Expand → backfill → contract (docs/architecture/ONLINE_DDL.md, N-1 safe):
 *  1. (this release) new rows get the object AND the bytes, readers prefer
 *     the object; `npm run signatures:backfill` copies old rows' bytes to
 *     objects in batches (src/cli/backfill-signature-images.ts).
 *  2. (next release, when no server of release 1's predecessor is left)
 *     writers stop filling `image_png`; the backfill `--clear` empties the
 *     bytes of rows whose object exists.
 *  3. (after 2 is live) a migration drops `image_png`.
 * The object lives as long as its row (case signatures are never deleted:
 * cases are Restrict, signatures cascade only from their request).
 */
export const SIGNATURE_IMAGE_PREFIX = 'case-signatures/';

/** `case-signatures/<request id>/<random>.png` — no user id in the key. */
export function signatureImageKey(requestId: string): string {
  return `${SIGNATURE_IMAGE_PREFIX}${requestId}/${randomUUID()}.png`;
}

/** Stores [png] in the private documents bucket; returns its key. */
export async function storeSignatureImage(
  storage: Pick<S3StorageService, 'put' | 'awsBucket'>,
  requestId: string,
  png: Buffer,
): Promise<string> {
  const key = signatureImageKey(requestId);
  await storage.put(storage.awsBucket('documents'), key, png, 'image/png');
  return key;
}

/** Final pass 18.11 (FO8): removes a stored picture whose signature row was
 * never written (the transaction failed), so no object is left orphaned. */
export async function removeSignatureImage(
  storage: Pick<S3StorageService, 'remove' | 'awsBucket'>,
  key: string,
): Promise<void> {
  await storage.remove(storage.awsBucket('documents'), [key], {
    purgeEdge: false,
  });
}

/** The picture of a signature row: the stored object first, then the old
 * bytes (rows not yet backfilled), else null (a typed signature). */
export async function loadSignatureImage(
  storage: Pick<S3StorageService, 'read' | 'awsBucket'>,
  row: { image_key?: string | null; image_png?: Uint8Array | null },
): Promise<Buffer | null> {
  const bytes = row.image_png ? Buffer.from(row.image_png) : null;
  if (row.image_key) {
    try {
      return await storage.read(storage.awsBucket('documents'), row.image_key);
    } catch (e) {
      // While the old bytes are still kept (steps 1–2) a storage hiccup
      // must not drop the picture from a signed PDF.
      if (bytes) return bytes;
      throw e;
    }
  }
  return bytes;
}

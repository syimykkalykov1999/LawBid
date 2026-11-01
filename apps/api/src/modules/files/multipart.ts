/**
 * Resumable uploads (checklist reconciliation 2026-11-01). Pure rules for
 * cutting a file into S3 multipart parts.
 *
 * S3: every part except the last is at least 5 MiB, at most 10 000 parts. We
 * use 8 MiB parts (small enough to repeat one cheaply on a bad network, big
 * enough that a 1 GiB file is 128 requests) and grow the part for very large
 * files so the count stays under MAX_PARTS.
 */
export const MIB = 1024 * 1024;
export const DEFAULT_PART_BYTES = 8 * MIB;
export const MIN_MULTIPART_BYTES = 16 * MIB;
export const MAX_PARTS = 1000;
/** How long a multipart upload may be continued (the intent is extended). */
export const MULTIPART_TTL_SEC = 24 * 60 * 60;
export const PART_URL_TTL_SEC = 60 * 60;

export interface PartPlan {
  partSizeBytes: number;
  partCount: number;
}

export function planParts(sizeBytes: number): PartPlan {
  let partSizeBytes = DEFAULT_PART_BYTES;
  if (Math.ceil(sizeBytes / partSizeBytes) > MAX_PARTS) {
    partSizeBytes = Math.ceil(sizeBytes / MAX_PARTS / MIB) * MIB;
  }
  return { partSizeBytes, partCount: Math.ceil(sizeBytes / partSizeBytes) };
}

export interface UploadedPart {
  partNumber: number;
  size: number;
  etag: string;
}

/** Part numbers (1-based) the app still has to send. */
export function missingParts(plan: PartPlan, uploaded: UploadedPart[]): number[] {
  const done = new Set(uploaded.map((p) => p.partNumber));
  const out: number[] = [];
  for (let n = 1; n <= plan.partCount; n += 1) if (!done.has(n)) out.push(n);
  return out;
}

/**
 * True when [uploaded] is exactly the plan: every part present, every part
 * but the last one full size, the last one the remainder, total == size.
 * A wrong total never reaches CompleteMultipartUpload.
 */
export function partsComplete(
  plan: PartPlan,
  sizeBytes: number,
  uploaded: UploadedPart[],
): boolean {
  if (uploaded.length !== plan.partCount) return false;
  let total = 0;
  for (let i = 0; i < uploaded.length; i += 1) {
    const p = uploaded[i];
    if (p.partNumber !== i + 1) return false;
    const last = i === plan.partCount - 1;
    const expected = last
      ? sizeBytes - plan.partSizeBytes * (plan.partCount - 1)
      : plan.partSizeBytes;
    if (p.size !== expected) return false;
    total += p.size;
  }
  return total === sizeBytes;
}

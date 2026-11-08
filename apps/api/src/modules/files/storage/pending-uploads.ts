/** Owner 2026-10-05: Redis sorted set of presigned uploads — member
 * `id|bucket|key`, score = when the upload counts as abandoned (ms). The
 * storage cleanup removes objects of uploads never confirmed. */
export const PENDING_UPLOADS_KEY = 'files:pending';

export function pendingUploadMember(
  fileId: string,
  bucket: string,
  key: string,
): string {
  return `${fileId}|${bucket}|${key}`;
}

/** Security audit 2026-11-08 (M3): after confirm the file lives at its own
 * copy (`storedKey`) and the uploaded object is deleted, but the upload's
 * presigned link can write there again until it expires. This member makes
 * the storage cleanup delete that key once more after the link is dead,
 * although a row with this file id exists — no row ever points at an
 * upload key once it was confirmed. */
export const AFTER_CONFIRM = 'after_confirm';

export function leftoverUploadMember(
  fileId: string,
  bucket: string,
  key: string,
): string {
  return `${fileId}|${bucket}|${key}|${AFTER_CONFIRM}`;
}

/** The S3 multipart upload id of a pending (resumable) upload; the sweep
 * aborts it so the stored parts do not linger and cost money. */
export const multipartKey = (fileId: string): string => `files:mpu:${fileId}`;

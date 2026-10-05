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

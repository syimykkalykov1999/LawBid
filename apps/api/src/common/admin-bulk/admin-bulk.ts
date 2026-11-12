import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../errors/error-code.enum';

/**
 * Owner 2026-11-12 («для меня никаких лимитов»): admin bulk endpoints that
 * take an explicit id list. The DTO only holds a technical bound
 * (OWNER_BULK_MAX, so a request stays parseable); the old per-request cap
 * (500 for most lists) now applies to staff only, here in the service. The
 * owner — the super admin, the same check as his phone-change and appeal
 * exemptions — sends any number, and the server works through them in
 * chunks of BULK_CHUNK so no single query or transaction grows with the list.
 */
export const OWNER_BULK_MAX = 100_000;
export const BULK_CHUNK = 500;
/** The usual staff cap per request (some lists keep their own). */
export const STAFF_BULK_MAX = 500;
/** Body size that holds OWNER_BULK_MAX uuids (~39 bytes each in JSON). */
export const ADMIN_BULK_BODY_LIMIT = '5mb';

export function isOwnerAdmin(admin: { adminRole?: string } | null): boolean {
  return admin?.adminRole === 'super_admin';
}

/** Staff keep [staffMax] per request; the owner has no cap. Same error as
 * the old DTO limit (400 VALIDATION_ERROR on the field). */
export function assertStaffBulkCap(
  admin: { adminRole?: string } | null,
  ids: readonly unknown[],
  staffMax: number,
  field = 'ids',
): void {
  if (isOwnerAdmin(admin) || ids.length <= staffMax) return;
  throw new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: `At most ${staffMax} at once.`,
    details: { field, max: staffMax },
  });
}

/** Same as ops/purge-test-data.plan `chunks`. */
export function chunks<T>(items: readonly T[], size = BULK_CHUNK): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
